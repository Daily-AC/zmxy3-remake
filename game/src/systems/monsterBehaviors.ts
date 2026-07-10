// Phaser-independent, data-driven monster behavior library.
//
// `monsterSim.ts` (this project, untouched by this file) hand-implements
// exactly one species (a ground-melee reinterpretation of Monster30). This
// module generalizes that into a data-driven spec — `MonsterBehaviorSpec` is
// plain data (stats + one or two attack "moves"), and `advanceMonsterBehavior`
// is the one generic stepper every species shares. Adding a new monster later
// means adding a new spec object, not new stepping code.
//
// Nothing in scenes/, ui/, net/, agent-server/, or any *existing* systems file
// is touched or imported for its behavior — only `./tick`'s `TICK_MS`
// constant (a plain re-exported number) and `./hitbox`'s `Rect`/`centeredBox`
// (the project's existing AABB helpers, reused so a spawned melee hitbox can
// feed straight into the same `overlaps()` hit-testing already used
// elsewhere) are imported.
//
// ## Shared AI shell provenance
//
// The patrol/chase/attack-decision/hurt/dead shell is ported from
// `vendor/kagami-phaser/docs/reverse-engineering/monsters-index.md`'s
// `BaseMonster` section, cross-checked directly against this project's own
// decompile of `base.BaseMonster` out of the actual vendored main-logic SWF:
//
//   java -jar tools/ffdec/ffdec-cli.jar -selectclass base.BaseMonster \
//     -export script <out> \
//     "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
//
// Two corrections to kagami's own approximations, confirmed by reading
// `BaseMonster.as` directly (line numbers below refer to that decompile,
// full citations in tasks/monster-behavior-report.md):
//   - default `normalAttackRate` is exactly `0.3` (not kagami's "约0.366";
//     BaseMonster.as:28) unless a monster overrides it in its own constructor.
//   - `alertRange` is checked with full 2D distance
//     (`AUtils.GetDisBetweenTwoObj`, BaseMonster.as:465); the *acquired*
//     `attackRange` check is x-distance only (`Math.abs(x - target.x)`,
//     BaseMonster.as:369). `monsterSim.ts` treats both as x-only as its own
//     simplification; this module is more faithful on `alertRange`.
//   - `waitRateWhenNoTarget` default `0.137` (BaseMonster.as:32) and the
//     once-per-second decision cadence (`count % gc.frameClips == 0`,
//     `gc.frameClips === 30`, i.e. every 1000ms) both match kagami's docs
//     and this project's own `TICK_MS`/`FPS` convention (`./tick`).
//
// ## Three behaviors ship here
//
//  1. `monster3` — straight port of kagami's
//     `vendor/kagami-phaser/src/systems/Monster3System.ts` (302 lines).
//     Numbers verbatim from `Monster3Tuning`.
//  2. `monster7` — this port's own reverse-engineering of
//     `export.monster.Monster7` (level-1 roster; also kagami's own "ground
//     alternative" pick, monsters-index.md:589-607). Simplest melee: one
//     `hit1`, a self-anchored hitbox, and a confirmed-but-inert empty skill
//     slot (see report — deliberately NOT implemented, it has zero
//     observable effect in the original).
//  3. `monster13` — this port's own reverse-engineering of
//     `export.monster.Monster13` (level-3 roster, confirmed via
//     `-export symbolclass` on `out_res/3.swf`). The only monster found in
//     an 85-class scan of `export.monster.*` that spawns a genuinely
//     *traveling* projectile (`EnemyMoveBullet`: aimed once at cast time,
//     constant acceleration, distance-based expiry) rather than a
//     self-anchored instant-hit effect (`SpecialEffectBullet`, used by every
//     other monster scanned, including Monster3 and Monster7 above).
//
// ## Attack-spawn model
//
// Unlike kagami's Monster3System.ts (which exposes a continuous
// `getMonster3AttackHitbox()` query valid across a `[from, until]` ms window
// every frame), this module spawns each attack ONCE, at `spawnAtMs` elapsed
// into the attack action, as a self-contained descriptor
// (`SpawnedHitbox | SpawnedProjectile`) carrying its own lifetime/max
// distance — the same pattern `heroSkill.ts`'s `SkillHitbox` already uses.
// This unifies melee-hitbox and traveling-projectile attacks under one API
// instead of two, and is a deliberate *shape* simplification, not a numeric
// one: Monster3's ported hit1/hit2 windows keep the exact same total
// on-screen active duration (`until - from`), just expressed as "spawn at
// `from`, active for `until - from`" instead of "queryable across
// `[from, until]`".
//
// Rendering, projectile position simulation, and animation are all left to
// the future wiring layer — this module only produces data.

import { TICK_MS } from './tick'
import { centeredBox, type Rect } from './hitbox'

export type AttackKind = 'physics' | 'magic'

// ============================================================
// Data-driven spec
// ============================================================

export interface MonsterHitboxAttackSpec {
  kind: 'hitbox'
  /** Offset from the monster's own position, mirrored by facing (world offsetX = facing * offsetX). */
  offsetX: number
  offsetY: number
  width: number
  height: number
  /** How long the hitbox stays live once spawned. */
  activeDurationMs: number
  damage: number
  attackKind: AttackKind
  knockbackX: number
  knockbackY: number
  hitIntervalFrames: number
  maxHits: number
}

export interface MonsterProjectileAttackSpec {
  kind: 'projectile'
  offsetX: number
  offsetY: number
  /** Initial speed magnitude (px/s), aimed at the target's position at spawn time. */
  speed: number
  /** Constant acceleration (px/s^2) applied along that same fixed initial aim
   * direction every tick — the projectile does not re-aim/home (no
   * `moveTarget` in the AS3 source; see Monster13.as:172-192). */
  accel: number
  /** Total path length (px) before the projectile expires. */
  maxDistance: number
  damage: number
  attackKind: AttackKind
  knockbackX: number
  knockbackY: number
  hitIntervalFrames: number
  maxHits: number
}

export type MonsterAttackSpec = MonsterHitboxAttackSpec | MonsterProjectileAttackSpec

export interface MonsterAttackMove {
  actionName: string
  /** Total duration of the attack action/animation. */
  durationMs: number
  /** Elapsed time within the action at which the attack actually spawns. */
  spawnAtMs: number
  attack: MonsterAttackSpec
}

/** A deterministic, cooldown+range-gated attack (Monster3's hit2). Checked
 * before the normal-attack roll every decision tick, matching
 * `BaseMonster.hasAttackTarget()`'s skill-slot check running ahead of its
 * `count % gc.frameClips` normal-attack roll. */
export interface MonsterSkillGate {
  move: MonsterAttackMove
  triggerRange: number
  initialCooldownMs: number
  cooldownMs: number
}

export interface MonsterBehaviorSpec {
  id: string
  source: string
  hp: number
  def: number
  /** px/s ground movement speed. */
  speed: number
  attackRange: number
  alertRange: number
  hurtDurationMs: number
  deadDurationMs: number
  /** AI decision cadence (normally 1000ms, `gc.frameClips` frames). */
  decisionIntervalMs: number
  normalAttackRate: number
  waitRateWhenNoTarget: number
  normalMove: MonsterAttackMove
  skill?: MonsterSkillGate
}

// ============================================================
// Runtime state
// ============================================================

export type MonsterMode = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' | 'gone'

export interface MonsterBehaviorState {
  x: number
  y: number
  facing: -1 | 1
  hp: number
  mode: MonsterMode
  activeMove?: 'normal' | 'skill'
  /** Time spent in the current mode's animation (attack/hurt/dead). */
  modeElapsedMs: number
  /** Whether the active attack's `spawnAtMs` has already fired this action. */
  spawned: boolean
  skillCooldownMs: number
  decisionAccMs: number
  patrolDir: -1 | 1
  waiting: boolean
  resolvedAttackIds: string[]
}

export function createMonsterBehaviorState(spec: MonsterBehaviorSpec, x: number, y: number): MonsterBehaviorState {
  return {
    x,
    y,
    facing: -1,
    hp: spec.hp,
    mode: 'patrol',
    modeElapsedMs: 0,
    spawned: false,
    skillCooldownMs: spec.skill?.initialCooldownMs ?? 0,
    decisionAccMs: 0,
    patrolDir: -1,
    waiting: false,
    resolvedAttackIds: [],
  }
}

export interface MonsterPatrolBounds {
  patrolMin: number
  patrolMax: number
}

export interface MonsterBehaviorTarget {
  x: number
  y: number
  isAlive: boolean
}

export interface MonsterBehaviorHit {
  attackId: string
  damage: number
}

export interface SpawnedHitbox {
  kind: 'hitbox'
  actionName: string
  x: number
  y: number
  width: number
  height: number
  activeDurationMs: number
  damage: number
  attackKind: AttackKind
  knockbackX: number
  knockbackY: number
  hitIntervalFrames: number
  maxHits: number
}

export interface SpawnedProjectile {
  kind: 'projectile'
  actionName: string
  x: number
  y: number
  /** Initial velocity (px/s), already aimed at the target's position at spawn time. */
  velocityX: number
  velocityY: number
  /** px/s^2, applied along the initial (velocityX, velocityY) direction every tick. */
  accel: number
  maxDistance: number
  damage: number
  attackKind: AttackKind
  knockbackX: number
  knockbackY: number
  hitIntervalFrames: number
  maxHits: number
}

export type MonsterAttackSpawn = SpawnedHitbox | SpawnedProjectile

export interface MonsterBehaviorEvent {
  type: 'attack-start' | 'attack-spawn' | 'hurt' | 'death'
  x: number
  y: number
  spawn?: MonsterAttackSpawn
}

/** Convert a spawned melee hitbox into this project's existing `Rect` shape,
 * ready for `hitbox.ts`'s `overlaps()`. Projectiles have no direct
 * equivalent here — their position moves every tick, so the wiring layer
 * must track that itself (see the projectile-physics note in the file
 * header / report). */
export function spawnedHitboxToRect(spawn: SpawnedHitbox): Rect {
  return centeredBox(spawn.x, spawn.y, spawn.width, spawn.height)
}

function applyHit(
  state: MonsterBehaviorState,
  spec: MonsterBehaviorSpec,
  hit: MonsterBehaviorHit,
): MonsterBehaviorEvent[] {
  if (state.mode === 'dead' || state.mode === 'gone') return []
  if (state.resolvedAttackIds.includes(hit.attackId)) return []
  state.resolvedAttackIds.push(hit.attackId)

  const dmg = Math.max(1, hit.damage - spec.def)
  state.hp = Math.max(0, state.hp - dmg)
  state.activeMove = undefined
  state.spawned = false

  if (state.hp <= 0) {
    state.mode = 'dead'
    state.modeElapsedMs = 0
    return []
  }

  state.mode = 'hurt'
  state.modeElapsedMs = 0
  return [{ type: 'hurt', x: state.x, y: state.y }]
}

function startAttack(state: MonsterBehaviorState, which: 'normal' | 'skill'): void {
  state.mode = 'attack'
  state.activeMove = which
  state.modeElapsedMs = 0
  state.spawned = false
}

function buildSpawn(
  state: MonsterBehaviorState,
  move: MonsterAttackMove,
  target: MonsterBehaviorTarget,
): MonsterAttackSpawn {
  const attack = move.attack
  const spawnX = state.x + state.facing * attack.offsetX
  const spawnY = state.y + attack.offsetY

  if (attack.kind === 'hitbox') {
    return {
      kind: 'hitbox',
      actionName: move.actionName,
      x: spawnX,
      y: spawnY,
      width: attack.width,
      height: attack.height,
      activeDurationMs: attack.activeDurationMs,
      damage: attack.damage,
      attackKind: attack.attackKind,
      knockbackX: attack.knockbackX * state.facing,
      knockbackY: attack.knockbackY,
      hitIntervalFrames: attack.hitIntervalFrames,
      maxHits: attack.maxHits,
    }
  }

  // Aim from the spawn point toward the target's position sampled right now
  // (matches `AUtils.GetNextPointByTwoObj(this, this.curAttackTarget)`
  // evaluated inside `doHi1()` at the exact spawn frame, Monster13.as:182-184
  // — not the target's position back when the attack started).
  const dx = target.x - spawnX
  const dy = target.y - spawnY
  const dist = Math.hypot(dx, dy) || 1
  const dirX = dx / dist
  const dirY = dy / dist
  return {
    kind: 'projectile',
    actionName: move.actionName,
    x: spawnX,
    y: spawnY,
    velocityX: dirX * attack.speed,
    velocityY: dirY * attack.speed,
    accel: attack.accel,
    maxDistance: attack.maxDistance,
    damage: attack.damage,
    attackKind: attack.attackKind,
    knockbackX: attack.knockbackX,
    knockbackY: attack.knockbackY,
    hitIntervalFrames: attack.hitIntervalFrames,
    maxHits: attack.maxHits,
  }
}

/**
 * Advance a monster by one real-time delta. `incomingHit` applies once per
 * call (like heroSkill.ts/heroCombat.ts's convention — no fixed-tick
 * accumulator, unlike monsterSim.ts's 30fps-tick model; this module follows
 * the newer continuous-deltaMs convention already used by heroCombat.ts and
 * heroSkill.ts).
 */
export function advanceMonsterBehavior(
  state: MonsterBehaviorState,
  spec: MonsterBehaviorSpec,
  bounds: MonsterPatrolBounds,
  target: MonsterBehaviorTarget,
  incomingHit: MonsterBehaviorHit | null,
  deltaMs: number,
  random: () => number = Math.random,
): MonsterBehaviorEvent[] {
  const events: MonsterBehaviorEvent[] = []
  const safeDelta = Math.max(0, deltaMs)

  if (state.skillCooldownMs > 0) state.skillCooldownMs = Math.max(0, state.skillCooldownMs - safeDelta)
  if (incomingHit) events.push(...applyHit(state, spec, incomingHit))

  switch (state.mode) {
    case 'gone':
      return events

    case 'dead':
      state.modeElapsedMs += safeDelta
      if (state.modeElapsedMs >= spec.deadDurationMs) {
        state.mode = 'gone'
        events.push({ type: 'death', x: state.x, y: state.y })
      }
      return events

    case 'hurt':
      state.modeElapsedMs += safeDelta
      if (state.modeElapsedMs >= spec.hurtDurationMs) {
        state.mode = 'patrol'
        state.decisionAccMs = 0
      }
      return events

    case 'attack': {
      const move = state.activeMove === 'skill' ? spec.skill!.move : spec.normalMove
      state.modeElapsedMs += safeDelta
      if (!state.spawned && state.modeElapsedMs >= move.spawnAtMs) {
        state.spawned = true
        events.push({ type: 'attack-spawn', x: state.x, y: state.y, spawn: buildSpawn(state, move, target) })
      }
      if (state.modeElapsedMs >= move.durationMs) {
        state.mode = 'chase'
        state.activeMove = undefined
        state.spawned = false
      }
      return events
    }
  }

  // patrol / chase: target acquisition uses full 2D distance against
  // alertRange (BaseMonster.as:465); once acquired, the attack-range check
  // below is x-only (BaseMonster.as:369).
  const dx = target.x - state.x
  const dy = target.y - state.y
  const hasTarget = target.isAlive && Math.hypot(dx, dy) <= spec.alertRange

  if (!hasTarget) {
    state.mode = 'patrol'
    state.decisionAccMs += safeDelta
    if (state.decisionAccMs >= spec.decisionIntervalMs) {
      state.decisionAccMs -= spec.decisionIntervalMs
      state.waiting = random() < spec.waitRateWhenNoTarget
    }
    if (state.waiting) return events
    if (state.x <= bounds.patrolMin) state.patrolDir = 1
    else if (state.x >= bounds.patrolMax) state.patrolDir = -1
    state.facing = state.patrolDir
    state.x += state.patrolDir * spec.speed * (safeDelta / 1000)
    return events
  }

  state.mode = 'chase'
  state.facing = dx < 0 ? -1 : 1
  const xDist = Math.abs(dx)

  if (spec.skill && xDist < spec.skill.triggerRange && state.skillCooldownMs <= 0) {
    startAttack(state, 'skill')
    state.skillCooldownMs = spec.skill.cooldownMs
    events.push({ type: 'attack-start', x: state.x, y: state.y })
    return events
  }

  state.decisionAccMs += safeDelta
  const decide = state.decisionAccMs >= spec.decisionIntervalMs
  if (decide) state.decisionAccMs -= spec.decisionIntervalMs

  if (xDist <= spec.attackRange) {
    if (decide && random() <= spec.normalAttackRate) {
      startAttack(state, 'normal')
      events.push({ type: 'attack-start', x: state.x, y: state.y })
    }
    return events
  }

  state.x += Math.sign(dx) * spec.speed * (safeDelta / 1000)
  return events
}

// ============================================================
// Behavior 1: Monster3 — 巫鹰 (L1 arena boss).
//
// CORRECTED (behavior-wiring pen, tasks/audit-numbers-report.md §6): this spec
// started as a straight port of kagami's
// vendor/kagami-phaser/src/systems/Monster3System.ts (Monster3Tuning), but an
// independent audit found kagami's tuning constants are NOT the real AS3
// values for this project's own vendored SWF (hp 926 vs real 300, and several
// other fields below also diverged once checked). Re-decompiled directly from
// `export.monster.Monster3` in 打开我开始玩.swf (this port's own ffdec
// decompile, the same file Monster7/Monster13 below already cite), reading
// the `gc.curStage==1 && gc.curLevel==1` boss branch (Monster3 is also a much
// weaker non-boss grunt on other stages — not modeled here, this spec is
// L1-boss-only):
//   hp = 5*60 = 300, def = 6, horizenSpeed = 3 (px/frame), attackRange = 250,
//   alertRange = 1000 (this one already matched kagami), boss-branch
//   probability = 1 (-> normalAttackRate; matches data/levels/level1.ts's own
//   monster3 MonsterStats, which already carried the correct AS3 numbers —
//   only this file's independent copy was stale).
//   hit1: attackBackInfoDict = {power:14, attackKind:"physics",
//   attackBackSpeed:[6,-5], attackInterval:999, hitMaxCount:99}. Animation
//   bank4 (hit1, setFrameStopCount row index 4, confirmed against this
//   project's own monster3.json) = [2,2,2,1,1,7] (6 cells, 15 ticks total);
//   enterFrameFunc fires doHi1() at cell index 3 / curFrameCount 1 ->
//   cumulative 2+2+2+1 = 7 ticks in. (This hit1 timing/reach also matches
//   systems/attackSpec.ts's independently-decompiled MONSTER_ATTACKS entry —
//   7/15 fraction, offset 105 — cross-confirming both decompiles.)
//   hit2: attackBackInfoDict = {power:7, attackKind:"magic",
//   attackBackSpeed:[-5,0], attackInterval:4, hitMaxCount:99}. Animation
//   bank5 (hit2) = [2,2,1,26] (4 cells, 31 ticks total); enterFrameFunc fires
//   doHi2() at cell index 3 / curFrameCount 26 -> the very last tick (31 of
//   31) — spawnAtMs below fires one tick early (30 ticks) to stay strictly
//   inside [0, durationMs), the same convention Monster13 below uses for its
//   own last-tick trigger.
//   hit1/hit2 spawn offsets (105,-60) / (155,-30) already matched kagami's
//   numbers (kept as-is). Hitbox width/height and activeDurationMs are NOT in
//   Monster3's own constructor/doHi*() — the bullet's (SpecialEffectBullet)
//   own on-screen geometry/lifetime lives in a class not decompiled this
//   pass — kept as kagami's placeholder geometry, still unverified (same
//   TODO-verify status Monster7's hitbox size already carries below).
//   hit2's skill-gate shape (triggerRange/cooldownMs, a deterministic
//   range+cooldown check) stays kagami's own simplified model, already flagged
//   as an accepted divergence from the real per-frame stochastic
//   BaseMonster.hasAttackTarget() roll in tasks/monster-behavior-report.md's
//   "简化/未实现项" — this pass only corrects numbers, not that design choice.
// ============================================================

export const Monster3Spec: MonsterBehaviorSpec = {
  id: 'monster3',
  source:
    "export.monster.Monster3 (gc.curStage==1&&curLevel==1 boss branch), 打开我开始玩.swf (this port's own ffdec decompile) " +
    '-- corrects kagami Monster3Tuning per tasks/audit-numbers-report.md §6, see file header',
  hp: 300, // was 926 (kagami) -- AS3 setHp(5*60)
  def: 6, // was 0 (kagami) -- AS3 protectedParamsObject.def
  speed: 3 * (1000 / TICK_MS), // was 240 (kagami) -- AS3 horizenSpeed=3 px/frame -> px/s
  attackRange: 250, // was 150 (kagami) -- AS3 attackRange
  alertRange: 1000, // unchanged -- AS3 alertRange already matched kagami's value
  hurtDurationMs: 15 * TICK_MS, // was 250ms (kagami) -- AS3 hurt bank [15]
  deadDurationMs: 15 * TICK_MS, // was 1000ms (kagami) -- AS3 dead bank [2,2,2,2,2,5] (15 ticks)
  decisionIntervalMs: 1000,
  normalAttackRate: 1, // was 0.42 (kagami) -- AS3 boss-branch probability=1 (matches level1.ts's monster3 stats)
  waitRateWhenNoTarget: 0.137, // BaseMonster.as:32 default; Monster3 does not override it.
  normalMove: {
    actionName: 'hit1',
    durationMs: 15 * TICK_MS, // was 500ms (kagami, coincidentally close) -- AS3 hit1 bank total (15 ticks)
    spawnAtMs: 7 * TICK_MS, // was 100ms (kagami) -- AS3 doHi1() fires at cumulative tick 7 (2+2+2+1)
    attack: {
      kind: 'hitbox',
      offsetX: 105, // AS3 doHi1(): this.x ± 105 -- matches kagami's number, kept
      offsetY: -60, // AS3 doHi1(): this.y - 60 -- matches kagami's number, kept
      width: 120, // kagami placeholder geometry -- SpecialEffectBullet's real hitbox size not decompiled this pass, TODO-verify
      height: 90, // same TODO-verify as width
      activeDurationMs: 380 - 100, // kagami placeholder active window -- not decompiled this pass, TODO-verify
      damage: 14, // was 40 (kagami) -- AS3 attackBackInfoDict.hit1.power
      attackKind: 'physics', // unchanged -- matches AS3 attackKind
      knockbackX: 6, // AS3 attackBackSpeed[0] -- matches kagami's number, kept
      knockbackY: -5, // AS3 attackBackSpeed[1] -- matches kagami's number, kept
      hitIntervalFrames: 999, // unchanged -- AS3 attackInterval matches kagami's number
      maxHits: 99, // was 1 (kagami) -- AS3 hitMaxCount
    },
  },
  skill: {
    move: {
      actionName: 'hit2',
      durationMs: 31 * TICK_MS, // was 800ms (kagami) -- AS3 hit2 bank total (31 ticks)
      spawnAtMs: 30 * TICK_MS, // was 200ms (kagami) -- AS3 doHi2() fires at the last tick (31 of 31), fired 1 tick early, see header
      attack: {
        kind: 'hitbox',
        offsetX: 155, // AS3 doHi2(): this.x ± 155 -- matches kagami's number, kept
        offsetY: -30, // AS3 doHi2(): this.y - 30 -- matches kagami's number, kept
        width: 140, // kagami placeholder geometry, TODO-verify (see header)
        height: 100, // same TODO-verify
        activeDurationMs: 650 - 200, // kagami placeholder active window, TODO-verify (see header)
        damage: 7, // was 18 (kagami) -- AS3 attackBackInfoDict.hit2.power
        attackKind: 'magic', // unchanged -- matches AS3 attackKind
        knockbackX: -5, // AS3 attackBackSpeed[0] -- matches kagami's number, kept
        knockbackY: 0, // AS3 attackBackSpeed[1] -- matches kagami's number, kept
        hitIntervalFrames: 4, // was 999 (kagami) -- AS3 attackInterval
        maxHits: 99, // was 1 (kagami) -- AS3 hitMaxCount
      },
    },
    triggerRange: 200, // kept -- kagami's simplified deterministic gate, see header (not a direct single AS3 field)
    initialCooldownMs: 2000, // kept -- same simplification
    cooldownMs: 4000, // kept -- same simplification
  },
}

// ============================================================
// Behavior 2: Monster7 — this port's own reverse-engineering.
// Source: export.monster.Monster7 in
// vendor/zmxy_res/.../打开我开始玩.swf (decompiled via ffdec-cli
// `-selectclass export.monster.Monster7 -export script`).
//
// hit1: attackBackInfoDict = { hitMaxCount:99, attackBackSpeed:[6,-5],
// attackInterval:4, power:14, attackKind:"physics" }. doHi1() spawns
// SpecialEffectBullet("Monster7Bullet1") at (x ∓ 80, y - 86) — self-anchored,
// not aimed/traveling. hit1 animation: setFrameStopCount row4
// [2,2,2,4] (4 cells); enterFrameFunc fires doHi1() at cell index 2, internal
// tick 2, i.e. after (2+2+2)=6 ticks = 6*TICK_MS ≈ 200ms into the ~10-tick
// (~333ms) swing. activeDurationMs below re-purposes the swing's own last
// two cells (2+4=6 ticks ≈ 200ms) as the hitbox's post-spawn lifetime.
//
// Confirmed-but-omitted: Monster7.beforeSkill1Start() returns true when a
// target is within 200px, but Monster7 never overrides releSkill1() — per
// BaseMonster.hasAttackTarget() (read directly, see file header), this means
// a per-frame 1-in-4 random roll can still fire the empty base releSkill1()
// once every ~skillCD[1] (150 frames ≈ 5s, BaseMonster.as default, since
// Monster7 never touches the base `skillCD` field itself — the `skillCD1`
// it does set in its own constructor is a separate, unread field). This is a
// real, confirmed original mechanic, but it has zero observable effect (no
// attack, no animation, no state change) — implementing it would only add
// silent no-op bookkeeping, so it is intentionally NOT ported. See report.
// ============================================================

export const Monster7Spec: MonsterBehaviorSpec = {
  id: 'monster7',
  source: 'export.monster.Monster7, 打开我开始玩.swf (this port\'s own ffdec decompile)',
  hp: 150,
  def: 4,
  speed: 3 * (1000 / TICK_MS), // horizenSpeed=3 px/frame -> px/s
  attackRange: 250,
  alertRange: 1000,
  hurtDurationMs: 15 * TICK_MS, // hurt row: 1 cell, stopCount 15
  deadDurationMs: (2 + 2 + 2 + 2 + 7) * TICK_MS, // dead row: stopCounts [2,2,2,2,7]
  decisionIntervalMs: 1000,
  normalAttackRate: 0.3, // BaseMonster.as:28 default; Monster7 does not override it.
  waitRateWhenNoTarget: 0.137,
  normalMove: {
    actionName: 'hit1',
    durationMs: (2 + 2 + 2 + 4) * TICK_MS,
    spawnAtMs: (2 + 2 + 2) * TICK_MS,
    attack: {
      kind: 'hitbox',
      offsetX: 80,
      offsetY: -86,
      width: 170, // Monster7's own colipse is a plain ObjectBaseSprite (no explicit size found); reused the sheet cell size (150) plus a small margin as a TODO-verify placeholder box.
      height: 150,
      activeDurationMs: (2 + 4) * TICK_MS,
      damage: 14,
      attackKind: 'physics',
      knockbackX: 6,
      knockbackY: -5,
      hitIntervalFrames: 4,
      maxHits: 99,
    },
  },
}

// ============================================================
// Behavior 3: Monster13 — this port's own reverse-engineering.
// Source: export.monster.Monster13 in 打开我开始玩.swf, confirmed level-3
// roster via `-export symbolclass` on out_res/3.swf.
//
// hit1: attackBackInfoDict = { hitMaxCount:1, attackBackSpeed:[6,-5],
// attackInterval:999, power:68, attackKind:"magic" }. doHi1() spawns
// EnemyMoveBullet("Monster13Bullet1") at (x ∓ 82, y - 21), aimed via
// AUtils.GetNextPointByTwoObj(this, curAttackTarget) (a unit direction
// vector), `setSpeed(dir.x*3, dir.y*3)`, `setAddSpeed(dir.x, dir.y)`,
// `setDistance(1000)` — i.e. initial speed 3 px/frame, constant acceleration
// 1 px/frame^2 along that SAME fixed initial direction (no `setMoveTarget`
// call, so EnemyMoveBullet's homing re-aim branch never runs), expires after
// 1000px of travel. Converted to continuous units: speed_continuous =
// speed_perFrame * (1000/TICK_MS) [px/s], accel_continuous = accel_perFrame *
// (1000/TICK_MS) [px/s^2] (acceleration compounds once per tick, not once per
// tick^2, so it scales by FPS not FPS^2).
//
// hit1 animation: setFrameStopCount row3 (hit1) = [2,2,6] (3 cells);
// enterFrameFunc fires doHi1() at cell index 2, internal tick 6 — i.e. at the
// very last tick of the whole swing (2+2+6=10 ticks). spawnAtMs below fires
// one tick early (9 ticks) to stay strictly inside [0, durationMs).
//
// isFly=true/graity=0 in the original (a hovering flyer, like Monster30 —
// see monsterSim.ts's own documented divergence for that monster). This spec
// keeps the same divergence: ground-anchored x/y instead of hover AI, since
// there is no flight system in this codebase yet. The projectile's aim still
// uses the real 2D offset (including y), so a level author placing this
// monster above the player still gets a genuinely angled shot.
// ============================================================

const FPS = 1000 / TICK_MS

export const Monster13Spec: MonsterBehaviorSpec = {
  id: 'monster13',
  source: 'export.monster.Monster13, 打开我开始玩.swf (this port\'s own ffdec decompile)',
  hp: 5000,
  def: 14,
  speed: 3 * FPS,
  attackRange: 400,
  alertRange: 700,
  hurtDurationMs: 15 * TICK_MS,
  deadDurationMs: (2 + 2 + 6) * TICK_MS, // dead row: stopCounts [2,2,6] (3 cells)
  decisionIntervalMs: 1000,
  normalAttackRate: 0.3, // BaseMonster.as:28 default; Monster13 does not override it.
  waitRateWhenNoTarget: 0.137,
  normalMove: {
    actionName: 'hit1',
    durationMs: (2 + 2 + 6) * TICK_MS,
    spawnAtMs: (2 + 2 + 5) * TICK_MS, // one tick before the true trigger, to land strictly inside [0, durationMs)
    attack: {
      kind: 'projectile',
      offsetX: 82,
      offsetY: -21,
      speed: 3 * FPS,
      accel: 1 * FPS,
      maxDistance: 1000,
      damage: 68,
      attackKind: 'magic',
      knockbackX: 6,
      knockbackY: -5,
      hitIntervalFrames: 999,
      maxHits: 1,
    },
  },
}

// ============================================================
// Skill overlay: lets a boss that already runs on monsterSim.ts's own state
// machine (MonsterState -- hp/patrol/chase/hit1/hurt/death, which
// level.ts's isBossDead/tryClearArena, the boss HP bar, and several
// BattleScene shell test hooks all already depend on) gain a SECOND,
// real-AS3-sourced special attack (Monster3's hit2 is the first consumer)
// WITHOUT replacing that state machine -- MonsterState and
// MonsterBehaviorState above are not structurally compatible (different
// required fields, resolvedAttackIds is number[] vs string[]), so running a
// boss through advanceMonsterBehavior instead would mean re-deriving all of
// the above from scratch. This overlay is a small, independent, boss-position
// -aware ticker BattleScene can drive alongside its own advanceMonster call
// (freezing the latter while the overlay is mid-cast, exactly like
// monsterSim's own 'attack' mode already holds position) -- see
// tasks/behavior-wiring-report.md for the wiring writeup.
// ============================================================

export interface SkillOverlayState {
  cooldownMs: number
  active: { elapsedMs: number; hitApplied: boolean } | null
}

export function createSkillOverlayState(gate: MonsterSkillGate): SkillOverlayState {
  return { cooldownMs: gate.initialCooldownMs, active: null }
}

/** hitstun-triad pen (blue-team catch, tasks/review-blue-findings.md): `x/y`
 * must be the host's RENDERED VISUAL CENTER (BattleScene's
 * `monsterVisualCenter()` -- state.x/y + the species' own render offset*
 * scale), not its bare sim state.x/y. This project has no extracted
 * per-pixel AS3 `colipse` hit-test art, so every hit-test box is defined to
 * live in visual-center space (matching what the player actually sees
 * overlapping) -- the hero hurtbox this spawn gets tested against
 * (BattleScene's `heroVisualCenter()`) already lives there, and a caller
 * passing bare state.x/y here would silently reintroduce the exact
 * render-vs-hitbox mismatch this pen fixed everywhere else. */
export interface SkillOverlayHost {
  x: number
  y: number
  facing: -1 | 1
}

export interface SkillOverlayEvent {
  type: 'attack-start' | 'attack-spawn' | 'done'
  spawn?: SpawnedHitbox
}

/** Turn a skill move's hitbox spec into world-space spawn data, mirroring
 * `buildSpawn`'s hitbox branch above but for a host tracked entirely by the
 * caller (a monsterSim MonsterState) instead of this module's own
 * MonsterBehaviorState. Only hitbox moves are supported -- no boss skill uses
 * a projectile move yet. */
export function buildOverlayHitboxSpawn(move: MonsterAttackMove, host: SkillOverlayHost): SpawnedHitbox {
  const attack = move.attack
  if (attack.kind !== 'hitbox') throw new Error('buildOverlayHitboxSpawn: only hitbox skill moves are supported')
  return {
    kind: 'hitbox',
    actionName: move.actionName,
    x: host.x + host.facing * attack.offsetX,
    y: host.y + attack.offsetY,
    width: attack.width,
    height: attack.height,
    activeDurationMs: attack.activeDurationMs,
    damage: attack.damage,
    attackKind: attack.attackKind,
    knockbackX: attack.knockbackX * host.facing,
    knockbackY: attack.knockbackY,
    hitIntervalFrames: attack.hitIntervalFrames,
    maxHits: attack.maxHits,
  }
}

/**
 * Advance a skill overlay by one frame. `xDist` is the host-to-hero x
 * distance (mirrors this module's own attackRange/triggerRange convention,
 * x-only); `canTrigger` gates whether a NEW cast may start this frame --
 * BattleScene should pass `true` only while the host's own monsterSim mode is
 * 'chase' (an acquired target, not already mid its own hit1/hurt/dead),
 * mirroring 巫鹰's real `beforeSkill1Start()` requiring an acquired
 * `curAttackTarget`. While `active` is truthy the caller should skip its own
 * advanceMonster tick for the host (hold position + force the 'hit2'-style
 * action for rendering) until a 'done' event fires.
 */
export function advanceSkillOverlay(
  overlay: SkillOverlayState,
  gate: MonsterSkillGate,
  host: SkillOverlayHost,
  xDist: number,
  canTrigger: boolean,
  deltaMs: number,
): SkillOverlayEvent[] {
  const events: SkillOverlayEvent[] = []
  const safeDelta = Math.max(0, deltaMs)
  if (overlay.cooldownMs > 0) overlay.cooldownMs = Math.max(0, overlay.cooldownMs - safeDelta)

  if (overlay.active) {
    overlay.active.elapsedMs += safeDelta
    if (!overlay.active.hitApplied && overlay.active.elapsedMs >= gate.move.spawnAtMs) {
      overlay.active.hitApplied = true
      events.push({ type: 'attack-spawn', spawn: buildOverlayHitboxSpawn(gate.move, host) })
    }
    if (overlay.active.elapsedMs >= gate.move.durationMs) {
      overlay.active = null
      events.push({ type: 'done' })
    }
    return events
  }

  if (canTrigger && overlay.cooldownMs <= 0 && xDist < gate.triggerRange) {
    overlay.active = { elapsedMs: 0, hitApplied: false }
    overlay.cooldownMs = gate.cooldownMs
    events.push({ type: 'attack-start' })
  }
  return events
}
