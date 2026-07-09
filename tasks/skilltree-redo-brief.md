# 任务书：技能页重做 + 激活语义修正（用户 2026-07-09 拍板）

授权语境：本仓库为用户自有项目（造梦西游3 重制，用户为原游戏团队成员），纯 UI/逻辑修缮。

主文件：`game/src/scenes/SkillTreeScene.ts`（671 行）、`game/src/systems/skillTree.ts`（359 行）、存档迁移处（搜 `createLegacySkillTreeState` 的调用点）。**不要动 BattleScene.ts**（主会话在改）；**不要 git commit**（主会话统一验收提交）。

## 背景（用户三条反馈）

1. 「技能页重新做」——现在是深蓝灰素面板表格，与全游戏水墨×金的视觉基调（CLAUDE.md 总纲 3c，大胆炫技、毛笔书法字体）不符。
2. 「你现在表现的这个升级，其实应该是激活。原游戏里技能升级需要技能书。如果没做技能书，先不要留这个口子」——语义拍板。
3. 「为什么显示我四个技能都激活了？」——根因已查明：`createLegacySkillTreeState()`（skillTree.ts:187）给旧存档迁移时保留了预 S5 演示配置（slz+lys/hytj/lyfb/jdy 五技能全学全绑）。

## 改动要求

### A. 语义修正（先做，逻辑层）
- **撤掉 per-skill 升级口子**：UI 上删除每行的「升级」按钮和「技能升级」列，以及左侧心法卡的任何 per-skill 升级入口。`skillTree.ts` 里 `upgradeSkillLevel`/`getSkillUpgradeCost`/`canUpgradeSkillLevel` 引擎函数**保留不删**（注释标注：休眠，等技能书系统），只断 UI 接线。
- **激活 = learnSkill**：右侧列表每行的主操作改为「激活」（调 `learnSkill`，免费、自动绑键，AS3 buy() 语义）；未解锁槽位显示锁定态灰字（心法等级不足）；已激活的显示「已激活 · 键位 X」。
- **心法升级保留**：左侧心法卡的「升级」（灵魂消耗解锁槽位，SkillControl.as 真源）语义不变，但按钮文案改为「提升心法」以免和撤掉的技能升级混淆。
- **迁移修正**：`createLegacySkillTreeState` 的调用点改用 `createDefaultSkillTreeState`（新语义：旧存档也回到只有升龙斩激活绑 Y）。legacy 函数留库存档注释。注意跑一遍相关测试，有断言旧迁移行为的测试要按新拍板更新。

### B. 视觉重做
- 基调对齐全游戏：墨底（0x0b0a0d 系）+ 暗金描边面板 + 毛笔字体标题（`import { activeArtFont } from '../systems/artFont'`，`fontFamily: activeArtFont().family`）。参考 `game/src/scenes/LoginScene.ts` 的用法。
- 布局保留信息架构（左：两张心法卡；右：技能行=图标/名称/说明/键位/操作；底部：灵魂余额），但行分隔、悬停态、激活态要有明确视觉层级；技能图标已有真源（`SkillBarHud.ts` 用的 Online skill-icons）继续用。
- 右上「返回」保留，改为与全局 MenuButton 风格一致（`game/src/ui/menu/MenuButton.ts` 如可直接用就用）。
- 未激活技能：图标去饱和/压暗 + 锁标记；激活动作给一个简短反馈（金色闪光 tween 或 Toast），别用原生弹窗（全局纪律：禁 confirm/alert）。

### C. 保持的契约
- 场景 key、`__shell*` 验收 hook 名称与行为签名不变（改内部实现可以，删 hook 不行）。
- 从战斗内打开技能页的路径（BattleScene 侧 scene.launch/pause 逻辑）不要动——只动 SkillTreeScene 自身。
- Phaser 4（不是 v3）：渲染/tint API 有差异，拿不准先查 v4 文档；输入只认 mouse 事件。

## 验收判据
- `cd game && npx vitest run` 全绿（含你更新过的迁移测试）。
- 新存档进技能页：只有升龙斩已激活绑 Y；其余显示锁定/可激活，无任何「升级」字样残留（心法卡的「提升心法」除外）。
- 报告落 `tasks/skilltree-redo-report.md`：语义改动清单、迁移影响说明、UI 前后对比描述。主会话会开浏览器终审截图。
