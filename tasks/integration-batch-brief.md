# 任务书：集成批次 — HeroIdentityState + 移植系统接进 BattleScene

## 目标
把已合入 repo 但尚未接线的纯逻辑系统（heroCombat / progression / equipment+effects）真正接进 `game/src/scenes/BattleScene.ts`，让游戏里看得到"悟空会死、杀怪升级、装备生效"。这是把移植成果变可玩的关键一棒。

## 背景（必读文件）
- `game/src/scenes/BattleScene.ts`（839 行，当前唯一场景；你独占本文件和 scenes/、ui/ 的修改权）
- `game/src/systems/heroCombat.ts` — 受伤/死亡/i-frame/复活(1500ms)，已单测
- `game/src/systems/progression.ts` — 等级/经验/成长曲线，已单测
- `game/src/systems/equipment.ts` + `effects.ts` — 穿脱、applyEquipStats、rollOnHitProcs，已单测
- `game/src/systems/heroSim.ts` — 现有物理/连招状态机（注意：它没有 hp/atk/level 概念，别把身份状态塞进它）
- `docs/research/gameplay-anatomy.md` §5（设计语境）

## 实现要求
1. **HeroIdentityState**：在 BattleScene 建统一英雄身份状态宿主（hp/mp/atk/def/level/exp），供三个系统共同挂靠。建议做成纯逻辑模块 `systems/heroIdentity.ts` + 单测，BattleScene 只持有实例。
2. **受伤/死亡接线**：怪命中悟空 → applyHeroDamage → 血条扣血、i-frame 闪烁、死亡倒地、1500ms 复活。
3. **升级接线**：杀怪 → gainExp → 升级时数值成长 + 简单升级反馈（文字/闪光即可，别做大 UI）。
4. **装备闭环（原 combat-slice 阶段A，工作树半成品已丢失，重做）**：
   - applyEquipStats 算出的 atk 进连击伤害
   - 武器视觉：穿武器后悟空手里出现金箍棒（素材 role1_equip0 叠加层，assets/extracted/ 下找，MANIFEST 有索引）
   - onHit procs（吸血/灼烧/冰冻）在命中结算时 rollOnHitProcs
   - 面板/HUD 显示当前 atk
5. 血条等 HUD 先用现有调试 HUD 风格的最简实现，UI 打磨是后面另一棒。

## 约束
- Phaser 4（不是 v3）：渲染/tint/FX API 有破坏性变更，写渲染代码前先查 v4 文档差异。
- 架构：游戏规则进 systems/ 纯逻辑可单测；BattleScene 只做渲染/输入/接线。
- 不动 `systems/` 现有已测模块的对外接口（只加不改）；不动 `net/`。
- 别动 `systems/level.ts`（波次/BOSS 接入是下一棒）。

## 验收判据（全部满足才算完成）
1. `cd game && npx vitest run` 全绿（现有 126 个不许挂，新逻辑带测试）。
2. 浏览器真实验证（`npx vite` 起 dev server + playwright MCP 或 window.__scene 钩子）截图落 `tmp/debug-shots/`：
   - 悟空被怪打死 → 倒地 → 复活，血条真实变化
   - 杀怪 exp 涨、升级发生
   - 穿武器 → 悟空手里出现金箍棒 → 打怪伤害数字变高
3. 完成后写 `tasks/integration-batch-report.md`：做了什么、参数出处（kagami 文档值 vs 自定 TODO-verify）、遗留问题。

## 提交
完成并自测通过后 commit（不 push），commit message 英文。
