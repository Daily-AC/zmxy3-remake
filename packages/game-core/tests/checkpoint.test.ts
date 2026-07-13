import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '@zaixu/protocol'
import { toDeterministicValue, type CombatDeterministicState } from '../src/session/checkpoint'

describe('toDeterministicValue', () => {
  it('encodes non-finite timers and undefined deterministically', () => {
    expect(toDeterministicValue({
      lastPressAtMs: Number.NEGATIVE_INFINITY,
      deadTimerMs: Number.POSITIVE_INFINITY,
      invalid: Number.NaN,
      missing: undefined,
    })).toEqual({
      deadTimerMs: 'positive-infinity',
      invalid: 'nan',
      lastPressAtMs: 'negative-infinity',
      missing: null,
    })
  })

  it('sorts object keys recursively for stable serialization', () => {
    expect(Object.keys(toDeterministicValue({ z: 1, a: { y: 2, b: 3 } }) as object)).toEqual(['a', 'z'])
    expect(Object.keys((toDeterministicValue({ z: 1, a: { y: 2, b: 3 } }) as any).a)).toEqual(['b', 'y'])
  })

  it('rejects functions', () => {
    expect(() => toDeterministicValue({ random: () => 0.5 })).toThrow(TypeError)
  })

  it('pins checkpoint protocol metadata to the shared protocol version', () => {
    const state: CombatDeterministicState = {
      version: 1,
      contentVersion: 'combat-core-slice@1',
      domain: {
        tick: 0,
        randomState: 1,
        definition: {},
        heroSimulation: {},
        heroCombat: {},
        monsters: [{ id: 'monster-1', attackId: 0, swingEventId: 0, simulation: {} }],
      },
      protocol: {
        protocolVersion: PROTOCOL_VERSION,
        queuedCommands: [],
        lastSeenSequences: [],
      },
    }
    expect(state.protocol.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(state.domain.monsters[0].swingEventId).toBe(0)
  })
})
