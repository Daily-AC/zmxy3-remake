// Phaser-independent Role1 (悟空) active-skill subset, ported from kagami's
// Role1BasicSkillSystem.ts / Role1ShadowSkillSystem.ts / Role1FinisherSkillSystem.ts
// / Role1SkillProjectileFactory.ts, plus the shared SkillTuning.ts / SkillMathUtils.ts
// constants they all import.
//
// Sources (line refs are against the vendored copy at
// vendor/kagami-phaser/src/systems/ as of this port):
//   Role1BasicSkillSystem.ts    — slz/lys/hytj/lyfb/jdy (基本技能)
//   Role1ShadowSkillSystem.ts   — qsez/zz (分身技能)
//   Role1FinisherSkillSystem.ts — hmz/hyjj (终结技)
//   Role1SkillProjectileFactory.ts — lyfb's two-hitbox spawn helper
//   SkillTuning.ts / SkillMathUtils.ts — shared MP table, damage curve constants
// docs/reverse-engineering/skills-input-index.md §"Role1 正式释放与重入边界"
// (TASK-SETTINGS-037) independently confirms the MP factors, action gating,
// and jdy two-stage rule below against the original reverse-engineered client.
//
// This subset covers all 9 active Role1 skills confirmed complete
// ("九主动 + 一被动", skills-input-index.md:598) plus the `sx` passive:
//   slz, lys, hytj, lyfb, jdy (基本), qsez, zz (分身), hmz, hyjj (终结),
//   sx (吸血/暴击被动, no MP cost, not a `tryCastRole1Skill` skill id).
//
// Deliberately NOT ported (out of this task's scope, see brief):
//   - SkillUISystem.ts (skill tree UI / learning economy) — data-shape only,
//     covered by Role1SkillLevels below.
//   - Movement/animation wiring: kagami's cast functions push velocity into a
//     HeroMovementModel and lock a Phaser hero's animation; this module has
//     no movement system dependency (heroSim.ts/combo.ts are untouched, per
//     brief) and instead returns plain SkillHitbox descriptors for a future
//     BattleScene to turn into projectiles/animations/movement locks.
//   - Combat integration (HeroCombatModel, ProjectileSystem, InputSystem):
//     same reason — tryCastRole1Skill takes plain numbers/targets, not those
//     kagami types, so this module has zero Phaser-adjacent dependencies.
//
// Cooldown model note: kagami has no discrete per-skill cooldown for Role1.
// Instead every basic/shadow/finisher request function gates on (and, for
// shadow/finisher, additionally re-arms) one shared busy timer,
// `role1Runtime.actionRemainingMs` — see requestRole1BasicSkillFromInput's
// `actionRemainingMs > 0` check (Role1BasicSkillSystem.ts:398),
// requestRole1ShadowSkillFromInput's `role1Runtime.actionRemainingMs > 0 ||
// runtime.actionRemainingMs > 0` check (Role1ShadowSkillSystem.ts:193-194,
// with castQsez/castZz also re-arming role1Runtime, not just their own
// runtime — lines 217/269), and requestRole1FinisherSkillFromInput's
// three-way check (Role1FinisherSkillSystem.ts:228-231, castHmz/castHyjj
// likewise re-arming role1Runtime — lines 258/317). Net effect: casting *any*
// Role1 skill blocks *all* Role1 skills until that skill's action finishes.
// This port keeps that exact shape as one shared `cooldownMs` field on
// Role1SkillRuntime rather than 9 independent per-skill cooldowns.

export type AttackKind = 'physics' | 'magic' // Source: CombatSystem.ts:1

export type Role1SkillId =
  | 'slz' | 'lys' | 'hytj' | 'lyfb' | 'jdy' // 基本技能 (Role1BasicSkillSystem.ts)
  | 'qsez' | 'zz' // 分身技能 (Role1ShadowSkillSystem.ts)
  | 'hmz' | 'hyjj' // 终结技 (Role1FinisherSkillSystem.ts)

// ============================================================
// Shared tuning (ported verbatim)
// ============================================================

/** Source: SkillTuning.ts:1-4. Shared MP-by-level table, index = level-1. */
export const SkillMpByLevel = [
  66, 160, 208, 276, 364, 493, 703, 759, 801,
  921, 1085, 1133, 1318, 1771, 1884, 1954, 2320, 2667,
] as const

/** Source: SkillTuning.ts:6-9. */
export const SkillFixedDamageCount = [
  1, 1, 1, 1, 2, 2, 2, 2.5, 2.5,
  2.5, 2.8, 2.8, 2.8, 3.05, 3.05, 3.05, 3.25, 3.25,
] as const

/** Source: SkillTuning.ts:11-12. */
export const SkillFactorBase = 0.3407 * 8 + 2.075
export const SkillFactorPerLevel = 0.0135 * 10 * 8 + 0.075 * 10

/** Source: SkillTuning.ts:14. */
export const Role1DamageFinalMultiplier = 1.27

// Source: identical table duplicated verbatim across
// Role1BasicSkillSystem.ts:20-27 (hmzLianZhan/hmzZaDi),
// Role1FinisherSkillSystem.ts:22-33 (hmzLianZhan/hmzZaDi/fixedDamage), and
// Role1ShadowSkillSystem.ts:19-29 (fixedDamage/extraFixedDamage) — kagami
// itself reuses the same two 18-level tables under three different name
// pairs; consolidated here into one source of truth.
const hmzLianZhan = [
  34, 95, 192, 253, 318, 444, 524, 687, 876,
  1091, 1219, 1480, 1770, 2092, 2444, 2831, 3058, 3500,
] as const
const hmzZaDi = [
  209, 573, 1151, 1523, 1912, 2666, 3149, 4126, 5258,
  6551, 7323, 8884, 10623, 12551, 14671, 16992, 18350, 21006,
] as const

// Source: Role1FinisherSkillSystem.ts:35-38.
const hmzLianZhanFactorBase = 0.3407
const hmzLianZhanFactorPerLevel = 0.0135 * 10
const hmzZaDiFactorBase = 2.075
const hmzZaDiFactorPerLevel = 0.075 * 10

/** Source: SkillMathUtils.ts:1-3. */
export function clampSkillLevel(level: number, max = 18): number {
  return Math.min(max, Math.max(1, Math.floor(level)))
}

/** Source: SkillMathUtils.ts:5-7. */
export function clampSkillLevelOrZero(level: number, max = 18): number {
  return level > 0 ? clampSkillLevel(level, max) : 0
}

// MP-cost factors per skill. Sources:
//   slz/lys/hytj/lyfb/jdy: Role1BasicSkillTuning.*MpFactor, Role1BasicSkillSystem.ts:46-50
//   qsez/zz: Role1ShadowSkillTuning.*MpFactor, Role1ShadowSkillSystem.ts:56-57
//   hmz/hyjj: Role1FinisherSkillTuning.*MpFactor, Role1FinisherSkillSystem.ts:55-56
const mpFactorBySkill: Record<Role1SkillId, number> = {
  slz: 0.55, lys: 0.45, hytj: 0.6, lyfb: 0.65, jdy: 1,
  qsez: 0.6, zz: 0.75,
  hmz: 1, hyjj: 1.1,
}

/** MP cost to cast `skillId` at `level`. Ported from getRole1*MpCost() (one
 * function per skill in kagami; consolidated here via mpFactorBySkill since
 * every one of them is `floor(SkillMpByLevel[level-1] * factor)`). */
export function getRole1SkillMpCost(skillId: Role1SkillId, level: number): number {
  const levelIndex = clampSkillLevel(level, SkillMpByLevel.length) - 1
  return Math.floor(SkillMpByLevel[levelIndex] * mpFactorBySkill[skillId])
}

// Action/"cooldown" duration per skill — see the file-header note on the
// shared busy-lock model. Sources:
//   slz/lys/hytj/lyfb/jdy: Role1BasicSkillTuning.*ActionMs, Role1BasicSkillSystem.ts:51-55
//   qsez/zz: Role1ShadowSkillTuning.*ActionMs, Role1ShadowSkillSystem.ts:58-59
//   hmz/hyjj: Role1FinisherSkillTuning.*ActionMs, Role1FinisherSkillSystem.ts:57,60
const actionMsBySkill: Record<Role1SkillId, number> = {
  slz: 650, lys: 360, hytj: 360, lyfb: 480, jdy: 520,
  qsez: 1_250, zz: 620,
  hmz: 1_640, hyjj: 680,
}

/** Source: Role1BasicSkillTuning.lysGateMs, Role1BasicSkillSystem.ts:56. Minimum
 * ms between two `lys` casts, on top of the shared cooldown. */
export const lysGateMs = 36

/** Source: Role1FinisherSkillTuning, Role1FinisherSkillSystem.ts:58,61-62. */
export const hmzHit10ActiveAfterMs = 520
export const hyjjExplosionIntervalMs = 1_200
export const hyjjExplosionCount = 4

/** Source: Role1ShadowSkillTuning, Role1ShadowSkillSystem.ts:61-65. */
export const qsezHitRangeX = 220
export const qsezHitRangeY = 140
export const shadowLifetimeMs = 3_000
export const shadowSpawnSpreadX = 150
export const shadowZzDamageMultiplier = 0.437

// ============================================================
// Damage formulas (ported verbatim)
// ============================================================

/** Source: Role1BasicSkillSystem.ts:317-329 (calculateRole1SkillDamage core). */
function calculateRole1BasicDamage(
  skillLevel: number,
  sourcePower: number,
  multiplier: number,
  divisor: number,
): number {
  const levelIndex = clampSkillLevel(skillLevel, hmzLianZhan.length) - 1
  const skillFixedDamage = hmzLianZhan[levelIndex] * 8 + hmzZaDi[levelIndex]
  const fixedPart = skillFixedDamage * SkillFixedDamageCount[levelIndex]
  const powerPart = (SkillFactorBase + SkillFactorPerLevel * levelIndex) * Math.max(0, sourcePower)
  return Math.floor(multiplier * (fixedPart + powerPart) / divisor) * Role1DamageFinalMultiplier
}

/** Source: Role1BasicSkillSystem.ts:297-299. */
export function calculateRole1SlzDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1BasicDamage(skillLevel, sourcePower, 0.6, 1)
}

/** Source: Role1BasicSkillSystem.ts:301-303. */
export function calculateRole1LysDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1BasicDamage(skillLevel, sourcePower, 0.5, 1)
}

/** Source: Role1BasicSkillSystem.ts:305-307. */
export function calculateRole1HytjDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1BasicDamage(skillLevel, sourcePower, 0.65, 4)
}

/** Source: Role1BasicSkillSystem.ts:309-311. */
export function calculateRole1LyfbDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1BasicDamage(skillLevel, sourcePower, 0.7, 12)
}

/** Source: Role1BasicSkillSystem.ts:313-315. Applies to both jdy stages (kagami
 * re-derives it fresh for stage 2 using the level recorded at stage 1). */
export function calculateRole1JdyDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1BasicDamage(skillLevel, sourcePower, 0.8, 13)
}

/** Source: Role1FinisherSkillSystem.ts:183-189. */
export function calculateRole1HmzLianZhanDamage(skillLevel: number, sourcePower: number): number {
  const levelIndex = clampSkillLevel(skillLevel) - 1
  const fixedPart = hmzLianZhan[levelIndex] * SkillFixedDamageCount[levelIndex] * 1.1
  const powerPart = (hmzLianZhanFactorBase + hmzLianZhanFactorPerLevel * levelIndex) * Math.max(0, sourcePower)
  return 1.1 * (fixedPart + powerPart) * Role1DamageFinalMultiplier
}

/** Source: Role1FinisherSkillSystem.ts:191-197. */
export function calculateRole1HmzZaDiDamage(skillLevel: number, sourcePower: number): number {
  const levelIndex = clampSkillLevel(skillLevel) - 1
  const fixedPart = hmzZaDi[levelIndex] * SkillFixedDamageCount[levelIndex] * 1.05
  const powerPart = (hmzZaDiFactorBase + hmzZaDiFactorPerLevel * levelIndex) * Math.max(0, sourcePower)
  return 1.1 * (fixedPart + powerPart) * Role1DamageFinalMultiplier
}

/** Source: Role1FinisherSkillSystem.ts:199-206. */
export function calculateRole1HyjjDamage(skillLevel: number, sourcePower: number): number {
  const levelIndex = clampSkillLevel(skillLevel) - 1
  const skillFixedDamage = hmzLianZhan[levelIndex] * 8 + hmzZaDi[levelIndex]
  const fixedPart = skillFixedDamage * SkillFixedDamageCount[levelIndex]
  const powerPart = (SkillFactorBase + SkillFactorPerLevel * levelIndex) * Math.max(0, sourcePower)
  return 0.9 * (fixedPart + powerPart) / 15 * Role1DamageFinalMultiplier
}

/** Source: Role1ShadowSkillSystem.ts:386-396 (calculateRole1ShadowSkillDamage core). */
function calculateRole1ShadowDamage(
  skillLevel: number,
  sourcePower: number,
  multiplier: number,
  divisor: number,
): number {
  const levelIndex = clampSkillLevel(skillLevel, hmzLianZhan.length) - 1
  const fixedPart = (hmzLianZhan[levelIndex] * 8 + hmzZaDi[levelIndex]) * SkillFixedDamageCount[levelIndex]
  const powerPart = (SkillFactorBase + SkillFactorPerLevel * levelIndex) * Math.max(0, sourcePower)
  return Math.floor(multiplier * (fixedPart + powerPart) / divisor) * Role1DamageFinalMultiplier
}

/** Source: Role1ShadowSkillSystem.ts:159-161. */
export function calculateRole1QsezDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1ShadowDamage(skillLevel, sourcePower, 0.25, 1)
}

/** Source: Role1ShadowSkillSystem.ts:163-165. */
export function calculateRole1ZzDamage(skillLevel: number, sourcePower: number): number {
  return calculateRole1ShadowDamage(skillLevel, sourcePower, 0.84, 1)
}

/** Source: Role1ShadowSkillSystem.ts:167-170. Damage a spawned shadow's own zz
 * deals, derived from the qsez level that spawned it. */
export function calculateRole1ShadowZzDamage(qsezLevel: number, sourcePower: number): number {
  return calculateRole1ShadowDamage(qsezLevel, sourcePower, 0.25, 1) * shadowZzDamageMultiplier
}

// ============================================================
// sx passive (吸血/暴击), ported from Role1BasicSkillSystem.ts
// ============================================================

/** Source: Role1BasicSkillSystem.ts:264-269 (syncRole1LearnedSkills). */
function deriveSxBonuses(sxLevel: number): { lifeStealPercent: number; critBonusPercent: number } {
  return {
    lifeStealPercent: sxLevel > 0 ? 0.8 + (sxLevel - 1) / 10 : 0,
    critBonusPercent: sxLevel > 0 ? 3 + Math.round(sxLevel) : 0,
  }
}

/**
 * Life-steal heal for one landed physical hit. Ported from
 * tryRole1SxLifeSteal (Role1BasicSkillSystem.ts:750-765), but decoupled from
 * HeroCombatModel: takes/returns plain numbers so the caller (whatever holds
 * the hero's real HeroCombatModel) applies the result itself.
 * Returns the heal amount (0 if sx isn't learned, the target is dead, or the
 * hit wasn't a physical attack).
 */
export function calculateRole1LifeSteal(params: {
  runtime: Pick<Role1SkillRuntime, 'lifeStealPercent'>
  actualDamage: number
  attackKind: AttackKind
  isDead: boolean
}): number {
  if (params.runtime.lifeStealPercent <= 0 || params.isDead || params.attackKind !== 'physics') return 0
  return Math.floor(Math.max(0, params.actualDamage) * params.runtime.lifeStealPercent / 100)
}

// ============================================================
// Runtime state
// ============================================================

export interface Role1SkillLevels {
  slz: number
  lys: number
  hytj: number
  lyfb: number
  jdy: number
  qsez: number
  zz: number
  hmz: number
  hyjj: number
  /** Passive; 1..9 per skills-input-index.md's "sx" row, clamp max defaults to 9 below. */
  sx: number
}

function createRole1SkillLevels(): Role1SkillLevels {
  return { slz: 0, lys: 0, hytj: 0, lyfb: 0, jdy: 0, qsez: 0, zz: 0, hmz: 0, hyjj: 0, sx: 0 }
}

/** A qsez-spawned shadow, pending a `zz` cast to detonate it.
 * Source: Role1ShadowModel, Role1ShadowSkillSystem.ts:37-45. */
export interface Role1ShadowInstance {
  id: string
  x: number
  y: number
  qsezLevel: number
  remainingMs: number
}

export interface Role1JdyStage {
  level: number
}

export interface Role1SkillRuntime {
  levels: Role1SkillLevels
  /** Shared busy/"cooldown" timer — see file header. */
  cooldownMs: number
  /** Set after jdy's stage 1 lands; a follow-up `jdy` cast within this window
   * triggers stage 2 instead of a fresh stage 1. Source: jdyStage,
   * Role1BasicSkillSystem.ts:176-179,394,403-405,643,657-706. */
  jdyStage?: Role1JdyStage
  /** Pending shadows spawned by qsez hits, consumed by the next zz cast.
   * Source: Role1BasicSkillSystem.ts wires this through
   * role1ShadowRuntime.shadows, Role1ShadowSkillSystem.ts:119-127. */
  shadows: Role1ShadowInstance[]
  shadowSerial: number
  /** Cycles which facing-side target hyjj's chain jumps to next.
   * Source: Role1FinisherSkillRuntime.hyjjTargetCursor, Role1FinisherSkillSystem.ts:40-45,368-380. */
  hyjjTargetCursor: number
  lifeStealPercent: number
  critBonusPercent: number
}

export function createRole1SkillRuntime(): Role1SkillRuntime {
  return {
    levels: createRole1SkillLevels(),
    cooldownMs: 0,
    shadows: [],
    shadowSerial: 0,
    hyjjTargetCursor: 0,
    lifeStealPercent: 0,
    critBonusPercent: 0,
  }
}

/**
 * Apply learned skill levels (e.g. from a skill-tree save). Takes a plain
 * levels object rather than HeroIdentityState — that type is being built by
 * another agent in parallel; wire it up by reading levels off it and calling
 * this function once it lands.
 * Source: syncRole1LearnedSkills, Role1BasicSkillSystem.ts:247-270 (actives,
 * clamp max 18) and syncRole1FinisherLearnedSkills,
 * Role1FinisherSkillSystem.ts:158-164 (hmz/hyjj) and
 * syncRole1ShadowLearnedSkills, Role1ShadowSkillSystem.ts:129-135 (qsez/zz).
 * sx's clamp max of 9 matches skills-input-index.md's "特殊技能 1..9 级".
 */
export function syncRole1SkillLevels(
  runtime: Role1SkillRuntime,
  learned: Partial<Role1SkillLevels>,
): void {
  runtime.levels.slz = clampSkillLevelOrZero(learned.slz ?? 0, 18)
  runtime.levels.lys = clampSkillLevelOrZero(learned.lys ?? 0, 18)
  runtime.levels.hytj = clampSkillLevelOrZero(learned.hytj ?? 0, 18)
  runtime.levels.lyfb = clampSkillLevelOrZero(learned.lyfb ?? 0, 18)
  runtime.levels.jdy = clampSkillLevelOrZero(learned.jdy ?? 0, 18)
  runtime.levels.qsez = clampSkillLevelOrZero(learned.qsez ?? 0, 18)
  runtime.levels.zz = clampSkillLevelOrZero(learned.zz ?? 0, 18)
  runtime.levels.hmz = clampSkillLevelOrZero(learned.hmz ?? 0, 18)
  runtime.levels.hyjj = clampSkillLevelOrZero(learned.hyjj ?? 0, 18)
  runtime.levels.sx = clampSkillLevelOrZero(learned.sx ?? 0, 9)
  const bonuses = deriveSxBonuses(runtime.levels.sx)
  runtime.lifeStealPercent = bonuses.lifeStealPercent
  runtime.critBonusPercent = bonuses.critBonusPercent
}

/**
 * Per-frame upkeep: decay the shared cooldown, expire shadows, and drop a
 * stale jdy stage once the cooldown that was gating it runs out (mirrors
 * updateRole1BasicRuntime's `if (actionRemainingMs<=0 && jdyStage)
 * jdyStage=undefined`, Role1BasicSkillSystem.ts:242-244 — a delayed second
 * jdy press after the window closes starts a fresh stage 1 instead of
 * jumping to stage 2).
 */
export function tickRole1SkillRuntime(runtime: Role1SkillRuntime, deltaMs: number): void {
  const safeDelta = Math.max(0, deltaMs)
  runtime.cooldownMs = Math.max(0, runtime.cooldownMs - safeDelta)
  for (const shadow of runtime.shadows) shadow.remainingMs -= safeDelta
  runtime.shadows = runtime.shadows.filter((shadow) => shadow.remainingMs > 0)
  if (runtime.cooldownMs <= 0 && runtime.jdyStage) runtime.jdyStage = undefined
}

// ============================================================
// Cast entry point
// ============================================================

export interface SkillHitbox {
  /** kagami's per-hit action/animation label (e.g. 'hit6'); a hint for the
   * caller to pick an effect/animation, not itself gameplay-relevant here. */
  actionName: string
  offsetX: number
  offsetY: number
  width: number
  height: number
  lifetimeMs: number
  /** ms after cast before this hitbox becomes active (staggered hits, e.g. hyjj's chain). */
  activeAfterMs: number
  damage: number
  attackKind: AttackKind
  knockbackX: number
  knockbackY: number
  hitIntervalFrames: number
  maxHits: number
  /** True for cosmetic-only spawns that never deal damage (e.g. hyjj's cast MC). */
  visualOnly: boolean
}

function hitbox(partial: Partial<SkillHitbox> & Pick<SkillHitbox, 'actionName' | 'width' | 'height' | 'lifetimeMs' | 'damage' | 'attackKind'>): SkillHitbox {
  return {
    offsetX: 0,
    offsetY: 0,
    activeAfterMs: 0,
    knockbackX: 0,
    knockbackY: 0,
    hitIntervalFrames: 999,
    maxHits: 1,
    visualOnly: false,
    ...partial,
  }
}

export interface Role1Target {
  id: string
  x: number
  y: number
  isAlive: boolean
  isBoss?: boolean
}

export interface Role1CastContext {
  sourcePower: number
  /** Caster world position; qsez uses both axes for its range check, hyjj/zz use only x. */
  x: number
  y?: number
  facingX: -1 | 1
  /** Candidate targets for qsez (dash hit-check) / hyjj (chain target pick). Unused by other skills. */
  targets?: readonly Role1Target[]
  random?: () => number
}

export type Role1CastFailureReason = 'not-learned' | 'cooldown' | 'mp' | 'no-target'

export interface Role1CastFailure {
  ok: false
  skillId: Role1SkillId
  reason: Role1CastFailureReason
}

export interface Role1CastSuccess {
  ok: true
  skillId: Role1SkillId
  mpBefore: number
  mpAfter: number
  mpCost: number
  hitboxes: SkillHitbox[]
  /** True for jdy's stage 2 (no MP, bypasses the normal cooldown gate — see
   * requestRole1BasicSkillFromInput's jdyStageReady branch,
   * Role1BasicSkillSystem.ts:394-405). */
  reentered: boolean
}

export type Role1CastResult = Role1CastSuccess | Role1CastFailure

/** Minimal MP-holder shape this module needs; game/src/systems/mp.ts's MpModel satisfies it. */
export interface SkillMpPool {
  mp: number
  maxMp: number
}

/**
 * Single entry point for casting any Role1 active skill. Deliberately takes
 * plain numbers/targets instead of kagami's HeroMovementModel/HeroCombatModel
 * /ProjectileSystem so this module has no dependency on scenes/movement/combat
 * (per brief: this task must not touch those). The returned hitboxes are
 * descriptors for a future BattleScene to spawn real projectiles/animations
 * from — no Phaser object is created here.
 */
export function tryCastRole1Skill(
  runtime: Role1SkillRuntime,
  mp: SkillMpPool,
  skillId: Role1SkillId,
  ctx: Role1CastContext,
): Role1CastResult {
  // jdy stage 2 bypasses the normal cooldown/MP gate entirely (kagami:
  // Role1BasicSkillSystem.ts:394-405, 657-706).
  if (skillId === 'jdy' && runtime.jdyStage) {
    return castJdyStage2(runtime, mp, ctx)
  }

  const level = runtime.levels[skillId]
  if (level <= 0) return { ok: false, skillId, reason: 'not-learned' }
  if (runtime.cooldownMs > 0) return { ok: false, skillId, reason: 'cooldown' }

  const mpCost = getRole1SkillMpCost(skillId, level)

  if (skillId === 'hyjj') return castHyjj(runtime, mp, level, mpCost, ctx)
  if (skillId === 'qsez') return castQsez(runtime, mp, level, mpCost, ctx)

  if (mp.mp < mpCost) return { ok: false, skillId, reason: 'mp' }
  const mpBefore = mp.mp
  mp.mp -= mpCost
  runtime.cooldownMs = actionMsBySkill[skillId]

  const hitboxes = buildHitboxesForSimpleSkill(runtime, skillId, level, ctx)
  // Arm the stage-2 window (see Role1JdyStage doc comment / file header).
  if (skillId === 'jdy') runtime.jdyStage = { level }
  return { ok: true, skillId, mpBefore, mpAfter: mp.mp, mpCost, hitboxes, reentered: false }
}

function buildHitboxesForSimpleSkill(
  runtime: Role1SkillRuntime,
  skillId: 'slz' | 'lys' | 'hytj' | 'lyfb' | 'jdy' | 'zz' | 'hmz',
  level: number,
  ctx: Role1CastContext,
): SkillHitbox[] {
  const power = ctx.sourcePower
  switch (skillId) {
    // Source: slzProjectileTuning, Role1BasicSkillSystem.ts:64-83.
    case 'slz':
      return [hitbox({
        actionName: 'hit6', offsetX: 30, offsetY: 40, width: 170, height: 150,
        lifetimeMs: 460, attackKind: 'physics', knockbackX: 5, knockbackY: -20,
        hitIntervalFrames: 999, maxHits: 99,
        damage: calculateRole1SlzDamage(level, power),
      })]
    // Source: lysProjectileTuning, Role1BasicSkillSystem.ts:106-125.
    case 'lys':
      return [hitbox({
        actionName: 'hit9', offsetX: 120, offsetY: -50, width: 180, height: 150,
        lifetimeMs: 360, attackKind: 'physics', knockbackX: 0, knockbackY: -2,
        hitIntervalFrames: 999, maxHits: 100,
        damage: calculateRole1LysDamage(level, power),
      })]
    // Source: hytjProjectileTuning, Role1BasicSkillSystem.ts:85-104.
    case 'hytj':
      return [hitbox({
        actionName: 'hit7', offsetX: 175, offsetY: -30, width: 210, height: 110,
        lifetimeMs: 360, attackKind: 'magic', knockbackX: 15, knockbackY: 0,
        hitIntervalFrames: 4, maxHits: 4,
        damage: calculateRole1HytjDamage(level, power),
      })]
    // Source: lyfbFollowProjectileTuning + lyfbMovingProjectileTuning,
    // Role1SkillProjectileFactory.ts:12-52.
    case 'lyfb': {
      const damage = calculateRole1LyfbDamage(level, power)
      return [
        hitbox({
          actionName: 'hit8', offsetX: -20, offsetY: 30, width: 180, height: 120,
          lifetimeMs: 520, attackKind: 'physics', knockbackX: 8, knockbackY: -2,
          hitIntervalFrames: 4, maxHits: 12, damage,
        }),
        hitbox({
          actionName: 'hit8_2', offsetX: -20, offsetY: 30, width: 170, height: 110,
          lifetimeMs: 2_400, attackKind: 'magic', knockbackX: 6, knockbackY: -5,
          hitIntervalFrames: 4, maxHits: 12, damage,
        }),
      ]
    }
    // Source: jdyStage1ProjectileTuning, Role1BasicSkillSystem.ts:127-146.
    case 'jdy':
      return [hitbox({
        actionName: 'hit11_1', offsetX: 50, offsetY: -50, width: 190, height: 130,
        lifetimeMs: 560, attackKind: 'magic', knockbackX: 20, knockbackY: 0,
        hitIntervalFrames: 5, maxHits: 13,
        damage: calculateRole1JdyDamage(level, power),
      })]
    // Source: zzFirstProjectileTuning + zzSecondProjectileTuning,
    // Role1ShadowSkillSystem.ts:89-117, plus shadow-derived hits consuming
    // runtime.shadows (spawnRole1ShadowZzProjectiles, lines 322-336).
    case 'zz': {
      const damage = calculateRole1ZzDamage(level, power)
      const boxes = [
        hitbox({
          actionName: 'hit14', offsetX: 0, offsetY: -85, width: 180, height: 160,
          lifetimeMs: 420, attackKind: 'physics', knockbackX: 20, knockbackY: 0,
          hitIntervalFrames: 999, maxHits: 1, damage,
        }),
        hitbox({
          actionName: 'hit14', offsetX: 145, offsetY: -60, width: 180, height: 160,
          lifetimeMs: 420, attackKind: 'physics', knockbackX: 20, knockbackY: 0,
          hitIntervalFrames: 999, maxHits: 1, damage,
        }),
      ]
      for (const shadow of runtime.shadows) {
        const shadowDamage = calculateRole1ShadowZzDamage(shadow.qsezLevel, power)
        boxes.push(
          hitbox({
            actionName: 'hit14', offsetX: shadow.x - ctx.x, offsetY: -85, width: 180, height: 160,
            lifetimeMs: 420, attackKind: 'physics', knockbackX: 20, knockbackY: 0,
            hitIntervalFrames: 999, maxHits: 1, damage: shadowDamage,
          }),
          hitbox({
            actionName: 'hit14', offsetX: shadow.x - ctx.x + 145, offsetY: -60, width: 180, height: 160,
            lifetimeMs: 420, attackKind: 'physics', knockbackX: 20, knockbackY: 0,
            hitIntervalFrames: 999, maxHits: 1, damage: shadowDamage,
          }),
        )
      }
      runtime.shadows = []
      return boxes
    }
    // Source: hmzLianZhanProjectileTuning + hmzZaDiProjectileTuning,
    // Role1FinisherSkillSystem.ts:65-105.
    case 'hmz':
      return [
        hitbox({
          actionName: 'hit10_2', offsetX: 150, offsetY: -35, width: 250, height: 160,
          lifetimeMs: hmzHit10ActiveAfterMs, attackKind: 'physics', knockbackX: 1, knockbackY: 0,
          hitIntervalFrames: 3, maxHits: 100,
          damage: calculateRole1HmzLianZhanDamage(level, power),
        }),
        hitbox({
          actionName: 'hit10_4', offsetX: 0, offsetY: 40, width: 260, height: 170,
          lifetimeMs: 500, attackKind: 'physics', knockbackX: 13, knockbackY: -15,
          hitIntervalFrames: 999, maxHits: 100, activeAfterMs: hmzHit10ActiveAfterMs,
          damage: calculateRole1HmzZaDiDamage(level, power),
        }),
      ]
  }
}

function castJdyStage2(runtime: Role1SkillRuntime, mp: SkillMpPool, ctx: Role1CastContext): Role1CastResult {
  const level = runtime.jdyStage!.level
  runtime.jdyStage = undefined
  runtime.cooldownMs = actionMsBySkill.jdy
  // Source: jdyStage2ProjectileTuning, Role1BasicSkillSystem.ts:148-167.
  const hitboxes = [hitbox({
    actionName: 'hit11_2', offsetX: 0, offsetY: -50, width: 190, height: 150,
    lifetimeMs: 560, attackKind: 'magic', knockbackX: 0, knockbackY: -25,
    hitIntervalFrames: 5, maxHits: 13,
    damage: calculateRole1JdyDamage(level, ctx.sourcePower),
  })]
  // Source: castJdyStage2 reuses the MP already paid at stage 1 (mpCost: 0),
  // Role1BasicSkillSystem.ts:701-704.
  return { ok: true, skillId: 'jdy', mpBefore: mp.mp, mpAfter: mp.mp, mpCost: 0, hitboxes, reentered: true }
}

/** Source: findRole1QsezTarget, Role1ShadowSkillSystem.ts:338-349. Nearest
 * facing-side target within the dash's hit box. */
function findQsezTarget(ctx: Role1CastContext): Role1Target | undefined {
  const casterY = ctx.y ?? 0
  return (ctx.targets ?? []).find((target) => {
    if (!target.isAlive) return false
    const dx = target.x - ctx.x
    return Math.sign(dx || ctx.facingX) === ctx.facingX
      && Math.abs(dx) <= qsezHitRangeX
      && Math.abs(target.y - casterY) <= qsezHitRangeY
  })
}

/** Source: getRole1QsezShadowCount, Role1ShadowSkillSystem.ts:291-293. */
export function getRole1QsezShadowCount(isBoss: boolean, random: () => number): number {
  return (isBoss ? 4 : 1) + (random() <= 0.5 ? 1 : 0)
}

function castQsez(
  runtime: Role1SkillRuntime,
  mp: SkillMpPool,
  level: number,
  mpCost: number,
  ctx: Role1CastContext,
): Role1CastResult {
  if (mp.mp < mpCost) return { ok: false, skillId: 'qsez', reason: 'mp' }
  const mpBefore = mp.mp
  // kagami spends MP on qsez even if the dash finds no target (dash-only cast
  // is still valid), Role1ShadowSkillSystem.ts:209-215.
  mp.mp -= mpCost
  runtime.cooldownMs = actionMsBySkill.qsez

  const target = findQsezTarget(ctx)
  // Source: qsezProjectileTuning, Role1ShadowSkillSystem.ts:68-87.
  const dashHitbox = hitbox({
    actionName: 'hit13', width: 170, height: 130, lifetimeMs: 420, attackKind: 'physics',
    hitIntervalFrames: 999, maxHits: 1,
    damage: target ? calculateRole1QsezDamage(level, ctx.sourcePower) : 0,
  })

  if (target) {
    const random = ctx.random ?? Math.random
    const count = getRole1QsezShadowCount(target.isBoss ?? false, random)
    for (let i = 0; i < count; i++) {
      runtime.shadowSerial += 1
      runtime.shadows.push({
        id: `shadow-${runtime.shadowSerial}`,
        x: target.x + (random() - 0.5) * shadowSpawnSpreadX,
        y: target.y,
        qsezLevel: level,
        remainingMs: shadowLifetimeMs,
      })
    }
  }

  return { ok: true, skillId: 'qsez', mpBefore, mpAfter: mp.mp, mpCost, hitboxes: [dashHitbox], reentered: false }
}

/** Source: pickHyjjTarget, Role1FinisherSkillSystem.ts:368-380. */
function pickHyjjTarget(runtime: Role1SkillRuntime, ctx: Role1CastContext): Role1Target | undefined {
  const facingTargets = (ctx.targets ?? []).filter((target) =>
    target.isAlive && (ctx.facingX < 0 ? target.x < ctx.x : target.x > ctx.x),
  )
  if (facingTargets.length === 0) return undefined
  const target = facingTargets[runtime.hyjjTargetCursor % facingTargets.length]
  runtime.hyjjTargetCursor = (runtime.hyjjTargetCursor + 1) % facingTargets.length
  return target
}

function castHyjj(
  runtime: Role1SkillRuntime,
  mp: SkillMpPool,
  level: number,
  mpCost: number,
  ctx: Role1CastContext,
): Role1CastResult {
  // kagami finds the target *before* spending MP, and rejects the cast (no MP
  // spent) if none is found — Role1FinisherSkillSystem.ts:309-313.
  const target = pickHyjjTarget(runtime, ctx)
  if (!target) return { ok: false, skillId: 'hyjj', reason: 'no-target' }
  if (mp.mp < mpCost) return { ok: false, skillId: 'hyjj', reason: 'mp' }

  const mpBefore = mp.mp
  mp.mp -= mpCost
  runtime.cooldownMs = actionMsBySkill.hyjj

  const damage = calculateRole1HyjjDamage(level, ctx.sourcePower)
  const hitboxes: SkillHitbox[] = []
  // Source: hyjjExplosionProjectileTuning, Role1FinisherSkillSystem.ts:107-126,
  // 4 staggered explosions 1.2s apart at the target.
  for (let i = 0; i < hyjjExplosionCount; i++) {
    hitboxes.push(hitbox({
      actionName: 'hit12', offsetX: target.x - ctx.x, offsetY: 0, width: 220, height: 180,
      lifetimeMs: 520, attackKind: 'magic', hitIntervalFrames: 5, maxHits: 15,
      activeAfterMs: i * hyjjExplosionIntervalMs, damage,
    }))
  }
  // Source: hyjjCastVisualTuning, Role1FinisherSkillSystem.ts:128-147 — a
  // damage-less cosmetic cast effect on the caster.
  hitboxes.push(hitbox({
    actionName: 'hit12_1', offsetX: 21, offsetY: -10, width: 96, height: 120,
    lifetimeMs: actionMsBySkill.hyjj, attackKind: 'magic', damage: 0, visualOnly: true,
  }))

  return { ok: true, skillId: 'hyjj', mpBefore, mpAfter: mp.mp, mpCost, hitboxes, reentered: false }
}
