# S5 技能树/学习技能屏 — 派工 brief（session4 第四棒，2026-07-08）

授权背景：本项目是《造梦西游3》团队成员的授权重制（CLAUDE.md「法律风险已澄清」节），FFDec 读取的是团队自有游戏资源。

## 目标

按 `docs/design/screen-fidelity-spec.md` §S5 落地技能树屏，**顺带解决"9 技选 5 上坞"功能缺口**（ui-finish 棒对账点名：4 技能下坞待绑定 UI）。入口 = 世界地图"学习技能"按钮（现为置灰占位，本棒接通）。

规格真源（必读）：
- spec §S5 逐条即验收项；参照图 `docs/reference/user-flow-refs/skilltree-original.png`。
- `docs/playbooks/ui-port-dual-source.md` 全文 + 「S1 棒沉淀的三条补充纪律」；注意归属表：技能 UI 类是 `export.shop.BuySkill/SkillControl/SkillSetControl/PassiveSkillControl`（**不存在 "RoleSkillInterface" 类**），SkillControl 有 191.35/391.35 两态坐标（"必须读 AS3"信号，timeline 抠到的可能是屏外假坐标）。
- 前三棒返修教训：worldmap-report「终审返修」、selectrole-saveslots-report §2 §10、profile-backpack-report 终审补充（版式与参照分歧时先核 vendor 烘焙态再定论，版本分歧 vendor 胜）。

## 双源提取

- **骨（AS3）**：主 SWF 读 `export.shop.BuySkill/SkillControl/SkillSetControl/PassiveSkillControl`：布局两态坐标、技能行结构、按键绑定语义、学习/升级的资源扣减逻辑（灵魂/银两？以 AS3 为准记录，能接 soulPurse 就接，接不上占位记档）。
- **皮**：对应 out_res 子 SWF 对象树 xfl + origin 逐符号算；技能图标 66px 亮版在 `RoleSkillInterfacev3550.swf`（已解，ui-finish 棒用过——先盘点 `game/public/assets/extracted/` 现存件）。
- 版式要点（spec 原文）：顶栏=角色名徽 + "每个角色只能学习5个技能…孟婆药剂"说明 + 返回；左栏=心法一/心法二卡（墨字图腾+当前等级+升级所需灵魂）；右栏=技能表格（技能名称/技能图标/技能说明/按键设置四列，行分隔线）；底部=主动技能/被动技能/BOSS技能页签 + 灵魂计数。

## 逻辑（移植 > 重写）

- kagami `HERO_SKILL_TREES` + SkillBinding（悟空斩系/火系双心法现成）为移植源：`vendor/kagami-phaser`（若目录不在，sparse clone 见 CLAUDE.md，走代理 127.0.0.1:7897）。数值移植前对主 SWF AS3 验一遍（源优先级纪律）。
- **按键设置列 = 绑定 YUIOL**：玩家从 9 技里选 5 个上坞（现 HUD 技能坞 5 槽，默认 slz/lys/hytj/lyfb/jdy 已拍板），绑定后坞上技能真实生效（BattleScene 施放走绑定表）。绑定持久化进存档（save 版本化迁移别破）。
- 心法等级/灵魂消耗：灵魂货币刚由 S4 棒落地（systems/soulPurse.ts，出售白装 +20/件）——学习/升级扣灵魂直接接它；数值以 AS3 为准，AS3 拿不到的记 report。
- 纯逻辑（技能树状态/绑定表/扣费）进 systems 带单测；场景只做渲染壳。

## 接线

- 世界地图"学习技能"按钮 → 本屏（enabled 置 true）；返回 → 世界地图。
- BOSS技能页签若无系统支撑 → 置灰不造内容（同 S4 时装/经书处理）。
- HUD 技能坞读绑定表（改动 BattleScene 处注意与现有默认 5 技兼容：无绑定存档用默认）。

## 交付物（同前棒）

代码+单测（本地 commit，**不 push**）、`tasks/skilltree-report.md`（AS3 摘录+出处、坐标/origin 表、kagami 移植清单+对 AS3 校验结论、Adapted/Dropped、豁免清单）、overlay（`game/tmp/s5-overlay/`，先对几何）、流程截图（地图进入/学习技能/改绑定/回地图/战斗中绑定技能真实施放，`game/tmp/s5-flow/`）、`npm test` 全绿（基线 421+，新逻辑带测）+ `npm run build` 过。

## 环境事实

同前棒（Java 路径/FFDec headless/无 timeout/vite nohup 独立端口/调试产物落 game/tmp/）。移植协议：怪设计记 report 保持原样。

## 验收（主会话终审，非自验）

主会话亲自看 overlay/流程截图、复跑测试、验"绑定的技能在战斗里真的放得出来"。
