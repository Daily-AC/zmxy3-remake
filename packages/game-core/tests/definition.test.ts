import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateCombatSessionDefinition } from '../src/session/definition'

function attack(action: string) {
  return {
    action,
    hitFrameFractions: [0.5],
    hitbox: { forward: 45, y: 0, width: 90, height: 120 },
  }
}

function validDefinition(): Record<string, any> {
  return {
    version: 1,
    contentVersion: 'combat-core-slice@1',
    tickRate: 30,
    seed: 0x5a17,
    provenance: [
      { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'game/src/systems/tick.ts' },
    ],
    hero: {
      id: 'hero-1',
      contentId: 'character.zaixu.wukong',
      spawn: { x: 480, y: 400 },
      collisionOffset: { x: 7.5, y: -22.5 },
      groundY: 400,
      minX: 90,
      maxX: 1460,
      maxHp: 120,
      atk: 36,
      def: 2,
      magicDefenseFraction: 0,
      critChance: 0,
      comboStageDurationsMs: [300, 300, 300, 1600 / 3, 1600 / 3],
      comboGraceMs: 1500,
      normalAttacks: {
        hit1: attack('hit1'),
        hit2: attack('hit2'),
        hit3: attack('hit3'),
        hit4: attack('hit4'),
        hit5: attack('hit5'),
      },
      hurtbox: { width: 90, height: 150 },
      hurtDurationMs: 260,
      respawnDelayMs: 1500,
    },
    monsters: [
      {
        id: 'monster-1',
        contentId: 'monster.chapter1.monster7',
        spawn: { x: 600, y: 400 },
        collisionOffset: { x: 4.5, y: 3 },
        stats: {
          hp: 500,
          speed: 3,
          attackRange: 250,
          alertRange: 1000,
          normalAttackRate: 1,
          def: 4,
        },
        patrolMin: 170,
        patrolMax: 1380,
        hurtDurationMs: 500,
        attackDurationMs: 1000 / 3,
        deadDurationMs: 500,
        attackCooldownMs: 1000,
        decisionIntervalMs: 1000,
        attack: attack('hit1'),
        attackPower: 14,
        attackKind: 'physics',
        hurtbox: { width: 90, height: 105 },
        targetOffsetX: 7.5,
        selfOffsetX: 4.5,
      },
    ],
  }
}

function zodPaths(error: unknown): string[] {
  expect(error).toBeInstanceOf(z.ZodError)
  return (error as z.ZodError).issues.map((issue) => issue.path.join('.'))
}

describe('validateCombatSessionDefinition', () => {
  it('accepts a complete definition and returns a core-owned clone', () => {
    const source = validDefinition()
    const result = validateCombatSessionDefinition(source)

    source.hero.spawn.x = -1
    source.hero.comboStageDurationsMs[0] = -1
    source.monsters[0].attack.hitbox.width = -1
    source.provenance[0].source = 'changed'

    expect(result.hero.spawn.x).toBe(480)
    expect(result.hero.comboStageDurationsMs[0]).toBe(300)
    expect(result.monsters[0].attack.hitbox.width).toBe(90)
    expect(result.provenance[0].source).toBe('game/src/systems/tick.ts')
  })

  const invalidCases: readonly [string, (value: Record<string, any>) => void, string][] = [
    ['unknown key', (value) => { value.hero.extra = true }, 'hero'],
    ['bad content id', (value) => { value.hero.contentId = 'wukong' }, 'hero.contentId'],
    ['duplicate actor id', (value) => { value.monsters[0].id = 'hero-1' }, 'monsters.0.id'],
    ['attack action mismatch', (value) => { value.hero.normalAttacks.hit2.action = 'hit1' }, 'hero.normalAttacks.hit2.action'],
    ['missing attack record', (value) => { delete value.hero.normalAttacks.hit5 }, 'hero.normalAttacks.hit5'],
    ['empty hit-frame fractions', (value) => { value.hero.normalAttacks.hit1.hitFrameFractions = [] }, 'hero.normalAttacks.hit1.hitFrameFractions'],
    ['NaN', (value) => { value.hero.atk = Number.NaN }, 'hero.atk'],
    ['Infinity', (value) => { value.monsters[0].attackPower = Number.POSITIVE_INFINITY }, 'monsters.0.attackPower'],
    ['negative duration', (value) => { value.hero.comboGraceMs = -1 }, 'hero.comboGraceMs'],
    ['inverted bounds', (value) => { value.hero.minX = value.hero.maxX + 1 }, 'hero.maxX'],
    ['probability above one', (value) => { value.monsters[0].stats.normalAttackRate = 1.01 }, 'monsters.0.stats.normalAttackRate'],
  ]

  it.each(invalidCases)('rejects %s with a useful issue path', (_name, mutate, expectedPath) => {
    const value = validDefinition()
    mutate(value)
    try {
      validateCombatSessionDefinition(value)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(zodPaths(error)).toContain(expectedPath)
    }
  })

  it('rejects functions before schema parsing', () => {
    const value = validDefinition()
    value.hero.spawn.x = () => 1
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })

  it('rejects cyclic input before schema parsing', () => {
    const value = validDefinition()
    value.hero.spawn.self = value.hero.spawn
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })

  it('rejects a cycle hidden in a non-enumerable property', () => {
    const value = validDefinition()
    Object.defineProperty(value.hero.spawn, 'self', {
      configurable: true,
      value: value.hero.spawn,
    })
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })

  it('rejects a function hidden behind a symbol key', () => {
    const value = validDefinition()
    Object.defineProperty(value.hero.spawn, Symbol('hidden'), {
      enumerable: true,
      value: () => 1,
    })
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })

  it('rejects accessors without executing their getter', () => {
    const value = validDefinition()
    let getterCalls = 0
    Object.defineProperty(value.hero.spawn, 'x', {
      enumerable: true,
      get: () => {
        getterCalls += 1
        return 480
      },
    })

    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
    expect(getterCalls).toBe(0)
  })

  it('rejects Array subclasses', () => {
    class ProvenanceArray extends Array<Record<string, unknown>> {}
    const value = validDefinition()
    value.provenance = new ProvenanceArray(...value.provenance)
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })

  it('rejects arrays with a custom prototype', () => {
    const value = validDefinition()
    Object.setPrototypeOf(value.provenance, { custom: true })
    expect(() => validateCombatSessionDefinition(value)).toThrow(TypeError)
  })
})
