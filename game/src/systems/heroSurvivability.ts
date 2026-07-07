// Explicit "growth-substitute layer" (养成替代层) for hero survivability.
//
// ## Why this file exists
//
// progression.ts carries the ORIGINAL per-level maxHp/def curve, recovered
// verbatim from the client (see its header: 移植 > 重写). That curve is
// faithful but thin on its own: at the natural level a player reaches each
// stage boss, 悟空's bare pool is 1-2 hits from death against L2-L4 bosses
// (二郎神 hit2 1299-magic, 邪.悟空 hit6 1658-physics — see
// tasks/hero-scale-report.md's viability tables, which showed 0-1-hit kills).
//
// The original game closed that gap with a DEEP equipment + gem (宝石) growth
// layer that multiplied the hero's effective HP/defense into the thousands.
// This project has the furnace (crafted equipment, additive atk/def) but NOT
// the gem layer, so the hero has no equivalent for the bulk of that
// survivability. This module supplies it as an EXPLICIT, single-point,
// reversible multiplier applied at the heroIdentity aggregation seam — NOT by
// editing progression.ts's original curve numbers.
//
// ## Adapted (not original): the scale + the magic-def curve
//
// SURVIVABILITY_MAXHP_SCALE / SURVIVABILITY_DEF_SCALE stand in for the missing
// equipment/gem HP+defense growth. When a real gem system lands, drop both
// back to 1 and this whole layer disappears with a single edit — the original
// progression.ts curve is untouched underneath.
//
// heroMagicDefFraction is a genuinely NEW hero stat. The original client's
// base.BaseHero.countHurt() already routes magic hits through
// `power * (1 - magicDef/100)` (see heroScale.ts header), i.e. the original
// engine HAS a magic-resist channel — but this project never gave 悟空 a
// magicDef value, so resolveIncomingHeroDamage was always called with 0. The
// two deadliest boss hits in the game (二郎神 hit2 1299, 邪.悟空 hit9 1000)
// are both magic; giving 悟空 a real magic-def growth restores the original's
// "dodge/resist the nuke, tank the physical" tactical split rather than just
// inflating a flat HP pool.
//
// ## Tuning basis (judgment-first, per tasks/hero-survivability-brief.md)
//
// The scale + curve are reverse-derived from a fixed acceptance band, NOT
// picked for round numbers (they happen to land on the brief's ×3.5 / ×2
// prediction). At each boss's "到关等级" (the level a player is actually at
// when the fight becomes winnable — see report for the exp-economy + DPS-gate
// derivation) with mid-tier crafted gear, the boss's hardest single hit should
// take 25-40% of the hero's effective HP and its basic attack 5-10%. The
// reference boss the band is anchored on is 二郎神 (its 1299 magic nuke), which
// lands at ~40%/7%. Exact figures and the two structural out-of-band bosses
// (多闻天王 under, 邪.悟空's basic over) are pinned in
// tests/heroSurvivability.test.ts and explained in the report.

import { getLevelStats, type HeroId } from './progression'

// ---------- HP / physical-defense growth-substitute multipliers ----------

/** Effective maxHp = level-curve maxHp * this. Stands in for the missing
 * equipment/gem HP layer (equipment hp is not wired into the combat pool in
 * this build, so this multiplier absorbs that contribution too). Set to 1 when
 * a real gem system lands. */
export const SURVIVABILITY_MAXHP_SCALE = 3.5

/** Effective base def = level-curve def * this, BEFORE crafted-equipment def is
 * added on top (that stays additive and unscaled — it's real gear, not the
 * substitute layer). Set to 1 when a real gem system lands. */
export const SURVIVABILITY_DEF_SCALE = 2.0

/** Level-curve maxHp scaled by the growth-substitute layer. Rounded so the
 * combat pool stays integer for non-悟空 curves (e.g. Role5's *49 base). */
export function heroEffectiveMaxHp(baseMaxHp: number): number {
  return Math.round(baseMaxHp * SURVIVABILITY_MAXHP_SCALE)
}

/** Level-curve def scaled by the growth-substitute layer (crafted-equipment def
 * is added by the caller, on top of this). */
export function heroEffectiveDef(baseDef: number): number {
  return Math.round(baseDef * SURVIVABILITY_DEF_SCALE)
}

// ---------- magic-defense growth curve (new hero stat) ----------
//
// Piecewise-linear in level, clamped to [0, cap]:
//   L<=10 baseline anchor 10%, +1.25%/level, reaching 35% at L30 and the 50%
//   cap at L42. Below the anchor it decays to 0 (a level-1 hero has no magic
//   resist). Returns a 0-1 FRACTION (resolveIncomingHeroDamage's
//   heroMagicDefFraction param already expects a fraction, unlike the AS3
//   getMagicDef()'s raw 0-100).

/** Level at which the magic-def curve hits its baseline anchor value. */
export const HERO_MAGIC_DEF_ANCHOR_LEVEL = 10
/** Magic-def fraction at the anchor level. */
export const HERO_MAGIC_DEF_ANCHOR = 0.1
/** Magic-def fraction gained per level above/below the anchor. */
export const HERO_MAGIC_DEF_PER_LEVEL = 0.0125
/** Hard cap on magic-def fraction. */
export const HERO_MAGIC_DEF_CAP = 0.5

/** Hero magic-def as a 0-1 fraction at `level` (see curve note above). */
export function heroMagicDefFraction(level: number): number {
  const raw = HERO_MAGIC_DEF_ANCHOR + (level - HERO_MAGIC_DEF_ANCHOR_LEVEL) * HERO_MAGIC_DEF_PER_LEVEL
  return Math.min(HERO_MAGIC_DEF_CAP, Math.max(0, raw))
}

/** Convenience: effective maxHp for a hero id at a level, straight off the
 * curve + scale (used by the viability model / tests). */
export function heroEffectiveMaxHpAt(heroId: HeroId, level: number): number {
  return heroEffectiveMaxHp(getLevelStats(heroId, level).maxHp)
}

/** Convenience: effective BASE def (pre-equipment) for a hero id at a level. */
export function heroEffectiveBaseDefAt(heroId: HeroId, level: number): number {
  return heroEffectiveDef(getLevelStats(heroId, level).def)
}
