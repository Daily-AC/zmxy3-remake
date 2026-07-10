import { describe, it, expect } from 'vitest'
import {
  createSoulPurse,
  addSoul,
  sellCommonEquipment,
  sellEquipmentItem,
  SELL_COMMON_EQUIP_SOUL_VALUE,
} from '../src/systems/soulPurse'
import { createInventory, addItem, listStacks } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'

const commonSword: Item = {
  id: 'stick',
  name: '木棍',
  kind: 'equip',
  rarity: 1,
  sourceSaleValue: 20,
}
const rareSword: Item = {
  id: 'chiyan',
  name: '赤炎噬血杖',
  kind: 'equip',
  rarity: 3,
  sourceSaleValue: 160,
}
const commonHerb: Item = { id: 'herb', name: '妖草', kind: 'material', rarity: 1 }

describe('soul purse', () => {
  it('starts at 0 by default and clamps negative seeds', () => {
    expect(createSoulPurse().value).toBe(0)
    expect(createSoulPurse(-5).value).toBe(0)
  })

  it('addSoul accumulates and never drops below 0', () => {
    const purse = createSoulPurse(10)
    addSoul(purse, 5)
    expect(purse.value).toBe(15)
    addSoul(purse, -100)
    expect(purse.value).toBe(0)
  })
})

describe('sellCommonEquipment (ports export.pack.BackPack.as deleteWhiteEquipment)', () => {
  it('sells every unit of a common-rarity equip stack at 20 soul each', () => {
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, commonSword, 3)

    const result = sellCommonEquipment(inv, purse)

    expect(result).toEqual({ soldCount: 3, soulGained: 3 * SELL_COMMON_EQUIP_SOUL_VALUE })
    expect(purse.value).toBe(60)
    expect(listStacks(inv)).toEqual([])
  })

  it('leaves higher-rarity equip and non-equip items untouched', () => {
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, rareSword, 1)
    addItem(inv, commonHerb, 5)

    const result = sellCommonEquipment(inv, purse)

    expect(result).toEqual({ soldCount: 0, soulGained: 0 })
    expect(purse.value).toBe(0)
    expect(listStacks(inv)).toEqual([
      { item: rareSword, qty: 1 },
      { item: commonHerb, qty: 5 },
    ])
  })

  it('sells only the common equip out of a mixed bag', () => {
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, commonSword, 2)
    addItem(inv, rareSword, 1)
    addItem(inv, commonHerb, 9)

    const result = sellCommonEquipment(inv, purse)

    expect(result).toEqual({ soldCount: 2, soulGained: 40 })
    expect(listStacks(inv)).toEqual([
      { item: rareSword, qty: 1 },
      { item: commonHerb, qty: 9 },
    ])
  })
})

describe('sellEquipmentItem (ports PackThings.as mdClick)', () => {
  it('sells one selected equipment unit for its original quality value', () => {
    const inv = createInventory(8)
    const purse = createSoulPurse(5)
    addItem(inv, rareSword, 2)

    expect(sellEquipmentItem(inv, purse, rareSword)).toEqual({ sold: true, soulGained: 160 })
    expect(purse.value).toBe(165)
    expect(listStacks(inv)).toEqual([{ item: rareSword, qty: 1 }])
  })

  it('does not sell materials or missing items', () => {
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, commonHerb, 1)

    expect(sellEquipmentItem(inv, purse, commonHerb)).toEqual({ sold: false, soulGained: 0 })
    expect(sellEquipmentItem(inv, purse, { ...rareSword, id: 'missing' })).toEqual({ sold: false, soulGained: 0 })
    expect(purse.value).toBe(0)
  })

  it('derives the original price from source quality for pre-metadata saves', () => {
    const legacy: Item = {
      id: 'legacy-stick',
      name: '旧行者棍',
      kind: 'equip',
      rarity: 1,
      sourceQuality: '普 通',
    }
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, legacy, 1)

    expect(sellEquipmentItem(inv, purse, legacy)).toEqual({ sold: true, soulGained: 20 })
    expect(purse.value).toBe(20)
  })

  it('sells the selected same-fillName instance and leaves the other roll untouched', () => {
    const cheap = { ...rareSword, sourceSaleValue: 40 }
    const valuable = { ...rareSword, sourceSaleValue: 160 }
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, cheap, 1)
    addItem(inv, valuable, 1)

    expect(sellEquipmentItem(inv, purse, valuable)).toEqual({ sold: true, soulGained: 160 })
    expect(listStacks(inv)).toEqual([{ item: cheap, qty: 1 }])
  })

  it('uses the recovered per-item sale value for known equipment', () => {
    const legendary = { ...equipmentItemByFillName('ryjgb')!, sourceSaleValue: 1 }
    const inv = createInventory(8)
    const purse = createSoulPurse()
    addItem(inv, legendary, 1)

    expect(sellEquipmentItem(inv, purse, legendary)).toEqual({ sold: true, soulGained: 1280 })
  })
})
