# backpack-toast 棒：背包窗从0到1重做 + Toast 背景真源替换（用户 2026-07-08 17:4x 打回）

## 授权语境

本项目用户系造梦西游团队成员，素材使用无版权障碍（项目 CLAUDE.md「法律风险已澄清」节）。素材来源均为项目内归档提取产物与 vendor 资源。

## 边界

独占：`game/src/ui/hud/BackpackWindow.ts`、`game/src/ui/hud/Toast.ts` + 相关新素材。禁碰：BattleScene.ts、RoleInfoHud.ts、SkillBarHud.ts（battle-fidelity 棒）、SkillTreeScene.ts（skilltree-ui 棒）、CharacterSelectScene/MainMenuScene/WorldMapScene（verdict-fixes 棒）。dev server 独立端口 5204。

## 任务 1：战斗内背包窗（B 键 BackpackWindow）从0到1重做

用户打回原话：「背包打开后武器栏那边渲染了一只悟空，整体的组件和文本布局也有很多问题，要居中都居中而不是一个居中一个居左」。用户拍板方法论：与其修补不如从0到1。

主会话已定位的具体问题：
- `BackpackWindow.ts:155` `PORTRAIT_TEX = 'role1_0'`——把角色 sheet 的生帧（200×200 裁切格）直接塞进装备区当立绘，观感是"武器栏里蹲了一只悟空"。对照原版 BackPack 对象树：原版装备区有没有角色立绘/纸娃娃区？有→用原版件照抄坐标；没有→删掉这个自加元素。
- 文本对齐混乱（居中/居左不一）。重做时**文本层不豁免**：每个文本元素的对齐方式、字号、颜色照对象树/AS3（BackPack.as/BackPackElement.as/PackThings.as，S4 考古档案 tasks/profile-backpack-report.md 有类名与网格公式 x=col*(w+11), y=row*(h+9)）。
- S4 遗留：armor/accessory/talisman 槽恒空（slotForItem Stage A 限制）、装备图标 fallback。fallback 图标不许再用任何角色帧；无图标物品用原版通用件或诚实的空槽样式。

方法：视觉层推倒重写，双源管线（docs/playbooks/ui-port-dual-source.md）——对象树 xfl 取坐标，AS3 取动态布局公式，out_res/ 解密子 SWF 取位图。参照图 docs/reference/user-flow-refs/profile-backpack-original.png。逻辑层（inventory/equipment systems）零改动。

## 任务 2：Toast 背景换真源干净件

主会话已定性：`game/public/assets/extracted/ui/dialogue_textpanel_crop.png`（Toast 的 hud_ink_band 贴图，注册在 ui/hud/hudTheme.ts:50）**是从原版过场截图上硬裁的一条**——烘焙着台词"太上老君，滚出来……"和左右两侧人物碎片（用户看到的"杂乱悟空"）。这是历史遗留的糊弄件，处置：
1. 从 SWF 挖干净的水墨文字条原件（对话/公告用的 ink band 符号，无烘焙文字），替换该贴图；hudTheme.ts 的 frame 裁切参数（BRUSH_TOP/BRUSH_BOT）按新件重算。
2. 挖不到独立干净件→用同一符号的空帧或程序化重建（纯黑水墨渐变条，与 DialogueBox 风格统一），report 里给挖掘证据。
3. 顺手核查 DialogueBox.ts 是否也引用这张脏图（同一 UI 目录下），是则一并换。

## 验收判据

1. 背包窗与参照图 overlay 配准：结构层无双影，文本层对齐方式逐项与原版一致（不豁免）。
2. 装备区无角色生帧；toast 弹出截图干净无人物残影。
3. npm test 全绿 + build 过 + tsc 净；B 键开关背包、穿脱装备回归实测截图。
4. report 落 tasks/backpack-toast-report.md：素材来源逐项、删掉的自加元素清单、疑点。

## 工程事实

- playwright 自开独立 tab/context；page.evaluate 传函数。FFDec 在 vendor/zmxy_res/ffdec/。
- commit 只 add 自己的文件、不 push。用户定调：慢磨可以，糊弄不行。
