import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateBattleDefinition } from '../../src/battle/definition'
import { makeBattleDefinition } from './fixtures'

function paths(error: unknown): string[] {
  expect(error).toBeInstanceOf(z.ZodError)
  return (error as z.ZodError).issues.map((issue) => issue.path.join('.'))
}

describe('validateBattleDefinition', () => {
  it('accepts a complete definition and returns an owned clone', () => {
    const source = makeBattleDefinition()
    const result = validateBattleDefinition(source)

    source.level.walls[0].x = 999
    source.level.encounters[0].id = 'changed'
    source.monsters.monster30.stats.hp = 999

    expect(result).not.toBe(source)
    expect(result.level.walls[0].x).toBe(0)
    expect(result.level.encounters[0].id).toBe('continuous-0')
    expect(result.monsters.monster30.stats.hp).toBe(150)
  })

  const invalidCases: readonly [string, (value: any) => void, string][] = [
    ['inverted horizontal bounds', (value) => { value.level.bounds.right = value.level.bounds.left - 1 }, 'level.bounds.right'],
    ['inverted vertical bounds', (value) => { value.level.bounds.bottom = value.level.bounds.top - 1 }, 'level.bounds.bottom'],
    ['duplicate encounter id', (value) => { value.level.encounters.push({ ...value.level.encounters[0] }) }, 'level.encounters.1.id'],
    ['unknown roster species', (value) => { value.level.encounters[0].roster = ['missing'] }, 'level.encounters.0.roster.0'],
    ['unknown boss species', (value) => { value.level.encounters[0].trigger.boss.speciesId = 'missing' }, 'level.encounters.0.trigger.boss.speciesId'],
    ['zero interval', (value) => { value.level.encounters[0].intervalTicks = 0 }, 'level.encounters.0.intervalTicks'],
    ['zero count', (value) => { value.level.encounters[0].count = 0 }, 'level.encounters.0.count'],
    ['inverted spawn range', (value) => { value.level.encounters[0].spawnOffset.x.max = -200 }, 'level.encounters.0.spawnOffset.x.max'],
    ['door outside bounds', (value) => { value.level.door.x = 1001 }, 'level.door.x'],
    ['hero spawn outside bounds', (value) => { value.level.heroSpawn.y = 501 }, 'level.heroSpawn.y'],
  ]

  it.each(invalidCases)('rejects %s', (_name, mutate, expectedPath) => {
    const value = makeBattleDefinition()
    mutate(value)
    try {
      validateBattleDefinition(value)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(paths(error)).toContain(expectedPath)
    }
  })

  it('rejects non-plain data before schema parsing', () => {
    const value = makeBattleDefinition() as any
    value.level.walls[0].x = () => 0
    expect(() => validateBattleDefinition(value)).toThrow(TypeError)
  })
})
