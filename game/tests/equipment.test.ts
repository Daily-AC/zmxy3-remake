import { describe, it, expect } from 'vitest'
import {
  createEquipment,
  equip,
  unequip,
  equippedList,
  heroAtk,
  comboHitDamage,
  slotForItem,
} from '../src/systems/equipment'
import { createInventory, addItem, countItem } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

const staff: Item = {
  id: 'chiyan',
  name: '赤炎噬血杖',
  kind: 'equip',
  rarity: 3,
  effects: [
    { type: 'stat', stat: 'atk', value: 40 },
    { type: 'onHit', effect: 'lifesteal', chance: 0.5, power: 20 },
  ],
}
const plainStaff: Item = { id: 'stick', name: '木棍', kind: 'equip', rarity: 1 }
const herb: Item = { id: 'herb', name: '妖草', kind: 'material', rarity: 1 }

describe('equipment slots + equip/unequip (装备栏穿脱)', () => {
  it('only equip-kind items map to a slot', () => {
    expect(slotForItem(staff)).toBe('weapon')
    expect(slotForItem(herb)).toBe(null)
  })

  it('equips an item out of the bag into the weapon slot', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    expect(equip(eq, inv, staff)).toBe(true)
    expect(eq.weapon?.id).toBe('chiyan')
    expect(countItem(inv, 'chiyan')).toBe(0) // left the bag
    expect(equippedList(eq)).toHaveLength(1)
  })

  it('cannot equip an item that is not in the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    expect(equip(eq, inv, staff)).toBe(false)
    expect(eq.weapon).toBe(null)
  })

  it('rejects non-equippable items', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, herb, 1)
    expect(equip(eq, inv, herb)).toBe(false)
  })

  it('swapping weapons returns the old one to the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    addItem(inv, plainStaff, 1)
    equip(eq, inv, staff)
    equip(eq, inv, plainStaff)
    expect(eq.weapon?.id).toBe('stick')
    expect(countItem(inv, 'chiyan')).toBe(1) // displaced back to the bag
  })

  it('unequip puts the weapon back in the bag', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    addItem(inv, staff, 1)
    equip(eq, inv, staff)
    expect(unequip(eq, inv, 'weapon')).toBe(true)
    expect(eq.weapon).toBe(null)
    expect(countItem(inv, 'chiyan')).toBe(1)
    expect(unequip(eq, inv, 'weapon')).toBe(false) // nothing to remove now
  })
})

describe('equipment combat numbers (装备接入伤害)', () => {
  it('adds equipped atk to a combo stage base', () => {
    const eq = createEquipment()
    const inv = createInventory(8)
    expect(comboHitDamage(30, eq)).toBe(30) // bare-handed
    addItem(inv, staff, 1)
    equip(eq, inv, staff)
    expect(comboHitDamage(30, eq)).toBe(70) // +40 atk from the staff
    expect(heroAtk(0, eq)).toBe(40)
  })
})
