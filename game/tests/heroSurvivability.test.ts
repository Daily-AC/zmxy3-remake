import { describe, expect, it } from 'vitest'
import {
  HERO_MAGIC_DEF_CAP,
  SURVIVABILITY_DEF_SCALE,
  SURVIVABILITY_MAXHP_SCALE,
  heroEffectiveBaseDefAt,
  heroEffectiveDef,
  heroEffectiveMaxHp,
  heroEffectiveMaxHpAt,
  heroMagicDefFraction,
} from '../src/systems/heroSurvivability'
import { getLevelStats } from '../src/systems/progression'

describe('heroSurvivability: original level curve passthrough', () => {
  it('does not multiply the original maxHp curve', () => {
    const level1 = getLevelStats(1, 1)
    const level15 = getLevelStats(1, 15)

    expect(SURVIVABILITY_MAXHP_SCALE).toBe(1)
    expect(heroEffectiveMaxHp(level1.maxHp)).toBe(level1.maxHp)
    expect(heroEffectiveMaxHp(level15.maxHp)).toBe(level15.maxHp)
    expect(heroEffectiveMaxHpAt(1, 15)).toBe(level15.maxHp)
  })

  it('does not multiply the original physical-defense curve', () => {
    const level15 = getLevelStats(1, 15)
    const level22 = getLevelStats(1, 22)

    expect(SURVIVABILITY_DEF_SCALE).toBe(1)
    expect(heroEffectiveDef(level15.def)).toBe(level15.def)
    expect(heroEffectiveDef(level22.def)).toBe(level22.def)
    expect(heroEffectiveBaseDefAt(1, 22)).toBe(level22.def)
  })
})

describe('heroSurvivability: magic-def growth curve', () => {
  it('anchors at 10% (L10), 35% (L30), caps at 50%, floors at 0 (L1)', () => {
    expect(heroMagicDefFraction(10)).toBeCloseTo(0.1, 10)
    expect(heroMagicDefFraction(30)).toBeCloseTo(0.35, 10)
    expect(heroMagicDefFraction(42)).toBeCloseTo(HERO_MAGIC_DEF_CAP, 10)
    expect(heroMagicDefFraction(100)).toBe(HERO_MAGIC_DEF_CAP)
    expect(heroMagicDefFraction(1)).toBe(0)
  })

  it('is monotonic non-decreasing across the campaign level range', () => {
    for (let level = 1; level < 60; level++) {
      expect(heroMagicDefFraction(level + 1)).toBeGreaterThanOrEqual(heroMagicDefFraction(level))
    }
  })
})
