import { BattleRuntime } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { compileSl13RuntimeGateDefinition } from '../src/adapters/sl13RuntimeGateDefinition'

describe('sl13 runtime browser gate', () => {
  it('shortens combat duration without changing the five source stops', () => {
    const definition = compileSl13RuntimeGateDefinition(7)
    expect(definition.level.encounters.map((encounter) => encounter.kind === 'stop-point' && encounter.stopX))
      .toEqual([1088.1, 1839.65, 2843.9, 3572.05, 4315.75])
    for (const encounter of definition.level.encounters) {
      if (encounter.kind !== 'stop-point') throw new Error('expected stop-point encounter')
      expect(encounter.spawns.every((spawn) => spawn.quantity === 1 && spawn.delayTicks === 0)).toBe(true)
    }
    expect(() => new BattleRuntime(definition)).not.toThrow()
  })
})
