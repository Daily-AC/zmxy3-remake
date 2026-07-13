import { describe, it, expect } from 'vitest'
import { TICK_MS } from '../src/time/tick'
import { currentDir } from '../src/hero/locomotion'
import {
  HeroEdges,
  NO_EDGES,
  advanceHero,
  clearHeroInputForLock,
  initHeroState,
  makeHeroConfig,
} from '../src/hero/heroSim'

const cfg = makeHeroConfig({
  groundY: 400,
  minX: 90,
  maxX: 870,
  comboStageDurationsMs: [0, 300, 300, 300, 300, 367],
  comboGraceMs: 220,
})

function edges(partial: Partial<HeroEdges>): HeroEdges {
  return { ...NO_EDGES, ...partial }
}

describe('heroSim integration (fixed-timestep 组合)', () => {
  it('walks right while the key is held, then stops on release', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg)
    expect(s.action).toBe('walk')
    expect(s.x).toBeCloseTo(486, 5) // +6 px/tick
    advanceHero(s, NO_EDGES, TICK_MS, cfg) // key still held, no new edge
    expect(s.x).toBeCloseTo(492, 5)
    advanceHero(s, edges({ releaseRight: true }), TICK_MS, cfg)
    expect(s.action).toBe('wait')
    expect(s.x).toBeCloseTo(492, 5) // stopped
  })

  it('double-tap right runs at 10 px/tick and shows the run action', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg)
    advanceHero(s, edges({ releaseRight: true }), TICK_MS, cfg)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg) // second tap, in window
    expect(s.move.running).toBe(true)
    expect(s.action).toBe('run')
    const before = s.x
    advanceHero(s, NO_EDGES, TICK_MS, cfg)
    expect(s.x - before).toBeCloseTo(10, 5)
  })

  it('jumps into the air and lands back after a symmetric arc', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    expect(s.vertical.grounded).toBe(false)
    expect(s.action).toBe('jump1')
    let ticks = 1
    let apex = s.vertical.y
    while (!s.vertical.grounded && ticks < 1000) {
      advanceHero(s, NO_EDGES, TICK_MS, cfg)
      apex = Math.min(apex, s.vertical.y)
      ticks++
    }
    expect(Math.round(400 - apex)).toBe(124) // gravity=1.5, see jump.ts header
    expect(s.vertical.y).toBe(400)
    expect(s.action).toBe('wait')
  })

  it('performs a double jump (jump2 roll) and refuses a third', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    advanceHero(s, NO_EDGES, TICK_MS, cfg)
    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    expect(s.vertical.jumpCount).toBe(2)
    expect(s.action).toBe('jump2')
    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    expect(s.vertical.jumpCount).toBe(2) // no triple jump
  })

  it('a combo suppresses horizontal movement and jumping', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg) // start walking right
    const xAtAttack = s.x
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg) // start hit1
    expect(s.action).toBe('hit1')
    expect(s.combo.stage).toBe(1)
    // Hold through the swing: x must not advance and jump is ignored.
    for (let i = 0; i < 5; i++) advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    expect(s.x).toBe(xAtAttack)
    expect(s.vertical.grounded).toBe(true)
  })

  it('bumps the attack id on every new combo stage for hit dedup', () => {
    const s = initHeroState(cfg, 480)
    expect(s.attackId).toBe(0)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg) // hit1
    expect(s.attackId).toBe(1)
    for (let i = 0; i < 9; i++) advanceHero(s, NO_EDGES, TICK_MS, cfg) // finish hit1 swing
    expect(s.attacking).toBe(false)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg) // chain hit2
    expect(s.combo.stage).toBe(2)
    expect(s.attackId).toBe(2) // new swing -> new id
  })

  it('exposes s.attacking=false during the post-swing grace window even though combo.stage stays nonzero (combat-triage pen, 2026-07-10)', () => {
    // s.attacking is what BattleScene's resolveHeroHits() now gates the melee
    // hitbox on -- combo.stage alone stays >0 through the whole grace window
    // (chain memory), which used to leave the hitbox live long after the
    // swing visually ended ("乌鸦还没被打就死了"). Ticks one TICK_MS at a
    // time (like advanceHero's own internal stepping) so advanceHero's
    // spiral-of-death budget cap (8 ticks/call) never truncates a call short
    // of a full stage duration.
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg) // start hit1
    expect(s.combo.stage).toBe(1)
    expect(s.attacking).toBe(true) // genuinely mid-swing
    for (let i = 0; i < 9; i++) advanceHero(s, NO_EDGES, TICK_MS, cfg) // finish hit1's swing (duration 300ms), no fresh press
    expect(s.combo.stage).toBe(1) // still alive as chain memory
    expect(s.attacking).toBe(false) // but the swing itself is over
    for (let i = 0; i < 7; i++) advanceHero(s, NO_EDGES, TICK_MS, cfg) // let the grace window (220ms) expire too
    expect(s.combo.stage).toBe(0)
    expect(s.attacking).toBe(false)
  })

  it('does not advance simulation time when rapid edges arrive before a fixed tick', () => {
    const s = initHeroState(cfg, 480)

    for (let i = 0; i < 20; i++) advanceHero(s, edges({ pressAttack: true }), 1, cfg)

    expect(s.simClockMs).toBe(0)
    expect(s.attackId).toBe(0)

    advanceHero(s, NO_EDGES, TICK_MS - 20, cfg)

    expect(s.simClockMs).toBe(TICK_MS)
    expect(s.attackId).toBe(1)
  })

  it('merges distinct edges before a fixed tick and consumes them only once', () => {
    const s = initHeroState(cfg, 480)

    advanceHero(s, edges({ pressRight: true }), 5, cfg)
    advanceHero(s, edges({ pressJump: true }), 5, cfg)

    expect(s.simClockMs).toBe(0)
    advanceHero(s, NO_EDGES, TICK_MS - 10, cfg)

    expect(s.simClockMs).toBe(TICK_MS)
    expect(s.move.heldRight).toBe(true)
    expect(s.vertical.jumpCount).toBe(1)
    expect(s.x).toBeCloseTo(486, 5)

    advanceHero(s, NO_EDGES, TICK_MS, cfg)

    expect(s.vertical.jumpCount).toBe(1)
    expect(s.x).toBeCloseTo(492, 5)
  })

  it('attacks while airborne without changing the jump trajectory', () => {
    const attacked = initHeroState(cfg, 480)
    const control = initHeroState(cfg, 480)

    advanceHero(attacked, edges({ pressJump: true }), TICK_MS, cfg)
    advanceHero(control, edges({ pressJump: true }), TICK_MS, cfg)
    advanceHero(attacked, edges({ pressAttack: true }), TICK_MS, cfg)
    advanceHero(control, NO_EDGES, TICK_MS, cfg)

    expect(attacked.action).toBe('hit1')
    expect(attacked.vertical.y).toBe(control.vertical.y)
    expect(attacked.vertical.vy).toBe(control.vertical.vy)
  })

  it('discards attack presses during an active air attack', () => {
    const s = initHeroState(cfg, 480)

    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    expect(s.action).toBe('hit1')
    expect(s.attackId).toBe(1)

    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    for (let i = 0; i < 7; i++) advanceHero(s, NO_EDGES, TICK_MS, cfg)
    expect(s.action).toBe('hit1')

    advanceHero(s, NO_EDGES, TICK_MS, cfg)

    expect(s.vertical.grounded).toBe(false)
    expect(s.action).not.toBe('hit1')
    expect(s.attackId).toBe(1)
    expect(s.combo.stage).toBe(0)

    while (!s.vertical.grounded) advanceHero(s, NO_EDGES, TICK_MS, cfg)
    expect(s.combo.stage).toBe(0)
    expect(s.attackId).toBe(1)
  })

  it('does not latch 1ms key-repeat presses from an active ground swing into hit2', () => {
    const s = initHeroState(cfg, 480)

    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    for (let i = 0; i < 301; i++) advanceHero(s, edges({ pressAttack: true }), 1, cfg)

    expect(s.combo.stage).toBe(1)
    expect(s.attacking).toBe(false)
    expect(s.attackId).toBe(1)

    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    expect(s.combo.stage).toBe(2)
    expect(s.attackId).toBe(2)
  })

  it('does not latch 1ms key-repeat presses into a second air attack', () => {
    const s = initHeroState(cfg, 480)

    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    for (let i = 0; i < 301; i++) advanceHero(s, edges({ pressAttack: true }), 1, cfg)

    expect(s.vertical.grounded).toBe(false)
    expect(s.airAttack).toBe(null)
    expect(s.combo.stage).toBe(0)
    expect(s.attackId).toBe(1)

    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    expect(s.action).toBe('hit1')
    expect(s.attackId).toBe(2)
  })

  it('clears held and pending input before a shared busy lock', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg)
    advanceHero(s, edges({ releaseRight: true }), TICK_MS, cfg)
    advanceHero(s, edges({ pressRight: true }), TICK_MS, cfg)
    expect(s.move.heldRight).toBe(true)
    expect(s.move.running).toBe(true)

    advanceHero(s, edges({
      pressLeft: true,
      releaseLeft: true,
      pressRight: true,
      releaseRight: true,
      pressJump: true,
      pressAttack: true,
    }), 1, cfg)
    expect(s.pendingEdges).toEqual(edges({
      pressLeft: true,
      releaseLeft: true,
      pressRight: true,
      releaseRight: true,
      pressJump: true,
      pressAttack: true,
    }))

    clearHeroInputForLock(s)

    expect(s.pendingEdges).toEqual(NO_EDGES)
    expect(s.move.heldLeft).toBe(false)
    expect(s.move.heldRight).toBe(false)
    expect(s.move.running).toBe(false)
    expect(currentDir(s.move)).toBe(0)

    const x = s.x
    advanceHero(s, NO_EDGES, TICK_MS, cfg)
    expect(s.x).toBe(x)
    expect(s.combo.stage).toBe(0)
    expect(s.attackId).toBe(0)
    expect(s.vertical.grounded).toBe(true)
    expect(s.vertical.jumpCount).toBe(0)
  })
})
