# 任务书：furnace-recipe——配方制炼丹炉最简闭环 + 老君 agent 代炼（黑客松口径）

派发：2026-07-09 14:5x 主会话 → codex。report 写 `tasks/furnace-recipe-report.md`。

## 口径（用户拍板）

赛内只要**打造(Making)页最简闭环**：玩家拿制作书+材料+灵魂 → 炼出一件真装备；老君 agent 能代办同一流程（"帮我炼尾火棍"→查料→代炼→装备进包）。强化/熔炼/分解三页赛后再做（数据已备齐勿删）。

## 真源（全部已落库，照抄）

- 配方/消耗：`tasks/economy-archaeology-report.md` §Q1（38 条打造配方逐字、灵魂消耗按品质 50~1600、100% 成功、产物=制作书 fillName 去尾"zzs"）。
- 物品数据：`game/src/data/original/equipment.json`（218 件含全部制作书/材料/产物装备）。
- 示范配方（判据用）：`whgzzs 尾火棍制作书` → 檀木(wptm)×20 + 灵魂 200（优秀品质）→ `whg 尾火棍`（悟空武器）。
- 材料获取：L1 掉落表真源里已有材料掉落（A 棒已接 original/monster-drops.json）；判据允许用调试钩子 `__giveMaterials` 备料。

## 产出

1. `game/src/systems/furnaceRecipe.ts`（新，纯逻辑）：`listRecipes()`（38 条从 equipment.json 制作书推导）、`canCraft(inventory, soul, recipeFill)`、`craft(...)`（扣料扣魂→产物 Item 走 equipment.json 真源属性；宝石附魔槽赛内可不做，report 记）。旧 furnace.ts 预算模型保留不删（技术储备），FurnacePanel 改走新路径。
2. FurnacePanel 接线：材料/配方列表 + 打造按钮走 furnaceRecipe（**FurnacePanel.ts 在 ui/，C 棒产权——改前先看 C 棒是否已 commit 收口；若仍在途，把接线代码写成独立文件 `game/src/ui/hud/FurnaceRecipeView.ts` 由 Panel 挂载，把对 FurnacePanel.ts 本体的改动压到 ≤5 行并即刻 commit**）。
3. 老君 agent 代炼：`agent-server/` 给老君加工具 `list_recipes / check_materials / craft_item`（走与游戏侧同一套规则：服务端只发指令，游戏侧 furnaceRecipe 校验执行，不信任服务端的老纪律不变）；net/ 消息补一型。对话示例判据："老君，帮我炼把尾火棍"→ 老君查料（缺料会说缺什么）→ 齐料时炼成 → 背包出现尾火棍（属性来自 equipment.json）。
4. vitest：canCraft 缺料/缺魂/齐备三态、craft 扣账与产物属性对 equipment.json、agent 指令路径的游戏侧校验（非法配方/超量拒绝）。

## 边界

产权：`game/src/systems/furnaceRecipe.ts`、`game/src/net/`（消息一型）、`agent-server/`、`game/src/ui/hud/FurnaceRecipeView.ts`（新文件）+ FurnacePanel.ts ≤5 行接缝、`game/tests/`、`agent-server` 测试、本 report。禁碰 BattleScene/其他 ui。禁 npm install/联网（agent-server node_modules 已装；老君真回话链路的 e2e 由包装层配 NPC_BRAIN_PROVIDER 本地跑或 mock brain，别打生产）。
判据：包装层浏览器亲验（起 vite+本地 agent-server 或 mock）：世界地图开炉→选尾火棍配方→备料（__giveMaterials 檀木×20+调灵魂）→打造→背包见尾火棍；对话代炼路径同样跑通截图。全量测试绿。commit 逐件不 push。
