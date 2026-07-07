// Pure validation/clamping for the crafting Effect DSL. Deliberately does not
// trust the tool schema alone: the model's tool-call arguments are treated as
// untyped input here and re-checked field by field, because a soft zod hint
// (e.g. z.number()) does not stop a model from sending an out-of-range value
// — this is the actual hard boundary that keeps a crafted item from ever
// being unbalanced or malformed, independent of what the LLM produced.
import type { CraftEffect, CraftedItem, OnHitEffect, StatEffect } from "./types.js";

const STAT_LIMITS: Record<StatEffect["stat"], number> = {
  atk: 50,
  def: 50,
  hp: 200,
  mp: 200,
  crit: 0.5,
};

const ONHIT_KINDS = new Set<OnHitEffect["effect"]>(["burn", "lifesteal", "freeze"]);
const ONHIT_CHANCE_MAX = 0.5;
const ONHIT_POWER_MAX = 30;
const MAX_EFFECTS = 3;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface EffectValidationResult {
  effects: CraftEffect[];
  /** true if any surviving effect had a numeric field pulled back into range */
  clamped: boolean;
  /** effects dropped entirely for having an illegal stat/effect name or bad types */
  rejectedCount: number;
  /** true if more than MAX_EFFECTS were submitted (extras silently dropped) */
  truncated: boolean;
}

export function validateEffects(raw: unknown): EffectValidationResult {
  const list = Array.isArray(raw) ? raw : [];
  const truncated = list.length > MAX_EFFECTS;
  const limited = list.slice(0, MAX_EFFECTS);

  let clamped = false;
  let rejectedCount = 0;
  const effects: CraftEffect[] = [];

  for (const entry of limited) {
    if (!entry || typeof entry !== "object") {
      rejectedCount++;
      continue;
    }
    const e = entry as Record<string, unknown>;

    if (e.type === "stat") {
      const stat = e.stat;
      if (typeof stat !== "string" || !(stat in STAT_LIMITS)) {
        rejectedCount++;
        continue;
      }
      if (typeof e.value !== "number" || !Number.isFinite(e.value)) {
        rejectedCount++;
        continue;
      }
      const max = STAT_LIMITS[stat as StatEffect["stat"]];
      const value = clampNumber(e.value, 0, max);
      if (value !== e.value) clamped = true;
      effects.push({ type: "stat", stat: stat as StatEffect["stat"], value });
      continue;
    }

    if (e.type === "onHit") {
      const effectKind = e.effect;
      if (typeof effectKind !== "string" || !ONHIT_KINDS.has(effectKind as OnHitEffect["effect"])) {
        rejectedCount++;
        continue;
      }
      if (
        typeof e.chance !== "number" ||
        !Number.isFinite(e.chance) ||
        typeof e.power !== "number" ||
        !Number.isFinite(e.power)
      ) {
        rejectedCount++;
        continue;
      }
      const chance = clampNumber(e.chance, 0, ONHIT_CHANCE_MAX);
      const power = clampNumber(e.power, 0, ONHIT_POWER_MAX);
      if (chance !== e.chance || power !== e.power) clamped = true;
      effects.push({ type: "onHit", effect: effectKind as OnHitEffect["effect"], chance, power });
      continue;
    }

    rejectedCount++;
  }

  return { effects, clamped, rejectedCount, truncated };
}

export interface RawCraftItemInput {
  id?: unknown;
  name?: unknown;
  rarity?: unknown;
  desc?: unknown;
  effects?: unknown;
}

const CLAMP_NOTE_STANDALONE = "丹炉火候不足，威力已收敛。";
const CLAMP_NOTE_APPEND = "（丹炉火候不足，威力已收敛）";

/** Validates and clamps a crafted item end to end. Always returns a
 * well-formed CraftedItem — never throws — so the server can forward
 * whatever the model attempted to craft, just brought back into bounds. */
export function validateCraftedItem(raw: RawCraftItemInput): CraftedItem {
  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : `item-${Date.now()}`;
  const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name : "无名法宝";

  const rarityNum =
    typeof raw.rarity === "number" && Number.isFinite(raw.rarity) ? Math.round(raw.rarity) : 1;
  const rarity = clampNumber(rarityNum, 1, 3) as 1 | 2 | 3;

  const baseDesc = typeof raw.desc === "string" ? raw.desc : "";

  const { effects, clamped, rejectedCount, truncated } = validateEffects(raw.effects);
  const needsNote = clamped || truncated || rejectedCount > 0;

  const desc = needsNote
    ? baseDesc
      ? `${baseDesc}${CLAMP_NOTE_APPEND}`
      : CLAMP_NOTE_STANDALONE
    : baseDesc;

  return { id, name, kind: "equip", rarity, desc, effects };
}
