import { describe, it, expect } from 'vitest'
import { spawnConsumableDrop, spawnDrop, spawnSoulDrop, stepDrops, DropEntity, PickupConfig } from '../src/systems/pickup'
import type { Item } from '../src/systems/items'

const item: Item = { id: 'yaocao', name: '妖草', kind: 'material', rarity: 1 }
const cfg: PickupConfig = { gravity: 2, groundY: 400, pickupRadius: 70, tickMs: 1000 / 30 }

describe('pickup drop physics + auto-pickup (掉落拾取)', () => {
  it('spawns a drop above the monster', () => {
    const d = spawnDrop(item, 2, 500, 400)
    expect(d).toMatchObject({ x: 500, y: 300, grounded: false, qty: 2 })
  })

  it('falls under gravity and settles on the ground', () => {
    const drops: DropEntity[] = [spawnDrop(item, 1, 500, 400)]
    let state = { remaining: drops, picked: [] as Item[] }
    for (let i = 0; i < 60 && !state.remaining[0]?.grounded; i++) {
      state = stepDrops(state.remaining, 9999, 400, cfg) // hero far away
    }
    expect(state.remaining[0].grounded).toBe(true)
    expect(state.remaining[0].y).toBe(400)
  })

  it('lands falling drops on the local platform resolver before the flat ground fallback', () => {
    const drop: DropEntity = { item, qty: 1, x: 500, y: 180, vy: 0, grounded: false }
    const platformCfg = {
      ...cfg,
      gravity: 50,
      platformResolver: ({ fromY, toY }: { fromY: number; toY: number }) =>
        fromY <= 220 && toY >= 220 ? { kind: 'land' as const, y: 220 } : null,
    }

    const state = stepDrops([drop], 9999, 400, platformCfg)

    expect(state.remaining[0]).toMatchObject({ y: 220, vy: 0, grounded: true })
  })

  it('is auto-collected when the hero is within the pickup radius', () => {
    const drop: DropEntity = { item, qty: 3, x: 500, y: 400, vy: 0, grounded: true }
    const far = stepDrops([drop], 620, 400, cfg) // 120px away
    expect(far.picked).toHaveLength(0)
    expect(far.remaining).toHaveLength(1)

    const near = stepDrops([drop], 550, 400, cfg) // 50px away < 70
    expect(near.picked).toEqual([{ item, qty: 3 }])
    expect(near.remaining).toHaveLength(0)
  })

  it('does not auto-collect a ground drop when the hero is nearby in x but far above in y', () => {
    const drop: DropEntity = { item, qty: 3, x: 500, y: 400, vy: 0, grounded: true }

    const farAbove = stepDrops([drop], 520, 180, cfg)
    const trulyNear = stepDrops([drop], 520, 390, cfg)

    expect(farAbove.picked).toHaveLength(0)
    expect(farAbove.remaining).toHaveLength(1)
    expect(trulyNear.picked).toEqual([{ item, qty: 3 }])
    expect(trulyNear.remaining).toHaveLength(0)
  })

  it('collects soul orbs as pickup entities without an inventory item payload', () => {
    const drop = spawnSoulDrop(2, 500, 500)
    expect(drop).toMatchObject({ kind: 'soul', amount: 2, x: 500, y: 400, grounded: false })

    const picked = stepDrops([{ ...drop, y: 400, grounded: true }], 500, 400, cfg)

    expect(picked.picked).toEqual([{ kind: 'soul', amount: 2 }])
    expect(picked.remaining).toHaveLength(0)
  })

  it('collects cure orbs as pickup entities without inventing backpack items', () => {
    const drop = spawnConsumableDrop('smallHp', 500, 500)
    expect(drop).toMatchObject({ kind: 'consumable', consumableId: 'smallHp', x: 500, y: 400, grounded: false })

    const picked = stepDrops([{ ...drop, y: 400, grounded: true }], 500, 400, cfg)

    expect(picked.picked).toEqual([{ kind: 'consumable', consumableId: 'smallHp' }])
    expect(picked.remaining).toHaveLength(0)
  })
})
