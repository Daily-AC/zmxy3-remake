// Hero level/exp growth. Ported from kagami-phaser's
// src/systems/ProgressionSystem.ts (see zmxy3-remake root CLAUDE.md: 移植 >
// 重写). Pure logic, no Phaser dependency.
//
// Adaptations vs. kagami:
//  - `power`/`defense` renamed to `atk`/`def` to match this project's stat
//    naming (see effects.ts BaseStats), `currentExp` renamed to `exp`.
//  - Dropped `lastResult`/`formatHeroProgression` (UI log string) and the
//    `setHeroProgressionHero` setter (trivial field assignment) -- not asked
//    for here.
//  - `HeroId` and `HeroLevelStats` are defined locally instead of imported
//    from kagami's HeroNormalAttackSystem/EquipmentSystem, which don't exist
//    in this codebase. Our project currently has no multi-hero roster
//    (BattleScene.ts uses one hardcoded HERO_BASE_ATK/HERO_MAX_HP) and
//    heroSim.ts's HeroState carries no hp/atk/level fields at all -- so this
//    module is intentionally standalone rather than added onto HeroState.
//    Whoever wires up leveling composes a HeroProgressionState alongside the
//    existing HeroState instead of merging the two.
//  - Kill-exp sourcing (monster -> gainExp amount) is left to the caller.
//    Our monster data (src/data/monsters/*.json) has no `exp` field yet, so
//    there's nothing to read here; the integration step will need to add one
//    or decide amounts some other way.

export type HeroId = 1 | 2 | 3 | 4 | 5

export interface HeroLevelStats {
  maxHp: number
  maxMp: number
  atk: number
  def: number
}

export interface HeroProgressionState {
  heroId: HeroId
  level: number
  exp: number
  expToNext: number
}

export interface GainExpResult {
  expBefore: number
  expAfter: number
  levelBefore: number
  levelAfter: number
  levelsGained: number
  statsBefore: HeroLevelStats
  statsAfter: HeroLevelStats
  appliedExp: number
}

export const ProgressionTuning = {
  maxLevel: 90,
  maxLevelExpToNext: 999_999_999,
} as const

/**
 * Kagami splits kill exp so that when a pet occupies the active battle slot,
 * BOTH hero and pet independently receive floor(killExp * ratio) -- a
 * double-award, not a 100% split (PetConsumableSystem.
 * awardMonsterExperienceWithCurrentPet in the kagami source). Without an
 * active pet the hero just gets the full amount. We have no pet system yet,
 * so nothing here applies this ratio -- it's kept as a reference for whoever
 * wires up pet exp later; the caller of gainExp is responsible for splitting
 * amount before calling.
 */
export const PET_SHARED_EXP_RATIO = 0.6

export function createProgression(
  heroId: HeroId,
  level = 1,
  exp = 0,
): HeroProgressionState {
  const normalizedLevel = normalizeLevel(level)
  const expToNext = getExpToNextLevel(normalizedLevel)
  return {
    heroId,
    level: normalizedLevel,
    exp: clampExp(exp, expToNext),
    expToNext,
  }
}

/**
 * Apply `amount` exp to `state` in place, resolving zero or more level-ups
 * (loops so a single large award can cross several levels). Levels beyond
 * `ProgressionTuning.maxLevel` are clamped; exp earned past the cap is
 * discarded rather than banked.
 */
export function gainExp(state: HeroProgressionState, amount: number): GainExpResult {
  const appliedExp = Math.max(0, Math.floor(amount))
  const levelBefore = state.level
  const expBefore = state.exp
  const statsBefore = getLevelStats(state.heroId, state.level)

  if (appliedExp <= 0) {
    return buildResult(state, levelBefore, expBefore, statsBefore, 0, appliedExp)
  }

  state.exp += appliedExp
  let levelsGained = 0

  while (
    state.level < ProgressionTuning.maxLevel &&
    state.exp >= state.expToNext
  ) {
    state.exp -= state.expToNext
    state.level += 1
    levelsGained += 1
    state.expToNext = getExpToNextLevel(state.level)
  }

  if (state.level >= ProgressionTuning.maxLevel) {
    state.level = ProgressionTuning.maxLevel
    state.expToNext = ProgressionTuning.maxLevelExpToNext
    state.exp = Math.min(state.exp, state.expToNext - 1)
  }

  return buildResult(state, levelBefore, expBefore, statsBefore, levelsGained, appliedExp)
}

/** Exp required to go from `level` to `level + 1` (kagami's curve, verbatim). */
export function getExpToNextLevel(level: number): number {
  const normalizedLevel = normalizeLevel(level)
  if (normalizedLevel < 7) {
    return 135 + 10 * (normalizedLevel - 1)
  }
  if (normalizedLevel < 13) {
    return 625 + 50 * (normalizedLevel - 7)
  }
  if (normalizedLevel < 19) {
    return 1950 + 100 * (normalizedLevel - 13)
  }
  if (normalizedLevel < 89) {
    return 5000 + 5000 * (normalizedLevel - 19)
  }
  return ProgressionTuning.maxLevelExpToNext
}

/** Base stats at `level` for `heroId` (kagami's per-hero curves, verbatim). */
export function getLevelStats(heroId: HeroId, level: number): HeroLevelStats {
  const levelOffset = normalizeLevel(level) - 1

  switch (heroId) {
    case 1:
      return {
        maxHp: 80 + 50 * levelOffset,
        maxMp: 50 + 20 * levelOffset,
        atk: 10 + 5 * levelOffset,
        def: 2 + 2 * levelOffset,
      }
    case 2:
      return {
        maxHp: 50 + 20 * levelOffset,
        maxMp: 100 + 40 * levelOffset,
        atk: 12 + 8 * levelOffset,
        def: levelOffset,
      }
    case 3:
      return {
        maxHp: 100 + 70 * levelOffset,
        maxMp: 35 + 15 * levelOffset,
        atk: 15 + 8 * levelOffset,
        def: 4 + levelOffset,
      }
    case 4:
      return {
        maxHp: 70 + 30 * levelOffset,
        maxMp: 70 + 30 * levelOffset,
        atk: 9 + 4 * levelOffset,
        def: levelOffset,
      }
    case 5:
      return {
        maxHp: 70 + 49 * levelOffset,
        maxMp: 55 + 24 * levelOffset,
        atk: 9 + 6 * levelOffset,
        def: 2 + 1.5 * levelOffset,
      }
  }
}

function normalizeLevel(level: number): number {
  return Math.min(ProgressionTuning.maxLevel, Math.max(1, Math.floor(level)))
}

function clampExp(value: number, expToNext: number): number {
  return Math.min(
    Math.max(0, Math.floor(value)),
    Math.max(0, expToNext - 1),
  )
}

function buildResult(
  state: HeroProgressionState,
  levelBefore: number,
  expBefore: number,
  statsBefore: HeroLevelStats,
  levelsGained: number,
  appliedExp: number,
): GainExpResult {
  return {
    expBefore,
    expAfter: state.exp,
    levelBefore,
    levelAfter: state.level,
    levelsGained,
    statsBefore,
    statsAfter: getLevelStats(state.heroId, state.level),
    appliedExp,
  }
}
