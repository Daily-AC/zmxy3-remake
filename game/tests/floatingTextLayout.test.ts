import { describe, expect, it } from 'vitest'
import { FloatingTextLaneAllocator } from '../src/systems/floatingTextLayout'

describe('FloatingTextLaneAllocator', () => {
  it('fans out simultaneous combat numbers from nearby anchors', () => {
    const lanes = new FloatingTextLaneAllocator()

    const first = lanes.allocate(400, 200, 1000)
    const second = lanes.allocate(412, 202, 1000)
    const third = lanes.allocate(390, 198, 1016)

    expect(first).toEqual({ x: 400, y: 200 })
    expect(second).not.toEqual({ x: 412, y: 202 })
    expect(third).not.toEqual(second)
    expect(new Set([first.x, second.x, third.x]).size).toBe(3)
  })

  it('does not move unrelated or expired numbers', () => {
    const lanes = new FloatingTextLaneAllocator()

    lanes.allocate(100, 100, 0)

    expect(lanes.allocate(500, 100, 20)).toEqual({ x: 500, y: 100 })
    expect(lanes.allocate(104, 102, 200)).toEqual({ x: 104, y: 102 })
  })

  it('keeps a dense eight-number burst far enough apart to remain readable', () => {
    const lanes = new FloatingTextLaneAllocator()
    const positions = Array.from({ length: 8 }, () => lanes.allocate(400, 240, 1000))

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = Math.abs(positions[i].x - positions[j].x)
        const dy = Math.abs(positions[i].y - positions[j].y)
        expect(dx >= 48 || dy >= 40).toBe(true)
      }
    }
  })
})
