# 技能系统移植报告（kagami → systems/，Role1 悟空子集 + MP）

对应任务书：`tasks/skill-tree-port-brief.md`。commit：`62ac6ae`。

## 搬了什么

新增文件（只加不改，未触碰 `scenes/`、`ui/`、`net/`、`combo.ts`、`heroSim.ts`）：

- `game/src/systems/mp.ts` — MP 资源模型（上限/花费/回复/被动回蓝钩子）。
- `game/src/systems/heroSkill.ts` — Role1（悟空）九主动 + sx 被动的完整数值/释放/冷却/伤害盒逻辑。
- `game/tests/mp.test.ts`（7 例）、`game/tests/heroSkill.test.ts`（28 例）。

移植源：`vendor/kagami-phaser/src/systems/`
- `Role1BasicSkillSystem.ts`（slz/lys/hytj/lyfb/jdy）
- `Role1ShadowSkillSystem.ts`（qsez/zz）
- `Role1FinisherSkillSystem.ts`（hmz/hyjj）
- `Role1SkillProjectileFactory.ts`（lyfb 双段弹体）
- `SkillTuning.ts` / `SkillMathUtils.ts`（共享 MP 表、伤害曲线常量）
- `ProgressionSystem.ts:124-134`（Role1 maxMp 按等级公式）

技能覆盖（`docs/reverse-engineering/skills-input-index.md` §"Role1 正式释放与重入边界" 确认为"九主动 + 一被动"，与代码结论一致）：

| 技能 | 分类 | 状态 |
| --- | --- | --- |
| slz / lys / hytj / lyfb / jdy | 基本技能 | 已搬 |
| qsez / zz | 分身技能（含分身生成/消耗） | 已搬 |
| hmz / hyjj | 终结技（含终结目标选取） | 已搬 |
| sx | 被动（吸血/暴击加成） | 已搬（非 `tryCastRole1Skill` 入口，独立 `calculateRole1LifeSteal`） |

## 数值出处表

所有常量/公式逐字搬自 kagami，行号对应本仓库 `vendor/kagami-phaser/src/systems/` 当前版本；出处也写在 `heroSkill.ts` 对应函数/常量的注释里。

| 数值/公式 | 出处文件:行 | 备注 |
| --- | --- | --- |
| `SkillMpByLevel`（18级MP表） | `SkillTuning.ts:1-4` | 逐字 |
| `SkillFixedDamageCount` | `SkillTuning.ts:6-9` | 逐字 |
| `SkillFactorBase` / `SkillFactorPerLevel` | `SkillTuning.ts:11-12` | 逐字 |
| `Role1DamageFinalMultiplier = 1.27` | `SkillTuning.ts:14` | 逐字 |
| `hmzLianZhan[18]` / `hmzZaDi[18]` 固定伤害表 | `Role1BasicSkillSystem.ts:20-27`（同表在 `Role1FinisherSkillSystem.ts:19-33`、`Role1ShadowSkillSystem.ts:19-29` 重复出现，三处数值一致，本次合并为一份） | 逐字，已核对三处一致 |
| slz/lys/hytj/lyfb/jdy 伤害系数（0.6/1, 0.5/1, 0.65/4, 0.7/12, 0.8/13） | `Role1BasicSkillSystem.ts:297-315` | 逐字 |
| slz/lys/hytj/lyfb/jdy MP 系数（.55/.45/.6/.65/1） | `Role1BasicSkillSystem.ts:46-50` | 逐字 |
| slz/lys/hytj/lyfb/jdy 动作时长（650/360/360/480/520ms） | `Role1BasicSkillSystem.ts:51-55` | 逐字，本移植当作"冷却"用（见下） |
| `lysGateMs = 36` | `Role1BasicSkillSystem.ts:56` | 逐字，已导出但未接入门禁逻辑（见遗留问题） |
| hmz 连斩/砸地伤害公式 | `Role1FinisherSkillSystem.ts:183-197` | 逐字，含 `hmzLianZhanFactorBase/PerLevel`、`hmzZaDiFactorBase/PerLevel` |
| hyjj 伤害公式 | `Role1FinisherSkillSystem.ts:199-206` | 逐字 |
| hmz/hyjj MP 系数（1.0/1.1）、动作时长（1640/680ms）、`hyjjExplosionIntervalMs=1200`、`hyjjExplosionCount=4` | `Role1FinisherSkillSystem.ts:55-63` | 逐字 |
| qsez/zz 伤害公式（0.25/1, 0.84/1） | `Role1ShadowSkillSystem.ts:159-170` | 逐字 |
| `shadowZzDamageMultiplier = 0.437` | `Role1ShadowSkillSystem.ts:66` | 逐字 |
| qsez/zz MP 系数（.6/.75）、动作时长（1250/620ms） | `Role1ShadowSkillSystem.ts:56-59` | 逐字 |
| `qsezHitRangeX/Y`、`shadowLifetimeMs`、`shadowSpawnSpreadX` | `Role1ShadowSkillSystem.ts:61-65` | 逐字 |
| `getRole1QsezShadowCount`（`(isBoss?4:1)+(random()<=0.5?1:0)`） | `Role1ShadowSkillSystem.ts:291-293` | 逐字 |
| sx 吸血/暴击公式 | `Role1BasicSkillSystem.ts:264-269` | 逐字 |
| Role1 `maxMp = 50 + 20*(level-1)` | `ProgressionSystem.ts:130-131` | 逐字（`getHeroBaseStats` 的 `case 1`） |
| 各技能弹体尺寸/偏移/击退/`hitIntervalFrames`/`maxHits` | 见 `heroSkill.ts` 每个 `hitbox(...)` 调用旁的行内注释，逐一标了源文件行号 | 逐字，动画/素材相关字段（`assetKey`/`sourceSymbol`/`runtimeName`）未搬，因为纯逻辑层不需要 |

**TODO-verify（kagami 里也没有，本次自定的值）**：
- `mp.ts` 的 `tickMpRegen()`：kagami 的 `EquipmentSystem.ts` 定义了 `mpRegen` 装备属性（行 28/134/748/852），但翻遍 `vendor/kagami-phaser/src/systems/*.ts` 没有任何地方真的在每帧读取它——是个只显示不生效的属性。`tickMpRegen(model, regenPerSecond, deltaMs)` 是本次新加的通用回蓝 tick，`regenPerSecond` 留给调用方注入（比如未来装备系统读出 `mpRegen` 传进来），回蓝速率本身不是复原值。

## 验证方式

`calculateRole1*Damage`/`getRole1SkillMpCost` 的正确性没有只靠"抄了就信"，而是另起一份不依赖本模块、直接从 kagami 源码文本重新誊写的独立 node 脚本，对 slz/lys/hytj/lyfb/jdy/hmz(连斩+砸地)/hyjj/qsez/zz 在 level=1/9/18、power=100 下逐一算出参考值，再让 `heroSkill.test.ts` 断言与这些参考值一致（而不是断言"等于我自己模块内部再算一遍"）。跑测过程中揪出并修了一个真实 bug：`tryCastRole1Skill` 最初漏了在 `jdy` 首段释放后设置 `runtime.jdyStage`，导致二段技能永远触发不了——已修复并有专门回归用例覆盖。

`cd game && npx vitest run`：21 个文件、182 例全绿（含另外两个并行 agent 新增的 `furnace.test.ts`/`heroIdentity.test.ts`，均未受影响）。`npx tsc --noEmit` 干净。

## 接线接口清单（给集成棒 / 未来 BattleScene）

冷却模型说明：kagami 本身没有"每个技能独立冷却"，而是一把共享忙锁（`role1Runtime.actionRemainingMs`），九个主动技能全部检查它、且施放后全部重新武装它（见 `heroSkill.ts` 文件头引用的具体行号）。本移植原样保留这个共享形状，做成 `Role1SkillRuntime.cooldownMs` 单字段，而不是 9 个独立冷却——这不是简化导致的失真，是 kagami 真实行为。

- `mp.ts`
  - `createMp(maxMp)` / `resetMp(model, maxMp?)` / `getRole1MaxMp(level)`：MP 资源生命周期，`getRole1MaxMp` 只吃裸 `level` 数字，不依赖尚在建的 `HeroIdentityState`。
  - `spendMp`/`restoreMp`/`hasEnoughMp`/`setMaxMp`/`tickMpRegen`：`MpModel` 是 `{ mp, maxMp }` 的极简结构，`heroSkill.ts` 用同形状的 `SkillMpPool` 接口消费它（结构类型兼容，未强耦合 import）。

- `heroSkill.ts`
  - `createRole1SkillRuntime()`：初始化运行时状态（等级全 0、冷却 0、无分身）。
  - `syncRole1SkillLevels(runtime, learned: Partial<Role1SkillLevels>)`：从存档/技能树读到等级后调用一次；等级来源目前是**参数注入**，等 `HeroIdentityState` 落地后由集成棒在那边读出等级传进来即可，本模块不用改。
  - `tickRole1SkillRuntime(runtime, deltaMs)`：每帧调用一次，推进冷却、分身寿命、jdy 二段窗口。
  - `tryCastRole1Skill(runtime, mp: SkillMpPool, skillId, ctx: Role1CastContext) => Role1CastResult`：唯一释放入口。
    - `ctx` 需要调用方提供 `sourcePower`（等价 kagami 的攻击力属性）、`x`/`y`/`facingX`（qsez 距离判定、hyjj/zz 朝向判定用）、可选 `targets`（qsez/hyjj 用，`{id,x,y,isAlive,isBoss?}[]`）、可选 `random`（qsez 分身数量用，默认 `Math.random`）。
    - 返回 `{ ok:false, reason }`（`'not-learned'|'cooldown'|'mp'|'no-target'`）或 `{ ok:true, mpBefore, mpAfter, mpCost, hitboxes, reentered }`。
    - `hitboxes: SkillHitbox[]` 是纯描述对象（偏移/尺寸/生命周期/伤害/击退/`hitIntervalFrames`/`maxHits`/`activeAfterMs`/`visualOnly`/`actionName`），**不创建任何 Phaser 对象**——BattleScene 接线时按 `actionName`（如 `'hit6'`）选动画、按其余字段生成实际的 hitbox/projectile。
    - `hmz`/`hyjj` 的多段爆破用 `activeAfterMs` 表达"这一段在施放后多少毫秒才生效"，接线方需要自己做延迟调度，本模块只给时间戳不跑定时器。
  - `calculateRole1LifeSteal({ runtime, actualDamage, attackKind, isDead })`：sx 被动吸血，纯函数，不摸 `HeroCombatModel`；接线方在自己的伤害结算之后调用，拿到 heal 数值自己 `hp = min(maxHp, hp+heal)`。
  - 所有类型（`Role1SkillId`、`Role1SkillLevels`、`Role1CastContext`、`Role1Target`、`SkillHitbox`、`Role1CastResult`）均已导出。

## 已知裁剪 / 未接入项（供后续任务参考）

- **移动/位移完全没搬**：kagami 的 hytj/lys/jdy 会推 `HeroMovementModel` 的速度做突进/腾空（`Role1BasicSkillTuning.lysHorizontalSpeed` 等），本移植故意不碰，因为没有可用的移动系统依赖点。BattleScene 接线时需要自己从 `Role1BasicSkillSystem.ts:57-61` 补回这些速度值。
- **`lysGateMs`（连续释放 lys 的 36ms 冷却门）已导出常量，但 `tryCastRole1Skill` 没有接入这道门禁**——因为它需要调用方传入"上次释放 lys 的时间戳"，而当前 `Role1CastContext` 没有全局时钟概念（deltaMs 驱动而非时间戳驱动）。集成时若要复原，需要在 `Role1SkillRuntime` 上加一个 `lastLysCastAtMs` 字段并由调用方传当前时间戳进来。
- **`hyjj` 必须站在地面才能放**（kagami: `!movement.grounded` 拒绝）：本模块没有地面状态概念，这道门禁留给 BattleScene 在调用 `tryCastRole1Skill('hyjj', ...)` 前自己判断。
- **hmz 的三段蓄力**：kagami 自己的逆向文档（`roles-index.md:227`）都说反编译证据不足以认定为可用机制，本移植未实现，遵循 kagami 的保守结论。

## SkillUISystem（技能树 UI）后续移植提示

`SkillUISystem.ts` 本棒明确不做，仅供后续参考：
- `AllSkillName` union（`SkillUISystem.ts:7-11`）里 Role1 相关的 10 个技能名与本次 `Role1SkillId`（9 主动）+ `sx`（被动，独立处理）完全对应，命名可以直接复用。
- `HERO_SKILL_TREES[1]`（`SkillUISystem.ts:29-33`）定义了悟空的两棵心法树分组（斩系：slz/zz/sx/qsez/hmz；火系：lys/hytj/lyfb/jdy/hyjj），技能树 UI 移植时这个分组表可以直接抄。
- `SkillTreeConfig`/`HeroSkillLearningState`/`SKILL_LEARN_LIMIT`/`TREE_UPGRADE_COSTS` 等经济系统结构（学习消耗、树等级上限）在 `SkillUISystem.ts` 里是独立于 `HeroSkillSystem.ts` 的一层，不依赖任何 Phaser 类型，可以照搬；但它的等级来源需要接上 `syncRole1SkillLevels` 的 `learned` 参数，串联时把 UI 侧算出的最终等级传进来即可。
- 该文件本身没有 Phaser 依赖，属于"纯逻辑，只是不在本次任务范围"的类别，移植时同样应遵循"移植 > 重写"。

## 遗留问题

- `lysGateMs` 门禁未接入（见上）。
- 移动系统的位移值未搬（见上），需要移动系统落地后单独补一个小任务。
- 尚未接入 `HeroIdentityState`（等待另一 agent），当前用参数注入占位；集成棒接线时把 `learned` 和 `sourcePower`/`x`/`y`/`facingX` 从真实状态里读出来传给这两个模块即可，`mp.ts`/`heroSkill.ts` 本身不需要再改。

## 技能/MP 场景接线 — 已完成（2026-07-07 集成会话）

`mp.ts` + `heroSkill.ts` 已接进 `BattleScene.ts`（只动 BattleScene，未碰这两个模块）。

**接线**：
- **MP**：`createMp(getRole1MaxMp(level))` 在 `seedFromSave` 建；`update` 每帧 `syncMpMax()` 让
  `maxMp` 跟随 hero 等级（升级涨蓝），`tickMpRegen(2/s)` 缓回（TODO-verify，mp.ts 头注说 kagami 无固定
  回蓝率）。HUD 加蓝色 MP 条 + `MP x/y` 文本（现有调试 HUD 风格，真组件另棒换）。
- **技能键**：数字键 1-9 → 九主动（RE 文档没留原版键位，数字键避开 A/D/J/K/W/E/U）。`castSkill` 组
  `Role1CastContext`（`sourcePower=heroTotalAtk`、hero x/y/facing、怪作为 target）调 `tryCastRole1Skill`，
  返回 `hitboxes` 逐个按 `activeAfterMs` 延时、按 offset/尺寸判定与怪 overlap，命中则把（缩放后）伤害推进
  与连击共用的 incoming-hit 通道（monsterSim 照常 dedup/hurt/death），并飘蓝色伤害数字。
- **动画**：技能→role1.json 动作（hit6/hit9/hit7/hit8/hit11_1/hit13/hit14/hit10/hit12；hitbox 里的
  `hit8_2`/`hit10_2` 等子变体不是独立 hero 动作，故用一张 `SKILL_ACTION` 映射到存在的动作）；`skillAnim`
  在 busy-lock 时长内压住 heroSim 的动作。
- **busy-lock ↔ 连击互斥**：`collectEdges` 在 `skillRuntime.cooldownMs > 0` 时返回 NO_EDGES（施法中禁移动/
  普攻）；`castSkill` 在 `combo.stage !== 0` 时不施法。`tickRole1SkillRuntime` 每帧推进冷却/分身/jdy 二段窗。
- **lysGateMs / hyjj 地面门控** 遗留项：本接线用共享 busy-lock 已覆盖连发节流；hyjj 无空中态概念（heroSim
  的 grounded 未接到技能门控），当前 demo 恒地面，标记为后续（移动系统落地时补 lysGateMs 时间戳 + grounded 门）。

**伤害口径**：`SKILL_DAMAGE_SCALE = 0.06` 集中缩放（TODO-verify，就地注释出处）。原因见根 CLAUDE.md
§移植协议「hero-scale 教训」：kagami 技能公式与原版 AS3 差约 6.6x、普攻是占位值——skill 伤害本就是二手
口径，故先按表接入 + 临时缩放到当前 150hp 怪的量级，等 hero-scale 棒统一换算后删掉这个常量。

**验收判据逐条**：
1. `npx vitest run` 全绿：✅ 279 passed（含 mp/heroSkill 的 35 例，未改动）；BattleScene 过 `tsc`
   （仓库唯一 tsc 报错在他人在建文件 `ui/hud/RoleInfoHud.ts`，非本棒）。
2. 浏览器真机（vite dev + 壳流转 + `__castSkill/__skillState`），一次 evaluate 内连放三招的原子实测：
   - slz → 动作 `hit6`、MP 110→74（-36）、怪 150→126（-24）、cooldownMs 650 置位；紧接第二招被
     busy-lock 拒（MP 74→74 不变）。
   - lys → `hit9`、MP 76→47、怪 126→106。
   - hytj → `hit7`、MP 48→9、怪 106→102。
   - MP 不足：MP 11 放 jdy(66) → 拒（MP 11→11 不变）；另设 slz 到 18 级（cost ~1466）放招 → 满蓝 230
     也拒（MP 230→230 不变），弹「法力不足」。
   - 截图落 `game/tmp/debug-shots/`：`14-skill-cast.png` / `15-skill-mp-insufficient.png` 显示 MP 条 +
     `MP x/230` HUD 与战斗画面。
   - **注**：招式姿势/飘字/toast 的「定格」帧未能稳定截到——playwright 截图往返（数秒）远长于动作/飘字/
     toast 生命周期，且验收期这个共享浏览器 tab 有其他并行 agent 同时驱动 `__scene`（观察到 MP 值与 hero
     位置在我两次调用之间被外部改动、相机被拉回 NPC）。机制正确性由每次 evaluate 的**原子返回值**证明
     （上列数字），非依赖截图定格。
3. 本节即报告追加。

**遗留（接线棒）**：
- 技能等级现为固定 demo loadout（全 1 级，`SKILL_DEMO_LEVELS`），真等级应来自技能树 UI（未做，见本报告
  「SkillUISystem 后续移植提示」）——接口是 `syncRole1SkillLevels(runtime, learned)`，接上即可，本接线不用改。
- 多段命中（`hitIntervalFrames`/`maxHits`）简化为每个 hitbox 单次结算，够证明"技能造成伤害"；完整多段 tick
  留后续。lyfb 的第二弹体/qsez 分身/hyjj 链式多目标已按 hitboxes 生成，但同样单次结算。
- `SKILL_DAMAGE_SCALE`、`MP_REGEN_PER_SEC`、demo 技能等级、`__castSkill/__skillState/__setSkillLevels`
  调试钩子均为临时/验收用，hero-scale 与技能树落地后收敛。
