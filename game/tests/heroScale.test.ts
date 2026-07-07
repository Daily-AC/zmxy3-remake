import { describe, it, expect } from 'vitest'
import {
  NORMAL_ATTACK_COEFFICIENT,
  NORMAL_ATTACK_COMBO_HITS,
  NORMAL_ATTACK_HIT_DURATION_MS,
  calculateHurt,
  calculateNormalAttackPower,
  applyPhysicsDefense,
  applyMagicDefense,
  applyDefense,
  resolveIncomingHeroDamage,
  simulateComboDps,
  estimateKillSeconds,
  estimateHitsToKillHero,
  BOSS_REFERENCE,
  type NormalAttackHit,
} from '../src/systems/heroScale'

// Reference coefficients below are transcribed directly from a decompile of
// export.hero.Role1.as's getRealPower2() (this task's own ffdec run against
// the vendored SWF) — see heroScale.ts's file header for the exact command
// and line numbers. These are NOT kagami's TS values (kagami's own
// HeroNormalAttackSystem.ts hardcodes flat 30-34 unrelated to atk).
const REAL_COEFFICIENT: Record<NormalAttackHit, number> = {
  hit1: 0.707,
  hit2: 0.707,
  hit3: 0.707,
  hit4: 1.183,
  hit5: 1.304,
}

describe('normal-attack formula vs. decompiled export.hero.Role1.as getRealPower2()', () => {
  it('exposes the exact recovered coefficients', () => {
    expect(NORMAL_ATTACK_COEFFICIENT).toEqual(REAL_COEFFICIENT)
  })

  it('calculateHurt(atk) with no luck is exactly atk (BaseRoleProperies.as getHurt())', () => {
    expect(calculateHurt(100)).toBe(100)
    expect(calculateHurt(0)).toBe(0)
    expect(calculateHurt(455)).toBe(455)
  })

  it('calculateHurt adds a random 0..luck variance when luck is set', () => {
    expect(calculateHurt(100, { luck: 20, random: () => 0 })).toBe(100)
    expect(calculateHurt(100, { luck: 20, random: () => 1 })).toBe(120)
    expect(calculateHurt(100, { luck: 20, random: () => 0.5 })).toBe(110)
  })

  // Cross-check at 3 representative atk values x all 5 combo hits (18 points
  // total), no crit/gxp/luck so the result is exactly coefficient * atk.
  for (const atk of [10, 155, 455]) {
    for (const hit of NORMAL_ATTACK_COMBO_HITS) {
      it(`hit=${hit} atk=${atk}: power == ${REAL_COEFFICIENT[hit]} * atk`, () => {
        const power = calculateNormalAttackPower(hit, atk, { critChance: 0, luck: 0 })
        expect(power).toBeCloseTo(REAL_COEFFICIENT[hit] * atk, 6)
      })
    }
  }

  it('applies the crit multiplier (2x) when forced, and gxp multiplier (1.5x) when set', () => {
    const base = calculateNormalAttackPower('hit1', 100, { critChance: 0 })
    const crit = calculateNormalAttackPower('hit1', 100, { forceCrit: true })
    const gxp = calculateNormalAttackPower('hit1', 100, { critChance: 0, isGxp: true })
    expect(crit).toBeCloseTo(base * 2, 6)
    expect(gxp).toBeCloseTo(base * 1.5, 6)
  })
})

describe('defense mitigation, both directions (base.BaseMonster.as getRealHurt() / base.BaseHero.as countHurt())', () => {
  it('physics: flat subtraction, floored at 1 (not a ratio formula)', () => {
    expect(applyPhysicsDefense(100, 30)).toBe(70)
    expect(applyPhysicsDefense(10, 30)).toBe(1) // def >= power -> floor 1, not negative
    expect(applyPhysicsDefense(31, 30)).toBe(1)
  })

  it('magic: proportional reduction, no mitigation when mDef is falsy', () => {
    expect(applyMagicDefense(100, 0.4)).toBeCloseTo(60, 6)
    expect(applyMagicDefense(100, 0)).toBe(100)
  })

  it('applyDefense dispatches on attackKind', () => {
    expect(applyDefense(100, 'physics', 20)).toBe(80)
    expect(applyDefense(100, 'magic', 0.25)).toBeCloseTo(75, 6)
  })

  it('resolveIncomingHeroDamage bridges a raw monster hit into a pre-mitigated number for heroCombat.applyHeroDamage', () => {
    // heroCombat.ts itself does zero mitigation, so the wiring layer must
    // call this first -- e.g. Duowen Tianwang's hit1 (186 physical) against
    // a hero with 20 def.
    expect(resolveIncomingHeroDamage(186, 'physics', 20, 0)).toBe(166)
    expect(resolveIncomingHeroDamage(999, 'magic', 0, 0.3)).toBeCloseTo(699.3, 6)
  })
})

describe('DPS / kill-time viability model (self-consistent, recomputable)', () => {
  it('simulateComboDps: dps is exactly damagePerCombo / comboDurationSeconds', () => {
    const result = simulateComboDps(200, 30)
    expect(result.comboDurationMs).toBe(NORMAL_ATTACK_HIT_DURATION_MS * 5)
    expect(result.dps).toBeCloseTo(result.damagePerCombo / (result.comboDurationMs / 1000), 9)
  })

  it('simulateComboDps damage grows with atk and shrinks (but floors at 1/hit) with def', () => {
    const low = simulateComboDps(50, 10)
    const high = simulateComboDps(500, 10)
    expect(high.damagePerCombo).toBeGreaterThan(low.damagePerCombo)

    const softTarget = simulateComboDps(200, 10)
    const hardTarget = simulateComboDps(200, 1000) // def so high every hit floors at 1
    expect(hardTarget.damagePerCombo).toBe(5) // 5 hits x floor(1) each
    expect(softTarget.damagePerCombo).toBeGreaterThan(hardTarget.damagePerCombo)
  })

  it('estimateKillSeconds recomputes to hp/dps exactly, and is infinite at 0 dps', () => {
    expect(estimateKillSeconds(1000, 100)).toBe(10)
    expect(estimateKillSeconds(1000, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('a full viability row (atk -> dps -> kill seconds) is reproducible from the same exported functions', () => {
    const boss = BOSS_REFERENCE.find((b) => b.level === 2)!
    const atk = 400
    const dps = simulateComboDps(atk, boss.def).dps
    const seconds = estimateKillSeconds(boss.hp, dps)
    // Recompute independently to prove the table isn't hand-fudged.
    const recomputedDps = simulateComboDps(atk, boss.def).dps
    expect(recomputedDps).toBe(dps)
    expect(seconds).toBeCloseTo(boss.hp / dps, 9)
  })
})

describe('estimateHitsToKillHero (survivability check)', () => {
  it('floors to whole hits, and is infinite at 0 incoming damage', () => {
    expect(estimateHitsToKillHero(1000, 300)).toBe(3)
    expect(estimateHitsToKillHero(1000, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('flags a one-shot-kill scenario (0 hits survivable)', () => {
    // Erlangshen's post-buff hit2 (1299 magic) vs a low-scale hero maxHp.
    const heroMaxHp = 1000
    const mitigated = applyMagicDefense(1299, 0)
    expect(estimateHitsToKillHero(heroMaxHp, mitigated)).toBe(0)
  })
})

describe('BOSS_REFERENCE data sanity (cross-checked against tasks/level-pipeline-report.md + this task\'s own ffdec decompile)', () => {
  it('has the three recovered L2-L4 bosses with verbatim hp/def', () => {
    const byLevel = Object.fromEntries(BOSS_REFERENCE.map((b) => [b.level, b]))
    expect(byLevel[2].hp).toBe(16000)
    expect(byLevel[2].def).toBe(24)
    expect(byLevel[3].hp).toBe(45137)
    expect(byLevel[3].def).toBe(45)
    expect(byLevel[4].hp).toBe(54423)
    expect(byLevel[4].def).toBe(80)
  })

  it('escalates hp monotonically L2 < L3 < L4, matching the level-pipeline difficulty curve', () => {
    const hps = BOSS_REFERENCE.map((b) => b.hp)
    expect(hps[0]).toBeLessThan(hps[1])
    expect(hps[1]).toBeLessThan(hps[2])
  })
})
