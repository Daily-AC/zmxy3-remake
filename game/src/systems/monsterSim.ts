// Phaser-independent Monster30 AI: patrol -> detect -> chase -> melee, plus
// hurt/dead reactions. Deterministic fixed-30fps stepping like heroSim.
//
// Fidelity notes (kagami monsters-index.md §Monster30 + BaseMonster AI):
//  - Stats are authoritative: hp 150, horizenSpeed 7, attackRange 250,
//    alertRange 1000, normalAttackRate 0.5, def 3.
//  - Original AI: no target -> normalWalk + selectTarget(nearest player within
//    alertRange); has target -> if x-distance <= attackRange, per-second roll
//    normalAttackRate to play hit1 (else wait), otherwise followTarget (walk in).
//  - DIVERGENCE (intentional, this slice): the original Monster30 is a FLYING
//    ranged monster (isFly=true, graity=0) that hovers ~150px above the target
//    and fires Monster30Bullet1. The task asks for a GROUND melee interpretation
//    (patrol/chase/melee) and the hero takes no damage yet, so the hit1 swing is
//    cosmetic here. Flight, hovering and the bullet are deliberately dropped;
//    TODO-verify when the ranged/damage pass lands.
//  - Animation-driven durations (hurt/attack/dead) come from monster30.json
//    stopCounts × tick; the scene computes and passes them in.
//  - Damage model is simplified physics: max(1, damage - def) (combat-rules-index.md).

export type MonsterMode = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' | 'gone'

export interface MonsterStats {
  hp: number
  speed: number
  attackRange: number
  alertRange: number
  normalAttackRate: number
  def: number
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

export interface MonsterEvent {
  type: 'hurt' | 'attack-start' | 'death'
  x: number
  y: number
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

  if (hit) events.push(...applyHit(state, hit, cfg))

  switch (state.mode) {
    case 'gone':
      return events

    case 'dead':
      state.modeElapsedMs += cfg.tickMs
      if (state.modeElapsedMs >= cfg.deadDurationMs) {
        state.mode = 'gone'
        events.push({ type: 'death', x: state.x, y: state.y })
      }
      return events

    case 'hurt':
      state.modeElapsedMs += cfg.tickMs
      if (state.modeElapsedMs >= cfg.hurtDurationMs) {
        state.mode = 'patrol' // re-decide next tick
        state.action = 'wait'
      }
      return events

    case 'attack':
      faceHero(state, heroX)
      state.modeElapsedMs += cfg.tickMs
      if (state.modeElapsedMs >= cfg.attackDurationMs) {
        state.mode = 'chase'
        state.cooldownMs = cfg.attackCooldownMs
        state.action = 'wait'
      }
      return events
  }

  // patrol / chase: target acquisition first.
  const dist = Math.abs(heroX - state.x)
  const hasTarget = heroAlive && dist <= cfg.stats.alertRange

  state.decisionAccMs += cfg.tickMs
  const decide = state.decisionAccMs >= cfg.decisionIntervalMs
  if (decide) state.decisionAccMs = 0

  if (hasTarget) {
    state.mode = 'chase'
    if (cfg.verticalFollow) stepVertical(state, heroY, cfg.verticalFollow)
    if (dist <= cfg.stats.attackRange) {
      faceHero(state, heroX)
      // In range: per-second roll to attack; otherwise hold position.
      if (decide && state.cooldownMs <= 0 && cfg.rng() < cfg.stats.normalAttackRate) {
        state.mode = 'attack'
        state.action = 'hit1'
        state.modeElapsedMs = 0
        events.push({ type: 'attack-start', x: state.x, y: state.y })
      } else {
        state.action = 'wait'
      }
    } else {
      // Chase: walk toward the hero.
      faceHero(state, heroX)
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
 * Advance the monster by a real-time delta (ms). `incomingHit` applies on the
 * first fixed tick only (like hero input edges). Returns emitted events.
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
    events.push(...tickMonster(state, input.incomingHit, input.heroX, input.heroY, input.heroAlive, cfg))
  }
  return events
}
