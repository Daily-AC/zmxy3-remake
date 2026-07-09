// Phaser-independent recovery of the original HP/MP restore mechanic,
// decompiled directly from `export.cure.SmallHP/SmallMP/BigHP.as` --
// vendor/zmxy_res's other resource package, `out_res/backpack1.swf` (a
// separate SWF from the main-logic one used everywhere else in this
// project's decompiles; `export.cure.*` only exists there, though the
// classes are also reachable via `打开我开始玩.swf`'s own `-selectclass
// export.cure.*`, confirmed both ways agree).
//
// ## Why this took a second SWF to find
//
// heroGrowth.ts's report flagged that no simple "drink a potion, heal X HP"
// item turned up after exhaustively searching `my/AllEquipment.as` (the
// backpack/equipment item database, 800+ entries -- every "丹" hit there is
// a furnace crafting material, a pet-only item, or a passive regen
// accessory) and `export/pack/PackThings.as` (the backpack right-click
// item-use dispatcher, ~30 branches, none of them a flat heal). That search
// was correct as far as it went -- the real mechanic isn't a backpack item
// at all. It's a WORLD PICKUP ORB, spawned directly by `BaseMonster.
// addMedicine()` on a kill (part of the same `dropAura()` flow
// monsters-index.md already documented as "先调用 addMedicine()"), never
// funneled through the backpack system this project's `items.ts`/
// `inventory.ts` model.
//
// ## The three real pickup types
//
// `export.cure.SmallHP.as` (base class), `SmallMP.as`/`BigHP.as` (both
// extend it, overriding only `cure()`):
//
//   SmallHP ("SHp"): +25% of max HP, instant, on first contact.
//   BigHP   ("BHp"): +50% of max HP, instant, on first contact.
//   SmallMP ("SMp"): +25% of max MP, instant, on first contact.
//   (there is no "BigMP" -- confirmed by an exhaustive `-selectclass
//   export.cure.*` decompile turning up exactly these 3 classes, nothing else)
//
// All three despawn after `gc.frameClips * 10` = 10 real seconds if never
// collected (SmallHP.as's `step()`; BigHP/SmallMP inherit it unmodified --
// their own `allcount` overrides, 192/72, are an unused BaseObject
// animation-frame-count field in this subclass, not a despawn timer;
// despawn is always exactly 10s for all three).
//
// Collection trigger (`SmallHP.colwho()`): `|x - heroX| <= 700` AND
// `|y - heroY| < 200`, THEN a precise pixel `HitTest.complexHitTestObject`.
// This module models the coarse proximity box only (`isWithinPickupRange`)
// -- same "AABB first-pass, skip the pixel-perfect test" simplification
// this project's `hitbox.ts` already documents for melee hitboxes.
//
// ## Heal-block interaction (the actual point of this task)
//
// SmallHP/BigHP both call `curWho.roleProperies.setHHP(getHHP() + curNum)`
// -- the EXACT same function heroGrowth.ts already recovered and gated
// (`applyHeroHpChange`/`applyHeroHpDelta`, re-used here, not re-implemented).
// **A heal-block-active hero who touches an HP orb gets nothing: the whole
// heal is dropped, not partially applied** -- same rule as every other heal
// source. SmallMP calls `setMMP()`, which has no such gate (confirmed
// directly reading BaseRoleProperies.as during the heroGrowth task) -- MP
// orbs are NEVER blocked by ERLANGSHEN_HP_REJECT. `useConsumable()` below
// reflects this asymmetry explicitly rather than gating both uniformly.
//
// ## Acquisition path (drop chance)
//
// `base.BaseMonster.as`'s `addMedicine()` (~line 1114-1152), called once per
// kill as part of `dropAura()`. The real code is a nested nomenclature of
// three sequential `Math.random()` rolls -- `rollMedicineDrop()` below is a
// faithful port of that exact nesting (not a flattened probability), so its
// shape matches the source, not just its aggregate odds:
//
//   roll1 = random()
//   if roll1 >= 0.5:                      // 50%
//     roll2 = random()
//     if roll2 <= 0.15:                   // 15% of that 50%
//       if roll2 <= 0.05:                 // 5% of that 15%
//         roll3 = random()
//         drop = roll3 >= 0.5 ? SmallHP : BigHP   // 50/50 split
//       else:                             // the other 10%
//         drop = SmallHP
//     else: no drop
//   else:                                 // the other 50%
//     roll2b = random()
//     if roll2b <= 0.15: drop = SmallMP    // 15% of that 50%
//     else: no drop
//
// Flattened for reference: P(SmallHP) = 6.25%, P(BigHP) = 1.25%,
// P(SmallMP) = 7.5%, P(nothing) = 85% per kill.
//
// ## Revival pills and the magic ring
//
// Already recovered in heroGrowth.ts (`immortalityPillUseCap`,
// `magicRingHealAmount`) -- re-exported here so this module is a single
// front door for "everything that restores HP/MP", without duplicating that
// code.
//
// ## Alignment with this project's existing items.ts/drops.json
//
// `items.ts`'s `Effect` DSL (`{type:'stat',...}` / `{type:'onHit',...}`) has
// no "heal on use" variant, and this task does not add one there (only new
// files). `drops.json` already has two INVENTED placeholder consumables --
// `minor_pill` ("小还丹") and `great_pill` ("大还丹") -- with no effect data
// of their own. A natural (suggested, not applied) correspondence: `minor_pill`
// ~ SmallHP (+100 flat), `great_pill` ~ BigHP (+50% max). This module doesn't
// touch drops.json/items.ts; `CONSUMABLE_SPECS` below is this file's own
// data, and `useInventoryConsumable()` takes a plain item id string so the
// wiring layer decides the actual mapping.

import { applyHeroHpDelta, immortalityPillUseCap, magicRingHealAmount } from './heroGrowth'
import type { Inventory } from './inventory'
import { removeItem, countItem } from './inventory'

export { immortalityPillUseCap, magicRingHealAmount }

export type ConsumableId = 'smallHp' | 'bigHp' | 'smallMp'

export type ConsumableAmount =
  | { kind: 'flat'; value: number }
  | { kind: 'fractionOfMax'; fraction: number }

export interface ConsumableSpec {
  id: ConsumableId
  /** Original AS3 short name (`cname`), kept for cross-reference. */
  sourceName: string
  resource: 'hp' | 'mp'
  amount: ConsumableAmount
  /** Whether an increase from this source is subject to ERLANGSHEN_HP_REJECT
   * (true for both HP orbs; MP has no such gate in the source). */
  healBlockable: boolean
}

/** Source: export.cure.SmallHP.as / SmallMP.as / BigHP.as. */
export const CONSUMABLE_SPECS: Record<ConsumableId, ConsumableSpec> = {
  smallHp: { id: 'smallHp', sourceName: 'SHp', resource: 'hp', amount: { kind: 'fractionOfMax', fraction: 0.25 }, healBlockable: true },
  bigHp: { id: 'bigHp', sourceName: 'BHp', resource: 'hp', amount: { kind: 'fractionOfMax', fraction: 0.5 }, healBlockable: true },
  smallMp: { id: 'smallMp', sourceName: 'SMp', resource: 'mp', amount: { kind: 'fractionOfMax', fraction: 0.25 }, healBlockable: false },
}

/** Source: export.cure.SmallHP.as step()'s `tcount >= gc.frameClips * 10` --
 * identical for all three pickup types. */
export const PICKUP_DESPAWN_MS = 10_000

/** Source: SmallHP.colwho()'s coarse proximity gate, before the (unmodeled
 * here) pixel-perfect hit test. */
export const PICKUP_RANGE = { x: 700, y: 200 } as const

export function isWithinPickupRange(pickupX: number, pickupY: number, heroX: number, heroY: number): boolean {
  return Math.abs(pickupX - heroX) <= PICKUP_RANGE.x && Math.abs(pickupY - heroY) < PICKUP_RANGE.y
}

export interface ConsumableUseResult {
  consumableId: ConsumableId
  resource: 'hp' | 'mp'
  amountRequested: number
  hpBefore?: number
  hpAfter?: number
  mpBefore?: number
  mpAfter?: number
  /** True if an HP heal was entirely dropped by ERLANGSHEN_HP_REJECT (never
   * true for MP -- see file header). */
  blockedByHealBlock: boolean
}

function resolveAmount(amount: ConsumableAmount, maxValue: number): number {
  return amount.kind === 'flat' ? amount.value : maxValue * amount.fraction
}

/**
 * Apply a consumable's effect right now. This is the one function both
 * `collectWorldPickup` (auto-touch, the real original mechanic) and
 * `useInventoryConsumable` (a manual "use from backpack" entry point, for a
 * modernized carry-and-use design) delegate to -- same effect, two front
 * doors.
 */
export function applyConsumableEffect(
  id: ConsumableId,
  hp: { current: number; max: number },
  mp: { current: number; max: number },
  healBlocked: boolean,
): ConsumableUseResult {
  const spec = CONSUMABLE_SPECS[id]
  if (spec.resource === 'hp') {
    const amount = resolveAmount(spec.amount, hp.max)
    const hpAfter = applyHeroHpDelta(hp.current, amount, hp.max, healBlocked)
    return {
      consumableId: id,
      resource: 'hp',
      amountRequested: amount,
      hpBefore: hp.current,
      hpAfter,
      blockedByHealBlock: healBlocked && hpAfter === hp.current && amount > 0,
    }
  }
  const amount = resolveAmount(spec.amount, mp.max)
  const mpAfter = Math.max(0, Math.min(mp.max, mp.current + amount))
  return {
    consumableId: id,
    resource: 'mp',
    amountRequested: amount,
    mpBefore: mp.current,
    mpAfter,
    blockedByHealBlock: false, // MP is never gated by ERLANGSHEN_HP_REJECT
  }
}

/** Front door 1: a world pickup orb was touched (the real original
 * mechanic). Equivalent to `applyConsumableEffect` -- kept as a distinctly
 * named entry point for callers modeling field pickups explicitly. */
export function collectWorldPickup(
  id: ConsumableId,
  hp: { current: number; max: number },
  mp: { current: number; max: number },
  healBlocked: boolean,
): ConsumableUseResult {
  return applyConsumableEffect(id, hp, mp, healBlocked)
}

/** Front door 2: a modernized "use from backpack" entry point. Removes one
 * unit of `itemId` from `inv` (does nothing and returns `undefined` if the
 * hero doesn't have one), then applies `id`'s effect. `itemId` and `id` are
 * separate parameters because the actual item-id <-> ConsumableSpec mapping
 * is a wiring-layer decision (see file header's suggested correspondence to
 * drops.json's `minor_pill`/`great_pill`), not baked in here. */
export function useInventoryConsumable(
  inv: Inventory,
  itemId: string,
  id: ConsumableId,
  hp: { current: number; max: number },
  mp: { current: number; max: number },
  healBlocked: boolean,
): ConsumableUseResult | undefined {
  if (countItem(inv, itemId) <= 0) return undefined
  removeItem(inv, itemId, 1)
  return applyConsumableEffect(id, hp, mp, healBlocked)
}

/**
 * Faithful port of `BaseMonster.addMedicine()`'s exact nested-roll drop
 * logic (see file header for the derivation) -- called once per kill.
 * Returns `undefined` on the (85%-of-the-time) no-drop outcome.
 */
export function rollMedicineDrop(random: () => number = Math.random): ConsumableId | undefined {
  if (random() >= 0.5) {
    const roll2 = random()
    if (roll2 <= 0.15) {
      if (roll2 <= 0.05) {
        return random() >= 0.5 ? 'smallHp' : 'bigHp'
      }
      return 'smallHp'
    }
    return undefined
  }
  const roll2b = random()
  if (roll2b <= 0.15) return 'smallMp'
  return undefined
}
