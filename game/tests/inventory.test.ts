import { describe, it, expect } from 'vitest'
import {
  addItem,
  countItem,
  createInventory,
  listStacks,
  removeItem,
} from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

const soul: Item = { id: 'demon_soul', name: '妖怪残魂', kind: 'material', rarity: 1 }
const ore: Item = { id: 'silver_ore', name: '白银矿石', kind: 'material', rarity: 2 }
const pill: Item = { id: 'minor_pill', name: '小还丹', kind: 'consumable', rarity: 1 }

describe('inventory stacks', () => {
  it('stacks to 99 then opens a new slot for overflow from the stack', () => {
    const inv = createInventory(3)

    const result = addItem(inv, soul, 120)

    expect(result).toEqual({ ok: true, overflow: 0 })
    expect(listStacks(inv)).toEqual([
      { item: soul, qty: 99 },
      { item: soul, qty: 21 },
    ])
    expect(countItem(inv, soul.id)).toBe(120)
  })

  it('reports overflow and ok=false when capacity is full', () => {
    const inv = createInventory(2)

    const result = addItem(inv, soul, 250)

    expect(result).toEqual({ ok: false, overflow: 52 })
    expect(listStacks(inv)).toEqual([
      { item: soul, qty: 99 },
      { item: soul, qty: 99 },
    ])
    expect(countItem(inv, soul.id)).toBe(198)
  })

  it('does not mutate inventory when removing more than available', () => {
    const inv = createInventory(2)
    addItem(inv, ore, 10)
    const before = listStacks(inv)

    expect(removeItem(inv, ore.id, 11)).toBe(false)

    expect(listStacks(inv)).toEqual(before)
    expect(countItem(inv, ore.id)).toBe(10)
  })

  it('lists stacks in stable insertion order', () => {
    const inv = createInventory(4)

    addItem(inv, soul, 99)
    addItem(inv, pill, 2)
    addItem(inv, soul, 2)

    expect(listStacks(inv)).toEqual([
      { item: soul, qty: 99 },
      { item: pill, qty: 2 },
      { item: soul, qty: 2 },
    ])
  })
})
