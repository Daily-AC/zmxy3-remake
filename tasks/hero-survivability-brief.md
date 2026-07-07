# 任务书：承伤调平（养成替代层 + 魔防曲线）

派单：主会话 session3（Fable），2026-07-07 20:15。执行：opus。用户已拍板方案。
Report 落 `tasks/hero-survivability-report.md`，commit 只 add 自己的文件、**不 push**。

## 背景与拍板结论

英雄裸曲线（已确认忠实原版）太薄：L20 仅 1030 血，二郎神 hit2（1299 魔法）一击秒杀，邪·悟空全攻击 0~1 击必杀。根因是原版靠装备/宝石把血抬到几千~几万，我们缺那层养成。核算数据见 `tasks/hero-scale-report.md`。

用户拍板（2026-07-07 20:14）：
1. **判据先行，倍率从判据反推**：到关等级 + 中等炼装时，该关 boss 最痛一击掉 25%~40% 有效血、普通攻击掉 5%~10%；全程真人手玩可通，不靠 `__setHeroHp` 续命。预估落点 maxHp 有效 ×3~3.5、def ×2，但以判据为准。
2. **魔防补上**：最致命的两下（二郎神 hit2 1299、邪·悟空 hit9 1000）都是魔法，而 `resolveIncomingHeroDamage` 的魔防参数一直传 0（半成品）。新增英雄魔防成长曲线：L10≈10% → L30≈35%，封顶 50%。原版本来就有 `power × (1 - magicDef/100)` 通道，这比堆血保真——魔法要躲、物理能扛的战术分层是原生的。
3. **实现为显式"养成替代层"**：progression.ts 的原版曲线数字一个不改。放大系数做成命名常量、在 heroIdentity 聚合处生效，Adapted 注释写明"替代缺失的装备/宝石养成层，赛后宝石系统落地退回 1"。偏差点单一、可回退。
4. **拾取球固定回复量不动**：小红 +100 在放大后血量里占约 3%，与原版口径比例一致，保持即保真。

## 范围与文件独占

- 独占：`game/src/systems/heroIdentity.ts`、`heroScale.ts`、新增魔防曲线文件（可并入 progression.ts 同目录新文件，别改 progression.ts 原值）、对应 tests。
- **不许动**：`game/src/scenes/**`、`game/src/ui/**`（ui-finish 棒在途，BattleScene 单支笔在它手里）、`net/`、`agent-server/`、`furnace.ts`。
- BattleScene 接线（把魔防分数传进 `resolveIncomingHeroDamage`、有效 maxHp 生效点若需改调用处）：先看 `tasks/ui-finish-report.md` 是否已存在（= ui-finish 交笔）。交了笔就自己接线并真机验证；没交就在 report 里给出精确到行的 patch，留给持笔人。

## 关键作业

1. **到关等级建模**：用现有 exp 曲线 + L1~L4 波次怪物 exp 值算"自然通关到达各关的期望等级"（假设写进 report）。这是判据里"到关等级"的定义。
2. 定替代层系数 + 魔防曲线，使核算表落进判据区间（boss 最痛一击 25~40%、普攻 5~10%）。中等炼装按 furnace 词条上限的一半估。
3. `heroScale.ts` 的 `estimateHitsToKillHero` / 核算表全部复算，L2/L3/L4 三 boss × 到关等级的落点直接写成测试断言（判据带写死进测试，改曲线跑偏会红）。
4. 二郎神 heal-block 复核：血量放大后 30s 禁疗才开始有战术意义，确认拾取球门控逻辑在新口径下语义不变。
5. tsc 干净 + vitest 全绿（基线 387+）。

## 完成判据

测试断言判据带全绿；report 含：到关等级假设与推导、最终系数与曲线、复算核算表（三 boss 承伤/击杀秒数）、BattleScene 接线状态（已接+真机证据 / patch 留笔）、疑点。最终手感 A/B 由用户手玩定夺，你的责任是让数值先落进判据带。
