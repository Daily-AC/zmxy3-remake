# S4 个人资料/背包面板 — 派工 brief（session4 第三棒，2026-07-08）

授权背景：本项目是《造梦西游3》团队成员的授权重制（CLAUDE.md「法律风险已澄清」节），FFDec 读取的是团队自有游戏资源。

## 目标

按 `docs/design/screen-fidelity-spec.md` §S4 重做个人资料/背包大窗版式。现有 `BackpackWindow` 结构近似但版式差远——照参照图 `docs/reference/user-flow-refs/profile-backpack-original.png` 重做，穿脱/出售功能回归不许破。

规格真源（必读）：
- spec §S4 逐条即验收项；样式判断以 spec + 参照图为准，不得自行发挥。
- `docs/playbooks/ui-port-dual-source.md` 全文 + 文末「S1 棒沉淀的三条补充纪律」（origin 必算 / contain-fit 禁裁 / overlay 先对几何）。
- 前两棒 report 的返修节引以为鉴：`tasks/worldmap-report.md`「终审返修」、`tasks/selectrole-saveslots-report.md` §10；带 filter 符号 analytic origin 会差 ~170px，互相关兜底（§2 坑）。

## 双源提取

- **骨（AS3，必读）**：主 SWF `打开我开始玩.swf` 读 BackPack 相关类。已知"必须读 AS3"点（playbook 归属表）：**BackPackElement 5×5 格是运行时 `x=col*(w+11) y=row*(h+9)` 现算**（对象树只有空容器，照坐标摆必错）；数字拼接/页码逻辑；战斗力如有原版公式抄原版，没有则 atk/def/hp 简单合成并 report 注明自定（spec 允许）。
- **皮（对象树）**：`out_res/backpack1.swf`（`export.strength.*` 已提取部分，先盘点 `game/public/assets/extracted/` 现存件）+ BackPack 符号族 xfl 矩阵；每个符号 origin 逐个算（可复用 tools/worldmap-deco-origins.py / tools/selectrole-origins.py 改目标）。
- 版式要点（spec 原文）：墨迹大窗"个人资料"；左栏=昵称/战斗力条、等级翼徽、立绘+左右装备槽（武器/头/衣/饰件）、十项属性表（HP/MP/攻击/防御/幸运/魔抗/暴击/闪避/回血/回蓝，双列金框条）、底部 EXP 长条；右栏=装备/道具/时装/经书四页签 + 5×5 图标格 + 灵魂计数 + 出售白装 + 页码 1/2。
- 无对应系统的页签（时装/经书）做置灰页签**不造内容**；灵魂货币没有→占位并 report 注明。

## 接线

- 现有 BackpackWindow 的打开入口/快捷键保持；穿脱装备、出售逻辑复用现有 systems（equipment/inventory），只动渲染层；纯逻辑新增（如战斗力合成）进 systems 带单测。
- 战斗 HUD 不在本棒范围，别碰 RoleInfo。

## 交付物（同前两棒）

代码+单测（本地 commit，**不 push**）、`tasks/profile-backpack-report.md`（AS3 摘录+出处、坐标/origin 表、素材清单、Adapted/Dropped、豁免清单）、overlay 对比图（`game/tmp/s4-overlay/`，先按 playbook 纪律 3 对几何）、流程截图（打开面板/穿脱/出售/翻页，`game/tmp/s4-flow/`）、`npm test` 全绿（基线 413+，新逻辑带测）+ `npm run build` 过。

## 环境事实

Java `/opt/homebrew/opt/openjdk/bin/java`；FFDec `tools/ffdec/ffdec-cli.jar` headless 必带子命令+`-Djava.awt.headless=true`；macOS 无 timeout；vite nohup+独立端口；调试产物只落 `game/tmp/`；移植协议：怪设计记 report 保持原样。

## 验收（主会话终审，非自验）

主会话亲自看 overlay/流程截图、复跑测试；像素级错位、样式自行发挥、网格照对象树摆（不读 AS3 公式）会被打回。
