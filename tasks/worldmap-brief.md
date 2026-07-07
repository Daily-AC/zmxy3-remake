# S1 世界地图 WorldMapScene — 派工 brief（session4 首棒，2026-07-08）

## 目标

新增 WorldMapScene 作为屏幕流 hub，补上最大结构缺口：原版流是 主菜单→存档→选人→**世界地图**→关卡→回地图，我们现状选人后直接摔进战斗。本棒交付后：选人确认进世界地图，从地图点岛进关，通关回地图。

规格真源（必读，按此执行，不得自行发挥样式判断）：
- `docs/design/screen-fidelity-spec.md` §S1（逐条即验收项）
- `docs/playbooks/ui-port-dual-source.md`（双源管线四步 + 三铁律 + 四个"必须读 AS3"信号 + FFDec 环境坑，**全文照做**）
- 参照图 `docs/reference/user-flow-refs/worldmap-original.png`

## 双源提取（管线 Step 1~3）

- **骨（AS3）**：从主 SWF `打开我开始玩.swf` 导 `export.SelectPLace`（注意大写 L）。要拿到：关卡节点命名协议 s{stage}_{level}、节点三态（可点/未解锁/当前）的帧号语义、进关 gating 条件（如等级门槛）、底部按钮的事件绑定。命中 playbook 四信号（运行时 new+循环赋坐标 / 多态多坐标 / 镜像 / gotoAndStop 帧语义）的行必须读到并直译进 TS。
- **皮（对象树）**：SelectPlace/map/place 符号族预计在 `out_res/OtherMat1.swf`（若不在，FFDec 搜其余 out_res 子 SWF）。用 `-format xfl:cs6 -export xfl` 取命名 PlaceObject 的精确 Matrix tx/ty/scale/depth。**禁止手工像素校准**。
- **位图**：`-export image,sprite` 取地图大图、关卡岛屿/建筑热点件、底部圆钮（含图标+竖排小字）、宝箱件。落 `game/public/assets/extracted/worldmap/`（该目录故意进 git）。
- 铁律提醒：类代码只认主 SWF（OtherMat1 里同名类是旧副本，只用它取符号+坐标）；子 SWF 一律用 out_res/ 解密版（assets/ 下是加密态，FFDec 静默导 0 类不报错）。

## 接线（管线 Step 4）

- 选人确认（CharacterSelectScene）→ WorldMapScene（不再直入战斗）。
- 关卡入口：现有 CAMPAIGN 四关映射到地图节点，当前进度可点、未解锁置灰（解锁态从存档进度取）；点击进 BattleScene；通关回 WorldMapScene（不是回选人/传送门串行）。原版余下关卡节点若对象树里有坐标，按"未解锁置灰"渲染占位，不造假可点。
- 底部按钮排（保存游戏/商城/炼丹炉/学习技能/活动/任务/返回）：
  - 保存游戏 = 现 SaveSystem 落当前档；
  - 炼丹炉 = 复用现 FurnacePanel（从战斗内对话迁到此入口，材料从存档背包；战斗内老君闲聊保留）；
  - 学习技能 = 置灰占位（S5 未落地）；
  - 商城/活动/任务 = 营运件，按钮位图照摆但置灰，不造内容；
  - 返回 = 主菜单。
- 左右上角补偿礼包宝箱：营运件，位图挖到就摆（不可点），挖不到记缺不造。
- 架构约定：解锁/进度判断写成 Phaser 无关纯逻辑可单测；场景只做渲染/输入壳。Phaser 是 **v4**（先查 v3→v4 迁移差异，渲染管线/tint/FX 有破坏性变更）。

## 交付物（缺一不算完）

1. 代码：WorldMapScene.ts + 接线改动 + 纯逻辑模块 + 单测；本地 commit（拆合理粒度），**不 push**。
2. `tasks/worldmap-report.md`：AS3 挖到的命名协议/帧语义/gating 原文摘录与出处（类名+方法名）、xfl 坐标表、素材来源清单、Adapted/Dropped 决策清单（每条注明依据）、遗留缺口。
3. **overlay 对比图**：xfl 坐标渲染 vs 参照图同分辨率叠加，落 `tmp/worldmap-overlay/`（布局层 diff≈0 才算过；烘焙文字/AA 差异可豁免但要在 report 里点名）。
4. 流程截图三连：选人→地图→点岛进战斗→通关回地图，落 `tmp/worldmap-flow/`。
5. 测试：`npm test` 全绿（基线 401+，新逻辑带测）；`npm run build` 过（tsc --noEmit + vite build）。

## 已知环境事实

- Java：`/opt/homebrew/opt/openjdk/bin/java`（系统 PATH 无 java）；FFDec：`tools/ffdec/ffdec-cli.jar`，headless 必带子命令 + `-Djava.awt.headless=true`（裸跑弹 GUI）。macOS 无 `timeout` 命令。
- 主 SWF：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`；子 SWF：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/`。
- 主 SWF swf2xml 产物 40+MB，按符号/子 SWF 定点取。
- vite dev 用 nohup + 独立端口（5173 常被占，session3 用 5174；再占就换）。浏览器验证可用 playwright（window.__scene 验收钩子已有先例）。
- 调试产物一律落项目内 tmp/（gitignored）。
- 移植协议：发现"奇怪/设计不好"→ report 记疑点、代码保持原样；当场可改仅真 bug 与平台适配（带 Adapted/Dropped 注释）。

## 验收（主会话终审，非自验）

主会话将亲自看 overlay 与流程截图、复跑测试。像素级错位、样式自行发挥、"照截图目测摆"都会被打回。
