import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_EXP_MULTIPLIER,
  DEFAULT_MONSTER_EXP,
  MONSTER_BASE_EXP,
  monsterExp,
} from '../src/data/monsterExp'

describe('monsterExp: original normal-difficulty values', () => {
  it('uses the recovered early-stage grunt and boss exp without campaign compensation', () => {
    expect(MONSTER_BASE_EXP.monster8).toBe(3)
    expect(MONSTER_BASE_EXP.monster30).toBe(5)
    expect(MONSTER_BASE_EXP.monster4).toBe(20)
    expect(MONSTER_BASE_EXP.monster2).toBe(20)
    expect(CAMPAIGN_EXP_MULTIPLIER).toBe(1)
  })

  it('awards the original base value directly, including the conservative fallback', () => {
    expect(monsterExp('monster8')).toBe(3)
    expect(monsterExp('monster30')).toBe(5)
    expect(monsterExp('monster22')).toBe(430)
    expect(monsterExp('unknown-species')).toBe(DEFAULT_MONSTER_EXP)
  })

  it('applies Monster30 anti-farm at local hero level 10', () => {
    expect(monsterExp('monster30', { heroLevel: 9 })).toBe(5)
    expect(monsterExp('monster30', { heroLevel: 10 })).toBe(0)
  })

  it('applies Monster30 anti-farm when any co-op hero is level 10', () => {
    expect(monsterExp('monster30', { heroLevels: [9, 8] })).toBe(5)
    expect(monsterExp('monster30', { heroLevels: [9, 10] })).toBe(0)
  })
})
