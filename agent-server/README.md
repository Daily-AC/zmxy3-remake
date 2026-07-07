# agent-server

LLM 驱动 NPC 的服务端。独立 Node 进程，游戏客户端通过 WebSocket 连接（端口
`5181`）。NPC 的"认知层"由 `src/brain.ts` 里的一个 provider 开关驱动：

- **`opencode`（默认）**：[opencode CLI](https://opencode.ai/docs/) 的 headless
  server（`opencode serve`，通过 `@opencode-ai/sdk` 编程式启动）+
  **DeepSeek V4 Flash**（准确 model id：`deepseek/deepseek-v4-flash`，用
  `opencode models deepseek` 现查确认，不是猜的）。API key 走环境变量
  `DEEPSEEK_API_KEY`（本机已配置，代码/配置里不落 key 值）。选它是因为
  home 部署不想依赖 Claude CLI 的交互登录态，且成本更低。
- **`claude`（A/B 对照）**：原来的 `@anthropic-ai/claude-agent-sdk` 路径，
  走本机 Claude Code CLI 登录态，不需要配置任何 API key。

用环境变量 `NPC_BRAIN_PROVIDER=claude` 切到对照组（默认即 `opencode`，不用
设置任何变量）；`opencode` 路径下的模型也可以用 `NPC_OPENCODE_PROVIDER_ID`
/`NPC_OPENCODE_MODEL_ID` 覆盖（默认 `deepseek`/`deepseek-v4-flash`）。两条
路径共享同一套上下文拼装逻辑（人设/世界事件/对话历史/炼器两轮流程指引），
只有"怎么让 LLM 交回结构化结果"这一步不同，见下方"两条 provider 的技术
差异"。

## 运行

```sh
npm install
npm run start        # 启动服务端，监听 ws://localhost:5181（默认 opencode+DeepSeek）
npm run typecheck     # tsc --noEmit
npm run test:unit     # 纯函数单测（node:test，炼器数值校验/clamp）
npm run test:mock     # 端到端自测：假游戏客户端 + 真实 LLM 往返
npm test              # test:unit && test:mock

NPC_BRAIN_PROVIDER=claude npm run test:mock   # 跑对照组（claude-agent-sdk）
```

`test:mock` 会自己 spawn 一份 server 子进程、跑完整场景、断言、把完整
transcript 写到 `test/transcript.json`，跑完自动杀掉子进程（包括 opencode
serve 子子进程——`server.ts` 收到 SIGTERM 会先关掉 opencode server 再退出，
不会留孤儿进程）。这是一次真实的 LLM 往返（没有 mock 模型），大约需要
15~30 秒。

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
  value: number; // 服务端硬性收敛：atk/def<=200，hp/mp<=800，crit<=0.5
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
里加数值上限。真正的数值边界（`atk/def<=200`、`hp/mp<=800`、`crit<=0.5`、
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
- 人设 prompt（`src/npc-registry.ts`）
- 全局共享的最近世界事件环形缓冲（`src/npc-state.ts`，容量 30，任意 NPC 都能感知任意事件）
- 每个 NPC 独立的对话历史（容量 20 轮）

收到 `player_say` 时：
1. 立刻发 `npc_thinking`。
2. 把"人设 + 最近世界事件 + 这个 NPC 的对话历史 + 玩家这句话"拼成上下文，
   交给当前配置的 provider（见下）。
3. provider 决定 `say`/`give_item`/`set_goal`/`craft_item`，通过回调立刻
   推给游戏端——不等这一轮彻底结束。
4. 如果这一轮没能产出合法的 `say`（异常情况），兜底发一条保底文案，保证
   游戏侧一定能收到回复。

每次调用都是独立的一次性请求（不依赖任何 provider 自己的 session/resume
机制），对话记忆完全由 `npc-state.ts` 里我们自己维护的历史数组承担——这样
每个 NPC 的记忆窗口、格式都在我们自己控制之下，也让两个 provider 能公平地
基于同一份上下文对比输出质量。

### 两条 provider 的技术差异

**`claude`**：用 `@anthropic-ai/claude-agent-sdk` 的 `tool()` +
`createSdkMcpServer()` 定义四个真正的自定义工具：`say`（必须每轮调用恰好
一次）、`give_item`、`set_goal`、`craft_item`（按剧情调用）。`query()` 的
`tools: []` 关掉所有内置工具（Bash/Read/…），`allowedTools` 只放行这四个
MCP 工具，逼着模型只能通过工具调用输出结构化结果，不走自由文本 + 正则
解析。工具没被调用时兜底用 `SDKResultMessage.result` 的文本发一条 `say`。

**`opencode`**：没有走同样的自定义工具路线——原因见下——而是让模型每轮
只回复一个 JSON 对象（`say` 必填，`give_item`/`set_goal`/`craft_item`
按需可选），用 zod 严格 parse+validate；`craft_item` 字段额外过一遍
`craft-validate.ts` 做数值 clamp，和 `claude` 路径完全一样的沙箱。
JSON parse/校验失败时兜底：有原始文本就把原始文本当 `say` 发出去，没有
就发保底文案——同样保证游戏侧一定收到回复。

**为什么 `opencode` 没有用自定义工具**（这是本轮改造里实际验证过的结论，
不是猜的）：

opencode 支持两种"让模型交回结构化结果"的机制：(a) 自定义工具，走
`.opencode/plugins/` 或 `~/.config/opencode/plugins/` 里的静态插件文件，
工具的 `execute` handler 在服务器启动时就注册好，不是每次请求临时创建的
闭包——要让它按每次 `player_say` 的具体回调路由结果，需要额外一层
"session ID → 待处理请求"的全局映射，比 `claude-agent-sdk` 里"每次
`query()` 调用现场 `tool()` 出一个闭包捕获当次回调"的模式复杂不少；
(b) `POST /session/{id}/message` 请求体里的原生 `format: {type:
"json_schema", schema, retryCount}` 结构化输出——这个更接近 (a) 的效果，
但实测对 DeepSeek V4 Flash 直接报错：

```
"Thinking mode does not support this tool_choice"
```

这是直接起一个本地 `opencode serve`、用 curl 打 `/session/{id}/message`
现场试出来的，不是文档推断——`opencode models deepseek --verbose` 显示
`deepseek-v4-flash` 只有 `reasoningEffort: low/medium/high/max` 四档
variant，没有能完全关闭 thinking 的选项，而 opencode 的 `json_schema`
结构化输出是靠强制 `tool_choice` 实现的，这台底层机制和 DeepSeek 的
thinking 模式互斥，换哪个 variant 都一样报错。相比之下，纯文本 + 严格
JSON 契约（不强制 tool_choice）在同一个模型上直接跑通，返回的就是干净
的、可以直接 `JSON.parse` 的 JSON，没有 markdown 代码块包裹、没有多余文字。
所以选了退一档方案：prompt 里给死 JSON 契约 + zod 校验，`craft_item` 的
沙箱边界（clamp/截断/拒绝非法名字）完全复用 `craft-validate.ts`，不因为
换了 provider 就降低炼器的安全性。

`opencode serve` 子进程通过 `@opencode-ai/sdk` 的 `createOpencode()`
在 `brain.ts` 里懒加载启动一次，全进程生命周期内复用；`process.once("exit"
/"SIGINT"/"SIGTERM", ...)` 保证 `agent-server` 退出时一并关掉，不留孤儿
进程（已验证：多次跑 `test:mock`，包括跑到一半失败退出的情况，`ps aux`
里都没有残留的 `opencode serve`）。每次 `askNpc()` 调用都会新建一个
opencode session、用完就 `client.session.delete()` 删掉，避免 session
列表无限增长。

### 质量对比：DeepSeek V4 Flash vs Claude（如实报告，不是"没差"）

这一轮改造期间两条 provider 各真实跑了不下六轮完整场景（世界事件感知 +
give_item + 两轮炼器），人设基调（"哼""罢了罢了""老夫/老道""猴头"、傲娇
但心软）两边都稳定复刻出来了。跑的过程中还真发现并修了两个 DeepSeek 路径
特有的 bug，外加一个没法"修"、只能如实报告的模型行为差距：

**已发现并修复的 bug（都在 `src/brain.ts` 的 prompt 里改的，不是放宽测试
断言）：**

1. **JSON 引号转义 bug**：DeepSeek 在台词里想引用物品名时会用英文直引号，
   比如 `"say": "你拿"两块白银矿石"来..."`——这个引号没转义，直接把 JSON
   字符串截断，导致整轮 `JSON.parse` 失败，那一轮的 `give_item`/
   `craft_item` 全部丢失（`say` 还有兜底文本可用，但结构化字段全没了）。
   复现打印：`[brain:opencode] failed to parse/validate NPC turn JSON`。
   修法：在 system prompt 里明确要求"字符串值内部绝对不能出现英文双引号
   "，要引用东西一律用中文引号「」或『』"——改完之后连续几轮 DeepSeek 都
   老老实实用「」引用材料名，没再复现。这是纯文本 JSON 契约这条路线本身
   的脆弱点：真正的工具调用（`claude` 路径）不会有这个问题，因为参数是
   provider 自己序列化的，不会经过"模型手打一段自认为是 JSON 的文本"这一步。
2. **材料确认过严 bug**：DeepSeek 报价时偶尔一口气点名 2-3 样材料（比如
   "两块白银矿石+一颗火灵珠+一块血凝晶"），如果玩家确认交付时没有逐一
   报出材料名字（原始测试台词只说"两块白银矿石都在这儿了"），DeepSeek 会
   认定材料不全，拒绝 `craft_item`，只追问缺的材料——导致 `test:mock` 超
   时失败过一次。这其实是一个真实的产品逻辑问题，不只是测试脚本用词的
   问题：真实游戏里玩家是点"交材料"的按钮，不会把材料名字念一遍，NPC 不
   应该指望玩家逐字复述材料清单才认账。修法：在两条 provider 共用的
   `CRAFT_FLOW_GUIDANCE` 里加了一条——玩家只要说"材料都给你了/交齐了"这
   种笼统确认，就应该视为材料完整，不需要玩家逐一报材料名字——改完之后
   DeepSeek 在类似场景下会说"还真把东西都带来了？"然后正常打造。

**修不掉、如实报告的行为差距：专有名词的字面保真度更低。** 世界事件注入
的是"赤炎狼"，Claude 在本项目至今跑过的每一轮里都逐字引用"赤炎狼"，一次
没差过；DeepSeek 在这轮验收的约 6 次真实往返里，至少 3 次没有逐字引用—
—有的是近义字替换（"赤炎狼"写成"赤焰狼"，炎→焰），有的是直接换成昵称/
泛称，把两个名字都替换掉（比如"狼崽子""石头疙瘩"，完全不含注入的原文
字符串），后者触发了两次 `test:mock` 的硬失败（`mentionsA`/`mentionsB`
都不命中），靠重跑才过。如果游戏侧要拿 NPC 台词里的字符串去做匹配（高亮
怪物名、判定任务触发字符串），这是一个要认真对待的真实限制——Claude 没
出现过这个问题。人设专属记忆点（"偶尔敲打大闹天宫的旧账"）Claude 几乎
每轮都会带出具体典故，DeepSeek 大多数轮次没主动带出，闲聊内容更偏通用
暴躁老前辈；另外观察到一次极小的语言混杂瑕疵——一句中文台词里夹了个英文
单词"leftovers"，Claude 没出现过这种情况。

结论：DeepSeek V4 Flash 能撑起这个 NPC 场景——两轮炼器流程、JSON 结构化
输出解析（在两个 prompt 修复之后）、沙箱数值边界全部可靠；但"逐字引用
专有名词"这一项有实测的、有具体失败次数支撑的真实质量差距，不是噪音，
如果游戏逻辑依赖 NPC 台词里精确出现某个字符串，需要单独设计兜底（比如
在服务端而不是靠模型自觉，把怪物名以别的方式带给游戏侧）。

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
│   ├── craft-validate.ts  # 炼器数值校验/clamp 纯函数（沙箱边界，两条 provider 共用）
│   ├── brain.ts           # provider 开关 + 两套 LLM 调用逻辑（opencode 默认 / claude 对照）
│   └── server.ts          # WebSocket 服务端，端口 5181
├── test/
│   ├── craft-validate.test.ts  # 炼器校验纯函数单测（node:test）
│   ├── mock-game.ts            # 假游戏客户端，端到端自测（真实 LLM）
│   └── transcript.json         # 上一次 test:mock 跑出来的完整往返记录（默认 provider：opencode+DeepSeek）
├── package.json
└── tsconfig.json
```
