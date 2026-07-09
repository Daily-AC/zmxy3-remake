import { describe, expect, it } from 'vitest'
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

describe('drop rolling: original BaseMonster.as:1009 single-roll fallEquip()', () => {
  it('Monster30 乌鸦 has probability=0 and never drops equipment/items', () => {
    expect(rollDrops('monster30', () => 0)).toEqual([])
  })

  it('does one total probability roll, then picks exactly one fallList entry', () => {
    const miss = rollDrops('monster2', sequenceRng([0.91]))
    expect(miss).toEqual([])

    const hit = rollDrops('monster2', sequenceRng([0.89, 0.75]))
    expect(hit).toEqual([{
      item: {
        id: 'xhz',
        name: '宣花坠',
        kind: 'equip',
        rarity: 2,
        sourceFillName: 'xhz',
        sourceType: 'zbsp',
        sourceQuality: '优 秀',
        sourceArray: 'otherEquipment',
      },
      qty: 1,
    }])
  })

  it('applies the AS3 isBoss x1.5 multiplier, but not in the s3l3/s8 reuse branch', () => {
    expect(rollDrops('monster4', sequenceRng([0.75, 0]), { stage: 1, level: 3 })).toHaveLength(1)
    expect(rollDrops('monster4', sequenceRng([0.75]), { stage: 3, level: 3 })).toEqual([])
  })

  it('Monster8 L1 grunt lands at the recovered 15% rate over a deterministic 100-kill sweep', () => {
    let count = 0
    for (let i = 0; i < 100; i++) {
      const roll = (i + 0.5) / 100
      const drops = rollDrops('monster8', sequenceRng(roll <= 0.15 ? [roll, 0] : [roll]))
      count += drops.length
    }
    expect(count).toBe(15)
  })

  it('Monster3 巫鹰 uses its s1l1 boss branch: probability=1 and ptd* starter gear', () => {
    const drops = rollDrops('monster3', sequenceRng([0.99, 0]), { stage: 1, level: 1 })
    expect(drops).toEqual([{
      item: {
        id: 'ptdxzg',
        name: '普通的行者棍',
        kind: 'equip',
        rarity: 1,
        sourceFillName: 'ptdxzg',
        sourceType: 'zbwq',
        sourceQuality: '普 通',
        sourceArray: 'normalEquipment',
      },
      qty: 1,
    }])
  })

  it('Monster3 outside s1l1 returns to the 0.15 non-boss branch', () => {
    expect(rollDrops('monster3', sequenceRng([0.2]), { stage: 1, level: 2 })).toEqual([])
  })
})
