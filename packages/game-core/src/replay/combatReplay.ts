import { CombatSession } from '../session/combatSession'
import type { CombatCommand, CombatCommandType } from '../session/commands'
import { validateCombatSessionDefinition } from '../session/definition'
import type { CombatEvent } from '../session/events'
import { cloneSerializable } from '../session/snapshot'
import type { CombatSessionDefinition } from '../session/types'
import { stableHash, stableStringify } from './stableHash'

export interface CombatRecording {
  version: 1
  definition: CombatSessionDefinition
  commands: readonly CombatCommand[]
  totalTicks: number
  events: readonly CombatEvent[]
  expectedFinalHash: string
}

export interface CombatReplayResult {
  events: readonly CombatEvent[]
  finalHash: string
  matchesExpectedHash: boolean
  matchesRecordedEvents: boolean
  verified: boolean
}

export type ReplayResult = CombatReplayResult

interface CombatRunResult {
  events: readonly CombatEvent[]
  finalHash: string
}

// One hour at the canonical 30 Hz simulation rate bounds untrusted replay work.
export const MAX_COMBAT_REPLAY_TICKS = 30 * 60 * 60

const COMMAND_TYPES = new Set<CombatCommandType>([
  'press-left',
  'release-left',
  'press-right',
  'release-right',
  'press-jump',
  'press-attack',
])

function validateTotalTicks(totalTicks: number): void {
  if (!Number.isSafeInteger(totalTicks) || totalTicks < 0 || totalTicks > MAX_COMBAT_REPLAY_TICKS) {
    throw new RangeError(
      `totalTicks must be a safe integer between 0 and ${MAX_COMBAT_REPLAY_TICKS}`,
    )
  }
}

function ownCommands(input: unknown): CombatCommand[] {
  const commands = cloneSerializable(input)
  if (!Array.isArray(commands)) throw new TypeError('recording commands must be an array')
  return commands.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`command ${index} must be an object`)
    }
    const record = entry as Record<string, unknown>
    const keys = Object.keys(record).sort()
    if (keys.join(',') !== 'actorId,atTick,sequence,type') {
      throw new TypeError(`command ${index} has invalid fields`)
    }
    if (typeof record.actorId !== 'string' || record.actorId.length === 0) {
      throw new TypeError(`command ${index} actorId must be a non-empty string`)
    }
    if (!Number.isInteger(record.sequence) || (record.sequence as number) < 0) {
      throw new RangeError(`command ${index} sequence must be a non-negative integer`)
    }
    if (!Number.isInteger(record.atTick) || (record.atTick as number) < 1) {
      throw new RangeError(`command ${index} atTick must be a positive integer`)
    }
    if (typeof record.type !== 'string' || !COMMAND_TYPES.has(record.type as CombatCommandType)) {
      throw new TypeError(`command ${index} type is invalid`)
    }
    return {
      actorId: record.actorId,
      sequence: record.sequence as number,
      atTick: record.atTick as number,
      type: record.type as CombatCommandType,
    }
  })
}

function runCombat(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): CombatRunResult {
  const session = new CombatSession(definition)
  for (const command of commands) session.enqueue(command)
  const events = cloneSerializable(session.step(totalTicks))
  return cloneSerializable({
    events,
    finalHash: stableHash(session.getDeterministicState()),
  })
}

export function createCombatRecording(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): CombatRecording {
  validateTotalTicks(totalTicks)
  const ownedDefinition = validateCombatSessionDefinition(definition)
  const ownedCommands = ownCommands(commands)
  const result = runCombat(ownedDefinition, ownedCommands, totalTicks)
  return cloneSerializable({
    version: 1,
    definition: ownedDefinition,
    commands: ownedCommands,
    totalTicks,
    events: result.events,
    expectedFinalHash: result.finalHash,
  })
}

export function replayCombat(recording: CombatRecording): CombatReplayResult {
  const owned = cloneSerializable(recording) as unknown
  if (owned === null || typeof owned !== 'object' || Array.isArray(owned)) {
    throw new TypeError('recording must be an object')
  }
  const record = owned as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'commands,definition,events,expectedFinalHash,totalTicks,version') {
    throw new TypeError('recording has invalid fields')
  }
  if (record.version !== 1) throw new TypeError('recording version must be 1')
  if (typeof record.totalTicks !== 'number') throw new TypeError('recording totalTicks must be a number')
  validateTotalTicks(record.totalTicks)
  if (!Array.isArray(record.events)) throw new TypeError('recording events must be an array')
  if (typeof record.expectedFinalHash !== 'string' || !/^[0-9a-f]{8}$/.test(record.expectedFinalHash)) {
    throw new TypeError('recording expectedFinalHash must be an eight-character lowercase hex string')
  }
  const definition = validateCombatSessionDefinition(record.definition)
  const commands = ownCommands(record.commands)
  const result = runCombat(definition, commands, record.totalTicks)
  const matchesExpectedHash = result.finalHash === record.expectedFinalHash
  const matchesRecordedEvents = stableStringify(result.events) === stableStringify(record.events)
  return cloneSerializable({
    ...result,
    matchesExpectedHash,
    matchesRecordedEvents,
    verified: matchesExpectedHash && matchesRecordedEvents,
  })
}
