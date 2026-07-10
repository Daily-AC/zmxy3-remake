import { describe, expect, it } from 'vitest'
import { resolveVisualAttachment } from '../src/systems/visualAttachment'
import { ROLE1_EFFECTS, resolveRole1EffectPlacement } from '../src/data/role1Effects'

describe('visual attachment', () => {
  it('mirrors a hero-local AS3 offset without changing the symbol pivot', () => {
    expect(resolveVisualAttachment({
      anchor: { x: 400, y: 300 },
      facing: -1,
      offset: { forward: 120, y: 5 },
      pivotPx: { x: 37, y: 44 },
      scale: 1,
    })).toEqual({ x: 280, y: 305, originX: 37, originY: 44, flipX: false })
  })

  it('ships source pivots and spawn rules instead of arbitrary readability scales', () => {
    expect(ROLE1_EFFECTS.hit1).toMatchObject({
      sourceSymbol: 'Role1Bullet1',
      anchor: 'hero',
      offset: { forward: 120, y: 5 },
    })
    expect(ROLE1_EFFECTS.hit1.pivotPx.x).toBeTypeOf('number')
    expect(ROLE1_EFFECTS.hit1.scale).toBe(1)
  })

  it('resolves the official hit1 registration point and pivot from the hero anchor', () => {
    expect(resolveRole1EffectPlacement('hit1', { x: 750, y: -1872.45 }, 1)).toEqual({
      x: 870,
      y: -1867.45,
      originX: 18.3,
      originY: 11,
      flipX: true,
    })
  })
})
