import { describe, expect, it } from 'vitest'
import {
  advanceEncounter,
  createEncounterState,
  type EncounterAdvanceContext,
} from '../../src/battle/encounter'
import { makeBattleDefinition } from './fixtures'

function context(overrides: Partial<EncounterAdvanceContext> = {}): EncounterAdvanceContext {
  return {
    tick: 0,
    hero: { x: 100, y: 400 },
    interactPressed: false,
    livingByEncounter: () => 0,
    random: () => 0.5,
    ...overrides,
  }
}

describe('sl11 encounter state', () => {
  it('waits for the initial delay and then spawns the configured count', () => {
    const level = makeBattleDefinition().level
    const state = createEncounterState(level)

    expect(advanceEncounter(state, level, context({ tick: 89 }))).toEqual([])
    expect(advanceEncounter(state, level, context({ tick: 90 }))).toEqual([
      { type: 'spawn-monster', encounterId: 'continuous-0', speciesId: 'monster30', x: 100, y: 200, boss: false },
      { type: 'spawn-monster', encounterId: 'continuous-0', speciesId: 'monster30', x: 100, y: 200, boss: false },
    ])
    expect(advanceEncounter(state, level, context({ tick: 269 }))).toEqual([])
    expect(advanceEncounter(state, level, context({ tick: 270 }))).toHaveLength(2)
  })

  it('uses injected random values for species and hero-relative positions', () => {
    const definition = makeBattleDefinition()
    const encounter = definition.level.encounters[0]
    if (encounter.kind !== 'continuous') throw new Error('expected continuous fixture')
    encounter.roster.push('monster30')
    encounter.count = 1
    const values = [0.99, 0, 1]
    const state = createEncounterState(definition.level)

    expect(advanceEncounter(state, definition.level, context({
      tick: 90,
      hero: { x: 400, y: 100 },
      random: () => values.shift() ?? 0,
    }))).toEqual([
      { type: 'spawn-monster', encounterId: 'continuous-0', speciesId: 'monster30', x: 250, y: 0, boss: false },
    ])
  })

  it('activates the boss once at the height trigger and stops continuous spawning', () => {
    const level = makeBattleDefinition().level
    const state = createEncounterState(level)

    expect(advanceEncounter(state, level, context({ tick: 90, hero: { x: 100, y: -1900 } }))).toEqual([
      {
        type: 'activate-boss',
        encounterId: 'continuous-0:boss',
        speciesId: 'monster30',
        x: 750,
        y: -1872.45,
        boss: true,
      },
    ])
    expect(advanceEncounter(state, level, context({
      tick: 91,
      hero: { x: 100, y: -1900 },
      livingByEncounter: () => 1,
    }))).toEqual([])
  })

  it('reveals the door after the boss is gone and clears only on overlap plus interact', () => {
    const level = makeBattleDefinition().level
    const state = createEncounterState(level)
    advanceEncounter(state, level, context({ tick: 1, hero: { x: 100, y: -1900 } }))

    expect(advanceEncounter(state, level, context({ tick: 2 }))).toEqual([{ type: 'reveal-door' }])
    expect(advanceEncounter(state, level, context({
      tick: 3,
      hero: { x: 710, y: -1900 },
    }))).toEqual([])
    expect(advanceEncounter(state, level, context({
      tick: 4,
      hero: { x: 710, y: -1900 },
      interactPressed: true,
    }))).toEqual([{ type: 'stage-cleared' }])
    expect(state.phase).toBe('cleared')
  })
})
