// Phaser-independent equipment slots + equip/unequip, plus the equipment-derived
// combat numbers. Bridges the inventory (codex) and the effect helpers (codex
// effects.ts) so a bag item can be worn, taken off, and made to matter in combat.

import type { Item } from './items'
import { Inventory, addItem, removeItem } from './inventory'
import { applyEquipStats, BaseStats } from './effects'

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'talisman'

export interface Equipment {
  weapon: Item | null
  armor: Item | null
  accessory: Item | null
  talisman: Item | null
}

export function createEquipment(): Equipment {
  return { weapon: null, armor: null, accessory: null, talisman: null }
}

// Stage A: every 'equip' item goes to the weapon slot — item data carries no
// per-item slot yet. TODO: add a slot field when armor/accessory items exist.
export function slotForItem(item: Item): EquipSlot | null {
  return item.kind === 'equip' ? 'weapon' : null
}

export function equippedList(eq: Equipment): Item[] {
  return [eq.weapon, eq.armor, eq.accessory, eq.talisman].filter((i): i is Item => i !== null)
}

/**
 * Move `item` from `inv` into its slot. Any item already in that slot is
 * returned to the inventory. Returns false if the item isn't equippable or a
 * copy isn't present in the inventory.
 */
export function equip(eq: Equipment, inv: Inventory, item: Item): boolean {
  const slot = slotForItem(item)
  if (!slot) return false
  if (!removeItem(inv, item.id, 1)) return false
  const prev = eq[slot]
  eq[slot] = item
  if (prev) addItem(inv, prev, 1)
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
