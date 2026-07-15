import { describe, expect, it } from 'vitest'
import {
  createBattleRecording,
  playBattleRecording,
  replayBattle,
} from '../../src/battle/replay'
import type { BattleCommand } from '../../src/battle/types'
import { cloneSerializable } from '../../src/session/snapshot'
import { makeBattleDefinition } from './fixtures'

const commands: BattleCommand[] = [
  { type: 'press-right', actorId: 'hero-1', sequence: 1, atTick: 1 },
  { type: 'press-attack', actorId: 'hero-1', sequence: 2, atTick: 95 },
  { type: 'release-right', actorId: 'hero-1', sequence: 3, atTick: 120 },
]

describe('BattleRuntime recording and replay', () => {
  it('replays the same events and final hash', () => {
    const recording = createBattleRecording(makeBattleDefinition(), commands, 300)
    const replay = replayBattle(recording)

    expect(replay.events).toEqual(recording.events)
    expect(replay.finalHash).toBe(recording.expectedFinalHash)
    expect(replay.verified).toBe(true)
  })

  it('is independent of 30, 60, and 120 Hz render schedules', () => {
    const recording = createBattleRecording(makeBattleDefinition(), commands, 300)
    const hashes = [30, 60, 120].map((renderHz) =>
      playBattleRecording(recording, { renderHz }).finalHash)

    expect(new Set(hashes)).toEqual(new Set([recording.expectedFinalHash]))
  })

  it('detects changed content and owns recording inputs', () => {
    const definition = makeBattleDefinition()
    const sourceCommands = cloneSerializable(commands)
    const recording = createBattleRecording(definition, sourceCommands, 300)
    definition.seed += 1
    sourceCommands[0].type = 'press-left'

    expect(replayBattle(recording).verified).toBe(true)
    const changed = cloneSerializable(recording)
    changed.definition.seed += 1
    expect(replayBattle(changed).verified).toBe(false)
  })

  it('records skill commands, MP spending, and cooldown state deterministically', () => {
    const definition = makeBattleDefinition()
    definition.hero.skills.slz = {
      id: 'slz', action: 'hit6', learnedLevel: 1, mpCost: 36,
      durationTicks: 20, cooldownTicks: 20, hitTick: 1,
      hitbox: { forward: 30, y: 0, width: 170, height: 150 },
      damage: 200, attackKind: 'physics',
    }
    const recording = createBattleRecording(definition, [
      { type: 'press-skill', skillId: 'slz', actorId: 'hero-1', sequence: 1, atTick: 1 },
    ], 30)
    const replay = replayBattle(recording)

    expect(recording.events).toContainEqual(expect.objectContaining({
      type: 'skill-cast', skillId: 'slz', mpBefore: 50, mpAfter: 14,
    }))
    expect(replay.verified).toBe(true)
  })
})
