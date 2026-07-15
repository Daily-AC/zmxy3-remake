import { describe, expect, it } from 'vitest'
import { BattleRuntime } from '../../src/battle/runtime'
import { makeBattleDefinition } from './fixtures'

describe('BattleRuntime', () => {
  it('spawns continuous encounter actors at deterministic ticks', () => {
    const runtime = new BattleRuntime(makeBattleDefinition())

    expect(runtime.step(89).filter((event) => event.type === 'actor-spawned')).toEqual([])
    const spawned = runtime.step().filter((event) => event.type === 'actor-spawned')

    expect(spawned).toHaveLength(2)
    expect(spawned.map((event) => event.actorId)).toEqual([
      'sl11:continuous-0:monster30:0000',
      'sl11:continuous-0:monster30:0001',
    ])
    expect(runtime.getSnapshot().actors).toHaveLength(3)
  })

  it('starts a whiff attack but rejects key-spam while the swing is busy', () => {
    const definition = makeBattleDefinition()
    const encounter = definition.level.encounters[0]
    if (encounter.kind !== 'continuous') throw new Error('expected continuous fixture')
    encounter.initialDelayTicks = 999
    const runtime = new BattleRuntime(definition)
    runtime.enqueue({ type: 'press-attack', actorId: 'hero-1', sequence: 1, atTick: 1 })
    runtime.enqueue({ type: 'press-attack', actorId: 'hero-1', sequence: 2, atTick: 2 })

    const events = runtime.step(2)

    expect(events.filter((event) => event.type === 'attack-started')).toHaveLength(1)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'command-rejected',
      reason: 'busy',
    }))
    expect(events.some((event) => event.type === 'hit-confirmed')).toBe(false)
  })

  it('resolves horizontal movement against core-owned walls', () => {
    const definition = makeBattleDefinition()
    definition.level.walls.push({ type: 'solid', x: 110, y: 300, width: 40, height: 200 })
    const runtime = new BattleRuntime(definition)
    runtime.enqueue({ type: 'press-right', actorId: 'hero-1', sequence: 1, atTick: 1 })

    runtime.step(10)

    expect(runtime.getSnapshot().actors[0].x).toBe(110)
  })

  it('defeats the triggered boss, reveals the door, and clears through interact', () => {
    const definition = makeBattleDefinition()
    definition.monsters.monster30.stats.hp = 1
    definition.level.heroSpawn = { x: 100, y: 400 }
    definition.hero.spawn = { x: 100, y: 400 }
    definition.level.door = { x: 50, y: 350, width: 100, height: 100 }
    const encounter = definition.level.encounters[0]
    if (encounter.kind !== 'continuous') throw new Error('expected continuous fixture')
    encounter.trigger.atOrAboveY = 400
    encounter.trigger.boss.x = 100
    encounter.trigger.boss.y = 400
    const runtime = new BattleRuntime(definition)
    runtime.enqueue({ type: 'press-attack', actorId: 'hero-1', sequence: 1, atTick: 1 })

    const attackEvents = runtime.step()
    expect(attackEvents).toContainEqual(expect.objectContaining({ type: 'actor-defeated' }))

    expect(runtime.step()).toContainEqual({ type: 'door-revealed', tick: 2, levelId: 'sl11' })
    runtime.enqueue({ type: 'press-interact', actorId: 'hero-1', sequence: 2, atTick: 3 })
    expect(runtime.step()).toContainEqual({ type: 'stage-cleared', tick: 3, levelId: 'sl11' })
    expect(runtime.getSnapshot().level).toEqual({ id: 'sl11', doorVisible: true, cleared: true })
  })

  it('simulates ranged monster projectiles through the hero damage path', () => {
    const definition = makeBattleDefinition()
    const monster = definition.monsters.monster30
    monster.stats.normalAttackRate = 1
    monster.stats.attackRange = 500
    monster.decisionIntervalMs = 1000 / 30
    monster.attackDurationMs = 1000 / 30
    monster.attack.hitFrameFractions = [1]
    monster.attackPower = 5
    monster.behavior = {
      rangedAttack: {
        kind: 'Monster30Bullet1',
        speedPxPerSecond: 620,
        radius: 10,
        ttlMs: 1000,
      },
    }
    const encounter = definition.level.encounters[0]
    if (encounter.kind !== 'continuous') throw new Error('expected continuous fixture')
    encounter.initialDelayTicks = 0
    encounter.count = 1
    encounter.spawnOffset = { x: { min: -100, max: -100 }, y: { min: 0, max: 0 } }
    const runtime = new BattleRuntime(definition)

    const events = runtime.step(20)

    expect(events.some((event) => event.type === 'projectile-spawned')).toBe(true)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'damage-applied',
      targetId: 'hero-1',
      rawPower: 5,
    }))
    expect(runtime.getSnapshot().actors[0].hp).toBeLessThan(120)
  })
})
