// Unified hero identity host: the single Phaser-independent state object that
// the three ported combat systems hang off of, so BattleScene holds one thing
// instead of three loose pieces that can drift out of sync.
//
//  - progression.ts owns level/exp and the per-level stat curve (maxHp / maxMp
//    / atk / def).
//  - heroCombat.ts owns the live hp, hurt/death state machine, i-frames and
//    respawn.
//  - equipment.ts + effects.ts contribute atk/def (and other stat) bonuses on
//    top of the level curve.
//
// The invariant this module maintains is that the level curve DRIVES the combat
// model's maxHp (and the identity's maxMp): createHeroIdentity seeds combat.maxHp
// from getLevelStats, and gainHeroExp grows it on level-up (healing the growth
// delta). heroCombat's own default maxHp (120) is overwritten — it only ever
// knew a single hardcoded pool, whereas here the pool is level-derived.
//
// Nothing here touches heroSim.ts's HeroState (movement/combo). That stays a
// separate object per its own module note (it has no hp/atk/level concept); the
// scene composes the two side by side and passes HeroState as the HeroPosition
// for knockback.

import {
  HeroCombatModel,
  HeroCombatEvent,
  HeroCombatBounds,
  HeroPosition,
  HeroHit,
  createHeroCombat,
  applyHeroDamage,
  updateHeroCombat,
  isHeroCombatDead,
  isHeroInvulnerable,
} from './heroCombat'
import {
  HeroId,
  HeroProgressionState,
  HeroLevelStats,
  GainExpResult,
  createProgression,
  gainExp,
  getLevelStats,
} from './progression'
import type { Equipment } from './equipment'
import { equippedList } from './equipment'
import { applyEquipStats, BaseStats } from './effects'
import {
  heroEffectiveMaxHp,
  heroEffectiveDef,
  heroMagicDefFraction,
} from './heroSurvivability'

export interface HeroIdentityState {
  heroId: HeroId
  progression: HeroProgressionState
  combat: HeroCombatModel
  mp: number
  maxMp: number
}

/** Fresh identity at `level` for `heroId`, HP/MP full at the level curve. */
export function createHeroIdentity(heroId: HeroId, level = 1): HeroIdentityState {
  const progression = createProgression(heroId, level)
  const combat = createHeroCombat()
  const stats = getLevelStats(heroId, progression.level)
  // Adapted: the growth-substitute layer (heroSurvivability.ts) scales the
  // original level-curve maxHp — the original game's equipment/gem HP growth
  // this project lacks. progression.ts's curve numbers are untouched.
  const maxHp = heroEffectiveMaxHp(stats.maxHp)
  combat.maxHp = maxHp
  combat.hp = maxHp
  return { heroId, progression, combat, mp: stats.maxMp, maxMp: stats.maxMp }
}

/** Level-curve base stats (before any equipment bonus). */
export function heroBaseStats(id: HeroIdentityState): HeroLevelStats {
  return getLevelStats(id.heroId, id.progression.level)
}

/** Full stats = level base + every equipped item's stat effects. */
export function heroStats(id: HeroIdentityState, eq: Equipment): BaseStats {
  const lvl = heroBaseStats(id)
  // Adapted: def is scaled by the growth-substitute layer here at the
  // aggregation seam (heroSurvivability.ts), THEN crafted-equipment def is
  // added on top unscaled — real gear is additive, the substitute layer is the
  // stand-in for the missing gem growth. atk/hp/mp/crit are not scaled.
  const base: BaseStats = { atk: lvl.atk, def: heroEffectiveDef(lvl.def), hp: 0, mp: 0, crit: 0 }
  return applyEquipStats(base, equippedList(eq))
}

/** Hero magic-def as a 0-1 fraction at the current level (growth curve in
 * heroSurvivability.ts). Feed this into heroScale.resolveIncomingHeroDamage's
 * `heroMagicDefFraction` param when wiring a magic monster hit — the two
 * deadliest boss hits in the game are magic, and that param was previously
 * hardcoded 0 at the BattleScene call site. */
export function heroMagicDef(id: HeroIdentityState): number {
  return heroMagicDefFraction(id.progression.level)
}

export function heroTotalAtk(id: HeroIdentityState, eq: Equipment): number {
  return heroStats(id, eq).atk
}

export function heroTotalDef(id: HeroIdentityState, eq: Equipment): number {
  return heroStats(id, eq).def
}

/**
 * Award exp and, on any level-up, grow the derived pools. maxHp/maxMp move to
 * the new level's curve; the growth delta is added to the current values so a
 * level-up feels like a partial heal (kagami levels up mid-fight, not at a
 * rest point). A dead hero's hp is left alone — respawn fills it to the new
 * (already grown) maxHp.
 */
export function gainHeroExp(id: HeroIdentityState, amount: number): GainExpResult {
  const result = gainExp(id.progression, amount)
  if (result.levelsGained > 0) {
    // Growth delta measured on the SCALED pool so the mid-fight level-up heal
    // matches the (scaled) maxHp jump, not the raw-curve delta.
    const maxHpBefore = heroEffectiveMaxHp(result.statsBefore.maxHp)
    const maxHpAfter = heroEffectiveMaxHp(result.statsAfter.maxHp)
    const hpGain = Math.max(0, maxHpAfter - maxHpBefore)
    const mpGain = Math.max(0, result.statsAfter.maxMp - result.statsBefore.maxMp)
    id.combat.maxHp = maxHpAfter
    if (!isHeroCombatDead(id.combat)) {
      id.combat.hp = Math.min(id.combat.maxHp, id.combat.hp + hpGain)
    }
    id.maxMp = result.statsAfter.maxMp
    id.mp = Math.min(id.maxMp, id.mp + mpGain)
  }
  return result
}

/** Resolve one incoming hit against the hero's combat model. Thin pass-through
 * to heroCombat so callers work through the identity host, not its internals. */
export function damageHero(id: HeroIdentityState, hit: HeroHit, timeMs: number): HeroCombatEvent[] {
  return applyHeroDamage(id.combat, hit, timeMs)
}

/** Per-frame upkeep (hurt timeout, i-frame expiry, knockback, auto-respawn). */
export function updateHeroIdentity(
  id: HeroIdentityState,
  position: HeroPosition,
  bounds: HeroCombatBounds,
  timeMs: number,
  deltaMs: number,
  respawnX?: number,
): HeroCombatEvent[] {
  return updateHeroCombat(id.combat, position, bounds, timeMs, deltaMs, respawnX)
}

export function isHeroDead(id: HeroIdentityState): boolean {
  return isHeroCombatDead(id.combat)
}

export function isHeroInvincible(id: HeroIdentityState, timeMs: number): boolean {
  return isHeroInvulnerable(id.combat, timeMs)
}
