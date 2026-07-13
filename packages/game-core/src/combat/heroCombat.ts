// Phaser-independent hero HP/hurt/death model, ported from kagami's
// HeroCombatSystem.ts + CombatSystem.ts (scratchpad/zmxy-eval/kagami-phaser/src/systems/).
//
// Ported as-is (core state machine):
//  - hp/maxHp, state 'ready'|'hurt'|'dead', explicit hard invulnerability,
//    x-only knockback with exponential decay.
//  - Hit dedup so one attack instance only ever damages a target once
//    (kagami's CombatSystem.resolveHitOnce), inlined here in monsterSim's
//    style (a resolved-ids array on the target) instead of a separate shared
//    HitRegistry class, to match this codebase's existing convention
//    (monsterSim.ts already dedups per-target with `resolvedAttackIds`).
//
// Dropped (out of scope, no magic/role system yet): magic shields, magic
// invulnerability items, attack/crit buffs, flower/flag guards, per-role
// defense/knockback-immunity flags. None of those exist in this codebase yet;
// add them back onto HeroCombatModel if/when the corresponding systems land.
//
// Added (not in kagami's actual code — kagami only *documents* this in
// docs/reverse-engineering/combat-rules-index.md, its shipped
// HeroCombatSystem.ts never implements it):
//  - The "受击条" hit-meter mechanic (combat-rules-index.md:177-196): dense
//    hits accumulate a meter faster than sparse ones; once the meter exceeds
//    19 the hero gets `frameClips * 3` (30fps * 3 = 90 ticks = 3000ms)
//    protection and the meter resets to 0. This is what stops the hero being
//    juggled to death by fast attackers. The exact per-hit increment formula
//    is undocumented beyond "denser
//    hits add more, capped step of 3" (combat-rules-index.md:196) — the tiered
//    thresholds in hitMeterIncrement() below are a TODO-verify approximation
//    of that shape, not a recovered original formula.
//  - Respawn (createHeroCombat/resetHeroCombat plus death->respawn wiring):
//    kagami has no respawn flow at all (confirmed absent from
//    HeroCombatSystem.ts and combat-rules-index.md's explicit-punt list:
//    "复活装备、死亡 UI、失败流程不属于 VS-006"). This is original: on lethal
//    damage, schedule `respawnAtMs`; `updateHeroCombat` fires a full-heal
//    respawn (via resetHeroCombat) once that timer elapses and emits a
//    'respawn' event. Position is left untouched (respawn in place) unless
//    the caller passes `respawnX`, so BattleScene can choose level-start
//    coordinates without this module knowing about levels.

export type HeroCombatState = 'ready' | 'hurt' | 'dead'

export interface HeroCombatModel {
  hp: number
  maxHp: number
  state: HeroCombatState
  /** Hurt-pose end time; state reverts to 'ready' once timeMs reaches this. */
  hurtUntilMs: number
  /** Explicit hard-invulnerability end time; ordinary hurt does not set it. */
  invulnerableUntilMs: number
  /** 受击条: accumulates on every landed hit, resets to 0 once it trips the meter guard. */
  hitMeter: number
  /** Set once hitMeter trips; a second, longer invulnerability window. */
  meterInvulnerableUntilMs?: number
  /** Time of the last landed hit, for the density-based meter increment. */
  lastHitAtMs?: number
  knockbackVelocityX: number
  lastDamageEvent?: HeroHit
  /** Set on death; updateHeroCombat auto-respawns once timeMs reaches this. */
  respawnAtMs?: number
  /** Dedup keys (`${sourceId}:${attackId}`) already resolved against this hero. */
  resolvedHitIds: string[]
}

/** An incoming melee/attack instance targeting the hero. */
export interface HeroHit {
  /** Id of the attacking monster (or other source) instance. */
  sourceId: string
  /** Monotonic id of the source's current attack swing (dedup key component). */
  attackId: number
  damage: number
  /** Direction/magnitude multiplier; sign picks left/right (kagami convention). */
  knockbackX: number
}

export type HeroCombatEventType = 'hurt' | 'death' | 'respawn'
export interface HeroCombatEvent {
  type: HeroCombatEventType
}

/** Minimal structural position the combat system can knock back. Pass the
 * HeroState from heroSim.ts directly — it satisfies this shape as-is. */
export interface HeroPosition {
  x: number
}

export interface HeroCombatBounds {
  minX: number
  maxX: number
}

export const HeroCombatTuning = {
  maxHp: 120,
  hurtDurationMs: 260,
  knockbackPixelsPerSecond: 64,
  knockbackDecayPerSecond: 6,
  hitMeterThreshold: 19,
  // frameClips(30) * 3 @ 30fps = 90 ticks = 3000ms (combat-rules-index.md:189).
  hitMeterProtectionMs: 3000,
  // No original value exists (kagami has no respawn flow at all); chosen for
  // arcade feel — long enough to read as a death, short enough not to stall play.
  respawnDelayMs: 1500,
} as const

export function createHeroCombat(): HeroCombatModel {
  return {
    hp: HeroCombatTuning.maxHp,
    maxHp: HeroCombatTuning.maxHp,
    state: 'ready',
    hurtUntilMs: 0,
    invulnerableUntilMs: 0,
    hitMeter: 0,
    knockbackVelocityX: 0,
    resolvedHitIds: [],
  }
}

/** Full heal + clear all timers/dedup history. Used both for a fresh hero and
 * as the respawn building block. */
export function resetHeroCombat(hero: HeroCombatModel): void {
  hero.hp = hero.maxHp
  hero.state = 'ready'
  hero.hurtUntilMs = 0
  hero.invulnerableUntilMs = 0
  hero.hitMeter = 0
  hero.meterInvulnerableUntilMs = undefined
  hero.lastHitAtMs = undefined
  hero.knockbackVelocityX = 0
  hero.lastDamageEvent = undefined
  hero.respawnAtMs = undefined
  hero.resolvedHitIds = []
}

export function isHeroCombatDead(hero: HeroCombatModel): boolean {
  return hero.state === 'dead'
}

export function isHeroInvulnerable(hero: HeroCombatModel, timeMs: number): boolean {
  if (hero.state === 'dead') return false
  if (timeMs < hero.invulnerableUntilMs) return true
  if (hero.meterInvulnerableUntilMs !== undefined && timeMs < hero.meterInvulnerableUntilMs) {
    return true
  }
  return false
}

// TODO-verify: kagami's beAttackDoing() only documents "denser hits add more,
// capped step of 3" without the exact formula (combat-rules-index.md:196).
// This tiered approximation preserves that documented shape: hits within
// 200ms of the previous one add the full step, further apart add less, and
// the very first hit (no history yet) adds the baseline step.
function hitMeterIncrement(gapMs: number | undefined): number {
  if (gapMs === undefined) return 1
  if (gapMs <= 200) return 3
  if (gapMs <= 600) return 2
  return 1
}

function accumulateHitMeter(hero: HeroCombatModel, timeMs: number): void {
  const gapMs = hero.lastHitAtMs === undefined ? undefined : timeMs - hero.lastHitAtMs
  hero.lastHitAtMs = timeMs
  hero.hitMeter += hitMeterIncrement(gapMs)
  if (hero.hitMeter > HeroCombatTuning.hitMeterThreshold) {
    hero.meterInvulnerableUntilMs = timeMs + HeroCombatTuning.hitMeterProtectionMs
    hero.hitMeter = 0
  }
}

/**
 * Resolve one incoming hit against the hero. Dedups by (sourceId, attackId)
 * first — same as kagami's CombatSystem.resolveHitOnce — so a swing blocked by
 * explicit hard invulnerability is consumed and cannot retroactively land
 * once protection passes. Returns the events this call produced (empty if the
 * hit was a dup, or blocked by death/hard invulnerability).
 */
export function applyHeroDamage(
  hero: HeroCombatModel,
  hit: HeroHit,
  timeMs: number,
): HeroCombatEvent[] {
  if (hero.state === 'dead') return []

  const hitId = `${hit.sourceId}:${hit.attackId}`
  if (hero.resolvedHitIds.includes(hitId)) return []
  hero.resolvedHitIds.push(hitId)

  if (isHeroInvulnerable(hero, timeMs)) return []

  hero.hp = Math.max(0, hero.hp - Math.max(0, hit.damage))
  hero.lastDamageEvent = hit

  if (hero.hp <= 0) {
    hero.state = 'dead'
    hero.hurtUntilMs = 0
    hero.invulnerableUntilMs = Number.POSITIVE_INFINITY
    hero.knockbackVelocityX = 0
    hero.respawnAtMs = timeMs + HeroCombatTuning.respawnDelayMs
    return [{ type: 'death' }]
  }

  hero.state = 'hurt'
  hero.hurtUntilMs = timeMs + HeroCombatTuning.hurtDurationMs
  hero.knockbackVelocityX = hit.knockbackX * HeroCombatTuning.knockbackPixelsPerSecond

  accumulateHitMeter(hero, timeMs)

  return [{ type: 'hurt' }]
}

/**
 * Per-frame upkeep: hurt->ready timeout, meter-invulnerability timeout,
 * knockback integration + decay, and auto-respawn once a scheduled death's
 * `respawnAtMs` elapses. `position` is mutated in place for knockback and
 * (if `respawnX` is given) for the respawn teleport; pass heroSim's
 * HeroState directly. Returns emitted events ('respawn' only, currently).
 */
export function updateHeroCombat(
  hero: HeroCombatModel,
  position: HeroPosition,
  bounds: HeroCombatBounds,
  timeMs: number,
  deltaMs: number,
  respawnX?: number,
): HeroCombatEvent[] {
  if (hero.state === 'dead') {
    if (hero.respawnAtMs !== undefined && timeMs >= hero.respawnAtMs) {
      resetHeroCombat(hero)
      if (respawnX !== undefined) position.x = respawnX
      return [{ type: 'respawn' }]
    }
    return []
  }

  if (hero.meterInvulnerableUntilMs !== undefined && timeMs >= hero.meterInvulnerableUntilMs) {
    hero.meterInvulnerableUntilMs = undefined
  }

  if (hero.state === 'hurt' && timeMs >= hero.hurtUntilMs) {
    hero.state = 'ready'
  }

  if (hero.knockbackVelocityX === 0) return []

  const deltaSeconds = deltaMs / 1000
  position.x += hero.knockbackVelocityX * deltaSeconds
  position.x = Math.min(Math.max(position.x, bounds.minX), bounds.maxX)

  const decayFactor = Math.max(0, 1 - HeroCombatTuning.knockbackDecayPerSecond * deltaSeconds)
  hero.knockbackVelocityX *= decayFactor
  if (Math.abs(hero.knockbackVelocityX) < 1) hero.knockbackVelocityX = 0

  return []
}
