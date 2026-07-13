import { describe, expect, it } from 'vitest'
import {
  createCombatRecording,
  MAX_COMBAT_REPLAY_TICKS,
  replayCombat,
  type CombatRecording,
} from '../src/replay/combatReplay'
import { stableHash, stableStringify } from '../src/replay/stableHash'
import { CombatSession } from '../src/session/combatSession'
import type { CombatCommand } from '../src/session/commands'
import { cloneSerializable } from '../src/session/snapshot'
import { makeSessionDefinition } from './fixtures/makeSessionDefinition'

const commands: CombatCommand[] = [
  { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' },
  { actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 3, atTick: 12, type: 'press-attack' },
]

describe('deterministic combat recording and replay', () => {
  it('reaches the recorded final hash and events from the same seed and commands', () => {
    const recording = createCombatRecording(makeSessionDefinition({ monsterX: 220 }), commands, 60)
    const replay = replayCombat(recording)

    expect(recording.expectedFinalHash).toBe('b641defd')
    expect(replay.finalHash).toBe(recording.expectedFinalHash)
    expect(replay.events).toEqual(recording.events)
    expect(replay.matchesExpectedHash).toBe(true)
    expect(replay.matchesRecordedEvents).toBe(true)
    expect(replay.verified).toBe(true)
  })

  it('detects a changed seed', () => {
    const recording = createCombatRecording(makeSessionDefinition({ monsterX: 220 }), commands, 60)
    const changed = cloneSerializable(recording)
    changed.definition.seed += 1

    const replay = replayCombat(changed)
    expect(replay.finalHash).not.toBe(recording.expectedFinalHash)
    expect(replay.matchesExpectedHash).toBe(false)
    expect(replay.verified).toBe(false)
  })

  it('detects changed content even if contentVersion is reused', () => {
    const recording = createCombatRecording(makeSessionDefinition(), [], 1)
    const changed = cloneSerializable(recording)
    changed.definition.hero.atk += 1

    expect(changed.definition.contentVersion).toBe(recording.definition.contentVersion)
    const replay = replayCombat(changed)
    expect(replay.finalHash).not.toBe(recording.expectedFinalHash)
    expect(replay.matchesExpectedHash).toBe(false)
    expect(replay.verified).toBe(false)
  })

  it('hashes authoritative queued state rather than only the render snapshot', () => {
    const left = new CombatSession(makeSessionDefinition())
    const right = new CombatSession(makeSessionDefinition())
    right.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 20, type: 'press-attack' })

    expect(right.getSnapshot()).toEqual(left.getSnapshot())
    expect(stableHash(right.getDeterministicState()))
      .not.toBe(stableHash(left.getDeterministicState()))
  })

  it('produces one hash and event stream across one hundred recordings', () => {
    const recordings = Array.from({ length: 100 }, () =>
      createCombatRecording(makeSessionDefinition({ monsterX: 220 }), commands, 60))

    expect(new Set(recordings.map((recording) => recording.expectedFinalHash)).size).toBe(1)
    expect(recordings.every((recording) =>
      stableStringify(recording.events) === stableStringify(recordings[0].events))).toBe(true)
  })

  it('owns definitions, commands, recordings, and replay results', () => {
    const definition = makeSessionDefinition({ monsterX: 220 })
    const sourceCommands = cloneSerializable(commands)
    const recording = createCombatRecording(definition, sourceCommands, 60)
    definition.hero.atk = 999
    sourceCommands[0].type = 'press-left'

    expect(recording.definition.hero.atk).toBe(36)
    expect(recording.commands[0].type).toBe('press-right')

    const first = replayCombat(recording)
    ;(first.events as any[]).splice(0)
    expect(replayCombat(recording).events).toEqual(recording.events)
  })

  it.each([-1, 1.5, Number.NaN])('rejects invalid totalTicks %s', (totalTicks) => {
    expect(() => createCombatRecording(makeSessionDefinition(), [], totalTicks)).toThrow(RangeError)
  })

  it.each([Number.MAX_SAFE_INTEGER + 1, MAX_COMBAT_REPLAY_TICKS + 1])(
    'rejects unsafe or excessive totalTicks %s',
    (totalTicks) => {
      expect(() => createCombatRecording(makeSessionDefinition(), [], totalTicks)).toThrow(RangeError)
      const recording = createCombatRecording(makeSessionDefinition(), [], 0)
      expect(() => replayCombat({ ...recording, totalTicks })).toThrow(RangeError)
    },
  )

  it('reports corrupted expected hash and recorded events as separate evidence failures', () => {
    const recording = createCombatRecording(makeSessionDefinition({ monsterX: 220 }), commands, 60)
    const wrongHash = cloneSerializable(recording)
    wrongHash.expectedFinalHash = '00000000'
    const hashReplay = replayCombat(wrongHash)

    expect(hashReplay.matchesExpectedHash).toBe(false)
    expect(hashReplay.matchesRecordedEvents).toBe(true)
    expect(hashReplay.verified).toBe(false)

    const wrongEvents = cloneSerializable(recording)
    wrongEvents.events = []
    const eventsReplay = replayCombat(wrongEvents)

    expect(eventsReplay.matchesExpectedHash).toBe(true)
    expect(eventsReplay.matchesRecordedEvents).toBe(false)
    expect(eventsReplay.verified).toBe(false)
  })

  it('rejects invalid recording versions and non-plain inputs', () => {
    const recording = createCombatRecording(makeSessionDefinition(), [], 1)
    expect(() => replayCombat({ ...recording, version: 2 } as unknown as CombatRecording)).toThrow()
    expect(() => replayCombat(new Date() as unknown as CombatRecording)).toThrow(TypeError)
    const cyclic = cloneSerializable(recording) as CombatRecording & { self?: unknown }
    cyclic.self = cyclic
    expect(() => replayCombat(cyclic)).toThrow(TypeError)
  })
})

describe('stable hash', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableStringify({ b: 2, a: { z: 3, c: 1 }, list: [2, 1] }))
      .toBe('{"a":{"c":1,"z":3},"b":2,"list":[2,1]}')
    expect(stableHash({ b: 2, a: 1 })).toBe('5314055b')
    expect(stableHash('西游')).toBe('7b6aeac7')
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }))
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]))
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => 1, new Date()])(
    'rejects non-canonical input %s',
    (value) => {
      expect(() => stableStringify(value)).toThrow(TypeError)
    },
  )

  it('rejects cycles', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => stableStringify(cyclic)).toThrow(TypeError)
  })
})
