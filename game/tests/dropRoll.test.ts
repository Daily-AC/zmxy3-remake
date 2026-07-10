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
    const miss = rollDrops('monster2', sequenceRng([0.68]))
    expect(miss).toEqual([])

    const hit = rollDrops('monster2', sequenceRng([0.67, 0.75]))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toMatchObject({
      item: {
        id: 'kys',
        kind: 'equip',
        sourceType: 'zbfj',
        sourceUser: '悟空',
        sourceSaleValue: 40,
      },
      qty: 1,
    })
  })

  it('filters the Monster4 boss pool because it only contains unsupported roles', () => {
    expect(rollDrops('monster4', sequenceRng([0, 0]), { stage: 1, level: 2 })).toEqual([])
  })

  it('Monster8 uses the official 10% rate over a deterministic 100-kill sweep', () => {
    let count = 0
    for (let i = 0; i < 100; i++) {
      const roll = (i + 0.5) / 100
      const drops = rollDrops('monster8', sequenceRng(roll <= 0.1 ? [roll, 0] : [roll]))
      count += drops.length
    }
    expect(count).toBe(10)
  })

  it('only exposes current crafting material and Wukong weapon/armor from grunt pools', () => {
    const ids = new Set<string>()
    for (const pick of [0, 0.5, 1]) {
      const drops = rollDrops('monster8', sequenceRng([0, pick]))
      if (drops[0]) ids.add(drops[0].item.id)
    }
    expect(ids).toEqual(new Set(['wptm', 'ptdxzg', 'ptdxzf']))
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
        sourceUser: '悟空',
        sourceQuality: '普 通',
        sourceSaleValue: 20,
        sourceShowId: 1,
        sourceArray: 'normalEquipment',
        effects: [{ type: 'stat', stat: 'atk', value: 2 }],
      },
      qty: 1,
    }])
  })

  it('Monster3 outside s1l1 returns to the 0.15 non-boss branch', () => {
    expect(rollDrops('monster3', sequenceRng([0.2]), { stage: 1, level: 2 })).toEqual([])
  })
})
