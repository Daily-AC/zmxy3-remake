import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { z } from "zod";
import { getNpcPersona, type NpcPersona } from "./npc-registry.js";
import {
  getHistory,
  pushHistory,
  recentWorldEvents,
  type WorldEventRecord,
} from "./npc-state.js";
import { validateCraftedItem } from "./craft-validate.js";
import type { NpcItem, NpcGoal, CraftedItem } from "./types.js";

export interface NpcBrainCallbacks {
  onSay: (text: string) => void;
  onGiveItem: (item: NpcItem) => void;
  onSetGoal: (goal: NpcGoal) => void;
  onCraftItem: (item: CraftedItem) => void;
}

// Provider switch: which LLM backend drives the NPC's cognitive layer.
// - "opencode" (default): opencode CLI's headless HTTP server + DeepSeek V4
//   Flash. No interactive CLI login needed, cheaper, and matches the
//   project's "NPC 由 opencode 驱动" narrative for deployment on home.
// - "claude": the original @anthropic-ai/claude-agent-sdk path (real
//   in-process MCP tool calls), kept as an A/B option for persona-quality
//   comparison — see README for a transcript comparison of the two.
type BrainProvider = "opencode" | "claude";

function getProvider(): BrainProvider {
  return process.env.NPC_BRAIN_PROVIDER === "claude" ? "claude" : "opencode";
}

function describeEvent(ev: WorldEventRecord): string {
  const agoSec = Math.max(0, Math.round((Date.now() - ev.at) / 1000));
  switch (ev.kind) {
    case "monster_killed":
      return `${agoSec}秒前，玩家打死了「${ev.data?.monster ?? "一只妖怪"}」`;
    case "player_hp": {
      const hp = ev.data?.hp;
      const maxHp = ev.data?.maxHp;
      return `${agoSec}秒前，玩家的血量是 ${hp ?? "?"}${maxHp ? "/" + maxHp : ""}`;
    }
    case "item_obtained":
      return `${agoSec}秒前，玩家获得了「${ev.data?.item ?? "一件东西"}」`;
    default:
      return `${agoSec}秒前，发生了事件「${ev.kind}」：${JSON.stringify(ev.data ?? {})}`;
  }
}

// Shared crafting-flow guidance, reused verbatim by both provider prompts so
// the two-round "quote materials, then craft on confirmation" behavior stays
// in sync regardless of which backend is answering.
const CRAFT_FLOW_GUIDANCE = `如果玩家是在向你描述一件想要打造的装备（说明想要什么效果/外观/用途）：
1. 如果对话记录里玩家还没交材料、也没确认交付，这一轮不要打造，只回应报价——
   说明需要什么材料（优先从"最近的世界事件"里玩家获得过的材料里选，没有就
   随口要一两样丹房常见材料，比如"两块白银矿石"）。报价时最多要 1-2 样材料，
   不要一次点名三样以上，免得玩家记不住、你自己也不好判断有没有交齐。
2. 只要玩家表示材料已经交付/凑齐了（比如说"给你" "在这" "都带来了" "交齐了"
   之类的笼统说法），就视为材料已经交付完整，不需要玩家逐一报出材料名字才
   算数——真实游戏里玩家是点一下"交材料"的按钮，不会把材料名字念一遍。
   这种情况下这一轮就要正式打造，并且仍然要说几句交货时的俏皮话。`;

// Crafting effect DSL, shared shape between both providers. This only
// constrains structure (legal stat/effect enum names) — it does NOT
// constrain numeric ranges. That's intentional: the real numeric bounds are
// enforced downstream by validateCraftedItem (src/craft-validate.ts), a
// plain function with its own unit tests, so crafting stays safe no matter
// what number either backend decides to send.
const statEffectSchema = z.object({
  type: z.literal("stat"),
  stat: z.enum(["atk", "def", "hp", "mp", "crit"]),
  value: z.number(),
});
const onHitEffectSchema = z.object({
  type: z.literal("onHit"),
  effect: z.enum(["burn", "lifesteal", "freeze"]),
  chance: z.number(),
  power: z.number(),
});

/**
 * Ask an NPC to react to a line the player just said. Dispatches to the
 * configured provider (opencode+DeepSeek by default, claude-agent-sdk as an
 * A/B option), which fires the given callbacks as it decides on
 * say/give_item/set_goal/craft_item, and updates this NPC's conversation
 * history as a side effect.
 */
export async function askNpc(
  npcId: string,
  playerText: string,
  cb: NpcBrainCallbacks,
): Promise<void> {
  const persona = getNpcPersona(npcId);
  if (!persona) {
    throw new Error(`unknown npc: ${npcId}`);
  }

  pushHistory(npcId, { role: "player", text: playerText, at: Date.now() });

  const events = recentWorldEvents(10);
  const history = getHistory(npcId).slice(0, -1); // exclude the turn we just pushed

  const eventsBlock = events.length
    ? events.map(describeEvent).join("\n")
    : "（最近没有值得一提的世界事件）";

  const historyBlock = history.length
    ? history
        .map((t) => `${t.role === "player" ? "玩家" : persona.name}：${t.text}`)
        .join("\n")
    : "（这是你们的第一次对话）";

  const provider = getProvider();
  const finalSayText =
    provider === "claude"
      ? await askViaClaudeAgentSdk(persona, eventsBlock, historyBlock, playerText, cb)
      : await askViaOpencode(persona, eventsBlock, historyBlock, playerText, cb);

  pushHistory(npcId, { role: "npc", text: finalSayText, at: Date.now() });
}

// ============================================================================
// Provider: opencode + DeepSeek V4 Flash (default)
// ============================================================================
//
// DeepSeek V4 Flash always runs in "thinking" mode (opencode's `models`
// listing shows no non-reasoning variant for it), and opencode implements
// its native structured-output feature (`format: "json_schema"`) by forcing
// a tool_choice under the hood — which DeepSeek's API rejects outright for
// thinking-mode requests ("Thinking mode does not support this
// tool_choice"). Verified directly against a locally spawned `opencode
// serve` + the real DeepSeek API, not assumed. So instead of tool-calling
// or structured-output mode, this asks the model to reply with a single
// JSON object per turn (a strict prompt contract, confirmed to work
// cleanly against this model/provider) and validates that JSON with zod —
// the same "never trust the model's shape" posture as the tool-based path,
// just enforced after the fact instead of by the tool-call machinery.

const npcTurnSchema = z.object({
  say: z.string(),
  give_item: z
    .object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(["equipment", "material", "consumable", "quest"]),
      desc: z.string().optional(),
      qty: z.number().optional(),
    })
    .optional(),
  set_goal: z
    .object({
      id: z.string(),
      title: z.string(),
      desc: z.string().optional(),
    })
    .optional(),
  craft_item: z
    .object({
      id: z.string(),
      name: z.string(),
      rarity: z.number(),
      desc: z.string(),
      effects: z.array(z.discriminatedUnion("type", [statEffectSchema, onHitEffectSchema])).optional(),
    })
    .optional(),
});

const OPENCODE_MODEL = {
  providerID: process.env.NPC_OPENCODE_PROVIDER_ID ?? "deepseek",
  modelID: process.env.NPC_OPENCODE_MODEL_ID ?? "deepseek-v4-flash",
};

let opencodeInstance: ReturnType<typeof createOpencode> | undefined;

/** Lazily spawns one `opencode serve` subprocess for the lifetime of this
 * process, shared across all NPCs/turns. Cleaned up on exit. */
function getOpencode(): ReturnType<typeof createOpencode> {
  if (!opencodeInstance) {
    opencodeInstance = createOpencode({ hostname: "127.0.0.1" }).then((oc) => {
      const cleanup = () => oc.server.close();
      process.once("exit", cleanup);
      process.once("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        cleanup();
        process.exit(0);
      });
      return oc;
    });
  }
  return opencodeInstance;
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function askViaOpencode(
  persona: NpcPersona,
  eventsBlock: string,
  historyBlock: string,
  playerText: string,
  cb: NpcBrainCallbacks,
): Promise<string> {
  const { client } = await getOpencode();

  const system = `${persona.prompt}

你只能用一个 JSON 对象回复，不能有任何其他文字，不能用 markdown 代码块包裹。
JSON 格式（字段说明，不要照抄字面值）：
{
  "say": "你要对玩家说的话，必填，简短，符合人设口吻，1-3句",
  "give_item": { "id": "英文/拼音slug", "name": "中文名", "kind": "equipment|material|consumable|quest", "desc": "可选描述", "qty": 可选数量 },
  "set_goal": { "id": "英文/拼音slug", "title": "目标标题", "desc": "可选描述" },
  "craft_item": {
    "id": "英文/拼音slug", "name": "装备中文名", "rarity": 1到3的品阶, "desc": "装备描述",
    "effects": [ {"type":"stat","stat":"atk|def|hp|mp|crit","value":数值} 或 {"type":"onHit","effect":"burn|lifesteal|freeze","chance":0到1,"power":数值} ]（最多3条）
  }
}
只有剧情确实需要时才带上 give_item / set_goal / craft_item 字段，平时只需要 say 一个字段，不要三个字段都编出来。
重要格式要求：字符串值内部绝对不能出现英文双引号 "，会破坏 JSON 结构导致整轮回复失效；
如果要在台词里引用物品名/说法，一律用中文引号「」或『』，不要用 " " 或 “ ”。`;

  const prompt = `【最近的世界事件】
${eventsBlock}

【你和玩家的对话记录】
${historyBlock}

【玩家刚才说】
${playerText}

请只输出符合上面 JSON 格式的一个对象，不要输出其他任何文字。

${CRAFT_FLOW_GUIDANCE}`;

  let finalSay = `（${persona.name}沉默不语）`;
  const created = await client.session.create();
  if (created.error || !created.data) {
    console.error("[brain:opencode] failed to create session", created.error);
    cb.onSay(finalSay);
    return finalSay;
  }
  const sessionId = created.data.id;

  try {
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: OPENCODE_MODEL,
        system,
        parts: [{ type: "text", text: prompt }],
      },
    });

    if (result.error) {
      console.error("[brain:opencode] prompt request failed", result.error);
    } else {
      const info = result.data.info as { error?: unknown };
      if (info.error) {
        console.error("[brain:opencode] model turn returned an error", info.error);
      }

      const rawText = result.data.parts
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim();

      const parsedRaw = safeJsonParse(stripCodeFence(rawText));
      const parsed = parsedRaw !== undefined ? npcTurnSchema.safeParse(parsedRaw) : undefined;

      if (parsed?.success) {
        const turn = parsed.data;
        finalSay = turn.say;
        if (turn.give_item) cb.onGiveItem(turn.give_item);
        if (turn.set_goal) cb.onSetGoal(turn.set_goal);
        if (turn.craft_item) {
          const item = validateCraftedItem({
            id: turn.craft_item.id,
            name: turn.craft_item.name,
            rarity: turn.craft_item.rarity,
            desc: turn.craft_item.desc,
            effects: turn.craft_item.effects ?? [],
          });
          cb.onCraftItem(item);
        }
      } else {
        console.error(
          "[brain:opencode] failed to parse/validate NPC turn JSON",
          parsed?.error,
          rawText,
        );
        if (rawText) finalSay = rawText;
      }
    }
  } catch (err) {
    console.error("[brain:opencode] request threw", err);
  } finally {
    client.session.delete({ path: { id: sessionId } }).catch(() => {
      // best-effort cleanup; a leaked session costs nothing functionally
    });
  }

  cb.onSay(finalSay);
  return finalSay;
}

// ============================================================================
// Provider: claude-agent-sdk (A/B option, real in-process MCP tool calls)
// ============================================================================

async function askViaClaudeAgentSdk(
  persona: NpcPersona,
  eventsBlock: string,
  historyBlock: string,
  playerText: string,
  cb: NpcBrainCallbacks,
): Promise<string> {
  let sayCalled = false;
  let lastSayText = "";

  const sayTool = tool(
    "say",
    "对玩家说一句话，作为你这一轮的最终回复展示在游戏里。每一轮都必须调用一次，且只调用一次。",
    { text: z.string().describe("你要对玩家说的话，简短，符合人设口吻，1-3句") },
    async (args) => {
      sayCalled = true;
      lastSayText = args.text;
      cb.onSay(args.text);
      return { content: [{ type: "text", text: "已说出口" }] };
    },
  );

  const giveItemTool = tool(
    "give_item",
    "把一件物品交给玩家（放进玩家背包）。只有在剧情上确实要给奖励/道具时才调用，不要每轮都给。",
    {
      id: z.string().describe("物品 id，简短英文/拼音 slug"),
      name: z.string().describe("物品名称，中文"),
      kind: z.enum(["equipment", "material", "consumable", "quest"]),
      desc: z.string().optional().describe("物品描述"),
      qty: z.number().optional().describe("数量，默认 1"),
    },
    async (args) => {
      cb.onGiveItem({
        id: args.id,
        name: args.name,
        kind: args.kind,
        desc: args.desc,
        qty: args.qty,
      });
      return { content: [{ type: "text", text: "已交给玩家" }] };
    },
  );

  const setGoalTool = tool(
    "set_goal",
    "给玩家设定一个目标/任务。只有在你确实要发布任务时才调用。",
    {
      id: z.string().describe("目标 id，简短英文/拼音 slug"),
      title: z.string().describe("目标标题"),
      desc: z.string().optional().describe("目标描述"),
    },
    async (args) => {
      cb.onSetGoal({ id: args.id, title: args.title, desc: args.desc });
      return { content: [{ type: "text", text: "已设定目标" }] };
    },
  );

  const craftItemTool = tool(
    "craft_item",
    "为玩家炼制一件装备，交给玩家。只有在对话记录显示玩家已经明确交付/确认" +
      "材料之后才能调用；打造请求刚提出、材料还没到手时，不要调用这个工具，" +
      "只用 say 报价索要材料。",
    {
      id: z.string().describe("装备 id，简短英文/拼音 slug"),
      name: z.string().describe("装备名称，中文，要贴合玩家的描述"),
      rarity: z.number().int().describe("品阶，1-3，越高越稀有"),
      desc: z.string().describe("装备描述，太上老君的炼丹房口吻"),
      effects: z
        .array(z.discriminatedUnion("type", [statEffectSchema, onHitEffectSchema]))
        .describe("装备效果；最多 3 条会生效，数值超出丹炉火候上限会被自动收敛，不必纠结精确数字"),
    },
    async (args) => {
      const item = validateCraftedItem({
        id: args.id,
        name: args.name,
        rarity: args.rarity,
        desc: args.desc,
        effects: args.effects,
      });
      cb.onCraftItem(item);
      return { content: [{ type: "text", text: "已炼制完成，交给了玩家" }] };
    },
  );

  const npcTools = createSdkMcpServer({
    name: "npc",
    version: "0.1.0",
    tools: [sayTool, giveItemTool, setGoalTool, craftItemTool],
  });

  const prompt = `【最近的世界事件】
${eventsBlock}

【你和玩家的对话记录】
${historyBlock}

【玩家刚才说】
${playerText}

请调用 say 工具回应玩家这句话（必须调用且只调用一次 say）；如果剧情合适，
可以额外调用 give_item 或 set_goal。

${CRAFT_FLOW_GUIDANCE.replace("这一轮不要打造，只回应报价", "这一轮不要调用 craft_item，只用 say 报价").replace(
  "才正式打造",
  "才调用 craft_item 正式打造",
)}

除了这些工具调用，不要输出任何其他内容。`;

  let fallbackResultText: string | undefined;

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: persona.prompt,
      mcpServers: { npc: npcTools },
      allowedTools: [
        "mcp__npc__say",
        "mcp__npc__give_item",
        "mcp__npc__set_goal",
        "mcp__npc__craft_item",
      ],
      tools: [],
    },
  })) {
    if (message.type === "result") {
      fallbackResultText = message.subtype === "success" ? message.result : undefined;
      break;
    }
  }

  if (!sayCalled) {
    lastSayText = fallbackResultText?.trim() || `（${persona.name}沉默不语）`;
    cb.onSay(lastSayText);
  }

  return lastSayText;
}
