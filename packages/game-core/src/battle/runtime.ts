import { horizontalAttackReach, resolveAttackHitbox } from '../combat/attackSpec'
import {
  DEFAULT_HERO_COMBAT_CONFIG,
  applyHeroDamage,
  createHeroCombat,
  isHeroDamageInvulnerable,
  updateHeroCombat,
  type HeroCombatConfig,
  type HeroCombatModel,
} from '../combat/heroCombat'
import {
  applyMagicDefense,
  applyPhysicsDefense,
  calculateNormalAttackPower,
  type NormalAttackHit,
} from '../combat/heroScale'
import { centeredBox, overlaps, type Rect } from '../combat/hitbox'
import {
  NO_EDGES,
  advanceHero,
  clearHeroInputForLock,
  initHeroState,
  makeHeroConfig,
  type HeroConfig,
  type HeroEdges,
  type HeroState,
} from '../hero/heroSim'
import { advanceMonster, initMonster, type MonsterConfig, type MonsterState } from '../monster/monsterSim'
import { SeededRandom } from '../random/seededRandom'
import { toDeterministicValue, type DeterministicValue } from '../session/checkpoint'
import { cloneSerializable } from '../session/snapshot'
import type { ActorId, ActorLifeState, CombatActorSnapshot } from '../session/types'
import { TICK_MS } from '../time/tick'
import { BattleActorRegistry } from './actorRegistry'
import { createBattleCheckpoint, decodeBattleCheckpoint, type BattleCheckpoint } from './checkpoint'
import { validateBattleDefinition } from './definition'
import {
  advanceEncounter,
  createEncounterState,
  stopPointBarrierX,
  type BattleEncounterState,
  type EncounterEffect,
} from './encounter'
import { resolveHorizontalMotion, resolveVerticalMotion } from './platform'
import {
  spawnBattleProjectile,
  stepBattleProjectiles,
  type BattleProjectile,
  type BattleProjectileHit,
} from './projectile'
import {
  castBattleSkill,
  consumeBattleSkillHit,
  createBattleSkillState,
  finishExpiredBattleSkill,
  type ActiveBattleSkill,
  type BattleSkillState,
} from './skill'
import {
  createBattleLootEntity,
  BATTLE_AUTHORITY_ID,
  resolveBattleLootPickup,
  stepBattleLoot,
  type BattleLootEntity,
} from './loot'
import type {
  BattleCommand,
  BattleCommandRejectionReason,
  BattleDefinition,
  BattleEvent,
  BattleHeroLoadout,
  BattleMonsterDefinition,
  BattleSnapshot,
} from './types'

const edgeForCommand: Partial<Record<BattleCommand['type'], Partial<HeroEdges>>> = {
  'press-left': { pressLeft: true },
  'release-left': { releaseLeft: true },
  'press-right': { pressRight: true },
  'release-right': { releaseRight: true },
  'press-jump': { pressJump: true },
  'press-attack': { pressAttack: true },
}

function mergeCommandEdge(edges: HeroEdges, type: BattleCommand['type']): void {
  if (type === 'press-interact' || type === 'press-skill') return
  if (type === 'press-left' || type === 'release-left') {
    edges.pressLeft = false
    edges.releaseLeft = false
  } else if (type === 'press-right' || type === 'release-right') {
    edges.pressRight = false
    edges.releaseRight = false
  }
  Object.assign(edges, edgeForCommand[type])
}

function actorCenter(
  position: { x: number; y: number },
  collisionOffset: { x: number; y: number },
): { x: number; y: number } {
  return { x: position.x + collisionOffset.x, y: position.y + collisionOffset.y }
}

function hurtboxAt(center: { x: number; y: number }, size: { width: number; height: number }): Rect {
  return centeredBox(center.x, center.y, size.width, size.height)
}

function monsterLifeState(mode: MonsterState['mode']): ActorLifeState {
  if (mode === 'hurt') return 'hurt'
  if (mode === 'dead') return 'dead'
  if (mode === 'gone') return 'removed'
  return 'ready'
}

function monsterConfig(
  definition: BattleMonsterDefinition,
  heroHurtboxWidth: number,
  random: SeededRandom,
  isBoss: boolean,
): MonsterConfig {
  return {
    stats: definition.stats,
    patrolMin: definition.patrolMin,
    patrolMax: definition.patrolMax,
    hurtDurationMs: definition.hurtDurationMs,
    attackDurationMs: definition.attackDurationMs,
    deadDurationMs: definition.deadDurationMs,
    attackCooldownMs: definition.attackCooldownMs,
    decisionIntervalMs: definition.decisionIntervalMs,
    tickMs: TICK_MS,
    rng: () => random.next(),
    attackSpec: definition.attack,
    verticalFollow: definition.behavior?.verticalFollow,
    rangedAttack: definition.behavior?.rangedAttack,
    isBoss,
    targetingGeometry: {
      selfOffsetX: definition.selfOffsetX,
      targetOffsetX: definition.targetOffsetX,
      attackReach: Math.max(0, horizontalAttackReach(definition.attack, heroHurtboxWidth) - 1),
    },
  }
}

export interface BattleRuntimeState {
  version: 1
  definition: BattleDefinition
  tick: number
  randomState: number
  heroSimulation: HeroState
  heroCombat: HeroCombatModel
  heroSkill: BattleSkillState
  heroLoadout: BattleHeroLoadout
  actors: ReturnType<BattleActorRegistry['exportState']>
  encounter: BattleEncounterState
  projectiles: BattleProjectile[]
  nextProjectileOrdinal: number
  loot: BattleLootEntity[]
  nextLootOrdinal: number
  queuedCommands: BattleCommand[]
  lastSeenSequences: { actorId: ActorId; sequence: number }[]
}

export class BattleRuntime {
  private readonly definition: BattleDefinition
  private readonly random: SeededRandom
  private readonly queuedCommands: BattleCommand[] = []
  private readonly lastSeenSequenceByActor = new Map<ActorId, number>()
  private readonly heroConfig: HeroConfig
  private readonly heroCombatConfig: HeroCombatConfig
  private readonly heroState: HeroState
  private readonly heroCombat: HeroCombatModel
  private readonly heroSkill: BattleSkillState
  private heroLoadout: BattleHeroLoadout
  private readonly actors: BattleActorRegistry
  private readonly monsterConfigs = new Map<ActorId, MonsterConfig>()
  private readonly encounter: BattleEncounterState
  private projectiles: BattleProjectile[] = []
  private nextProjectileOrdinal = 0
  private loot: BattleLootEntity[] = []
  private nextLootOrdinal = 0
  private currentTick = 0

  constructor(input: BattleDefinition, restored?: BattleRuntimeState) {
    this.definition = validateBattleDefinition(input)
    this.random = restored ? SeededRandom.fromState(restored.randomState) : new SeededRandom(this.definition.seed)
    const walls = this.definition.level.walls
    this.heroConfig = makeHeroConfig({
      groundY: this.definition.hero.groundY,
      minX: this.definition.level.bounds.left,
      maxX: this.definition.level.bounds.right,
      comboStageDurationsMs: [0, ...this.definition.hero.comboStageDurationsMs],
      comboGraceMs: this.definition.hero.comboGraceMs,
    })
    this.heroConfig.jump.platformResolver = (query) => resolveVerticalMotion(walls, query)
    this.heroConfig.resolveHorizontal = (query) => {
      const resolved = resolveHorizontalMotion(walls, query).x
      const barrier = this.encounter ? stopPointBarrierX(this.encounter, this.definition.level) : null
      return barrier !== null && query.toX > query.fromX ? Math.min(resolved, barrier) : resolved
    }
    this.heroCombatConfig = {
      ...DEFAULT_HERO_COMBAT_CONFIG,
      maxHp: this.definition.hero.maxHp,
      hurtDurationMs: this.definition.hero.hurtDurationMs,
      respawnDelayMs: this.definition.hero.respawnDelayMs,
    }
    this.heroLoadout = restored?.heroLoadout ?? this.loadoutFromDefinition()
    if (restored) {
      this.assertRestoredState(restored)
      this.heroState = restored.heroSimulation
      this.heroCombat = restored.heroCombat
      this.heroSkill = restored.heroSkill
      this.actors = BattleActorRegistry.restore(restored.actors)
      this.encounter = restored.encounter
      this.projectiles = restored.projectiles
      this.nextProjectileOrdinal = restored.nextProjectileOrdinal
      this.loot = restored.loot
      this.nextLootOrdinal = restored.nextLootOrdinal
      this.currentTick = restored.tick
      this.queuedCommands.push(...restored.queuedCommands)
      for (const entry of restored.lastSeenSequences) {
        this.lastSeenSequenceByActor.set(entry.actorId, entry.sequence)
      }
      for (const record of this.actors.records()) {
        this.monsterConfigs.set(record.id, monsterConfig(
          this.definition.monsters[record.speciesId],
          this.definition.hero.hurtbox.width,
          this.random,
          record.encounterId.endsWith('-boss'),
        ))
      }
    } else {
      this.heroState = initHeroState(this.heroConfig, this.definition.level.heroSpawn.x)
      this.heroState.vertical.y = this.definition.level.heroSpawn.y
      this.heroCombat = createHeroCombat(this.heroCombatConfig)
      this.heroSkill = createBattleSkillState(this.definition.hero.maxMp)
      this.actors = new BattleActorRegistry()
      this.encounter = createEncounterState(this.definition.level)
    }
  }

  enqueue(command: BattleCommand): void {
    if (!Number.isInteger(command.sequence) || command.sequence < 0) {
      throw new RangeError('command sequence must be a non-negative integer')
    }
    if (!Number.isInteger(command.atTick) || command.atTick < this.currentTick + 1) {
      throw new RangeError('command tick must be a processable non-negative integer')
    }
    this.queuedCommands.push({ ...command })
    this.queuedCommands.sort((left, right) => left.atTick - right.atTick || left.sequence - right.sequence)
  }

  step(ticks = 1): BattleEvent[] {
    if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError('ticks must be a non-negative integer')
    const events: BattleEvent[] = []
    for (let index = 0; index < ticks; index += 1) {
      this.currentTick += 1
      finishExpiredBattleSkill(this.heroSkill, this.currentTick)
      const edges: HeroEdges = { ...NO_EDGES }
      let interactPressed = false
      while (this.queuedCommands[0]?.atTick === this.currentTick) {
        const command = this.queuedCommands.shift()!
        const reason = this.applyCommand(command, edges, events)
        if (reason) {
          events.push({ type: 'command-rejected', tick: this.currentTick, command, reason })
        } else if (command.type === 'press-interact') {
          interactPressed = true
        }
      }

      if (this.heroCombat.state !== 'dead' && !this.heroSkill.active) {
        const previousAttackId = this.heroState.attackId
        advanceHero(this.heroState, edges, TICK_MS, this.heroConfig)
        if (this.heroState.attackId !== previousAttackId) {
          events.push({
            type: 'attack-started',
            tick: this.currentTick,
            sourceId: this.definition.hero.id,
            attackId: this.heroState.attackId,
            action: this.heroState.action,
            airborne: this.heroState.airAttack !== null,
          })
        }
      }

      const encounterEffects = advanceEncounter(this.encounter, this.definition.level, {
        tick: this.currentTick,
        hero: { x: this.heroState.x, y: this.heroState.vertical.y },
        interactPressed,
        livingByEncounter: (encounterId) => this.actors.livingCount(encounterId),
        random: () => this.random.next(),
      })
      this.applyEncounterEffects(encounterEffects, events)
      this.resolveCombatTick(events, consumeBattleSkillHit(this.heroSkill, this.currentTick))
      this.resolveLootTick(events)
    }
    return events
  }

  getSnapshot(): BattleSnapshot {
    const actors: CombatActorSnapshot[] = [{
      id: this.definition.hero.id,
      kind: 'hero',
      contentId: this.definition.hero.contentId,
      x: this.heroState.x,
      y: this.heroState.vertical.y,
      facing: this.heroState.facing,
      action: this.heroSkill.active?.action ?? this.heroState.action,
      hp: this.heroCombat.hp,
      maxHp: this.heroCombat.maxHp,
      lifeState: this.heroCombat.state,
      comboStage: this.heroSkill.active ? null : this.heroState.combo.stage || null,
      statuses: this.heroCombat.meterInvulnerableUntilMs === undefined ? [] : ['meter-invulnerable'],
      knockbackVelocityX: this.heroCombat.knockbackVelocityX,
      attackId: this.heroState.attackId,
      attacking: this.heroState.attacking || this.heroSkill.active !== null,
    }]

    for (const record of this.actors.records()) {
      const definition = this.definition.monsters[record.speciesId]
      actors.push({
        id: record.id,
        kind: 'monster',
        contentId: definition.contentId,
        x: record.simulation.x,
        y: record.simulation.y,
        facing: record.simulation.facing,
        action: record.simulation.action,
        hp: record.simulation.hp,
        maxHp: definition.stats.hp,
        lifeState: monsterLifeState(record.simulation.mode),
        comboStage: null,
        statuses: [
          record.simulation.mode,
          ...(record.simulation.staggerArmorMs > 0 ? ['stagger-armor'] : []),
        ],
        knockbackVelocityX: 0,
        attackId: record.attackId,
        attacking: record.simulation.mode === 'attack',
      })
    }

    return cloneSerializable({
      version: 1,
      contentVersion: this.definition.contentVersion,
      tick: this.currentTick,
      randomState: this.random.getState(),
      level: {
        id: this.definition.level.id,
        doorVisible: this.encounter.doorVisible,
        cleared: this.encounter.cleared,
      },
      heroSkill: {
        mp: this.heroSkill.mp,
        maxMp: this.heroSkill.maxMp,
        cooldownUntilTick: this.heroSkill.cooldownUntilTick,
        activeSkillId: this.heroSkill.active?.skillId ?? null,
      },
      heroLoadout: this.heroLoadout,
      heroEquipment: this.heroLoadout.equipment,
      actors,
      projectiles: this.projectiles,
      loot: this.loot,
    })
  }

  getDeterministicState(): DeterministicValue {
    return toDeterministicValue(this.captureState())
  }

  createCheckpoint(): BattleCheckpoint {
    return createBattleCheckpoint(this.captureState())
  }

  static restore(checkpoint: BattleCheckpoint): BattleRuntime {
    const state = decodeBattleCheckpoint<BattleRuntimeState>(checkpoint)
    return new BattleRuntime(state.definition, state)
  }

  private loadoutFromDefinition(): BattleHeroLoadout {
    const hero = this.definition.hero
    return cloneSerializable({
      maxHp: hero.maxHp,
      atk: hero.atk,
      def: hero.def,
      magicDefenseFraction: hero.magicDefenseFraction,
      critChance: hero.critChance,
      maxMp: hero.maxMp,
      equipment: hero.equipment,
      skills: hero.skills,
    })
  }

  private isValidHeroLoadout(loadout: BattleHeroLoadout): boolean {
    try {
      validateBattleDefinition({
        ...this.definition,
        hero: { ...this.definition.hero, ...loadout },
      })
      return true
    } catch {
      return false
    }
  }

  private applyHeroLoadout(transactionId: string, loadout: BattleHeroLoadout, events: BattleEvent[]): void {
    const hpBefore = this.heroCombat.hp
    const maxHpBefore = this.heroCombat.maxHp
    const mpBefore = this.heroSkill.mp
    const maxMpBefore = this.heroSkill.maxMp
    const maxHpDelta = loadout.maxHp - maxHpBefore
    const maxMpDelta = loadout.maxMp - maxMpBefore

    this.heroCombat.maxHp = loadout.maxHp
    this.heroCombatConfig.maxHp = loadout.maxHp
    this.heroSkill.maxMp = loadout.maxMp
    if (this.heroCombat.state !== 'dead') {
      this.heroCombat.hp = maxHpDelta > 0
        ? Math.min(loadout.maxHp, hpBefore + maxHpDelta)
        : Math.min(hpBefore, loadout.maxHp)
    }
    this.heroSkill.mp = maxMpDelta > 0
      ? Math.min(loadout.maxMp, mpBefore + maxMpDelta)
      : Math.min(mpBefore, loadout.maxMp)
    this.heroLoadout = cloneSerializable(loadout)

    events.push({
      type: 'hero-loadout-applied',
      tick: this.currentTick,
      transactionId,
      equipment: cloneSerializable(loadout.equipment),
      hpBefore,
      hpAfter: this.heroCombat.hp,
      maxHpBefore,
      maxHpAfter: this.heroCombat.maxHp,
      mpBefore,
      mpAfter: this.heroSkill.mp,
      maxMpBefore,
      maxMpAfter: this.heroSkill.maxMp,
    })
  }

  private captureState(): BattleRuntimeState {
    return {
      version: 1,
      definition: this.definition,
      tick: this.currentTick,
      randomState: this.random.getState(),
      heroSimulation: this.heroState,
      heroCombat: this.heroCombat,
      heroSkill: this.heroSkill,
      heroLoadout: this.heroLoadout,
      actors: this.actors.exportState(),
      encounter: this.encounter,
      projectiles: this.projectiles,
      nextProjectileOrdinal: this.nextProjectileOrdinal,
      loot: this.loot,
      nextLootOrdinal: this.nextLootOrdinal,
      queuedCommands: this.queuedCommands,
      lastSeenSequences: [...this.lastSeenSequenceByActor]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([actorId, sequence]) => ({ actorId, sequence })),
    }
  }

  private assertRestoredState(state: BattleRuntimeState): void {
    if (state.version !== 1) throw new TypeError('battle runtime state version must be 1')
    if (!Number.isSafeInteger(state.tick) || state.tick < 0) throw new TypeError('battle runtime tick is invalid')
    if (!Number.isInteger(state.randomState) || state.randomState < 0 || state.randomState > 0xffffffff) {
      throw new TypeError('battle runtime random state is invalid')
    }
    if (!Number.isSafeInteger(state.nextProjectileOrdinal) || state.nextProjectileOrdinal < 0) {
      throw new TypeError('battle runtime projectile ordinal is invalid')
    }
    if (!Number.isSafeInteger(state.nextLootOrdinal) || state.nextLootOrdinal < 0) {
      throw new TypeError('battle runtime loot ordinal is invalid')
    }
    for (const command of state.queuedCommands) {
      if (!Number.isSafeInteger(command.atTick) || command.atTick <= state.tick) {
        throw new TypeError('restored command tick must be in the future')
      }
    }
    for (const entry of state.lastSeenSequences) {
      if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 0) {
        throw new TypeError('restored command sequence is invalid')
      }
    }
  }

  private applyCommand(
    command: BattleCommand,
    edges: HeroEdges,
    events: BattleEvent[],
  ): BattleCommandRejectionReason | null {
    const expectedActorId = command.type === 'resolve-loot-pickup' || command.type === 'apply-hero-loadout'
      ? BATTLE_AUTHORITY_ID
      : this.definition.hero.id
    if (command.actorId !== expectedActorId) return 'unknown-actor'
    const lastSeenSequence = this.lastSeenSequenceByActor.get(command.actorId) ?? -1
    if (command.sequence <= lastSeenSequence) return 'stale-sequence'
    this.lastSeenSequenceByActor.set(command.actorId, command.sequence)
    if (command.type === 'apply-hero-loadout') {
      if (!this.isValidHeroLoadout(command.loadout)) return 'invalid-hero-loadout'
      this.applyHeroLoadout(command.transactionId, command.loadout, events)
      return null
    }
    if (command.type === 'resolve-loot-pickup') {
      const entity = this.loot.find((loot) => loot.id === command.lootEntityId)
      if (!entity) return 'unknown-loot'
      const restore = command.resourceRestore ?? { hp: 0, mp: 0 }
      if (
        !Number.isFinite(restore.hp) || restore.hp < 0
        || !Number.isFinite(restore.mp) || restore.mp < 0
        || (command.acceptedQuantity === 0 && (restore.hp > 0 || restore.mp > 0))
      ) return 'invalid-loot-resolution'
      const lootId = entity.lootId
      const result = resolveBattleLootPickup(
        this.loot,
        command,
        this.currentTick,
        this.definition.level.lootPhysics?.retryDelayTicks ?? 1,
      )
      if (!result) return 'invalid-loot-resolution'
      events.push({
        type: 'loot-pickup-resolved',
        tick: this.currentTick,
        lootEntityId: command.lootEntityId,
        requestId: command.requestId,
        lootId,
        acceptedQuantity: result.acceptedQuantity,
        remainingQuantity: result.remainingQuantity,
      })
      if (restore.hp > 0 || restore.mp > 0) {
        const hpBefore = this.heroCombat.hp
        const mpBefore = this.heroSkill.mp
        this.heroCombat.hp = Math.min(this.heroCombat.maxHp, this.heroCombat.hp + restore.hp)
        this.heroSkill.mp = Math.min(this.heroSkill.maxMp, this.heroSkill.mp + restore.mp)
        events.push({
          type: 'hero-resource-restored',
          tick: this.currentTick,
          sourceLootEntityId: command.lootEntityId,
          hpBefore,
          hpAfter: this.heroCombat.hp,
          mpBefore,
          mpAfter: this.heroSkill.mp,
        })
      }
      return null
    }
    if (this.heroCombat.state === 'dead') return 'dead'
    if (command.type === 'press-skill') {
      const definition = this.heroLoadout.skills[command.skillId]
      if (!definition) return 'unknown-skill'
      if (this.heroState.attacking) return 'busy'
      const attackId = this.heroState.attackId + 1
      const result = castBattleSkill(this.heroSkill, definition, this.currentTick, attackId)
      if (!result.ok) return result.reason
      this.heroState.attackId = attackId
      clearHeroInputForLock(this.heroState)
      events.push({
        type: 'skill-cast',
        tick: this.currentTick,
        sourceId: this.definition.hero.id,
        skillId: definition.id,
        action: definition.action,
        attackId,
        mpBefore: result.mpBefore,
        mpAfter: result.mpAfter,
        cooldownUntilTick: this.heroSkill.cooldownUntilTick,
      })
      return null
    }
    if (command.type === 'press-attack' && (this.heroState.attacking || this.heroSkill.active)) return 'busy'
    mergeCommandEdge(edges, command.type)
    return null
  }

  private applyEncounterEffects(effects: EncounterEffect[], events: BattleEvent[]): void {
    for (const effect of effects) {
      if (effect.type === 'spawn-monster' || effect.type === 'activate-boss') {
        const definition = this.definition.monsters[effect.speciesId]
        const config = monsterConfig(definition, this.definition.hero.hurtbox.width, this.random, effect.boss)
        const id = this.actors.spawnMonster(
          this.definition.level.id,
          effect.encounterId,
          effect.speciesId,
          initMonster(config, effect.x, effect.y),
        )
        this.monsterConfigs.set(id, config)
        events.push({
          type: 'actor-spawned',
          tick: this.currentTick,
          actorId: id,
          encounterId: effect.encounterId,
          contentId: definition.contentId,
        })
      } else if (effect.type === 'reveal-door') {
        events.push({ type: 'door-revealed', tick: this.currentTick, levelId: this.definition.level.id })
      } else {
        events.push({ type: 'stage-cleared', tick: this.currentTick, levelId: this.definition.level.id })
      }
    }
  }

  private resolveCombatTick(events: BattleEvent[], skillHit: ActiveBattleSkill | null): void {
    const heroCenter = actorCenter(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const heroAction = this.heroState.action as NormalAttackHit
    const skillDefinition = skillHit ? this.heroLoadout.skills[skillHit.skillId] : undefined
    const normalAttackSpec = this.heroCombat.state !== 'dead' && this.heroState.attacking
      ? this.definition.hero.normalAttacks[heroAction]
      : undefined
    const heroAttackSpec = skillDefinition
      ? {
          action: skillDefinition.action,
          hitFrameFractions: [0],
          hitbox: skillDefinition.hitbox,
        }
      : normalAttackSpec
    const heroAttackId = skillHit?.attackId ?? this.heroState.attackId
    const heroAttackKind = skillDefinition?.attackKind ?? 'physics'
    const heroRawPower = skillDefinition?.damage ?? (normalAttackSpec
      ? Math.max(1, Math.round(calculateNormalAttackPower(heroAction, this.heroLoadout.atk, {
          critChance: this.heroLoadout.critChance,
          random: () => this.random.next(),
        })))
      : null)
    const heroAttackBox = heroAttackSpec
      ? resolveAttackHitbox(heroAttackSpec, heroCenter, this.heroState.facing)
      : null
    const pendingHeroHits: ActorId[] = []

    for (const record of this.actors.records()) {
      const definition = this.definition.monsters[record.speciesId]
      const state = record.simulation
      const monsterCenter = actorCenter(state, definition.collisionOffset)
      const incomingHit = state.mode !== 'dead' && state.mode !== 'gone'
        && heroAttackBox && heroRawPower !== null
        && !state.resolvedAttackIds.includes(heroAttackId)
        && overlaps(heroAttackBox, hurtboxAt(monsterCenter, definition.hurtbox))
        ? {
            attackId: heroAttackId,
            damage: heroAttackKind === 'physics'
              ? heroRawPower
              : applyMagicDefense(heroRawPower, definition.stats.mDef ?? 0) + definition.stats.def,
          }
        : null
      const hpBefore = state.hp
      const modeBefore = state.mode
      const monsterEvents = advanceMonster(state, {
        heroX: this.heroState.x,
        heroY: this.heroState.vertical.y,
        heroAlive: this.heroCombat.state !== 'dead',
        incomingHit,
      }, TICK_MS, this.monsterConfigs.get(record.id)!)

      if (incomingHit && state.hp < hpBefore) {
        events.push({
          type: 'hit-confirmed',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: record.id,
          attackId: incomingHit.attackId,
        })
        events.push({
          type: 'damage-applied',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: record.id,
          attackId: incomingHit.attackId,
          rawPower: heroRawPower!,
          defense: definition.stats.def,
          amount: heroAttackKind === 'physics'
            ? applyPhysicsDefense(heroRawPower!, definition.stats.def)
            : applyMagicDefense(heroRawPower!, definition.stats.mDef ?? 0),
          remainingHp: state.hp,
        })
        if (state.mode === 'dead' && modeBefore !== 'dead') {
          events.push({
            type: 'actor-defeated',
            tick: this.currentTick,
            actorId: record.id,
            sourceId: this.definition.hero.id,
          })
          this.spawnLoot(record, definition, events)
        } else if (state.mode === 'hurt') {
          events.push({
            type: 'actor-staggered',
            tick: this.currentTick,
            actorId: record.id,
            untilTick: this.currentTick + Math.ceil(
              (definition.hurtDurationMs - state.modeElapsedMs) / TICK_MS,
            ),
          })
        }
      }

      for (const monsterEvent of monsterEvents) {
        if (monsterEvent.type === 'attack-start') {
          record.swingEventId += 1
          events.push({
            type: 'attack-started',
            tick: this.currentTick,
            sourceId: record.id,
            attackId: record.swingEventId,
            action: state.action,
            airborne: false,
          })
        } else if (monsterEvent.type === 'attack-frame') {
          if (!definition.behavior?.rangedAttack) pendingHeroHits.push(record.id)
        } else if (monsterEvent.type === 'projectile-spawn') {
          const projectile = spawnBattleProjectile({
            id: `${record.id}:projectile:${String(this.nextProjectileOrdinal++).padStart(4, '0')}`,
            kind: monsterEvent.projectile.kind,
            sourceId: record.id,
            attackId: record.swingEventId,
            x: monsterEvent.x,
            y: monsterEvent.y,
            targetX: monsterEvent.targetX,
            targetY: monsterEvent.targetY,
            facing: monsterEvent.facing,
            speedPxPerSecond: monsterEvent.projectile.speedPxPerSecond,
            radius: monsterEvent.projectile.radius,
            ttlMs: monsterEvent.projectile.ttlMs,
            damage: definition.attackPower,
            attackKind: definition.attackKind,
          })
          this.projectiles.push(projectile)
          events.push({ type: 'projectile-spawned', tick: this.currentTick, projectile: cloneSerializable(projectile) })
        } else if (monsterEvent.type === 'death') {
          events.push({ type: 'actor-removed', tick: this.currentTick, actorId: record.id })
        }
      }
    }

    for (const actorId of pendingHeroHits) this.resolveMonsterHit(actorId, events)
    this.resolveProjectileTick(events)

    const heroCombatEvents = updateHeroCombat(
      this.heroCombat,
      this.heroState,
      { minX: this.definition.level.bounds.left, maxX: this.definition.level.bounds.right },
      this.currentTick * TICK_MS,
      TICK_MS,
      this.definition.level.heroSpawn.x,
      this.heroCombatConfig,
    )
    if (heroCombatEvents.some((event) => event.type === 'respawn')) {
      this.resetHeroSimulationForRespawn()
      events.push({
        type: 'actor-respawned',
        tick: this.currentTick,
        actorId: this.definition.hero.id,
        x: this.definition.level.heroSpawn.x,
        y: this.definition.level.heroSpawn.y,
      })
    }

    for (const id of this.actors.removeGone()) this.monsterConfigs.delete(id)
  }

  private spawnLoot(
    record: ReturnType<BattleActorRegistry['records']>[number],
    definition: BattleMonsterDefinition,
    events: BattleEvent[],
  ): void {
    const physics = this.definition.level.lootPhysics
    if (!physics) return
    for (const roll of definition.loot ?? []) {
      if (this.random.next() >= roll.chance) continue
      const totalWeight = roll.choices.reduce((sum, choice) => sum + choice.weight, 0)
      let target = roll.choices.length === 1 ? 0 : this.random.next() * totalWeight
      let choice = roll.choices[roll.choices.length - 1]
      for (const candidate of roll.choices) {
        target -= candidate.weight
        if (target < 0) {
          choice = candidate
          break
        }
      }
      const span = choice.quantity.max - choice.quantity.min + 1
      const quantity = span === 1
        ? choice.quantity.min
        : choice.quantity.min + Math.floor(this.random.next() * span)
      const loot = createBattleLootEntity({
        id: `${this.definition.level.id}:loot:${String(this.nextLootOrdinal++).padStart(4, '0')}`,
        lootId: choice.lootId,
        sourceActorId: record.id,
        quantity,
        motion: choice.motion,
        x: record.simulation.x,
        y: record.simulation.y + physics.spawnOffsetY,
      })
      this.loot.push(loot)
      events.push({ type: 'loot-spawned', tick: this.currentTick, loot: cloneSerializable(loot) })
    }
  }

  private resolveLootTick(events: BattleEvent[]): void {
    const physics = this.definition.level.lootPhysics
    if (!physics || this.loot.length === 0) return
    const requests = stepBattleLoot(
      this.loot,
      {
        x: this.heroState.x,
        y: this.heroState.vertical.y,
        alive: this.heroCombat.state !== 'dead',
      },
      this.currentTick,
      physics,
      (query) => {
        const hit = resolveVerticalMotion(this.definition.level.walls, query)
        if (hit?.kind === 'land') return hit.y
        return query.toY >= this.definition.hero.groundY ? this.definition.hero.groundY : null
      },
    )
    for (const request of requests) {
      events.push({ type: 'loot-pickup-requested', tick: this.currentTick, ...request })
    }
  }

  private resolveMonsterHit(actorId: ActorId, events: BattleEvent[]): void {
    const record = this.actors.get(actorId)
    if (!record) return
    const definition = this.definition.monsters[record.speciesId]
    const monsterCenter = actorCenter(record.simulation, definition.collisionOffset)
    const heroCenter = actorCenter(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const attackBox = resolveAttackHitbox(definition.attack, monsterCenter, record.simulation.facing)
    if (!overlaps(attackBox, hurtboxAt(heroCenter, this.definition.hero.hurtbox))) return
    const timeMs = this.currentTick * TICK_MS
    if (isHeroDamageInvulnerable(this.heroCombat, timeMs)) return

    const mitigated = definition.attackKind === 'physics'
      ? applyPhysicsDefense(definition.attackPower, this.heroLoadout.def)
      : applyMagicDefense(definition.attackPower, this.heroLoadout.magicDefenseFraction)
    const amount = Math.max(1, Math.round(mitigated))
    const hpBefore = this.heroCombat.hp
    const attackId = record.attackId + 1
    const heroEvents = applyHeroDamage(this.heroCombat, {
      sourceId: record.id,
      attackId,
      damage: amount,
      knockbackX: record.simulation.facing,
    }, timeMs, this.heroCombatConfig)
    if (this.heroCombat.hp >= hpBefore) return
    record.attackId = attackId

    events.push({
      type: 'hit-confirmed',
      tick: this.currentTick,
      sourceId: record.id,
      targetId: this.definition.hero.id,
      attackId,
    })
    events.push({
      type: 'damage-applied',
      tick: this.currentTick,
      sourceId: record.id,
      targetId: this.definition.hero.id,
      attackId,
      rawPower: definition.attackPower,
      defense: definition.attackKind === 'physics'
        ? this.heroLoadout.def
        : this.heroLoadout.magicDefenseFraction,
      amount: hpBefore - this.heroCombat.hp,
      remainingHp: this.heroCombat.hp,
    })
    for (const event of heroEvents) {
      if (event.type === 'hurt') {
        events.push({
          type: 'actor-staggered',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          untilTick: this.currentTick + Math.ceil(this.definition.hero.hurtDurationMs / TICK_MS),
        })
      } else if (event.type === 'death') {
        this.stopHeroSimulationForDefeat()
        events.push({
          type: 'actor-defeated',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          sourceId: record.id,
        })
      }
    }
  }

  private resolveProjectileTick(events: BattleEvent[]): void {
    const heroCenter = actorCenter(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const result = stepBattleProjectiles(this.projectiles, {
      ...heroCenter,
      alive: this.heroCombat.state !== 'dead',
    }, TICK_MS)
    this.projectiles = result.remaining
    for (const hit of result.hits) this.applyProjectileHit(hit, events)
    for (const projectileId of result.removedIds) {
      events.push({ type: 'projectile-removed', tick: this.currentTick, projectileId })
    }
  }

  private applyProjectileHit(hit: BattleProjectileHit, events: BattleEvent[]): void {
    const timeMs = this.currentTick * TICK_MS
    if (isHeroDamageInvulnerable(this.heroCombat, timeMs)) return
    const defense = hit.attackKind === 'physics'
      ? this.heroLoadout.def
      : this.heroLoadout.magicDefenseFraction
    const mitigated = hit.attackKind === 'physics'
      ? applyPhysicsDefense(hit.damage, this.heroLoadout.def)
      : applyMagicDefense(hit.damage, this.heroLoadout.magicDefenseFraction)
    const hpBefore = this.heroCombat.hp
    const heroEvents = applyHeroDamage(this.heroCombat, {
      sourceId: hit.sourceId,
      attackId: hit.attackId,
      damage: Math.max(1, Math.round(mitigated)),
      knockbackX: 0,
    }, timeMs, this.heroCombatConfig)
    if (this.heroCombat.hp >= hpBefore) return
    events.push({
      type: 'hit-confirmed',
      tick: this.currentTick,
      sourceId: hit.sourceId,
      targetId: this.definition.hero.id,
      attackId: hit.attackId,
    })
    events.push({
      type: 'damage-applied',
      tick: this.currentTick,
      sourceId: hit.sourceId,
      targetId: this.definition.hero.id,
      attackId: hit.attackId,
      rawPower: hit.damage,
      defense,
      amount: hpBefore - this.heroCombat.hp,
      remainingHp: this.heroCombat.hp,
    })
    for (const event of heroEvents) {
      if (event.type === 'hurt') {
        events.push({
          type: 'actor-staggered',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          untilTick: this.currentTick + Math.ceil(this.definition.hero.hurtDurationMs / TICK_MS),
        })
      } else if (event.type === 'death') {
        this.stopHeroSimulationForDefeat()
        events.push({
          type: 'actor-defeated',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          sourceId: hit.sourceId,
        })
      }
    }
  }

  private stopHeroSimulationForDefeat(): void {
    clearHeroInputForLock(this.heroState)
    this.heroState.combo.stage = 0
    this.heroState.combo.elapsedMs = 0
    this.heroState.airAttack = null
    this.heroState.attacking = false
    this.heroSkill.active = null
    this.heroState.action = 'dead'
  }

  private resetHeroSimulationForRespawn(): void {
    const attackId = this.heroState.attackId
    const fresh = initHeroState(this.heroConfig, this.definition.level.heroSpawn.x)
    fresh.vertical.y = this.definition.level.heroSpawn.y
    fresh.attackId = attackId
    Object.assign(this.heroState, fresh)
    this.heroSkill.mp = this.heroSkill.maxMp
    this.heroSkill.cooldownUntilTick = 0
    this.heroSkill.active = null
  }
}
