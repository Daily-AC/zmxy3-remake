# verdict-fixes 棒：用户拍板三件套（2026-07-08 16:2x 拍板）

## 授权语境

本项目用户系造梦西游团队成员，素材使用无版权障碍（项目 CLAUDE.md「法律风险已澄清」节）。本任务不涉及素材提取，是纯代码改动。

## 边界（防互踩，先读）

**禁动文件**：`game/src/scenes/BattleScene.ts`、`game/src/ui/` 全部——在跑的 battle-fidelity 棒独占。你的任务里凡涉及 BattleScene 消费的部分一律只做纯逻辑层 + 测试，接线留给后续棒。

## 任务三件

### 1. 怪物纵向追击最小版（主件，纯逻辑）

用户拍板：做最小版——`game/src/systems/monsterSim.ts` 加 Y 轴跟随，让第一关攀爬段（悟空纵向往上爬）怪物能追上来。

- 背景：第一关已实装攀爬（棘轮地板 + 相机纵向解禁，见 tasks/prefab-compiler-report.md 与 5c13f65），但 monsterSim 只有 X 轴，怪物追不上爬高的英雄，攀爬段无威胁。原版 Monster30 蜂群是飞行怪、随行追击（StageListener11 考古，见 tasks/prefab-compiler-report.md）。
- 设计要求：Y 轴跟随作为 sim 的通用能力（带开关/参数，默认关闭或仅对标记为飞行/追击型的怪开启），速度参数给出出处或标注 TODO-verify（沿用项目移植协议：自定参数就地注释）。不改任何现有怪物的 X 轴行为与数值；现有测试必须全部保持绿。
- 判据：新增 vitest 覆盖（Y 轴逼近、到位停止、开关关闭时行为与现状逐位一致的回归断言）。**不接 BattleScene**——接线判据（渲染层怪物真实爬升）留给 battle-fidelity 合完后的接线棒，report 里写清接线需要的 API 与一段示例代码。

### 2. huodongbtn 置灰（小件）

用户拍板：保留原版按钮视觉、点击无效置灰；将来想做活动可放回，难度切换以后再考虑（AS3 真实语义是难度切换，考古结论保留在 tasks/worldmap-report.md，不要删注释）。

- 位置：`game/src/scenes/WorldMapScene.ts` + `game/src/data/worldmapNodes.ts`。
- 要求：按钮位图原位保留、视觉置灰态（与地图上其他置灰项一致的处理方式），点击给主题 toast（项目已有 toast 组件，禁用原生弹窗）。代码注释注明"原版语义=难度切换，用户拍板赛内置灰，2026-07-08"。

### 3. 删 S2 选人屏「敬请期待」自加标签（小件）

用户拍板：删。原版第五格就是「???」纯装饰（AS3 证实无变量，见 tasks/selectrole-saveslots-report.md），标签是我方自加、参照图没有，违背"老玩家无感"北极星。

- 位置：`game/src/scenes/CharacterSelectScene.ts`。只删第五格的锁定/敬请期待标签渲染，格子本体「???」装饰态保持原样。注意项目里其他场景也有"敬请期待"字样（SkillTreeScene/WorldMapScene 的占位 toast），那些不在本单范围，别误删。

## 验收判据

1. `npm test` 全绿（463+ 基线 + 你的新增），`npm run build` 过，tsc 净。
2. 选人屏截图：第五格无标签、与参照图 docs/reference/user-flow-refs/selectrole-original-idle.png 第五格状态一致。
3. 世界地图截图：huodongbtn 置灰在位。
4. report 落 `tasks/verdict-fixes-report.md`：改动清单 + monsterSim 接线 API 说明 + 疑点。

## 工程事实

- dev server：`game/` 下 `nohup npx vite --port 5202 &`（5201 可能被 battle-fidelity 占用，自开独立端口）。
- playwright 验收自开独立 tab/context；page.evaluate 传函数不传字符串。
- commit 只 add 自己的文件、不 push。
