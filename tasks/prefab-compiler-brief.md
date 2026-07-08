# zmxy-prefab-compiler — 派工 brief（管线跃迁棒，2026-07-08 用户拍板转向）

授权背景：本项目是《造梦西游3》团队成员的授权重制（CLAUDE.md「法律风险已澄清」节），FFDec 读取的是团队自有游戏资源。

## 背景与目标（为什么做这个）

昨夜六屏走的是"agent 逐屏读 xfl → 手写 Phaser 坐标 → 截图 overlay 验证"，每屏都要人肉循环。用户拍板转向：**把无损真源正向编译**——写一个 SWF(xfl)→Phaser prefab 的确定性编译器，让坐标"构造即正确"，截图 diff 降级为一次性冒烟。业界先例是 Flump（FLA→atlas+JSON+各引擎薄 runtime，github.com/tconkling/flump，工具已死但格式思想成立），Phaser 端没人做过，我们自建。

**两个验收目标（按序）**：
1. **第一关关卡结构 1:1**：用编译器吃第一关关卡 SWF，还原原版多平台（爬塔/跳台）结构——用户今晨指出现第一关是"横版平地"，为移植早期 Adapted 简化，是当前最大保真痛点。
2. **技能树被动面板重出**：用编译器输出替换 SkillTreeScene.buildPassivePanel 的手工拼贴（现状是烘焙图半透明叠印 bug，用户截图在案）。

## 必读

1. `docs/playbooks/ui-port-dual-source.md` 全文+「S1 棒沉淀的三条补充纪律」——编译器就是把这三条纪律固化成代码：origin 从 shape bounds 递归推导、坐标从 PlaceObject Matrix、多帧状态语义保留。
2. `tools/worldmap-deco-origins.py` ——**核心数学已在这**（swf2xml 递归 bounds/matrix walker：button 态并集、sprite 子链、twips÷20），在此基础上泛化，不要重写。
3. `tasks/skilltree-report.md` §1-2 与「终审返修」——xfl 结构实例（Symbol 979/489/736/733）、filter 符号画布 padding 坑（analytic 差 ~170px，需互相关或 bounds 修正兜底）。
4. `docs/research/asset-pipeline-notes.md` + `tasks/level-pipeline-report.md`（关卡包结构与既有关卡管线）。
5. CLAUDE.md（铁律：类逻辑只认主 SWF；子 SWF 用 out_res/ 解密版；Phaser v4）。

## 交付物

### A. 编译器 `tools/prefab-compiler/`（python，无第三方依赖除 Pillow）

- 输入：FFDec `-swf2xml` 产物（或 xfl，二选一按你实测哪个信息更全）+ `-export image,sprite` 位图目录；命令行指定目标符号 id/类名。
- 输出（每符号一份）：
  - `<name>.prefab.json`：嵌套场景图。每节点含：type(container/image)、textureKey、matrix{tx,ty,scaleX,scaleY,rotSkew}、originFrac{x,y}（bounds 推导）、depth、instanceName（命名实例保留，逻辑层要挂事件）、frames[]（多帧符号每帧一份子树 + 帧号语义标注）、boundsPx。
  - 引用到的 PNG 清单（去重，落 `game/public/assets/extracted/prefab/<name>/`）。
- 健全性自检（编译器内置，违者报错不静默）：每符号 bounds 尺寸 vs 导出 PNG 尺寸吻合（±4px 容差，超差列入 report）；twips÷20；文本字段（DefineEditText）保留 initial text + 字号颜色进 JSON。
- 单测：对已人工验证过的符号回归——s1_1 origin 必须算出 (0.495,0.659)、s1_2 (0.460,0.532)、llbt (0.5,0.5)、btnnmg (0.668,0.487)（真值出处 tasks/worldmap-report.md 终审返修节）。

### B. 运行时 `game/src/prefab/PrefabLoader.ts`（一次性通用件）

- 吃 prefab.json → Phaser Container 树（image 用 originFrac/matrix，多帧符号封装成可 `gotoFrame(n)` 的对象，命名实例可按 instanceName 查找挂交互）。
- 单测：加载样例 JSON 断言树结构/坐标/origin。

### C. 两个验收目标落地

1. 第一关：确定第一关关卡 SWF 真源（out_res 数字包 0-20 中哪个，参 level-pipeline report；不确定就先 FFDec 渲染各包首帧人肉确认），编译平台/地形符号 → level.ts 的平台数据改为从 prefab 读取（保留现有怪物波次逻辑不动）。判据：游戏内第一关出现原版的多平台结构，跳台可站立（物理接线），流程照旧可通关。**注意用户参照图是 Online 版可能有版本差，以 vendor 造3 关卡包为真源**，与 Online 差异记 report。
2. 被动面板：编译 PassiveSkillControl（Symbol 769）prefab 替换 buildPassivePanel 手工拼贴；切页签时隐藏主动表格底图（现状叠印 bug 一并修）。

### D. 报告 `tasks/prefab-compiler-report.md`

编译器设计决策、回归真值表、第一关符号清单与 Online 差异、遗留（如矢量 shape 无位图怎么办——先记录跳过，别自己发明光栅化）。

## 边界

- 不动 systems/ 逻辑（怪物波次/战斗/存档）；level.ts 只改平台数据来源；SkillTreeScene 只改 buildPassivePanel。
- commit 本地不 push；测试基线 450 全绿不许破；build 过。
- 调试产物落 game/tmp/prefab-dev/。

## 环境事实

同前棒：Java `/opt/homebrew/opt/openjdk/bin/java`；FFDec `tools/ffdec/ffdec-cli.jar` headless 必带子命令+`-Djava.awt.headless=true`；主 SWF 与 out_res 路径见 playbook；macOS 无 timeout；vite nohup 独立端口；playwright + __shell* 钩子可驱流程。

## 验收（主会话终审）

编译器回归真值表全过 + 第一关真机截图（多平台结构可见可玩）+ 被动页签不再叠印 + 450 测绿。
