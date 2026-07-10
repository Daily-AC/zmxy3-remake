import { describe, it, expect } from 'vitest'
import {
  createEquipment,
  equip,
  unequip,
  equippedList,
  heroAtk,
  comboHitDamage,
  slotForItem,
  equipEligibility,
  sanitizeEquipmentForHero,
  weaponShowIdForItem,
} from '../src/systems/equipment'
import { createInventory, addItem, countItem } from '../src/systems/inventory'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'
import type { Item } from '../src/systems/items'

const staff: Item = {
  id: 'chiyan',
  name: '赤炎噬血杖',
  kind: 'equip',
  rarity: 3,
  sourceType: 'zbwq',
  sourceUser: '悟空',
  effects: [
    { type: 'stat', stat: 'atk', value: 40 },
    { type: 'onHit', effect: 'lifesteal', chance: 0.5, power: 20 },
  ],
}
const plainStaff: Item = {
  id: 'stick',
  name: '木棍',
  kind: 'equip',
  rarity: 1,
  sourceType: 'zbwq',
  sourceUser: '悟空',
}
const herb: Item = { id: 'herb', name: '妖草', kind: 'material', rarity: 1 }

describe('equipment slots + equip/unequip (装备栏穿脱)', () => {
  it('maps only implemented weapon and armor source types to active slots', () => {
    expect(slotForItem(equipmentItemByFillName('ptdxzg')!)).toBe('weapon')
    expect(slotForItem(equipmentItemByFillName('ptdxzf')!)).toBe('armor')
    expect(slotForItem(equipmentItemByFillName('xhz')!)).toBe(null)
    expect(slotForItem({ ...staff, sourceType: 'zbfb' })).toBe(null)
  })

  it('maps Wukong weapons to the original ROLE1_EQUIP showid', () => {
    expect(weaponShowIdForItem(equipmentItemByFillName('ptdxzg')!)).toBe(1)
    expect(weaponShowIdForItem(equipmentItemByFillName('whg')!)).toBe(2)
    expect(weaponShowIdForItem(equipmentItemByFillName('ptdxzf')!)).toBeNull()
  })

  it('rejects materials and source-less custom equipment instead of guessing weapon', () => {
    expect(slotForItem(herb)).toBe(null)
    expect(slotForItem(equipmentItemByFillName('wptm')!)).toBe(null)
    expect(slotForItem({ id: 'mystery', name: '无类型装备', kind: 'equip', rarity: 1 })).toBe(null)
  })

  it('rejects equipment belonging to another hero', () => {
    const shaSengWeapon = equipmentItemByFillName('ptdyyc')!
    expect(equipEligibility(shaSengWeapon, 1)).toBe('wrong_role')

    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, shaSengWeapon, 1)
    expect(equip(eq, inv, shaSengWeapon, 1)).toBe(false)
    expect(eq.weapon).toBeNull()
    expect(countItem(inv, 'ptdyyc')).toBe(1)
  })

  it('uses the recovered catalog role instead of trusting forged save metadata', () => {
    const forgedShaSengWeapon = {
      ...equipmentItemByFillName('ptdyyc')!,
      sourceType: 'zbwq',
      sourceUser: '悟空',
    }

    expect(equipEligibility(forgedShaSengWeapon, 1)).toBe('wrong_role')
  })

  it('equips an item out of the bag into the weapon slot', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    expect(equip(eq, inv, staff, 1)).toBe(true)
    expect(eq.weapon?.id).toBe('chiyan')
    expect(countItem(inv, 'chiyan')).toBe(0) // left the bag
    expect(equippedList(eq)).toHaveLength(1)
  })

  it('equips the selected same-fillName instance without copying another roll', () => {
    const weakStaff = { ...staff, effects: [{ type: 'stat', stat: 'atk', value: 10 }] } as Item
    const strongStaff = { ...staff, effects: [{ type: 'stat', stat: 'atk', value: 15 }] } as Item
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, weakStaff, 1)
    addItem(inv, strongStaff, 1)

    expect(equip(eq, inv, strongStaff, 1)).toBe(true)
    expect(eq.weapon).toBe(strongStaff)
    expect(inv.stacks).toEqual([{ item: weakStaff, qty: 1 }])
    expect(heroAtk(0, eq)).toBe(15)
  })

  it('cannot equip an item that is not in the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    expect(equip(eq, inv, staff, 1)).toBe(false)
    expect(eq.weapon).toBe(null)
  })

  it('rejects non-equippable items', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, herb, 1)
    expect(equip(eq, inv, herb, 1)).toBe(false)
  })

  it('swapping weapons returns the old one to the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    addItem(inv, plainStaff, 1)
    equip(eq, inv, staff, 1)
    equip(eq, inv, plainStaff, 1)
    expect(eq.weapon?.id).toBe('stick')
    expect(countItem(inv, 'chiyan')).toBe(1) // displaced back to the bag
  })

  it('unequip puts the weapon back in the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    equip(eq, inv, staff, 1)
    expect(unequip(eq, inv, 'weapon')).toBe(true)
    expect(eq.weapon).toBe(null)
    expect(countItem(inv, 'chiyan')).toBe(1)
    expect(unequip(eq, inv, 'weapon')).toBe(false) // nothing to remove now
  })

  // Regression: equip() used to write eq[slot] unconditionally and only try
  // (and possibly fail) to return the displaced item afterward -- a full bag
  // with no stack for it to merge into deleted it outright. Reproduces
  // whenever the incoming item comes from a stack of qty>=2 (removeItem only
  // frees a bag slot when it empties a qty=1 stack to zero, so a qty>=2
  // stack leaves the bag exactly as full as before).
  it('rejects the swap instead of deleting the worn item when the bag is full and has no room for it', () => {
    const eq = createEquipment()
    eq.weapon = staff // already worn, NOT taking up a bag slot
    const inv = createInventory(2)
    // Simulate a pre-migration save from before equipment became non-stackable.
    inv.stacks.push({ item: plainStaff, qty: 2 }, { item: herb, qty: 1 })
    expect(inv.stacks).toHaveLength(2) // bag is full at capacity 2

    expect(equip(eq, inv, plainStaff, 1)).toBe(false)
    expect(eq.weapon?.id).toBe('chiyan') // staff is still worn, not lost
    expect(countItem(inv, 'stick')).toBe(2) // rolled back to its original qty
    expect(countItem(inv, 'herb')).toBe(1)
    expect(inv.stacks).toHaveLength(2) // bag composition unchanged
  })

  it('still allows the swap once the bag has room to take the displaced item back', () => {
    const eq = createEquipment()
    eq.weapon = staff
    const inv = createInventory(2)
    inv.stacks.push({ item: plainStaff, qty: 2 })
    // Only one stack this time -- one free slot for the displaced staff.
    expect(equip(eq, inv, plainStaff, 1)).toBe(true)
    expect(eq.weapon?.id).toBe('stick')
    expect(countItem(inv, 'chiyan')).toBe(1) // staff displaced back into the bag
    expect(countItem(inv, 'stick')).toBe(1) // one copy left in the bag, one equipped
  })

  it('repairs old wrong-slot gear and removes unsupported gear from equipment and bag', () => {
    const eq = createEquipment()
    eq.weapon = equipmentItemByFillName('ptdxzf')! // old bug put armor in weapon
    eq.accessory = equipmentItemByFillName('xhz')!
    const inv = createInventory(8)
    addItem(inv, equipmentItemByFillName('ptdyyc')!, 1)
    addItem(inv, equipmentItemByFillName('ptdxzg')!, 1)
    addItem(inv, herb, 2)

    const result = sanitizeEquipmentForHero(eq, inv, 1)

    expect(result).toEqual({ migratedCount: 1, removedCount: 2 })
    expect(eq.weapon).toBeNull()
    expect(eq.armor?.id).toBe('ptdxzf')
    expect(eq.accessory).toBeNull()
    expect(countItem(inv, 'ptdyyc')).toBe(0)
    expect(countItem(inv, 'ptdxzg')).toBe(1)
    expect(countItem(inv, 'herb')).toBe(2)
  })
})

describe('equipment combat numbers (装备接入伤害)', () => {
  it('adds equipped atk to a combo stage base', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    expect(comboHitDamage(30, eq)).toBe(30) // bare-handed
    addItem(inv, staff, 1)
    equip(eq, inv, staff, 1)
    expect(comboHitDamage(30, eq)).toBe(70) // +40 atk from the staff
    expect(heroAtk(0, eq)).toBe(40)
  })

  it('applies recovered equipment effects after the original item is equipped', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    const recoveredStaff = equipmentItemByFillName('ptdxzg')!

    addItem(inv, recoveredStaff, 1)
    expect(equip(eq, inv, recoveredStaff, 1)).toBe(true)
    expect(heroAtk(10, eq)).toBe(12)
  })
})
