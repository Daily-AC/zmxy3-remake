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
import type { CommandRejectionReason } from '../session/commands'
import { cloneSerializable } from '../session/snapshot'
import type { ActorId, ActorLifeState, CombatActorSnapshot } from '../session/types'
import { TICK_MS } from '../time/tick'
import { BattleActorRegistry } from './actorRegistry'
import { validateBattleDefinition } from './definition'
import { advanceEncounter, createEncounterState, type BattleEncounterState, type EncounterEffect } from './encounter'
import { resolveHorizontalMotion, resolveVerticalMotion } from './platform'
import type {
  BattleCommand,
  BattleDefinition,
  BattleEvent,
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
  if (type === 'press-interact') return
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
    isBoss,
    targetingGeometry: {
      selfOffsetX: definition.selfOffsetX,
      targetOffsetX: definition.targetOffsetX,
      attackReach: Math.max(0, horizontalAttackReach(definition.attack, heroHurtboxWidth) - 1),
    },
  }
}

export interface BattleDeterministicState {
  version: 1
  definition: BattleDefinition
  tick: number
  randomState: number
  heroSimulation: HeroState
  heroCombat: HeroCombatModel
  actors: ReturnType<BattleActorRegistry['exportState']>
  encounter: BattleEncounterState
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
  private readonly actors = new BattleActorRegistry()
  private readonly monsterConfigs = new Map<ActorId, MonsterConfig>()
  private readonly encounter: BattleEncounterState
  private currentTick = 0

  constructor(input: BattleDefinition) {
    this.definition = validateBattleDefinition(input)
    this.random = new SeededRandom(this.definition.seed)
    const walls = this.definition.level.walls
    this.heroConfig = makeHeroConfig({
      groundY: this.definition.hero.groundY,
      minX: this.definition.level.bounds.left,
      maxX: this.definition.level.bounds.right,
      comboStageDurationsMs: [0, ...this.definition.hero.comboStageDurationsMs],
      comboGraceMs: this.definition.hero.comboGraceMs,
    })
    this.heroConfig.jump.platformResolver = (query) => resolveVerticalMotion(walls, query)
    this.heroConfig.resolveHorizontal = (query) => resolveHorizontalMotion(walls, query).x
    this.heroState = initHeroState(this.heroConfig, this.definition.level.heroSpawn.x)
    this.heroState.vertical.y = this.definition.level.heroSpawn.y
    this.heroCombatConfig = {
      ...DEFAULT_HERO_COMBAT_CONFIG,
      maxHp: this.definition.hero.maxHp,
      hurtDurationMs: this.definition.hero.hurtDurationMs,
      respawnDelayMs: this.definition.hero.respawnDelayMs,
    }
    this.heroCombat = createHeroCombat(this.heroCombatConfig)
    this.encounter = createEncounterState(this.definition.level)
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
      const edges: HeroEdges = { ...NO_EDGES }
      let interactPressed = false
      while (this.queuedCommands[0]?.atTick === this.currentTick) {
        const command = this.queuedCommands.shift()!
        const reason = this.applyCommand(command, edges)
        if (reason) {
          events.push({ type: 'command-rejected', tick: this.currentTick, command, reason })
        } else if (command.type === 'press-interact') {
          interactPressed = true
        }
      }

      if (this.heroCombat.state !== 'dead') {
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
      this.resolveCombatTick(events)
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
      action: this.heroState.action,
      hp: this.heroCombat.hp,
      maxHp: this.heroCombat.maxHp,
      lifeState: this.heroCombat.state,
      comboStage: this.heroState.combo.stage || null,
      statuses: this.heroCombat.meterInvulnerableUntilMs === undefined ? [] : ['meter-invulnerable'],
      knockbackVelocityX: this.heroCombat.knockbackVelocityX,
      attackId: this.heroState.attackId,
      attacking: this.heroState.attacking,
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
      actors,
    })
  }

  getDeterministicState(): BattleDeterministicState {
    return cloneSerializable({
      version: 1,
      definition: this.definition,
      tick: this.currentTick,
      randomState: this.random.getState(),
      heroSimulation: this.heroState,
      heroCombat: this.heroCombat,
      actors: this.actors.exportState(),
      encounter: this.encounter,
      queuedCommands: this.queuedCommands,
      lastSeenSequences: [...this.lastSeenSequenceByActor]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([actorId, sequence]) => ({ actorId, sequence })),
    })
  }

  private applyCommand(command: BattleCommand, edges: HeroEdges): CommandRejectionReason | null {
    if (command.actorId !== this.definition.hero.id) return 'unknown-actor'
    const lastSeenSequence = this.lastSeenSequenceByActor.get(command.actorId) ?? -1
    if (command.sequence <= lastSeenSequence) return 'stale-sequence'
    this.lastSeenSequenceByActor.set(command.actorId, command.sequence)
    if (this.heroCombat.state === 'dead') return 'dead'
    if (command.type === 'press-attack' && this.heroState.attacking) return 'busy'
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

  private resolveCombatTick(events: BattleEvent[]): void {
    const heroCenter = actorCenter(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const heroAction = this.heroState.action as NormalAttackHit
    const heroAttackSpec = this.heroCombat.state !== 'dead' && this.heroState.attacking
      ? this.definition.hero.normalAttacks[heroAction]
      : undefined
    const heroRawPower = heroAttackSpec
      ? Math.max(1, Math.round(calculateNormalAttackPower(heroAction, this.definition.hero.atk, {
          critChance: this.definition.hero.critChance,
          random: () => this.random.next(),
        })))
      : null
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
        && !state.resolvedAttackIds.includes(this.heroState.attackId)
        && overlaps(heroAttackBox, hurtboxAt(monsterCenter, definition.hurtbox))
        ? { attackId: this.heroState.attackId, damage: heroRawPower }
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
          amount: applyPhysicsDefense(heroRawPower!, definition.stats.def),
          remainingHp: state.hp,
        })
        if (state.mode === 'dead' && modeBefore !== 'dead') {
          events.push({
            type: 'actor-defeated',
            tick: this.currentTick,
            actorId: record.id,
            sourceId: this.definition.hero.id,
          })
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
          pendingHeroHits.push(record.id)
        } else if (monsterEvent.type === 'death') {
          events.push({ type: 'actor-removed', tick: this.currentTick, actorId: record.id })
        }
      }
    }

    for (const actorId of pendingHeroHits) this.resolveMonsterHit(actorId, events)

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
      ? applyPhysicsDefense(definition.attackPower, this.definition.hero.def)
      : applyMagicDefense(definition.attackPower, this.definition.hero.magicDefenseFraction)
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
        ? this.definition.hero.def
        : this.definition.hero.magicDefenseFraction,
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

  private stopHeroSimulationForDefeat(): void {
    clearHeroInputForLock(this.heroState)
    this.heroState.combo.stage = 0
    this.heroState.combo.elapsedMs = 0
    this.heroState.airAttack = null
    this.heroState.attacking = false
    this.heroState.action = 'dead'
  }

  private resetHeroSimulationForRespawn(): void {
    const attackId = this.heroState.attackId
    const fresh = initHeroState(this.heroConfig, this.definition.level.heroSpawn.x)
    fresh.vertical.y = this.definition.level.heroSpawn.y
    fresh.attackId = attackId
    Object.assign(this.heroState, fresh)
  }
}
