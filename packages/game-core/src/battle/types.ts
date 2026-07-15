import type { RuleProvenance } from '@zaixu/content'
import type {
  ActorId,
  CombatActorSnapshot,
  HeroCombatDefinition,
  MonsterCombatDefinition,
} from '../session/types'
import type { CombatCommand } from '../session/commands'
import type { CombatEvent } from '../session/events'
import type { BattleWall } from './platform'

export interface BattleBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface BattleNumberRange {
  min: number
  max: number
}

export type BattleMonsterDefinition = Omit<MonsterCombatDefinition, 'id' | 'spawn'>

export interface TimedSpawnDefinition {
  speciesId: string
  x: number
  y: number
  delayTicks: number
  intervalTicks: number
  quantity: number
}

export interface ContinuousEncounterDefinition {
  kind: 'continuous'
  id: string
  initialDelayTicks: number
  intervalTicks: number
  count: number
  roster: string[]
  spawnOffset: { x: BattleNumberRange; y: BattleNumberRange }
  trigger: {
    kind: 'hero-height'
    atOrAboveY: number
    boss: { speciesId: string; x: number; y: number }
  }
}

export interface StopPointEncounterDefinition {
  kind: 'stop-point'
  id: string
  stopX: number
  spawns: TimedSpawnDefinition[]
}

export type BattleEncounterDefinition = ContinuousEncounterDefinition | StopPointEncounterDefinition

export interface BattleLevelDefinition {
  id: string
  bounds: BattleBounds
  heroSpawn: { x: number; y: number }
  walls: BattleWall[]
  encounters: BattleEncounterDefinition[]
  door: { x: number; y: number; width: number; height: number }
}

export interface BattleDefinition {
  version: 1
  contentVersion: string
  tickRate: 30
  seed: number
  provenance: readonly RuleProvenance[]
  hero: HeroCombatDefinition
  monsters: Record<string, BattleMonsterDefinition>
  level: BattleLevelDefinition
}

export type BattleCommand = CombatCommand | {
  type: 'press-interact'
  actorId: ActorId
  sequence: number
  atTick: number
}

export type BattleEvent = CombatEvent
  | { type: 'actor-spawned'; tick: number; actorId: ActorId; encounterId: string; contentId: string }
  | { type: 'door-revealed'; tick: number; levelId: string }
  | { type: 'stage-cleared'; tick: number; levelId: string }

export interface BattleSnapshot {
  version: 1
  contentVersion: string
  tick: number
  randomState: number
  level: { id: string; doorVisible: boolean; cleared: boolean }
  actors: readonly CombatActorSnapshot[]
}
