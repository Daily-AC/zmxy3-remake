import { describe, it, expect } from 'vitest'
import { ComboConfig, initCombo, stepCombo, ComboState } from '../src/hero/combo'
import { TICK_MS } from '../src/time/tick'

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
  it('ends a sixteen-tick action on the sixteenth accumulated tick', () => {
    const exactTicks: ComboConfig = {
      stageDurationsMs: [0, 16 * TICK_MS, 100, 100, 100, 100],
      graceMs: 1500,
      maxStage: 5,
    }
    const state = initCombo()
    stepCombo(state, { attackPressed: true, grounded: true, dtMs: 0 }, exactTicks)

    for (let tick = 1; tick < 16; tick += 1) {
      expect(stepCombo(state, { attackPressed: false, grounded: true, dtMs: TICK_MS }, exactTicks).attacking).toBe(true)
    }
    expect(stepCombo(state, { attackPressed: false, grounded: true, dtMs: TICK_MS }, exactTicks).attacking).toBe(false)
  })

  it('chains at the inclusive grace boundary despite integration noise', () => {
    const state: ComboState = { stage: 1, elapsedMs: 150.0000005 }
    const result = stepCombo(state, { attackPressed: true, grounded: true, dtMs: 0 }, cfg)

    expect(result.action).toBe('hit2')
    expect(state.stage).toBe(2)
  })

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

  // hitstun-triad pen (2026-07-09): a press mid-swing is REJECTED, not
  // buffered -- decompiled export.hero.Role1.myKeyDown() rejects the attack
  // key outright while isAttacking() is true, with no queue/buffer concept.
  // The old "buffered mid-swing press auto-chains" behavior this test used
  // to assert was a project-chosen design (never AS3-sourced, per this
  // module's own prior "chosen feel value" header note) that let a held/
  // spammed attack key chain the full 5-hit combo with near-zero gaps,
  // directly causing the reported "无限眩晕/无脑通关" exploit (every L1/L2
  // monster's real hurtDurationMs is 500ms, well above a single swing's
  // 300-370ms real duration -- see combo.ts's header for the full writeup).
  it('a press mid-swing does nothing; the swing finishes on its own with no chain', () => {
    const s = initCombo()
    press(s) // hit1
    const midSwing = stepCombo(s, { attackPressed: true, grounded: true, dtMs: 40 }, cfg) // pressed again mid-swing
    expect(midSwing.action).toBe('hit1') // still just holding the same swing
    expect(midSwing.changed).toBe(false)
    const r = wait(s, 60) // reaches end of hit1 (100ms) with no fresh press since
    expect(r.action).toBe(null) // NOT hit2 -- the mid-swing press was not remembered
    expect(r.attacking).toBe(false) // free to move/jump immediately once the swing ends
    expect(s.stage).toBe(1) // chain memory still alive, waiting on the grace window
  })

  it('a fresh press after the swing ends (not during it) chains to the next stage', () => {
    const s = initCombo()
    press(s) // hit1
    wait(s, 100) // swing fully ends
    const r = press(s) // a genuinely new press, inside the grace window
    expect(r.action).toBe('hit2')
    expect(s.stage).toBe(2)
  })

  it('is free to move/jump the instant a swing ends, even mid-chain-window', () => {
    const s = initCombo()
    press(s) // hit1
    const r = wait(s, 100) // swing just finished, no press yet
    expect(r.attacking).toBe(false)
    expect(r.action).toBe(null)
    expect(s.stage).toBe(1) // still remembered for a possible chain
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
