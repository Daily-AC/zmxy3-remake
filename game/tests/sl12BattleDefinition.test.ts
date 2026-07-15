import { describe, expect, it } from 'vitest'
import { validateBattleDefinition } from '@zaixu/game-core'
import { compileSl12BattleDefinition } from '../src/adapters/sl12BattleDefinition'

describe('compileSl12BattleDefinition', () => {
  it('preserves the five official stop points and final dual-general order', () => {
    const definition = compileSl12BattleDefinition(0x5a17)

    expect(definition.level.id).toBe('sl12')
    expect(definition.level.bounds).toEqual({ left: -195.997, right: 5019.33, top: -138.582, bottom: 540 })
    expect(definition.level.encounters.map((encounter) => encounter.kind === 'stop-point' && encounter.stopX))
      .toEqual([1147.4, 1809.7, 2813.95, 3790.2, 4661.55])
    const final = definition.level.encounters[4]
    expect(final).toMatchObject({
      kind: 'stop-point',
      boss: true,
      spawns: [
        { speciesId: 'monster4', x: 4009.8, y: 343.2, delayTicks: 60, quantity: 1 },
        { speciesId: 'monster2', x: 4606.85, y: 351.2, delayTicks: 60, quantity: 1 },
      ],
    })
    expect(definition.level.door).toEqual({ x: 4520.9, y: 341.65, width: 185.8, height: 165 })
  })

  it('compiles all source monsters and extracted floor geometry as valid core content', () => {
    const definition = compileSl12BattleDefinition(7)

    expect(Object.keys(definition.monsters).sort()).toEqual(['monster2', 'monster4', 'monster7', 'monster8'])
    expect(definition.level.walls).toHaveLength(4)
    expect(definition.level.walls[0]).toMatchObject({ x: -180.629, y: 501.05, width: 5199.959 })
    expect(validateBattleDefinition(definition)).toEqual(definition)
  })
})
