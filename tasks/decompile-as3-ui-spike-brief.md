# 任务书：反编译 AS3 UI 源码可行性 + 质量评估 spike

派单：主会话 session3（Fable），2026-07-08 01:0x。执行：opus。用户师傅（造梦团队内部人）建议评估"反编译获取源码"路线。
Report 落 `tasks/decompile-as3-ui-report.md`，commit 只 add report，不 push。

## 目标

评估"反编译原版 AS3 UI 源码，作为 UI 复刻的权威规格（甚至可能重编译改原版）"这条路的真实价值，用证据回答主会话的三选一：翻译 AS3 布局源码 / 抠对象树 PlaceObject 坐标（现行）/ 重编译改原版。**不改 game/ 任何代码，这是纯评估。**

## 背景

造3 是 AS3 Flash。主 SWF = `vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`（.exe 是同内容的 projector）。UI 资源可能分散在同目录 assets/ 的子 SWF（OtherMat1/RoleInfo/backpack1/RoleSkillInterface 等）。FFDec 在 tools/ffdec/ffdec-cli.jar，headless CLI（裸跑弹 GUI 有事故记录）。反编译产物落 scratchpad 或 tmp/（gitignored），别污染仓库。AS3 反编译保留类名/方法名/变量名（audit-numbers 已证 export.hero.Role1 可逐字读）。

## 作业

1. **UI 布局类反编译质量**：反编译以下类（先定位在哪个 SWF，可能要跨包搜符号），评估源码可读性——是否有可直接转译的布局坐标/尺寸/层级/事件逻辑：
   - RoleInfo（战斗 HUD，已知 OtherMat1 chid341）——重点看它是纯 timeline 摆放还是 AS3 代码布局。
   - SelectRole（选人五格）、SelectPlace/WorldMap（世界地图 hub，最高价值缺口，docs/reference/user-flow-refs/worldmap-original.png）。
   - BackPack/个人资料面板、RoleSkillInterface（技能树）。
   - 主菜单/存档界面类。
   对每个类给结论：①布局是"AS3 代码写死坐标"还是"timeline 静态摆放（只能抠对象树）"；②源码可读性（贴 2~3 段真实反编译片段为证）；③转译成 TS/Phaser 布局的工作量估计。
2. **对象树 vs 源码的信息量对比**：拿 RoleInfo 举例，说明"抠 PlaceObject 坐标"相比"读 AS3 布局源码"具体丢了什么（动态布局？条件摆放？事件？），量化现行方法的损失。
3. **重编译回 SWF 可行性**（激进分支）：FFDec 反编译产物能否用 Apache Royale / AIR SDK 重新编译回可跑 SWF？大型工程反编译-重编译对等性风险有多大？agent NPC 要挂 WebSocket，AS3/AIR 外部通信可行性？给"直接改原版"这条路一个 go/no-go 倾向 + 理由（不要求真跑通编译，评估 + 小实验即可）。
4. **产出规格化建议**：若"翻译布局源码"胜出，给一套可复用流程（反编译哪个类→提取什么→怎么转 TS），让后续每个 UI 屏都能照做，替代/增强现行的"抠对象树坐标"。

## 完成判据

report 三选一明确结论 + 每个 UI 类的反编译质量结论（带真实源码片段为证）+ 重编译 go/no-go + 若翻译路线胜出的可复用流程。时间盒：认真评估一轮，别陷入真去跑通完整重编译。
