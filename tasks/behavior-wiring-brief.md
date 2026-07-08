# behavior-wiring 棒：L1/L2 行为层接线（2026-07-09 00:3x，差距账本 C 层）

## 授权语境

用户系造梦西游团队成员，素材使用无版权障碍（CLAUDE.md 法律节）。本任务为已有纯逻辑库的接线+数值修正。

## 背景

monsterBehaviors.ts（Monster3/7/13 数据驱动行为库，cb190c6 交付）在 BattleScene **零引用**——所有怪走近战回落：远程怪不吐弹幕、巫鹰没有专属行为，老玩家打 L1 boss 立刻穿帮。verticalFollow（monsterSim Y 轴跟随，ba09134）同样未接线——攀爬段怪物追不上爬高的英雄。范围已收缩 L1+L2。

## 任务

1. **巫鹰（Monster3）数值改回原版**：行为库里 hp=926 是 kagami 二手值，原版 AS3 巫鹰=300（tasks/audit-numbers-report.md 已证）；本棒改回 300，并把 monster3 其余字段对 audit report 逐项核一遍（audit 只点名了 hp，其余字段有分歧就以 AS3 为准改，无分歧不动）。改动带对照注释（原值/出处）。
2. **行为库接线**：先核 L1/L2 真实 roster（levels 数据）——roster 内有行为库定义的怪逐个接进 BattleScene 战斗循环（预期至少：L1 巫鹰 Monster3 的 hit2 判定攻击；Monster13 若在 L2 表内则接真弹道 EnemyMoveBullet）。roster 外的行为定义（如 Monster7 若只在 L3+）不接、report 记明。弹道需要弹体视觉：优先用已提取素材（asset 库/怪物 sheet 内的弹体帧），实在无件用简洁程序化弹体（与画风协调的墨点/光球）并标注 Adapted 待生图轮替换——别为个弹体开生图链路。
3. **verticalFollow 接线**：BattleScene 里 L1 攀爬段（isClimbing 语义）给 Monster30 开 verticalFollow（API 见 tasks/verdict-fixes-report.md §monsterSim 接线摘要：config.verticalFollow + input.heroY），speed=7 占位值在浏览器实测里粗校（追得上但不瞬移贴脸），标 TODO-verify 留用户手感轮终校。
4. 命中判定新机制（d098e5d）与行为库攻击的关系：行为库的 hit2/弹道攻击各自有真实判定语义（AS3 为准），别把近战 attack-hit 帧逻辑硬套到弹道上——弹道命中=弹体到达，考 AS3 或按弹体碰撞实现，report 说清语义出处。

## 铁律

- 数值/行为以原版 AS3 为真源，kagami 二手（CLAUDE.md 源优先级节）；移植协议：疑点落 report 不改，真 bug/平台适配可当场改带注释。
- 逻辑改动全部带单测；BattleScene 只做消费接线。
- 好事慢磨不糊弄：接了哪些怪、没接哪些、为什么，逐个列清。

## 验收判据

1. 单测：monster3 数值回归断言（300+出处）、行为库接线的事件流断言、verticalFollow 开启分支。
2. 浏览器实测截图：①L1 巫鹰战使用专属行为（非普通近战回落）；②弹道怪吐真实弹体且命中掉血/躲开不掉（若 L2 表内有）；③攀爬段 Monster30 跟随爬升。
3. `npx vitest run --root game` 474+ 全绿、tsc 净、build 过；L1/L2 全通关回归（__shell 钩子驱动）。
4. report 落 tasks/behavior-wiring-report.md。

## 工程事实

- BattleScene 笔现在归你（battle-fidelity 已收工）；可动：BattleScene.ts、systems/monsterBehaviors.ts、monsterSim.ts（注意保住 d098e5d 的 attack-hit 机制与 ba09134 的 verticalFollow）、tests。禁碰：heroSim/combo/heroSkill、scenes 其他文件、ui/。
- dev server 独立端口 5205；playwright 独立 tab；commit 每落一个发消息汇报（不许静默）；不 push。
