import { describe, expect, it } from 'vitest'
import { compileBattleRuntimeProfile } from '../src/adapters/battleRuntimeProfile'
import { compileSl11BattleDefinition } from '../src/adapters/sl11BattleDefinition'
import { createEquipment } from '../src/systems/equipment'
import { createInventory } from '../src/systems/inventory'
import { createProgression } from '../src/systems/progression'
import { createDefaultSkillTreeState, learnSkill } from '../src/systems/skillTree'
import type { LoadedGameState } from '../src/systems/save'

function state(): LoadedGameState {
  return {
    progression: createProgression(1, 1),
    equipment: createEquipment(),
    inventory: createInventory(24),
    skillTree: createDefaultSkillTreeState(),
    soul: 0,
  }
}

describe('compileBattleRuntimeProfile', () => {
  it('folds weapon and armor stats into the authoritative combat profile', () => {
    const baselineState = state()
    baselineState.skillTree.schools[0].level = 1
    learnSkill(baselineState.skillTree, 0, 0)
    const baseline = compileBattleRuntimeProfile(baselineState)
    const equipped = state()
    equipped.skillTree.schools[0].level = 1
    learnSkill(equipped.skillTree, 0, 0)
    equipped.equipment.weapon = {
      id: 'qingyun-bingdao', name: '青云冰刀', kind: 'equip', rarity: 2,
      sourceType: 'zbwq', sourceUser: '悟空', sourceShowId: 1,
      effects: [{ type: 'stat', stat: 'atk', value: 7 }, { type: 'stat', stat: 'mp', value: 10 }],
    }
    equipped.equipment.armor = {
      id: 'qingyun-fapao', name: '青云法袍', kind: 'equip', rarity: 2,
      sourceType: 'zbfj', sourceUser: '悟空',
      effects: [{ type: 'stat', stat: 'def', value: 5 }, { type: 'stat', stat: 'hp', value: 20 }],
    }

    const compiled = compileBattleRuntimeProfile(equipped)
    expect(compiled.combat.atk).toBe((baseline.combat.atk ?? 0) + 7)
    expect(compiled.combat.def).toBe((baseline.combat.def ?? 0) + 5)
    expect(compiled.combat.maxHp).toBe((baseline.combat.maxHp ?? 0) + 20)
    expect(compiled.combat.maxMp).toBe((baseline.combat.maxMp ?? 0) + 10)
    expect(compiled.combat).toMatchObject({
      weaponItemId: 'qingyun-bingdao',
      armorItemId: 'qingyun-fapao',
      weaponShowId: 1,
      slzLevel: 1,
    })
    expect(compiled.hud.weaponName).toBe('青云冰刀')
    expect(compiled.hud.bindings.Y).toBe('slz')

    const baselineDefinition = compileSl11BattleDefinition(7, baseline.combat)
    const equippedDefinition = compileSl11BattleDefinition(7, compiled.combat)
    expect(equippedDefinition.hero.atk).toBe(baselineDefinition.hero.atk + 7)
    expect(equippedDefinition.hero.def).toBe(baselineDefinition.hero.def + 5)
    expect(equippedDefinition.hero.maxHp).toBe(baselineDefinition.hero.maxHp + 20)
    expect(equippedDefinition.hero.skills.slz.damage).toBeGreaterThan(baselineDefinition.hero.skills.slz.damage)
  })

  it('falls back to the default visible staff for unsupported appearance ids', () => {
    const loaded = state()
    loaded.equipment.weapon = {
      id: 'future-weapon', name: '未来兵器', kind: 'equip', rarity: 3,
      sourceType: 'zbwq', sourceUser: '悟空', sourceShowId: 99,
    }

    expect(compileBattleRuntimeProfile(loaded).combat.weaponShowId).toBe(0)
  })
})
