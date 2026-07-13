import { calculateNormalAttackPower, CombatSession, TICK_MS } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { buildCombatCoreSliceDefinition } from '../src/adapters/combatCoreDefinition'
import { LEVEL1_MONSTER_STATS } from '../src/data/levels/level1'
import roleRaw from '../src/data/roles/role1.json'
import { actionDurationMs, type RoleData } from '../src/systems/roleData'

const roleData = roleRaw as RoleData

describe('combat core real-data parity', () => {
  it('derives Wukong timing and Monster7 damage from the same source modules as BattleScene', () => {
    const definition = buildCombatCoreSliceDefinition({ monsterX: 600 })
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
    const damage = session.step(2).find((event) => event.type === 'damage-applied')

    expect(damage).toMatchObject({
      rawPower: calculateNormalAttackPower('hit1', 36, {
        critChance: 0,
        forceCrit: false,
        random: () => 0.5,
      }),
      defense: LEVEL1_MONSTER_STATS.monster7.def,
      amount: 32,
    })
    expect(definition.hero.comboStageDurationsMs[0])
      .toBe(actionDurationMs(roleData.actions.hit1, TICK_MS))
    expect(definition.monsters[0].attackPower).toBe(14)
  })
})
