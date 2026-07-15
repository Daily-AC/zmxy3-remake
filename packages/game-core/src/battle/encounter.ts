import type {
  BattleLevelDefinition,
  ContinuousEncounterDefinition,
} from './types'

export type EncounterPhase = 'climb' | 'boss-active' | 'door-open' | 'cleared'

export interface BattleEncounterState {
  phase: EncounterPhase
  nextSpawnTickByEncounter: Record<string, number>
  bossEncounterId: string | null
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
  | { type: 'spawn-monster'; encounterId: string; speciesId: string; x: number; y: number; boss: false }
  | { type: 'activate-boss'; encounterId: string; speciesId: string; x: number; y: number; boss: true }
  | { type: 'reveal-door' }
  | { type: 'stage-cleared' }

function continuousEncounters(level: BattleLevelDefinition): ContinuousEncounterDefinition[] {
  return level.encounters.filter((encounter): encounter is ContinuousEncounterDefinition =>
    encounter.kind === 'continuous')
}

export function createEncounterState(level: BattleLevelDefinition): BattleEncounterState {
  return {
    phase: 'climb',
    nextSpawnTickByEncounter: Object.fromEntries(
      continuousEncounters(level).map((encounter) => [encounter.id, encounter.initialDelayTicks]),
    ),
    bossEncounterId: null,
    doorVisible: false,
    cleared: false,
  }
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
