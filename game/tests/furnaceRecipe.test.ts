import { describe, expect, it } from 'vitest'
import originalEquipment from '../src/data/original/equipment.json'
import { addItem, countItem, createInventory, listStacks } from '../src/systems/inventory'
import {
  BEGINNER_RECIPE,
  RECIPE_MATERIALS,
  canCraft,
  craft,
  equipmentItemByFillName,
  findRecipe,
  listRecipes,
} from '../src/systems/furnaceRecipe'

function mustItem(fillName: string) {
  const item = equipmentItemByFillName(fillName)
  if (!item) throw new Error(`missing test item ${fillName}`)
  return item
}

function stackSnapshot(inv: ReturnType<typeof createInventory>): { id: string; qty: number }[] {
  return listStacks(inv).map((s) => ({ id: s.item.id, qty: s.qty }))
}

function give(inv: ReturnType<typeof createInventory>, fillName: string, qty: number): void {
  const result = addItem(inv, mustItem(fillName), qty)
  if (!result.ok) throw new Error(`failed to seed ${fillName} x${qty}`)
}

describe('furnace recipe catalog', () => {
  it('turns recovered armor stats into minimum runtime effects by default', () => {
    expect(equipmentItemByFillName('ptdxzf')).toMatchObject({
      id: 'ptdxzf',
      kind: 'equip',
      sourceType: 'zbfj',
      sourceUser: '悟空',
      sourceSaleValue: 20,
      sourceShowId: 1,
      effects: [
        { type: 'stat', stat: 'def', value: 2 },
        { type: 'stat', stat: 'hp', value: 20 },
        { type: 'stat', stat: 'mp', value: 12 },
      ],
    })
  })

  it('preserves the original weapon showid used by ROLE1_EQUIP_<showid>', () => {
    expect(equipmentItemByFillName('ptdxzg')).toMatchObject({ sourceShowId: 1 })
    expect(equipmentItemByFillName('whg')).toMatchObject({ sourceShowId: 2 })
  })

  it('uses the supplied rng for recovered equipment stats', () => {
    expect(equipmentItemByFillName('ptdxzg', () => 0.999)?.effects).toEqual([
      { type: 'stat', stat: 'atk', value: 5 },
    ])
  })

  it('preserves the minimum fractional crit roll on 虬龙棍', () => {
    const crit = equipmentItemByFillName('qlg', () => 0)?.effects
      ?.find((effect) => effect.type === 'stat' && effect.stat === 'crit')

    expect(crit?.value).toBeCloseTo(0.05)
  })

  it('preserves the maximum fractional crit roll on 虬龙棍', () => {
    const crit = equipmentItemByFillName('qlg', () => 1)?.effects
      ?.find((effect) => effect.type === 'stat' && effect.stat === 'crit')

    expect(crit?.value).toBeCloseTo(0.08)
  })

  it('uses the original Math.round semantics for integer stat ranges', () => {
    expect(equipmentItemByFillName('ptdxzg', () => 0.2)?.effects).toEqual([
      { type: 'stat', stat: 'atk', value: 3 },
    ])
  })

  it('does not attach meaningless runtime effects to materials', () => {
    expect(equipmentItemByFillName('wptm')).not.toHaveProperty('effects')
  })

  it('prepends the no-book beginner recipe before all 39 recovered 制作书 recipes', () => {
    const recipes = listRecipes()
    const bookFillNames = (originalEquipment as { items: { fillName: string; ename: string }[] }).items
      .filter((item) => item.ename.endsWith('制作书'))
      .map((item) => item.fillName)
      .sort()

    expect(recipes).toHaveLength(40)
    expect(recipes[0]).toEqual(BEGINNER_RECIPE)
    expect(recipes[0]).toMatchObject({
      bookFillName: 'starter_whg',
      bookName: '新手锻造：尾火棍',
      productFillName: 'whg',
      productName: '尾火棍',
      role: '悟空',
      quality: '优 秀',
      materials: [{ fillName: 'wptm', name: '檀木', qty: 3 }],
      soulCost: 20,
      requiresBook: false,
    })
    expect(Object.keys(RECIPE_MATERIALS).sort()).toEqual(bookFillNames)
    expect(recipes.slice(1).map((r) => r.bookFillName).sort()).toEqual(bookFillNames)
    expect(recipes.slice(1).every((recipe) => recipe.requiresBook)).toBe(true)
  })

  it('derives the 尾火棍 recipe shape from equipment.json plus the material table', () => {
    expect(findRecipe('whgzzs')).toMatchObject({
      bookFillName: 'whgzzs',
      bookName: '尾火棍制作书',
      productFillName: 'whg',
      productName: '尾火棍',
      role: '悟空',
      quality: '优 秀',
      materials: [{ fillName: 'wptm', name: '檀木', qty: 20 }],
      soulCost: 200,
      requiresBook: true,
    })
  })

  it('falls back to 1600 soul for at least one 邪灵/魂器 recipe', () => {
    expect(findRecipe('xleyzzs')).toMatchObject({ quality: '邪 灵', soulCost: 1600 })
    expect(findRecipe('qlgzzs')).toMatchObject({ quality: '魂 器', soulCost: 1600 })
  })
})

describe('canCraft', () => {
  it('allows the beginner recipe with only three 檀木 and 20 soul', () => {
    const inv = createInventory(4)
    give(inv, 'wptm', 3)

    expect(canCraft(inv, 20, 'starter_whg')).toEqual({ ok: true })
  })

  it('reports a missing book before checking materials or soul', () => {
    const inv = createInventory(4)
    give(inv, 'wptm', 20)

    expect(canCraft(inv, 200, 'whgzzs')).toEqual({ ok: false, reason: 'missing_book' })
  })

  it('reports missing materials with needed and owned quantities', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 12)

    expect(canCraft(inv, 200, 'whgzzs')).toEqual({
      ok: false,
      reason: 'missing_materials',
      missing: [{ fillName: 'wptm', name: '檀木', needed: 20, have: 12 }],
    })
  })

  it('reports insufficient soul after book and materials are present', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 20)

    expect(canCraft(inv, 199, 'whgzzs')).toEqual({
      ok: false,
      reason: 'insufficient_soul',
      needed: 200,
      have: 199,
    })
  })

  it('accepts when book, materials, and soul are all present', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 20)

    expect(canCraft(inv, 200, 'whgzzs')).toEqual({ ok: true })
  })
})

describe('craft', () => {
  it('crafts a fixed minimum-stat 尾火棍 without requiring or consuming a book', () => {
    const inv = createInventory(4)
    give(inv, 'wptm', 3)

    const result = craft(inv, 20, 'starter_whg', () => 1)

    expect(result).toMatchObject({ ok: true, soulSpent: 20, newSoul: 0 })
    if (!result.ok) return
    expect(countItem(inv, 'starter_whg')).toBe(0)
    expect(countItem(inv, 'wptm')).toBe(0)
    expect(countItem(inv, 'whg')).toBe(1)
    expect(result.item).toMatchObject({
      id: 'whg',
      name: '尾火棍',
      kind: 'equip',
      rarity: 2,
      sourceType: 'zbwq',
      sourceUser: '悟空',
      sourceSaleValue: 40,
      effects: [{ type: 'stat', stat: 'atk', value: 10 }],
    })
  })

  it('crafts 尾火棍 transactionally with the minimum random stat roll', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 20)

    const result = craft(inv, 200, 'whgzzs', () => 0)

    expect(result).toMatchObject({ ok: true, soulSpent: 200, newSoul: 0 })
    if (!result.ok) return
    expect(countItem(inv, 'whgzzs')).toBe(0)
    expect(countItem(inv, 'wptm')).toBe(0)
    expect(countItem(inv, 'whg')).toBe(1)
    expect(result.item).toMatchObject({
      id: 'whg',
      name: '尾火棍',
      kind: 'equip',
      rarity: 2,
      effects: [{ type: 'stat', stat: 'atk', value: 10 }],
    })
  })

  it('crafts 尾火棍 with an inclusive maximum random stat roll', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 20)

    const result = craft(inv, 200, 'whgzzs', () => 0.999)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.effects).toEqual([{ type: 'stat', stat: 'atk', value: 15 }])
  })

  it('rejects an unknown recipe without mutating the inventory', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 20)
    const before = stackSnapshot(inv)

    expect(craft(inv, 200, 'not-a-real-recipe', () => 0)).toEqual({
      ok: false,
      reason: 'unknown_recipe',
    })
    expect(stackSnapshot(inv)).toEqual(before)
  })

  it('does not partially deduct anything when materials are insufficient', () => {
    const inv = createInventory(4)
    give(inv, 'whgzzs', 1)
    give(inv, 'wptm', 19)
    const before = stackSnapshot(inv)

    const result = craft(inv, 200, 'whgzzs', () => 0)

    expect(result).toMatchObject({ ok: false, reason: 'missing_materials' })
    expect(stackSnapshot(inv)).toEqual(before)
  })

  it('rolls back book and materials if the produced item cannot fit', () => {
    const inv = createInventory(2)
    give(inv, 'whgzzs', 2)
    give(inv, 'wptm', 21)
    const before = stackSnapshot(inv)

    expect(craft(inv, 200, 'whgzzs', () => 0)).toEqual({ ok: false, reason: 'bag_full' })
    expect(stackSnapshot(inv)).toEqual(before)
  })
})
