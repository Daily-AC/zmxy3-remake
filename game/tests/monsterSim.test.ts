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

  describe('melee hit-frame decoupled from attack-start (battle-fidelity 追加单, 2026-07-08)', () => {
    // meleeReach(100) deliberately much smaller than attackRange(250, from
    // MONSTER30_STATS) -- attackRange is the "decide to engage" sensing
    // radius; meleeReach is the real swing reach, checked only at the hit
    // frame. attackHitFraction 0.5 of attackDurationMs(300) = hit frame at
    // 150ms into the swing (tick 5 of 9, TICK_MS≈33.33).
    function meleeCfg(rng: () => number = () => 0): MonsterConfig {
      return { ...makeCfg(rng), attackDurationMs: 300, attackHitFraction: 0.5, meleeReach: 100 }
    }

    it('does not deal damage if the hero leaves meleeReach between attack-start and the hit frame', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      // Decision tick at ~1000ms starts the attack with hero at dist 80 (in
      // both attackRange and meleeReach) -- this must NOT fire attack-hit
      // immediately (that was the bug: attack-start used to deal damage here).
      let events = run(m, noHit(580, true), 1000, cfg)
      expect(m.mode).toBe('attack')
      expect(events.some((e) => e.type === 'attack-start')).toBe(true)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false)
      // Hero retreats to dist 300 (> meleeReach 100, still < attackRange 250)
      // before the hit frame (150ms) elapses.
      events = run(m, noHit(800, true), 100, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false)
      // Advance past the hit frame and the whole attack, hero still far away.
      events = run(m, noHit(800, true), 250, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false)
      expect(m.mode).toBe('chase') // attack completed (as a total whiff)
    })

    it('deals damage exactly once, at the real hit frame, when the hero stays in meleeReach', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      let events = run(m, noHit(580, true), 1000, cfg) // starts attack, dist 80, modeElapsedMs=0
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false) // not yet -- still frame 0
      events = run(m, noHit(580, true), 170, cfg) // crosses the 150ms hit frame (~200ms elapsed)
      expect(events.filter((e) => e.type === 'attack-hit')).toHaveLength(1)
      // Finishing out the swing (total attackDurationMs 300ms) must not fire a second attack-hit.
      events = run(m, noHit(580, true), 150, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false)
      expect(m.mode).toBe('chase')
    })

    it('misses if the hero ends up behind the monster (wrong facing side) at the hit frame', () => {
      const cfg = meleeCfg()
      const m = initMonster(cfg, 500, 400)
      // Hero starts to the right (dist 80) -> monster commits to facing +1.
      run(m, noHit(580, true), 1000, cfg)
      expect(m.facing).toBe(1)
      // Hero darts to the monster's LEFT side, still well within meleeReach
      // by distance alone, before the hit frame.
      const events = run(m, noHit(450, true), 200, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false)
    })

    it('falls back to 0.5 fraction / stats.attackRange reach when attackHitFraction/meleeReach are omitted (back-compat)', () => {
      const cfg = makeCfg() // no attackHitFraction/meleeReach -- every pre-existing config literal in this repo
      const m = initMonster(cfg, 500, 400)
      // attackDurationMs(333) * 0.5 = 166.5ms hit frame; dist(100) <= attackRange(250).
      let events = run(m, noHit(600, true), 1000, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(false) // frame 0, not yet
      events = run(m, noHit(600, true), 200, cfg)
      expect(events.some((e) => e.type === 'attack-hit')).toBe(true)
    })
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
