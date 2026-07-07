// Phaser-independent recovery of Role1's (悟空) original per-level growth
// curve, daily luck roll, and the heal-block gating rule (ERLANGSHEN_HP_REJECT)
// -- all decompiled directly from this project's own vendored SWF.
//
// ## Why this file exists
//
// heroScale.ts's report flagged that kagami got both the normal-attack
// formula (flat 30-34, no atk reference at all) and the skill-damage formula
// (~6.6x off a direct decompile) wrong, and raised the possibility that
// progression.ts's atk/maxHp curve -- also ported from kagami -- might be
// similarly unreliable. This file settles that question directly against the
// AS3 source rather than continuing to guess.
//
// ## Verdict: progression.ts's curve is EXACTLY correct, no change needed
//
// `export.hero.Role1.as`'s `upGrade()` (the function that actually runs on
// level-up) reads:
//
//   roleProperies.setSHHP(80 + 50 * (level - 1))
//   roleProperies.setBasePower(10 + 5 * (level - 1))
//   roleProperies.setSMMP(50 + 20 * (level - 1))
//   roleProperies.setDefense(2 + 2 * (level - 1))
//   // exp-to-next, tiered:
//   level < 7:  135 + 10 * (level - 1)
//   level < 13: 625 + 50 * (level - 7)
//   level < 19: 1950 + 100 * (level - 13)
//   else:       5000 + 5000 * (level - 19)
//
// This is byte-for-byte what `progression.ts`'s `getLevelStats`/
// `getExpToNextLevel` already implement (itself ported from kagami's
// ProgressionSystem.ts). Unlike the normal-attack and skill-damage systems,
// kagami's growth-curve port was faithful. `recoverRole1LevelStats`/
// `recoverExpToNextLevel` below are an INDEPENDENT re-derivation (not a
// re-export of progression.ts) so heroGrowth.test.ts's cross-check against
// progression.ts is a real verification, not a tautology. progression.ts is
// NOT modified by this task.
//
// Decompile command (same tool/SWF as heroScale.ts and monsterBehaviors.ts):
//   java -jar tools/ffdec/ffdec-cli.jar \
//     -selectclass export.hero.Role1,user.User,base.BaseRoleProperies,base.BaseHero \
//     -export script <out> "vendor/zmxy_res/.../打开我开始玩.swf"
// (Role1's `upLevel`/`upGrade` isn't reachable via `-selectclass export.hero.Role1`
// alone in every ffdec pass -- it was found via a full unfiltered
// `-export script` of all 446 classes in the SWF, then grepping for
// `setBasePower(` callers, since neither BaseHero.as nor BaseRoleProperies.as
// contain the actual per-level formula themselves -- only Role1.as's own
// `upGrade()` override does.)
//
// ## Daily luck (the `luck` term in heroScale.ts's `calculateHurt`)
//
// `user/User.as`'s `setTadayLuckValue()` (~line 792-804) rolls a NEW
// `luckData` once per calendar day (called when the save's stored date
// doesn't match today's date; otherwise the saved value carries over
// unchanged) -- NOT a per-level growth stat, and NOT equipment-derived
// despite equipment items also being able to set it directly (`setLuckData`,
// used elsewhere for save-load and item effects). The roll's range widens in
// three level tiers:
//
//   level <= 4:  1 + round(random() * 4)   -> [1, 5]
//   level 5-10:  1 + round(random() * 9)   -> [1, 10]
//   level > 10:  1 + round(random() * 19)  -> [1, 20]
//
// At most +20 damage variance on top of atk values in the hundreds-to-
// thousands range (see heroScale.ts's viability table) -- i.e. this is
// genuinely minor noise, not a meaningful balancing lever. heroScale.ts's
// default of `luck: 0` was a reasonable simplification; this file now gives
// the option to model it precisely instead of guessing.
//
// ## Heal-block gating (ERLANGSHEN_HP_REJECT)
//
// `base.BaseRoleProperies.as`'s `setHHP(newValue)` (~line 745-769,
// cross-referenced against tasks/level-pipeline-report.md's own Erlangshen
// writeup):
//
//   if (HHP3 != 0 && newValue > getHHP()) {
//     if (curAddEffect && curAddEffect.getBuffByName(ERLANGSHEN_HP_REJECT)) {
//       return  // the entire HP write is silently dropped, no partial heal
//     }
//   }
//   // ... otherwise write newValue, then clamp to [0, maxHp]
//
// i.e. the block is entirely one-directional: HP DECREASES (damage) are
// never affected, only attempts to INCREASE current HP above its current
// value are dropped -- confirmed identical to level-pipeline-report.md's
// description, now with the exact source condition.
//
// ## Known heal sources (recorded, not exhaustively resolved -- secondary to
// this task's main growth-curve mandate)
//
// - `export.magicWeapon/MagicRing.as:62`: `cureHp(getSHHP() * ringLevel)` --
//   heals `maxHp * ringLevel`. Since `setHHP()` always clamps the result to
//   `getSHHP()` (maxHp) regardless of how much was requested, ANY ring level
//   >= 1 already heals to full; there is no "partial ring heal" case.
// - `export.pack/PackThings.as:~561-575`: "wpsmdN" revival/immortality pills
//   have a tiered per-item-type usage cap -- pill tier N (parsed from its
//   item-name suffix digit) may be used up to N+1 times per some reset window
//   before the game shows "该种丹药服用已经到上限" (usage limit reached).
//   The exact HP-restore amount per use was NOT resolved in this pass -- it
//   would require tracing into `MyEquipObj`'s per-item data table, which is
//   out of scope for this task's "顺带查" (secondary) ask on healing. Recorded
//   as TODO-verify, not invented.
// - No plain flat "drink potion, heal X HP" consumable was found in the
//   scope searched (`PackThings.as`, `CureHpQueue.as` -- the latter turned
//   out to be purely a floating-damage-number DISPLAY queue, not a heal-
//   amount source). Regular HP potions likely exist as data-driven items
//   elsewhere in the item table this pass didn't fully trace.

export interface Role1LevelStats {
  maxHp: number
  maxMp: number
  atk: number
  def: number
}

/** Source: export.hero.Role1.as upGrade(). Independent re-derivation (not a
 * re-export of progression.ts) so tests can cross-check the two agree. */
export function recoverRole1LevelStats(level: number): Role1LevelStats {
  const levelOffset = Math.max(1, Math.floor(level)) - 1
  return {
    maxHp: 80 + 50 * levelOffset,
    maxMp: 50 + 20 * levelOffset,
    atk: 10 + 5 * levelOffset,
    def: 2 + 2 * levelOffset,
  }
}

/** Source: export.hero.Role1.as upGrade()'s exp branch. */
export function recoverExpToNextLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level))
  if (lv < 7) return 135 + 10 * (lv - 1)
  if (lv < 13) return 625 + 50 * (lv - 7)
  if (lv < 19) return 1950 + 100 * (lv - 13)
  return 5000 + 5000 * (lv - 19)
}

export interface DailyLuckRange {
  min: number
  max: number
}

/** Source: user/User.as setTadayLuckValue() tiers. */
export function getDailyLuckRange(level: number): DailyLuckRange {
  const lv = Math.max(1, Math.floor(level))
  if (lv <= 4) return { min: 1, max: 5 }
  if (lv <= 10) return { min: 1, max: 10 }
  return { min: 1, max: 20 }
}

/** Source: user/User.as setTadayLuckValue() -- rolled once per calendar day,
 * not per hit; heroScale.ts's calculateHurt() `luck` option expects this
 * value passed in already-rolled (it does its own per-hit 0..luck variance
 * on top, matching getHurt()'s own `Math.random() * luckData`). */
export function rollDailyLuck(level: number, random: () => number = Math.random): number {
  const lv = Math.max(1, Math.floor(level))
  if (lv <= 4) return 1 + Math.round(random() * 4)
  if (lv <= 10) return 1 + Math.round(random() * 9)
  return 1 + Math.round(random() * 19)
}

/**
 * Apply an HP change toward `requestedHp`. Source: base.BaseRoleProperies.as
 * setHHP() -- while `healBlocked` (ERLANGSHEN_HP_REJECT active), any attempt
 * to raise HP above its current value is dropped entirely (not partially
 * applied); decreases always go through. Result is always clamped to
 * [0, maxHp].
 */
export function applyHeroHpChange(
  currentHp: number,
  requestedHp: number,
  maxHp: number,
  healBlocked: boolean,
): number {
  if (healBlocked && requestedHp > currentHp) return currentHp
  return Math.max(0, Math.min(maxHp, requestedHp))
}

/** Convenience wrapper: apply a heal/damage AMOUNT (signed) rather than an
 * absolute target HP, same gating rules as applyHeroHpChange. */
export function applyHeroHpDelta(
  currentHp: number,
  delta: number,
  maxHp: number,
  healBlocked: boolean,
): number {
  return applyHeroHpChange(currentHp, currentHp + delta, maxHp, healBlocked)
}

/** Source: export.magicWeapon/MagicRing.as:62 -- cureHp(maxHp * ringLevel).
 * Any ringLevel >= 1 already exceeds maxHp, and setHHP() clamps regardless,
 * so this is always a full heal (blocked entirely if healBlocked is true,
 * per applyHeroHpChange -- a heal-blocked hero gets nothing from the ring
 * either, there is no original-game exception for it). */
export function magicRingHealAmount(maxHp: number, ringLevel: number): number {
  return maxHp * Math.max(0, ringLevel)
}

/** Source: export.pack/PackThings.as's "wpsmdN" revival-pill usage cap:
 * tier N may be used up to N+1 times. Heal amount per use is TODO-verify
 * (see file header) -- this only records the confirmed usage-limit shape. */
export function immortalityPillUseCap(tier: number): number {
  return Math.max(0, Math.floor(tier)) + 1
}
