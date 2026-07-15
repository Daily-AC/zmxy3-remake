import { describe, expect, it } from 'vitest'
import { validateBattleDefinition } from '@zaixu/game-core'
import { compileSl11BattleDefinition } from '../src/adapters/sl11BattleDefinition'

describe('compileSl11BattleDefinition', () => {
  it('compiles recovered sl11 geometry and encounter timing', () => {
    const definition = compileSl11BattleDefinition(0x5a17)
    const encounter = definition.level.encounters[0]

    expect(definition.level.id).toBe('sl11')
    expect(definition.level.bounds).toEqual({ left: 0, right: 1132, top: -2150, bottom: 430 })
    expect(definition.level.heroSpawn).toEqual({ x: 480, y: 400 })
    expect(definition.level.walls.length).toBeGreaterThan(10)
    expect(definition.level.walls[0]).toMatchObject({ x: -56.546, y: 498.55, width: 1099.991 })
    expect(encounter).toMatchObject({
      kind: 'continuous',
      id: 'continuous-0',
      initialDelayTicks: 90,
      intervalTicks: 180,
      count: 2,
      roster: ['monster30'],
      trigger: {
        kind: 'hero-height',
        atOrAboveY: -1900,
        boss: { speciesId: 'monster3', x: 750, y: -1872.45 },
      },
    })
    expect(definition.level.door).toEqual({ x: 716.85, y: -2037.45, width: 185.8, height: 165 })
  })

  it('compiles real combat and flight behavior without mutating source data', () => {
    const first = compileSl11BattleDefinition(1)
    const second = compileSl11BattleDefinition(2)

    expect(first.seed).toBe(1)
    expect(second.seed).toBe(2)
    expect(first.monsters.monster30.stats).toMatchObject({ hp: 1, speed: 8, def: 0 })
    expect(first.monsters.monster30.behavior).toMatchObject({
      verticalFollow: { enabled: true, speed: 8, arriveThreshold: 20 },
      rangedAttack: { kind: 'Monster30Bullet1', speedPxPerSecond: 620, radius: 58, ttlMs: 900 },
    })
    expect(first.monsters.monster3.stats).toMatchObject({ hp: 160, def: 6 })
    expect(first.hero).toMatchObject({
      maxMp: 50,
      skills: {
        slz: {
          id: 'slz', action: 'hit6', learnedLevel: 1, mpCost: 36,
          durationTicks: 20, cooldownTicks: 20, hitTick: 1, attackKind: 'physics',
        },
      },
    })
    expect(first.hero.skills.slz.damage).toBeGreaterThan(0)
    expect(first.provenance).toContainEqual(expect.objectContaining({ ruleId: 'role1.skill.slz', origin: 'canonical' }))
    expect(validateBattleDefinition(first)).toEqual(first)
  })

  it('compiles original loot tables and pickup physics into production content', () => {
    const definition = compileSl11BattleDefinition(7)
    expect(definition.level.lootPhysics).toMatchObject({ pickupRadius: 70, retryDelayTicks: 30 })
    expect(definition.monsters.monster3.loot?.some((table) =>
      table.choices.some((choice) => choice.lootId === 'item.original.ptdxzg'))).toBe(true)
    expect(definition.monsters.monster30.loot?.some((table) =>
      table.choices.some((choice) => choice.lootId === 'currency.soul'))).toBe(true)
  })
})
