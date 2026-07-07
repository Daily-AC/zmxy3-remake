import { describe, it, expect } from 'vitest'
import {
  materialPoints,
  computeBudget,
  effectCost,
  buildCraftRequest,
  validateCraftedEquipment,
  lockMaterials,
  consumeMaterials,
  refundMaterials,
  type MaterialLot,
} from '../src/systems/furnace'
import { createInventory, addItem, countItem } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

const silverOre: Item = { id: 'silver_ore', name: '白银矿石', kind: 'material', rarity: 2 }
const demonSoul: Item = { id: 'demon_soul', name: '妖怪残魂', kind: 'material', rarity: 1 }
const blackIron: Item = { id: 'black_iron', name: '玄铁碎片', kind: 'material', rarity: 3 }

describe('material → attribute budget (材料转预算)', () => {
  it('values materials by rarity, scaled by quantity', () => {
    expect(materialPoints(1)).toBe(2)
    expect(materialPoints(2)).toBe(6)
    expect(materialPoints(3)).toBe(15)
    // 2 silver ore (r2 = 6) + 1 demon soul (r1 = 2) = 14 points
    const budget = computeBudget([
      { item: silverOre, qty: 2 },
      { item: demonSoul, qty: 1 },
    ])
    expect(budget.points).toBe(14)
  })

  it('per-field caps are min(engine max, budget-scaled)', () => {
    const small = computeBudget([{ item: demonSoul, qty: 1 }]) // 2 points
    expect(small.caps.atk).toBe(2) // budget-scaled, well under engine 50
    expect(small.caps.hp).toBe(8) // 2 * 4
    const huge = computeBudget([{ item: blackIron, qty: 10 }]) // 150 points
    expect(huge.caps.atk).toBe(50) // clamped to engine ceiling
    expect(huge.caps.hp).toBe(200)
    expect(huge.caps.crit).toBe(0.5)
    expect(huge.caps.onHitPower).toBe(30)
  })

  it('the cost model and the caps share one rate table', () => {
    // A single field pushed to its budget-scaled cap costs exactly the budget.
    const b = computeBudget([{ item: silverOre, qty: 1 }]) // 6 points
    expect(effectCost({ type: 'stat', stat: 'atk', value: b.caps.atk })).toBeCloseTo(6)
    expect(effectCost({ type: 'stat', stat: 'hp', value: b.caps.hp })).toBeCloseTo(6)
    expect(effectCost({ type: 'stat', stat: 'crit', value: b.caps.crit })).toBeCloseTo(6)
    expect(effectCost({ type: 'onHit', effect: 'burn', chance: b.caps.onHitChance, power: 0 })).toBeCloseTo(6)
  })
})

describe('buildCraftRequest (炼制请求构造)', () => {
  it('projects material lots + description into a wire payload with a budget', () => {
    const lots: MaterialLot[] = [{ item: silverOre, qty: 2 }]
    const req = buildCraftRequest('一把会吸血的火焰法杖', lots)
    expect(req.description).toBe('一把会吸血的火焰法杖')
    expect(req.materials).toEqual([{ id: 'silver_ore', name: '白银矿石', rarity: 2, qty: 2 }])
    expect(req.budget.points).toBe(12)
  })
})

describe('validateCraftedEquipment — hard clamp + over-budget reject (不信任服务端)', () => {
  const budget = computeBudget([{ item: silverOre, qty: 2 }]) // 12 points

  it('accepts a within-budget item and clamps per-field overshoot down', () => {
    const res = validateCraftedEquipment(
      {
        id: 'huoyan',
        name: '烈焰吸血杖',
        rarity: 5, // over range -> clamped to 3
        effects: [{ type: 'stat', stat: 'atk', value: 999 }], // over cap -> clamped to caps.atk (12)
      },
      budget,
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.item.kind).toBe('equip')
    expect(res.item.rarity).toBe(3)
    expect(res.item.effects).toHaveLength(1)
    expect(res.item.effects![0]).toEqual({ type: 'stat', stat: 'atk', value: budget.caps.atk })
    expect(res.totalCost).toBeLessThanOrEqual(budget.points)
  })

  it('rejects an item whose total value exceeds the budget, rather than trimming it', () => {
    // atk + def each clamped to caps (12) => cost 24 > 12 budget => reject.
    const res = validateCraftedEquipment(
      {
        id: 'op',
        name: '逆天神器',
        rarity: 3,
        effects: [
          { type: 'stat', stat: 'atk', value: 999 },
          { type: 'stat', stat: 'def', value: 999 },
        ],
      },
      budget,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('over_budget')
    expect(res.totalCost).toBeGreaterThan(res.budget)
  })

  it('drops illegal stat/effect names and unknown effect types instead of coercing them', () => {
    const res = validateCraftedEquipment(
      {
        name: '杂物',
        rarity: 2,
        effects: [
          { type: 'stat', stat: 'luck', value: 5 }, // illegal stat -> dropped
          { type: 'onHit', effect: 'poison', chance: 0.2, power: 5 }, // illegal proc -> dropped
          { type: 'explode', value: 10 }, // unknown type -> dropped
          { type: 'stat', stat: 'atk', value: 3 }, // legal -> kept
        ],
      },
      budget,
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.item.effects).toEqual([{ type: 'stat', stat: 'atk', value: 3 }])
  })

  it('truncates to at most maxEffects (3) before costing', () => {
    const big = computeBudget([{ item: blackIron, qty: 10 }]) // huge budget so cost never rejects
    const res = validateCraftedEquipment(
      {
        name: '多效法宝',
        rarity: 3,
        effects: [
          { type: 'stat', stat: 'atk', value: 1 },
          { type: 'stat', stat: 'def', value: 1 },
          { type: 'stat', stat: 'hp', value: 4 },
          { type: 'stat', stat: 'mp', value: 4 },
        ],
      },
      big,
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.item.effects).toHaveLength(3)
  })

  it('degrades garbage input to a legal (empty-effect) item, never throws', () => {
    const res = validateCraftedEquipment('not an object', budget)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.item.name).toBe('无名法宝')
    expect(res.item.effects).toEqual([])
  })
})

describe('material transaction — lock / consume / refund (材料事务)', () => {
  function bagWithMaterials() {
    const inv = createInventory(16)
    addItem(inv, silverOre, 3)
    addItem(inv, demonSoul, 5)
    return inv
  }

  it('lock removes materials from the bag under a pending transaction', () => {
    const inv = bagWithMaterials()
    const tx = lockMaterials(inv, 'req-1', [
      { item: silverOre, qty: 2 },
      { item: demonSoul, qty: 1 },
    ])
    expect(tx).not.toBeNull()
    expect(tx!.status).toBe('pending')
    expect(countItem(inv, 'silver_ore')).toBe(1)
    expect(countItem(inv, 'demon_soul')).toBe(4)
  })

  it('refuses to lock (bag untouched) when a material is short', () => {
    const inv = bagWithMaterials()
    const tx = lockMaterials(inv, 'req-2', [{ item: silverOre, qty: 99 }])
    expect(tx).toBeNull()
    expect(countItem(inv, 'silver_ore')).toBe(3) // nothing removed
  })

  it('consume finalizes a successful craft (materials stay gone)', () => {
    const inv = bagWithMaterials()
    const tx = lockMaterials(inv, 'req-3', [{ item: silverOre, qty: 2 }])!
    expect(consumeMaterials(tx)).toBe(true)
    expect(tx.status).toBe('consumed')
    expect(countItem(inv, 'silver_ore')).toBe(1) // consumed, not returned
  })

  it('refund returns locked materials after a failed/rejected craft', () => {
    const inv = bagWithMaterials()
    const tx = lockMaterials(inv, 'req-4', [
      { item: silverOre, qty: 2 },
      { item: demonSoul, qty: 3 },
    ])!
    expect(countItem(inv, 'silver_ore')).toBe(1)
    expect(refundMaterials(inv, tx)).toBe(true)
    expect(tx.status).toBe('refunded')
    expect(countItem(inv, 'silver_ore')).toBe(3) // fully restored
    expect(countItem(inv, 'demon_soul')).toBe(5)
  })

  it('consume and refund are idempotent and mutually exclusive on a settled tx', () => {
    const inv = bagWithMaterials()
    const tx = lockMaterials(inv, 'req-5', [{ item: silverOre, qty: 2 }])!
    expect(consumeMaterials(tx)).toBe(true)
    // A late timeout after success must not double-refund.
    expect(refundMaterials(inv, tx)).toBe(false)
    expect(countItem(inv, 'silver_ore')).toBe(1)
    // And a second consume is a no-op too.
    expect(consumeMaterials(tx)).toBe(false)
  })
})
