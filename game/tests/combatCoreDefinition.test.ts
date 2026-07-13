import { describe, expect, it } from 'vitest'
import { CombatSession } from '@zaixu/game-core'
import { buildCombatCoreSliceDefinition } from '../src/adapters/combatCoreDefinition'

describe('combat core slice definition', () => {
  it('compiles current Wukong and Monster7 truth into serializable data', () => {
    const definition = buildCombatCoreSliceDefinition()
    expect(definition).toMatchObject({
      version: 1,
      contentVersion: 'combat-core-slice@1',
      tickRate: 30,
      seed: 0x5a17,
      hero: {
        id: 'hero-1',
        contentId: 'character.zaixu.wukong',
        spawn: { x: 480, y: 400 },
        collisionOffset: { x: 7.5, y: -22.5 },
        atk: 36,
        def: 2,
        magicDefenseFraction: 0,
        comboGraceMs: 1500,
        hurtbox: { width: 90, height: 150 },
      },
      monsters: [{
        id: 'monster-1',
        contentId: 'monster.chapter1.monster7',
        spawn: { x: 900, y: 400 },
        collisionOffset: { x: 4.5, y: 3 },
        attackPower: 14,
        attackKind: 'physics',
        hurtbox: { width: 90, height: 105 },
      }],
    })
    expect(definition.hero.comboStageDurationsMs).toEqual([300, 300, 300, 1600 / 3, 1600 / 3])
    expect(definition.monsters[0].attack).not.toHaveProperty('effect')
    expect(definition.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'simulation.tick-rate', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'monster7.hit1-power', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'legacy.rng-consumption', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'combat.hitbox', origin: 'adapted' }),
      expect.objectContaining({ ruleId: 'showcase.profile', origin: 'invented' }),
    ]))
    expect(definition.provenance).toHaveLength(9)
    expect(new CombatSession(definition).getSnapshot().actors.map((actor) => actor.contentId)).toEqual([
      'character.zaixu.wukong', 'monster.chapter1.monster7',
    ])
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition)

    const second = buildCombatCoreSliceDefinition({ monsterX: 600, monsterHp: 500, monsterAttackRate: 1 })
    expect(second.monsters[0]).toMatchObject({ spawn: { x: 600 }, stats: { hp: 500, normalAttackRate: 1 } })
    second.hero.atk = 99
    expect(buildCombatCoreSliceDefinition().hero.atk).toBe(36)
  })
})
