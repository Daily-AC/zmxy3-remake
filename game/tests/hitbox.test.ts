import { describe, it, expect } from 'vitest'
import { overlaps, centeredBox, heroAttackBox, DEFAULT_ATTACK_BOX } from '../src/systems/hitbox'

describe('hitbox AABB (攻击盒判定)', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    expect(overlaps(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(overlaps(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
    // Touching edges do not count as overlap.
    expect(overlaps(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })

  it('centeredBox is symmetric around the centre', () => {
    expect(centeredBox(100, 100, 40, 60)).toEqual({ x: 80, y: 70, w: 40, h: 60 })
  })

  it('hero attack box extends in front on the facing side', () => {
    const spec = DEFAULT_ATTACK_BOX
    const right = heroAttackBox(500, 400, 1, spec)
    expect(right.x).toBe(500 + spec.offset) // near edge in front
    expect(right.w).toBe(spec.reach)

    const left = heroAttackBox(500, 400, -1, spec)
    expect(left.x + left.w).toBe(500 - spec.offset) // far edge at near side
  })

  it('a facing-right swing reaches a monster to the right but not behind', () => {
    const box = heroAttackBox(500, 400, 1)
    const inFront = centeredBox(600, 400, 120, 130)
    const behind = centeredBox(400, 400, 120, 130)
    expect(overlaps(box, inFront)).toBe(true)
    expect(overlaps(box, behind)).toBe(false)
  })
})
