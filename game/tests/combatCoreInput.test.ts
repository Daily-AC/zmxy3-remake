import { describe, expect, it } from 'vitest'
import { CombatCoreInput } from '../src/adapters/combatCoreInput'

describe('CombatCoreInput', () => {
  it('emits ordered rising and release edges with monotonic sequences', () => {
    const input = new CombatCoreInput()
    expect(input.sample('hero-1', 1, { left: true, right: false, jump: false, attack: true }).map((c) => c.type))
      .toEqual(['press-left', 'press-attack'])
    expect(input.sample('hero-1', 2, { left: false, right: true, jump: true, attack: false })).toEqual([
      { actorId: 'hero-1', sequence: 3, atTick: 2, type: 'release-left' },
      { actorId: 'hero-1', sequence: 4, atTick: 2, type: 'press-right' },
      { actorId: 'hero-1', sequence: 5, atTick: 2, type: 'press-jump' },
    ])
  })

  it('does not repeat held edges and resumes sequences after release', () => {
    const input = new CombatCoreInput()
    const held = { left: false, right: true, jump: true, attack: true }

    expect(input.sample('hero-1', 4, held).map((command) => command.type))
      .toEqual(['press-right', 'press-jump', 'press-attack'])
    expect(input.sample('hero-1', 5, held)).toEqual([])
    expect(input.sample('hero-1', 6, { ...held, right: false, jump: false, attack: false }))
      .toEqual([{ actorId: 'hero-1', sequence: 4, atTick: 6, type: 'release-right' }])
    expect(input.sample('hero-1', 7, { ...held, jump: false, attack: false }))
      .toEqual([{ actorId: 'hero-1', sequence: 5, atTick: 7, type: 'press-right' }])
  })
})
