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

// hitstun-triad pen follow-up (2026-07-09): L2 drop-table gap closed by
// decompiling each species' real AS3 attackBackInfoDict-adjacent
// `fallList`/`protectedParamsObject.probability` (base.BaseMonster.as's
// `fallEquip()`: an overall `probability` roll -- ×1.5 if the AS3 instance's
// own isBoss flag is true -- then ONE item picked UNIFORMLY from fallList).
// This project's drops.json models each item as its own independent-chance
// roll (established by the pre-existing L1 entries, not something this pen
// invented), so each L2 boss-tier item's `chance` below is
// `probability × (isBoss ? 1.5 : 1) / fallList.length` -- carries the real
// AS3 numbers into the existing schema without claiming a literal
// mechanical match (AS3 drops at most one item per kill; this schema can
// drop several independently, same simplification L1 already lives with).
describe('drop rolling: L2 species (real AS3 probability, decompile-grounded)', () => {
  it('增长天王 Monster6 (probability=0.5, isBoss -> 0.75 overall / 2 fallList slots = 0.375 each)', () => {
    const drops = rollDrops(
      'monster6',
      sequenceRng([
        0.3, // 云纹布袍 hits, fixed qty 1
        0.9, // 星纹短刃 misses
      ]),
    )
    expect(drops).toEqual([{ item: { id: 'cotton_robe', name: '云纹布袍', kind: 'equip', rarity: 2 }, qty: 1 }])
  })

  it('广目天王 Monster16 (probability=0.45, isBoss -> 0.675 overall / 2 slots = 0.3375 each)', () => {
    const drops = rollDrops(
      'monster16',
      sequenceRng([
        0.9, // 踏云靴 misses
        0.1, // 灵猴护符 hits, fixed qty 1
      ]),
    )
    expect(drops).toEqual([{ item: { id: 'monkey_talisman', name: '灵猴护符', kind: 'equip', rarity: 3 }, qty: 1 }])
  })

  it('多闻天王 Monster15 (probability=0.4, isBoss -> 0.6 overall / 2 slots = 0.3 each)', () => {
    const drops = rollDrops(
      'monster15',
      sequenceRng([
        0.2, // 灵猴护符 hits, fixed qty 1
        0.2, // 星纹短刃 hits, fixed qty 1
      ]),
    )
    expect(drops).toEqual([
      { item: { id: 'monkey_talisman', name: '灵猴护符', kind: 'equip', rarity: 3 }, qty: 1 },
      { item: { id: 'star_blade', name: '星纹短刃', kind: 'equip', rarity: 3 }, qty: 1 },
    ])
  })

  // Monster9/10/19 (L2 grunts): decompile of their else-branch (L2 grunt
  // form, matching level2.ts's own hp/def) constructor shows
  // `protectedParamsObject.probability` is left at its unconditional `= 0`
  // (only the `curStage==9` "elite" branch -- out of scope, a different hp
  // tier entirely -- sets it to 0.05). fallEquip()'s `Math.random() > 0` is
  // true on every possible roll, so these three genuinely NEVER drop
  // anything in the real game -- not a missing-data gap, confirmed AS3
  // behavior. No drops.json entry for them is the byte-accurate
  // representation (rollDrops already returns [] for an unlisted id).
  it.each(['monster9', 'monster10', 'monster19'])(
    '%s (L2 grunt, real AS3 probability=0) never drops anything',
    (species) => {
      expect(rollDrops(species, () => 0)).toEqual([]) // rng=0 would hit any nonzero chance
    },
  )
})
