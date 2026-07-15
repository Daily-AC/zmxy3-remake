import { describe, expect, it } from 'vitest'
import {
  resolveHorizontalMotion,
  resolveVerticalMotion,
  type BattleWall,
} from '../../src/battle/platform'

describe('battle platform resolver', () => {
  it('lands on top-only platforms while falling and passes through from below', () => {
    for (const type of ['through', 'throughUpButDown'] as const) {
      const walls: BattleWall[] = [{ type, x: 100, y: 200, width: 160, height: 24 }]

      expect(resolveVerticalMotion(walls, { x: 180, fromY: 160, toY: 220, vy: 60 })).toMatchObject({
        kind: 'land',
        y: 200,
      })
      expect(resolveVerticalMotion(walls, { x: 180, fromY: 240, toY: 180, vy: -60 })).toBeNull()
    }
  })

  it('uses inverse one-way walls as ceilings and not floors', () => {
    const walls: BattleWall[] = [{ type: 'throughDownButUp', x: 100, y: 200, width: 160, height: 24 }]

    expect(resolveVerticalMotion(walls, { x: 180, fromY: 160, toY: 220, vy: 60 })).toBeNull()
    expect(resolveVerticalMotion(walls, { x: 180, fromY: 240, toY: 180, vy: -60 })).toMatchObject({
      kind: 'head',
      y: 224,
    })
  })

  it('blocks every face of a solid wall', () => {
    const walls: BattleWall[] = [{ type: 'solid', x: 100, y: 200, width: 160, height: 80 }]

    expect(resolveVerticalMotion(walls, { x: 180, fromY: 160, toY: 220, vy: 60 })).toMatchObject({
      kind: 'land',
      y: 200,
    })
    expect(resolveVerticalMotion(walls, { x: 180, fromY: 300, toY: 240, vy: -60 })).toMatchObject({
      kind: 'head',
      y: 280,
    })
    expect(resolveHorizontalMotion(walls, { fromX: 80, toX: 140, y: 240 })).toMatchObject({
      blocked: true,
      x: 100,
    })
    expect(resolveHorizontalMotion(walls, { fromX: 280, toX: 220, y: 240 })).toMatchObject({
      blocked: true,
      x: 260,
    })
  })

  it('accounts for actor half extents when resolving surfaces', () => {
    const walls: BattleWall[] = [{ type: 'solid', x: 100, y: 200, width: 160, height: 80 }]

    expect(resolveVerticalMotion(walls, {
      x: 90,
      fromY: 160,
      toY: 220,
      vy: 60,
      halfWidth: 12,
    })).toMatchObject({ kind: 'land', y: 200 })
    expect(resolveHorizontalMotion(walls, {
      fromX: 70,
      toX: 100,
      y: 190,
      halfWidth: 10,
      halfHeight: 12,
    })).toMatchObject({ blocked: true, x: 90 })
  })
})
