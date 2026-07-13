import type { AttackSpec } from '../combat/attackSpec'
import { hasReachedDuration } from '../time/tick'

// Phaser-independent monster AI: patrol -> detect -> chase -> attack, plus
// hurt/dead reactions. Deterministic fixed-30fps stepping like heroSim.
//
// Fidelity notes (kagami monsters-index.md §Monster30 + BaseMonster AI):
//  - Stats are authoritative: hp 150, horizenSpeed 7, attackRange 250,
//    alertRange 1000, normalAttackRate 0.5, def 3.
//  - Original AI: no target -> normalWalk + selectTarget(player within full
//    2D alertRange); has target -> if x-distance <= attackRange, per-second roll
//    normalAttackRate to play hit1 (else wait), otherwise followTarget (walk in).
//  - Monster30 is a FLYING ranged monster (isFly=true, graity=0) that fires
//    Monster30Bullet1 from hit1. Configure `rangedAttack` for that species so
//    hit1 emits a projectile-spawn event instead of melee damage.
//  - Animation-driven durations (hurt/attack/dead) come from monster30.json
//    stopCounts × tick; the scene computes and passes them in.
//  - Damage model is simplified physics: max(1, damage - def) (combat-rules-index.md).
//
// Short stagger armor (combat-triage pen, 2026-07-10): consecutive hits still
// deal damage, but after a small grunt/boss-specific threshold they stop
// refreshing `hurt` for 1.2s. This lets the monster resume chase/attack AI
// without granting the old port's long full-damage-immunity window.

export type MonsterMode = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' | 'gone'

export interface MonsterStats {
  hp: number
  speed: number
  attackRange: number
  alertRange: number
  normalAttackRate: number
  def: number
  /** Original fractional magic-damage reduction. Omitted when the species has none. */
  mDef?: number
}

// From monsters-index.md §Monster30 基础数值 (normal difficulty, no scaling).
export const MONSTER30_STATS: MonsterStats = {
  hp: 150,
  speed: 7,
  attackRange: 250,
  alertRange: 1000,
  normalAttackRate: 0.5,
  def: 3,
}

/**
 * Optional Y-axis pursuit for flying/vertical-chase monsters. Undefined (the
 * default for every existing caller) leaves `state.y` untouched exactly like
 * before this feature existed -- x-only monsters see byte-for-bit identical
 * behavior. This closes the gap recorded in tasks/prefab-compiler-report.md
 * §5.4/§104 (stage-1 climb section: Monster30 is a real flyer that chases the
 * hero vertically in the original StageListener11, but monsterSim had no
 * y-axis at all, so the climb was threat-free).
 */
export interface VerticalFollowConfig {
  enabled: boolean
  /** Max px closed per tick toward heroY. TODO-verify: no AS3 vertical-speed
   * constant has been decompiled for Monster30's flight AI yet (it hovers via
   * its own bespoke logic, see this file's top-of-file DIVERGENCE note); this
   * is a project-chosen placeholder, not a sourced number. Reusing the
   * horizontal `speed` order of magnitude is a reasonable starting point. */
  speed: number
  /** Stop closing once within this many px of heroY (avoids jitter/overshoot
   * oscillation once "close enough"). */
  arriveThreshold: number
}

export interface MonsterConfig {
  stats: MonsterStats
  patrolMin: number
  patrolMax: number
  hurtDurationMs: number
  attackDurationMs: number
  deadDurationMs: number
  attackCooldownMs: number
  /** Per-second AI decision cadence (原版每秒判断一次). */
  decisionIntervalMs: number
  tickMs: number
  /** Injectable RNG so tests and playback are reproducible. */
  rng: () => number
  /** Opt-in y-axis pursuit; omit or set enabled:false for x-only monsters
   * (the default -- see VerticalFollowConfig doc comment). */
  verticalFollow?: VerticalFollowConfig
  /** Shared action data for hit-frame timing, world collision, and effects.
   * Omit for undecompiled callers to retain the previous 0.5 timing fallback. */
  attackSpec?: AttackSpec
  /** Visual-center geometry used by melee AI. AS3 attackRange registers a
   * target, but the monster must keep walking until its actual hitbox reaches
   * that target. Omit to preserve legacy raw-registration-point behavior. */
  targetingGeometry?: {
    selfOffsetX: number
    targetOffsetX: number
    attackReach: number
  }
  /** If present, the hit frame also spawns a projectile. The scene does not
   * resolve the corresponding attack-frame as immediate melee damage. */
  rangedAttack?: RangedAttackConfig
  /** Bosses require two more consecutive staggers before armor activates. */
  isBoss?: boolean
}

export interface RangedAttackConfig {
  kind: string
  speedPxPerSecond: number
  radius: number
  ttlMs: number
  spawnOffsetX?: number
  spawnOffsetY?: number
}

const GRUNT_STAGGER_THRESHOLD = 4
const BOSS_STAGGER_THRESHOLD = 6
const STAGGER_ARMOR_MS = 1200
const STAGGER_RESET_MS = 2000
const TIMER_EPSILON_MS = 1e-6

function decrementTimer(ms: number, tickMs: number): number {
  const remaining = ms - tickMs
  return remaining <= TIMER_EPSILON_MS ? 0 : remaining
}

export interface MonsterState {
  x: number
  y: number
  facing: -1 | 1
  hp: number
  mode: MonsterMode
  action: string
  /** Time spent in the current hurt/attack/dead animation. */
  modeElapsedMs: number
  cooldownMs: number
  decisionAccMs: number
  patrolDir: -1 | 1
  waiting: boolean
  /** Attack ids already resolved against this monster (hit dedup). */
  resolvedAttackIds: number[]
  accMs: number
  /** Whether the current attack's hit-frame event has already fired (so a
   * multi-tick attack only ever gets one shot at connecting, never one per
   * tick past the threshold). Reset false whenever a new attack starts. */
  attackFrameResolved: boolean
  /** Next entry in AttackSpec.hitFrameFractions to emit. */
  nextAttackFrameIndex: number
  /** Consecutive nonlethal hits received outside the armor window. */
  staggerHits: number
  /** While active, hits deal damage but do not interrupt the current AI mode. */
  staggerArmorMs: number
  /** Time left before an incomplete consecutive-hit count is cleared. */
  staggerResetMs: number
}

export interface MonsterHit {
  attackId: number
  damage: number
}

export interface MonsterInput {
  heroX: number
  /** Hero's current y. Optional -- only consulted when `verticalFollow` is
   * enabled on the config; x-only monsters (and any caller that hasn't been
   * updated to pass it) are unaffected. */
  heroY?: number
  heroAlive: boolean
  incomingHit: MonsterHit | null
}

export type MonsterEvent = MonsterBasicEvent | MonsterProjectileSpawnEvent

export interface MonsterBasicEvent {
  /** `attack-frame` is emitted once when the action crosses its configured
   * fraction. The scene resolves collision from the shared AttackSpec. */
  type: 'hurt' | 'attack-start' | 'attack-frame' | 'death'
  x: number
  y: number
  attackFrameIndex?: number
}

export interface MonsterProjectileSpawnEvent {
  type: 'projectile-spawn'
  x: number
  y: number
  facing: -1 | 1
  targetX: number
  targetY: number
  projectile: RangedAttackConfig
}

export function initMonster(cfg: MonsterConfig, x: number, y: number): MonsterState {
  return {
    x,
    y,
    facing: -1,
    hp: cfg.stats.hp,
    mode: 'patrol',
    action: 'wait',
    modeElapsedMs: 0,
    cooldownMs: 0,
    decisionAccMs: 0,
    patrolDir: -1,
    waiting: false,
    resolvedAttackIds: [],
    accMs: 0,
    attackFrameResolved: false,
    nextAttackFrameIndex: 0,
    staggerHits: 0,
    staggerArmorMs: 0,
    staggerResetMs: 0,
  }
}

function faceHero(state: MonsterState, heroX: number): void {
  state.facing = heroX < state.x ? -1 : 1
}

/** Close `state.y` toward `heroY` by up to `follow.speed` px, stopping once
 * within `follow.arriveThreshold`. No-op if heroY is unknown. */
function stepVertical(state: MonsterState, heroY: number | undefined, follow: VerticalFollowConfig): void {
  if (!follow.enabled || heroY === undefined) return
  const dy = heroY - state.y
  if (Math.abs(dy) <= follow.arriveThreshold) return
  const dir = dy > 0 ? 1 : -1
  state.y += dir * Math.min(follow.speed, Math.abs(dy))
}

/** Resolve an incoming hero hit, if it is new. Returns emitted events. */
function applyHit(state: MonsterState, hit: MonsterHit, cfg: MonsterConfig): MonsterEvent[] {
  if (state.mode === 'dead' || state.mode === 'gone') return []
  if (state.resolvedAttackIds.includes(hit.attackId)) return []
  state.resolvedAttackIds.push(hit.attackId)
  const dmg = Math.max(1, hit.damage - cfg.stats.def)
  state.hp -= dmg
  if (state.hp <= 0) {
    state.hp = 0
    state.mode = 'dead'
    state.action = 'dead'
    state.modeElapsedMs = 0
    return [] // death event fires when the dead animation completes
  }
  state.staggerResetMs = STAGGER_RESET_MS
  if (state.staggerArmorMs > 0) return []

  state.staggerHits += 1
  const threshold = cfg.isBoss ? BOSS_STAGGER_THRESHOLD : GRUNT_STAGGER_THRESHOLD
  if (state.staggerHits >= threshold) {
    state.staggerHits = 0
    state.staggerArmorMs = STAGGER_ARMOR_MS
    state.mode = 'chase'
    state.action = 'wait'
    state.modeElapsedMs = 0
    return []
  }
  state.mode = 'hurt'
  state.action = 'hurt'
  state.modeElapsedMs = 0
  return [{ type: 'hurt', x: state.x, y: state.y }]
}

function tickMonster(
  state: MonsterState,
  hit: MonsterHit | null,
  heroX: number,
  heroY: number | undefined,
  heroAlive: boolean,
  cfg: MonsterConfig,
): MonsterEvent[] {
  const events: MonsterEvent[] = []
  if (state.cooldownMs > 0) state.cooldownMs = Math.max(0, state.cooldownMs - cfg.tickMs)
  if (state.staggerArmorMs > 0) {
    state.staggerArmorMs = decrementTimer(state.staggerArmorMs, cfg.tickMs)
  }
  if (state.staggerResetMs > 0) {
    state.staggerResetMs = decrementTimer(state.staggerResetMs, cfg.tickMs)
    if (state.staggerResetMs === 0) state.staggerHits = 0
  }

  if (hit) events.push(...applyHit(state, hit, cfg))

  switch (state.mode) {
    case 'gone':
      return events

    case 'dead':
      state.modeElapsedMs += cfg.tickMs
      if (hasReachedDuration(state.modeElapsedMs, cfg.deadDurationMs)) {
        state.mode = 'gone'
        events.push({ type: 'death', x: state.x, y: state.y })
      }
      return events

    case 'hurt':
      state.modeElapsedMs += cfg.tickMs
      if (hasReachedDuration(state.modeElapsedMs, cfg.hurtDurationMs)) {
        state.mode = 'patrol' // re-decide next tick
        state.action = 'wait'
      }
      return events

    case 'attack': {
      // Facing is NOT re-tracked here (unlike chase): the scene resolves the
      // shared world hitbox using the direction committed at attack-start.
      state.modeElapsedMs += cfg.tickMs
      const hitFrameFractions = cfg.attackSpec?.hitFrameFractions ?? [0.5]
      while (
        state.nextAttackFrameIndex < hitFrameFractions.length &&
        hasReachedDuration(
          state.modeElapsedMs,
          cfg.attackDurationMs * hitFrameFractions[state.nextAttackFrameIndex],
        )
      ) {
        const attackFrameIndex = state.nextAttackFrameIndex++
        events.push({ type: 'attack-frame', x: state.x, y: state.y, attackFrameIndex })
        if (cfg.rangedAttack && heroAlive) {
          events.push({
            type: 'projectile-spawn',
            x: state.x + state.facing * (cfg.rangedAttack.spawnOffsetX ?? 0),
            y: state.y + (cfg.rangedAttack.spawnOffsetY ?? 0),
            facing: state.facing,
            targetX: heroX,
            targetY: heroY ?? state.y,
            projectile: cfg.rangedAttack,
          })
        }
      }
      state.attackFrameResolved = state.nextAttackFrameIndex >= hitFrameFractions.length
      if (hasReachedDuration(state.modeElapsedMs, cfg.attackDurationMs)) {
        state.mode = 'chase'
        state.cooldownMs = cfg.attackCooldownMs
        state.action = 'wait'
      }
      return events
    }
  }

  // patrol / chase: target acquisition first. BaseMonster.selectTarget() uses
  // full 2D distance for alertRange, while hasAttackTarget() gates the engaged
  // hit1 attack on x-distance only.
  const selfTargetX = state.x + (cfg.targetingGeometry?.selfOffsetX ?? 0)
  const heroTargetX = heroX + (cfg.targetingGeometry?.targetOffsetX ?? 0)
  const xDist = Math.abs(heroTargetX - selfTargetX)
  const acquisitionDist = Math.hypot(heroTargetX - selfTargetX, (heroY ?? state.y) - state.y)
  const hasTarget = heroAlive && acquisitionDist <= cfg.stats.alertRange

  state.decisionAccMs += cfg.tickMs
  const decide = state.decisionAccMs >= cfg.decisionIntervalMs
  if (decide) state.decisionAccMs = 0

  if (hasTarget) {
    state.mode = 'chase'
    if (cfg.verticalFollow) stepVertical(state, heroY, cfg.verticalFollow)
    const attackReach = cfg.targetingGeometry?.attackReach ?? cfg.stats.attackRange
    if (xDist <= attackReach) {
      faceHero(state, heroTargetX - (cfg.targetingGeometry?.selfOffsetX ?? 0))
      // In range: per-second roll to attack; otherwise hold position.
      if (decide && state.cooldownMs <= 0 && cfg.rng() < cfg.stats.normalAttackRate) {
        state.mode = 'attack'
        state.action = 'hit1'
        state.modeElapsedMs = 0
        state.attackFrameResolved = false
        state.nextAttackFrameIndex = 0
        events.push({ type: 'attack-start', x: state.x, y: state.y })
      } else {
        state.action = 'wait'
      }
    } else {
      // Chase: walk toward the hero.
      faceHero(state, heroTargetX - (cfg.targetingGeometry?.selfOffsetX ?? 0))
      state.x += state.facing * cfg.stats.speed
      state.action = 'walk'
    }
    return events
  }

  // No target: patrol between bounds, turning at the edges, sometimes waiting.
  state.mode = 'patrol'
  if (decide) state.waiting = cfg.rng() < 0.2 // brief idle (~waitRateWhenNoTarget)
  if (state.waiting) {
    state.action = 'wait'
    return events
  }
  if (state.x <= cfg.patrolMin) state.patrolDir = 1
  else if (state.x >= cfg.patrolMax) state.patrolDir = -1
  state.facing = state.patrolDir
  state.x += state.patrolDir * cfg.stats.speed
  state.action = 'walk'
  return events
}

/**
 * Advance the monster by a real-time delta (ms). `incomingHit` resolves once
 * immediately, while timers and AI advance only on accumulated fixed ticks.
 */
export function advanceMonster(
  state: MonsterState,
  input: MonsterInput,
  dtMs: number,
  cfg: MonsterConfig,
): MonsterEvent[] {
  const events: MonsterEvent[] = []
  state.accMs += dtMs
  let first = true
  let budget = 8
  while (state.accMs >= cfg.tickMs && budget-- > 0) {
    const hit = first ? input.incomingHit : null
    events.push(...tickMonster(state, hit, input.heroX, input.heroY, input.heroAlive, cfg))
    state.accMs -= cfg.tickMs
    first = false
  }
  if (budget <= 0) state.accMs = 0
  // Apply a hit even on a sub-tick frame so a fast frame never drops it.
  if (first && input.incomingHit) {
    events.push(...applyHit(state, input.incomingHit, cfg))
  }
  return events
}
