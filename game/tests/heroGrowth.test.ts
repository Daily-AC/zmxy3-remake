import { describe, it, expect } from 'vitest'
import {
  recoverRole1LevelStats,
  recoverExpToNextLevel,
  getDailyLuckRange,
  rollDailyLuck,
  applyHeroHpChange,
  applyHeroHpDelta,
  magicRingHealAmount,
  immortalityPillUseCap,
} from '../src/systems/heroGrowth'
import { getLevelStats, getExpToNextLevel } from '../src/systems/progression'

// This is the core deliverable of this task: prove progression.ts's
// kagami-ported curve is byte-for-byte identical to an INDEPENDENT
// re-derivation straight from export.hero.Role1.as's upGrade() (this file's
// own implementation, not a re-export of progression.ts's functions). If
// kagami's port had drifted the way its normal-attack/skill formulas did,
// this would catch it.
describe('recoverRole1LevelStats matches progression.ts exactly (kagami\'s curve WAS faithful)', () => {
  for (const level of [1, 2, 7, 10, 13, 19, 25, 40, 60, 90]) {
    it(`level ${level}`, () => {
      const recovered = recoverRole1LevelStats(level)
      const current = getLevelStats(1, level)
      expect(recovered).toEqual({
        maxHp: current.maxHp,
        maxMp: current.maxMp,
        atk: current.atk,
        def: current.def,
      })
    })
  }

  it('spot values against export.hero.Role1.as upGrade() literals', () => {
    expect(recoverRole1LevelStats(1)).toEqual({ maxHp: 80, maxMp: 50, atk: 10, def: 2 })
    expect(recoverRole1LevelStats(10)).toEqual({ maxHp: 530, maxMp: 230, atk: 55, def: 20 })
  })
})

describe('recoverExpToNextLevel matches progression.ts\'s getExpToNextLevel', () => {
  for (const level of [1, 6, 7, 12, 13, 18, 19, 20, 50]) {
    it(`level ${level}`, () => {
      expect(recoverExpToNextLevel(level)).toBe(getExpToNextLevel(level))
    })
  }
})

describe('daily luck (user/User.as setTadayLuckValue())', () => {
  it('widens the roll range across the three level tiers', () => {
    expect(getDailyLuckRange(1)).toEqual({ min: 1, max: 5 })
    expect(getDailyLuckRange(4)).toEqual({ min: 1, max: 5 })
    expect(getDailyLuckRange(5)).toEqual({ min: 1, max: 10 })
    expect(getDailyLuckRange(10)).toEqual({ min: 1, max: 10 })
    expect(getDailyLuckRange(11)).toEqual({ min: 1, max: 20 })
    expect(getDailyLuckRange(90)).toEqual({ min: 1, max: 20 })
  })

  it('rollDailyLuck stays within the tier range at its random() extremes', () => {
    expect(rollDailyLuck(1, () => 0)).toBe(1)
    expect(rollDailyLuck(1, () => 1)).toBe(5)
    expect(rollDailyLuck(10, () => 0)).toBe(1)
    expect(rollDailyLuck(10, () => 1)).toBe(10)
    expect(rollDailyLuck(50, () => 0)).toBe(1)
    expect(rollDailyLuck(50, () => 1)).toBe(20)
  })
})

describe('applyHeroHpChange / applyHeroHpDelta (ERLANGSHEN_HP_REJECT gating)', () => {
  it('applies a heal normally when not heal-blocked', () => {
    expect(applyHeroHpChange(50, 80, 100, false)).toBe(80)
  })

  it('drops the ENTIRE heal attempt (no partial application) while heal-blocked', () => {
    expect(applyHeroHpChange(50, 80, 100, true)).toBe(50)
  })

  it('still applies damage (a decrease) even while heal-blocked', () => {
    expect(applyHeroHpChange(50, 20, 100, true)).toBe(20)
  })

  it('clamps to [0, maxHp] regardless of heal-block state', () => {
    expect(applyHeroHpChange(50, 150, 100, false)).toBe(100)
    expect(applyHeroHpChange(50, -10, 100, false)).toBe(0)
  })

  it('applyHeroHpDelta is a signed-amount convenience wrapper with the same gating', () => {
    expect(applyHeroHpDelta(50, 30, 100, false)).toBe(80)
    expect(applyHeroHpDelta(50, 30, 100, true)).toBe(50) // heal blocked
    expect(applyHeroHpDelta(50, -30, 100, true)).toBe(20) // damage unaffected
  })
})

describe('known heal sources', () => {
  it('magicRingHealAmount always exceeds maxHp at ringLevel>=1 (functionally a full heal after clamping)', () => {
    expect(magicRingHealAmount(1000, 1)).toBeGreaterThanOrEqual(1000)
    expect(applyHeroHpChange(1, magicRingHealAmount(1000, 1), 1000, false)).toBe(1000)
  })

  it('a heal-blocked hero gets nothing from the magic ring either (no original-game exception)', () => {
    expect(applyHeroHpChange(500, magicRingHealAmount(1000, 1), 1000, true)).toBe(500)
  })

  it('immortalityPillUseCap is tier+1', () => {
    expect(immortalityPillUseCap(0)).toBe(1)
    expect(immortalityPillUseCap(4)).toBe(5)
  })
})
