import type { RuleProvenance } from '@zaixu/content'
import type {
  ActorId,
  CombatActorSnapshot,
  HeroCombatDefinition,
  MonsterCombatDefinition,
} from '../session/types'
import type { RangedAttackConfig, VerticalFollowConfig } from '../monster/monsterSim'
import type { CombatCommand } from '../session/commands'
import type { CommandRejectionReason } from '../session/commands'
import type { CombatEvent } from '../session/events'
import type { BattleWall } from './platform'
import type { BattleProjectile } from './projectile'
import type { BattleSkillDefinition } from './skill'
import type { BattleSkillState } from './skill'
import type {
  BattleLootEntity,
  BattleLootPhysicsDefinition,
  BattleLootRollDefinition,
} from './loot'

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

export type BattleMonsterDefinition = Omit<MonsterCombatDefinition, 'id' | 'spawn'> & {
  behavior?: {
    verticalFollow?: VerticalFollowConfig
    rangedAttack?: RangedAttackConfig
  }
  loot?: readonly BattleLootRollDefinition[]
}

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
  boss: boolean
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
  lootPhysics?: BattleLootPhysicsDefinition
}

export type BattleHeroDefinition = HeroCombatDefinition & {
  maxMp: number
  skills: Record<string, BattleSkillDefinition>
  equipment: {
    weaponItemId: string | null
    armorItemId: string | null
    weaponShowId: number
  }
}

export type BattleHeroLoadout = Pick<
  BattleHeroDefinition,
  'maxHp' | 'atk' | 'def' | 'magicDefenseFraction' | 'critChance' | 'maxMp' | 'equipment' | 'skills'
>

export interface BattleDefinition {
  version: 1
  contentVersion: string
  tickRate: 30
  seed: number
  provenance: readonly RuleProvenance[]
  hero: BattleHeroDefinition
  monsters: Record<string, BattleMonsterDefinition>
  level: BattleLevelDefinition
}

export type BattleCommand = CombatCommand | {
  type: 'press-interact'
  actorId: ActorId
  sequence: number
  atTick: number
} | {
  type: 'press-skill'
  skillId: string
  actorId: ActorId
  sequence: number
  atTick: number
} | {
  type: 'resolve-loot-pickup'
  lootEntityId: string
  requestId: string
  acceptedQuantity: number
  resourceRestore?: { hp: number; mp: number }
  actorId: ActorId
  sequence: number
  atTick: number
} | {
  type: 'apply-hero-loadout'
  transactionId: string
  loadout: BattleHeroLoadout
  actorId: ActorId
  sequence: number
  atTick: number
}

export type BattleCommandRejectionReason = CommandRejectionReason
  | 'unknown-skill'
  | 'not-learned'
  | 'insufficient-resource'
  | 'cooldown'
  | 'unknown-loot'
  | 'invalid-loot-resolution'
  | 'invalid-hero-loadout'

export type BattleEvent = Exclude<CombatEvent, { type: 'command-rejected' }>
  | { type: 'command-rejected'; tick: number; command: BattleCommand; reason: BattleCommandRejectionReason }
  | {
      type: 'skill-cast'
      tick: number
      sourceId: ActorId
      skillId: string
      action: string
      attackId: number
      mpBefore: number
      mpAfter: number
      cooldownUntilTick: number
    }
  | { type: 'actor-spawned'; tick: number; actorId: ActorId; encounterId: string; contentId: string }
  | { type: 'door-revealed'; tick: number; levelId: string }
  | { type: 'stage-cleared'; tick: number; levelId: string }
  | { type: 'projectile-spawned'; tick: number; projectile: BattleProjectile }
  | { type: 'projectile-removed'; tick: number; projectileId: string }
  | { type: 'loot-spawned'; tick: number; loot: BattleLootEntity }
  | {
      type: 'loot-pickup-requested'
      tick: number
      lootEntityId: string
      requestId: string
      lootId: string
      quantity: number
    }
  | {
      type: 'loot-pickup-resolved'
      tick: number
      lootEntityId: string
      requestId: string
      lootId: string
      acceptedQuantity: number
      remainingQuantity: number
    }
  | {
      type: 'hero-resource-restored'
      tick: number
      sourceLootEntityId: string
      hpBefore: number
      hpAfter: number
      mpBefore: number
      mpAfter: number
    }
  | {
      type: 'hero-loadout-applied'
      tick: number
      transactionId: string
      equipment: BattleHeroLoadout['equipment']
      hpBefore: number
      hpAfter: number
      maxHpBefore: number
      maxHpAfter: number
      mpBefore: number
      mpAfter: number
      maxMpBefore: number
      maxMpAfter: number
    }

export interface BattleSnapshot {
  version: 1
  contentVersion: string
  tick: number
  randomState: number
  level: { id: string; doorVisible: boolean; cleared: boolean }
  heroSkill: Pick<BattleSkillState, 'mp' | 'maxMp' | 'cooldownUntilTick'> & { activeSkillId: string | null }
  heroLoadout: BattleHeroLoadout
  heroEquipment: BattleHeroDefinition['equipment']
  actors: readonly CombatActorSnapshot[]
  projectiles: readonly BattleProjectile[]
  loot: readonly BattleLootEntity[]
}
