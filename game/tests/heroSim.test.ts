import { describe, it, expect } from 'vitest'
import { TICK_MS } from '../src/systems/tick'
import {
  HeroEdges,
  NO_EDGES,
  advanceHero,
  initHeroState,
  makeHeroConfig,
} from '../src/systems/heroSim'

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
    expect(Math.round(400 - apex)).toBe(90)
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
    advanceHero(s, NO_EDGES, 300, cfg) // finish hit1 swing
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg) // chain hit2
    expect(s.combo.stage).toBe(2)
    expect(s.attackId).toBe(2) // new swing -> new id
  })

  it('cannot start a combo while airborne', () => {
    const s = initHeroState(cfg, 480)
    advanceHero(s, edges({ pressJump: true }), TICK_MS, cfg)
    expect(s.vertical.grounded).toBe(false)
    advanceHero(s, edges({ pressAttack: true }), TICK_MS, cfg)
    expect(s.combo.stage).toBe(0)
    expect(s.action).not.toBe('hit1')
  })
})
