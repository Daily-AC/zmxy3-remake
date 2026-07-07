# agent-server

LLM 驱动 NPC 的服务端。独立 Node 进程，游戏客户端通过 WebSocket 连接（端口
`5181`），NPC 的"认知层"用 [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
的 `query()` 驱动，走本机 Claude Code CLI 登录态，不需要配置任何 API key。

## 运行

```sh
npm install
npm run start        # 启动服务端，监听 ws://localhost:5181
npm run typecheck     # tsc --noEmit
npm run test:unit     # 纯函数单测（node:test，炼器数值校验/clamp）
npm run test:mock     # 端到端自测：假游戏客户端 + 真实 LLM 往返
npm test              # test:unit && test:mock
```

`test:mock` 会自己 spawn 一份 server 子进程、跑完整场景、断言、把完整
transcript 写到 `test/transcript.json`，跑完自动杀掉子进程。这是一次真实的
LLM 往返（没有 mock 模型），大约需要 15~20 秒。

## 协议

单条 WebSocket 连接，每个 ws frame 就是一个 JSON 对象（`{"type": ...}`），
不需要额外的换行分帧。

### 游戏 → 服务端

| type | 字段 | 说明 |
|---|---|---|
| `hello` | `player?: {id?, name?}` | 注册/握手，服务端回一条 `welcome` |
| `world_event` | `kind: string`, `data?: object`, `at?: number` | 世界事件（如 `monster_killed`/`player_hp`），进全局环形缓冲，供 NPC 感知 |
| `player_say` | `npcId: string`, `playerId?: string`, `text: string` | 玩家对某个 NPC 说话 |

`world_event` 的 `kind` 目前内置格式化了两种（`monster_killed` 期望
`data.monster`；`player_hp` 期望 `data.hp`/`data.maxHp`），其余 kind 会被
序列化成 JSON 塞进 NPC 的上下文里，不会报错，只是措辞没那么自然。

### 服务端 → 游戏

| type | 字段 | 说明 |
|---|---|---|
| `welcome` | `npcIds: string[]` | 连接建立后立即发送，列出当前可对话的 NPC |
| `npc_thinking` | `npcId: string` | 收到 `player_say` 后立刻发送，供游戏侧做"思考中"演出，LLM 还没返回 |
| `npc_say` | `npcId: string`, `text: string` | NPC 的话，每轮 `player_say` 必定对应恰好一条 |
| `give_item` | `npcId: string`, `item: NpcItem` | NPC 把物品塞进玩家背包 |
| `set_goal` | `npcId: string`, `goal: NpcGoal` | NPC 给玩家发布/更新一个目标 |
| `craft_item` | `npcId: string`, `item: CraftedItem` | NPC 现场炼制一件装备交给玩家 |
| `error` | `message: string` | 消息格式错误或处理异常 |

```ts
interface NpcItem {
  id: string;
  name: string;
  kind: "equipment" | "material" | "consumable" | "quest";
  desc?: string;
  qty?: number;
}

interface NpcGoal {
  id: string;
  title: string;
  desc?: string;
}

// 炼器 effect DSL：LLM 只能在这个封闭词表里发挥（受 schema 约束的是"形状"），
// 数值范围由服务端硬校验/clamp，跟模型实际发了什么数字无关（见下）。
interface StatEffect {
  type: "stat";
  stat: "atk" | "def" | "hp" | "mp" | "crit";
  value: number; // 服务端硬性收敛：atk/def<=50，hp/mp<=200，crit<=0.5
}

interface OnHitEffect {
  type: "onHit";
  effect: "burn" | "lifesteal" | "freeze";
  chance: number; // 服务端硬性收敛 <=0.5
  power: number;  // 服务端硬性收敛 <=30
}

type CraftEffect = StatEffect | OnHitEffect;

interface CraftedItem {
  id: string;
  name: string;
  kind: "equip";
  rarity: 1 | 2 | 3;
  desc: string;
  effects: CraftEffect[]; // 服务端硬性截断到最多 3 条
}
```

`NpcItem` 是刻意从简的最小 schema，不是 `game/src/data/` 下正式的装备/物品
表——真正接游戏背包时，由游戏侧按自己的物品表把 `item.id`/`item.name`
映射成真实物品，或者后续再把这个 schema 和 game 的数据格式对齐。

### 炼器（`craft_item`）：沙箱怎么保证"永远炸不了"

`src/craft-validate.ts` 是一个不依赖 SDK/网络的纯函数模块：`validateEffects`
和 `validateCraftedItem`。工具的 zod schema（`src/brain.ts`）只约束**形状**——
`stat`/`effect` 必须是枚举里的合法名字，字段类型必须对——**故意不**在 zod
里加数值上限。真正的数值边界（`atk/def<=50`、`hp/mp<=200`、`crit<=0.5`、
`chance<=0.5`、`power<=30`、`effects` 最多 3 条）全部在 `craft-validate.ts`
里用 `Math.min/max` 硬 clamp，和模型发了什么数字无关；超限时把差值收敛掉，
并在 `desc` 后面注明"（丹炉火候不足，威力已收敛）"，而不是拒绝整个请求。
非法的 `stat`/`effect` 名字（枚举之外的值）会被整条丢弃，不会被"掰"成一个
合法值。这些行为在 `test/craft-validate.test.ts` 里用 `node:test` 单测覆盖
（clamp 边界、超 3 条截断、非法名字拒绝、非法输入不 throw）。

打造流程是两轮对话，靠对话历史 + prompt 里的指引让 LLM 自己判断该走哪一步
（不是硬编码的状态机）：
1. 玩家描述想要的装备效果时，如果对话记录里还没有"交材料/确认"的痕迹，
   NPC 只会调用 `say` 报价——问要什么材料（优先从最近的 `world_event` 里
   玩家获得过的材料里挑，没有就随口要一两样丹房常见材料）。
2. 玩家明确回应交付材料之后，NPC 才会调用 `craft_item`，同时仍然调用
   `say` 说几句交货台词。

## NPC 大脑怎么工作的（`src/brain.ts`）

每个 NPC 有：
- 人设 prompt（`src/npc-registry.ts`，作为 SDK 的 `systemPrompt`）
- 全局共享的最近世界事件环形缓冲（`src/npc-state.ts`，容量 30，任意 NPC 都能感知任意事件）
- 每个 NPC 独立的对话历史（容量 20 轮）

收到 `player_say` 时：
1. 立刻发 `npc_thinking`。
2. 把"人设 + 最近世界事件 + 这个 NPC 的对话历史 + 玩家这句话"拼成一个
   prompt，调 `query()`。
3. 用 `@anthropic-ai/claude-agent-sdk` 的 `tool()` + `createSdkMcpServer()`
   定义了四个自定义工具：`say`（必须每轮调用恰好一次）、`give_item`
   （按剧情调用）、`set_goal`（按剧情调用）、`craft_item`（炼器，按剧情
   调用，见下）。`query()` 的 `tools: []` 关掉了所有内置工具（Bash/Read/…），
   `allowedTools` 只放行这四个 MCP 工具，逼着模型只能通过工具调用输出
   结构化结果，不走自由文本 + 正则解析。
4. 工具的 handler 一被调用就立刻通过回调把 `npc_say`/`give_item`/
   `set_goal`/`craft_item` 推给游戏端——不等模型这一轮彻底结束。
5. 如果模型这一轮没调用 `say`（异常情况），兜底用 `SDKResultMessage.result`
   里的文本发一条 `npc_say`，保证游戏侧一定能收到回复。

每次调用都是独立的 `query()`（无状态 SDK session），对话记忆完全由
`npc-state.ts` 里我们自己维护的历史数组承担，不依赖 SDK 的 session/resume
机制——这样每个 NPC 的记忆窗口、格式都在我们自己控制之下。

## 目前只内置了一个 NPC

`laojun`（太上老君，炼丹房主人，傲娇长者口吻，称玩家"猴头"）。在
`src/npc-registry.ts` 的 `NPC_REGISTRY` 里加一条即可扩展新 NPC。

## 文件清单

```
agent-server/
├── src/
│   ├── types.ts           # 游戏 <-> 服务端 JSON 协议类型（含炼器 Effect DSL）
│   ├── npc-registry.ts    # NPC 人设（目前：太上老君）
│   ├── npc-state.ts       # 全局世界事件环形缓冲 + 每 NPC 对话历史
│   ├── craft-validate.ts  # 炼器数值校验/clamp 纯函数（沙箱边界）
│   ├── brain.ts           # LLM 调用逻辑：拼 prompt、自定义工具、query()
│   └── server.ts          # WebSocket 服务端，端口 5181
├── test/
│   ├── craft-validate.test.ts  # 炼器校验纯函数单测（node:test）
│   ├── mock-game.ts            # 假游戏客户端，端到端自测（真实 LLM）
│   └── transcript.json         # 上一次 test:mock 跑出来的完整往返记录
├── package.json
└── tsconfig.json
```
