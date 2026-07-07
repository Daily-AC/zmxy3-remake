import { describe, it, expect } from 'vitest'
import {
  CONSUMABLE_SPECS,
  PICKUP_DESPAWN_MS,
  PICKUP_RANGE,
  isWithinPickupRange,
  applyConsumableEffect,
  collectWorldPickup,
  useInventoryConsumable,
  rollMedicineDrop,
  immortalityPillUseCap,
  magicRingHealAmount,
} from '../src/systems/consumables'
import { createInventory, addItem, countItem } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

describe('CONSUMABLE_SPECS (export.cure.SmallHP/SmallMP/BigHP.as)', () => {
  it('smallHp: flat +100 HP, heal-blockable', () => {
    expect(CONSUMABLE_SPECS.smallHp).toMatchObject({
      resource: 'hp', amount: { kind: 'flat', value: 100 }, healBlockable: true,
    })
  })

  it('bigHp: +50% of max HP, heal-blockable', () => {
    expect(CONSUMABLE_SPECS.bigHp).toMatchObject({
      resource: 'hp', amount: { kind: 'fractionOfMax', fraction: 0.5 }, healBlockable: true,
    })
  })

  it('smallMp: flat +100 MP, NOT heal-blockable', () => {
    expect(CONSUMABLE_SPECS.smallMp).toMatchObject({
      resource: 'mp', amount: { kind: 'flat', value: 100 }, healBlockable: false,
    })
  })

  it('there is no bigMp spec (confirmed absent in the decompile)', () => {
    expect(Object.keys(CONSUMABLE_SPECS)).toEqual(['smallHp', 'bigHp', 'smallMp'])
  })
})

describe('pickup timing/range constants', () => {
  it('despawns after exactly 10s for all three types', () => {
    expect(PICKUP_DESPAWN_MS).toBe(10_000)
  })

  it('isWithinPickupRange matches the |dx|<=700, |dy|<200 gate', () => {
    expect(PICKUP_RANGE).toEqual({ x: 700, y: 200 })
    expect(isWithinPickupRange(700, 0, 0, 0)).toBe(true) // dx==700 inclusive
    expect(isWithinPickupRange(701, 0, 0, 0)).toBe(false)
    expect(isWithinPickupRange(0, 199, 0, 0)).toBe(true)
    expect(isWithinPickupRange(0, 200, 0, 0)).toBe(false) // dy==200 exclusive
  })
})

describe('applyConsumableEffect: HP orbs respect the heal-block gate, MP never does', () => {
  it('smallHp heals normally when not heal-blocked', () => {
    const result = applyConsumableEffect('smallHp', { current: 50, max: 500 }, { current: 0, max: 100 }, false)
    expect(result.hpAfter).toBe(150)
    expect(result.blockedByHealBlock).toBe(false)
  })

  it('smallHp is entirely dropped (no partial heal) while heal-blocked', () => {
    const result = applyConsumableEffect('smallHp', { current: 50, max: 500 }, { current: 0, max: 100 }, true)
    expect(result.hpAfter).toBe(50)
    expect(result.blockedByHealBlock).toBe(true)
  })

  it('bigHp heals a fraction of max HP', () => {
    const result = applyConsumableEffect('bigHp', { current: 100, max: 1000 }, { current: 0, max: 100 }, false)
    expect(result.hpAfter).toBe(600) // 100 + 1000*0.5
  })

  it('bigHp is also dropped entirely while heal-blocked', () => {
    const result = applyConsumableEffect('bigHp', { current: 100, max: 1000 }, { current: 0, max: 100 }, true)
    expect(result.hpAfter).toBe(100)
    expect(result.blockedByHealBlock).toBe(true)
  })

  it('smallMp heals MP regardless of heal-block state (MP has no such gate)', () => {
    const blocked = applyConsumableEffect('smallMp', { current: 0, max: 100 }, { current: 20, max: 200 }, true)
    expect(blocked.mpAfter).toBe(120)
    expect(blocked.blockedByHealBlock).toBe(false)
  })

  it('clamps HP to [0, max] even from a big overheal', () => {
    const result = applyConsumableEffect('smallHp', { current: 950, max: 1000 }, { current: 0, max: 100 }, false)
    expect(result.hpAfter).toBe(1000)
  })

  it('clamps MP to [0, max]', () => {
    const result = applyConsumableEffect('smallMp', { current: 0, max: 100 }, { current: 150, max: 200 }, false)
    expect(result.mpAfter).toBe(200)
  })
})

describe('collectWorldPickup is the same effect as applyConsumableEffect (two names, one function)', () => {
  it('produces an identical result', () => {
    const hp = { current: 50, max: 500 }
    const mp = { current: 0, max: 100 }
    expect(collectWorldPickup('smallHp', hp, mp, false)).toEqual(applyConsumableEffect('smallHp', hp, mp, false))
  })
})

describe('useInventoryConsumable: a modernized backpack front door', () => {
  const pillItem: Item = { id: 'minor_pill', name: '小还丹', kind: 'consumable', rarity: 1 }

  it('does nothing and returns undefined if the hero has none', () => {
    const inv = createInventory(10)
    const result = useInventoryConsumable(inv, 'minor_pill', 'smallHp', { current: 50, max: 500 }, { current: 0, max: 100 }, false)
    expect(result).toBeUndefined()
  })

  it('consumes exactly one unit and applies the effect', () => {
    const inv = createInventory(10)
    addItem(inv, pillItem, 3)
    const result = useInventoryConsumable(inv, 'minor_pill', 'smallHp', { current: 50, max: 500 }, { current: 0, max: 100 }, false)
    expect(result?.hpAfter).toBe(150)
    expect(countItem(inv, 'minor_pill')).toBe(2)
  })

  it('is also gated by heal-block, and still consumes the item even when the heal is dropped (matches the original: consumption happens, only the effect application is gated)', () => {
    const inv = createInventory(10)
    addItem(inv, pillItem, 1)
    const result = useInventoryConsumable(inv, 'minor_pill', 'smallHp', { current: 50, max: 500 }, { current: 0, max: 100 }, true)
    expect(result?.hpAfter).toBe(50)
    expect(result?.blockedByHealBlock).toBe(true)
    expect(countItem(inv, 'minor_pill')).toBe(0)
  })
})

describe('rollMedicineDrop: faithful port of BaseMonster.addMedicine()\'s nested rolls', () => {
  it('rolls the HP branch (>=0.5) then the rare 5%-of-15% sub-branch, 50/50 smallHp/bigHp', () => {
    // roll1=0.9 (>=0.5 -> HP branch), roll2=0.02 (<=0.05 -> rare sub-branch), roll3=0.9 (>=0.5 -> smallHp)
    const seq1 = [0.9, 0.02, 0.9]
    let i = 0
    expect(rollMedicineDrop(() => seq1[i++])).toBe('smallHp')

    // same but roll3=0.1 (<0.5 -> bigHp)
    const seq2 = [0.9, 0.02, 0.1]
    i = 0
    expect(rollMedicineDrop(() => seq2[i++])).toBe('bigHp')
  })

  it('rolls the HP branch, then the common 0.05<roll2<=0.15 slice -> always smallHp (no third roll)', () => {
    const seq = [0.9, 0.10]
    let i = 0
    expect(rollMedicineDrop(() => seq[i++])).toBe('smallHp')
  })

  it('rolls the HP branch but misses the 15% window -> no drop', () => {
    const seq = [0.9, 0.99]
    let i = 0
    expect(rollMedicineDrop(() => seq[i++])).toBeUndefined()
  })

  it('rolls the MP branch (<0.5) within its 15% window -> smallMp', () => {
    const seq = [0.1, 0.1]
    let i = 0
    expect(rollMedicineDrop(() => seq[i++])).toBe('smallMp')
  })

  it('rolls the MP branch but misses the window -> no drop', () => {
    const seq = [0.1, 0.99]
    let i = 0
    expect(rollMedicineDrop(() => seq[i++])).toBeUndefined()
  })

  it('empirically lands close to the derived aggregate odds (6.25% smallHp, 1.25% bigHp, 7.5% smallMp) over many trials', () => {
    let smallHp = 0, bigHp = 0, smallMp = 0, none = 0
    const trials = 200_000
    // A simple deterministic PRNG (mulberry32) so this test has no flake risk.
    let seed = 42
    const random = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let n = 0; n < trials; n++) {
      const drop = rollMedicineDrop(random)
      if (drop === 'smallHp') smallHp++
      else if (drop === 'bigHp') bigHp++
      else if (drop === 'smallMp') smallMp++
      else none++
    }
    expect(smallHp / trials).toBeCloseTo(0.0625, 2)
    expect(bigHp / trials).toBeCloseTo(0.0125, 2)
    expect(smallMp / trials).toBeCloseTo(0.075, 2)
    expect(none / trials).toBeCloseTo(0.85, 2)
  })
})

describe('re-exported revival pill / magic ring (heroGrowth.ts, single front door)', () => {
  it('immortalityPillUseCap is available from this module too', () => {
    expect(immortalityPillUseCap(0)).toBe(1)
  })

  it('magicRingHealAmount is available from this module too', () => {
    expect(magicRingHealAmount(1000, 1)).toBeGreaterThanOrEqual(1000)
  })
})
