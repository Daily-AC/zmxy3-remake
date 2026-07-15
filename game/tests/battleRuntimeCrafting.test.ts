import { describe, expect, it } from 'vitest'
import {
  commitBattleRuntimeCraft,
  planBattleRuntimeCraft,
} from '../src/adapters/battleRuntimeCrafting'
import { createEquipment } from '../src/systems/equipment'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'
import { addItem, countItem, createInventory } from '../src/systems/inventory'
import { createProgression } from '../src/systems/progression'
import type { LoadedGameState } from '../src/systems/save'
import { createDefaultSkillTreeState } from '../src/systems/skillTree'

function state(): LoadedGameState {
  const inventory = createInventory(24)
  addItem(inventory, equipmentItemByFillName('wptm')!, 3)
  return {
    progression: createProgression(1),
    equipment: createEquipment(),
    inventory,
    skillTree: createDefaultSkillTreeState(),
    soul: 20,
  }
}

describe('battle runtime recipe crafting transaction adapter', () => {
  it('plans without mutation and commits material, soul, and product together', () => {
    const loaded = state()
    const result = planBattleRuntimeCraft(loaded, 'craft-1', 'starter_whg', () => 1)

    expect(result.ok).toBe(true)
    expect(countItem(loaded.inventory, 'wptm')).toBe(3)
    expect(countItem(loaded.inventory, 'whg')).toBe(0)
    expect(loaded.soul).toBe(20)
    if (!result.ok) return
    expect(result.plan).toMatchObject({
      transactionId: 'craft-1', recipeId: 'starter_whg', soulSpent: 20,
      item: { id: 'whg', sourceShowId: 2 },
    })
    commitBattleRuntimeCraft(loaded, result.plan)
    expect(countItem(loaded.inventory, 'wptm')).toBe(0)
    expect(countItem(loaded.inventory, 'whg')).toBe(1)
    expect(loaded.soul).toBe(0)
  })

  it('leaves the live save untouched when a requirement is missing', () => {
    const loaded = state()
    loaded.soul = 19
    expect(planBattleRuntimeCraft(loaded, 'craft-1', 'starter_whg')).toEqual({
      ok: false, reason: 'insufficient_soul', needed: 20, have: 19,
    })
    expect(countItem(loaded.inventory, 'wptm')).toBe(3)
    expect(loaded.soul).toBe(19)
  })
})
