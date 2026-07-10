// Phaser-independent equipment slots + equip/unequip, plus the equipment-derived
// combat numbers. Bridges the inventory (codex) and the effect helpers (codex
// effects.ts) so a bag item can be worn, taken off, and made to matter in combat.

import type { Item } from './items'
import { Inventory, addItem, removeItemInstance } from './inventory'
import { applyEquipStats, BaseStats } from './effects'
import type { HeroId } from './progression'
import originalEquipment from '../data/original/equipment.json'

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'talisman'

const SUPPORTED_SLOT_BY_SOURCE_TYPE: Record<string, EquipSlot> = {
  zbwq: 'weapon',
  zbfj: 'armor',
}

export const SUPPORTED_EQUIP_SLOTS = ['weapon', 'armor'] as const
export type SupportedEquipSlot = (typeof SUPPORTED_EQUIP_SLOTS)[number]

interface EquipmentCatalogMeta {
  fillName: string
  type: string
  user: string
  showid: number
}

const equipmentCatalog = new Map(
  (originalEquipment as { items: EquipmentCatalogMeta[] }).items.map((item) => [item.fillName, item]),
)

const ROLE_NAME_BY_HERO_ID: Partial<Record<HeroId, string>> = {
  1: '悟空',
}

export type EquipEligibility =
  | 'ok'
  | 'not_equipment'
  | 'missing_type'
  | 'unsupported_slot'
  | 'wrong_role'

export interface Equipment {
  weapon: Item | null
  armor: Item | null
  accessory: Item | null
  talisman: Item | null
}

export function createEquipment(): Equipment {
  return { weapon: null, armor: null, accessory: null, talisman: null }
}

function catalogMetaForItem(item: Item): EquipmentCatalogMeta | undefined {
  return equipmentCatalog.get(item.id) ?? equipmentCatalog.get(item.sourceFillName ?? '')
}

export function slotForItem(item: Item): EquipSlot | null {
  if (item.kind !== 'equip') return null
  const sourceType = catalogMetaForItem(item)?.type ?? item.sourceType
  if (!sourceType) return null
  return SUPPORTED_SLOT_BY_SOURCE_TYPE[sourceType] ?? null
}

export function weaponShowIdForItem(item: Item): number | null {
  if (slotForItem(item) !== 'weapon') return null
  const showId = catalogMetaForItem(item)?.showid ?? item.sourceShowId
  return Number.isFinite(showId) ? Math.max(0, Math.floor(showId as number)) : null
}

export function equipEligibility(item: Item, heroId: HeroId): EquipEligibility {
  if (item.kind !== 'equip') return 'not_equipment'
  const catalog = catalogMetaForItem(item)
  const sourceType = catalog?.type ?? item.sourceType
  if (!sourceType) return 'missing_type'
  if (!SUPPORTED_SLOT_BY_SOURCE_TYPE[sourceType]) return 'unsupported_slot'

  const roleName = ROLE_NAME_BY_HERO_ID[heroId]
  const sourceUser = catalog?.user ?? item.sourceUser
  if (!roleName || sourceUser === undefined) return 'wrong_role'
  if (sourceUser !== '' && sourceUser !== roleName) return 'wrong_role'
  return 'ok'
}

export function isSupportedEquipmentForHero(item: Item, heroId: HeroId): boolean {
  return equipEligibility(item, heroId) === 'ok'
}

export function equippedList(eq: Equipment): Item[] {
  return [eq.weapon, eq.armor].filter((i): i is Item => i !== null)
}

/**
 * Move `item` from `inv` into its slot. Any item already in that slot is
 * returned to the inventory. Returns false if the item isn't equippable, a
 * copy isn't present in the inventory, or the bag can't take the previously
 * worn item back (rejected rather than deleting it -- see the capacity check
 * below).
 */
export function equip(eq: Equipment, inv: Inventory, item: Item, heroId: HeroId): boolean {
  if (equipEligibility(item, heroId) !== 'ok') return false
  const slot = slotForItem(item)
  if (!slot) return false
  const beforeStacks = inv.stacks.map((stack) => ({ item: stack.item, qty: stack.qty }))
  if (!removeItemInstance(inv, item)) return false
  const prev = eq[slot]
  // Verify the bag can accept `prev` before committing the new slot. A normal
  // one-item equipment stack frees a slot; this guard still protects malformed
  // legacy saves that contain stacked equipment.
  if (prev && !addItem(inv, prev, 1).ok) {
    // Restore the exact pre-swap layout, including malformed legacy equipment
    // stacks that cannot be reconstructed through addItem's one-item rule.
    inv.stacks.splice(0, inv.stacks.length, ...beforeStacks)
    return false
  }
  eq[slot] = item
  return true
}

/** Take the item off `slot` and return it to the inventory. */
export function unequip(eq: Equipment, inv: Inventory, slot: EquipSlot): boolean {
  if (!SUPPORTED_EQUIP_SLOTS.includes(slot as SupportedEquipSlot)) return false
  const cur = eq[slot]
  if (!cur) return false
  if (!addItem(inv, cur, 1).ok) return false
  eq[slot] = null
  return true
}

/**
 * One-time save migration for the old permissive equipment model. Supported
 * Wukong weapon/armor are moved to their source-defined slots; other-role,
 * accessory, talisman, and source-less equipment is removed from both the
 * loadout and bag so unfinished content cannot leak into the current game.
 */
export function sanitizeEquipmentForHero(
  eq: Equipment,
  inv: Inventory,
  heroId: HeroId,
): { migratedCount: number; removedCount: number } {
  const rebuilt = createEquipment()
  let migratedCount = 0
  let removedCount = 0

  for (const oldSlot of Object.keys(eq) as EquipSlot[]) {
    const item = eq[oldSlot]
    if (!item) continue
    if (equipEligibility(item, heroId) !== 'ok') {
      removedCount += 1
      continue
    }
    const correctSlot = slotForItem(item) as SupportedEquipSlot
    if (!rebuilt[correctSlot]) {
      rebuilt[correctSlot] = item
      if (correctSlot !== oldSlot) migratedCount += 1
      continue
    }
    if (addItem(inv, item, 1).ok) migratedCount += 1
    else removedCount += 1
  }

  eq.weapon = rebuilt.weapon
  eq.armor = rebuilt.armor
  eq.accessory = null
  eq.talisman = null

  for (let index = inv.stacks.length - 1; index >= 0; index -= 1) {
    const stack = inv.stacks[index]
    if (stack.item.kind !== 'equip') continue
    if (equipEligibility(stack.item, heroId) === 'ok') continue
    removedCount += stack.qty
    inv.stacks.splice(index, 1)
  }

  return { migratedCount, removedCount }
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
