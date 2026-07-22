import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getNpcPersona, type NpcPersona } from "./npc-registry.js";
import {
  getHistory,
  pushHistory,
  recentWorldEvents,
  type WorldEventRecord,
} from "./npc-state.js";
import { getOpencode, OPENCODE_MODEL, stripCodeFence, safeJsonParse } from "./llm.js";
import {
  checkMaterials,
  findPlayableRecipe,
  listPlayableRecipes,
} from "./furnace-recipes.js";
import type { NpcItem, NpcGoal, CraftMaterialRef } from "./types.js";

export interface NpcBrainCallbacks {
  onSay: (text: string) => void;
  onGiveItem: (item: NpcItem) => void;
  onSetGoal: (goal: NpcGoal) => void;
  onCraftRecipe: (recipeId: string) => void;
}

export interface NpcTurnContext {
  materials?: CraftMaterialRef[];
  soul?: number;
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

const RECIPE_CRAFT_GUIDANCE = `如果玩家是在请求原版确定配方打造（例如"帮我炼尾火棍"）：
1. 优先使用【炼丹炉确定配方】和【玩家当前材料/灵魂快照】判断，不要编造配方、材料或灵魂数量。
2. 玩家问"你能打造什么"时，列出少量匹配配方或概括可打造清单；玩家问缺什么时，按快照指出缺少的制作书、材料或灵魂。
3. 只有当玩家明确要打造某个已知配方，并且快照显示材料/灵魂大体齐备时，才发出 craft_recipe 结构化指令。
4. 自定义装备只能从炼丹炉界面提交材料后走独立 craft_request 事务；聊天绝不能直接生成装备。
5. 当前游戏只开放列表中明确给出的配方，不得提及或打造其他角色、饰品或法宝。
6. 玩家明确求你白送武器时，可以尝试 give_item，但 id 必须是 ptdxzg、名称必须是普通的行者棍；不要承诺一定送到，游戏端会独立判定概率。`;

function recipeReferenceBlock(): string {
  return listPlayableRecipes()
    .map((recipe) => {
      const role = recipe.role ? `${recipe.role} ` : "";
      const mats = recipe.materials.map((m) => `${m.name}(${m.fillName})x${m.qty}`).join(" + ");
      const book = recipe.requiresBook === false ? '无需制作书' : recipe.bookName;
      return `${recipe.bookFillName}: ${recipe.productName}（${role}${recipe.quality}）= ${book} + ${mats} + 灵魂${recipe.soulCost}`;
    })
    .join("\n");
}

function recipeSnapshotBlock(context: NpcTurnContext): string {
  const soul = context.soul ?? 0;
  const materials = context.materials ?? [];
  const materialLine = materials.length
    ? materials.map((m) => `${m.name}(${m.id})x${m.qty}`).join("，")
    : "（当前快照里没有材料/制作书）";
  return `灵魂：${soul}\n物品：${materialLine}`;
}

export function dispatchCraftRecipeIntent(recipeId: string, cb: NpcBrainCallbacks): boolean {
  if (!findPlayableRecipe(recipeId)) return false;
  cb.onCraftRecipe(recipeId);
  return true;
}

/**
 * Ask an NPC to react to a line the player just said. Dispatches to the
 * configured provider (opencode+DeepSeek by default, claude-agent-sdk as an
 * A/B option), which fires the given callbacks as it decides on
 * say/give_item/set_goal/craft_recipe, and updates this NPC's conversation
 * history as a side effect.
 */
export async function askNpc(
  npcId: string,
  playerText: string,
  cb: NpcBrainCallbacks,
  context: NpcTurnContext = {},
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
  const recipesBlock = recipeReferenceBlock();
  const recipeContextBlock = recipeSnapshotBlock(context);
  const finalSayText =
    provider === "claude"
      ? await askViaClaudeAgentSdk(persona, eventsBlock, historyBlock, recipesBlock, recipeContextBlock, playerText, cb, context)
      : await askViaOpencode(persona, eventsBlock, historyBlock, recipesBlock, recipeContextBlock, playerText, cb);

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
  craft_recipe: z
    .object({
      recipeId: z.string(),
    })
    .optional(),
});

type NpcTurn = z.infer<typeof npcTurnSchema>;

export function parseNpcTurn(rawText: string): NpcTurn | undefined {
  const parsedRaw = safeJsonParse(stripCodeFence(rawText));
  if (parsedRaw === undefined) return undefined;
  const parsed = npcTurnSchema.safeParse(parsedRaw);
  return parsed.success ? parsed.data : undefined;
}

async function askViaOpencode(
  persona: NpcPersona,
  eventsBlock: string,
  historyBlock: string,
  recipesBlock: string,
  recipeContextBlock: string,
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
  "craft_recipe": { "recipeId": "确定配方制作书fillName，例如whgzzs" }
}
只有剧情确实需要时才带上 give_item / set_goal / craft_recipe 字段，平时只需要 say 一个字段，不要三个字段都编出来。
确定配方打造只能使用 craft_recipe。自定义装备由游戏的炼丹炉事务处理，聊天回复绝不能带 craft_item 或凭空生成装备。
重要格式要求：字符串值内部绝对不能出现英文双引号 "，会破坏 JSON 结构导致整轮回复失效；
如果要在台词里引用物品名/说法，一律用中文引号「」或『』，不要用 " " 或 “ ”。`;

  const prompt = `【最近的世界事件】
${eventsBlock}

【你和玩家的对话记录】
${historyBlock}

【炼丹炉确定配方】
${recipesBlock}

【玩家当前材料/灵魂快照】
${recipeContextBlock}

【玩家刚才说】
${playerText}

请只输出符合上面 JSON 格式的一个对象，不要输出其他任何文字。

${RECIPE_CRAFT_GUIDANCE}`;

  let finalSay = `（${persona.name}沉默不语）`;
  let finalTurn: NpcTurn | undefined;
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

      const turn = parseNpcTurn(rawText);
      if (turn) {
        finalTurn = turn;
        finalSay = turn.say;
      } else {
        console.error(
          "[brain:opencode] failed to parse/validate NPC turn JSON",
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
  if (finalTurn?.give_item) cb.onGiveItem(finalTurn.give_item);
  if (finalTurn?.set_goal) cb.onSetGoal(finalTurn.set_goal);
  if (finalTurn?.craft_recipe) dispatchCraftRecipeIntent(finalTurn.craft_recipe.recipeId, cb);
  return finalSay;
}

// ============================================================================
// Provider: claude-agent-sdk (A/B option, real in-process MCP tool calls)
// ============================================================================

async function askViaClaudeAgentSdk(
  persona: NpcPersona,
  eventsBlock: string,
  historyBlock: string,
  recipesBlock: string,
  recipeContextBlock: string,
  playerText: string,
  cb: NpcBrainCallbacks,
  context: NpcTurnContext,
): Promise<string> {
  let sayCalled = false;
  let lastSayText = "";
  const pendingRecipeIds: string[] = [];

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

  const listRecipesTool = tool(
    "list_recipes",
    "列出原版确定配方炼丹炉能打造的制作书/产物/材料/灵魂消耗。玩家问你能打造什么时使用。",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(listPlayableRecipes()) }],
    }),
  );

  const checkMaterialsTool = tool(
    "check_materials",
    "按玩家当前材料/灵魂快照检查某个确定配方是否够料。只做建议，真正扣料由游戏端执行。",
    {
      recipeId: z.string().describe("制作书 fillName，例如 whgzzs"),
    },
    async (args) => {
      const recipe = findPlayableRecipe(args.recipeId);
      if (!recipe) return { content: [{ type: "text", text: "未知配方" }] };
      const result = checkMaterials(recipe, context.materials ?? [], context.soul ?? 0);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  const craftRecipeTool = tool(
    "craft_recipe",
    "请求游戏端按某个原版确定配方打造。只传 recipeId；游戏端会重新校验制作书、材料、灵魂和背包容量。",
    {
      recipeId: z.string().describe("制作书 fillName，例如 whgzzs"),
    },
    async (args) => {
      if (!findPlayableRecipe(args.recipeId)) {
        return { content: [{ type: "text", text: "当前版本未开放这张配方" }] };
      }
      pendingRecipeIds.push(args.recipeId);
      return { content: [{ type: "text", text: "已把配方打造意图交给游戏端校验" }] };
    },
  );

  const npcTools = createSdkMcpServer({
    name: "npc",
    version: "0.1.0",
    tools: [sayTool, giveItemTool, setGoalTool, listRecipesTool, checkMaterialsTool, craftRecipeTool],
  });

  const prompt = `【最近的世界事件】
${eventsBlock}

【你和玩家的对话记录】
${historyBlock}

【炼丹炉确定配方】
${recipesBlock}

【玩家当前材料/灵魂快照】
${recipeContextBlock}

【玩家刚才说】
${playerText}

请调用 say 工具回应玩家这句话（必须调用且只调用一次 say）；如果剧情合适，
可以额外调用 give_item、set_goal、list_recipes、check_materials 或 craft_recipe。

${RECIPE_CRAFT_GUIDANCE.replace("才发出 craft_recipe 结构化指令", "才调用 craft_recipe 工具")}

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
        "mcp__npc__list_recipes",
        "mcp__npc__check_materials",
        "mcp__npc__craft_recipe",
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
  for (const recipeId of pendingRecipeIds) dispatchCraftRecipeIntent(recipeId, cb);

  return lastSayText;
}
