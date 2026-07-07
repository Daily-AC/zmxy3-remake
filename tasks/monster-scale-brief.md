# 任务书：怪物体型归一修复

派单：主会话 session3（Fable），2026-07-07 22:5x。执行：sonnet。
Report 落 `tasks/monster-scale-report.md`，commit 只 add 自己的文件、**不 push**。

## 背景（根因已定位，见 tasks/ui-finish-report.md 乌龟核查节）

`BattleScene.ts:937` 附近怪物 scale = `1.5 * (200 / cellH)`——按 spritesheet 格高归一。但各 species 轮廓在格内的填充率不同（英雄填 200 格的 50%，Monster7 填 150 格的 67%），归一后 Monster7 实际比英雄高 35%、Monster8 高 25%。用户实机截图里乌龟怪 ~1.5×英雄，与原版"怪物与英雄大致同高"不符。

## 修复原则（先按这个原则做，站不住再报）

原版 Flash 里英雄与怪物在**同一像素坐标系**，SWF 原生尺寸已经编码了正确的相对比例——大 boss 天生大、小怪天生小。所以根修不是"每 species 手调因子"，而是**全体用同一个 px→world 缩放系数**（与英雄相同），删掉 per-cell 归一。这样比例自动保真，包括 boss 的大。

验证此原则：抽 2~3 个 species 对原版参照（docs/reference/zmxy-online-screens/ 实机图、vendor SWF 帧原始尺寸）核对相对身高。若发现某些 sheet 导出密度不一致（不同 dpi/缩放导出），如实报告并对那些 sheet 单独记修正因子（带来源注释），不要全局回退到手调。

## 范围与红线

- 改动点：BattleScene.ts 的怪物 sprite scale 逻辑（现在没人持笔，你独占）；若 species 数据需要加字段，可动 game/src/data/ 相应文件。
- 不动：systems/、ui/、net/、关卡波次数据数值。
- 判据：①浏览器实测 L1 全部小怪（含乌龟）与英雄身高相当（±15%，以轮廓非格子计）；②巫鹰 boss 相对身高与其 SWF 原生比例一致（boss 可以大，但大得有出处）；③命中判定/血条挂点/落地贴地不因缩放改变而错位（实测跳打一轮）；④tsc 干净 + vitest 全绿（基线 401）。
- 截图证据：修复前后同机位对比 + 与原版参照并排，落 tmp/debug-shots/monster-scale-*.png。
- vite dev 用 nohup 起、独立端口/独立 playwright（共享浏览器互踩有前科）。

## 完成判据

判据①~④全过 + 对比截图 + report（原则验证过程、每 species 结论表、遗留疑点）。
