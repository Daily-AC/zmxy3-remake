import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getNpcPersona } from "./npc-registry.js";
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

/**
 * Ask an NPC to react to a line the player just said. Fires the given
 * callbacks synchronously as the LLM invokes tools (so the caller can push
 * npc_say / give_item / set_goal to the game the moment each happens),
 * and updates this NPC's conversation history as a side effect.
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

  // Crafting effect DSL: the schema below only constrains shape (which
  // fields exist, which enum a "stat"/"effect" name must come from) — it
  // does NOT constrain numeric ranges. That's intentional: numeric bounds
  // are enforced downstream by validateCraftedItem (src/craft-validate.ts),
  // a plain function with its own unit tests, so crafting stays safe no
  // matter what number the model decides to send.
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

如果玩家是在向你描述一件想要打造的装备（说明想要什么效果/外观/用途）：
1. 如果对话记录里玩家还没交材料、也没确认交付，这一轮不要调用 craft_item，
   只用 say 报价——说明需要什么材料（优先从"最近的世界事件"里玩家获得过的
   材料里选，没有就随口要一两样丹房常见材料，比如"两块白银矿石"）。
2. 只有当对话记录显示玩家已经明确交付/确认材料（比如说"给你" "在这"
   "确认" "好了"之类）之后，才调用 craft_item 正式打造，并且这一轮仍然
   要调用 say 说几句交货时的俏皮话。

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

  pushHistory(npcId, { role: "npc", text: lastSayText, at: Date.now() });
}
