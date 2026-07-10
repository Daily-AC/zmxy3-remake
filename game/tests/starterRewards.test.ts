import { describe, expect, it } from 'vitest'
import { l1StarterRewards } from '../src/systems/starterRewards'

describe('l1StarterRewards', () => {
  it('returns the deterministic L1 boss starter kit in pickup order', () => {
    const rewards = l1StarterRewards('Monster3', { stage: 1, level: 1 })

    expect(rewards).toEqual([
      expect.objectContaining({
        qty: 1,
        item: expect.objectContaining({ id: 'ptdxzg', name: '普通的行者棍', kind: 'equip' }),
      }),
      expect.objectContaining({
        qty: 1,
        item: expect.objectContaining({ id: 'ptdxzf', name: '普通的行者服', kind: 'equip' }),
      }),
      expect.objectContaining({
        qty: 3,
        item: expect.objectContaining({ id: 'wptm', name: '檀木', kind: 'material' }),
      }),
    ])
  })

  it('normalizes the monster id using the recovered drop-table convention', () => {
    expect(l1StarterRewards(' monster3 ', { stage: 1, level: 1 })).toHaveLength(3)
  })

  it('returns no starter rewards for other monsters or campaign contexts', () => {
    expect(l1StarterRewards('monster2', { stage: 1, level: 1 })).toEqual([])
    expect(l1StarterRewards('monster3', { stage: 2, level: 1 })).toEqual([])
    expect(l1StarterRewards('monster3', { stage: 1, level: 2 })).toEqual([])
  })
})
