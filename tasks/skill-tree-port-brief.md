# 任务书：技能系统移植（kagami → systems/，Role1 悟空子集 + MP，纯逻辑）

## 目标
从 kagami 移植技能系统的悟空（Role1）子集 + MP 资源，纯逻辑落 `game/src/systems/`，**不接 BattleScene**（被另一 agent 独占，你绝不能动 `game/src/scenes/`、`game/src/ui/`、`game/src/net/`）。

## 移植源（移植 > 重写，这是项目铁律）
- `vendor/kagami-phaser/src/systems/` — 重点 HeroSkillSystem、Role1 相关、MP/资源相关文件；除 InputSystem.ts 外都是 Phaser 无关纯 TS，可近乎直接转换。
- SkillUISystem（技能树 UI）**本棒不做**，只搬数据结构里技能树定义需要的部分。
- 数值保持 kagami 原值逐字搬，出处在代码注释里标明来源文件；kagami 里也没有、需要自定的值标 TODO-verify。

## 实现范围
1. `systems/mp.ts`（或并入合适模块）：MP 资源（上限/回复/消耗），成长挂钩等级的部分留接口（HeroIdentityState 由另一 agent 在建，别依赖它，用参数注入）。
2. `systems/heroSkill.ts`：悟空技能子集——技能定义（伤害/MP 消耗/冷却/释放条件）、冷却状态机、释放入口 `tryCastSkill(...)` 返回结果对象（伤害盒/特效标记），供未来 BattleScene 接线。
3. 技能与现有 `systems/combo.ts`/`heroSim.ts` 的关系：技能是独立 action 入口，**不改这两个文件的现有行为**；如需状态互斥（放技能时不能连击），在返回结果里给出建议状态，由接线方处理。
4. 全部带 vitest 单测。

## 约束
- 只加新文件 + 只在必要时给 items/roleData 等加导出，不改现有模块行为。
- `cd game && npx vitest run` 现有 126 个不许挂。

## 验收判据
1. vitest 全绿，技能子集测试覆盖：MP 不足拒放、冷却中拒放、释放消耗 MP、冷却恢复、伤害数值与 kagami 原值一致（注明来源行）。
2. 写 `tasks/skill-tree-port-report.md`：搬了哪些文件/哪些技能、数值出处表、接线接口清单（给集成棒）、SkillUISystem 后续移植提示。

## 提交
完成自测后 commit（不 push），message 英文。
