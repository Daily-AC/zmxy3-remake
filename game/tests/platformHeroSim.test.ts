import { describe, it, expect } from 'vitest'
import { TICK_MS } from '../src/systems/tick'
import { NO_EDGES, advanceHero, initHeroState, makeHeroConfig } from '../src/systems/heroSim'
import {
  resolveHorizontalMotion,
  resolveVerticalMotion,
  type Wall,
} from '../src/systems/platformSim'

describe('heroSim platform hooks (flat-ground fallback stays optional)', () => {
  it('lands on a through platform above the flat ground through JumpConfig.platformResolver', () => {
    const walls: Wall[] = [{ type: 'through', x: 420, y: 300, width: 160, height: 24 }]
    const cfg = makeHeroConfig({
      groundY: 400,
      minX: 90,
      maxX: 870,
      comboStageDurationsMs: [0, 300, 300, 300, 300, 367],
      comboGraceMs: 220,
    })
    cfg.jump.platformResolver = (q) => resolveVerticalMotion(walls, q)

    const s = initHeroState(cfg, 480)
    s.vertical.grounded = false
    s.vertical.airAction = 'jump3'
    s.vertical.jumpCount = 1
    s.vertical.y = 260
    s.vertical.vy = 12

    for (let i = 0; i < 20 && !s.vertical.grounded; i++) advanceHero(s, NO_EDGES, TICK_MS, cfg)

    expect(s.vertical.grounded).toBe(true)
    expect(s.vertical.y).toBe(300)
  })

  it('blocks horizontal movement against solid side faces through HeroConfig.platformResolver', () => {
    const walls: Wall[] = [{ type: 'solid', x: 520, y: 340, width: 80, height: 90 }]
    const cfg = makeHeroConfig({
      groundY: 400,
      minX: 90,
      maxX: 870,
      comboStageDurationsMs: [0, 300, 300, 300, 300, 367],
      comboGraceMs: 220,
    })
    cfg.resolveHorizontal = (q) => resolveHorizontalMotion(walls, q).x

    const s = initHeroState(cfg, 510)
    advanceHero(s, { ...NO_EDGES, pressRight: true }, TICK_MS, cfg)
    advanceHero(s, NO_EDGES, TICK_MS, cfg)

    expect(s.x).toBe(520)
  })
})
