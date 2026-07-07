# 任务书（续单）：UI 第二轮 — 原版真组件化（不接线）

## 目标
把战斗内 UI 从调试风格升级为原版素材真组件。你只做**独立组件 + 演示页**，BattleScene 接线在串行笔队列里由接线棒换装（你的 report 给接口）。

## 素材（session1 已提取，先看 MANIFEST）
`game/public/assets/extracted/ui/` + MANIFEST：RoleInfo 完整战斗 HUD、BackPack 背包窗、水墨文字条、黄色描边按钮。缺件可照 asset-pipeline-notes.md 方法回 SWF 补挖（你挖 SelectRole 的手法）。

## 实现范围（全部新文件，落 `game/src/ui/hud/`）
1. **RoleInfoHud**：原版血条/蓝条/经验条/头像/等级布局，数据入口对齐 heroIdentity（hp/mp/maxHp/maxMp/level/exp/expToNext/atk/武器名）。MP 条要留（heroSkill/mp.ts 已在库，接线后立刻要用）。
2. **MonsterHpBar**：怪物头顶小血条 + Boss 大血条（顶部横条 + label，对齐 level.ts BossSpec.label）。
3. **BackpackWindow**：原版 BackPack 素材窗体，格子化（对齐 inventory 24 格 + 物品 icon 21 枚已入库）、hover 名称/品质色（原版用文字颜色区分稀有度，无边框素材——沿用该语言）。
4. **Toast/飘字样式**：拾取/升级/炼成提示条（水墨文字条素材）+ 伤害飘字样式规格（普通白/暴击大号/治疗绿，给出参数表即可，渲染仍由接线方）。
5. **演示页**：tools/ui-preview.html 或独立 Phaser mini-scene（不动 game/src/scenes/ 现有文件；可加 tools/ 下独立入口），逐组件展示真实素材渲染 + 假数据驱动，截图落 tmp/debug-shots/。

## 纪律
- 只新增 `game/src/ui/hud/`、tools/ 演示入口、tasks/ui-round2-report.md；绝不动 scenes/、ui/ 现有文件、systems/、net/。Phaser 4 API。
- commit 只 add 自己文件，不 git add -A，遇 index.lock 重试，不 push。

## 验收判据
1. 演示页截图：四类组件用原版素材真实渲染、假数据变化正确（血条会动、背包有物品、Boss 条有名字）。
2. vitest 全绿（纯逻辑部分如品质色映射带小测试）。
3. report：每组件的数据接口（TypeScript 签名）+ 接线换装步骤清单。