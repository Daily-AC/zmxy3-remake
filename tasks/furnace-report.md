# 炼丹炉合成系统 — 交付报告（纯逻辑 + 炼器协议 + agent-server 侧）

对应任务书 `tasks/furnace-brief.md`。本棒只做纯逻辑 + 协议 + 服务端，**没有**动
`game/src/scenes/`、`game/src/ui/`、`systems/level.ts`。场景/UI 接线是下一棒，接口清单见 §5。

## 1. 交付物一览

| 文件 | 性质 | 说明 |
|---|---|---|
| `game/src/systems/furnace.ts` | 新增，纯逻辑 | 预算模型 + 请求构造 + 返回校验/clamp + 材料事务 |
| `game/tests/furnace.test.ts` | 新增，单测 | 21 条，覆盖预算/clamp/超预算拒收/非法剔除/事务 |
| `game/src/net/npcClient.ts` | 扩展 | 新增 `craft_request`/`craft_result`/`craft_reject` 消息类型 + codec + `craftRequest()` |
| `agent-server/src/types.ts` | 扩展 | 镜像上面三条协议消息（两端手工同步，沿用既有 duplication 惯例） |
| `agent-server/src/forge.ts` | 新增 | 炼器 forge：mock / opencode / claude 三 provider，复用 `validateCraftedItem` 沙箱 |
| `agent-server/src/llm.ts` | 新增 | 从 `brain.ts` 抽出共享的 opencode 单例 + JSON 辅助，brain 与 forge 共用一个 `opencode serve` |
| `agent-server/src/brain.ts` | 改 | 改为从 `llm.ts` 引入共享 helper（行为不变，纯搬移） |
| `agent-server/src/server.ts` | 改 | 新增 `craft_request` 分支 → `forgeEquipment` → 回 `craft_result`/`craft_reject` |
| `agent-server/test/forge-mock.ts` | 新增，e2e | mock provider 端到端自测，含真实游戏侧 furnace 校验 |
| `agent-server/package.json` | 改 | 新增 `test:forge` 脚本，并入 `test` 链 |

> 未改 `game/src/data/drops.json`：材料本就是现有掉落表里 `kind: "material"` 的物品
> （妖怪残魂/白银矿石/玄铁碎片…），炼丹炉直接消费 `dropRoll` 产出的 `Item`，无需改
> 怪物/掉落逻辑，符合"给出材料掉落配置但不改怪物逻辑"。

## 2. 核心设计：游戏侧不信任服务端

材料价值 → 属性预算（**游戏侧算，绝不采信服务端回传的预算**）→ 返回装备逐字段硬
clamp → 总价值仍超预算则**整件拒收**（材料归还），而不是裁剪。服务端另有一层静态
clamp（`craft-validate.ts`），但那只是粗安全网；预算 clamp 才是权威边界——恶意/出
bug 的服务端永远造不出超过材料所值的装备。

## 3. 预算公式与成本模型（`furnace.ts`）

**材料价值（按稀有度，乘数量）**：`MATERIAL_POINTS = { 1: 2, 2: 6, 3: 15 }`（跳变近似
`drops.json` 的稀有度梯度）。`points = Σ MATERIAL_POINTS[rarity] × qty`。

**逐字段上限 `caps` = min(引擎绝对上限, 预算缩放值)**，引擎绝对上限镜像服务端沙箱：

| 字段 | 引擎绝对上限 | 预算缩放 |
|---|---|---|
| atk / def | 50 | `points` |
| hp / mp | 200 | `points × 4` |
| crit | 0.5 | `points / 100` |
| onHit chance | 0.5 | `points / 40` |
| onHit power | 30 | `points` |
| effects 条数 | 3 | — |

**成本模型（与 caps 共用一张汇率表——某字段单独顶到其 cap 时，成本恰好等于
`points`）**：

- stat atk/def：`cost = value`
- stat hp/mp：`cost = value / 4`
- stat crit：`cost = value × 100`
- onHit：`cost = power + chance × 40`

**接受判据**：所有生效 effect 的 `Σ cost ≤ points`（含 1e-9 epsilon 容许 hp/mp 除法
浮点误差）。因此单字段被 cap 收敛后仍可能因多字段叠加而 `Σ cost > points` → 拒收。
例：12 点预算，回传 atk+def 各被 cap 到 12，成本 24 > 12 → `over_budget` 拒收。

## 4. clamp / 剔除规则（`validateCraftedEquipment(raw, budget)`）

输入按 `unknown` 处理，逐字段重校验（不信 schema）：

1. `id`/`name` 缺失或空 → 安全默认（`forged-<ts>` / `无名法宝`）；`rarity` → 四舍五入后 clamp 到 1–3。
2. 每条 effect：类型/枚举名非法（如 `stat: "luck"`、`onHit: "poison"`、未知 `type`）**整条丢弃**，绝不掰成合法值；数值字段 clamp 到对应 `cap`。
3. **先清洗后截断**：非法 effect 先剔除，再截到 `maxEffects=3`——恶意服务端塞垃圾也顶不掉真 effect。
4. 计算 `Σ cost`，超预算返回 `{ ok:false, reason:'over_budget', totalCost, budget }`；否则返回 `{ ok:true, item, totalCost }`，`item` 是兼容 `systems/equipment.ts` 的合法 `Item`（`kind:'equip'`）。
5. 永不 throw：垃圾输入退化成空 effect 的合法 item。

## 5. 协议消息格式（两端已同步：`net/npcClient.ts` ↔ `agent-server/src/types.ts`）

与既有 `player_say` 自由对话炼器**并存**。结构化炼器是单请求/单响应一来一回（材料已
选定、预算已算好），不是两轮"报价—确认"对话。`requestId` 关联响应与游戏侧材料锁定事务。

**游戏 → 服务端**：
```ts
{ type: "craft_request", npcId: string, requestId: string, playerId?: string,
  description: string,                 // 玩家自然语言描述
  materials: { id, name, rarity:1|2|3, qty }[],
  budget: { points, caps: {atk,def,hp,mp,crit,onHitChance,onHitPower}, maxEffects } }  // 仅作提示，服务端可参考，游戏侧回来重算重校
```

**服务端 → 游戏**：
```ts
{ type: "craft_result", npcId, requestId, item: CraftedItem, flavor: string }  // flavor = 太上老君炼宝台词（引用材料+描述）
{ type: "craft_reject", npcId, requestId, reason: string }                      // 服务端级拒炼（请求不可炼/内部异常）
```

`CraftedItem` 沿用既有定义（`id,name,kind:"equip",rarity:1|2|3,desc,effects[]`），服务端
已过一遍静态 clamp。注意区分两种失败：`craft_reject`（服务端拒炼）vs 游戏侧收到
`craft_result` 后 `validateCraftedEquipment` 判 `over_budget`（游戏侧拒收）——两者都要
`refundMaterials`。

## 6. 材料消耗事务（`furnace.ts`）

请求发出即 `lockMaterials`（从背包移除并记在事务上，短缺则返回 null 且背包不动）→
成功 `consumeMaterials`（已移除，仅置 `consumed`）→ 失败/超时/拒收 `refundMaterials`
（归还并置 `refunded`）。consume/refund 幂等且互斥，只作用于 `pending` 事务——成功后
迟到的超时不会二次归还。

## 7. 场景接线棒需要的接口清单（下一棒）

游戏侧（`import ... from '../systems/furnace'`）：
- `buildCraftRequest(description, lots: MaterialLot[]): CraftRequestPayload` — 由 UI 选中的材料 + 描述框构造 payload（内含算好的 budget）。
- `lockMaterials(inv, requestId, lots): CraftTransaction | null` — 点"炼制"时调用；null 时提示材料不足。
- `computeBudget(lots)` / `materialPoints(rarity)` / `effectCost(effect)` — 若 UI 想实时预览预算/性价比。
- `validateCraftedEquipment(raw, budget): { ok:true, item, totalCost } | { ok:false, reason:'over_budget', ... }` — 收到 `craft_result` 后校验。
- `consumeMaterials(tx)` / `refundMaterials(inv, tx)` — 按校验结果结算事务。
- 类型：`MaterialLot`、`AttributeBudget`、`CraftMaterialRef`、`CraftRequestPayload`、`CraftTransaction`、`CraftValidation`。

网络侧（`NpcClient`）：
- `client.craftRequest(npcId, requestId, description, materials, budget, playerId?)` — 发请求（连接未 open 时返回 false，需在事务锁定后调用）。
- `client.onMessage` 已能解出 `craft_result` / `craft_reject`（`decodeServer` 已覆盖，畸形帧返回 null 不会崩游戏循环）。

**建议接线时序**（供下一棒参考，未实现）：UI 选材料 + 输描述 → `buildCraftRequest` →
`lockMaterials`（失败即止）→ `craftRequest` 发出 + 起超时定时器 → 收 `craft_result`：
`validateCraftedEquipment` 通过则 `consumeMaterials` + `addItem` 入背包并展示 `flavor`，
`over_budget` 则 `refundMaterials` + 提示"材料不足以炼此宝" → 收 `craft_reject` 或超时：
`refundMaterials` + 提示。老君 NPC 已注册（`agent-server/src/npc-registry.ts` `laojun`）。

## 8. 验收判据逐条

1. **`cd game && npx vitest run` 全绿**：19 文件 147 测试通过（原 126 + 新 furnace 21）；`tsc --noEmit` 干净。
2. **agent-server mock provider 端到端**：`npm run test:forge`（`NPC_BRAIN_PROVIDER=mock`，无需 key）起真实 server、走真实 WS，发 `craft_request` → 收 `craft_result`。断言 ①：mock 故意发的越界值（atk 999、burn 0.9/999）经服务端静态 clamp 回到 50 与 0.5/30；断言 ②：用**真实游戏侧** `furnace.validateCraftedEquipment` 校验通过（成本 100 / 预算 105）。`test:forge` 已并入 `npm test`。
3. **本报告** `tasks/furnace-report.md`。

## 9. 遗留 / 注意

- 场景/UI 接线未做（本棒边界外，接口见 §5）。
- `forge.ts` 的 `opencode`/`claude` 两条真实 LLM provider 已实现（复用 `llm.ts` 共享单例 + 既有 `craft-validate` 沙箱），但只有 `mock` 做了端到端验证；真实 LLM forge 的字面质量沿用 README 里 DeepSeek 的已知局限（专有名词字面保真度偏低），不影响沙箱安全性。
- DeepSeek key 仍走环境变量 `DEEPSEEK_API_KEY`，配置/代码无 key 值。
- 两处协议类型定义（game/net 与 agent-server/types）靠手工同步，沿用 repo 既有惯例；未来若嫌易漂移可提取共享包，非本棒范围。
