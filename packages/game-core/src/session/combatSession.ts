import { PROTOCOL_VERSION } from '@zaixu/protocol'
import { createHeroCombat, type HeroCombatModel } from '../combat/heroCombat'
import {
  NO_EDGES,
  advanceHero,
  initHeroState,
  makeHeroConfig,
  type HeroConfig,
  type HeroEdges,
  type HeroState,
} from '../hero/heroSim'
import { initMonster, type MonsterConfig, type MonsterState } from '../monster/monsterSim'
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

function monsterConfig(definition: MonsterCombatDefinition, random: SeededRandom): MonsterConfig {
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
      attackReach: definition.attack.hitbox.forward + definition.attack.hitbox.width / 2,
    },
  }
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
  private readonly heroState: HeroState
  private readonly heroCombat: HeroCombatModel
  private readonly monsterStates = new Map<ActorId, MonsterState>()
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
    this.heroCombat = createHeroCombat()
    this.heroCombat.hp = this.definition.hero.maxHp
    this.heroCombat.maxHp = this.definition.hero.maxHp

    for (const monster of this.definition.monsters) {
      this.monsterStates.set(
        monster.id,
        initMonster(monsterConfig(monster, this.random), monster.spawn.x, monster.spawn.y),
      )
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
      statuses: [],
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
        statuses: [],
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
}
