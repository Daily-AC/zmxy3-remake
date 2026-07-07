// Wire protocol between the game client and the agent-server, over a single
// WebSocket connection. Every message is one JSON object per ws frame (no
// newline framing needed — ws already frames messages for us).

/** Minimal item schema for give_item. Kept intentionally small; the game's
 * own data/ JSON files define the authoritative fields for real items —
 * this is just enough for the NPC brain to describe a reward. */
export interface NpcItem {
  id: string;
  name: string;
  kind: "equipment" | "material" | "consumable" | "quest";
  desc?: string;
  qty?: number;
}

export interface NpcGoal {
  id: string;
  title: string;
  desc?: string;
}

/** Crafting effect DSL. This is the sandbox: the LLM can only ever produce
 * one of these two shapes (checked by the tool schema), and the numeric
 * fields are hard-clamped server-side regardless of what the model sends
 * (see craft-validate.ts) — there is no code generation or free-form
 * execution path here, just a small closed vocabulary of stat bonuses and
 * on-hit procs. */
export interface StatEffect {
  type: "stat";
  stat: "atk" | "def" | "hp" | "mp" | "crit";
  value: number;
}

export interface OnHitEffect {
  type: "onHit";
  effect: "burn" | "lifesteal" | "freeze";
  chance: number; // 0-1, hard-clamped to <=0.5
  power: number; // hard-clamped to <=30
}

export type CraftEffect = StatEffect | OnHitEffect;

export interface CraftedItem {
  id: string;
  name: string;
  kind: "equip";
  rarity: 1 | 2 | 3;
  desc: string;
  effects: CraftEffect[]; // capped at 3 by the server, regardless of input length
}

// ---------- game -> server ----------

export interface HelloMessage {
  type: "hello";
  player?: { id?: string; name?: string };
}

export interface WorldEventMessage {
  type: "world_event";
  kind: string; // e.g. "monster_killed", "player_hp", "item_obtained"
  data?: Record<string, unknown>;
  at?: number; // unix ms; server fills in if omitted
}

export interface PlayerSayMessage {
  type: "player_say";
  npcId: string;
  playerId?: string;
  text: string;
}

/** A single material lot the player is spending in a furnace craft. Mirrors
 * game/src/systems/furnace.ts CraftMaterialRef (the two copies are kept in sync
 * by hand, same as the rest of this protocol file). */
export interface CraftMaterialRef {
  id: string;
  name: string;
  rarity: 1 | 2 | 3;
  qty: number;
}

/** Attribute budget the game computed from the spent materials. Sent as a hint
 * so the forge can aim within it; the game re-derives and hard-enforces it on
 * the returned item regardless. Mirrors furnace.ts AttributeBudget. */
export interface AttributeBudget {
  points: number;
  caps: {
    atk: number;
    def: number;
    hp: number;
    mp: number;
    crit: number;
    onHitChance: number;
    onHitPower: number;
  };
  maxEffects: number;
}

/** Structured furnace craft request (distinct from the free-form `player_say`
 * crafting chat): materials are already chosen and the budget already computed,
 * so it's a single request/response round keyed by `requestId`. */
export interface CraftRequestMessage {
  type: "craft_request";
  npcId: string;
  requestId: string;
  playerId?: string;
  description: string;
  materials: CraftMaterialRef[];
  budget: AttributeBudget;
}

export type InboundMessage =
  | HelloMessage
  | WorldEventMessage
  | PlayerSayMessage
  | CraftRequestMessage;

// ---------- server -> game ----------

export interface WelcomeMessage {
  type: "welcome";
  npcIds: string[];
}

export interface NpcThinkingMessage {
  type: "npc_thinking";
  npcId: string;
}

export interface NpcSayMessage {
  type: "npc_say";
  npcId: string;
  text: string;
}

export interface GiveItemMessage {
  type: "give_item";
  npcId: string;
  item: NpcItem;
}

export interface SetGoalMessage {
  type: "set_goal";
  npcId: string;
  goal: NpcGoal;
}

export interface CraftItemMessage {
  type: "craft_item";
  npcId: string;
  item: CraftedItem;
}

/** Response to a `craft_request`: a server-forged, statically-clamped item plus
 * 太上老君's line quoting the materials/description. Still re-clamped game-side
 * against the request budget before it enters the bag. */
export interface CraftResultMessage {
  type: "craft_result";
  npcId: string;
  requestId: string;
  item: CraftedItem;
  flavor: string;
}

/** Server-side refusal to forge (unforgeable request / internal failure). The
 * game refunds the locked materials. */
export interface CraftRejectMessage {
  type: "craft_reject";
  npcId: string;
  requestId: string;
  reason: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type OutboundMessage =
  | WelcomeMessage
  | NpcThinkingMessage
  | NpcSayMessage
  | GiveItemMessage
  | SetGoalMessage
  | CraftItemMessage
  | CraftResultMessage
  | CraftRejectMessage
  | ErrorMessage;
