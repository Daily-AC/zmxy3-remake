import { describe, expect, it } from 'vitest'
import {
  SOUL_LOOT_ID,
  battleLootIdForConsumable,
  battleLootIdForItem,
  compileChapterOneLoot,
  resolveBattleLootPayload,
} from '../src/adapters/battleRuntimeLoot'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'

describe('chapter-one battle runtime loot compiler', () => {
  it('compiles the sl11 boss soul, exclusive source pool, starter kit, and medicine table', () => {
    const loot = compileChapterOneLoot('monster3', { stage: 1, level: 1 })

    expect(loot).toHaveLength(6)
    expect(loot[0]).toEqual({
      chance: 1,
      choices: [{ lootId: SOUL_LOOT_ID, weight: 1, motion: 'homing', quantity: { min: 8, max: 8 } }],
    })
    expect(loot[1]).toMatchObject({
      chance: 1,
      choices: [
        { lootId: 'item.original.ptdxzg' },
        { lootId: 'item.original.ptdxzf' },
      ],
    })
    expect(loot.slice(2, 5).map((table) => table.choices[0].lootId)).toEqual([
      'item.original.ptdxzg',
      'item.original.ptdxzf',
      'item.original.wptm',
    ])
    expect(loot[5]).toEqual({
      chance: 0.15,
      choices: [
        { lootId: 'consumable.original.smallHp', weight: 5, quantity: { min: 1, max: 1 } },
        { lootId: 'consumable.original.bigHp', weight: 1, quantity: { min: 1, max: 1 } },
        { lootId: 'consumable.original.smallMp', weight: 6, quantity: { min: 1, max: 1 } },
      ],
    })
  })

  it('filters unsupported-role equipment while preserving soul and medicine drops', () => {
    const monster4 = compileChapterOneLoot('monster4', { stage: 1, level: 2 })
    expect(monster4.map((table) => table.choices[0].lootId)).toEqual([
      SOUL_LOOT_ID,
      battleLootIdForConsumable('smallHp'),
    ])
  })

  it('maps stable loot ids back to the existing game payload vocabulary', () => {
    const staff = equipmentItemByFillName('ptdxzg')!
    expect(resolveBattleLootPayload(battleLootIdForItem(staff))).toEqual({ kind: 'item', item: staff })
    expect(resolveBattleLootPayload(SOUL_LOOT_ID)).toEqual({ kind: 'soul' })
    expect(resolveBattleLootPayload(battleLootIdForConsumable('smallMp'))).toEqual({
      kind: 'consumable', consumableId: 'smallMp',
    })
    expect(resolveBattleLootPayload('unknown')).toBeUndefined()
  })
})
