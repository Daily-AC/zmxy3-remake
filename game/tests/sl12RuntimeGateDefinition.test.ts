import { BattleRuntime } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { compileSl12RuntimeGateDefinition } from '../src/adapters/sl12RuntimeGateDefinition'

describe('sl12 runtime browser gate', () => {
  it('shortens only combat duration while preserving stop order and the real command runtime', () => {
    const definition = compileSl12RuntimeGateDefinition(7)

    expect(definition.level.encounters.map((encounter) => encounter.kind === 'stop-point' && encounter.stopX))
      .toEqual([1147.4, 1809.7, 2813.95, 3790.2, 4661.55])
    for (const encounter of definition.level.encounters) {
      if (encounter.kind !== 'stop-point') throw new Error('expected stop-point encounter')
      expect(encounter.spawns.every((spawn) => spawn.quantity === 1 && spawn.delayTicks === 0)).toBe(true)
    }
    expect(() => new BattleRuntime(definition)).not.toThrow()
  })
})
