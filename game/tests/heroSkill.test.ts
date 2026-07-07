import { describe, it, expect } from 'vitest'
import {
  calculateRole1SlzDamage,
  calculateRole1LysDamage,
  calculateRole1HytjDamage,
  calculateRole1LyfbDamage,
  calculateRole1JdyDamage,
  calculateRole1HmzLianZhanDamage,
  calculateRole1HmzZaDiDamage,
  calculateRole1HyjjDamage,
  calculateRole1QsezDamage,
  calculateRole1ZzDamage,
  calculateRole1ShadowZzDamage,
  calculateRole1LifeSteal,
  getRole1SkillMpCost,
  createRole1SkillRuntime,
  syncRole1SkillLevels,
  tickRole1SkillRuntime,
  tryCastRole1Skill,
  type Role1CastContext,
  type Role1SkillRuntime,
  type SkillMpPool,
} from '../src/systems/heroSkill'

// Reference values below are independently recomputed straight from the raw
// kagami source (not from this port) — see the verification script used
// while writing this port. power=100 in all cases.
describe('heroSkill damage formulas (vs. independently recomputed kagami values)', () => {
  it('slz/lys/hytj/lyfb/jdy at level 1', () => {
    expect(calculateRole1SlzDamage(1, 100)).toBeCloseTo(731.52, 6)
    expect(calculateRole1LysDamage(1, 100)).toBeCloseTo(609.6, 6)
    expect(calculateRole1HytjDamage(1, 100)).toBeCloseTo(198.12, 6)
    expect(calculateRole1LyfbDamage(1, 100)).toBeCloseTo(71.12, 6)
    expect(calculateRole1JdyDamage(1, 100)).toBeCloseTo(74.93, 6)
  })

  it('slz/lys/hytj/lyfb/jdy at level 9', () => {
    expect(calculateRole1SlzDamage(9, 100)).toBeCloseTo(24847.55, 6)
    expect(calculateRole1LysDamage(9, 100)).toBeCloseTo(20706.08, 6)
    expect(calculateRole1HytjDamage(9, 100)).toBeCloseTo(6728.46, 6)
    expect(calculateRole1LyfbDamage(9, 100)).toBeCloseTo(2415.54, 6)
    expect(calculateRole1JdyDamage(9, 100)).toBeCloseTo(2547.62, 6)
  })

  it('slz/lys/hytj/lyfb/jdy at level 18 (cap)', () => {
    expect(calculateRole1SlzDamage(18, 100)).toBeCloseTo(124099.32, 6)
    expect(calculateRole1LysDamage(18, 100)).toBeCloseTo(103416.1, 6)
    expect(calculateRole1HytjDamage(18, 100)).toBeCloseTo(33609.28, 6)
    expect(calculateRole1LyfbDamage(18, 100)).toBeCloseTo(12065, 6)
    expect(calculateRole1JdyDamage(18, 100)).toBeCloseTo(12727.94, 6)
  })

  it('hmz (lianzhan+zadi) and hyjj at levels 1/9/18', () => {
    expect(calculateRole1HmzLianZhanDamage(1, 100)).toBeCloseTo(99.84359, 5)
    expect(calculateRole1HmzZaDiDamage(1, 100)).toBeCloseTo(596.44915, 5)
    expect(calculateRole1HyjjDamage(1, 100)).toBeCloseTo(73.232772, 5)

    expect(calculateRole1HmzLianZhanDamage(9, 100)).toBeCloseTo(3563.84479, 4)
    expect(calculateRole1HmzZaDiDamage(9, 100)).toBeCloseTo(20409.82075, 4)
    expect(calculateRole1HyjjDamage(9, 100)).toBeCloseTo(2484.810372, 4)

    expect(calculateRole1HmzLianZhanDamage(18, 100)).toBeCloseTo(17848.16979, 4)
    expect(calculateRole1HmzZaDiDamage(18, 100)).toBeCloseTo(102212.168575, 3)
    expect(calculateRole1HyjjDamage(18, 100)).toBeCloseTo(12409.974672, 3)
  })

  it('qsez/zz at levels 1/9/18', () => {
    expect(calculateRole1QsezDamage(1, 100)).toBeCloseTo(304.8, 6)
    expect(calculateRole1ZzDamage(1, 100)).toBeCloseTo(1024.89, 6)
    expect(calculateRole1QsezDamage(9, 100)).toBeCloseTo(10353.04, 6)
    expect(calculateRole1ZzDamage(9, 100)).toBeCloseTo(34786.57, 6)
    expect(calculateRole1QsezDamage(18, 100)).toBeCloseTo(51708.05, 6)
    expect(calculateRole1ZzDamage(18, 100)).toBeCloseTo(173738.54, 6)
  })

  it('shadow zz damage is qsez-formula * shadowZzDamageMultiplier(0.437)', () => {
    const qsezDmg = calculateRole1QsezDamage(9, 100)
    expect(calculateRole1ShadowZzDamage(9, 100)).toBeCloseTo(qsezDmg * 0.437, 6)
  })

  it('level is clamped into [1,18] the same way as clampSkillLevel', () => {
    expect(calculateRole1SlzDamage(0, 100)).toBe(calculateRole1SlzDamage(1, 100))
    expect(calculateRole1SlzDamage(999, 100)).toBe(calculateRole1SlzDamage(18, 100))
  })
})

describe('getRole1SkillMpCost (vs. independently recomputed kagami values)', () => {
  it('matches per-skill MP factors at levels 1/9/18', () => {
    expect(getRole1SkillMpCost('slz', 1)).toBe(36)
    expect(getRole1SkillMpCost('slz', 9)).toBe(440)
    expect(getRole1SkillMpCost('slz', 18)).toBe(1466)
    expect(getRole1SkillMpCost('hmz', 1)).toBe(66)
    expect(getRole1SkillMpCost('hmz', 9)).toBe(801)
    expect(getRole1SkillMpCost('hmz', 18)).toBe(2667)
    expect(getRole1SkillMpCost('hyjj', 1)).toBe(72)
    expect(getRole1SkillMpCost('hyjj', 9)).toBe(881)
    expect(getRole1SkillMpCost('hyjj', 18)).toBe(2933)
  })
})

function learnAll(runtime: Role1SkillRuntime, level = 5): void {
  syncRole1SkillLevels(runtime, {
    slz: level, lys: level, hytj: level, lyfb: level, jdy: level,
    qsez: level, zz: level, hmz: level, hyjj: level, sx: 3,
  })
}

function ctx(overrides: Partial<Role1CastContext> = {}): Role1CastContext {
  return { sourcePower: 100, x: 0, facingX: 1, ...overrides }
}

describe('tryCastRole1Skill: gating', () => {
  it('rejects a skill that has not been learned (level 0)', () => {
    const runtime = createRole1SkillRuntime()
    const mp: SkillMpPool = { mp: 9999, maxMp: 9999 }
    const result = tryCastRole1Skill(runtime, mp, 'slz', ctx())
    expect(result).toMatchObject({ ok: false, reason: 'not-learned' })
  })

  it('rejects a cast when MP is insufficient, without spending anything', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const cost = getRole1SkillMpCost('slz', 5)
    const mp: SkillMpPool = { mp: cost - 1, maxMp: cost * 2 }
    const result = tryCastRole1Skill(runtime, mp, 'slz', ctx())
    expect(result).toMatchObject({ ok: false, reason: 'mp' })
    expect(mp.mp).toBe(cost - 1)
  })

  it('a successful cast spends exactly mpCost and arms the shared cooldown', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const cost = getRole1SkillMpCost('slz', 5)
    const mp: SkillMpPool = { mp: cost + 50, maxMp: cost + 50 }
    const result = tryCastRole1Skill(runtime, mp, 'slz', ctx())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.mpCost).toBe(cost)
    expect(result.mpBefore - result.mpAfter).toBe(cost)
    expect(mp.mp).toBe(50)
    expect(runtime.cooldownMs).toBeGreaterThan(0)
  })

  it('rejects any further Role1 cast while the shared cooldown is active', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    tryCastRole1Skill(runtime, mp, 'slz', ctx())
    // Even a different skill is blocked — kagami's shared busy lock (see
    // heroSkill.ts file header) is not per-skill.
    const second = tryCastRole1Skill(runtime, mp, 'lys', ctx())
    expect(second).toMatchObject({ ok: false, reason: 'cooldown' })
  })

  it('cooldown recovers after ticking past the action duration, allowing a new cast', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const first = tryCastRole1Skill(runtime, mp, 'slz', ctx())
    expect(first.ok).toBe(true)
    const cooldownMs = runtime.cooldownMs
    tickRole1SkillRuntime(runtime, cooldownMs - 1)
    expect(tryCastRole1Skill(runtime, mp, 'lys', ctx())).toMatchObject({ ok: false, reason: 'cooldown' })
    tickRole1SkillRuntime(runtime, 1)
    expect(runtime.cooldownMs).toBe(0)
    const second = tryCastRole1Skill(runtime, mp, 'lys', ctx())
    expect(second.ok).toBe(true)
  })
})

describe('tryCastRole1Skill: jdy two-stage', () => {
  it('a second jdy press while stage 1 is pending triggers stage 2 for free', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const stage1 = tryCastRole1Skill(runtime, mp, 'jdy', ctx())
    expect(stage1.ok).toBe(true)
    if (!stage1.ok) throw new Error('unreachable')
    expect(stage1.hitboxes[0].actionName).toBe('hit11_1')
    expect(runtime.jdyStage).toBeDefined()
    const mpAfterStage1 = mp.mp

    const stage2 = tryCastRole1Skill(runtime, mp, 'jdy', ctx())
    expect(stage2.ok).toBe(true)
    if (!stage2.ok) throw new Error('unreachable')
    expect(stage2.hitboxes[0].actionName).toBe('hit11_2')
    expect(stage2.mpCost).toBe(0)
    expect(mp.mp).toBe(mpAfterStage1) // stage 2 is free
    expect(stage2.reentered).toBe(true)
    expect(runtime.jdyStage).toBeUndefined()
  })

  it('lets the jdy stage window expire back to a fresh stage 1', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    tryCastRole1Skill(runtime, mp, 'jdy', ctx())
    expect(runtime.jdyStage).toBeDefined()
    tickRole1SkillRuntime(runtime, runtime.cooldownMs) // let the window fully close
    expect(runtime.jdyStage).toBeUndefined()

    const fresh = tryCastRole1Skill(runtime, mp, 'jdy', ctx())
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) throw new Error('unreachable')
    expect(fresh.hitboxes[0].actionName).toBe('hit11_1') // stage 1 again, not stage 2
    expect(fresh.mpCost).toBeGreaterThan(0)
  })
})

describe('tryCastRole1Skill: qsez (shadow spawn)', () => {
  it('is a dash-only, 0-damage cast (but still spends MP) when no target is in range', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const result = tryCastRole1Skill(runtime, mp, 'qsez', ctx({ targets: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.mpCost).toBeGreaterThan(0)
    expect(result.hitboxes[0].damage).toBe(0)
    expect(runtime.shadows).toHaveLength(0)
  })

  it('deals damage and spawns shadow(s) when a facing target is within range', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const random = () => 0.9 // > 0.5, so no bonus shadow: getRole1QsezShadowCount(false, r) = 1
    const result = tryCastRole1Skill(
      runtime, mp, 'qsez',
      ctx({ x: 0, facingX: 1, targets: [{ id: 'm1', x: 100, y: 0, isAlive: true }], random }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.hitboxes[0].damage).toBeGreaterThan(0)
    expect(runtime.shadows).toHaveLength(1)
    expect(runtime.shadows[0].qsezLevel).toBe(5)
  })

  it('ignores a target behind the caster relative to facing direction', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const result = tryCastRole1Skill(
      runtime, mp, 'qsez',
      ctx({ x: 0, facingX: 1, targets: [{ id: 'm1', x: -100, y: 0, isAlive: true }] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.hitboxes[0].damage).toBe(0)
    expect(runtime.shadows).toHaveLength(0)
  })
})

describe('tryCastRole1Skill: zz consumes pending shadows', () => {
  it('adds shadow-derived hitboxes and clears the shadow list', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    tryCastRole1Skill(
      runtime, mp, 'qsez',
      ctx({ x: 0, facingX: 1, targets: [{ id: 'm1', x: 100, y: 0, isAlive: true, isBoss: true }], random: () => 0.9 }),
    )
    expect(runtime.shadows.length).toBeGreaterThan(0)
    const shadowCount = runtime.shadows.length
    tickRole1SkillRuntime(runtime, runtime.cooldownMs) // clear qsez's own cooldown

    const zzResult = tryCastRole1Skill(runtime, mp, 'zz', ctx())
    expect(zzResult.ok).toBe(true)
    if (!zzResult.ok) throw new Error('unreachable')
    // 2 base hitboxes + 2 per consumed shadow.
    expect(zzResult.hitboxes).toHaveLength(2 + shadowCount * 2)
    expect(runtime.shadows).toHaveLength(0)
  })
})

describe('tryCastRole1Skill: hyjj target gating', () => {
  it('rejects with no-target and spends no MP when nothing is in front', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const result = tryCastRole1Skill(runtime, mp, 'hyjj', ctx({ targets: [] }))
    expect(result).toMatchObject({ ok: false, reason: 'no-target' })
    expect(mp.mp).toBe(99999)
  })

  it('rejects a target on the wrong side of facing', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const result = tryCastRole1Skill(
      runtime, mp, 'hyjj',
      ctx({ x: 0, facingX: 1, targets: [{ id: 'm1', x: -50, y: 0, isAlive: true }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'no-target' })
  })

  it('casts a 4-explosion chain plus one visual-only cast effect on a valid target', () => {
    const runtime = createRole1SkillRuntime()
    learnAll(runtime)
    const mp: SkillMpPool = { mp: 99999, maxMp: 99999 }
    const result = tryCastRole1Skill(
      runtime, mp, 'hyjj',
      ctx({ x: 0, facingX: 1, targets: [{ id: 'm1', x: 50, y: 0, isAlive: true }] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.hitboxes).toHaveLength(5)
    const explosions = result.hitboxes.filter((h) => h.actionName === 'hit12')
    expect(explosions).toHaveLength(4)
    expect(explosions.map((h) => h.activeAfterMs)).toEqual([0, 1_200, 2_400, 3_600])
    const visual = result.hitboxes.find((h) => h.visualOnly)
    expect(visual?.damage).toBe(0)
  })
})

describe('syncRole1SkillLevels', () => {
  it('clamps active skill levels to [0,18] and sx to [0,9]', () => {
    const runtime = createRole1SkillRuntime()
    syncRole1SkillLevels(runtime, { slz: 999, hyjj: -5, sx: 999 })
    expect(runtime.levels.slz).toBe(18)
    expect(runtime.levels.hyjj).toBe(0)
    expect(runtime.levels.sx).toBe(9)
  })

  it('derives lifeSteal/crit bonus from sx level (0 when not learned)', () => {
    const runtime = createRole1SkillRuntime()
    syncRole1SkillLevels(runtime, {})
    expect(runtime.lifeStealPercent).toBe(0)
    expect(runtime.critBonusPercent).toBe(0)

    syncRole1SkillLevels(runtime, { sx: 1 })
    expect(runtime.lifeStealPercent).toBeCloseTo(0.8, 6)
    expect(runtime.critBonusPercent).toBe(4)

    syncRole1SkillLevels(runtime, { sx: 5 })
    expect(runtime.lifeStealPercent).toBeCloseTo(0.8 + 4 / 10, 6)
    expect(runtime.critBonusPercent).toBe(8)
  })
})

describe('calculateRole1LifeSteal (sx passive)', () => {
  it('heals 0 when sx is not learned', () => {
    const runtime = createRole1SkillRuntime()
    const heal = calculateRole1LifeSteal({ runtime, actualDamage: 1000, attackKind: 'physics', isDead: false })
    expect(heal).toBe(0)
  })

  it('heals lifeStealPercent% of damage on a physical hit when learned and alive', () => {
    const runtime = createRole1SkillRuntime()
    syncRole1SkillLevels(runtime, { sx: 1 }) // lifeStealPercent = 0.8
    const heal = calculateRole1LifeSteal({ runtime, actualDamage: 1000, attackKind: 'physics', isDead: false })
    expect(heal).toBe(Math.floor(1000 * 0.8 / 100))
  })

  it('heals 0 on a magic hit or when the target already died', () => {
    const runtime = createRole1SkillRuntime()
    syncRole1SkillLevels(runtime, { sx: 1 })
    expect(calculateRole1LifeSteal({ runtime, actualDamage: 1000, attackKind: 'magic', isDead: false })).toBe(0)
    expect(calculateRole1LifeSteal({ runtime, actualDamage: 1000, attackKind: 'physics', isDead: true })).toBe(0)
  })
})

describe('tickRole1SkillRuntime', () => {
  it('expires shadows once their lifetime elapses', () => {
    const runtime = createRole1SkillRuntime()
    runtime.shadows.push({ id: 's1', x: 0, y: 0, qsezLevel: 1, remainingMs: 100 })
    tickRole1SkillRuntime(runtime, 50)
    expect(runtime.shadows).toHaveLength(1)
    tickRole1SkillRuntime(runtime, 51)
    expect(runtime.shadows).toHaveLength(0)
  })
})
