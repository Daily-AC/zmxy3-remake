import { validateBattleDefinition } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { compileSl13BattleDefinition } from '../src/adapters/sl13BattleDefinition'

describe('compileSl13BattleDefinition', () => {
  it('compiles the five source stop points, fourteen spawners and Giant Spirit finale', () => {
    const definition = compileSl13BattleDefinition(0x5a17)

    expect(definition.level.id).toBe('sl13')
    expect(definition.level.encounters.map((encounter) => encounter.kind === 'stop-point' && encounter.stopX))
      .toEqual([1088.1, 1839.65, 2843.9, 3572.05, 4315.75])
    expect(definition.level.encounters.flatMap((encounter) => encounter.kind === 'stop-point' ? encounter.spawns : []))
      .toHaveLength(14)
    expect(definition.level.encounters[4]).toMatchObject({
      kind: 'stop-point',
      boss: true,
      spawns: [
        { speciesId: 'monster5', x: 4148.65, y: 340, delayTicks: 60, quantity: 1 },
        { speciesId: 'monster30', x: 3842, y: 334.5, delayTicks: 150, intervalTicks: 120, quantity: 30 },
        { speciesId: 'monster30', x: 4224.15, y: 336, delayTicks: 150, intervalTicks: 120, quantity: 30 },
      ],
    })
  })

  it('includes every scene-referenced monster and exact extracted geometry', () => {
    const definition = compileSl13BattleDefinition(7)
    expect(Object.keys(definition.monsters).sort()).toEqual([
      'monster3', 'monster30', 'monster5', 'monster7', 'monster8',
    ])
    expect(definition.level.walls).toHaveLength(4)
    expect(definition.level.door).toEqual({ x: 4059.3, y: 342.45, width: 185.8, height: 165 })
    expect(validateBattleDefinition(definition)).toEqual(definition)
  })
})
