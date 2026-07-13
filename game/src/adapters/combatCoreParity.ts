import {
  CombatSession,
  stableHash,
  validateCombatSessionDefinition,
  type CombatActorSnapshot,
  type CombatCommand,
  type CombatDeterministicState,
  type CombatEvent,
  type CombatSessionDefinition,
  type CombatSnapshot,
} from '@zaixu/game-core'
import { LegacyCombatSliceOracle } from './legacyCombatSliceOracle'

export interface CombatParityDiff {
  tick: number
  field: string
  legacy: unknown
  modern: unknown
}

export interface CombatParityReport {
  legacyFinalHash: string
  modernFinalHash: string
  diffs: readonly CombatParityDiff[]
}

const ACTOR_FIELDS = [
  'x',
  'y',
  'facing',
  'action',
  'comboStage',
  'hp',
  'lifeState',
  'statuses',
  'knockbackVelocityX',
  'attackId',
  'attacking',
] as const satisfies readonly (keyof CombatActorSnapshot)[]

function collectValueDiffs(
  diffs: CombatParityDiff[],
  tick: number,
  field: string,
  legacy: unknown,
  modern: unknown,
): void {
  if (Object.is(legacy, modern)) return
  if (Array.isArray(legacy) && Array.isArray(modern)) {
    const length = Math.max(legacy.length, modern.length)
    for (let index = 0; index < length; index += 1) {
      collectValueDiffs(diffs, tick, `${field}.${index}`, legacy[index], modern[index])
    }
    return
  }
  if (
    legacy !== null && modern !== null &&
    typeof legacy === 'object' && typeof modern === 'object' &&
    !Array.isArray(legacy) && !Array.isArray(modern)
  ) {
    const legacyRecord = legacy as Record<string, unknown>
    const modernRecord = modern as Record<string, unknown>
    const keys = new Set([...Object.keys(legacyRecord), ...Object.keys(modernRecord)])
    for (const key of [...keys].sort()) {
      collectValueDiffs(diffs, tick, `${field}.${key}`, legacyRecord[key], modernRecord[key])
    }
    return
  }
  diffs.push({ tick, field, legacy, modern })
}

export function compareCombatSnapshots(
  tick: number,
  legacy: CombatSnapshot,
  modern: CombatSnapshot,
): CombatParityDiff[] {
  const diffs: CombatParityDiff[] = []
  collectValueDiffs(diffs, tick, 'snapshot.version', legacy.version, modern.version)
  collectValueDiffs(diffs, tick, 'snapshot.contentVersion', legacy.contentVersion, modern.contentVersion)
  collectValueDiffs(diffs, tick, 'snapshot.tick', legacy.tick, modern.tick)
  collectValueDiffs(diffs, tick, 'snapshot.randomState', legacy.randomState, modern.randomState)

  const legacyActorOrder = legacy.actors.map((actor) => actor.id)
  const modernActorOrder = modern.actors.map((actor) => actor.id)
  if (legacyActorOrder.some((actorId, index) => actorId !== modernActorOrder[index]) ||
      legacyActorOrder.length !== modernActorOrder.length) {
    diffs.push({
      tick,
      field: 'actors.order',
      legacy: legacyActorOrder,
      modern: modernActorOrder,
    })
  }

  const legacyActors = new Map(legacy.actors.map((actor) => [actor.id, actor]))
  const modernActors = new Map(modern.actors.map((actor) => [actor.id, actor]))
  const actorIds = new Set([...legacyActors.keys(), ...modernActors.keys()])
  for (const actorId of [...actorIds].sort()) {
    const legacyActor = legacyActors.get(actorId)
    const modernActor = modernActors.get(actorId)
    if (!legacyActor || !modernActor) {
      diffs.push({ tick, field: `actors.${actorId}`, legacy: legacyActor, modern: modernActor })
      continue
    }
    for (const field of ACTOR_FIELDS) {
      collectValueDiffs(
        diffs,
        tick,
        `actors.${actorId}.${field}`,
        legacyActor[field],
        modernActor[field],
      )
    }
  }
  return diffs
}

export function compareCombatCheckpoints(
  tick: number,
  legacy: CombatDeterministicState,
  modern: CombatDeterministicState,
): CombatParityDiff[] {
  const diffs: CombatParityDiff[] = []
  collectValueDiffs(diffs, tick, 'checkpoint', legacy, modern)
  return diffs
}

function compareCombatFrame(
  tick: number,
  legacyEvents: readonly CombatEvent[],
  modernEvents: readonly CombatEvent[],
  legacySnapshot: CombatSnapshot,
  modernSnapshot: CombatSnapshot,
  legacyCheckpoint: CombatDeterministicState,
  modernCheckpoint: CombatDeterministicState,
): CombatParityDiff[] {
  const diffs = compareCombatSnapshots(tick, legacySnapshot, modernSnapshot)
  collectValueDiffs(diffs, tick, 'events', legacyEvents, modernEvents)
  diffs.push(...compareCombatCheckpoints(tick, legacyCheckpoint, modernCheckpoint))
  collectValueDiffs(
    diffs,
    tick,
    'checkpointHash',
    stableHash(legacyCheckpoint),
    stableHash(modernCheckpoint),
  )
  return diffs
}

export function runCombatCoreParity(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): CombatParityReport {
  if (!Number.isSafeInteger(totalTicks) || totalTicks < 0) {
    throw new RangeError('totalTicks must be a non-negative safe integer')
  }
  const legacy = new LegacyCombatSliceOracle(validateCombatSessionDefinition(definition))
  const modern = new CombatSession(validateCombatSessionDefinition(definition))
  for (const command of commands) {
    legacy.enqueue(command)
    modern.enqueue(command)
  }

  const diffs: CombatParityDiff[] = []
  for (let tick = 1; tick <= totalTicks; tick += 1) {
    const legacyEvents = legacy.step()
    const modernEvents = modern.step(1)
    diffs.push(...compareCombatFrame(
      tick,
      legacyEvents,
      modernEvents,
      legacy.getSnapshot(),
      modern.getSnapshot(),
      legacy.getDeterministicState(),
      modern.getDeterministicState(),
    ))
  }

  return {
    legacyFinalHash: stableHash(legacy.getDeterministicState()),
    modernFinalHash: stableHash(modern.getDeterministicState()),
    diffs,
  }
}
