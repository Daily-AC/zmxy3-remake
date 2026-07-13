import type { CombatEvent } from '@zaixu/game-core'
import { PRESENTATION_CONTRACT_VERSION } from '@zaixu/presentation-contract'
import { describe, expect, it } from 'vitest'
import { presentationCuesFor } from '../src/adapters/combatCorePresentation'

describe('combat core presentation', () => {
  it('maps an airborne Wukong whiff to the original swing effect and sound', () => {
    expect(presentationCuesFor({
      type: 'attack-started',
      tick: 4,
      sourceId: 'hero-1',
      attackId: 1,
      action: 'hit1',
      airborne: true,
    })).toEqual([{
      presentationVersion: PRESENTATION_CONTRACT_VERSION,
      tick: 4,
      type: 'swing',
      payload: { actorId: 'hero-1', action: 'hit1', effect: 'hit3', sound: 'hit12' },
    }])
  })

  it('maps every domain event without losing its version or tick', () => {
    const events: CombatEvent[] = [
      { type: 'attack-started', tick: 1, sourceId: 'monster-1', attackId: 1, action: 'hit1', airborne: false },
      { type: 'hit-confirmed', tick: 2, sourceId: 'hero-1', targetId: 'monster-1', attackId: 1 },
      { type: 'damage-applied', tick: 3, sourceId: 'hero-1', targetId: 'monster-1', attackId: 1, rawPower: 36, defense: 4, amount: 32, remainingHp: 118 },
      { type: 'actor-staggered', tick: 4, actorId: 'monster-1', untilTick: 19 },
      { type: 'actor-defeated', tick: 5, actorId: 'monster-1', sourceId: 'hero-1' },
      { type: 'actor-removed', tick: 6, actorId: 'monster-1' },
      { type: 'actor-respawned', tick: 7, actorId: 'hero-1', x: 480, y: 400 },
    ]
    const cues = events.flatMap(presentationCuesFor)

    expect(cues.map((entry) => entry.type)).toEqual([
      'swing', 'impact', 'damage-number', 'animation', 'defeated', 'removed', 'respawn',
    ])
    expect(cues.every((entry) => entry.presentationVersion === PRESENTATION_CONTRACT_VERSION)).toBe(true)
    expect(cues.map((entry) => entry.tick)).toEqual(events.map((event) => event.tick))
    expect(cues[0].payload).toMatchObject({ effect: null, sound: null })
    expect(cues[1].payload).toMatchObject({ hitStopMs: 50 })
    expect(cues[4]).toMatchObject({ type: 'defeated', payload: { actorId: 'monster-1' } })
  })

  it('suppresses rejected mash commands', () => {
    expect(presentationCuesFor({
      type: 'command-rejected',
      tick: 6,
      reason: 'busy',
      command: { actorId: 'hero-1', sequence: 2, atTick: 6, type: 'press-attack' },
    })).toEqual([])
  })
})
