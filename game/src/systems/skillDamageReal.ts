// Phaser-independent recovery of Role1's (悟空) REAL skill damage formula,
// decompiled directly from `export.hero.Role1.as`'s `getRealPower2()`.
//
// ## Why this file exists, and why it is NOT a change to heroSkill.ts
//
// heroSkill.ts (an earlier task) ported kagami's Role1BasicSkillSystem.ts
// skill-damage formulas verbatim, per that task's own mandate ("kagami原值
// 逐字搬"). That was the correct execution of that brief at the time. The
// hero-scale task's cross-check (heroScale.ts's file header) then found a
// direct decompile of the real AS3 disagrees with kagami's port by roughly
// 6.6x at level 1 -- not a rounding difference, a materially different
// formula shape (kagami: shared lookup-table polynomial across all 9
// skills, ending in a flat `* 1.27`; real AS3: per-skill exponential curve
// in skill level, no final multiplier at all).
//
// This task recovers the real formula as an independent new module.
// heroSkill.ts is UNTOUCHED -- it remains available as kagami's own
// (materially different) version for comparison/archival, per this task's
// explicit instruction.
//
// ## Source
//
// `export.hero.Role1.as`'s `getRealPower2(action, canCrit=true)` (same
// method heroScale.ts already recovered hit1-5 from; this file covers the
// skill branches hit6/7/8/9/10_2/10_4/11_1/11_2/12/13/14). Decompiled via:
//
//   java -jar tools/ffdec/ffdec-cli.jar -selectclass export.hero.Role1 \
//     -export script <out> "vendor/zmxy_res/.../打开我开始玩.swf"
//
// Every skill branch has the same shape:
//
//   power = fixedBase * e^(fixedExponent * skillLevel)
//         + powerBase * e^(powerExponent * skillLevel) * Hurt * critMult * gxpMult
//
// IMPORTANT operator-precedence note: in AS3, `*` binds tighter than `+`, so
// `critMult`/`gxpMult` multiply ONLY the Hurt-scaling term, NOT the fixed
// exponential term. This is a different shape from hit1-5 (heroScale.ts),
// where crit/gxp scale the ENTIRE result because there is no separate fixed
// term there. Faithfully reproduced below -- do not "simplify" this by
// multiplying the whole sum by critMult/gxpMult, that would silently change
// the balance.
//
// `Hurt` is the same quantity as heroScale.ts's `calculateHurt()` (imported,
// not re-implemented) -- `roleProperies.getHurt() = getBasePower() +
// random()*luckData`, i.e. the hero's total atk stat plus daily-luck
// variance (see heroGrowth.ts's `rollDailyLuck`).
//
// `hit10_3` has an empty case (`break;` with no assignment) -- confirmed
// directly in the decompile, matching kagami's own docs
// (projectiles-index.md: "仅有网络回放 helper，无本地生成入口"). No function
// is exported for it; it deals no damage in the real client either.
//
// ## The skill-level input is quirkier than heroSkill.ts assumed
//
// The AS3 feeds `this.player.returnSkillLevelBySkillName(name)` as the level
// argument -- `user/User.as`'s `returnSkillLevelBySkillName()` (~line 909)
// is actually reading the currently-EQUIPPED loadout slot's level (not
// necessarily the same as "skill tree learned level"), and for a specific
// hardcoded skill-name list (which includes every Role1 skill) it resets the
// stored level back to 1 if it's ever found `> 10` -- a real, confirmed AS3
// quirk, not a decompile artifact, but its cause (why would a learned level
// ever exceed 10 if the skill tree caps learning at 18?) wasn't resolved in
// this pass. The pure functions below take `skillLevel` as a plain number
// and do NOT reproduce that reset-to-1-above-10 behavior -- callers should
// decide for themselves whether to replicate it (documented as TODO-verify,
// not silently baked in as a hidden clamp).

import { calculateHurt, type HurtOptions } from './heroScale'

export type RealSkillId =
  | 'slz' | 'hytj' | 'lyfb' | 'lys'
  | 'hmzLianZhan' | 'hmzZaDi'
  | 'jdyStage1' | 'jdyStage2'
  | 'hyjj' | 'qsez' | 'zz'

interface ExponentialCoefficients {
  /** AS3 action name, for cross-reference with the decompile. */
  action: string
  fixedBase: number
  fixedExponent: number
  powerBase: number
  powerExponent: number
}

/** Source: export.hero.Role1.as getRealPower2(), skill branches. Every field
 * transcribed verbatim -- see file header for the exact decompile command. */
export const REAL_SKILL_COEFFICIENTS: Record<RealSkillId, ExponentialCoefficients> = {
  slz: { action: 'hit6', fixedBase: 28.334, fixedExponent: 0.308, powerBase: 0.618, powerExponent: 0.148 },
  hytj: { action: 'hit7', fixedBase: 8.854, fixedExponent: 0.308, powerBase: 0.193, powerExponent: 0.141 },
  lyfb: { action: 'hit8', fixedBase: 12.879, fixedExponent: 0.308, powerBase: 0.281, powerExponent: 0.145 },
  lys: { action: 'hit9', fixedBase: 5.666, fixedExponent: 0.308, powerBase: 0.123, powerExponent: 0.149 },
  hmzLianZhan: { action: 'hit10_2', fixedBase: 14.94, fixedExponent: 0.368, powerBase: 0.169, powerExponent: 0.143 },
  hmzZaDi: { action: 'hit10_4', fixedBase: 59.787, fixedExponent: 0.368, powerBase: 0.676, powerExponent: 0.143 },
  jdyStage1: { action: 'hit11_1', fixedBase: 6.296, fixedExponent: 0.308, powerBase: 0.137, powerExponent: 0.142 },
  jdyStage2: { action: 'hit11_2', fixedBase: 6.296, fixedExponent: 0.308, powerBase: 0.137, powerExponent: 0.145 },
  hyjj: { action: 'hit12', fixedBase: 12.592, fixedExponent: 0.308, powerBase: 0.274, powerExponent: 0.144 },
  qsez: { action: 'hit13', fixedBase: 0.629, fixedExponent: 0.308, powerBase: 0.0137, powerExponent: 0.141 },
  zz: { action: 'hit14', fixedBase: 70.835, fixedExponent: 0.308, powerBase: 1.545, powerExponent: 0.149 },
} as const

export interface RealSkillDamageOptions extends HurtOptions {
  /** 0-1 fraction (this project's BaseStats.crit convention, see heroScale.ts). */
  critChance?: number
  /** AS3: 1.5 while GXP-buffed, else 1. This project has no GXP state yet. */
  isGxp?: boolean
  forceCrit?: boolean
}

/**
 * Real (AS3-accurate) skill damage. `skillLevel` is whatever level number the
 * caller resolves it to be (see file header's note on the loadout-slot
 * quirk) -- this function does not clamp or reinterpret it.
 */
export function calculateRealSkillDamage(
  skillId: RealSkillId,
  skillLevel: number,
  atk: number,
  opts: RealSkillDamageOptions = {},
): number {
  const c = REAL_SKILL_COEFFICIENTS[skillId]
  const random = opts.random ?? Math.random
  const resolvedOptions = { ...opts, random }
  const hurt = calculateHurt(atk, resolvedOptions)
  const critRolled = opts.forceCrit ?? (random() <= (opts.critChance ?? 0))
  const critMult = critRolled ? 2 : 1
  const gxpMult = opts.isGxp ? 1.5 : 1

  const fixedPart = c.fixedBase * Math.exp(c.fixedExponent * skillLevel)
  const powerPart = c.powerBase * Math.exp(c.powerExponent * skillLevel) * hurt * critMult * gxpMult
  return fixedPart + powerPart
}

/** Convenience: fixed/variable parts split out, for report tables and tests
 * that want to show the "level scaling" vs. "atk scaling" contributions
 * separately without re-deriving them. */
export function splitRealSkillDamage(
  skillId: RealSkillId,
  skillLevel: number,
  atk: number,
  opts: RealSkillDamageOptions = {},
): { fixedPart: number; powerPart: number; total: number } {
  const c = REAL_SKILL_COEFFICIENTS[skillId]
  const random = opts.random ?? Math.random
  const resolvedOptions = { ...opts, random }
  const hurt = calculateHurt(atk, resolvedOptions)
  const critRolled = opts.forceCrit ?? (random() <= (opts.critChance ?? 0))
  const critMult = critRolled ? 2 : 1
  const gxpMult = opts.isGxp ? 1.5 : 1

  const fixedPart = c.fixedBase * Math.exp(c.fixedExponent * skillLevel)
  const powerPart = c.powerBase * Math.exp(c.powerExponent * skillLevel) * hurt * critMult * gxpMult
  return { fixedPart, powerPart, total: fixedPart + powerPart }
}
