import { describe, it, expect } from 'vitest'
import {
  calculateRealSkillDamage,
  splitRealSkillDamage,
  REAL_SKILL_COEFFICIENTS,
  type RealSkillId,
} from '../src/systems/skillDamageReal'
import {
  calculateRole1SlzDamage,
  calculateRole1HytjDamage,
  calculateRole1LyfbDamage,
  calculateRole1LysDamage,
  calculateRole1HmzLianZhanDamage,
  calculateRole1HmzZaDiDamage,
  calculateRole1HyjjDamage,
  calculateRole1QsezDamage,
  calculateRole1ZzDamage,
} from '../src/systems/heroSkill'

// Reference values below are independently recomputed from the raw
// coefficients transcribed in this task's report (not from this module's own
// code) via a standalone node script: for each skill,
// fixedBase*e^(fixedExponent*level) + powerBase*e^(powerExponent*level)*Hurt,
// with Hurt=100, no crit/gxp. See tasks/skill-damage-real-report.md for the
// exact script.
const REFERENCE: Record<number, Record<RealSkillId, number>> = {
  1: {
    slz: 110.212, hytj: 34.2701, lyfb: 50.0092, lys: 21.986,
    hmzLianZhan: 41.084, hmzZaDi: 164.3749,
    jdyStage1: 24.3573, jdyStage2: 24.4047,
    hyjj: 48.7778, qsez: 2.4333, zz: 275.7092,
  },
  5: {
    slz: 261.6953, hytj: 80.3605, lyfb: 118.0942, lys: 52.3388,
    hmzLianZhan: 128.617, hmzZaDi: 514.6382,
    jdyStage1: 57.2339, jdyStage2: 57.6551,
    hyjj: 115.028, qsez: 5.7067, zz: 655.8615,
  },
  10: {
    slz: 887.9866, hytj: 271.7008, lyfb: 400.02, lys: 177.8594,
    hmzLianZhan: 662.9371, hmzZaDi: 2652.819,
    jdyStage1: 193.6695, jdyStage2: 195.3956,
    hyjj: 389.6289, qsez: 19.2975, zz: 2226.7877,
  },
  18: {
    slz: 8132.0202, hytj: 2508.1855, lyfb: 3675.2776, lys: 1628.5449,
    hmzLianZhan: 11470.7837, hmzZaDi: 45903.4644,
    jdyStage1: 1786.3926, jdyStage2: 1796.1863,
    hyjj: 3585.7256, qsez: 178.171, zz: 20370.3293,
  },
}

describe('calculateRealSkillDamage vs. independently recomputed export.hero.Role1.as getRealPower2()', () => {
  for (const [levelStr, bySkill] of Object.entries(REFERENCE)) {
    const level = Number(levelStr)
    for (const [skillId, expected] of Object.entries(bySkill) as [RealSkillId, number][]) {
      it(`${skillId} at level ${level}, atk=100 (no crit/gxp)`, () => {
        const actual = calculateRealSkillDamage(skillId, level, 100, { critChance: 0 })
        expect(actual).toBeCloseTo(expected, 3)
      })
    }
  }
})

describe('crit/gxp only scale the Hurt-dependent power term, not the fixed level term', () => {
  it('crit doubles just the power part', () => {
    const base = splitRealSkillDamage('slz', 5, 100, { critChance: 0 })
    const crit = splitRealSkillDamage('slz', 5, 100, { forceCrit: true })
    expect(crit.fixedPart).toBeCloseTo(base.fixedPart, 6) // unaffected by crit
    expect(crit.powerPart).toBeCloseTo(base.powerPart * 2, 6)
    expect(crit.total).toBeCloseTo(base.fixedPart + base.powerPart * 2, 6)
  })

  it('gxp (1.5x) only scales the power part', () => {
    const base = splitRealSkillDamage('zz', 10, 200, { critChance: 0 })
    const gxp = splitRealSkillDamage('zz', 10, 200, { critChance: 0, isGxp: true })
    expect(gxp.fixedPart).toBeCloseTo(base.fixedPart, 6)
    expect(gxp.powerPart).toBeCloseTo(base.powerPart * 1.5, 6)
  })
})

describe('hit10_3 has no damage in the real client (empty AS3 branch, not modeled here)', () => {
  it('is not part of the exported skill id union', () => {
    const ids = Object.keys(REAL_SKILL_COEFFICIENTS)
    expect(ids).not.toContain('hmzHit10_3')
    expect(ids).toHaveLength(11)
  })
})

describe('real AS3 formula vs. kagami\'s already-shipped heroSkill.ts port (documented discrepancy, not fixed)', () => {
  it('diverges materially at level 1, atk=100 -- kagami is NOT a faithful port of the real formula', () => {
    const atk = 100
    const real = calculateRealSkillDamage('slz', 1, atk, { critChance: 0 })
    const kagami = calculateRole1SlzDamage(1, atk)
    // Not asserting a specific ratio (that's report material) -- just proving
    // they are NOT close, so nobody mistakes heroSkill.ts for this recovery.
    expect(Math.abs(kagami - real) / real).toBeGreaterThan(1) // >100% apart
  })

  it('every ported skill in heroSkill.ts diverges from its real-AS3 counterpart at level 1, atk=100', () => {
    const atk = 100
    const pairs: [RealSkillId, (level: number, power: number) => number][] = [
      ['slz', calculateRole1SlzDamage],
      ['hytj', calculateRole1HytjDamage],
      ['lyfb', calculateRole1LyfbDamage],
      ['lys', calculateRole1LysDamage],
      ['hmzLianZhan', calculateRole1HmzLianZhanDamage],
      ['hmzZaDi', calculateRole1HmzZaDiDamage],
      ['hyjj', calculateRole1HyjjDamage],
      ['qsez', calculateRole1QsezDamage],
      ['zz', calculateRole1ZzDamage],
    ]
    for (const [skillId, kagamiFn] of pairs) {
      const real = calculateRealSkillDamage(skillId, 1, atk, { critChance: 0 })
      const kagami = kagamiFn(1, atk)
      expect(Math.abs(kagami - real) / real).toBeGreaterThan(0.2) // all at least 20% apart, most much more
    }
  })
})
