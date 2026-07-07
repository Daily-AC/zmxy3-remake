import { describe, it, expect } from 'vitest'
import { ComboConfig, initCombo, stepCombo, ComboState } from '../src/systems/combo'

const cfg: ComboConfig = {
  // stages 1..5 each 100ms; index 0 unused.
  stageDurationsMs: [0, 100, 100, 100, 100, 100],
  graceMs: 50,
  maxStage: 5,
}

function press(state: ComboState, grounded = true) {
  return stepCombo(state, { attackPressed: true, grounded, dtMs: 0 }, cfg)
}
function wait(state: ComboState, dtMs: number, grounded = true) {
  return stepCombo(state, { attackPressed: false, grounded, dtMs }, cfg)
}

describe('combo state machine (五段连击窗口判定)', () => {
  it('a grounded press starts hit1', () => {
    const s = initCombo()
    const r = press(s)
    expect(r.action).toBe('hit1')
    expect(r.attacking).toBe(true)
    expect(s.stage).toBe(1)
  })

  it('does not start in the air', () => {
    const s = initCombo()
    const r = press(s, false)
    expect(r.action).toBe(null)
    expect(s.stage).toBe(0)
  })

  it('a press buffered mid-swing chains to the next stage when the swing ends', () => {
    const s = initCombo()
    press(s) // hit1
    stepCombo(s, { attackPressed: true, grounded: true, dtMs: 40 }, cfg) // buffer mid-swing
    expect(s.buffered).toBe(true)
    const r = wait(s, 60) // reaches end of hit1 (100ms) with no new press
    expect(r.action).toBe('hit2')
    expect(s.stage).toBe(2)
  })

  it('walks the full chain hit1 -> hit5 with well-timed presses', () => {
    const s = initCombo()
    press(s) // hit1
    for (let stage = 2; stage <= 5; stage++) {
      wait(s, 100) // finish current swing (now in grace window)
      const r = press(s) // fresh press inside grace
      expect(s.stage).toBe(stage)
      expect(r.action).toBe(`hit${stage}`)
    }
  })

  it('resets to idle when the grace window closes with no press', () => {
    const s = initCombo()
    press(s) // hit1
    wait(s, 100) // swing done, in grace
    const r = wait(s, 60) // 160ms > 100 + 50 grace -> reset
    expect(r.action).toBe(null)
    expect(r.attacking).toBe(false)
    expect(s.stage).toBe(0)
  })

  it('a late fresh press after the window does not chain (超窗回 wait)', () => {
    const s = initCombo()
    press(s) // hit1
    // Jump straight past the grace window in one coarse step, with a press.
    const r = stepCombo(s, { attackPressed: true, grounded: true, dtMs: 200 }, cfg)
    expect(r.action).toBe(null)
    expect(s.stage).toBe(0)
  })

  it('the fifth stage ends the combo (no sixth stage)', () => {
    const s = initCombo()
    press(s)
    for (let stage = 2; stage <= 5; stage++) {
      wait(s, 100)
      press(s)
    }
    expect(s.stage).toBe(5)
    const r = wait(s, 100) // hit5 finishes -> reset, cannot become hit6
    expect(r.action).toBe(null)
    expect(s.stage).toBe(0)
  })
})
