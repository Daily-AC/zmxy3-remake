import { describe, expect, it } from 'vitest'
import {
  commitBattleRuntimeEquipment,
  planBattleRuntimeEquip,
  planBattleRuntimeUnequip,
} from '../src/adapters/battleRuntimeEquipment'
import { compileSl11BattleDefinition } from '../src/adapters/sl11BattleDefinition'
import { compileBattleRuntimeProfile } from '../src/adapters/battleRuntimeProfile'
import { createEquipment } from '../src/systems/equipment'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'
import { addItem, countItem, createInventory } from '../src/systems/inventory'
import { createProgression } from '../src/systems/progression'
import type { LoadedGameState } from '../src/systems/save'
import { createDefaultSkillTreeState } from '../src/systems/skillTree'

function state(): LoadedGameState {
  return {
    progression: createProgression(1, 1),
    equipment: createEquipment(),
    inventory: createInventory(24),
    skillTree: createDefaultSkillTreeState(),
    soul: 0,
  }
}

describe('battle runtime equipment transaction adapter', () => {
  it('plans on a clone and commits a weapon with its combat and visual loadout', () => {
    const loaded = state()
    const weapon = equipmentItemByFillName('whg')!
    addItem(loaded.inventory, weapon, 1)
    const baselineAtk = compileBattleRuntimeProfile(loaded).combat.atk!
    const definition = compileSl11BattleDefinition(7, compileBattleRuntimeProfile(loaded).combat)
    const result = planBattleRuntimeEquip(loaded, definition, 'equip-1', weapon)

    expect(result.ok).toBe(true)
    expect(loaded.equipment.weapon).toBeNull()
    expect(countItem(loaded.inventory, 'whg')).toBe(1)
    if (!result.ok) return
    expect(result.plan.loadout).toMatchObject({
      atk: expect.any(Number),
      equipment: { weaponItemId: 'whg', weaponShowId: 2 },
    })
    expect(result.plan.loadout.atk).toBeGreaterThan(baselineAtk)
    commitBattleRuntimeEquipment(loaded, result.plan)
    expect(loaded.equipment.weapon?.id).toBe('whg')
    expect(countItem(loaded.inventory, 'whg')).toBe(0)
  })

  it('returns the worn item to the bag only after an unequip confirmation', () => {
    const loaded = state()
    loaded.equipment.armor = equipmentItemByFillName('ptdxzf')!
    const definition = compileSl11BattleDefinition(7)
    const result = planBattleRuntimeUnequip(loaded, definition, 'unequip-1', 'armor')

    expect(result.ok).toBe(true)
    expect(loaded.equipment.armor?.id).toBe('ptdxzf')
    if (!result.ok) return
    expect(result.plan.loadout.equipment.armorItemId).toBeNull()
    commitBattleRuntimeEquipment(loaded, result.plan)
    expect(loaded.equipment.armor).toBeNull()
    expect(countItem(loaded.inventory, 'ptdxzf')).toBe(1)
  })

  it('rejects equipment for an unsupported role before creating a transaction', () => {
    const loaded = state()
    const wrongRole = {
      id: 'other-role', name: '九齿钉耙', kind: 'equip', rarity: 1,
      sourceType: 'zbwq', sourceUser: '八戒', sourceShowId: 1,
    } as const
    addItem(loaded.inventory, wrongRole, 1)

    expect(planBattleRuntimeEquip(loaded, compileSl11BattleDefinition(7), 'equip-1', wrongRole))
      .toEqual({ ok: false, reason: 'wrong_role' })
  })
})
