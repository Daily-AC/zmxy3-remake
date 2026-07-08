# battle-fidelity 棒：战斗屏无感化（session5 首棒）

## 授权语境（先读）

本项目用户系造梦西游团队成员，对造梦西游3与 Online 全系列素材的使用无版权障碍（见项目 CLAUDE.md「法律风险已澄清」节）。本任务全部素材来自项目内已提取归档的资源（`game/tmp/prefab-dev/`、`docs/reference/`、vendor 提取物），属于对自有素材的工程化接入，不涉及任何新的解密或获取行为。

## 北极星（用户 2026-07-08 拍板总纲）

**老玩家无感**：玩过原版的人第一次玩重制版，体验上应以为在玩原版。本棒目标 = 战斗屏与参照图 `docs/reference/user-flow-refs/battle-original.png`（官方实机）达到同机位结构一致。

## 背景与现状

用户对照官方截图打回战斗屏五点（progress.md session4→5 交接节有原文）。现状截图 `docs/reference/user-flow-refs/battle-ours.png`。主会话亲判读的差距：

1. **背景构图不对**：官方图宫殿群是远景（小、靠上、有纵深），我方把桥梁中景渲染得过大过近。官方图对应第一关地面段 = bg12（莲池华表）/ bg13（玉石长廊）区段。
2. **无地面层**：官方图角色踩在雕花玉石长廊石台上（石面有花纹雕饰）；我方悟空与怪直接站在莲叶/云图上，踩空气。bg12/bg13 地面素材 prefab 编译产物已存在：`game/tmp/prefab-dev/level1-compiled/bg12.prefab.json`（4890×596）、`bg13.prefab.json`（4903×678），从未接进战斗渲染。
3. **等级数字不居中**：RoleInfoHud 墨圈内等级数字（现渲染在墨圈左下角），官方图数字在墨圈正中。
4. **无双/怒气充能条无真源**：我方墨圈下那根白色空条是 S1 时代按"空 chrome"渲染的占位（chid262 herobeattacktimes，export.RoleInfo 对象树内，见 tasks/ui-finish-report.md）。真源位图与布局均未提取。官方图中该条与左下无双按钮簇视觉相连。
5. **悟空空手**：原版悟空默认持金箍棒；我方仅在穿戴锻造武器时才叠加武器视觉（role1_equip0 机制已存在，见 BattleScene 武器视觉接线）。

## 任务（按优先序）

### A. 战斗段背景 + 地面层接入（最大件）

- 用 prefab 管线（`tools/prefab-compiler` 编译器 + `game/src/prefab` PrefabLoader，用法见 tasks/prefab-compiler-report.md）把 bg12/bg13 地面段接进 BattleScene 战斗区段渲染。
- 编译产物从 `game/tmp/prefab-dev/`（gitignored 临时区）正式化落位：JSON 进 `game/src/data/prefab/` 或现行约定位置，位图进 `game/public/assets/extracted/prefab/`，与 PassiveSkillControl.prefab.json 现行落位方式保持一致。
- 地面几何：groundY 与石台美术上沿对齐，悟空/怪脚底踩在石面上（参照图为准）。
- 远景层（天宫宫殿群）比例/位置照参照图收小放远；视差层次维持现有机制。
- **不许动**：bg11 攀爬段实装（5c13f65 的棘轮地板/相机纵向解禁/bg11 纵移）保持原样；jump.ts、combo.ts、systems/ 数值逻辑零改动；波次数据零改动。攀爬段与地面段的衔接方式如遇设计疑点，落 report 不擅自改结构。

### B. HUD 四细节

1. 等级数字墨圈内居中（对象树坐标为准，不许目测）。
2. 无双充能条真源提取：FFDec 从 export.RoleInfo 对象树（OtherMat1 chid341，见 tasks/ui-finish-report.md 的提取记录）导出 chid262 herobeattacktimes 的真实位图与 PlaceObject 坐标，替换白色占位条。怒气系统逻辑赛内不做（已拍板），条渲染为真源空态（0 充能）即可，但布局必须照对象树与无双按钮簇的真实关系。
3. 悟空默认金箍棒视觉：未穿锻造武器时叠加默认金箍棒（复用 role1_equip0 武器视觉机制；默认件素材从项目内已提取资源找，找不到落 report 给证据）。
4. 无双按钮维持装饰态（不接怒气逻辑），与充能条视觉相连即可。

## 铁律（项目既定，违者打回）

- UI 复刻一律抄 SWF 对象树 PlaceObject 坐标 + 原件位图组装，**零手调、禁目测近似**（全局纪律 feedback-ui-fidelity-pixel-diff）。
- 双源管线：皮在 timeline（xfl 矩阵），骨在主 SWF AS3——`docs/playbooks/ui-port-dual-source.md` 全文必读，含三铁律与 origin 必算纪律（左上锚不可默认，工具 tools/worldmap-deco-origins.py 可复用）。
- 类代码只认主 SWF `打开我开始玩.swf`；子 SWF 用 out_res/ 解密版。
- 移植期发现设计疑点 → 落 report，代码保持原样。

## 验收判据（主会话终审用，交付必须自带证据）

1. 与 `battle-original.png` 同机位截图 overlay（同分辨率配准），布局/地面/远景结构层像素 diff 无双影无错位；豁免项（动态数值/状态差）逐项记档。
2. 悟空站在石台上、手持金箍棒、等级数字居中、充能条为真源位图——四点截图可见。
3. `npm test` 463+ 全绿、`npm run build` 过、tsc 净。
4. report 落 `tasks/battle-fidelity-report.md`：改动清单、素材来源逐项、疑点/豁免清单。

## 工程事实

- dev server：`game/` 下 `nohup npx vite --port 5201 &`（run_in_background 直跑会被环境杀）。
- commit 只 add 自己的文件、**不 push**（等用户统一推）。
- Phaser 坑：scrollFactor(0) 容器内 setInteractive 会随镜头漂移，用场景级屏幕坐标命中；Phaser 4 渲染管线与 v3 有破坏性差异，先查迁移文档。
- playwright 验收自开独立 tab/context（共享浏览器会互踩）；page.evaluate 传函数不传字符串。
- FFDec 在 vendor/zmxy_res/ffdec/，headless 用法见 docs/playbooks/level-port-playbook.md 坑单。
