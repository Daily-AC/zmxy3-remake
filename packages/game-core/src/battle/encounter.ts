import type {
  BattleLevelDefinition,
  ContinuousEncounterDefinition,
  StopPointEncounterDefinition,
} from './types'

export type EncounterPhase = 'climb' | 'stop-active' | 'boss-active' | 'door-open' | 'cleared'

export interface BattleEncounterState {
  phase: EncounterPhase
  nextSpawnTickByEncounter: Record<string, number>
  bossEncounterId: string | null
  nextStopIndex: number
  activeStopEncounterId: string | null
  stopSpawnedCounts: Record<string, number>
  nextStopSpawnTick: Record<string, number>
  doorVisible: boolean
  cleared: boolean
}

export interface EncounterAdvanceContext {
  tick: number
  hero: { x: number; y: number }
  interactPressed: boolean
  livingByEncounter: (encounterId: string) => number
  random: () => number
}

export type EncounterEffect =
  | { type: 'spawn-monster'; encounterId: string; speciesId: string; x: number; y: number; boss: boolean }
  | { type: 'activate-boss'; encounterId: string; speciesId: string; x: number; y: number; boss: true }
  | { type: 'reveal-door' }
  | { type: 'stage-cleared' }

function continuousEncounters(level: BattleLevelDefinition): ContinuousEncounterDefinition[] {
  return level.encounters.filter((encounter): encounter is ContinuousEncounterDefinition =>
    encounter.kind === 'continuous')
}

function stopPointEncounters(level: BattleLevelDefinition): StopPointEncounterDefinition[] {
  return level.encounters.filter((encounter): encounter is StopPointEncounterDefinition =>
    encounter.kind === 'stop-point')
}

export function createEncounterState(level: BattleLevelDefinition): BattleEncounterState {
  return {
    phase: 'climb',
    nextSpawnTickByEncounter: Object.fromEntries(
      continuousEncounters(level).map((encounter) => [encounter.id, encounter.initialDelayTicks]),
    ),
    bossEncounterId: null,
    nextStopIndex: 0,
    activeStopEncounterId: null,
    stopSpawnedCounts: {},
    nextStopSpawnTick: {},
    doorVisible: false,
    cleared: false,
  }
}

export function stopPointBarrierX(
  state: BattleEncounterState,
  level: BattleLevelDefinition,
): number | null {
  if (state.phase === 'door-open' || state.phase === 'cleared') return null
  const stop = stopPointEncounters(level)[state.nextStopIndex]
  return stop?.stopX ?? null
}

function spawnKey(encounterId: string, index: number): string {
  return `${encounterId}:${index}`
}

function activateStopPoint(
  state: BattleEncounterState,
  encounter: StopPointEncounterDefinition,
  tick: number,
): void {
  state.phase = 'stop-active'
  state.activeStopEncounterId = encounter.id
  encounter.spawns.forEach((spawn, index) => {
    const key = spawnKey(encounter.id, index)
    state.stopSpawnedCounts[key] = 0
    state.nextStopSpawnTick[key] = tick + spawn.delayTicks
  })
}

function advanceStopPoints(
  state: BattleEncounterState,
  level: BattleLevelDefinition,
  context: EncounterAdvanceContext,
): EncounterEffect[] {
  const encounters = stopPointEncounters(level)
  const encounter = encounters[state.nextStopIndex]
  if (!encounter) return []
  if (state.phase !== 'stop-active') {
    if (context.hero.x < encounter.stopX) return []
    activateStopPoint(state, encounter, context.tick)
  }

  const effects: EncounterEffect[] = []
  let allSpawned = true
  encounter.spawns.forEach((spawn, index) => {
    const key = spawnKey(encounter.id, index)
    const spawned = state.stopSpawnedCounts[key] ?? 0
    if (spawned >= spawn.quantity) return
    allSpawned = false
    if (context.tick < (state.nextStopSpawnTick[key] ?? Number.POSITIVE_INFINITY)) return
    effects.push({
      type: 'spawn-monster',
      encounterId: encounter.id,
      speciesId: spawn.speciesId,
      x: spawn.x,
      y: spawn.y,
      boss: encounter.boss,
    })
    state.stopSpawnedCounts[key] = spawned + 1
    state.nextStopSpawnTick[key] = context.tick + spawn.intervalTicks
    if (spawned + 1 < spawn.quantity) allSpawned = false
  })

  const spawnedAfter = encounter.spawns.every((spawn, index) =>
    (state.stopSpawnedCounts[spawnKey(encounter.id, index)] ?? 0) >= spawn.quantity)
  if (!allSpawned && !spawnedAfter) return effects
  if (context.livingByEncounter(encounter.id) > 0 || effects.length > 0) return effects

  state.nextStopIndex += 1
  state.activeStopEncounterId = null
  if (state.nextStopIndex < encounters.length) {
    state.phase = 'climb'
    return effects
  }
  state.phase = 'door-open'
  state.doorVisible = true
  effects.push({ type: 'reveal-door' })
  return effects
}

function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + (range.max - range.min) * random()
}

function spawnContinuous(
  encounter: ContinuousEncounterDefinition,
  context: EncounterAdvanceContext,
): EncounterEffect[] {
  const effects: EncounterEffect[] = []
  for (let index = 0; index < encounter.count; index += 1) {
    const rosterIndex = Math.min(encounter.roster.length - 1, Math.floor(context.random() * encounter.roster.length))
    effects.push({
      type: 'spawn-monster',
      encounterId: encounter.id,
      speciesId: encounter.roster[rosterIndex],
      x: context.hero.x + between(encounter.spawnOffset.x, context.random),
      y: context.hero.y + between(encounter.spawnOffset.y, context.random),
      boss: false,
    })
  }
  return effects
}

function heroInsideDoor(
  level: BattleLevelDefinition,
  hero: { x: number; y: number },
): boolean {
  const { door } = level
  return hero.x >= door.x && hero.x <= door.x + door.width
    && hero.y >= door.y && hero.y <= door.y + door.height
}

export function advanceEncounter(
  state: BattleEncounterState,
  level: BattleLevelDefinition,
  context: EncounterAdvanceContext,
): EncounterEffect[] {
  if (state.phase === 'cleared') return []

  if (state.phase === 'door-open') {
    if (!context.interactPressed || !heroInsideDoor(level, context.hero)) return []
    state.phase = 'cleared'
    state.cleared = true
    return [{ type: 'stage-cleared' }]
  }

  if (state.phase === 'boss-active') {
    if (state.bossEncounterId === null || context.livingByEncounter(state.bossEncounterId) > 0) return []
    state.phase = 'door-open'
    state.doorVisible = true
    return [{ type: 'reveal-door' }]
  }

  if (stopPointEncounters(level).length > 0) {
    return advanceStopPoints(state, level, context)
  }

  const effects: EncounterEffect[] = []
  for (const encounter of continuousEncounters(level)) {
    if (context.hero.y <= encounter.trigger.atOrAboveY) {
      const bossEncounterId = `${encounter.id}-boss`
      state.phase = 'boss-active'
      state.bossEncounterId = bossEncounterId
      return [{
        type: 'activate-boss',
        encounterId: bossEncounterId,
        speciesId: encounter.trigger.boss.speciesId,
        x: encounter.trigger.boss.x,
        y: encounter.trigger.boss.y,
        boss: true,
      }]
    }

    const nextSpawnTick = state.nextSpawnTickByEncounter[encounter.id]
    if (context.tick < nextSpawnTick) continue
    effects.push(...spawnContinuous(encounter, context))
    state.nextSpawnTickByEncounter[encounter.id] = nextSpawnTick + encounter.intervalTicks
  }
  return effects
}
