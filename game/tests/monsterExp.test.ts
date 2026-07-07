// Real per-monster exp (AS3-recovered) + the natural-playthrough level
// trajectory it produces. Pins both the gap at the faithful multiplier (1) and
// the fact that the proposed ~6 reaches the survivability model's 到关等级
// target band — so a value change trips a red test either way.

import { describe, it, expect } from 'vitest'
import { MONSTER_BASE_EXP, CAMPAIGN_EXP_MULTIPLIER, monsterExp } from '../src/data/monsterExp'
import { getExpToNextLevel } from '../src/systems/progression'

// Cumulative exp to REACH level N on the real (untouched) progression curve.
function cumExpToReach(level: number): number {
  let sum = 0
  for (let l = 1; l < level; l++) sum += getExpToNextLevel(l)
  return sum
}
function levelForCumExp(exp: number): number {
  let l = 1
  while (l < 90 && exp >= cumExpToReach(l + 1)) l++
  return l
}

// Wave compositions from src/data/levels/level{1..4}.ts (boss wave last). The
// campaign spawns each monster once per its listed slot; no grinding/replay.
const CAMPAIGN: Record<1 | 2 | 3 | 4, string[][]> = {
  1: [
    ['monster8', 'monster8', 'monster30'],
    ['monster30', 'monster30', 'monster30', 'monster8'],
    ['monster7', 'monster7', 'monster8'],
    ['monster4'],
    ['monster2'],
    ['monster5'],
    ['monster3'],
  ],
  2: [
    ['monster9', 'monster10'],
    ['monster10', 'monster19', 'monster9'],
    ['monster19', 'monster10', 'monster9', 'monster19'],
    ['monster6'],
    ['monster16'],
    ['monster15'],
  ],
  3: [
    ['monster11', 'monster12'],
    ['monster13', 'monster11', 'monster12'],
    ['monster14', 'monster1', 'monster13', 'monster11'],
    ['monster21'],
    ['monster20'],
    ['monster22'],
  ],
  4: [['monster32'], ['monster33'], ['monster31'], ['monster34']],
}

/** Hero level when arriving at each level's boss, playing straight through
 * once at a given campaign exp multiplier. */
function bossArrivalLevels(multiplier: number): Record<2 | 3 | 4, number> {
  let cum = 0
  const out = {} as Record<2 | 3 | 4, number>
  for (const L of [1, 2, 3, 4] as const) {
    const waves = CAMPAIGN[L]
    let beforeBoss = 0
    for (let i = 0; i < waves.length - 1; i++)
      for (const m of waves[i]) beforeBoss += (MONSTER_BASE_EXP[m] ?? 0) * multiplier
    if (L !== 1) out[L] = levelForCumExp(cum + beforeBoss)
    const bossExp = waves[waves.length - 1].reduce((s, m) => s + (MONSTER_BASE_EXP[m] ?? 0) * multiplier, 0)
    cum += beforeBoss + bossExp
  }
  return out
}

describe('monsterExp: AS3-recovered values', () => {
  it('pins the boss + representative grunt exp (normal difficulty)', () => {
    expect(MONSTER_BASE_EXP.monster3).toBe(7) // 巫鹰
    expect(MONSTER_BASE_EXP.monster15).toBe(130) // 多闻天王
    expect(MONSTER_BASE_EXP.monster22).toBe(430) // 二郎神
    expect(MONSTER_BASE_EXP.monster34).toBe(500) // 邪.悟空
    expect(MONSTER_BASE_EXP.monster8).toBe(5) // grunt
    expect(MONSTER_BASE_EXP.monster19).toBe(28) // level-2 grunt (else branch, not 80)
    expect(MONSTER_BASE_EXP.monster30).toBe(4) // swarm imp
  })

  it('ships at multiplier 6 (structural-compression compensation, team-lead sign-off)', () => {
    expect(CAMPAIGN_EXP_MULTIPLIER).toBe(6)
    expect(monsterExp('monster22')).toBe(2580) // 430 * 6
    expect(monsterExp('unknown-species')).toBe(60) // DEFAULT 10 * 6
  })
})

describe('monsterExp: natural-playthrough trajectory', () => {
  it('faithful base values ALONE (multiplier 1) fall SHORT of the 到关等级 target', () => {
    const lv = bossArrivalLevels(1)
    // Documents WHY the multiplier is needed: real exp + steep curve +
    // compressed levels -> underleveled (L3/L4 boss reached at lv8/lv11).
    expect(lv[2]).toBe(3)
    expect(lv[3]).toBe(8)
    expect(lv[4]).toBe(11)
    expect(lv[3]).toBeLessThan(14) // below L3 target 15±1
    expect(lv[4]).toBeLessThan(19) // below L4 target 21±2
  })

  it('the SHIPPED multiplier lands both bosses inside the target band', () => {
    const lv = bossArrivalLevels(CAMPAIGN_EXP_MULTIPLIER)
    expect(lv[3]).toBeGreaterThanOrEqual(14)
    expect(lv[3]).toBeLessThanOrEqual(16) // L3 15±1 -> ~16
    expect(lv[4]).toBeGreaterThanOrEqual(19)
    expect(lv[4]).toBeLessThanOrEqual(23) // L4 21±2 -> ~20
  })
})
