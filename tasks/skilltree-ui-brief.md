# skilltree-ui 棒：技能树屏视觉重做（用户 2026-07-08 打回）

## 授权语境

本项目用户系造梦西游团队成员，素材使用无版权障碍（项目 CLAUDE.md「法律风险已澄清」节）。素材来源均为项目内已归档的提取产物与 vendor 资源。

## 背景

S5 技能树棒逻辑层过审（skillTree.ts 移植质量高），视觉层曾返修一次后勉强过，本次被用户整体打回（"一言难尽"）。用户拍板范围：**先做主动技能页**——被动页签维持现状占位（"本作暂无系统支持"文本）、BOSS 页签维持置灰（AS3 无对应，S5 考古结论），本棒只把主动技能页做到无感。

参照图：`docs/reference/user-flow-refs/skilltree-original.png`（原版实机）；我方现状：`docs/reference/user-flow-refs/skilltree-ours-feedback-0708.png`。逻辑/考古档案：tasks/skilltree-report.md。

## 主会话亲判读差距清单（逐项闭环，闭不了的给证据）

1. **技能图标灰白无彩**（最扎眼）：原版图标是彩色红底火焰系彩图；我方全灰白。高度怀疑与 S2 选人屏同款坑——**带 ColorMatrixFilter 的符号被 FFDec 按 up 态导成灰图**（S2 经验：原版灰度=运行时 filter，非灰图烘焙，见 tasks/selectrole-saveslots-report.md §2）。重导真彩图标。若考古证实原版"未学习=灰/已学=彩"是运行时状态，则实现状态切换，静态导出必须是彩色原图。
2. **自加「技能升级」列**：原版表格只有 技能名称/技能图标/技能说明/按键设置 四列；升级入口在左侧心法卡（「升级」钮 + 当前等级 + 升级所需灵魂）。我方多出的第五列是自造。对 AS3（BuySkill/SkillSetControl）验证升级与学习的真实交互入口后，照原版结构重排；学习新技能的入口同样以 AS3 为准。
3. **左上角色名**：原版是「悟空」橙黄描边艺术字牌（位图件）；我方是白色系统字"孙悟空"。挖原件。
4. **顶部提示行**：原版"每个角色只能学习5个技能，学错技能可以到商城购买[孟婆药剂图标]孟婆药剂来遗忘技能"——图标内嵌文字中间。我方纯文字。商城本作没有，提示文案是否照抄由你对照移植协议判断（照抄=无感，但指向不存在的商城；两案都写进 report，默认照抄原文，主会话终审裁）。
5. **表头/页签文字**：原版是烘焙位图艺术字；我方白色系统字。位图优先；确实无件的文字层用 verdict-fixes 棒正在引入的情景艺术字体（协调：字体文件会落 game/public/assets/fonts/，如它还没交付你先用占位并在 report 标注依赖）。
6. **底部页签排布**：原版 主动技能/被动技能/BOSS技能 三个白色大字等距并排；我方间距样式不齐。照对象树坐标。
7. **心法卡排版**：原版「当前等级：5」「升级所需灵魂：0」标签与数值的对位、升级钮样式，逐项对齐。
8. **右下灵魂计数**：原版墨牌+白色大数字；我方多了斜线装饰。对照原件修正。

## 铁律

- 双源管线 `docs/playbooks/ui-port-dual-source.md` 全文执行：皮=timeline xfl 精确矩阵，骨=主 SWF AS3（BuySkill/SkillSetControl 等，S5 report 有类名索引）；origin 必算（tools/worldmap-deco-origins.py 可复用，带 filter 符号注意 padding 坑，互相关兜底）。
- 原版位图优先，零手调、禁目测；类代码只认主 SWF `打开我开始玩.swf`；子 SWF 用 out_res/ 解密版。
- 逻辑层（skillTree.ts/heroSkill.ts/绑定/存档迁移）不许动——本棒纯视觉层。发现逻辑疑点落 report。
- 用户定调：好事慢磨，做慢没关系，不许糊弄。

## 验收判据

1. 与 skilltree-original.png 同分辨率配准 overlay，主动技能页结构层（表格框架/列位/心法卡/页签/角色名牌）像素 diff 无双影错位；动态内容（等级数字/灵魂数/已学状态）逐项豁免记档。
2. 技能图标彩色截图证据。
3. `npm test` 全绿 + build 过 + tsc 净；技能学习/升级/绑键功能回归（现有测试 + 浏览器实测截图）。
4. report 落 `tasks/skilltree-ui-report.md`：差距清单八项逐项闭环状态、素材来源、AS3 考古补充、疑点。

## 工程事实

- dev server：`game/` 下 `nohup npx vite --port 5203 &`（5201/5202 被其他棒占用）。
- playwright 自开独立 tab/context；page.evaluate 传函数。
- FFDec 在 vendor/zmxy_res/ffdec/，headless 坑单见 docs/playbooks/level-port-playbook.md。
- commit 只 add 自己的文件（SkillTreeScene.ts + 新增素材 + 本 report），不 push。BattleScene/ui/、CharacterSelectScene/MainMenuScene/WorldMapScene 有其他棒在动，禁碰。
