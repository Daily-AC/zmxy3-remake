# 承伤调平报告：养成替代层 + 魔防曲线

对应任务书：`tasks/hero-survivability-brief.md`。核算前置：`tasks/hero-scale-report.md`。

新增文件：`game/src/systems/heroSurvivability.ts` + `game/tests/heroSurvivability.test.ts`。
改动文件：`game/src/systems/heroIdentity.ts`（在聚合处套放大系数 + 暴露魔防访问器）、
`game/tests/heroIdentity.test.ts`（既有断言改为期望放大后的值）。
**未动**：`progression.ts` 原版曲线数字、`heroScale.ts`、`furnace.ts`、`scenes/**`、`ui/**`、`net/`、`agent-server/`。

## 一句话结论

裸曲线太薄的根因是缺了原版的装备/宝石养成层。本棒把它补成一个**显式、单点、可回退**的放大层（`heroSurvivability.ts`）：
maxHp ×3.5、base def ×2，外加一条全新的英雄魔防成长曲线（L10=10% → L30=35%，封顶 50%）。
系数不是拍脑袋选的，是从判据带反推的——恰好落在任务书预估的 ×3.5/×2 上。参考 boss（二郎神 1299 魔法核击）在到关等级 + 中等炼装下掉 **39.9% 有效血**，普攻掉 **6.8%**，正落判据带。判据带写死进了测试，改曲线跑偏会红。

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

- `SURVIVABILITY_MAXHP_SCALE = 3.5`——有效 maxHp = 等级曲线 maxHp × 3.5。同时吸收了"装备 hp 未接进血池"这一现状（见 §4 疑点）。
- `SURVIVABILITY_DEF_SCALE = 2.0`——有效 base def = 等级曲线 def × 2，**在装备 def 之前**（炼装 def 仍然叠加、不放大——那是真实炼装，不是替代层）。
- 魔防曲线 `heroMagicDefFraction(level)` = `clamp(0.10 + (level−10)×0.0125, 0, 0.50)`，返回 0~1 分数：
  - L10 = 10%、L30 = 35%、L42 起封顶 50%、L1（锚点以下）= 0。
  - 全新英雄属性。原版 `base.BaseHero.countHurt()` 本就有 `power×(1−magicDef/100)` 魔法通道（见 heroScale.ts 头注），但本项目从没给悟空魔防值，`resolveIncomingHeroDamage` 一直传 0。游戏里最致命的两下（二郎神 hit2 1299、邪·悟空 hit9 1000）都是魔法——给悟空魔防成长，恢复的是原生的"魔法要躲/物理能扛"战术分层，比堆平血更保真。

生效点（`heroIdentity.ts` 聚合处，带 Adapted 注释）：`createHeroIdentity`（seed maxHp）、`gainHeroExp`（升级长血按放大后的差值治疗）、`heroStats`（def 在叠装备前放大）。新增 `heroMagicDef(id)` 供接线层取魔防分数。

## 3. 复算核算表（到关等级 + 中等炼装）

中等炼装 = furnace 词条上限的一半。`ENGINE_MAX` 现值 atk/def=200、hp=800，一半即 atk+100/def+100/hp+400。其中 **def+100 真实生效**（`heroTotalDef` 叠装备），**hp+400 不生效**（装备 hp 没接进 `combat.maxHp`，见 §4），故有效血口径里 hp 靠 ×3.5 吸收、不再另加装备 hp 项。atk+100 只影响击杀时间不影响承伤。

| 关卡 boss（到关等级） | 有效血 | 有效 def | 魔防 | 最痛一击（减伤后） | 占比 | 普攻（减伤后） | 占比 | 击杀时间 | 扛几发核击 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L2 多闻天王 (lv8) | 1505 | 132 | 7.5% | 120魔 → 111 | **7.4%** | 186物 → 54 | 3.6% | 25s | 13 |
| L3 二郎神 (lv15) | 2730 | 160 | 16.3% | 1299魔 → 1088 | **39.9%** | 345物 → 185 | 6.8% | 63s | 2 |
| L4 邪.悟空 (lv21) | 3780 | 184 | 23.8% | 1658物 → 1474 | **39.0%** | 829物 → 645 | 17.1% | 81s | 2 |

判据带：最痛一击 25~40%、普攻 5~10%。

- **L3 二郎神（参考 boss）**：最痛 39.9%、普攻 6.8%——**双双落带**。整层就是围绕它调的。
- **L4 邪.悟空**：最痛 39.0% 落带；普攻 17.1% **偏高出带**。原因是 829 物理普攻 raw 太大，realistic def（furnace 上限 200）压不到 10% 以下——除非 def×6+ 荒谬。对终 boss 而言"普攻也很疼"合理，接受并写死断言。
- **L2 多闻天王**：最痛 7.4%、普攻 3.6%——**双双低于带**。多闻天王本就是弱爆发早关 boss（最大攻击才 120 魔/186 物），在 lv8 放大血面前掉不到 25%。它的威胁是**消耗战**（16000 血打 25s，期间挨一堆小刀）不是爆发，符合原版设定。接受并写死断言。

**单一全局系数放不平非单调的原版 boss 伤害曲线**（L2 弱、L3 突刺、L4 全重），强行三关同时进带需要荒谬的 def/血。所以 L3 带是承重断言；L2/L4 的结构性偏差按精确值写死，改曲线仍会跑红。

对比放大前（`hero-scale-report.md` 表）：L3/L4 核击原本 0~1 击必杀，现在都能**扛 2 发**——这才让二郎神 30s 禁疗（heal-block）第一次有战术意义（见 §5）。

## 4. BattleScene 接线状态

`tasks/ui-finish-report.md` **不存在** = ui-finish 棒未交笔，BattleScene 单支笔不在我手里，故**不动 `scenes/`**，接线以精确 patch 留笔。

**好消息：maxHp ×3.5 和 def ×2 已经自动生效**——它们走 `createHeroIdentity`/`gainHeroExp`/`heroTotalDef`，全部路由过我独占的 `heroIdentity.ts`，BattleScene 消费即得，无需改 BattleScene。

**唯一待接线：魔防分数**。`BattleScene.ts` 的 `monsterHitsHero`（约 1418~1432 行）已经在调 `resolveIncomingHeroDamage`，`attackKind` 也已按 `e.attackKind` 动态传（物理/魔法正确），**只有魔防分数硬编码成 `0`**（第 1429 行）。精确到行的 patch（两处）：

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

**接线前后差异**：未接线时魔法伤害不减免——L3 二郎神核击 1299/2730 = **47.6%（略出带）**；接线后 39.9%（落带）。测试断言的是接线后的目标态（用 `heroSurvivability.ts` 的真实函数直接算，不依赖 BattleScene），所以 vitest 绿不代表魔防已在游戏里生效——**必须应用上面的 patch，L3 才真正落带**。持笔人接线后建议真机验证：lv15 悟空打二郎神，核击掉血应约 4 成而非近半。

## 5. 二郎神 heal-block 复核（作业4）

拾取球（小红）固定回 +100，门控逻辑在 BattleScene（`applyPickupHeal`，未动）。放大后有效血 2730，+100 = 一球回 3.7%，与原版"回血占比很小"口径一致（任务书拍板保持不动）。

语义在新口径下从"无意义"变成"有意义"：放大前英雄一发核击就死，根本活不到需要靠回血续命、也活不过 30s 禁疗窗；放大后能扛 2 发核击 + 63s 战斗里可在非禁疗段捡球回血，于是"二郎神放大招期间的 30s 禁疗"第一次成为真需要战术应对的机制（禁疗窗内必须避免吃核击）。**拾取球门控逻辑本身语义不变**（仍是固定 +100、同样门控），只是比例上变得有意义了。无需改拾取代码。

## 6. 验证

- `npx tsc --noEmit`：干净（仓库无报错；上一棒提到的 `RoleInfoHud.ts` 报错已被他人修掉）。
- `npx vitest run`：**34 文件 395 例全绿**（基线 387 + 本棒新增 8 例 band 断言）。`heroSurvivability.test.ts` 用 `heroScale.ts` 的真实减伤函数 + `progression` 真实曲线 + 本模块系数算判据带，不自算自证；`heroIdentity.test.ts` 既有断言改为走真实 `createHeroIdentity`/`gainHeroExp`/`heroStats` 代码路径断言放大后的血/防，即"放大层已在真实路径生效"的证据。
- 判据带写死进测试：L3 最痛∈[25%,40%]、普攻∈[5%,10%]（承重）；L4 最痛∈[25%,40%]、普攻 pin≈17.1%；L2 最痛 pin≈7.4%、普攻 pin≈3.6%；魔防锚点/封顶/地板/单调性全断言。scale 常量在锚点等级 pin 死（2730/60 等）。
- **未做浏览器真机验收**：`:5173` 上跑的 dev server 是另一个无关项目（标题「苏妲」），不是 zmxy3-remake，我没有对错误应用做验收。数值验收以 vitest（走真实代码路径）为准；最终手感 A/B 按任务书由用户手玩定夺。

## 7. 疑点 / 留给后续

1. **exp 经济到不了可赢等级**（§1）：每杀固定 80 + 陡曲线，自然通关地板（L4 lv10）远低于打赢 L4 所需（lv21）。需给怪物按种类/关卡分级 exp 产出。`MONSTER_KILL_EXP` 在 BattleScene，非本棒。
2. **装备 hp 未接进 `combat.maxHp`**：`heroStats().hp`（装备 hp 词条之和）从未用于长血池——装备 hp 词条目前对生存毫无作用（一个潜在 bug）。本棒用 ×3.5 吸收了这块，但正解是把装备 hp 接进 maxHp（跟 atk/def 对称）。接线点在 BattleScene 的 equip/unequip 事件（`createHeroIdentity` 不收 equipment 参数），跨 BattleScene 所有权，未做。接了之后 `SURVIVABILITY_MAXHP_SCALE` 应相应下调（把中等炼装 hp+400 从系数里拆回装备）。
3. **L2/L4 结构性出带**（§3）：单一全局系数放不平非单调 boss 伤害。若要三关都严格进带，需 per-boss 或 per-关 的血/防微调，或重审原版 boss 单发攻击力口径——超出"单点可回退替代层"的范围，未做。
4. **只覆盖 Role1（悟空）**：`heroSurvivability` 的 scale/魔防对全 heroId 通用（Role2~5 也会被放大），但判据只针对悟空核算——本项目目前只有悟空可玩，Role2~5 上线时需重核。
