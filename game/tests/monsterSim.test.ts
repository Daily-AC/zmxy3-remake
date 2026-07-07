import { describe, it, expect } from 'vitest'
import {
  MonsterConfig,
  MonsterState,
  MonsterEvent,
  MONSTER30_STATS,
  initMonster,
  advanceMonster,
  MonsterInput,
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
