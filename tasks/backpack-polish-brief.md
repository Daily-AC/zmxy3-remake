# 任务书：背包/个人资料面板修缮（用户 2026-07-09 打磨反馈）

授权语境：本仓库为用户自有项目（造梦西游3 重制，用户为原团队成员，素材使用无版权障碍，见 CLAUDE.md）。纯 UI 修缮任务。

主文件：`game/src/ui/hud/BackpackWindow.ts`（661 行）。改动只许落在该文件与其直接消费的资源/工具模块；**不要动 BattleScene.ts**（主会话正在改它，会冲突）；**不要 git commit**（沙箱会失败，主会话统一验收后提交）。

用户反馈六点（对照其标注截图，逐条修）：

1. **人物预览（红框）**：左侧聚光灯框里的悟空立绘太小且没对齐框，浮在框左上。要求：立绘按框高等比放大（约框高 85%），水平居中、脚底贴框底部阴影位。
2. **昵称应显示注册用户名（黄框上半）**：当前写死显示「孙悟空」。改为读社交登录会话的用户名：`import { getSharedSocialClient, resolveSocialServerBaseUrl } from '../../net/socialClient'`，参考 `game/src/scenes/LobbyScene.ts` 底部 `runtimeSocialClient()` 的写法拿 client，`client.getSession()?.user.username`；未登录时回落显示角色名（孙悟空）。注意 BackpackWindow 可能拿不到 import.meta env 参数——照 LobbyScene 同款 resolve 即可。
3. **文字垂直居中（黄框整体 + 蓝框）**：昵称/战斗力的值、以及 HP/MP/攻击/防御等所有属性行的值文本，在各自的凹槽底图里目前偏上/偏下。统一改为文本 origin(0.5) 且 y 对准凹槽视觉中线。右侧「灵魂 184」数字同样在其框内水平+垂直居中。
4. **翻页条（绿框）**：「上一页」「下一页」按钮的角上有尖刺状溢出（大概率是 graphics stroke/圆角矩形被缩放或 9-slice 拉伸造成）。修到边角干净。中间「1/1」页码文本在两按钮之间水平居中、与按钮垂直居中。
5. **右侧阴影列（白框）**：打开背包时画面最右有一条竖向阴影带（面板外)。查根因——多半是全屏 dim 遮罩宽度不对、或面板底图右缘的烂边。修掉：遮罩应精确覆盖 960x540，面板外不应有多余可见条带。
6. **武器格与人物持械预览**：装备栏「武器」格当前显示绿色箱子占位图（icon_crafted_equip / fallback）。(a) 若 `game/public/assets/extracted/icons/` 里有更贴切的图标（如 star_blade）按物品 id 映射接上；没有的就保持占位并在报告里列出缺图标的物品 id 清单（主会话负责生图补）。(b) 装备武器后，左侧人物预览要在悟空手位叠加武器视觉——参照 BattleScene 里 `role1_equip0.png` 武器 overlay 的做法（`public/assets/extracted/role1_equip0_alignment_preview.png` 是对位参考），静态取 idle 第一帧对应的 overlay 帧即可。若对位数据只在 BattleScene 内部，可以把常量复制过来用并注明来源，别去改 BattleScene。

验收判据（完成前自己全部跑过）：
- `cd game && npx vitest run` 全绿。
- 用共享 playwright 之外的方式不好截图的话，写一个最小验收说明：列出每条改动前后的坐标/逻辑差异。主会话会亲自开浏览器逐条对照截图终审。
- 报告落 `tasks/backpack-polish-report.md`：逐条「改了什么/根因是什么/怎么验证的」，第 6 条列缺图标物品清单。
