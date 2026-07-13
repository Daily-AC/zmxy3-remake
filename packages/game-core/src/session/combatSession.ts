import { PROTOCOL_VERSION } from '@zaixu/protocol'
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
import { TICK_MS } from '../time/tick'
import type { CombatDeterministicState } from './checkpoint'
import { toDeterministicValue } from './checkpoint'
import type { CombatCommand, CombatCommandType, CommandRejectionReason } from './commands'
import { validateCombatSessionDefinition } from './definition'
import type { CombatEvent } from './events'
import { createCombatSnapshot } from './snapshot'
import type {
  ActorId,
  ActorLifeState,
  CombatActorSnapshot,
  CombatSessionDefinition,
  CombatSnapshot,
  MonsterCombatDefinition,
} from './types'

const edgeForCommand: Record<CombatCommandType, Partial<HeroEdges>> = {
  'press-left': { pressLeft: true },
  'release-left': { releaseLeft: true },
  'press-right': { pressRight: true },
  'release-right': { releaseRight: true },
  'press-jump': { pressJump: true },
  'press-attack': { pressAttack: true },
}

function mergeCommandEdge(edges: HeroEdges, type: CombatCommandType): void {
  if (type === 'press-left' || type === 'release-left') {
    edges.pressLeft = false
    edges.releaseLeft = false
  } else if (type === 'press-right' || type === 'release-right') {
    edges.pressRight = false
    edges.releaseRight = false
  }
  Object.assign(edges, edgeForCommand[type])
}

function monsterConfig(
  definition: MonsterCombatDefinition,
  heroHurtboxWidth: number,
  random: SeededRandom,
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
    targetingGeometry: {
      selfOffsetX: definition.selfOffsetX,
      targetOffsetX: definition.targetOffsetX,
      attackReach: Math.max(0, horizontalAttackReach(definition.attack, heroHurtboxWidth) - 1),
    },
  }
}

function actorCenter(
  position: { x: number; y: number },
  collisionOffset: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: position.x + collisionOffset.x,
    y: position.y + collisionOffset.y,
  }
}

function hurtboxAt(
  center: { x: number; y: number },
  size: { width: number; height: number },
): Rect {
  return centeredBox(center.x, center.y, size.width, size.height)
}

function monsterLifeState(mode: MonsterState['mode']): ActorLifeState {
  if (mode === 'hurt') return 'hurt'
  if (mode === 'dead') return 'dead'
  if (mode === 'gone') return 'removed'
  return 'ready'
}

export class CombatSession {
  private readonly definition: CombatSessionDefinition
  private readonly random: SeededRandom
  private readonly queuedCommands: CombatCommand[] = []
  private readonly lastSeenSequenceByActor = new Map<ActorId, number>()
  private readonly heroConfig: HeroConfig
  private readonly heroCombatConfig: HeroCombatConfig
  private readonly heroState: HeroState
  private readonly heroCombat: HeroCombatModel
  private readonly monsterStates = new Map<ActorId, MonsterState>()
  private readonly monsterConfigs = new Map<ActorId, MonsterConfig>()
  private readonly monsterSwingEventIds = new Map<ActorId, number>()
  private readonly monsterAttackIds = new Map<ActorId, number>()
  private currentTick = 0

  constructor(definition: CombatSessionDefinition) {
    this.definition = validateCombatSessionDefinition(definition)
    this.random = new SeededRandom(this.definition.seed)
    this.heroConfig = makeHeroConfig({
      groundY: this.definition.hero.groundY,
      minX: this.definition.hero.minX,
      maxX: this.definition.hero.maxX,
      comboStageDurationsMs: [0, ...this.definition.hero.comboStageDurationsMs],
      comboGraceMs: this.definition.hero.comboGraceMs,
    })
    this.heroState = initHeroState(this.heroConfig, this.definition.hero.spawn.x)
    this.heroCombatConfig = {
      ...DEFAULT_HERO_COMBAT_CONFIG,
      maxHp: this.definition.hero.maxHp,
      hurtDurationMs: this.definition.hero.hurtDurationMs,
      respawnDelayMs: this.definition.hero.respawnDelayMs,
    }
    this.heroCombat = createHeroCombat(this.heroCombatConfig)

    for (const monster of this.definition.monsters) {
      const config = monsterConfig(monster, this.definition.hero.hurtbox.width, this.random)
      this.monsterConfigs.set(monster.id, config)
      this.monsterStates.set(
        monster.id,
        initMonster(config, monster.spawn.x, monster.spawn.y),
      )
      this.monsterSwingEventIds.set(monster.id, 0)
      this.monsterAttackIds.set(monster.id, 0)
    }
  }

  enqueue(command: CombatCommand): void {
    if (!Number.isInteger(command.sequence) || command.sequence < 0) {
      throw new RangeError('command sequence must be a non-negative integer')
    }
    if (!Number.isInteger(command.atTick) || command.atTick < this.currentTick + 1) {
      throw new RangeError('command tick must be a processable non-negative integer')
    }
    this.queuedCommands.push({ ...command })
    this.queuedCommands.sort((left, right) => left.atTick - right.atTick || left.sequence - right.sequence)
  }

  step(ticks = 1): CombatEvent[] {
    if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError('ticks must be a non-negative integer')
    const events: CombatEvent[] = []
    for (let index = 0; index < ticks; index += 1) {
      this.currentTick += 1
      const edges: HeroEdges = { ...NO_EDGES }
      while (this.queuedCommands[0]?.atTick === this.currentTick) {
        const command = this.queuedCommands.shift()!
        const reason = this.applyCommand(command, edges)
        if (reason) events.push({ type: 'command-rejected', tick: this.currentTick, command, reason })
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

      this.resolveCombatTick(events)
    }
    return events
  }

  getSnapshot(): CombatSnapshot {
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

    for (const definition of this.definition.monsters) {
      const state = this.monsterStates.get(definition.id)!
      actors.push({
        id: definition.id,
        kind: 'monster',
        contentId: definition.contentId,
        x: state.x,
        y: state.y,
        facing: state.facing,
        action: state.action,
        hp: state.hp,
        maxHp: definition.stats.hp,
        lifeState: monsterLifeState(state.mode),
        comboStage: null,
        statuses: [state.mode, ...(state.staggerArmorMs > 0 ? ['stagger-armor'] : [])],
        knockbackVelocityX: 0,
        attackId: this.monsterAttackIds.get(definition.id)!,
        attacking: state.mode === 'attack',
      })
    }

    return createCombatSnapshot(
      this.definition.contentVersion,
      this.currentTick,
      this.random.getState(),
      actors,
    )
  }

  getDeterministicState(): CombatDeterministicState {
    const state = {
      version: 1 as const,
      contentVersion: this.definition.contentVersion,
      domain: {
        tick: this.currentTick,
        randomState: this.random.getState(),
        definition: this.definition,
        heroSimulation: this.heroState,
        heroCombat: this.heroCombat,
        monsters: this.definition.monsters.map((definition) => ({
          id: definition.id,
          attackId: this.monsterAttackIds.get(definition.id)!,
          swingEventId: this.monsterSwingEventIds.get(definition.id)!,
          simulation: this.monsterStates.get(definition.id)!,
        })),
      },
      protocol: {
        protocolVersion: PROTOCOL_VERSION,
        queuedCommands: this.queuedCommands,
        lastSeenSequences: [...this.lastSeenSequenceByActor]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([actorId, sequence]) => ({ actorId, sequence })),
      },
    }
    return toDeterministicValue(state) as unknown as CombatDeterministicState
  }

  private applyCommand(command: CombatCommand, edges: HeroEdges): CommandRejectionReason | null {
    if (command.actorId !== this.definition.hero.id) return 'unknown-actor'
    const lastSeenSequence = this.lastSeenSequenceByActor.get(command.actorId) ?? -1
    if (command.sequence <= lastSeenSequence) return 'stale-sequence'

    this.lastSeenSequenceByActor.set(command.actorId, command.sequence)
    if (this.heroCombat.state === 'dead') return 'dead'
    if (command.type === 'press-attack' && this.heroState.attacking) return 'busy'
    mergeCommandEdge(edges, command.type)
    return null
  }

  private resolveCombatTick(events: CombatEvent[]): void {
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
    const pendingHeroHits: MonsterCombatDefinition[] = []

    for (const monsterDefinition of this.definition.monsters) {
      const monsterState = this.monsterStates.get(monsterDefinition.id)!
      const monsterCenter = actorCenter(monsterState, monsterDefinition.collisionOffset)
      const canReceiveHeroHit = monsterState.mode !== 'dead' && monsterState.mode !== 'gone'
      const incomingHit =
        canReceiveHeroHit &&
        heroAttackBox &&
        heroRawPower !== null &&
        !monsterState.resolvedAttackIds.includes(this.heroState.attackId) &&
        overlaps(heroAttackBox, hurtboxAt(monsterCenter, monsterDefinition.hurtbox))
          ? { attackId: this.heroState.attackId, damage: heroRawPower }
          : null
      const hpBefore = monsterState.hp
      const modeBefore = monsterState.mode
      const monsterEvents = advanceMonster(
        monsterState,
        {
          heroX: this.heroState.x,
          heroY: this.heroState.vertical.y,
          heroAlive: this.heroCombat.state !== 'dead',
          incomingHit,
        },
        TICK_MS,
        this.monsterConfigs.get(monsterDefinition.id)!,
      )

      if (incomingHit && monsterState.hp < hpBefore) {
        events.push({
          type: 'hit-confirmed',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: monsterDefinition.id,
          attackId: incomingHit.attackId,
        })
        events.push({
          type: 'damage-applied',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: monsterDefinition.id,
          attackId: incomingHit.attackId,
          rawPower: heroRawPower!,
          defense: monsterDefinition.stats.def,
          amount: applyPhysicsDefense(heroRawPower!, monsterDefinition.stats.def),
          remainingHp: monsterState.hp,
        })
        if (monsterState.mode === 'dead' && modeBefore !== 'dead') {
          events.push({
            type: 'actor-defeated',
            tick: this.currentTick,
            actorId: monsterDefinition.id,
            sourceId: this.definition.hero.id,
          })
        } else if (monsterState.mode === 'hurt') {
          events.push({
            type: 'actor-staggered',
            tick: this.currentTick,
            actorId: monsterDefinition.id,
            untilTick: this.currentTick + Math.ceil(
              (monsterDefinition.hurtDurationMs - monsterState.modeElapsedMs) / TICK_MS,
            ),
          })
        }
      }

      for (const monsterEvent of monsterEvents) {
        if (monsterEvent.type === 'attack-start') {
          const attackId = this.monsterSwingEventIds.get(monsterDefinition.id)! + 1
          this.monsterSwingEventIds.set(monsterDefinition.id, attackId)
          events.push({
            type: 'attack-started',
            tick: this.currentTick,
            sourceId: monsterDefinition.id,
            attackId,
            action: monsterState.action,
            airborne: false,
          })
        } else if (monsterEvent.type === 'attack-frame') {
          pendingHeroHits.push(monsterDefinition)
        } else if (monsterEvent.type === 'death') {
          events.push({ type: 'actor-removed', tick: this.currentTick, actorId: monsterDefinition.id })
        }
      }
    }

    for (const monsterDefinition of pendingHeroHits) {
      this.resolveMonsterHit(monsterDefinition, events)
    }

    const heroCombatEvents = updateHeroCombat(
      this.heroCombat,
      this.heroState,
      { minX: this.definition.hero.minX, maxX: this.definition.hero.maxX },
      this.currentTick * TICK_MS,
      TICK_MS,
      this.definition.hero.spawn.x,
      this.heroCombatConfig,
    )
    if (heroCombatEvents.some((event) => event.type === 'respawn')) {
      this.resetHeroSimulationForRespawn()
      events.push({
        type: 'actor-respawned',
        tick: this.currentTick,
        actorId: this.definition.hero.id,
        x: this.definition.hero.spawn.x,
        y: this.definition.hero.spawn.y,
      })
    }
  }

  private resolveMonsterHit(monsterDefinition: MonsterCombatDefinition, events: CombatEvent[]): void {
    const monsterState = this.monsterStates.get(monsterDefinition.id)!
    const monsterCenter = actorCenter(monsterState, monsterDefinition.collisionOffset)
    const heroCenter = actorCenter(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const attackBox = resolveAttackHitbox(monsterDefinition.attack, monsterCenter, monsterState.facing)
    if (!overlaps(attackBox, hurtboxAt(heroCenter, this.definition.hero.hurtbox))) return
    const timeMs = this.currentTick * TICK_MS
    if (isHeroDamageInvulnerable(this.heroCombat, timeMs)) return

    const mitigated = monsterDefinition.attackKind === 'physics'
      ? applyPhysicsDefense(monsterDefinition.attackPower, this.definition.hero.def)
      : applyMagicDefense(monsterDefinition.attackPower, this.definition.hero.magicDefenseFraction)
    const amount = Math.max(1, Math.round(mitigated))
    const hpBefore = this.heroCombat.hp
    const attackId = this.monsterAttackIds.get(monsterDefinition.id)! + 1
    const heroEvents = applyHeroDamage(
      this.heroCombat,
      {
        sourceId: monsterDefinition.id,
        attackId,
        damage: amount,
        knockbackX: monsterState.facing,
      },
      timeMs,
      this.heroCombatConfig,
    )
    if (this.heroCombat.hp >= hpBefore) return
    this.monsterAttackIds.set(monsterDefinition.id, attackId)

    events.push({
      type: 'hit-confirmed',
      tick: this.currentTick,
      sourceId: monsterDefinition.id,
      targetId: this.definition.hero.id,
      attackId,
    })
    events.push({
      type: 'damage-applied',
      tick: this.currentTick,
      sourceId: monsterDefinition.id,
      targetId: this.definition.hero.id,
      attackId,
      rawPower: monsterDefinition.attackPower,
      defense: monsterDefinition.attackKind === 'physics'
        ? this.definition.hero.def
        : this.definition.hero.magicDefenseFraction,
      amount: hpBefore - this.heroCombat.hp,
      remainingHp: this.heroCombat.hp,
    })
    for (const heroEvent of heroEvents) {
      if (heroEvent.type === 'hurt') {
        events.push({
          type: 'actor-staggered',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          untilTick: this.currentTick + Math.ceil(this.definition.hero.hurtDurationMs / TICK_MS),
        })
      } else if (heroEvent.type === 'death') {
        this.stopHeroSimulationForDefeat()
        events.push({
          type: 'actor-defeated',
          tick: this.currentTick,
          actorId: this.definition.hero.id,
          sourceId: monsterDefinition.id,
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
    const fresh = initHeroState(this.heroConfig, this.definition.hero.spawn.x)
    fresh.vertical.y = this.definition.hero.spawn.y
    fresh.attackId = attackId
    Object.assign(this.heroState, fresh)
  }
}
