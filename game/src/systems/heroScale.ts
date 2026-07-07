// Phaser-independent recovery of Role1's (悟空) ORIGINAL normal-attack damage
// formula and both directions' defense-mitigation formula, plus a
// self-consistent kill-time viability model for L1-L4.
//
// Why this file exists: level-pipeline ported L2-L4 monster HP at true SWF
// scale (多闻天王 16000, 二郎神 45137, 邪.悟空 54423 — see
// tasks/level-pipeline-report.md), but this project's hero-side numbers
// (progression.ts's atk curve, HeroNormalAttackSystem-style flat hit
// damage) are a much smaller invented scale. This module recovers the real
// formula that connects atk -> normal-attack damage -> post-defense damage,
// so the two sides can be reconciled without rewriting either.
//
// ## IMPORTANT correction to kagami's own port
//
// The brief pointed at "kagami Role1BasicSkillSystem/相关源码" for the hit1-5
// formula. That file doesn't have it — kagami's own
// `HeroNormalAttackSystem.ts` hardcodes flat literal damage per combo hit
// (Role1 hit1-5: 30, 30, 31, 32, 34) with NO reference to atk/level/power
// anywhere in the function. That is not a faithful recovery of the original
// formula; it reads as an unfinished placeholder (kagami's own docs,
// combat-rules-index.md:95, hedge this as "约" (approximately) rather than a
// hard formula, and its "2.0875 * Hurt" figure for hit1-3 does not match a
// direct decompile of the real client either — see below).
//
// This module instead recovers the formula directly from this project's own
// vendored SWF via ffdec, the same way monsterBehaviors.ts's Monster7/
// Monster13 were recovered:
//
//   java -jar tools/ffdec/ffdec-cli.jar \
//     -selectclass export.hero.Role1,base.BaseHero,base.BaseRoleProperies,base.BaseBullet,base.BaseMonster \
//     -export script <out> \
//     "vendor/zmxy_res/.../打开我开始玩.swf"
//
// `export.hero.Role1.as`'s `getRealPower2(action)` (~line 2209) is the real
// source of truth:
//
//   case "hit1": case "hit2": case "hit3":
//     power = 0.707 * roleProperies.getHurt() * critMult * gxpMult
//   case "hit4":
//     power = 1.183 * roleProperies.getHurt() * critMult * gxpMult
//   case "hit5":
//     power = 1.304 * roleProperies.getHurt() * critMult * gxpMult
//
// `critMult` = 2 if `Math.random() <= getCrit()/100` else 1 (skippable via
// getRealPower2's own `canCrit` parameter). `gxpMult` = 1.5 if the hero is in
// GXP state else 1 (this project has no GXP state; treat as 1).
//
// `base.BaseRoleProperies.as`'s `getHurt()` (~line 641):
//   getHurt() = getPower() + Math.random() * luckData
//   getPower() = getBasePower()  // the hero's plain total atk stat
// i.e. `Hurt` IS this project's `heroTotalAtk(id, eq)` (heroIdentity.ts) plus
// an optional random "luck" variance this project has no equivalent stat
// for yet (defaults to 0 below — a documented simplification, not a
// recovered value of 0).
//
// `base.BaseBullet.as`'s `refreshSourceRoleAttackInfoObject()` (~line 414)
// confirms `getRealPower2(action)[0]` is used as the hit's final `_hurt`
// directly — no further multiplier is applied anywhere downstream. (Compare
// to skills, where kagami's own SkillTuning.ts documents an explicit final
// `* 1.27` inside `getRealPower()` for the skill path — normal attacks have
// no such multiplier.)
//
// ## Defense mitigation (both directions — same formula, confirmed exact)
//
// `base.BaseMonster.as`'s `getRealHurt(power, attackInfo)` (~line 773) —
// this is the monster taking a hit from the hero:
//   physics: power > def ? power - def : 1
//   magic:   mDef ? power * (1 - mDef) : power
//
// `base.BaseHero.as`'s `countHurt(power, attackInfo)` (~line 1110) — this is
// the hero taking a hit from a monster:
//   physics: power > totalDefense ? power - totalDefense : 1
//   magic:   power * (1 - magicDef/100)
//
// Both directions use the IDENTICAL physics formula shape (flat subtraction,
// floor 1) — this is exactly what monsterSim.ts/heroCombat.ts already do
// (`Math.max(1, damage - def)`). Neither of those files needs to change: the
// EXISTING simplification already matches the original exactly, it was never
// a simplification. (combat-rules-index.md:146 describes this as a RATIO
// formula "(atk-def)/atk" for the monster side — that description does not
// match a direct read of `getRealHurt()`'s AS3; flagged as an inaccuracy in
// kagami's own docs, not a version difference like the Monster3 `def` case
// found in the monster-behavior task.)
//
// ## kagami's skill-damage port vs. the real AS3 (found while cross-checking)
//
// heroSkill.ts's Role1 skill formulas (calculateRole1SlzDamage etc.) were
// ported verbatim from kagami's Role1BasicSkillSystem.ts, per that task's own
// mandate ("kagami原值逐字搬" — port kagami's chosen values exactly). That
// was the correct execution of that brief. But a direct decompile of
// `getRealPower2()`'s skill branches (hit6=slz, hit7=hytj, hit8=lyfb,
// hit9=lys, hit10_2/10_4=hmz, hit11_1/11_2=jdy, hit12=hyjj, hit13=qsez,
// hit14=zz) shows the REAL formula is exponential in skill level
// (`A*e^(B*level) + C*e^(D*level)*Hurt`, distinct A/B/C/D per hit), not
// kagami's shared polynomial/lookup-table model (`hmzLianZhan`/`hmzZaDi`
// tables + `SkillFactorBase/PerLevel`). Spot check at level 1, Hurt=100:
// real `hit6` (slz) = `28.334*e^0.308 + 0.618*e^0.148*100` ≈ 110.2; kagami's
// ported `calculateRole1SlzDamage(1, 100)` = 731.52 — roughly 6.6x apart.
// This is a real discrepancy, not a rounding difference, but it is OUT OF
// SCOPE for this task (heroSkill.ts is someone else's already-shipped,
// already-tested deliverable, and this task's mandate is normal-attack +
// viability, not a skill-damage re-audit) — flagged here and in the report
// for whoever picks up skill-damage rebalancing next, not fixed.
//
// ## Scope
//
// Role1 (悟空) only — this project's only playable hero so far.

export type AttackKind = 'physics' | 'magic'

/** Source: export.hero.Role1.as getRealPower2(), ~line 2223-2235. */
export const NORMAL_ATTACK_COEFFICIENT = {
  hit1: 0.707,
  hit2: 0.707,
  hit3: 0.707,
  hit4: 1.183,
  hit5: 1.304,
} as const

export type NormalAttackHit = keyof typeof NORMAL_ATTACK_COEFFICIENT

/** Source: kagami's HeroNormalAttackSystem.ts ground-combo createStep() calls
 * — every Role1 hit1-5 step uses durationMs=170, cooldownMs=170 (i.e. the
 * next hit can start exactly as this one's animation ends; a full 5-hit
 * combo takes 5*170=850ms if chained without gaps). This project's own
 * heroSim.ts/combo.ts own the REAL input-driven combo timing; this constant
 * is only used for this file's own DPS/kill-time estimate, not to drive
 * actual gameplay. */
export const NORMAL_ATTACK_HIT_DURATION_MS = 170
export const NORMAL_ATTACK_COMBO_HITS: readonly NormalAttackHit[] = ['hit1', 'hit2', 'hit3', 'hit4', 'hit5']

export interface HurtOptions {
  /** BaseRoleProperies.as's `luckData` — an equipment/accessory stat this
   * project has no equivalent for yet. Defaults to 0 (no variance), a
   * documented simplification, not a recovered "luck is always 0" fact. */
  luck?: number
  random?: () => number
}

/** Source: base.BaseRoleProperies.as:641-644 getHurt(). `atk` is this
 * project's `heroTotalAtk(id, eq)` (heroIdentity.ts) — getPower()/
 * getBasePower() is just the hero's plain total atk stat. */
export function calculateHurt(atk: number, opts: HurtOptions = {}): number {
  const random = opts.random ?? Math.random
  return atk + random() * (opts.luck ?? 0)
}

export interface NormalAttackOptions extends HurtOptions {
  /** 0-1 fraction, matching this project's own BaseStats.crit convention
   * (furnace.ts/effects.ts) — not the AS3's raw 0-100 getCrit() value. */
  critChance?: number
  /** AS3: 1.5 while GXP-buffed, else 1. This project has no GXP state yet. */
  isGxp?: boolean
  /** Force/forbid a crit roll instead of rolling randomly (for deterministic tests/estimates). */
  forceCrit?: boolean
}

/**
 * Raw (pre-mitigation) damage for one normal-attack hit. Source:
 * export.hero.Role1.as getRealPower2() — see file header for the full
 * derivation and citations.
 */
export function calculateNormalAttackPower(hit: NormalAttackHit, atk: number, opts: NormalAttackOptions = {}): number {
  const hurt = calculateHurt(atk, opts)
  const random = opts.random ?? Math.random
  const critRolled = opts.forceCrit ?? (random() <= (opts.critChance ?? 0))
  const critMult = critRolled ? 2 : 1
  const gxpMult = opts.isGxp ? 1.5 : 1
  return NORMAL_ATTACK_COEFFICIENT[hit] * hurt * critMult * gxpMult
}

/**
 * Physics defense mitigation. Source: base.BaseMonster.as:773-805
 * getRealHurt() (monster taking a hero hit) and base.BaseHero.as:1110-1140
 * countHurt() (hero taking a monster hit) — IDENTICAL formula both
 * directions: flat subtraction, floored at 1. This is exactly
 * monsterSim.ts's/heroCombat.ts's existing `Math.max(1, damage - def)` — no
 * change needed in either file.
 */
export function applyPhysicsDefense(rawPower: number, def: number): number {
  return Math.max(1, rawPower - def)
}

/**
 * Magic defense mitigation. Source: same two functions as
 * `applyPhysicsDefense`, magic branch. `mDefFraction` is a 0-1 fraction
 * (monsters' own `protectedParamsObject.mDef` is already stored this way;
 * the hero's `roleProperies.getMagicDef()` returns a 0-100 value and must be
 * divided by 100 by the caller before passing in here).
 */
export function applyMagicDefense(rawPower: number, mDefFraction: number): number {
  if (!mDefFraction) return rawPower
  return rawPower * (1 - mDefFraction)
}

export function applyDefense(rawPower: number, attackKind: AttackKind, def: number): number {
  return attackKind === 'physics' ? applyPhysicsDefense(rawPower, def) : applyMagicDefense(rawPower, def)
}

/**
 * Bridge for the wiring layer: pre-mitigate an incoming monster hit's raw
 * `power` before constructing a `HeroHit` for heroCombat.ts's
 * `applyHeroDamage` — heroCombat.ts itself applies zero defense mitigation
 * (see its own file header: "Dropped ... per-role defense"), so whoever
 * wires monster attacks into it must call this first. heroCombat.ts is NOT
 * modified by this task.
 */
export function resolveIncomingHeroDamage(
  rawPower: number,
  attackKind: AttackKind,
  heroDef: number,
  heroMagicDefFraction: number,
): number {
  return attackKind === 'physics'
    ? applyPhysicsDefense(rawPower, heroDef)
    : applyMagicDefense(rawPower, heroMagicDefFraction)
}

// ============================================================
// DPS / kill-time viability model
// ============================================================

export interface ComboDpsResult {
  /** Total post-defense damage dealt across one full hit1-5 cycle. */
  damagePerCombo: number
  comboDurationMs: number
  dps: number
}

/**
 * Average DPS of a fully-chained hit1-5 combo against a target with `def`
 * physics defense (all Role1 normal attacks are `attackKind: "physics"` —
 * export.hero.Role1.as's hit1-5 attackBackInfoDict entries, ~line 33-65).
 * Crit is applied at its EXPECTED VALUE (not rolled) so the result is
 * deterministic and reproducible for the viability table, matching the
 * brief's "数字自洽...可复算" requirement.
 */
export function simulateComboDps(atk: number, def: number, opts: { critChance?: number; luck?: number } = {}): ComboDpsResult {
  const critChance = opts.critChance ?? 0
  const expectedCritMult = 1 + critChance // 1 (no crit) blended with 2 (crit) at critChance probability = 1 + critChance
  let damagePerCombo = 0
  for (const hit of NORMAL_ATTACK_COMBO_HITS) {
    const hurt = calculateHurt(atk, { luck: opts.luck, random: () => 0.5 }) // expected value of the luck roll
    const rawPower = NORMAL_ATTACK_COEFFICIENT[hit] * hurt * expectedCritMult
    damagePerCombo += applyPhysicsDefense(rawPower, def)
  }
  const comboDurationMs = NORMAL_ATTACK_HIT_DURATION_MS * NORMAL_ATTACK_COMBO_HITS.length
  return { damagePerCombo, comboDurationMs, dps: damagePerCombo / (comboDurationMs / 1000) }
}

/** Seconds to reduce `hp` to 0 at a steady `dps`. */
export function estimateKillSeconds(hp: number, dps: number): number {
  if (dps <= 0) return Number.POSITIVE_INFINITY
  return hp / dps
}

/**
 * Hits (of `incomingPower`, already def-mitigated) the hero can absorb
 * before `heroMaxHp` is depleted — a crude survivability check, floor'd at
 * 0 hits meaning "a single hit can kill".
 */
export function estimateHitsToKillHero(heroMaxHp: number, mitigatedIncomingPower: number): number {
  if (mitigatedIncomingPower <= 0) return Number.POSITIVE_INFINITY
  return Math.floor(heroMaxHp / mitigatedIncomingPower)
}

// ============================================================
// L2-L4 boss reference data (own consolidation of level-pipeline-report.md's
// findings, cross-checked by this task's own ffdec decompile of
// export.monster.Monster15/Monster22/Monster34 — see report for per-field
// citations). Not imported from systems/level.ts or game/src/data/levels/ —
// this is this module's own small reference slice, independent data, so
// level-pipeline's files are untouched.
// ============================================================

export interface BossReference {
  level: 2 | 3 | 4
  name: string
  hp: number
  def: number
  /** Representative incoming hit powers (raw, pre-mitigation), by
   * attackKind, for the survivability check. */
  attacks: { power: number; attackKind: AttackKind }[]
}

export const BOSS_REFERENCE: readonly BossReference[] = [
  {
    level: 2,
    name: '多闻天王 (Monster15)',
    hp: 16000,
    def: 24,
    attacks: [
      { power: 186, attackKind: 'physics' },
      { power: 80, attackKind: 'magic' },
      { power: 120, attackKind: 'magic' },
      { power: 120, attackKind: 'magic' },
    ],
  },
  {
    level: 3,
    name: '二郎神 (Monster22, post-setAtkUp)',
    hp: 45137,
    def: 45,
    attacks: [
      { power: 345, attackKind: 'physics' },
      { power: 1299, attackKind: 'magic' },
      { power: 345, attackKind: 'magic' },
      { power: 345, attackKind: 'magic' },
    ],
  },
  {
    level: 4,
    name: '邪.悟空 (Monster34)',
    hp: 54423,
    def: 80,
    attacks: [
      { power: 829, attackKind: 'physics' },
      { power: 1658, attackKind: 'physics' }, // hit6, 829*2
      { power: 1000, attackKind: 'magic' }, // hit9, fixed literal
    ],
  },
]
