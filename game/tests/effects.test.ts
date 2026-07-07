import { describe, it, expect } from 'vitest'
import { applyEquipStats, rollOnHitProcs, type BaseStats } from '../src/systems/effects'
import type { Item, Effect } from '../src/systems/items'

function sequenceRng(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (value === undefined) throw new Error('rng sequence exhausted')
    return value
  }
}

function equip(id: string, effects?: Effect[]): Item {
  return { id, name: id, kind: 'equip', rarity: 1, effects }
}

const BASE: BaseStats = { atk: 10, def: 10, hp: 100, mp: 50, crit: 0.05 }

describe('applyEquipStats', () => {
  it('sums stat effects across multiple equipped items', () => {
    const staff = equip('staff', [
      { type: 'stat', stat: 'atk', value: 15 },
      { type: 'stat', stat: 'crit', value: 0.1 },
    ])
    const armor = equip('armor', [
      { type: 'stat', stat: 'def', value: 20 },
      { type: 'stat', stat: 'hp', value: 30 },
    ])

    const result = applyEquipStats(BASE, [staff, armor])

    expect(result.atk).toBe(25)
    expect(result.def).toBe(30)
    expect(result.hp).toBe(130)
    expect(result.mp).toBe(50)
    expect(result.crit).toBeCloseTo(0.15)
  })

  it('clamps crit at 0.8 even when stacked effects would exceed it', () => {
    const ring1 = equip('ring1', [{ type: 'stat', stat: 'crit', value: 0.5 }])
    const ring2 = equip('ring2', [{ type: 'stat', stat: 'crit', value: 0.5 }])

    const result = applyEquipStats(BASE, [ring1, ring2])

    expect(result.crit).toBe(0.8)
  })

  it('clamps atk/def/hp/mp/crit down to 0 when negative effects outweigh base', () => {
    const cursed = equip('cursed', [
      { type: 'stat', stat: 'atk', value: -999 },
      { type: 'stat', stat: 'def', value: -999 },
      { type: 'stat', stat: 'hp', value: -999 },
      { type: 'stat', stat: 'mp', value: -999 },
      { type: 'stat', stat: 'crit', value: -999 },
    ])

    const result = applyEquipStats(BASE, [cursed])

    expect(result).toEqual({ atk: 0, def: 0, hp: 0, mp: 0, crit: 0 })
  })

  it('does not have an upper clamp on atk/def/hp/mp (only crit is capped)', () => {
    const overloaded = equip('overloaded', [
      { type: 'stat', stat: 'atk', value: 1000 },
      { type: 'stat', stat: 'hp', value: 1000 },
    ])

    const result = applyEquipStats(BASE, [overloaded])

    expect(result.atk).toBe(1010)
    expect(result.hp).toBe(1100)
  })

  it('tolerates items with missing or empty effects', () => {
    const bare = equip('bare')
    const emptyEffects = equip('empty', [])

    expect(applyEquipStats(BASE, [bare, emptyEffects])).toEqual(BASE)
    expect(applyEquipStats(BASE, [])).toEqual(BASE)
  })

  it('skips onHit effects and unknown-shaped entries without throwing', () => {
    const mixed = equip('mixed', [
      { type: 'onHit', effect: 'burn', chance: 0.3, power: 5 },
      { type: 'stat', stat: 'atk', value: 5 },
      // simulates a malformed/unknown effect slipping through at runtime
      { type: 'explode', value: 999 } as unknown as Effect,
    ])

    expect(() => applyEquipStats(BASE, [mixed])).not.toThrow()
    expect(applyEquipStats(BASE, [mixed]).atk).toBe(15)
  })
})

describe('rollOnHitProcs', () => {
  it('is deterministic with a seeded rng and rolls each effect independently', () => {
    const staff = equip('staff', [
      { type: 'onHit', effect: 'burn', chance: 0.3, power: 5 },
      { type: 'onHit', effect: 'lifesteal', chance: 0.5, power: 10 },
    ])

    const procs = rollOnHitProcs(
      [staff],
      sequenceRng([
        0.1, // burn: 0.1 < 0.3 -> hits
        0.9, // lifesteal: 0.9 >= 0.5 -> misses
      ]),
    )

    expect(procs).toEqual([{ effect: 'burn', power: 5 }])
  })

  it('lets two items with the same proc name both fire on one call', () => {
    const ring1 = equip('ring1', [{ type: 'onHit', effect: 'burn', chance: 0.9, power: 3 }])
    const ring2 = equip('ring2', [{ type: 'onHit', effect: 'burn', chance: 0.9, power: 7 }])

    const procs = rollOnHitProcs(
      [ring1, ring2],
      sequenceRng([
        0.1, // ring1 burn hits
        0.2, // ring2 burn hits
      ]),
    )

    expect(procs).toEqual([
      { effect: 'burn', power: 3 },
      { effect: 'burn', power: 7 },
    ])
  })

  it('tolerates items with missing/empty effects and ignores stat effects', () => {
    const bare = equip('bare')
    const emptyEffects = equip('empty', [])
    const statOnly = equip('statOnly', [{ type: 'stat', stat: 'atk', value: 10 }])

    const procs = rollOnHitProcs([bare, emptyEffects, statOnly], () => 0)

    expect(procs).toEqual([])
  })

  it('skips unknown-shaped entries without throwing', () => {
    const mixed = equip('mixed', [
      { type: 'explode', value: 999 } as unknown as Effect,
      { type: 'onHit', effect: 'freeze', chance: 0.4, power: 8 },
    ])

    const procs = rollOnHitProcs([mixed], sequenceRng([0.1]))

    expect(procs).toEqual([{ effect: 'freeze', power: 8 }])
  })
})
