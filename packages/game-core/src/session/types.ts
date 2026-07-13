import type { ContentId, RuleProvenance } from '@zaixu/content'
import type { AttackSpec } from '../combat/attackSpec'
import type { MonsterStats } from '../monster/monsterSim'

export type ActorId = string
export type Facing = -1 | 1
export type ActorLifeState = 'ready' | 'hurt' | 'dead' | 'removed'

export interface Point {
  x: number
  y: number
}

export interface BoxSize {
  width: number
  height: number
}

export interface HeroCombatDefinition {
  id: ActorId
  contentId: ContentId
  spawn: Point
  collisionOffset: Point
  groundY: number
  minX: number
  maxX: number
  maxHp: number
  atk: number
  def: number
  magicDefenseFraction: number
  critChance: number
  comboStageDurationsMs: readonly number[]
  comboGraceMs: number
  normalAttacks: Readonly<Record<'hit1' | 'hit2' | 'hit3' | 'hit4' | 'hit5', AttackSpec>>
  hurtbox: BoxSize
  hurtDurationMs: number
  respawnDelayMs: number
}

export interface MonsterCombatDefinition {
  id: ActorId
  contentId: ContentId
  spawn: Point
  collisionOffset: Point
  stats: MonsterStats
  patrolMin: number
  patrolMax: number
  hurtDurationMs: number
  attackDurationMs: number
  deadDurationMs: number
  attackCooldownMs: number
  decisionIntervalMs: number
  attack: AttackSpec
  attackPower: number
  attackKind: 'physics' | 'magic'
  hurtbox: BoxSize
  targetOffsetX: number
  selfOffsetX: number
}

export interface CombatSessionDefinition {
  version: 1
  contentVersion: string
  tickRate: 30
  seed: number
  provenance: readonly RuleProvenance[]
  hero: HeroCombatDefinition
  monsters: readonly MonsterCombatDefinition[]
}

export interface CombatActorSnapshot {
  id: ActorId
  kind: 'hero' | 'monster'
  contentId: ContentId
  x: number
  y: number
  facing: Facing
  action: string
  hp: number
  maxHp: number
  lifeState: ActorLifeState
  comboStage: number | null
  statuses: readonly string[]
  knockbackVelocityX: number
  attackId: number
  attacking: boolean
}

export interface CombatSnapshot {
  version: 1
  contentVersion: string
  tick: number
  randomState: number
  actors: readonly CombatActorSnapshot[]
}
