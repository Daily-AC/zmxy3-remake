import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MOVE_CONFIG,
  initMoveState,
  pressLeft,
  pressRight,
  releaseRight,
  currentDir,
  moveVelocity,
} from '../src/hero/locomotion'

const cfg = DEFAULT_MOVE_CONFIG

describe('locomotion double-tap run (走/跑)', () => {
  it('a single press walks at walk speed', () => {
    const s = initMoveState()
    pressRight(s, 0, cfg)
    expect(currentDir(s)).toBe(1)
    expect(s.running).toBe(false)
    expect(moveVelocity(s, cfg)).toBe(6)
    expect(s.facing).toBe(1)
  })

  it('a same-direction second press within 500ms enters run', () => {
    const s = initMoveState()
    pressRight(s, 0, cfg)
    releaseRight(s)
    pressRight(s, 300, cfg) // within window
    expect(s.running).toBe(true)
    expect(moveVelocity(s, cfg)).toBe(10)
  })

  it('a second press after the window stays at walk', () => {
    const s = initMoveState()
    pressRight(s, 0, cfg)
    releaseRight(s)
    pressRight(s, 600, cfg) // past 500ms window
    expect(s.running).toBe(false)
    expect(moveVelocity(s, cfg)).toBe(6)
  })

  it('a double-tap in the opposite direction does not run', () => {
    const s = initMoveState()
    pressRight(s, 0, cfg)
    pressLeft(s, 100, cfg)
    expect(s.running).toBe(false)
  })

  it('releasing the direction clears run immediately', () => {
    const s = initMoveState()
    pressRight(s, 0, cfg)
    releaseRight(s)
    pressRight(s, 200, cfg)
    expect(s.running).toBe(true)
    releaseRight(s)
    expect(s.running).toBe(false)
    expect(currentDir(s)).toBe(0)
    expect(moveVelocity(s, cfg)).toBe(0)
  })

  it('left movement is negative and flips facing', () => {
    const s = initMoveState()
    pressLeft(s, 0, cfg)
    expect(currentDir(s)).toBe(-1)
    expect(moveVelocity(s, cfg)).toBe(-6)
    expect(s.facing).toBe(-1)
  })
})
