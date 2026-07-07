import { describe, it, expect } from 'vitest'
import { rollDrops } from '../src/systems/dropRoll'

function sequenceRng(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (value === undefined) throw new Error('rng sequence exhausted')
    return value
  }
}

describe('drop rolling', () => {
  it('rolls deterministic independent drops with injected rng', () => {
    const drops = rollDrops(
      'monster30',
      sequenceRng([
        0.1, 0.25, // 妖怪残魂 hits, qty 2 in [1,4]
        0.9, // 白银矿石 misses
        0.2, // 大还丹 hits, fixed qty 1
      ]),
    )

    expect(drops).toEqual([
      {
        item: { id: 'demon_soul', name: '妖怪残魂', kind: 'material', rarity: 1 },
        qty: 2,
      },
      {
        item: { id: 'great_pill', name: '大还丹', kind: 'consumable', rarity: 3 },
        qty: 1,
      },
    ])
  })

  it('returns an empty list for an unknown monster', () => {
    expect(rollDrops('missing_monster', () => 0)).toEqual([])
  })

  it('returns the fixed quantity when qtyMin equals qtyMax', () => {
    const drops = rollDrops(
      'monster2',
      sequenceRng([
        0.9, // 妖怪残魂 misses
        0.1, // 青铜甲片 hits, fixed qty 1
        0.9, // 小还丹 misses
      ]),
    )

    expect(drops).toEqual([
      {
        item: { id: 'bronze_plate', name: '青铜甲片', kind: 'material', rarity: 1 },
        qty: 1,
      },
    ])
  })
})
