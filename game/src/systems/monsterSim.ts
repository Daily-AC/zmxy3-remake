import type { AttackSpec } from './attackSpec'

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
// Hit-stun protection (combat-triage pen, 2026-07-10 -- fixes the reported
// "怪物无限眩晕不反击"): every hit that lands re-enters `hurt` and resets
// `modeElapsedMs` to 0 (see `applyHit` below), so a player who keeps landing
// hits faster than `hurtDurationMs` can refresh `hurt` forever -- the monster
// never gets a tick where `hasAttackTarget()`-equivalent logic would let it
// act. The real AS3 defense against exactly this is `BaseMonster.as`'s
// `beattackedtimes` counter (read directly off this project's own
// `tmp/re-level1/mainscripts/scripts/base/BaseMonster.as` decompile,
// `beMagicAttack()` lines 606-754):
//   - `beMagicAttack()`'s very first line rejects the hit outright while
//     `gc.protectedPerproty.getProperty(this,"isYourFather")` is true
//     (`return false` before any damage/hurt logic runs at all).
//   - Every hit that DOES land adds the attacking move's own
//     `attackBackInfoDict[action].addprotection` (falls back to a flat `2`)
//     to `this.beattackedtimes`. Once that exceeds a threshold --
//     `> 49` for `isBoss` monsters, `> 59` for grunts (BaseMonster.as:743/750)
//     -- the monster calls `setYourFather(gc.frameClips * 3, true)`, i.e.
//     ~3000ms (frameClips=30 @ 30fps) of the above "isYourFather" hit
//     immunity, and resets the counter to 0.
//   - `export/hero/Role1.as:33-67` (悟空, the hero this bug was reported
//     against) sets `addprotection:2.5` on EVERY ONE of `hit1`..`hit5` -- the
//     entire 5-hit ground combo that caused the report uses this single
//     uniform value (skills/finishers use other values, 1-5, not modeled
//     here since `MonsterHit` carries no per-move addProtection field yet --
//     Adapted simplification, but the exact real value for the actual combo
//     path in play).
//   - Net effect, faithfully ported below: a mashing player CAN stun-lock a
//     monster for a while (exactly like the original), but after ~20-24
//     combo hits land the monster gets a real ~3s window where it is fully
//     hit-immune, its `hurt` animation runs to completion uninterrupted, and
//     it returns to `chase`/`attack` (able to act/counter) -- so "从不反击"
//     is no longer possible, matching the real game's own behavior.

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
  /** Shared action data for hit-frame timing, world collision, and effects.
   * Omit for undecompiled callers to retain the previous 0.5 timing fallback. */
  attackSpec?: AttackSpec
  /** If present, the hit frame also spawns a projectile. The scene does not
   * resolve the corresponding attack-frame as immediate melee damage. */
  rangedAttack?: RangedAttackConfig
  /** BaseMonster.as:741/750 picks the hit-stun-protection threshold off this
   * -- see file header. Defaults to the grunt threshold (59) when omitted. */
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

// See file header "Hit-stun protection" note for sourcing.
const HIT_ADD_PROTECTION = 2.5 // Role1.as hit1..hit5's uniform addprotection
const BOSS_PROTECTION_THRESHOLD = 49 // BaseMonster.as:743
const GRUNT_PROTECTION_THRESHOLD = 59 // BaseMonster.as:750
const PROTECTION_MS = 3000 // gc.frameClips(30) * 3 @ 30fps, BaseMonster.as:745/752

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
  /** BaseMonster.as `beattackedtimes` -- accumulates per landed hit, reset to
   * 0 once it crosses the hit-stun-protection threshold (see file header). */
  beattackedTimes: number
  /** BaseMonster.as `isYourFather` hit-immunity window, in ms remaining.
   * While > 0, `applyHit` ignores every incoming hit outright (no damage, no
   * hurt re-trigger) -- ticks down to 0 every frame regardless of mode. */
  protectionMs: number
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
    beattackedTimes: 0,
    protectionMs: 0,
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
  // BaseMonster.beMagicAttack()'s own first line: `isYourFather` -> the hit
  // is rejected outright, before dedup/damage/hurt even run (see file header).
  if (state.protectionMs > 0) return []
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
  state.beattackedTimes += HIT_ADD_PROTECTION
  const threshold = cfg.isBoss ? BOSS_PROTECTION_THRESHOLD : GRUNT_PROTECTION_THRESHOLD
  if (state.beattackedTimes > threshold) {
    state.beattackedTimes = 0
    state.protectionMs = PROTECTION_MS
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
  if (state.protectionMs > 0) state.protectionMs = Math.max(0, state.protectionMs - cfg.tickMs)

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

    case 'attack': {
      // Facing is NOT re-tracked here (unlike chase): the scene resolves the
      // shared world hitbox using the direction committed at attack-start.
      state.modeElapsedMs += cfg.tickMs
      const hitFrameMs = cfg.attackDurationMs * (cfg.attackSpec?.hitFrameFraction ?? 0.5)
      if (!state.attackFrameResolved && state.modeElapsedMs >= hitFrameMs) {
        state.attackFrameResolved = true
        events.push({ type: 'attack-frame', x: state.x, y: state.y })
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
      if (state.modeElapsedMs >= cfg.attackDurationMs) {
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
  const xDist = Math.abs(heroX - state.x)
  const acquisitionDist = Math.hypot(heroX - state.x, (heroY ?? state.y) - state.y)
  const hasTarget = heroAlive && acquisitionDist <= cfg.stats.alertRange

  state.decisionAccMs += cfg.tickMs
  const decide = state.decisionAccMs >= cfg.decisionIntervalMs
  if (decide) state.decisionAccMs = 0

  if (hasTarget) {
    state.mode = 'chase'
    if (cfg.verticalFollow) stepVertical(state, heroY, cfg.verticalFollow)
    if (xDist <= cfg.stats.attackRange) {
      faceHero(state, heroX)
      // In range: per-second roll to attack; otherwise hold position.
      if (decide && state.cooldownMs <= 0 && cfg.rng() < cfg.stats.normalAttackRate) {
        state.mode = 'attack'
        state.action = 'hit1'
        state.modeElapsedMs = 0
        state.attackFrameResolved = false
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
