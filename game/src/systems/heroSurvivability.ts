// Hero survivability helpers around the recovered original level curves.
//
// ## Why this file exists
//
// progression.ts carries the original per-level maxHp/def curve. Those values
// pass through at 1x here; equipment bonuses remain additive in heroIdentity.
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
import { getLevelStats, type HeroId } from './progression'

// ---------- HP / physical-defense curve passthrough ----------

/** Effective maxHp = level-curve maxHp * this, BEFORE crafted-equipment hp is
 * added on top by heroIdentity.syncHeroEquipment. */
export const SURVIVABILITY_MAXHP_SCALE = 1

/** Effective base def = level-curve def * this, BEFORE crafted-equipment def is
 * added on top by heroIdentity. */
export const SURVIVABILITY_DEF_SCALE = 1

/** Level-curve maxHp, rounded so the combat pool stays integer. */
export function heroEffectiveMaxHp(baseMaxHp: number): number {
  return Math.round(baseMaxHp * SURVIVABILITY_MAXHP_SCALE)
}

/** Level-curve def; crafted-equipment def is added by the caller. */
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
