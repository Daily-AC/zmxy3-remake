# "真正复刻"技术判决 — Ruffle 注入线 vs Phaser 重制线（外部 Fable 会话分析，2026-07-08 用户转达）

来源：用户另开的技术选型会话（Fable 主持），2026-07-08 01:05 结论原文压缩落盘。供后续会话当决策依据，未经本仓验证的点已标注。

## 核心判决

- "真正复刻"的严格定义 = 原版 AS3 字节码在正确运行时里执行。任何重实现（Phaser/OpenFL）都是渐近线：误差可无限缩小但成本无上界，且每步需人肉验收。
- 满足严格定义且已验证的技术 = **Ruffle**（docs/research/ruffle-reference.md：桌面版 0.3.0 主菜单→巫鹰 boss 全程跑通，用户亲玩判"手感很对"——全项目唯一手感验收零保留通过）。
- 完全体形态（赛后向）：Tauri/Electron 壳 → Ruffle 跑原版解密 SWF → 定点注入薄桥（companion SWF 或几处方法补丁，FFDec 支持编辑单方法体存回；游戏自身架构就是 Loader 动态加载子 SWF）→ URLLoader/ExternalInterface 桥到现有 agent-server。
- 旧否决"解包魔改"三理由的翻案：①"无源码"不成立（另一会话已全量反编译 446 类 AS3）；②"补丁地狱"针对全量重编译，定点注入不需要；③桥接通道现成（URLLoader 是游戏重度使用且 Ruffle 实证支持的 API）。
- **两线定位**：Phaser 线 = "现代重制"，价值在黑客松叙事 + agent NPC 飞轮，不背"和童年一模一样"判据；Ruffle 注入线 = "真正复刻童年"，适合赛后主线或 demo 里的怀旧模式彩蛋。**复刻靠模拟器，创新靠重制，别让一条线背两个判据。**

## 未验证疑点（三个，均可低成本 smoke）

1. Ruffle WASM 在真实 WebView2 里是否渲染（headless 画布白屏未定论；兜底 = ruffle_core Rust 库自做原生壳）。
2. FFDec 定点改过的 SWF，Ruffle 是否照跑（预期没问题，需一发 smoke 证据）。
3. hook 点（对话触发/发物品/事件广播）定位成本，调用链深浅未摸。

## 本仓当前执行口径

黑客松期内（~07-09）主线仍是 Phaser 重制 + screen-fidelity-spec 屏幕队列（用户 2026-07-08 01:25 明确：接自研 agent NPC 所以重构不可免，"不要换一锅粥"）。本判决不改变当前主线，只界定 Phaser 线的验收判据 = spec + overlay diff（结构/版式保真），不是"逐帧等同原版"；Ruffle 注入线为赛后备案。
