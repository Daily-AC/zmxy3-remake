import { describe, it, expect } from 'vitest'
import {
  MonsterConfig,
  MonsterState,
  MonsterEvent,
  MONSTER30_STATS,
  initMonster,
  advanceMonster,
  MonsterInput,
  VerticalFollowConfig,
} from '../src/systems/monsterSim'
import { TICK_MS } from '../src/systems/tick'
import { MONSTER_ATTACKS } from '../src/systems/attackSpec'

// Advance one fixed tick at a time for `ms`, so the per-call 8-tick budget cap
// (a spiral-of-death guard, irrelevant at real frame deltas) never truncates.
function run(m: MonsterState, input: MonsterInput, ms: number, cfg: MonsterConfig): MonsterEvent[] {
  const events: MonsterEvent[] = []
  const ticks = Math.ceil(ms / TICK_MS)
  for (let i = 0; i < ticks; i++) events.push(...advanceMonster(m, input, TICK_MS, cfg))
  return events
}

function makeCfg(rng: () => number = () => 0): MonsterConfig {
  return {
    stats: MONSTER30_STATS,
    patrolMin: 200,
    patrolMax: 760,
    hurtDurationMs: 500,
    attackDurationMs: 333,
    deadDurationMs: 466,
    attackCooldownMs: 1000,
    decisionIntervalMs: 1000,
    tickMs: TICK_MS,
    rng,
  }
}

const noHit = (heroX: number, heroAlive: boolean): MonsterInput => ({
  heroX,
  heroAlive,
  incomingHit: null,
})

describe('monsterSim Monster30 AI (巡逻/索敌/追击/近战)', () => {
  it('patrols and turns at the patrol bounds when there is no target', () => {
    const cfg = makeCfg(() => 1) // never idle
    const m = initMonster(cfg, 205, 400)
    advanceMonster(m, noHit(9999, false), TICK_MS, cfg)
    expect(m.mode).toBe('patrol')
    expect(m.action).toBe('walk')
    // Started near patrolMin(200) moving left -> hits bound, flips to move right.
    let flipped = false
    for (let i = 0; i < 40; i++) {
      advanceMonster(m, noHit(9999, false), TICK_MS, cfg)
      if (m.patrolDir === 1) flipped = true
    }
    expect(flipped).toBe(true)
    expect(m.x).toBeGreaterThanOrEqual(cfg.patrolMin)
  })

  it('detects a hero in alertRange and chases by walking toward them', () => {
    const cfg = makeCfg()
    const m = initMonster(cfg, 500, 400)
    advanceMonster(m, noHit(800, true), TICK_MS, cfg) // dist 300 > attackRange 250
    expect(m.mode).toBe('chase')
    expect(m.facing).toBe(1)
    expect(m.action).toBe('walk')
    expect(m.x).toBeCloseTo(507, 5) // moved +speed(7) toward hero
  })

  it('target acquisition uses full 2D distance against alertRange (BaseMonster.as:466); the attack-range gate stays x-only (BaseMonster.as:369)', () => {
    const tooFarCfg = makeCfg(() => 0)
    const tooFar = initMonster(tooFarCfg, 500, 400)
    const tooFarEvents = run(
      tooFar,
      { heroX: 600, heroY: 1500, heroAlive: true, incomingHit: null },
      1050,
      tooFarCfg,
    )
    expect(tooFar.mode).toBe('patrol')
    expect(tooFarEvents.some((e) => e.type === 'attack-start')).toBe(false)

    const engagedCfg = makeCfg(() => 0)
    const engaged = initMonster(engagedCfg, 500, 400)
    const engagedEvents = run(
      engaged,
      { heroX: 600, heroY: 1100, heroAlive: true, incomingHit: null },
      1050,
      engagedCfg,
    )
    expect(engaged.mode).toBe('attack')
    expect(engagedEvents.some((e) => e.type === 'attack-start')).toBe(true)
  })

  it('melee-attacks (hit1) when the hero is inside attackRange on a decision tick', () => {
    const cfg = makeCfg(() => 0) // rng 0 < normalAttackRate 0.5 -> attack
    const m = initMonster(cfg, 500, 400)
    const events = run(m, noHit(600, true), 1050, cfg) // dist 100, ~1s -> a decision
    expect(m.mode).toBe('attack')
    expect(m.action).toBe('hit1')
    expect(events.some((e) => e.type === 'attack-start')).toBe(true)
  })

  it('does not attack when the rng roll misses the attack rate', () => {
    const cfg = makeCfg(() => 0.99) // 0.99 > 0.5 -> never attacks
    const m = initMonster(cfg, 500, 400)
    run(m, noHit(600, true), 1050, cfg)
    expect(m.mode).toBe('chase')
    expect(m.action).toBe('wait') // in range, holding
  })

  describe('attack frame decoupled from attack-start and collision', () => {
    function meleeCfg(rng: () => number = () => 0): MonsterConfig {
      return { ...makeCfg(rng), attackDurationMs: 300, attackSpec: MONSTER_ATTACKS.monster7.hit1 }
    }

    it('emits attack-frame even if the hero leaves the old melee reach before that frame', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      let events = run(m, noHit(580, true), 1000, cfg)
      expect(m.mode).toBe('attack')
      expect(events.some((e) => e.type === 'attack-start')).toBe(true)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(false)
      events = run(m, noHit(800, true), 100, cfg)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(false)
      events = run(m, noHit(800, true), 250, cfg)
      expect(events.filter((e) => e.type === 'attack-frame')).toHaveLength(1)
      expect(m.mode).toBe('chase') // attack completed (as a total whiff)
    })

    it('emits attack-frame exactly once when the action crosses its configured fraction', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      let events = run(m, noHit(580, true), 1000, cfg)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(false)
      events = run(m, noHit(580, true), 200, cfg)
      expect(events.filter((e) => e.type === 'attack-frame')).toHaveLength(1)
      events = run(m, noHit(580, true), 150, cfg)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(false)
      expect(m.mode).toBe('chase')
    })

    it('leaves crossing and facing geometry to the scene hitbox resolver', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      run(m, noHit(580, true), 1000, cfg)
      expect(m.facing).toBe(1)
      const events = run(m, noHit(450, true), 200, cfg)
      expect(events.filter((e) => e.type === 'attack-frame')).toHaveLength(1)
    })

    it('falls back to a 0.5 hit fraction when AttackSpec is omitted', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      let events = run(m, noHit(600, true), 1000, cfg)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(false)
      events = run(m, noHit(600, true), 200, cfg)
      expect(events.some((e) => e.type === 'attack-frame')).toBe(true)
    })
  })

  it('emits Monster30Bullet1 projectile-spawn at the hit frame when configured as ranged, not melee damage', () => {
    const cfg: MonsterConfig = {
      ...makeCfg(() => 0),
      attackDurationMs: 300,
      attackSpec: MONSTER_ATTACKS.monster30.hit1,
      rangedAttack: { kind: 'Monster30Bullet1', speedPxPerSecond: 600, radius: 50, ttlMs: 900 },
    }
    const m = initMonster(cfg, 500, 400)
    let events = run(m, { heroX: 600, heroY: 410, heroAlive: true, incomingHit: null }, 1000, cfg)
    expect(events.some((e) => e.type === 'attack-start')).toBe(true)
    expect(events.some((e) => e.type === 'attack-frame')).toBe(false)

    events = run(m, { heroX: 600, heroY: 410, heroAlive: true, incomingHit: null }, 310, cfg)
    expect(events.filter((e) => e.type === 'projectile-spawn')).toEqual([
      {
        type: 'projectile-spawn',
        x: 500,
        y: 400,
        facing: 1,
        targetX: 600,
        targetY: 410,
        projectile: cfg.rangedAttack,
      },
    ])
    expect(events.filter((e) => e.type === 'attack-frame')).toHaveLength(1)
  })

  it('takes a hit once per attack id and enters hurt', () => {
    const cfg = makeCfg()
    const m = initMonster(cfg, 500, 400)
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 1, damage: 30 } }, TICK_MS, cfg)
    expect(m.hp).toBe(150 - (30 - MONSTER30_STATS.def)) // 123
    expect(m.mode).toBe('hurt')
    // Same attack id again does not deal damage.
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 1, damage: 30 } }, TICK_MS, cfg)
    expect(m.hp).toBe(123)
    // A new attack id deals damage again.
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 2, damage: 30 } }, TICK_MS, cfg)
    expect(m.hp).toBe(96)
  })

  it('dies on lethal damage and emits a death event when the dead animation ends', () => {
    const cfg = makeCfg()
    const m = initMonster(cfg, 500, 400)
    let events = advanceMonster(
      m,
      { heroX: 500, heroAlive: true, incomingHit: { attackId: 1, damage: 200 } },
      TICK_MS,
      cfg,
    )
    expect(m.hp).toBe(0)
    expect(m.mode).toBe('dead')
    expect(events.some((e) => e.type === 'death')).toBe(false) // not yet
    // Play out the dead animation.
    events = run(m, noHit(500, true), 600, cfg)
    expect(m.mode).toBe('gone')
    expect(events.some((e) => e.type === 'death')).toBe(true)
  })

  describe('short stagger armor', () => {
    function hit(m: MonsterState, cfg: MonsterConfig, attackId: number, damage = 8): void {
      advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId, damage } }, TICK_MS, cfg)
    }

    it('lets a grunt take damage but stops re-entering hurt after four consecutive staggers', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 4; id++) hit(m, cfg, id)
      const hp = m.hp

      hit(m, cfg, 5)

      expect(m.hp).toBeLessThan(hp)
      expect(m.staggerArmorMs).toBeGreaterThan(0)
      expect(m.mode).toBe('chase')
    })

    it('uses six consecutive staggers for a boss', () => {
      const cfg: MonsterConfig = { ...makeCfg(), isBoss: true }
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 5; id++) hit(m, cfg, id)
      expect(m.mode).toBe('hurt')
      expect(m.staggerArmorMs).toBe(0)

      hit(m, cfg, 6)

      expect(m.staggerArmorMs).toBe(1200)
      expect(m.staggerHits).toBe(0)
      expect(m.mode).toBe('chase')
    })

    it('resets consecutive stagger progress after 2000ms without a new hit', () => {
      const cfg = makeCfg(() => 1)
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 3; id++) hit(m, cfg, id)
      expect(m.staggerHits).toBe(3)

      run(m, noHit(500, true), 1900, cfg)
      expect(m.staggerHits).toBe(3)
      expect(m.staggerResetMs).toBeGreaterThan(0)

      run(m, noHit(500, true), 100, cfg)
      expect(m.staggerHits).toBe(0)
      expect(m.staggerResetMs).toBe(0)

      hit(m, cfg, 4)
      expect(m.staggerHits).toBe(1)
      expect(m.staggerArmorMs).toBe(0)
      expect(m.mode).toBe('hurt')
    })

    it('continues applying damage while stagger armor is active', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 4; id++) hit(m, cfg, id)
      const hp = m.hp

      hit(m, cfg, 5, 30)

      expect(m.hp).toBe(hp - (30 - cfg.stats.def))
      expect(m.staggerArmorMs).toBeGreaterThan(0)
      expect(m.mode).not.toBe('hurt')
    })

    it('does not interrupt an attack when hit during active stagger armor', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 4; id++) hit(m, cfg, id)
      m.mode = 'attack'
      m.action = 'hit1'
      m.modeElapsedMs = 80
      const hp = m.hp

      hit(m, cfg, 5, 30)

      expect(m.hp).toBe(hp - (30 - cfg.stats.def))
      expect(m.mode).toBe('attack')
      expect(m.action).toBe('hit1')
      expect(m.modeElapsedMs).toBeGreaterThan(80)
    })

    it('applies sub-tick hits immediately without advancing armor or attack timers', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 4; id++) hit(m, cfg, id)
      m.mode = 'attack'
      m.action = 'hit1'
      m.modeElapsedMs = 80
      m.cooldownMs = 500
      const hp = m.hp

      for (let id = 5; id < 38; id++) {
        advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: id, damage: 4 } }, 1, cfg)
      }

      expect(m.hp).toBe(hp - 33)
      expect(m.staggerArmorMs).toBe(1200)
      expect(m.cooldownMs).toBe(500)
      expect(m.mode).toBe('attack')
      expect(m.modeElapsedMs).toBe(80)

      advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 38, damage: 4 } }, 1, cfg)
      expect(m.hp).toBe(hp - 34)
      expect(m.staggerArmorMs).toBeCloseTo(1200 - TICK_MS, 8)
      expect(m.cooldownMs).toBeCloseTo(500 - TICK_MS, 8)
      expect(m.mode).toBe('attack')
      expect(m.modeElapsedMs).toBeCloseTo(80 + TICK_MS, 8)
    })

    it('still deduplicates and applies lethal damage immediately during stagger armor', () => {
      const cfg = makeCfg()
      const m = initMonster(cfg, 500, 400)
      for (let id = 1; id <= 4; id++) hit(m, cfg, id)
      expect(m.staggerArmorMs).toBe(1200)

      hit(m, cfg, 5, 30)
      const hp = m.hp
      hit(m, cfg, 5, 30)
      expect(m.hp).toBe(hp)

      hit(m, cfg, 6, 999)
      expect(m.hp).toBe(0)
      expect(m.mode).toBe('dead')
    })
  })

  it('ignores hits once gone', () => {
    const cfg = makeCfg()
    const m = initMonster(cfg, 500, 400)
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 1, damage: 200 } }, TICK_MS, cfg)
    run(m, noHit(500, true), 600, cfg)
    expect(m.mode).toBe('gone')
    const hpBefore = m.hp
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 9, damage: 50 } }, TICK_MS, cfg)
    expect(m.hp).toBe(hpBefore)
    expect(m.mode).toBe('gone')
  })
})

describe('monsterSim vertical follow (opt-in Y-axis pursuit, verdict-fixes棒)', () => {
  const follow = (overrides: Partial<VerticalFollowConfig> = {}): VerticalFollowConfig => ({
    enabled: true,
    speed: 10,
    arriveThreshold: 5,
    ...overrides,
  })

  it('does nothing when verticalFollow is absent (default) -- x-only monsters unaffected', () => {
    const cfg = makeCfg() // no verticalFollow field at all
    const m = initMonster(cfg, 500, 400)
    run(m, { heroX: 800, heroY: 100, heroAlive: true, incomingHit: null }, 2000, cfg)
    expect(m.y).toBe(400) // untouched regardless of how far x-chase/attack cycled
  })

  it('closes vertical distance toward heroY while chasing when enabled', () => {
    const cfg: MonsterConfig = { ...makeCfg(), verticalFollow: follow() }
    const m = initMonster(cfg, 500, 400)
    // dist(x) = 300 > attackRange(250) -> chase-walk branch, still has a target.
    advanceMonster(m, { heroX: 800, heroY: 100, heroAlive: true, incomingHit: null }, TICK_MS, cfg)
    expect(m.mode).toBe('chase')
    expect(m.y).toBe(390) // stepped speed(10) toward heroY(100), from 400
  })

  it('stops closing once within arriveThreshold of heroY (no overshoot/jitter)', () => {
    const cfg: MonsterConfig = { ...makeCfg(), verticalFollow: follow({ speed: 10, arriveThreshold: 5 }) }
    const m = initMonster(cfg, 500, 400)
    m.y = 397 // within arriveThreshold(5) of heroY(400) below
    advanceMonster(m, { heroX: 800, heroY: 400, heroAlive: true, incomingHit: null }, TICK_MS, cfg)
    expect(m.y).toBe(397) // held, did not overshoot past heroY
  })

  it('does not move vertically when enabled:false (same as absent)', () => {
    const cfg: MonsterConfig = { ...makeCfg(), verticalFollow: follow({ enabled: false }) }
    const m = initMonster(cfg, 500, 400)
    run(m, { heroX: 800, heroY: 100, heroAlive: true, incomingHit: null }, 2000, cfg)
    expect(m.y).toBe(400)
  })

  it('regression: switch off leaves x/mode/action/hp trajectory identical to the pre-existing x-only baseline', () => {
    // Same scenario as "melee-attacks (hit1) when the hero is inside attackRange
    // on a decision tick" above, replayed once with no verticalFollow field and
    // once with verticalFollow explicitly disabled -- both must land on the
    // exact same state as the original (pre-feature) assertions.
    for (const cfg of [makeCfg(() => 0), { ...makeCfg(() => 0), verticalFollow: follow({ enabled: false }) }]) {
      const m = initMonster(cfg, 500, 400)
      const events = run(m, { heroX: 600, heroY: 100, heroAlive: true, incomingHit: null }, 1050, cfg)
      expect(m.mode).toBe('attack')
      expect(m.action).toBe('hit1')
      expect(m.x).toBe(500) // x-only baseline: attacking holds x in place
      expect(m.y).toBe(400) // untouched regardless of heroY
      expect(events.some((e) => e.type === 'attack-start')).toBe(true)
    }
  })
})
