import type { AttackSpec } from '@zaixu/game-core/attackSpec'
import { resolveAttackHitbox } from '@zaixu/game-core/attackSpec'
import { MONSTER_ATTACKS } from '@zaixu/game-core/monsterAttackSpecs'
import { defineContentId, type RuleProvenance } from '@zaixu/content'
import {
  validateCombatSessionDefinition,
  type ActorId,
  type ActorLifeState,
  type BoxSize,
  type CombatActorSnapshot,
  type CombatCommand,
  type CombatCommandType,
  type CombatDeterministicState,
  type CombatEvent,
  type CombatSessionDefinition,
  type CombatSnapshot,
  type CommandRejectionReason,
  type DeterministicValue,
  type Facing,
  type HeroCombatDefinition,
  type MonsterCombatDefinition,
  type Point,
} from '@zaixu/game-core'
import { PROTOCOL_VERSION } from '@zaixu/protocol'
import {
  applyHeroDamage,
  createHeroCombat,
  isHeroInvulnerable,
  updateHeroCombat,
  type HeroCombatModel,
} from '../systems/heroCombat'
import {
  NO_EDGES,
  advanceHero,
  initHeroState,
  makeHeroConfig,
  type HeroConfig,
  type HeroEdges,
  type HeroState,
} from '../systems/heroSim'
import { centeredBox, heroAttackBox, overlaps, type Rect } from '../systems/hitbox'
import {
  advanceMonster,
  initMonster,
  type MonsterConfig,
  type MonsterState,
} from '../systems/monsterSim'
import {
  calculateNormalAttackPower,
  resolveIncomingHeroDamage,
  type AttackKind,
  type NormalAttackHit,
} from '../systems/heroScale'
import { TICK_MS } from '../systems/tick'

const COMBO_STAGE_HIT: readonly (NormalAttackHit | null)[] = [
  null,
  'hit1',
  'hit2',
  'hit3',
  'hit4',
  'hit5',
]

export function legacyHeroSwingIntent(input: {
  attacking: boolean
  comboStage: number
  attackId: number
  facing: -1 | 1
  center: { x: number; y: number }
  atk: number
  critChance: number
  random: () => number
}): {
  attackId: number
  action: NormalAttackHit
  rawPower: number
  hitbox: Rect
} | null {
  if (!input.attacking) return null
  const action = COMBO_STAGE_HIT[input.comboStage] ?? 'hit1'
  return {
    attackId: input.attackId,
    action,
    rawPower: Math.max(
      1,
      Math.round(calculateNormalAttackPower(action, input.atk, {
        critChance: input.critChance,
        random: input.random,
      })),
    ),
    hitbox: heroAttackBox(input.center.x, input.center.y, input.facing),
  }
}

export function legacyMonsterAttackHitbox(
  spec: AttackSpec,
  center: { x: number; y: number },
  facing: -1 | 1,
): Rect {
  return resolveAttackHitbox(spec, center, facing)
}

export function legacyFinalizeIncomingHeroDamage(
  rawPower: number,
  attackKind: AttackKind,
  heroDef: number,
  heroMagicDefenseFraction: number,
): number {
  return Math.max(
    1,
    Math.round(
      resolveIncomingHeroDamage(
        rawPower,
        attackKind,
        heroDef,
        heroMagicDefenseFraction,
      ),
    ),
  )
}

export function legacyMonsterKnockbackDirection(heroX: number, monsterX: number): -1 | 1 {
  return heroX < monsterX ? -1 : 1
}

export type LegacyActorId = ActorId
export type LegacyFacing = Facing
export type LegacyActorLifeState = ActorLifeState
export type LegacyPoint = Point
export type LegacyBoxSize = BoxSize
export type LegacyHeroDefinition = HeroCombatDefinition
export type LegacyMonsterDefinition = MonsterCombatDefinition
export type LegacyRuleProvenance = RuleProvenance
export type LegacySliceDefinition = CombatSessionDefinition
export type LegacyCommandType = CombatCommandType
export type LegacyCombatCommand = CombatCommand
export type LegacyCommandRejectionReason = CommandRejectionReason
export type LegacyCombatEvent = CombatEvent
export type LegacyCombatActorSnapshot = CombatActorSnapshot
export type LegacyCombatSnapshot = CombatSnapshot
export type LegacyDeterministicValue = DeterministicValue
export type LegacyCombatDeterministicState = CombatDeterministicState

export type ImmutableLegacyCombatDeterministicState = Omit<CombatDeterministicState, 'domain'> & {
  domain: Omit<CombatDeterministicState['domain'], 'monsters'> & {
    monsters: readonly {
      id: string
      attackId: number
      simulation: DeterministicValue
    }[]
  }
}

export interface LegacyCombatSliceFrame {
  tick: number
  checkpoint: ImmutableLegacyCombatDeterministicState
  snapshot: CombatSnapshot
  events: readonly CombatEvent[]
}

export interface LegacyCombatSliceTrace {
  frames: readonly LegacyCombatSliceFrame[]
  finalHash: string
}

const ZERO_SEED_FALLBACK = 0x6d2b79f5

export class LegacyXorshift32 {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || ZERO_SEED_FALLBACK
  }

  getState(): number {
    return this.state >>> 0
  }

  readonly next = (): number => {
    let value = this.state >>> 0
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state / 0x100000000
  }
}

export function toLegacyDeterministicValue(value: unknown): LegacyDeterministicValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    if (value === Number.POSITIVE_INFINITY) return 'positive-infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'negative-infinity'
    return 'nan'
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toLegacyDeterministicValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, toLegacyDeterministicValue(entry)]),
    )
  }
  throw new TypeError('deterministic state contains a non-serializable value')
}

export function stableLegacyStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('value is not JSON-serializable')
    return encoded
  }
  if (Array.isArray(value)) return '[' + value.map(stableLegacyStringify).join(',') + ']'
  const record = value as Record<string, unknown>
  return '{' + Object.keys(record)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + stableLegacyStringify(record[key]))
    .join(',') + '}'
}

export function stableLegacyHash(value: unknown): string {
  const input = stableLegacyStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function cloneOwned<T>(value: T): T {
  const ancestors = new WeakSet<object>()
  const clone = (entry: unknown): unknown => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number') {
      return entry
    }
    if (entry === undefined) return undefined
    if (typeof entry !== 'object') {
      throw new TypeError('legacy combat data contains a non-serializable value')
    }
    if (ancestors.has(entry)) throw new TypeError('legacy combat data contains a cycle')
    ancestors.add(entry)
    try {
      if (Array.isArray(entry)) return entry.map(clone)
      const prototype = Object.getPrototypeOf(entry)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('legacy combat data must contain only plain objects')
      }
      const output: Record<string, unknown> = Object.create(prototype) as Record<string, unknown>
      for (const [key, child] of Object.entries(entry)) output[key] = clone(child)
      return output
    } finally {
      ancestors.delete(entry)
    }
  }
  return clone(value) as T
}

function pointWithOffset(position: LegacyPoint, offset: LegacyPoint): LegacyPoint {
  return { x: position.x + offset.x, y: position.y + offset.y }
}

function hurtboxAt(center: LegacyPoint, size: LegacyBoxSize): Rect {
  return centeredBox(center.x, center.y, size.width, size.height)
}

function mergeEdge(target: HeroEdges, command: LegacyCommandType): void {
  switch (command) {
    case 'press-left': target.pressLeft = true; break
    case 'release-left': target.releaseLeft = true; break
    case 'press-right': target.pressRight = true; break
    case 'release-right': target.releaseRight = true; break
    case 'press-jump': target.pressJump = true; break
    case 'press-attack': target.pressAttack = true; break
  }
}

interface LegacyMonsterRuntime {
  definition: MonsterCombatDefinition
  config: MonsterConfig
  state: MonsterState
  /** Presentation event sequence. Legacy local damage IDs advance only when an eligible hit is attempted. */
  swingEventId: number
  attackId: number
}

export class LegacyCombatSliceOracle {
  private readonly definition: CombatSessionDefinition
  private readonly random: LegacyXorshift32
  private readonly queuedCommands: CombatCommand[] = []
  private readonly lastSeenSequenceByActor = new Map<ActorId, number>()
  private readonly heroConfig: HeroConfig
  private readonly heroState: HeroState
  private readonly heroCombat: HeroCombatModel
  private readonly monsters: LegacyMonsterRuntime[]
  private currentTick = 0

  constructor(definition: CombatSessionDefinition) {
    this.definition = validateCombatSessionDefinition(definition)
    this.random = new LegacyXorshift32(this.definition.seed)
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
    this.monsters = this.definition.monsters.map((monster) => {
      const config: MonsterConfig = {
        stats: cloneOwned(monster.stats),
        patrolMin: monster.patrolMin,
        patrolMax: monster.patrolMax,
        hurtDurationMs: monster.hurtDurationMs,
        attackDurationMs: monster.attackDurationMs,
        deadDurationMs: monster.deadDurationMs,
        attackCooldownMs: monster.attackCooldownMs,
        decisionIntervalMs: monster.decisionIntervalMs,
        tickMs: TICK_MS,
        rng: this.random.next,
        attackSpec: monster.attack,
        targetingGeometry: {
          selfOffsetX: monster.selfOffsetX,
          targetOffsetX: monster.targetOffsetX,
          attackReach: Math.max(
            0,
            monster.attack.hitbox.forward +
              monster.attack.hitbox.width / 2 +
              this.definition.hero.hurtbox.width / 2 -
              1,
          ),
        },
      }
      return {
        definition: monster,
        config,
        state: initMonster(config, monster.spawn.x, monster.spawn.y),
        swingEventId: 0,
        attackId: 0,
      }
    })
  }

  enqueue(command: CombatCommand): void {
    this.queuedCommands.push({ ...command })
    this.queuedCommands.sort((left, right) => left.atTick - right.atTick || left.sequence - right.sequence)
  }

  step(): CombatEvent[] {
    this.currentTick += 1
    const events: CombatEvent[] = []
    const edges: HeroEdges = { ...NO_EDGES }
    const due = this.queuedCommands.filter((command) => command.atTick <= this.currentTick)
    this.queuedCommands.splice(0, due.length)

    for (const command of due) {
      let reason: CommandRejectionReason | null = null
      if (command.actorId !== this.definition.hero.id) {
        reason = 'unknown-actor'
      } else {
        const lastSeen = this.lastSeenSequenceByActor.get(command.actorId) ?? -1
        if (command.sequence <= lastSeen) {
          reason = 'stale-sequence'
        } else {
          this.lastSeenSequenceByActor.set(command.actorId, command.sequence)
          if (this.heroCombat.state === 'dead') reason = 'dead'
          else if (command.type === 'press-attack' && this.heroState.attacking) reason = 'busy'
        }
      }
      if (reason) {
        events.push({ type: 'command-rejected', tick: this.currentTick, command: { ...command }, reason })
      } else {
        mergeEdge(edges, command.type)
      }
    }

    const previousHeroAttackId = this.heroState.attackId
    advanceHero(this.heroState, edges, TICK_MS, this.heroConfig)
    if (this.heroState.attackId !== previousHeroAttackId) {
      events.push({
        type: 'attack-started',
        tick: this.currentTick,
        sourceId: this.definition.hero.id,
        attackId: this.heroState.attackId,
        action: this.heroState.action,
        airborne: this.heroState.airAttack !== null,
      })
    }

    const heroCenter = pointWithOffset(
      { x: this.heroState.x, y: this.heroState.vertical.y },
      this.definition.hero.collisionOffset,
    )
    const heroIntent = legacyHeroSwingIntent({
      attacking: this.heroState.attacking,
      comboStage: this.heroState.combo.stage,
      attackId: this.heroState.attackId,
      facing: this.heroState.facing,
      center: heroCenter,
      atk: this.definition.hero.atk,
      critChance: this.definition.hero.critChance,
      random: this.random.next,
    })

    const pendingMonsterHits = new Map<string, { attackId: number; damage: number; rawPower: number }>()
    if (heroIntent) {
      for (const monster of this.monsters) {
        if (monster.state.mode === 'dead' || monster.state.mode === 'gone') continue
        const monsterCenter = pointWithOffset(monster.state, monster.definition.collisionOffset)
        if (!overlaps(heroIntent.hitbox, hurtboxAt(monsterCenter, monster.definition.hurtbox))) continue
        if (monster.state.resolvedAttackIds.includes(heroIntent.attackId)) continue
        pendingMonsterHits.set(monster.definition.id, {
          attackId: heroIntent.attackId,
          damage: heroIntent.rawPower,
          rawPower: heroIntent.rawPower,
        })
      }
    }

    const pendingHeroHits: { runtime: LegacyMonsterRuntime }[] = []

    for (const monster of this.monsters) {
      const incoming = pendingMonsterHits.get(monster.definition.id) ?? null
      const hpBefore = monster.state.hp
      const modeBefore = monster.state.mode
      const monsterEvents = advanceMonster(
        monster.state,
        {
          heroX: this.heroState.x,
          heroY: this.heroState.vertical.y,
          heroAlive: this.heroCombat.state !== 'dead',
          incomingHit: incoming ? { attackId: incoming.attackId, damage: incoming.damage } : null,
        },
        TICK_MS,
        monster.config,
      )

      if (incoming && monster.state.hp < hpBefore) {
        const amount = hpBefore - monster.state.hp
        events.push({
          type: 'hit-confirmed',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: monster.definition.id,
          attackId: incoming.attackId,
        })
        events.push({
          type: 'damage-applied',
          tick: this.currentTick,
          sourceId: this.definition.hero.id,
          targetId: monster.definition.id,
          attackId: incoming.attackId,
          rawPower: incoming.rawPower,
          defense: monster.definition.stats.def,
          amount,
          remainingHp: monster.state.hp,
        })
        if (monster.state.mode === 'dead' && modeBefore !== 'dead') {
          events.push({
            type: 'actor-defeated',
            tick: this.currentTick,
            actorId: monster.definition.id,
            sourceId: this.definition.hero.id,
          })
        } else if (monster.state.mode === 'hurt') {
          events.push({
            type: 'actor-staggered',
            tick: this.currentTick,
            actorId: monster.definition.id,
            untilTick:
              this.currentTick +
              Math.ceil((monster.definition.hurtDurationMs - monster.state.modeElapsedMs) / TICK_MS),
          })
        }
      }

      for (const event of monsterEvents) {
        if (event.type === 'attack-start') {
          monster.swingEventId += 1
          events.push({
            type: 'attack-started',
            tick: this.currentTick,
            sourceId: monster.definition.id,
            attackId: monster.swingEventId,
            action: monster.state.action,
            airborne: false,
          })
        } else if (event.type === 'attack-frame') {
          pendingHeroHits.push({ runtime: monster })
        } else if (event.type === 'death') {
          events.push({ type: 'actor-removed', tick: this.currentTick, actorId: monster.definition.id })
        }
      }
    }

    for (const hit of pendingHeroHits) {
      const monster = hit.runtime
      const monsterCenter = pointWithOffset(monster.state, monster.definition.collisionOffset)
      const attackBox = legacyMonsterAttackHitbox(
        monster.definition.attack,
        monsterCenter,
        monster.state.facing,
      )
      const currentHeroCenter = pointWithOffset(
        { x: this.heroState.x, y: this.heroState.vertical.y },
        this.definition.hero.collisionOffset,
      )
      if (!overlaps(attackBox, hurtboxAt(currentHeroCenter, this.definition.hero.hurtbox))) continue
      const timeMs = this.currentTick * TICK_MS
      if (this.heroCombat.state === 'dead' || isHeroInvulnerable(this.heroCombat, timeMs)) continue
      const attackId = ++monster.attackId
      const amount = legacyFinalizeIncomingHeroDamage(
        monster.definition.attackPower,
        monster.definition.attackKind,
        this.definition.hero.def,
        this.definition.hero.magicDefenseFraction,
      )
      const hpBefore = this.heroCombat.hp
      const heroEvents = applyHeroDamage(
        this.heroCombat,
        {
          sourceId: monster.definition.id,
          attackId,
          damage: amount,
          knockbackX: legacyMonsterKnockbackDirection(this.heroState.x, monster.state.x),
        },
        timeMs,
      )
      if (this.heroCombat.hp >= hpBefore) continue
      events.push({
        type: 'hit-confirmed',
        tick: this.currentTick,
        sourceId: monster.definition.id,
        targetId: this.definition.hero.id,
        attackId,
      })
      events.push({
        type: 'damage-applied',
        tick: this.currentTick,
        sourceId: monster.definition.id,
        targetId: this.definition.hero.id,
        attackId,
        rawPower: monster.definition.attackPower,
        defense: this.definition.hero.def,
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
          events.push({
            type: 'actor-defeated',
            tick: this.currentTick,
            actorId: this.definition.hero.id,
            sourceId: monster.definition.id,
          })
        }
      }
    }

    const heroCombatEvents = updateHeroCombat(
      this.heroCombat,
      this.heroState,
      { minX: this.definition.hero.minX, maxX: this.definition.hero.maxX },
      this.currentTick * TICK_MS,
      TICK_MS,
      this.definition.hero.spawn.x,
    )
    for (const event of heroCombatEvents) {
      if (event.type !== 'respawn') continue
      this.heroState.vertical.y = this.definition.hero.spawn.y
      this.heroState.vertical.vy = 0
      this.heroState.vertical.grounded = true
      events.push({
        type: 'actor-respawned',
        tick: this.currentTick,
        actorId: this.definition.hero.id,
        x: this.definition.hero.spawn.x,
        y: this.definition.hero.spawn.y,
      })
    }

    return events
  }

  getSnapshot(): CombatSnapshot {
    const actors: CombatActorSnapshot[] = [
      {
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
        comboStage: this.heroState.combo.stage === 0 ? null : this.heroState.combo.stage,
        statuses: this.heroCombat.meterInvulnerableUntilMs === undefined ? [] : ['meter-invulnerable'],
        knockbackVelocityX: this.heroCombat.knockbackVelocityX,
        attackId: this.heroState.attackId,
        attacking: this.heroState.attacking,
      },
      ...this.monsters.map(({ definition, state, attackId }): CombatActorSnapshot => ({
        id: definition.id,
        kind: 'monster',
        contentId: definition.contentId,
        x: state.x,
        y: state.y,
        facing: state.facing,
        action: state.action,
        hp: state.hp,
        maxHp: definition.stats.hp,
        lifeState:
          state.mode === 'gone'
            ? 'removed'
            : state.mode === 'dead'
              ? 'dead'
              : state.mode === 'hurt'
                ? 'hurt'
                : 'ready',
        comboStage: null,
        statuses: [state.mode, ...(state.staggerArmorMs > 0 ? ['stagger-armor'] : [])],
        knockbackVelocityX: 0,
        attackId,
        attacking: state.mode === 'attack',
      })),
    ]
    return cloneOwned({
      version: 1,
      contentVersion: this.definition.contentVersion,
      tick: this.currentTick,
      randomState: this.random.getState(),
      actors,
    })
  }

  getDeterministicState(): CombatDeterministicState {
    return cloneOwned({
      version: 1,
      contentVersion: this.definition.contentVersion,
      domain: {
        tick: this.currentTick,
        randomState: this.random.getState(),
        definition: toLegacyDeterministicValue(this.definition),
        heroSimulation: toLegacyDeterministicValue(this.heroState),
        heroCombat: toLegacyDeterministicValue(this.heroCombat),
        monsters: this.monsters.map(({ definition, state, attackId, swingEventId }) => ({
          id: definition.id,
          attackId,
          swingEventId,
          simulation: toLegacyDeterministicValue(state),
        })),
      },
      protocol: {
        protocolVersion: PROTOCOL_VERSION,
        queuedCommands: this.queuedCommands.map((command) => ({ ...command })),
        lastSeenSequences: [...this.lastSeenSequenceByActor]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([actorId, sequence]) => ({ actorId, sequence })),
      },
    })
  }
}

function normalAttack(action: NormalAttackHit): AttackSpec {
  return {
    action,
    hitFrameFractions: [0],
    hitbox: { forward: 85, y: 0, width: 130, height: 150 },
  }
}

export function createLegacyCombatSliceDefinition(): LegacySliceDefinition {
  return {
    version: 1,
    contentVersion: 'combat-core-slice@1',
    tickRate: 30,
    seed: 0x5a17,
    provenance: [
      { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'game/src/systems/tick.ts' },
      { ruleId: 'role1.combo-duration', origin: 'canonical', source: 'game/src/data/roles/role1.json' },
      { ruleId: 'monster7.stats', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
      { ruleId: 'monster7.hit1-power', origin: 'canonical', source: 'game/src/scenes/BattleScene.ts' },
      { ruleId: 'physics-defense', origin: 'canonical', source: 'packages/game-core/src/combat/heroScale.ts' },
      { ruleId: 'legacy.rng-consumption', origin: 'canonical', source: 'game/src/scenes/BattleScene.ts#resolveHeroHits' },
      { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
      { ruleId: 'role1.normal-active-frame', origin: 'adapted', source: 'current BattleScene swing-live rule' },
      { ruleId: 'showcase.profile', origin: 'invented', source: 'Combat Core Slice acceptance profile' },
    ],
    hero: {
      id: 'hero-1',
      contentId: defineContentId('character.zaixu.wukong'),
      spawn: { x: 480, y: 400 },
      collisionOffset: { x: 7.5, y: -22.5 },
      groundY: 400,
      minX: 90,
      maxX: 1460,
      maxHp: 120,
      atk: 36,
      def: 2,
      magicDefenseFraction: 0,
      critChance: 0,
      comboStageDurationsMs: [300, 300, 300, 1600 / 3, 1600 / 3],
      comboGraceMs: 1500,
      normalAttacks: {
        hit1: normalAttack('hit1'),
        hit2: normalAttack('hit2'),
        hit3: normalAttack('hit3'),
        hit4: normalAttack('hit4'),
        hit5: normalAttack('hit5'),
      },
      hurtbox: { width: 90, height: 150 },
      hurtDurationMs: 260,
      respawnDelayMs: 1500,
    },
    monsters: [
      {
        id: 'monster-1',
        contentId: defineContentId('monster.chapter1.monster7'),
        spawn: { x: 600, y: 400 },
        collisionOffset: { x: 4.5, y: 3 },
        stats: {
          hp: 500,
          speed: 3,
          attackRange: 250,
          alertRange: 1000,
          normalAttackRate: 1,
          def: 4,
        },
        patrolMin: 170,
        patrolMax: 1380,
        hurtDurationMs: 500,
        attackDurationMs: 1000 / 3,
        deadDurationMs: 500,
        attackCooldownMs: 1000,
        decisionIntervalMs: 1000,
        attack: cloneOwned(MONSTER_ATTACKS.monster7.hit1),
        attackPower: 14,
        attackKind: 'physics',
        hurtbox: { width: 90, height: 105 },
        targetOffsetX: 7.5,
        selfOffsetX: 4.5,
      },
    ],
  }
}

export const CANONICAL_LEGACY_COMMANDS: readonly LegacyCombatCommand[] = [
  { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' },
  { actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 3, atTick: 3, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 4, atTick: 12, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 5, atTick: 22, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 6, atTick: 32, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 7, atTick: 50, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 8, atTick: 80, type: 'release-right' },
  { actorId: 'hero-1', sequence: 9, atTick: 100, type: 'press-jump' },
]

function immutableLegacyCheckpoint(
  checkpoint: CombatDeterministicState,
): ImmutableLegacyCombatDeterministicState {
  return cloneOwned({
    ...checkpoint,
    domain: {
      ...checkpoint.domain,
      monsters: checkpoint.domain.monsters.map(({ swingEventId: _swingEventId, ...monster }) => monster),
    },
  })
}

export function runLegacyCombatSliceTrace(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): LegacyCombatSliceTrace {
  const oracle = new LegacyCombatSliceOracle(definition)
  for (const command of commands) oracle.enqueue(command)
  const frames: LegacyCombatSliceFrame[] = []
  for (let tick = 0; tick < totalTicks; tick += 1) {
    const events = oracle.step()
    const checkpoint = immutableLegacyCheckpoint(oracle.getDeterministicState())
    frames.push({
      tick: checkpoint.domain.tick,
      checkpoint,
      snapshot: oracle.getSnapshot(),
      events: cloneOwned(events),
    })
  }
  const finalCheckpoint = frames.at(-1)?.checkpoint ?? immutableLegacyCheckpoint(oracle.getDeterministicState())
  return { frames, finalHash: stableLegacyHash(finalCheckpoint) }
}
