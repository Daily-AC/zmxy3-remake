import { validateCombatSessionDefinition } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { buildCombatCoreSliceDefinition } from '../src/adapters/combatCoreDefinition'

describe('combat content build gate', () => {
  it('validates the production combat core slice', () => {
    expect(validateCombatSessionDefinition(buildCombatCoreSliceDefinition()))
      .toEqual(buildCombatCoreSliceDefinition())
  })

  it('rejects malformed content IDs and attack references', () => {
    const badContentId = structuredClone(buildCombatCoreSliceDefinition())
    badContentId.monsters[0].contentId = 'monster7' as never
    expect(() => validateCombatSessionDefinition(badContentId)).toThrow()

    const badAttackReference = structuredClone(buildCombatCoreSliceDefinition())
    badAttackReference.hero.normalAttacks.hit1.action = 'hit2'
    expect(() => validateCombatSessionDefinition(badAttackReference)).toThrow()
  })
})
