import { stableHash, stableStringify } from '../replay/stableHash'
import { cloneSerializable } from '../session/snapshot'
import { TICK_MS } from '../time/tick'
import { validateBattleDefinition } from './definition'
import { BattleRuntime } from './runtime'
import type { BattleCommand, BattleDefinition, BattleEvent } from './types'

export const MAX_BATTLE_REPLAY_TICKS = 30 * 60 * 60

export interface BattleRecording {
  version: 1
  definition: BattleDefinition
  commands: BattleCommand[]
  totalTicks: number
  events: BattleEvent[]
  expectedFinalHash: string
}

export interface BattleReplayResult {
  events: BattleEvent[]
  finalHash: string
  matchesExpectedHash: boolean
  matchesRecordedEvents: boolean
  verified: boolean
}

function validateTicks(totalTicks: number): void {
  if (!Number.isSafeInteger(totalTicks) || totalTicks < 0 || totalTicks > MAX_BATTLE_REPLAY_TICKS) {
    throw new RangeError(`totalTicks must be between 0 and ${MAX_BATTLE_REPLAY_TICKS}`)
  }
}

function ownCommands(commands: readonly BattleCommand[]): BattleCommand[] {
  const owned = cloneSerializable(commands).map((command) => ({ ...command }))
  for (const [index, command] of owned.entries()) {
    if (!Number.isSafeInteger(command.sequence) || command.sequence < 0) {
      throw new TypeError(`command ${index} sequence is invalid`)
    }
    if (!Number.isSafeInteger(command.atTick) || command.atTick < 1) {
      throw new TypeError(`command ${index} tick is invalid`)
    }
  }
  return owned
}

function run(
  definition: BattleDefinition,
  commands: readonly BattleCommand[],
  totalTicks: number,
  renderHz?: number,
): { events: BattleEvent[]; finalHash: string } {
  const runtime = new BattleRuntime(definition)
  for (const command of commands) runtime.enqueue(command)
  const events: BattleEvent[] = []
  if (renderHz === undefined) {
    events.push(...runtime.step(totalTicks))
  } else {
    if (!Number.isFinite(renderHz) || renderHz <= 0) throw new RangeError('renderHz must be positive')
    const renderDeltaMs = 1000 / renderHz
    let accumulatorMs = 0
    let processedTicks = 0
    while (processedTicks < totalTicks) {
      accumulatorMs += renderDeltaMs
      const available = Math.floor((accumulatorMs + 1e-9) / TICK_MS)
      if (available === 0) continue
      const batch = Math.min(available, totalTicks - processedTicks)
      events.push(...runtime.step(batch))
      processedTicks += batch
      accumulatorMs -= batch * TICK_MS
    }
  }
  return {
    events: cloneSerializable(events),
    finalHash: stableHash(runtime.getDeterministicState()),
  }
}

export function createBattleRecording(
  definition: BattleDefinition,
  commands: readonly BattleCommand[],
  totalTicks: number,
): BattleRecording {
  validateTicks(totalTicks)
  const ownedDefinition = validateBattleDefinition(definition)
  const ownedCommands = ownCommands(commands)
  const result = run(ownedDefinition, ownedCommands, totalTicks)
  return cloneSerializable({
    version: 1,
    definition: ownedDefinition,
    commands: ownedCommands,
    totalTicks,
    events: result.events,
    expectedFinalHash: result.finalHash,
  })
}

export function playBattleRecording(
  recording: BattleRecording,
  options: { renderHz?: number } = {},
): { events: BattleEvent[]; finalHash: string } {
  validateTicks(recording.totalTicks)
  return run(
    validateBattleDefinition(recording.definition),
    ownCommands(recording.commands),
    recording.totalTicks,
    options.renderHz,
  )
}

export function replayBattle(recording: BattleRecording): BattleReplayResult {
  const owned = cloneSerializable(recording)
  if (owned.version !== 1) throw new TypeError('battle recording version must be 1')
  if (!/^[0-9a-f]{8}$/.test(owned.expectedFinalHash)) throw new TypeError('expected final hash is invalid')
  const result = playBattleRecording(owned)
  const matchesExpectedHash = result.finalHash === owned.expectedFinalHash
  const matchesRecordedEvents = stableStringify(result.events) === stableStringify(owned.events)
  return cloneSerializable({
    ...result,
    matchesExpectedHash,
    matchesRecordedEvents,
    verified: matchesExpectedHash && matchesRecordedEvents,
  })
}
