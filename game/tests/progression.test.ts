import { describe, it, expect } from 'vitest'
import {
  createProgression,
  gainExp,
  getExpToNextLevel,
  getLevelStats,
  ProgressionTuning,
} from '../src/systems/progression'

describe('hero level/exp progression (kagami ProgressionSystem port)', () => {
  it('starts at level 1 with the level-1 exp curve', () => {
    const state = createProgression(1)
    expect(state.level).toBe(1)
    expect(state.exp).toBe(0)
    expect(state.expToNext).toBe(getExpToNextLevel(1))
    expect(state.expToNext).toBe(135) // 135 + 10*(1-1)
  })

  it('single kill adds exp without leveling up', () => {
    const state = createProgression(1)
    const result = gainExp(state, 50)
    expect(state.level).toBe(1)
    expect(state.exp).toBe(50)
    expect(result.levelsGained).toBe(0)
    expect(result.expBefore).toBe(0)
    expect(result.expAfter).toBe(50)
    expect(result.appliedExp).toBe(50)
  })

  it('exp exactly filling the bar levels up once with zero leftover', () => {
    const state = createProgression(1)
    const needed = state.expToNext // 135
    const result = gainExp(state, needed)
    expect(result.levelsGained).toBe(1)
    expect(state.level).toBe(2)
    expect(state.exp).toBe(0)
    expect(state.expToNext).toBe(getExpToNextLevel(2))
  })

  it('exp past the bar levels up and carries the remainder', () => {
    const state = createProgression(1)
    const result = gainExp(state, 140) // 135 to clear Lv1, 5 left over
    expect(result.levelsGained).toBe(1)
    expect(state.level).toBe(2)
    expect(state.exp).toBe(5)
  })

  it('a single large award crosses multiple levels in one call', () => {
    const state = createProgression(1)
    // Sum of exp-to-next for levels 1..6 (all in the <7 tier: 135..185).
    let total = 0
    for (let lv = 1; lv <= 6; lv++) total += getExpToNextLevel(lv)
    const result = gainExp(state, total + 20)
    expect(result.levelsGained).toBe(6)
    expect(state.level).toBe(7)
    expect(state.exp).toBe(20)
  })

  it('caps at level 90 and does not bank overflow exp', () => {
    // Kagami's curve has level 89's expToNext fall through to the
    // maxLevelExpToNext sentinel (the tier check is `level < 89`, not
    // `< 90`), so 89->90 alone needs near-a-billion exp -- ported verbatim,
    // not smoothed out, per the fidelity requirement.
    const state = createProgression(1, 89, 0)
    expect(state.expToNext).toBe(ProgressionTuning.maxLevelExpToNext)

    const notEnough = gainExp(state, 10_000_000)
    expect(notEnough.levelsGained).toBe(0)
    expect(state.level).toBe(89) // far short of the level-89 sentinel requirement

    const result = gainExp(state, ProgressionTuning.maxLevelExpToNext)
    expect(state.level).toBe(ProgressionTuning.maxLevel)
    expect(result.levelAfter).toBe(90)
    expect(state.expToNext).toBe(ProgressionTuning.maxLevelExpToNext)
    expect(state.exp).toBeLessThan(state.expToNext)

    // Further exp at max level is a no-op on level (already capped).
    const again = gainExp(state, 999)
    expect(again.levelAfter).toBe(90)
    expect(state.level).toBe(90)
  })

  it('createProgression clamps an out-of-range level into [1, maxLevel]', () => {
    const tooHigh = createProgression(1, 999)
    expect(tooHigh.level).toBe(90)
    const tooLow = createProgression(1, -5)
    expect(tooLow.level).toBe(1)
  })

  it('non-positive or fractional exp is floored and never subtracted', () => {
    const state = createProgression(1)
    gainExp(state, 10)
    const before = state.exp
    const zero = gainExp(state, 0)
    expect(zero.levelsGained).toBe(0)
    expect(zero.appliedExp).toBe(0)
    expect(state.exp).toBe(before)

    const negative = gainExp(state, -50)
    expect(negative.appliedExp).toBe(0)
    expect(state.exp).toBe(before)

    const fractional = gainExp(state, 3.9)
    expect(fractional.appliedExp).toBe(3)
    expect(state.exp).toBe(before + 3)
  })

  it('exp-to-next curve matches the four tuning breakpoints', () => {
    expect(getExpToNextLevel(1)).toBe(135)
    expect(getExpToNextLevel(6)).toBe(135 + 10 * 5)
    expect(getExpToNextLevel(7)).toBe(625)
    expect(getExpToNextLevel(12)).toBe(625 + 50 * 5)
    expect(getExpToNextLevel(13)).toBe(1950)
    expect(getExpToNextLevel(18)).toBe(1950 + 100 * 5)
    expect(getExpToNextLevel(19)).toBe(5000)
    expect(getExpToNextLevel(88)).toBe(5000 + 5000 * (88 - 19))
    expect(getExpToNextLevel(89)).toBe(ProgressionTuning.maxLevelExpToNext)
    expect(getExpToNextLevel(90)).toBe(ProgressionTuning.maxLevelExpToNext)
  })

  it('stats grow with level for every hero (at least maxHp/atk/def rise)', () => {
    for (const heroId of [1, 2, 3, 4, 5] as const) {
      const lv1 = getLevelStats(heroId, 1)
      const lv10 = getLevelStats(heroId, 10)
      expect(lv10.maxHp).toBeGreaterThan(lv1.maxHp)
      expect(lv10.atk).toBeGreaterThan(lv1.atk)
      expect(lv10.def).toBeGreaterThanOrEqual(lv1.def)
    }
  })

  it('level 1 base stats match kagami per-hero formulas at levelOffset 0', () => {
    expect(getLevelStats(1, 1)).toEqual({ maxHp: 80, maxMp: 50, atk: 10, def: 2 })
    expect(getLevelStats(2, 1)).toEqual({ maxHp: 50, maxMp: 100, atk: 12, def: 0 })
    expect(getLevelStats(3, 1)).toEqual({ maxHp: 100, maxMp: 35, atk: 15, def: 4 })
    expect(getLevelStats(4, 1)).toEqual({ maxHp: 70, maxMp: 70, atk: 9, def: 0 })
    expect(getLevelStats(5, 1)).toEqual({ maxHp: 70, maxMp: 55, atk: 9, def: 2 })
  })

  it('gainExp result reports statsBefore/statsAfter across a level-up', () => {
    const state = createProgression(3, 1)
    const result = gainExp(state, state.expToNext)
    expect(result.levelBefore).toBe(1)
    expect(result.levelAfter).toBe(2)
    expect(result.statsBefore).toEqual(getLevelStats(3, 1))
    expect(result.statsAfter).toEqual(getLevelStats(3, 2))
    expect(result.statsAfter.maxHp).toBeGreaterThan(result.statsBefore.maxHp)
  })
})
