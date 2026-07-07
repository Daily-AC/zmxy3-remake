# 承伤调平报告：养成替代层 + 魔防曲线

对应任务书：`tasks/hero-survivability-brief.md`。核算前置：`tasks/hero-scale-report.md`。

> **两轮续单已并入本报告**（team-lead 2026-07-07）：**续单一**把装备 hp/mp 词条真接进血池（不再靠 scale 吸收），maxHp scale 随之 3.5→3.0；**续单二**反编译原版每怪真实 exp 落进数据层并复算通关轨迹。详见文末「续单一」「续单二」两节，它们**取代**下文 §1 里对 exp 经济的 flat-80 假设和 §2 里的 ×3.5 系数。

新增文件：`game/src/systems/heroSurvivability.ts`、`game/src/data/monsterExp.ts`、`game/tests/heroSurvivability.test.ts`、`game/tests/monsterExp.test.ts`。
改动文件：`game/src/systems/heroIdentity.ts`（聚合处套放大系数 + 装备 hp/mp 接进血池 + 暴露魔防访问器）、`game/tests/heroIdentity.test.ts`。
**未动**：`progression.ts` 原版曲线数字、`heroScale.ts`、`furnace.ts`、`scenes/**`、`ui/**`、`net/`、`agent-server/`。

## 一句话结论

裸曲线太薄的根因是缺了原版的装备/宝石养成层。本棒把它补成一个**显式、单点、可回退**的放大层（`heroSurvivability.ts`）：
maxHp ×3.0、base def ×2、装备 hp/mp 真接进血池，外加一条全新的英雄魔防成长曲线（L10=10% → L30=35%，封顶 50%）。
系数从判据带反推。参考 boss（二郎神 1299 魔法核击）在到关等级 + 中等炼装下掉 **39.7% 有效血**，普攻掉 **6.8%**，正落判据带。判据带写死进了测试，改曲线跑偏会红。exp 经济经续单二反编译后落进 `monsterExp.ts`（每怪真值原样），`CAMPAIGN_EXP_MULTIPLIER = 6`（team-lead 2026-07-07 拍板，补偿关卡结构性压缩，非改真值），自然通关轨迹到关 L3≈lv16 / L4≈lv20，进 lv15±1/lv21±2 容差带。

## 1. 到关等级：假设与推导

英雄没有独立的怪物 exp 字段——唯一的 exp 来源是 `BattleScene.ts` 的 `MONSTER_KILL_EXP = 80`（每杀一只固定 80，跟怪物种类/等级无关，是占位实现）。到关等级由**两个约束取大**：

**约束 A — exp 经济地板（自然单次通关到达的等级）**：用 `progression.ts` 的 exp 曲线 + 每杀 80 exp + 各关波次怪物数量算。波次怪数（含 boss 前所有小怪，boss 单列）：L1=13、L2=11、L3=11、L4=3。累计到各关 boss 前的击杀数 ×80，套 exp 曲线得等级：**L2 boss lv8、L3 boss lv9、L4 boss lv10**。

**约束 B — 可赢门槛（既打得动又扛得住 boss 的最低等级）**：
- 打得动：中等炼装（+100 atk）下击杀时间 ≤ 90s（原版式长 boss 战，不磨）。
- 扛得住：boss 最痛一击 ≤ 40% 有效血（否则两三下被打死，玩家会继续练）。
- 两条同时满足的最低等级：**L2 ≈ lv2、L3 lv15、L4 lv21**。

**到关等级 = max(A, B)**：

| 关卡 boss | exp 地板 | 可赢门槛 | 到关等级（取大） |
| --- | --- | --- | --- |
| L2 多闻天王 | 8 | 2 | **8** |
| L3 二郎神 | 9 | 15 | **15** |
| L4 邪.悟空 | 10 | 21 | **21** |

**关键发现（落盘留给经济棒）**：exp 经济地板（8/9/10）远低于可赢门槛（尤其 L4 需 lv21 vs 地板 lv10）。这意味着当前 exp 经济（每杀固定 80 + 陡峭曲线：lv19→20 就要 5000 exp = 62 只怪）**根本练不到能打赢 L4 的等级**——玩家必须刷级，约补 11 级。这不是本棒能改的（`MONSTER_KILL_EXP` 在 BattleScene，且是占位值），只如实报告：**exp 产出需要随怪物种类/关卡分级，否则"自然通关"到不了可赢等级**。到关等级取"可赢门槛"这一支，正是因为玩家在能赢之前一定会停在那里练级——这是真实停留点，也让判据带自洽（玩家刚好练到 boss 核击降到 ~40% 就开打）。

## 2. 最终系数与曲线

全部集中在 `heroSurvivability.ts`，偏差点单一、可回退（赛后宝石系统落地把两个 scale 退回 1，整层消失，`progression.ts` 原曲线在下面原封不动）：

- `SURVIVABILITY_MAXHP_SCALE = 3.0`——有效 maxHp = 等级曲线 maxHp × 3.0 **＋ 装备 hp 词条**（续单一后装备 hp 真接进血池，scale 只替代宝石层，不再吸收装备 hp，故从 3.5 降到 3.0）。
- `SURVIVABILITY_DEF_SCALE = 2.0`——有效 base def = 等级曲线 def × 2，**在装备 def 之前**（炼装 def 仍然叠加、不放大——那是真实炼装，不是替代层）。
- 魔防曲线 `heroMagicDefFraction(level)` = `clamp(0.10 + (level−10)×0.0125, 0, 0.50)`，返回 0~1 分数：
  - L10 = 10%、L30 = 35%、L42 起封顶 50%、L1（锚点以下）= 0。
  - 全新英雄属性。原版 `base.BaseHero.countHurt()` 本就有 `power×(1−magicDef/100)` 魔法通道（见 heroScale.ts 头注），但本项目从没给悟空魔防值，`resolveIncomingHeroDamage` 一直传 0。游戏里最致命的两下（二郎神 hit2 1299、邪·悟空 hit9 1000）都是魔法——给悟空魔防成长，恢复的是原生的"魔法要躲/物理能扛"战术分层，比堆平血更保真。

生效点（`heroIdentity.ts` 聚合处，带 Adapted 注释）：`createHeroIdentity`（seed maxHp）、`gainHeroExp`（升级长血按放大后的差值治疗）、`heroStats`（def 在叠装备前放大）。新增 `heroMagicDef(id)` 供接线层取魔防分数。

## 3. 复算核算表（到关等级 + 中等炼装）

中等炼装 = furnace 词条上限的一半。`ENGINE_MAX` 现值 atk/def=200、hp=800，一半即 atk+100/def+100/hp+400。续单一后 **def+100 和 hp+400 都真实生效**（def 走 `heroTotalDef`，hp 走 `syncHeroEquipment` 接进 `combat.maxHp`），有效血 = 等级曲线×3.0 + 装备 hp。atk+100 只影响击杀时间不影响承伤。到关等级 L4 因 winnable 重算从 lv21 微调到 lv22。

| 关卡 boss（到关等级） | 有效血 | 有效 def | 魔防 | 最痛一击（减伤后） | 占比 | 普攻（减伤后） | 占比 | 击杀时间 | 扛几发核击 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L2 多闻天王 (lv8) | 1690 | 132 | 7.5% | 120魔 → 111 | **6.6%** | 186物 → 54 | 3.2% | 25s | 15 |
| L3 二郎神 (lv15) | 2740 | 160 | 16.3% | 1299魔 → 1088 | **39.7%** | 345物 → 185 | 6.8% | 63s | 2 |
| L4 邪.悟空 (lv22) | 3790 | 188 | 25.0% | 1658物 → 1470 | **38.8%** | 829物 → 641 | 16.9% | 78s | 2 |

判据带：最痛一击 25~40%、普攻 5~10%。

- **L3 二郎神（参考 boss）**：最痛 39.7%、普攻 6.8%——**双双落带**。整层就是围绕它调的。
- **L4 邪.悟空**：最痛 38.8% 落带；普攻 16.9% **偏高出带**。原因是 829 物理普攻 raw 太大，realistic def（furnace 上限 200）压不到 10% 以下——除非 def×6+ 荒谬。对终 boss 而言"普攻也很疼"合理，接受并写死断言。
- **L2 多闻天王**：最痛 6.6%、普攻 3.2%——**双双低于带**。多闻天王本就是弱爆发早关 boss（最大攻击才 120 魔/186 物），在 lv8 放大血面前掉不到 25%。它的威胁是**消耗战**（16000 血打 25s，期间挨一堆小刀）不是爆发，符合原版设定。接受并写死断言。

**单一全局系数放不平非单调的原版 boss 伤害曲线**（L2 弱、L3 突刺、L4 全重），强行三关同时进带需要荒谬的 def/血。所以 L3 带是承重断言；L2/L4 的结构性偏差按精确值写死，改曲线仍会跑红。

对比放大前（`hero-scale-report.md` 表）：L3/L4 核击原本 0~1 击必杀，现在都能**扛 2 发**——这才让二郎神 30s 禁疗（heal-block）第一次有战术意义（见 §5）。

## 4. BattleScene 接线状态

`tasks/ui-finish-report.md` **不存在** = ui-finish 棒未交笔，BattleScene 单支笔不在我手里，故**不动 `scenes/`**，接线以精确 patch 留笔。

**好消息：maxHp ×3.0 和 def ×2 已经自动生效**——它们走 `createHeroIdentity`/`gainHeroExp`/`heroTotalDef`，全部路由过我独占的 `heroIdentity.ts`，BattleScene 消费即得，无需改 BattleScene。

**待接线（三处，均 patch 留笔）：① 魔防分数（本节）、② 装备 hp/mp 接血池（续单一）、③ 每怪真实 exp（续单二）。**

**① 魔防分数**。`BattleScene.ts` 的 `monsterHitsHero`（约 1418~1432 行）已经在调 `resolveIncomingHeroDamage`，`attackKind` 也已按 `e.attackKind` 动态传（物理/魔法正确），**只有魔防分数硬编码成 `0`**（第 1429 行）。精确到行的 patch（两处）：

1. import（约第 41~42 行 `heroTotalDef,` 附近，从 `./systems/heroIdentity` 加一个具名导入）：
   ```ts
   heroMagicDef,
   ```
2. 第 1429 行：
   ```ts
   // 改前
             0,
   // 改后
             heroMagicDef(this.identity),
   ```

**接线前后差异**：未接线时魔法伤害不减免——L3 二郎神核击 1299/2740 = **47.4%（略出带）**；接线后 39.7%（落带）。测试断言的是接线后的目标态（用 `heroSurvivability.ts` 的真实函数直接算，不依赖 BattleScene），所以 vitest 绿不代表魔防已在游戏里生效——**必须应用上面的 patch，L3 才真正落带**。持笔人接线后建议真机验证：lv15 悟空打二郎神，核击掉血应约 4 成而非近半。

## 5. 二郎神 heal-block 复核（作业4）

拾取球（小红）固定回 +100，门控逻辑在 BattleScene（`applyPickupHeal`，未动）。放大后有效血 2740，+100 = 一球回 3.6%，与原版"回血占比很小"口径一致（任务书拍板保持不动）。

语义在新口径下从"无意义"变成"有意义"：放大前英雄一发核击就死，根本活不到需要靠回血续命、也活不过 30s 禁疗窗；放大后能扛 2 发核击 + 63s 战斗里可在非禁疗段捡球回血，于是"二郎神放大招期间的 30s 禁疗"第一次成为真需要战术应对的机制（禁疗窗内必须避免吃核击）。**拾取球门控逻辑本身语义不变**（仍是固定 +100、同样门控），只是比例上变得有意义了。无需改拾取代码。

## 6. 验证

- `npx tsc --noEmit`：干净（仓库无报错；上一棒提到的 `RoleInfoHud.ts` 报错已被他人修掉）。
- `npx vitest run`：**35 文件 401 例全绿**（基线 387 + 本棒 8 band 断言 + 续单一 2 装备 hp 断言 + 续单二 4 exp/轨迹断言）。`heroSurvivability.test.ts` 用 `heroScale.ts` 真实减伤函数 + `progression` 真实曲线算判据带，不自算自证；`heroIdentity.test.ts` 走真实 `createHeroIdentity`/`gainHeroExp`/`syncHeroEquipment`/`heroStats` 代码路径断言放大后的血/防 + 装备 hp 真接进池。
- 判据带写死进测试：L3 最痛∈[25%,40%]、普攻∈[5%,10%]（承重）；L4 最痛∈[25%,40%]、普攻 pin≈16.9%；L2 最痛 pin≈6.6%、普攻 pin≈3.2%；魔防锚点/封顶/地板/单调性全断言。scale 常量在锚点等级 pin 死（maxHp 2340/def 60 等）。
- **tsc 注记**：仓库当前有 2 处报错在 `BattleScene.ts:317/319`（`resultBanner`/`bannerTimer` 声明未用），是 ui-finish 棒在途改动，**非本棒文件**；我的四个文件 tsc 干净。
- **未做浏览器真机验收**：`:5173` 上跑的 dev server 是另一个无关项目（标题「苏妲」），不是 zmxy3-remake，我没有对错误应用做验收。数值验收以 vitest（走真实代码路径）为准；最终手感 A/B 按任务书由用户手玩定夺。

## 7. 疑点 / 留给后续

1. ~~**exp 经济到不了可赢等级**~~ → **续单二已反编译真实 exp 落数据**，但真值仍到不了到关等级（自然通关 lv3/8/11 vs 目标 lv15/21），最小调整方案（≈6× multiplier）待拍板。详见续单二。
2. ~~**装备 hp 未接进 `combat.maxHp`**~~ → **续单一已真修**：新增 `syncHeroEquipment` 把装备 hp/mp 词条接进血池，scale 从 3.5 下调到 3.0。BattleScene 侧 sync 调用 patch 见续单一。
3. **L2/L4 结构性出带**（§3）：单一全局系数放不平非单调 boss 伤害。若要三关都严格进带，需 per-boss 或 per-关 的血/防微调，或重审原版 boss 单发攻击力口径——超出"单点可回退替代层"的范围，未做。
4. **只覆盖 Role1（悟空）**：`heroSurvivability` 的 scale/魔防对全 heroId 通用（Role2~5 也会被放大），但判据只针对悟空核算——本项目目前只有悟空可玩，Role2~5 上线时需重核。
5. **MP 双轨**：游戏内 MP 走 BattleScene 的 `this.mp`（`getRole1MaxMp`），`identity.maxMp` 是并行的 vestigial 字段。续单一把装备 mp 接进了 `identity.maxMp`（自洽记账），但游戏内 MP 池要生效需 patch `this.mp` sizing（续单一给了 patch），或后续把 MP 统一路由过 identity。

---

# 续单一：装备 hp/mp 词条真接进血池（真修，不吸收）

**背景**：炼丹炉能炼出带 hp 词条的装备，但 `heroStats().hp`（装备 hp 之和）从没用于 `combat.maxHp`——玩家炼了 hp 装等于白炼，直接废掉"炼装做养成增量"这条拍板路线。原报告用 ×3.5 scale 吸收了这块，team-lead 判定这是真 bug，要真修：把装备 hp/mp 接进有效 maxHp/maxMp，scale 相应下调，判据带靠"带不动系数动"保持绿。

**systems 侧改动（已做，`heroIdentity.ts`）**：

1. `HeroIdentityState` 新增缓存字段 `equipMaxHpBonus`、`equipMaxMpBonus`——把当前装备的 hp/mp 贡献缓存在 identity 上，这样升级（`gainHeroExp`）能保住装备加成而不必传 equipment 进来。
2. 新增 `syncHeroEquipment(id, eq)`：重算装备 hp/mp 贡献，`combat.maxHp = 等级曲线×3.0 + 装备hp`，正 delta 顶血（像换装回血）、负 delta 夹回；`maxMp` 同理。**在 seed 装备后、每次 equip/unequip 后调**。
3. `createHeroIdentity` 签名不变（装备加成初始 0，seed 后靠 sync 补），`gainHeroExp` 签名不变（内部用缓存的 `equipMaxHpBonus`，升级只长等级 scale 那部分，装备加成保留）——两个签名稳定，既有测试不破。
4. `SURVIVABILITY_MAXHP_SCALE` 3.5 → 3.0（装备 hp 不再被 scale 吸收，拆回装备加性项）。判据带重解：见 §3 表，L3 二郎神仍落 39.7%/6.8%。

**BattleScene 接线 patch（留笔，未应用——scenes/ 不动）**：

1. import（`heroTotalDef` 附近，从 `../systems/heroIdentity`）：`syncHeroEquipment,`
2. `seedFromSave()` 尾部（约第 537 行，`this.equipment` 两个分支都赋值完之后）加一行：
   ```ts
   syncHeroEquipment(this.identity, this.equipment)
   ```
3. `doEquip`（约第 1676 行 `equip(...)` 成功后）和 `doUnequip`（约第 1684 行 `unequip(...)` 成功后）各加一行：
   ```ts
   syncHeroEquipment(this.identity, this.equipment)
   ```
4. **MP（可选/次要）**：游戏内 MP 池是 BattleScene 的 `this.mp = createMp(getRole1MaxMp(level))`（第 546 行）+ `refreshMp`（第 644~648 行），不走 `identity.maxMp`。要让装备 mp 生效，把这两处的 target 从 `getRole1MaxMp(level)` 改为 `getRole1MaxMp(level) + this.identity.equipMaxMpBonus`（sync 之后 `equipMaxMpBonus` 已是最新）。HP 是主要 bug，MP 可后置。

**接线后生效**：装备 hp 真加进血池，炼 hp 装真变肉。未接线时装备 hp 仍不生效（跟改前一样），但 scale 已降到 3.0，故**未接 sync 前，无装备的裸血比改前低约 14%**（3.0/3.5）——这是必须接 sync 才闭合的地方，务必应用 patch。测试 `heroIdentity.test.ts` 新增 2 例直接断言 `syncHeroEquipment` 后 `combat.maxHp` 按装备 hp 增长、卸装夹回、升级保住加成。

# 续单二：exp 经济反编译（真源落数据 + 轨迹复算 + 偏差待拍板）

**源优先级纪律**：反编译原版主逻辑 SWF 拿每怪真实 exp，替换 BattleScene 的 flat `MONSTER_KILL_EXP=80` 占位值。

**反编译**：`base.BaseMonster.as` 在怪物死亡时把 `protectedParamsObject.exp` 加给英雄（有宠物则宠物也加一份——双发，见 progression.ts `PET_SHARED_EXP_RATIO`；本项目无宠物故单发）。每个 `export.monster.MonsterN` 构造函数设自己的 base exp。`gc.difficulity==1`（困难）时 BaseMonster 把 exp ×1.842（本项目无难度选择，用普通档 base 值）。

**真实 exp 表（普通难度，落进 `game/src/data/monsterExp.ts`）**：

| 关 | 怪（exp） |
| --- | --- |
| L1 | 巫鹰 M3(7) · 千里眼 M4(20) · 顺风耳 M2(20) · 巨灵神 M5(35) · grunt M7(6)/M8(5) · 蜂群 M30(4) |
| L2 | 增长天王 M6(70) · 广目天王 M16(100) · 多闻天王 M15(130) · grunt M9(6)/M10(6)/M19(28) |
| L3 | M11(88)/M12(96)/M13(104)/M14(112)/M1(80) · 朱子真 M21(280) · 袁洪 M20(380) · 二郎神 M22(430) |
| L4 | 邪.沙僧 M32(500) · 邪.八戒 M33(500) · 邪.唐僧 M31(500) · 邪.悟空 M34(500) |

分支怪按本项目实际 spawn 关卡取值：M9/10/19 取 `else` 分支（level-2 grunt 形，6/6/28，不是 `curStage==9` elite 的 60/70/80）；M20 两分支都 380；M30 base 4，但 BaseMonster 在英雄 ≥lv10 时把它清 0（血 1 蜂群的防刷机制）——存 base 4，lv10 门控是接线层选择。

**自然单次通关等级轨迹复算**（真实 exp × 现有曲线 × 本项目压缩后的波次，无刷怪）：

| 到达 | 累计 exp | 等级 |
| --- | --- | --- |
| L2 boss 前 | 420 | **lv3** |
| L3 boss 前 | 2066 | **lv8** |
| L4 boss 前 | 3996 | **lv11** |

**偏差（如实报告，判据不成立）**：目标是 L3 到 lv15±1、L4 到 lv21±2（承伤模型的到关等级）。真实 exp 给的是 lv8 / lv11，**缺口 L3 4.6×、L4 8.4×**。根因三条叠加：① 原版 exp 曲线（progression.ts，不能动）为原版的刷怪/重打经济校准；② 本项目把原版多阶段爬塔**压缩**成每关 4~6 波（L4 只有 4 只怪）；③ 原版 grunt 单只 exp 很小（4~6），本就靠海量击杀累积。三者叠加，单次通关压缩关卡到不了 lv21。

**拍板记录（team-lead 2026-07-07）：`CAMPAIGN_EXP_MULTIPLIER = 6`**。理由：这不是嫌原版给的少——每怪 exp 真值原样落盘（`MONSTER_BASE_EXP`）——而是补偿本项目把原版多阶段爬塔压成每关 4~6 波的**结构性压缩**，与养成替代层同一性质（显式命名、可回退，赛后关卡铺满真实波次时下调）。曲线高段陡（lv20→21 要 10000），没有单一倍率精确命中两关，6× 落 L3≈lv16 / L4≈lv20，双双进 lv15±1 / lv21±2 容差带。**否掉的备选**：① boss 单独加里程碑 exp——发明原版没有的机制；② 关卡加波次——关卡线的活不归数值层。已改常量为 6，`monsterExp.test.ts` 断言 shipped multiplier 下轨迹 L3∈[14,16]/L4∈[19,23] 并写死；同时保留一条"真值 base 单独（×1）到不了目标"的对照断言（记录为何需要 6×）。

**BattleScene 接线 patch（留笔，未应用）**：

1. import：`import { monsterExp } from '../data/monsterExp'`
2. `awardKillExp` 签名加 species（第 1410 行）：`private awardKillExp(x: number, y: number, species: string): void {`
3. 函数体第 1411 行：`const result = gainHeroExp(this.identity, monsterExp(species))`（替换 `MONSTER_KILL_EXP`；`MONSTER_KILL_EXP` 常量可删）
4. 调用点第 1368 行：`this.awardKillExp(ev.x, ev.y, e.species)`
5. （可选）honor M30 防刷：英雄 ≥lv10 时 M30 给 0——若要保真，在 `awardKillExp` 里 `species==='monster30' && this.identity.progression.level>=10 ? 0 : monsterExp(species)`。

**测试**：`monsterExp.test.ts`（4 例）pin 死反编译值（boss + 代表 grunt + 分支怪 M19=28），断言 multiplier=1 时轨迹 lv3/8/11（写死偏差）、断言假设 6× 时 L3∈[14,16]/L4∈[19,23]（证明提案有效）。改 exp 值或倍率跑偏会红。
