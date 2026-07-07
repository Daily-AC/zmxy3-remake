// Furnace forge: turns a structured craft_request (chosen materials + budget +
// natural-language description) into a single crafted item + 太上老君's line.
//
// This REUSES the existing crafting sandbox — every provider's raw output goes
// through validateCraftedItem (src/craft-validate.ts), the same static clamp
// (atk/def<=50, hp/mp<=200, crit<=0.5, onHit chance<=0.5/power<=30, <=3 effects)
// that guards the conversational craft_item path. There is no code generation
// or free-form execution: the model only ever fills a closed stat/onHit DSL, and
// the numbers are clamped regardless of what it sends. The game then re-clamps
// against the material budget as the authoritative boundary (it does not trust
// this server), so even a broken forge can never mint an over-budget item.
//
// Providers, selected by NPC_BRAIN_PROVIDER (same switch as the brain):
//   - "mock":     deterministic, no LLM — used by the e2e forge test and any
//                 offline run. Intentionally emits out-of-range values so the
//                 clamp is exercised over the wire.
//   - "opencode": opencode serve + DeepSeek V4 Flash (default), single-shot JSON.
//   - "claude":   @anthropic-ai/claude-agent-sdk single-shot, A/B option.

import { z } from "zod";
import { getNpcPersona } from "./npc-registry.js";
import { validateCraftedItem, type RawCraftItemInput } from "./craft-validate.js";
import { getOpencode, OPENCODE_MODEL, stripCodeFence, safeJsonParse } from "./llm.js";
import type { CraftRequestMessage, CraftedItem } from "./types.js";

export interface ForgeOutcome {
  item: CraftedItem;
  flavor: string;
}

type ForgeProvider = "mock" | "opencode" | "claude";

function getForgeProvider(): ForgeProvider {
  const p = process.env.NPC_BRAIN_PROVIDER;
  if (p === "mock") return "mock";
  if (p === "claude") return "claude";
  return "opencode";
}

// Raw (pre-clamp) forge output: the craftable fields + a flavor line. The craft
// fields are deliberately typed loose (RawCraftItemInput) — validateCraftedItem
// treats them as untrusted and re-checks every field.
interface RawForge {
  craft: RawCraftItemInput;
  flavor: string;
}

/** Forge an item for a craft request. Never throws for provider-level failures:
 * a failed LLM turn falls back to a plain item so the game always gets a
 * response (and can still choose to reject it against the budget). */
export async function forgeEquipment(
  req: CraftRequestMessage,
  opts: { provider?: ForgeProvider } = {},
): Promise<ForgeOutcome> {
  const provider = opts.provider ?? getForgeProvider();
  const raw =
    provider === "mock"
      ? forgeViaMock(req)
      : provider === "claude"
        ? await forgeViaClaude(req)
        : await forgeViaOpencode(req);

  // Same sandbox the conversational path uses. Independent of the game's own
  // budget clamp; this is the server's static safety net.
  const item = validateCraftedItem(raw.craft);
  return { item, flavor: raw.flavor };
}

// ---------------------------------------------------------------------------
// Provider: mock (deterministic, no LLM)
// ---------------------------------------------------------------------------

function materialNames(req: CraftRequestMessage): string {
  return req.materials.map((m) => m.name).join("、") || "些许材料";
}

/** Deterministic forge. Emits an intentionally OUT-OF-RANGE atk (and an over-max
 * onHit when the description asks for fire/blood) so a test can prove the static
 * clamp fires over the real WebSocket, then validateCraftedItem brings it back
 * into range. The flavor line quotes the materials and the player's description,
 * in 太上老君's voice. */
export function forgeViaMock(req: CraftRequestMessage): RawForge {
  const desc = req.description ?? "";
  const wantsFire = /火|焰|烧|烫|burn|flame|fire/i.test(desc);
  const wantsBlood = /血|吸|lifesteal|drain/i.test(desc);
  const wantsFreeze = /冰|冻|寒|freeze|frost|ice/i.test(desc);

  const effects: unknown[] = [
    { type: "stat", stat: "atk", value: 999 }, // over ENGINE max -> clamped to 50
  ];
  if (wantsFire) effects.push({ type: "onHit", effect: "burn", chance: 0.9, power: 999 });
  else if (wantsBlood) effects.push({ type: "onHit", effect: "lifesteal", chance: 0.9, power: 999 });
  else if (wantsFreeze) effects.push({ type: "onHit", effect: "freeze", chance: 0.9, power: 999 });

  const mats = materialNames(req);
  return {
    craft: {
      id: `forge-${req.requestId}`,
      name: "试炉法宝",
      rarity: 3,
      desc: `太上老君以${mats}炼成，应「${desc}」之请`,
      effects,
    },
    flavor: `哼，就这点${mats}也敢来炼宝？也罢也罢——老夫且看火候，成了，拿去吧猴头。`,
  };
}

// ---------------------------------------------------------------------------
// shared forge prompt + schema for the two LLM providers
// ---------------------------------------------------------------------------

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
const forgeTurnSchema = z.object({
  name: z.string(),
  rarity: z.number(),
  desc: z.string(),
  effects: z.array(z.discriminatedUnion("type", [statEffectSchema, onHitEffectSchema])).optional(),
  flavor: z.string().optional(),
});

function forgeSystemPrompt(): string {
  const persona = getNpcPersona("laojun");
  return `${persona?.prompt ?? "你是太上老君，天庭炼丹房的主人。"}

现在你在丹炉前，要按玩家交来的材料和描述，当场炼一件独一无二的装备。
你只能用一个 JSON 对象回复，不能有任何其他文字，不能用 markdown 代码块包裹。
JSON 格式（字段说明，不要照抄字面值）：
{
  "name": "装备中文名，要贴合玩家的描述",
  "rarity": 1到3的品阶,
  "desc": "装备描述，丹房口吻",
  "effects": [ {"type":"stat","stat":"atk|def|hp|mp|crit","value":数值} 或 {"type":"onHit","effect":"burn|lifesteal|freeze","chance":0到1,"power":数值} ]（最多3条）,
  "flavor": "你炼宝交货时对猴头说的一两句俏皮话，要提到用的材料和他想要的东西"
}
数值不必纠结精确上限——丹炉会自动收敛超出火候的部分。尽量贴着玩家给的材料价值来炼，材料寒酸就别炼神器。
重要格式要求：字符串值内部绝对不能出现英文双引号 "，会破坏 JSON；引用东西一律用中文引号「」。`;
}

function forgePrompt(req: CraftRequestMessage): string {
  const mats = req.materials
    .map((m) => `${m.name}（稀有度${m.rarity}）×${m.qty}`)
    .join("，");
  const caps = req.budget.caps;
  return `【玩家交来的材料】
${mats || "（没报材料）"}

【本次炼制的属性预算】
总预算约 ${Math.round(req.budget.points)} 点；参考上限：攻击/防御≤${Math.round(caps.atk)}/${Math.round(
    caps.def,
  )}，气血≤${Math.round(caps.hp)}，法力≤${Math.round(caps.mp)}，暴击≤${caps.crit.toFixed(
    2,
  )}，触发几率≤${caps.onHitChance.toFixed(2)}、威力≤${Math.round(caps.onHitPower)}。
材料越寒酸，属性越要克制；别超出预算，超了丹炉会把多的收走。

【玩家想要的装备】
${req.description || "（玩家没说清楚，你看着炼一件顺手的）"}

请只输出符合上面 JSON 格式的一个对象，不要输出其他任何文字。`;
}

function rawForgeFromTurn(
  req: CraftRequestMessage,
  turn: z.infer<typeof forgeTurnSchema>,
): RawForge {
  return {
    craft: {
      id: `forge-${req.requestId}`,
      name: turn.name,
      rarity: turn.rarity,
      desc: turn.desc,
      effects: turn.effects ?? [],
    },
    flavor:
      turn.flavor && turn.flavor.trim().length > 0
        ? turn.flavor
        : `罢了，拿去吧猴头，这${materialNames(req)}没白费。`,
  };
}

/** Last-resort forge output when a provider turn fails to parse — a plain item
 * plus a generic line, so the game still gets a well-formed response. */
function fallbackForge(req: CraftRequestMessage): RawForge {
  return {
    craft: {
      id: `forge-${req.requestId}`,
      name: "无名法宝",
      rarity: 1,
      desc: `太上老君以${materialNames(req)}勉强炼成`,
      effects: [{ type: "stat", stat: "atk", value: 5 }],
    },
    flavor: `火候没到，将就着使吧猴头。`,
  };
}

// ---------------------------------------------------------------------------
// Provider: opencode + DeepSeek V4 Flash (default), single-shot JSON
// ---------------------------------------------------------------------------

async function forgeViaOpencode(req: CraftRequestMessage): Promise<RawForge> {
  const { client } = await getOpencode();
  const created = await client.session.create();
  if (created.error || !created.data) {
    console.error("[forge:opencode] failed to create session", created.error);
    return fallbackForge(req);
  }
  const sessionId = created.data.id;
  try {
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: OPENCODE_MODEL,
        system: forgeSystemPrompt(),
        parts: [{ type: "text", text: forgePrompt(req) }],
      },
    });
    if (result.error) {
      console.error("[forge:opencode] prompt request failed", result.error);
      return fallbackForge(req);
    }
    const rawText = result.data.parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim();
    const parsed = forgeTurnSchema.safeParse(safeJsonParse(stripCodeFence(rawText)));
    if (parsed.success) return rawForgeFromTurn(req, parsed.data);
    console.error("[forge:opencode] failed to parse forge JSON", parsed.error, rawText);
    return fallbackForge(req);
  } catch (err) {
    console.error("[forge:opencode] request threw", err);
    return fallbackForge(req);
  } finally {
    client.session.delete({ path: { id: sessionId } }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Provider: claude-agent-sdk (A/B option), single-shot JSON text
// ---------------------------------------------------------------------------

async function forgeViaClaude(req: CraftRequestMessage): Promise<RawForge> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  let resultText: string | undefined;
  try {
    for await (const message of query({
      prompt: forgePrompt(req),
      options: { systemPrompt: forgeSystemPrompt(), tools: [] },
    })) {
      if (message.type === "result") {
        resultText = message.subtype === "success" ? message.result : undefined;
        break;
      }
    }
  } catch (err) {
    console.error("[forge:claude] query threw", err);
    return fallbackForge(req);
  }
  const parsed = forgeTurnSchema.safeParse(safeJsonParse(stripCodeFence((resultText ?? "").trim())));
  if (parsed.success) return rawForgeFromTurn(req, parsed.data);
  console.error("[forge:claude] failed to parse forge JSON", parsed.error, resultText);
  return fallbackForge(req);
}
