import { describe, expect, it } from 'vitest'
import {
  computeRenderMetrics,
  logicalPointerPosition,
  withTextResolution,
} from '../src/systems/renderScale'

describe('high-DPI text rendering', () => {
  it('keeps the Phaser game canvas at its 960x540 logical size', () => {
    expect(computeRenderMetrics(1)).toEqual({ scale: 1, width: 960, height: 540 })
    expect(computeRenderMetrics(1.5)).toEqual({ scale: 1.5, width: 960, height: 540 })
    expect(computeRenderMetrics(3)).toEqual({ scale: 2, width: 960, height: 540 })
  })

  it('keeps Phaser pointer coordinates in the native logical space', () => {
    expect(logicalPointerPosition({ x: 720, y: 405 }, 2)).toEqual({ x: 720, y: 405 })
  })

  it('gives Phaser Text textures the same resolution as the render scale', () => {
    expect(withTextResolution({ fontSize: '18px', color: '#fff' }, 2)).toEqual({
      fontSize: '18px',
      color: '#fff',
      resolution: 2,
    })
    expect(withTextResolution({ fontSize: '18px', resolution: 1.25 }, 2).resolution).toBe(1.25)
  })
})
