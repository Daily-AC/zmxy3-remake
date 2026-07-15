import { describe, expect, it } from 'vitest'
import type { BattleEvent, BattleSnapshot } from '@zaixu/game-core'
import { createGameSave, restoreGameState } from '../src/systems/save'
import { createProgression } from '../src/systems/progression'
import { createEquipment } from '../src/systems/equipment'
import { createInventory, countItem } from '../src/systems/inventory'
import {
  commitBattleRuntimePickup,
  planBattleRuntimePickup,
} from '../src/adapters/battleRuntimeInventory'

function state(capacity = 2) {
  return restoreGameState(createGameSave({
    progression: createProgression(1),
    equipment: createEquipment(),
    inventory: createInventory(capacity),
  }))
}

function snapshot(): BattleSnapshot {
  return {
    version: 1,
    contentVersion: 'test',
    tick: 1,
    randomState: 1,
    level: { id: 'sl11', doorVisible: false, cleared: false },
    heroSkill: { mp: 10, maxMp: 50, cooldownUntilTick: 0, activeSkillId: null },
    heroLoadout: {
      maxHp: 100, atk: 10, def: 1, magicDefenseFraction: 0, critChance: 0, maxMp: 50,
      equipment: { weaponItemId: null, armorItemId: null, weaponShowId: 0 },
      skills: {},
    },
    heroEquipment: { weaponItemId: null, armorItemId: null, weaponShowId: 0 },
    actors: [{
      id: 'hero-1', kind: 'hero', contentId: 'hero.role1.wukong', x: 0, y: 0,
      facing: 1, action: 'wait', hp: 50, maxHp: 100, lifeState: 'ready',
      comboStage: null, statuses: [], knockbackVelocityX: 0, attackId: 0, attacking: false,
    }],
    projectiles: [],
    loot: [],
  }
}

function request(lootId: string, quantity: number): Extract<BattleEvent, { type: 'loot-pickup-requested' }> {
  return {
    type: 'loot-pickup-requested', tick: 1, lootEntityId: 'loot-1', requestId: 'request-1', lootId, quantity,
  }
}

describe('battle runtime inventory transaction adapter', () => {
  it('plans against a clone and mutates the real inventory only after commit', () => {
    const loaded = state()
    const plan = planBattleRuntimePickup(loaded, request('item.original.wptm', 3), snapshot())
    expect(countItem(loaded.inventory, 'wptm')).toBe(0)
    expect(plan.acceptedQuantity).toBe(3)
    expect(commitBattleRuntimePickup(loaded, plan)).toBe(true)
    expect(countItem(loaded.inventory, 'wptm')).toBe(3)
  })

  it('returns a zero-quantity confirmation when the bag cannot accept equipment', () => {
    const loaded = state(0)
    const plan = planBattleRuntimePickup(loaded, request('item.original.ptdxzg', 1), snapshot())
    expect(plan.acceptedQuantity).toBe(0)
    expect(commitBattleRuntimePickup(loaded, plan)).toBe(true)
  })

  it('commits soul and converts medicine content into authoritative resource deltas', () => {
    const loaded = state()
    const soul = planBattleRuntimePickup(loaded, request('currency.soul', 8), snapshot())
    expect(commitBattleRuntimePickup(loaded, soul)).toBe(true)
    expect(loaded.soul).toBe(8)

    const hp = planBattleRuntimePickup(loaded, request('consumable.original.smallHp', 1), snapshot())
    const mp = planBattleRuntimePickup(loaded, request('consumable.original.smallMp', 1), snapshot())
    expect(hp).toMatchObject({ acceptedQuantity: 1, resourceRestore: { hp: 25, mp: 0 } })
    expect(mp).toMatchObject({ acceptedQuantity: 1, resourceRestore: { hp: 0, mp: 12.5 } })
  })
})
