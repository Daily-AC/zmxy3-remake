# 任务书（续单）：英雄原版数值口径移植 — 让 L2~L4 打得动

## 背景（level-pipeline 发现的平衡断层）
关卡包 L2~L4 的怪物血量是 SWF 原值（多闻天王 16000、二郎神 45137、邪·悟空 54423），而当前英雄侧是 level.ts 第 1 关自造的小数值口径（怪 90~400 血、英雄攻击 10~60）。两套口径混用 = 新关卡打不动。方向拍板：**全项目统一到原版口径**（关卡数值已是原值不动，英雄侧升级），这符合"无感复刻"总判据。

## 目标
从 kagami 源码 + 原版主逻辑 SWF 恢复英雄的原版伤害口径，产出纯逻辑 + 换装表，供 BattleScene 接线棒一次换到位。

## 实现范围
1. **普攻伤害公式（核心）**：kagami Role1BasicSkillSystem/相关源码里 hit1~hit5 连击的原版伤害公式（power/等级/武器 atk 如何进公式、每段倍率/固定值），逐字搬 + 出处行号。heroSkill.ts 里技能伤害表已是原版口径，可交叉验证量级一致性。
2. **英雄承伤口径**：怪物攻击（如二郎神 hit4 power 345、多闻天王 hit1 186）打到英雄的减伤/防御公式原版是什么（BaseRoleProperies/kagami 对应处），确认 heroCombat 现口径是否兼容，不兼容给换算。
3. **装备 atk 口径**：炼丹炉预算模型（furnace.ts MATERIAL_POINTS→atk cap 50）是自造口径，给出到原版口径的建议缩放系数（只给建议值+理由，furnace 改动由我拍板，你不动它）。
4. **可赢性核算表**：L1~L4 每关"预期通关等级 + 该等级英雄 DPS（普攻/技能） vs 波次总血量/Boss 血量 + 预计击杀秒数"，证明换装后每关在合理等级可通，写进 report。二郎神 heal-block 机制（30s 禁回血）对可赢性的影响单独评估。
5. 产出形态：`systems/` 新文件或对 combo/heroIdentity 的**建议 diff**（写在 report，不直接改共享文件——combo.ts/heroIdentity.ts 是别人在依赖的活文件，你只加新文件如 heroScale.ts + 单测）。

## 纪律
只加新文件（heroScale.ts + 测试 + report 追加/新报告）；绝不改 combo.ts/heroIdentity.ts/furnace.ts/level.ts/scenes/。commit 只 add 自己文件，不 push。

## 验收判据
1. vitest 全绿；公式测试对 kagami 原值逐点校验（至少 3 个等级 × hit1~hit5）。
2. 可赢性核算表数字自洽（等级→DPS→击杀秒数可复算）。
3. tasks/hero-scale-report.md：公式出处表 + 换装接口 + furnace 缩放建议。