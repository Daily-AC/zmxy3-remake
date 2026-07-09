import { describe, it, expect } from 'vitest'
import {
  JumpConfig,
  DEFAULT_JUMP_CONFIG,
  initVertical,
  requestJump,
  stepVertical,
} from '../src/systems/jump'

const cfg: JumpConfig = { ...DEFAULT_JUMP_CONFIG, groundY: 400 }

describe('jump physics (重力/落地/跳跃曲线)', () => {
  it('rests on the ground with no vertical velocity', () => {
    const v = initVertical(400)
    expect(v.grounded).toBe(true)
    expect(v.y).toBe(400)
    stepVertical(v, cfg)
    expect(v.y).toBe(400)
    expect(v.grounded).toBe(true)
  })

  it('a jump sets upward velocity and leaves the ground as jump1', () => {
    const v = initVertical(400)
    requestJump(v, cfg)
    expect(v.vy).toBe(-20)
    expect(v.grounded).toBe(false)
    expect(v.jumpCount).toBe(1)
    expect(v.airAction).toBe('jump1')
  })

  it('traces a symmetric arc: rises, apexes, then falls back and lands', () => {
    const v = initVertical(400)
    requestJump(v, cfg)
    let apex = v.y
    let ticks = 0
    while (!v.grounded && ticks < 1000) {
      stepVertical(v, cfg)
      apex = Math.min(apex, v.y)
      ticks++
    }
    // gravity=1.5 (base.BaseObject.as:55), jumpPower=-20 (semi-implicit
    // Euler): apex 124px, 26 ticks air.
    expect(Math.round(400 - apex)).toBe(124)
    expect(ticks).toBe(26)
    // Lands exactly back on the ground with state reset.
    expect(v.y).toBe(400)
    expect(v.grounded).toBe(true)
    expect(v.jumpCount).toBe(0)
    expect(v.airAction).toBe(null)
  })

  it('switches jump1 -> jump3 once the apex is passed', () => {
    const v = initVertical(400)
    requestJump(v, cfg)
    expect(v.airAction).toBe('jump1')
    let sawJump3 = false
    while (!v.grounded) {
      stepVertical(v, cfg)
      if (v.airAction === 'jump3') sawJump3 = true
    }
    expect(sawJump3).toBe(true)
  })

  it('allows a double jump (jump2) but not a third', () => {
    const v = initVertical(400)
    requestJump(v, cfg) // 1st
    stepVertical(v, cfg)
    requestJump(v, cfg) // 2nd -> double-jump roll
    expect(v.jumpCount).toBe(2)
    expect(v.airAction).toBe('jump2')
    expect(v.vy).toBe(-20)
    requestJump(v, cfg) // 3rd -> ignored
    expect(v.jumpCount).toBe(2)
  })

  it('the second jump does not convert to jump3 (roll persists)', () => {
    const v = initVertical(400)
    requestJump(v, cfg)
    stepVertical(v, cfg)
    requestJump(v, cfg)
    while (!v.grounded) {
      stepVertical(v, cfg)
      if (!v.grounded) expect(v.airAction).toBe('jump2')
    }
  })
})
