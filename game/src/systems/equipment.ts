// Phaser-independent equipment slots + equip/unequip, plus the equipment-derived
// combat numbers. Bridges the inventory (codex) and the effect helpers (codex
// effects.ts) so a bag item can be worn, taken off, and made to matter in combat.

import type { Item } from './items'
import { Inventory, addItem, removeItem } from './inventory'
import { applyEquipStats, BaseStats } from './effects'

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'talisman'

const SLOT_BY_SOURCE_TYPE: Record<string, EquipSlot> = {
  zbwq: 'weapon',
  zbfj: 'armor',
  zbsp: 'accessory',
  zbfb: 'talisman',
}

export interface Equipment {
  weapon: Item | null
  armor: Item | null
  accessory: Item | null
  talisman: Item | null
}

export function createEquipment(): Equipment {
  return { weapon: null, armor: null, accessory: null, talisman: null }
}

export function slotForItem(item: Item): EquipSlot | null {
  if (item.kind !== 'equip') return null
  if (!item.sourceType) return 'weapon'
  return SLOT_BY_SOURCE_TYPE[item.sourceType] ?? null
}

export function equippedList(eq: Equipment): Item[] {
  return [eq.weapon, eq.armor, eq.accessory, eq.talisman].filter((i): i is Item => i !== null)
}

/**
 * Move `item` from `inv` into its slot. Any item already in that slot is
 * returned to the inventory. Returns false if the item isn't equippable, a
 * copy isn't present in the inventory, or the bag can't take the previously
 * worn item back (rejected rather than deleting it -- see the capacity check
 * below).
 */
export function equip(eq: Equipment, inv: Inventory, item: Item): boolean {
  const slot = slotForItem(item)
  if (!slot) return false
  if (!removeItem(inv, item.id, 1)) return false
  const prev = eq[slot]
  // Mirror unequip()'s check-before-commit below: verify the bag can accept
  // `prev` back BEFORE writing eq[slot], instead of writing it unconditionally
  // and only trying (and possibly failing) to return prev afterward. Without
  // this, a full bag with no stack for prev to merge into silently deletes
  // prev -- not in inventory, not equipped (blue-team major#4 / red-team's
  // refined trigger: reproduces whenever the equipped item comes from a stack
  // of qty>=2, since removeItem above only frees a bag slot when it empties a
  // qty=1 stack down to zero).
  if (prev && !addItem(inv, prev, 1).ok) {
    // Roll back: put `item` back exactly where it came from (guaranteed to
    // succeed -- either its stack still exists with room, per the qty>=2
    // case above, or removeItem just freed the one slot this needs) and
    // reject the swap.
    addItem(inv, item, 1)
    return false
  }
  eq[slot] = item
  return true
}

/** Take the item off `slot` and return it to the inventory. */
export function unequip(eq: Equipment, inv: Inventory, slot: EquipSlot): boolean {
  const cur = eq[slot]
  if (!cur) return false
  if (!addItem(inv, cur, 1).ok) return false
  eq[slot] = null
  return true
}

/** Hero attack = a base value plus every equipped item's `atk` stat effects. */
export function heroAtk(baseAtk: number, eq: Equipment): number {
  const base: BaseStats = { atk: baseAtk, def: 0, hp: 0, mp: 0, crit: 0 }
  return applyEquipStats(base, equippedList(eq)).atk
}

/** Damage a combo stage deals: its base plus the equip-derived atk bonus. */
export function comboHitDamage(baseStageDamage: number, eq: Equipment): number {
  return baseStageDamage + heroAtk(0, eq)
}
