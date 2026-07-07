# 任务书（续单）：怪物行为库 — 数据驱动化 + 新怪行为

## 目标
第 2~4 关正在由 level-pipeline team 并行移植（素材/动作表/波次），但怪物**行为逻辑**没人负责——现在 monsterSim 只会 Monster30 一种打法，关卡铺开后全是换皮怪就穿帮。你来补：把怪物行为做成数据驱动，先搬 kagami 的 Monster3System，再从原版主逻辑 SWF 逆向 2~3 种新行为。

## 实现范围
1. **新文件 `systems/monsterBehaviors.ts`**（+单测）：数据驱动的行为 spec（移动模式/索敌/攻击模式/攻击盒/受击反应参数），提供工厂函数产出与现有 monsterSim 兼容的实例。**不改 monsterSim.ts 现有导出与行为**（integration-batch 正依赖它）；如确需挂钩子，加新导出不动旧的。
2. 搬 `vendor/kagami-phaser/src/systems/Monster3System.ts`（302 行）为第一个新行为，数值逐字+出处注释。
3. 从原版主逻辑 SWF 逆向 2~3 种怪行为：FFDec 反编译 `export.monster.*`（命令模板见 docs/research/asset-pipeline-notes.md，AS3 未加密）。**优先做哪几只：看 tasks/level-pipeline-report.md 里第 2/3 关的怪物清单**（level-pipeline 在写，还没有就先挑主逻辑 SWF 里实现最简单的近战/远程各一只，report 里说明选择）。
4. 远程怪如涉及弹幕，弹道逻辑纯数据化（速度/角度/存活时间），渲染留给接线方。

## 纪律（多 team 并行，同前）
- 只加新文件（monsterBehaviors.ts + 测试 + report）；绝不动 scenes/ ui/ net/ agent-server/ 和任何现有 systems 文件的行为。
- commit 只 add 自己文件，不 git add -A，遇 index.lock 重试，不 push。

## 验收判据
1. vitest 全绿（现有 182 不许挂）；每种行为至少覆盖：索敌进入攻击、攻击命中盒生成、受击反应。
2. `tasks/monster-behavior-report.md`：行为 spec schema、每只怪数值出处（kagami 行号 / 原版 SWF 类名+方法）、接线接口清单。