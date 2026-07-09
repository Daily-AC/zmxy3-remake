import { describe, it, expect } from 'vitest'
import {
  resolveHorizontalMotion,
  resolveVerticalMotion,
  type Wall,
} from '../src/systems/platformSim'

describe('platformSim AS3 wall semantics', () => {
  it('isThroughWall/isThroughUpButDownWall: falling body lands and stands on top; jumping up through its underside is unobstructed', () => {
    for (const type of ['through', 'throughUpButDown'] as const) {
      const walls: Wall[] = [{ type, x: 100, y: 200, width: 160, height: 24 }]

      expect(resolveVerticalMotion(walls, { x: 180, fromY: 160, toY: 220, vy: 60 })).toMatchObject({
        kind: 'land',
        y: 200,
      })

      expect(resolveVerticalMotion(walls, { x: 180, fromY: 240, toY: 180, vy: -60 })).toBeNull()
    }
  })

  it('isThroughDownButUpWall: blocks upward motion into its underside but lets a falling body pass through its top', () => {
    const walls: Wall[] = [{ type: 'throughDownButUp', x: 100, y: 200, width: 160, height: 24 }]

    expect(resolveVerticalMotion(walls, { x: 180, fromY: 160, toY: 220, vy: 60 })).toBeNull()

    expect(resolveVerticalMotion(walls, { x: 180, fromY: 240, toY: 180, vy: -60 })).toMatchObject({
      kind: 'head',
      y: 224,
    })
  })

  it('isWall (solid): blocks landing, head, and both sides', () => {
    const walls: Wall[] = [{ type: 'solid', x: 100, y: 200, width: 160, height: 80 }]

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
})
