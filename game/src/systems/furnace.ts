// Furnace (炼丹炉) synthesis core — Phaser-independent, unit-tested.
//
// The flow this backs: monsters drop materials → the player picks materials and
// describes the equipment they want in natural language → agent-server forges a
// unique piece → the game re-validates it here before it ever reaches the bag.
//
// SECURITY POSTURE — the game does not trust the server. The material set the
// player spends fixes an attribute *budget* (computed here, never taken from the
// server). Whatever equipment comes back is hard-clamped field by field against
// that budget's caps, illegal fields are dropped, and if the total value still
// exceeds what the materials paid for, the whole craft is REJECTED (materials
// refunded) rather than trimmed. agent-server has its own static sandbox clamp
// too, but this budget clamp is the authoritative one: a hostile or buggy server
// can never mint an item stronger than the materials justify.

import type { Item, Effect } from './items'
import { Inventory, addItem, removeItem, countItem } from './inventory'

// ---------- absolute engine ceilings (mirror agent-server craft-validate) ----------
// No crafted field may exceed these regardless of how many materials are spent.
// Raised to original-scale numbers once level monsters moved to canonical HP
// (bosses in the 万级 range); atk/def 50->200, hp/mp 200->800. The cost model is
// unchanged and stays symmetric: hp cost = value/4, so 800 hp costs 200, exactly
// one maxed atk. crit / onHit / effect-count ceilings are deliberately untouched.
const ENGINE_MAX = {
  atk: 200,
  def: 200,
  hp: 800,
  mp: 800,
  crit: 0.5,
  onHitChance: 0.5,
  onHitPower: 30,
} as const
const MAX_EFFECTS = 3

const ONHIT_KINDS = new Set<Extract<Effect, { type: 'onHit' }>['effect']>([
  'burn',
  'lifesteal',
  'freeze',
])
const STAT_KINDS = new Set<Extract<Effect, { type: 'stat' }>['stat']>([
  'atk',
  'def',
  'hp',
  'mp',
  'crit',
])

// ---------- budget model ----------

/** Value points a single unit of material contributes, by rarity. The jumps
 * (2 → 6 → 15) roughly track the drop-rarity gradient in data/drops.json so a
 * lone rare material is worth several commons. */
const MATERIAL_POINTS: Record<1 | 2 | 3, number> = { 1: 2, 2: 6, 3: 15 }

export function materialPoints(rarity: 1 | 2 | 3): number {
  return MATERIAL_POINTS[rarity]
}

export interface AttributeBudget {
  /** Total spendable value; the sum of every crafted effect's cost may not exceed this. */
  points: number
  /** Per-field soft ceilings, min(engine max, budget-scaled) so no single field alone can overspend. */
  caps: {
    atk: number
    def: number
    hp: number
    mp: number
    crit: number
    onHitChance: number
    onHitPower: number
  }
  maxEffects: number
}

export interface MaterialLot {
  item: Item
  qty: number
}

/**
 * Cost of an effect in budget points. The exchange rates are chosen so that a
 * single field pushed to its budget-scaled cap costs exactly `points` — i.e. the
 * caps and the cost model are two views of the same rate table:
 *   atk/def  1 pt each              hp/mp  1 pt per 4
 *   crit     100 pt per 1.0         onHit  power + chance*40
 */
export function effectCost(effect: Effect): number {
  if (effect.type === 'stat') {
    switch (effect.stat) {
      case 'atk':
      case 'def':
        return effect.value
      case 'hp':
      case 'mp':
        return effect.value / 4
      case 'crit':
        return effect.value * 100
      default:
        return 0
    }
  }
  if (effect.type === 'onHit') {
    return effect.power + effect.chance * 40
  }
  return 0
}

/** Materials → attribute budget. Empty selection yields a zero budget (nothing craftable). */
export function computeBudget(lots: MaterialLot[]): AttributeBudget {
  let points = 0
  for (const lot of lots) {
    const qty = Math.max(0, Math.floor(lot.qty))
    points += materialPoints(lot.item.rarity) * qty
  }
  return {
    points,
    caps: {
      atk: Math.min(ENGINE_MAX.atk, points),
      def: Math.min(ENGINE_MAX.def, points),
      hp: Math.min(ENGINE_MAX.hp, points * 4),
      mp: Math.min(ENGINE_MAX.mp, points * 4),
      crit: Math.min(ENGINE_MAX.crit, points / 100),
      onHitChance: Math.min(ENGINE_MAX.onHitChance, points / 40),
      onHitPower: Math.min(ENGINE_MAX.onHitPower, points),
    },
    maxEffects: MAX_EFFECTS,
  }
}

// ---------- request construction ----------

export interface CraftMaterialRef {
  id: string
  name: string
  rarity: 1 | 2 | 3
  qty: number
}

export interface CraftRequestPayload {
  description: string
  materials: CraftMaterialRef[]
  budget: AttributeBudget
}

/** Turn a natural-language description + the selected material lots into the
 * payload sent to agent-server. The budget travels with the request purely as a
 * hint so the forge can aim within it — the game re-derives and re-enforces it
 * on the way back regardless of what the server does with it. */
export function buildCraftRequest(description: string, lots: MaterialLot[]): CraftRequestPayload {
  return {
    description,
    materials: lots.map((l) => ({
      id: l.item.id,
      name: l.item.name,
      rarity: l.item.rarity,
      qty: Math.max(0, Math.floor(l.qty)),
    })),
    budget: computeBudget(lots),
  }
}

// ---------- return validation: clamp against budget, reject if over ----------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** One effect from an untrusted server payload, re-checked field by field and
 * clamped to the budget caps. Returns null for anything malformed or with an
 * illegal stat/effect name (dropped, never coerced into a legal one). */
function sanitizeEffect(raw: unknown, caps: AttributeBudget['caps']): Effect | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>

  if (e.type === 'stat') {
    const stat = e.stat
    if (typeof stat !== 'string' || !STAT_KINDS.has(stat as never)) return null
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return null
    const cap = caps[stat as 'atk' | 'def' | 'hp' | 'mp' | 'crit']
    return { type: 'stat', stat: stat as never, value: clamp(e.value, 0, cap) }
  }

  if (e.type === 'onHit') {
    const effect = e.effect
    if (typeof effect !== 'string' || !ONHIT_KINDS.has(effect as never)) return null
    if (
      typeof e.chance !== 'number' ||
      !Number.isFinite(e.chance) ||
      typeof e.power !== 'number' ||
      !Number.isFinite(e.power)
    ) {
      return null
    }
    return {
      type: 'onHit',
      effect: effect as never,
      chance: clamp(e.chance, 0, caps.onHitChance),
      power: clamp(e.power, 0, caps.onHitPower),
    }
  }

  return null
}

export type CraftValidation =
  | { ok: true; item: Item; totalCost: number }
  | { ok: false; reason: 'over_budget'; totalCost: number; budget: number }

/**
 * Validate a server-returned crafted item against a budget. Effects are
 * sanitized + per-field clamped to the budget caps, illegal effects dropped, the
 * list truncated to `maxEffects`. If the surviving effects' total cost still
 * exceeds the budget, the craft is rejected outright (caller refunds materials).
 */
export function validateCraftedEquipment(raw: unknown, budget: AttributeBudget): CraftValidation {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const id =
    typeof obj.id === 'string' && obj.id.trim().length > 0 ? obj.id : `forged-${Date.now()}`
  const name =
    typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name : '无名法宝'
  const rarityNum =
    typeof obj.rarity === 'number' && Number.isFinite(obj.rarity) ? Math.round(obj.rarity) : 1
  const rarity = clamp(rarityNum, 1, 3) as 1 | 2 | 3

  // Sanitize first, then truncate: illegal effects are dropped outright and
  // don't get to push legal ones out of the maxEffects budget (a hostile server
  // can't pad a payload with junk to bump a real effect past the cap).
  const rawEffects = Array.isArray(obj.effects) ? obj.effects : []
  const effects: Effect[] = []
  for (const re of rawEffects) {
    const sanitized = sanitizeEffect(re, budget.caps)
    if (sanitized) effects.push(sanitized)
    if (effects.length >= budget.maxEffects) break
  }

  const totalCost = effects.reduce((sum, e) => sum + effectCost(e), 0)
  // Small epsilon so floating hp/mp division (value/4) can't trip an exact-budget craft.
  if (totalCost > budget.points + 1e-9) {
    return { ok: false, reason: 'over_budget', totalCost, budget: budget.points }
  }

  const item: Item = { id, name, kind: 'equip', rarity, effects }
  return { ok: true, item, totalCost }
}

// ---------- material consumption transaction ----------
//
// Request out → materials LOCKED (removed from the bag, recorded on the tx).
// Success → CONSUME (already gone; just finalize). Failure/timeout/reject →
// REFUND (put them back). Consume and refund are idempotent and only act on a
// still-pending tx, so a late timeout after a success can't double-refund.

export type CraftTxStatus = 'pending' | 'consumed' | 'refunded'

export interface CraftTransaction {
  requestId: string
  lots: MaterialLot[]
  status: CraftTxStatus
}

/** Remove the selected materials from the bag and open a pending transaction.
 * Returns null (bag untouched) if any lot isn't fully available. */
export function lockMaterials(
  inv: Inventory,
  requestId: string,
  lots: MaterialLot[],
): CraftTransaction | null {
  for (const lot of lots) {
    if (countItem(inv, lot.item.id) < Math.max(0, Math.floor(lot.qty))) return null
  }
  for (const lot of lots) {
    removeItem(inv, lot.item.id, Math.max(0, Math.floor(lot.qty)))
  }
  return { requestId, lots, status: 'pending' }
}

/** Finalize a successful craft: the materials were already removed at lock time. */
export function consumeMaterials(tx: CraftTransaction): boolean {
  if (tx.status !== 'pending') return false
  tx.status = 'consumed'
  return true
}

/** Return locked materials to the bag after a failed/rejected/timed-out craft. */
export function refundMaterials(inv: Inventory, tx: CraftTransaction): boolean {
  if (tx.status !== 'pending') return false
  for (const lot of tx.lots) {
    addItem(inv, lot.item, Math.max(0, Math.floor(lot.qty)))
  }
  tx.status = 'refunded'
  return true
}

export type CraftSettlement =
  | { ok: true; item: Item; totalCost: number }
  | { ok: false; reason: 'over_budget' | 'bag_full' | 'stale_transaction' }

/**
 * Settle one server-authored forge response atomically. A product is inserted
 * before the locked materials are finalized; if validation or insertion fails,
 * every locked lot is refunded. This is the shared authority boundary used by
 * both map and legacy battle hosts.
 */
export function settleCraftTransaction(
  inventory: Inventory,
  tx: CraftTransaction,
  rawItem: unknown,
  budget: AttributeBudget,
): CraftSettlement {
  if (tx.status !== 'pending') return { ok: false, reason: 'stale_transaction' }
  const validation = validateCraftedEquipment(rawItem, budget)
  if (!validation.ok) {
    refundMaterials(inventory, tx)
    return { ok: false, reason: 'over_budget' }
  }
  if (!addItem(inventory, validation.item, 1).ok) {
    refundMaterials(inventory, tx)
    return { ok: false, reason: 'bag_full' }
  }
  consumeMaterials(tx)
  return { ok: true, item: validation.item, totalCost: validation.totalCost }
}
