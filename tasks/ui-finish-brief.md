# 任务书：UI 收尾三件套（YUIOL 热键 / 炼丹炉面板换装 / Boss 结算横幅）

派单：主会话 session3（Fable），2026-07-07 20:10。执行：opus。
Report 落 `tasks/ui-finish-report.md`，commit 只 add 自己的文件、**不 push**。

## 背景

UI 换装大棒（015602d）已把战斗 HUD 换成真组件，用户验收时留了三件非阻塞小事（progress.md session2→session3 交接段"UI 换装的诚实遗留"）。你是 BattleScene 唯一持笔人，三件事串行做完。

## 三件事（按序）

### 1. 技能坞热键 YUIOL 化（显示 + 真实键位绑定，是功能变更不只是贴图）

- 现状：SkillBarHud 9 格显示热键 1-9，键位也绑 1-9。原版造3 用 YUIOL 系热键（Online 提取素材里有 YUIOL 热键件：`docs/reference/zmxy-online-extracted/`）。
- 要求：键位映射与坞上显示一起换成原版方案。9 个主动技 vs 原版热键数量如何对应，以真源为准去查：kagami `SkillUISystem`（371 行布局，vendor/kagami-phaser）+ Online 实机截图 `docs/reference/zmxy-online-screens/` + 提取素材。若原版热键少于 9 格（如技能页切换/部分技能不上坞），照原版结构做，别为塞满 9 格发明键位；定不了的疑点落 report，不即兴。
- 兼容：存档/`__inject` 验收钩子若引用数字键，需同步改并保证 acceptance 28 步脚本仍能跑。

### 2. FurnacePanel：水墨对话框 → 原版八卦炉窗体

- 现状：炼宝流程走通用水墨对话框 overlay。官方炼丹炉 UI 素材已挖到：`docs/reference/zmxy3-official/`（官方强化面板"打造"页 =「炼丹炉」+ 合成配方图：主装备+副装备+神火+神铁→生成物+所需灵魂）。
- 要求：做独立 FurnacePanel 组件，视觉照官方八卦炉/打造窗体复刻（窗框、投料格布局、按钮语言）。**功能流程不改**（材料选择→预算→craft 协议→结果入包，net/协议一律不动），只换呈现层。老君对话（闲聊/任务）仍走现有对话框，只有炼宝进面板。

### 3. ResultBanner 接线：boss 死 → 结算横幅 → 传送门

- 现状：meta-shell 已交付 ResultBanner 组件（6dc6f9f），素材有 Online 提取的挑战成功/失败横幅（zmxy-online-extracted/），但从没接进 BattleScene——boss 死直接开传送门，无结算。
- 要求：boss 死亡→播结算横幅（关名/评价/掉落摘要按组件已有能力，别加新功能）→确认/超时后再显传送门。英雄死亡是否播失败横幅：看组件是否现成支持，现成就接，不现成落 report 不做。

## 纪律（红线）

- **文件独占**：`game/src/scenes/BattleScene.ts` + `game/src/ui/**` + 必要的输入映射文件。systems/、net/、agent-server/ 一律不动。
- 数值/协议零改动；这是纯呈现 + 键位棒。
- 每件做完跑 `npx vitest run` + `npx tsc --noEmit`，全绿才进下一件；基线 387。
- vite dev 用 nohup 起（run_in_background 会被环境杀 exit144）；playwright 验收用独立 context/tab（多 agent 共享浏览器互踩有前科）。
- **视觉验收标准（用户定死）**：每件产出与原版/Online 实机的并排对比截图，落 `tmp/debug-shots/ui-finish-*.png`，report 里列清单。主会话不代打视觉分，最终由用户点头；你的责任是让对比图信息足够用户一眼判断。
- 素材缺口处理：先穷尽挖（zmxy-online-extracted / zmxy3-official / vendor out_res / vendor/canonical-hunt/official_4399/batch 随需 FFDec 解，解密参数与坑见 CLAUDE.md），"没有"须附证据（搜过哪些包、关键词）再借水墨语言自绘。
- FFDec 一律 headless CLI（裸跑弹 GUI 有事故记录，见 level-port-playbook）。

## 完成判据

三件各自：tsc 干净 + 387+ 全绿 + 浏览器真机截图（对比图）+ 各自独立 commit（feat/fix 前缀，只含自己文件）。report 写清：改了什么、对比图清单、疑点/未做及原因。
