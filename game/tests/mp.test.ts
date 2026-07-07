import { describe, it, expect } from 'vitest'
import {
  createMp,
  resetMp,
  getRole1MaxMp,
  hasEnoughMp,
  spendMp,
  restoreMp,
  tickMpRegen,
  setMaxMp,
} from '../src/systems/mp'

describe('mp resource model', () => {
  it('creates full at maxMp', () => {
    const mp = createMp(100)
    expect(mp.mp).toBe(100)
    expect(mp.maxMp).toBe(100)
  })

  it('resetMp refills to maxMp, optionally changing the cap', () => {
    const mp = createMp(100)
    mp.mp = 10
    resetMp(mp)
    expect(mp.mp).toBe(100)
    resetMp(mp, 150)
    expect(mp.maxMp).toBe(150)
    expect(mp.mp).toBe(150)
  })

  it('getRole1MaxMp matches ProgressionSystem.ts:130-131 (50 + 20*(level-1))', () => {
    expect(getRole1MaxMp(1)).toBe(50)
    expect(getRole1MaxMp(2)).toBe(70)
    expect(getRole1MaxMp(10)).toBe(50 + 20 * 9)
  })

  it('hasEnoughMp / spendMp reject and accept correctly, without partial spends', () => {
    const mp = createMp(50)
    expect(hasEnoughMp(mp, 51)).toBe(false)
    expect(spendMp(mp, 51)).toBe(false)
    expect(mp.mp).toBe(50) // untouched on rejection

    expect(spendMp(mp, 20)).toBe(true)
    expect(mp.mp).toBe(30)
  })

  it('restoreMp clamps to maxMp and returns the actual amount restored', () => {
    const mp = createMp(100)
    mp.mp = 90
    expect(restoreMp(mp, 100)).toBe(10) // clamped
    expect(mp.mp).toBe(100)
    expect(restoreMp(mp, 5)).toBe(0) // already full
  })

  it('tickMpRegen restores regenPerSecond * dt proportionally', () => {
    const mp = createMp(100)
    mp.mp = 0
    tickMpRegen(mp, 10, 500) // 10/s for 0.5s = 5
    expect(mp.mp).toBe(5)
    tickMpRegen(mp, 0, 1000) // no-op regen rate
    expect(mp.mp).toBe(5)
  })

  it('setMaxMp clamps current mp down but does not auto-refill', () => {
    const mp = createMp(100)
    setMaxMp(mp, 30)
    expect(mp.maxMp).toBe(30)
    expect(mp.mp).toBe(30)
    mp.mp = 10
    setMaxMp(mp, 200)
    expect(mp.mp).toBe(10)
    expect(mp.maxMp).toBe(200)
  })
})
