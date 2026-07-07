# Report：UI 收尾三件套（YUIOL / 炼丹炉 / 结算横幅）

执行：opus，2026-07-07。三件各自独立 commit（未 push）。全程 tsc 干净、测试全绿。
派单：`tasks/ui-finish-brief.md`。

## 成果一览

| 件 | commit | 改动文件 | 状态 |
|---|---|---|---|
| ① 技能坞 YUIOL | `f80bbbf` | `BattleScene.ts` | 完成，功能+显示都换，实机验证 |
| ② 炼丹炉窗体 | `3fddb28` | `BattleScene.ts` `DialogueBox.ts` `ui/hud/FurnacePanel.ts` `ui/hud/hudTheme.ts` `assets/.../furnace_frame.png` | 完成，实机验证 |
| ③ 结算横幅接线 | `758b2f5` | `BattleScene.ts` | 完成（成功横幅），失败横幅按判据不做（见下） |

对比截图（`tmp/debug-shots/`，未进 git，供用户点视觉分）：
- `ui-finish-1-skilldock-COMPARE.png` —— 我们的坞 vs Online 实机 battle-hud 的 YUIOL 坞
- `ui-finish-2-furnace-COMPARE.png` —— 我们的炼丹炉窗 vs 官方 panel-header-炼丹炉 + furnace_making
- `ui-finish-2-furnace-selected.png` —— 择材后投料槽填充 + 炉火预算实时计算
- `ui-finish-3-banner-COMPARE.png` —— 我们的挑战成功横幅 vs Online 原版 challenge-success 素材
- `ui-finish-3-portal.png` —— 关横幅后传送门出现

---

## ① 技能坞热键 YUIOL 化

**关键判断：原版是 5 格坞，不是 9 格改标签。** 双真源一致：
- Online 实机截图 `docs/reference/zmxy-online-screens/battle-hud.png`：底部"无双"大招图标后**正好 5 格，热键从左到右 Y U I O L**。
- kagami `SkillUISystem.ts`：`SkillSlotKeyLabels.p1` 与 `P1_BINDING_ORDER = ['Y','U','I','O','L']`，玩家1 技能槽就是 5 个。

**做法**：`SKILL_KEYS` 从 9 项（ONE..NINE）缩为 5 项（Y U I O L），键位映射与坞显示一起换。默认坞放 5 个基本技能 `slz/lys/hytj/lyfb/jdy`（`heroSkill.ts` Role1SkillId 前 5 个，最不武断的默认）。

**疑点/取舍（按 brief "别为塞满发明键位"）**：我们有 9 个主动技，原版坞只放 5 个。超出的 4 个（`qsez/zz/hmz/hyjj`）**下坞**——原版靠技能绑定 UI（技能树里选哪 5 个上坞）解决，我们还没那套 UI（属未来技能树功能）。这 4 个技能仍存在、仍可通过 `__castSkill` 释放（验收脚本靠它），只是暂无热键。**没有为它们发明 6-9 或别的键**——那会是原版没有的方案。**待用户拍板**：默认坞这 5 个是否合适，或要不要先做个简易绑定切换。

**键位冲突处理**：U 键原先绑"卸装备"（dev 快捷键，甚至没进屏幕提示行），让位给技能；卸装备保留 `__unequip` 钩子（测试用），装备走 E / 背包。

**验证**：实机按物理 Y 键 → slz 释放（MP 50→16）；按 U 键 → lys 释放（MP 50→22）；I/O/L 走同一 `kb.on('keydown-'+code)` 循环，绑定同理成立。acceptance 步骤 12 用 `__castSkill('slz')` 按 skillId 不按数字键，不受影响。

## ② 炼宝 → 原版炼丹炉窗体

**现状纠正**：`FurnacePanel.ts` 组件早已存在（包了官方 `furnace_making` 投料布局），但**没接进流程**——炼宝实际走 `DialogueBox` 的水墨 craft overlay。缺口是：①缺外层炼丹炉窗框；②没接线。

**做法（呈现层换装，协议零改动）**：
- `FurnacePanel` 重写为完整炼丹炉窗口：官方 `furnace_frame`（`StrengthEquipmentv1090.swf` 的"打造"页抬头，烘焙着"炼丹炉"三字）作外框 + `furnace_making`（`export.strength.Making` 投料布局：制作书/基本材料×2/宝石×3→生成物/打造）作内容 + 右栏材料选择器 + 心愿输入 + 实时炉火预算。
- `BattleScene` 把炼宝从 `dialogue.openCraft(...)` 改为 `furnacePanel.open(...)`；**craft 协议一字未动**（`lockMaterials`/`buildCraftRequest`/`craftRequest`/`validateCraftedEquipment`/`addItem` 全原样，net 层没碰）。老君闲聊/任务仍走对话框，只有炼宝进面板。
- `DialogueBox` 瘦身为纯聊天（删掉已死的水墨 craft overlay：chips/预算/submit/craftMode 全移除），保留"炼宝 ✦"入口按钮。避免留两套 craft UI 埋雷。

**心愿输入是我们的 agent 增量**：原版"打造"是确定性配方无自由文本；我们的老君 agent 炼器需要自然语言描述，所以炉窗里加了"心愿"输入框（标注清楚）。

**验证**（独立浏览器，见末节）：炉窗忠实复刻官方（`ui-finish-2-furnace-COMPARE`）；点妖怪残魂×2 + 白银矿石×1 → 两个基本材料槽填入对应图标、炉火预算算出"10 点（atk≤10 def≤10 hp≤40）"；`openCraftMode` 开炉、`furnacePanel.close()` 关炉后正确回到对话框；重写后的 DialogueBox 聊天渲染正常（`_verify-dialogue.png`）。acceptance 18/19/20/21 步（`__openCraft`/`__submitCraft`/`__craftState`）钩子已同步更新（`craftMode` 现读 `furnacePanel.isOpen`），协议路径不变。

## ③ 结算横幅接线：boss 死 → 横幅 → 传送门

**做法**：boss 死不再直接开传送门，改为：
1. `revealTransferDoor`（门标记可用，传送门保持可达、`__usePortal` 继续工作），但**不立即显传送门 glow**；
2. 播 `ResultBanner.showSuccess`（挑战成功横幅，meta-shell 早交付的组件，用 Online 原版素材），stat 行 = **关名 / 妖王已除 / 境界 Lv**（全取自现成数据 `CAMPAIGN[i].name` + `MONSTER_NAMES[boss.species]` + `progression.level`，未加新计数器）；
3. 继续按钮 / ↑ 键 / 6 秒超时 → 关横幅 + 显传送门 glow；重新挑战按钮 → 重开本关。

**acceptance 安全**：门在 boss 死时已 reveal，`__usePortal` 若横幅还开着会先自动关横幅再传送。实测 `__killBoss`(25) → `__usePortal`(26) 仍能进下一关（关 0→1）。

**失败横幅不接（按 brief 判据"现成就接，不现成落 report 不做"）**：`ResultBanner.showFail` 组件层支持，**但游戏没有败局**——战斗模型里英雄死亡是原地自动重生（`onHeroRespawn`），没有"游戏结束/失败"事件可挂。接失败横幅 = 要新增死亡/败局规则，属功能新增、越出"纯呈现"范围。故不做，如实记录。**待用户拍板**：是否要引入败局机制（那是数值/玩法决策，不是 UI 收尾）。

**验证**：清波次刷出 boss（monster3=巫鹰）→ `__killBoss` → 横幅开、门可达、传送门 glow 未显；关横幅 → 传送门 glow 出现 + "妖王已除"提示；`__usePortal` → 进第 2 关。见 `ui-finish-3-banner.png` / `-portal.png`。

---

## 验证方法说明（重要）

**共享 MCP playwright 浏览器被并行 agent 反复抢占**（导航到别的 app、tab 变扩展页、端口漂移 5210/5221），brief 预警过的"多 agent 互踩"实锤发生。改用**独立 playwright-core 脚本 + 缓存 chromium**（`~/Library/Caches/ms-playwright/chromium-1228`），起自己的 vite dev（`--port 5175 --strictPort`，nohup），完全隔离验证。三件的实机截图与状态断言都来自这条隔离链路。

## 并发情况提示（非本任务，供 team-lead 知悉）

本任务期间**同一工作树有并行 agent 在改 `systems/`（承伤数值 tuning）**：其 commit `4619099`/`9646822` 夹在我三个 commit 之间，工作树里还有它未提交的 `heroSurvivability.ts`/`heroIdentity.ts`/`monsterExp.ts` 等改动。我的每个 commit **只 `git add` 自己的文件**（BattleScene/DialogueBox/FurnacePanel/hudTheme/furnace_frame.png），没碰它们的 systems 改动。中途 `vitest` 一度因它们的承伤断言 WIP 红过（与我无关，我的 furnace/ui 相关测试始终绿），现已恢复 401 全绿。

## 测试基线
- tsc `--noEmit`：exit 0（三件每件后都跑过）。
- `vitest run`：387（起始）→ 401（并行 agent 加了承伤/monsterExp 测试）全绿。furnace.test 14 个全过。
