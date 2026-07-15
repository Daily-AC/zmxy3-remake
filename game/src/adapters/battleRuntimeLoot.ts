import type {
  BattleLootPhysicsDefinition,
  BattleLootRollDefinition,
} from '@zaixu/game-core'
import { equipmentItemByFillName } from '../systems/furnaceRecipe'
import {
  monsterSoulDropAmount,
  resolvedMonsterDropTable,
  type DropRollContext,
} from '../systems/dropRoll'
import { l1StarterRewards } from '../systems/starterRewards'
import type { ConsumableId } from '../systems/consumables'
import type { Item } from '../systems/items'

const ITEM_PREFIX = 'item.original.'
const CONSUMABLE_PREFIX = 'consumable.original.'
export const SOUL_LOOT_ID = 'currency.soul'

export const CHAPTER_ONE_LOOT_PHYSICS: BattleLootPhysicsDefinition = {
  gravityPerTick: 2,
  spawnOffsetY: -100,
  pickupRadius: 70,
  retryDelayTicks: 30,
}

export type BattleLootPayload =
  | { kind: 'item'; item: Item }
  | { kind: 'soul' }
  | { kind: 'consumable'; consumableId: ConsumableId }

export function battleLootIdForItem(item: Item): string {
  return `${ITEM_PREFIX}${item.id}`
}

export function battleLootIdForConsumable(consumableId: ConsumableId): string {
  return `${CONSUMABLE_PREFIX}${consumableId}`
}

export function resolveBattleLootPayload(lootId: string): BattleLootPayload | undefined {
  if (lootId === SOUL_LOOT_ID) return { kind: 'soul' }
  if (lootId.startsWith(CONSUMABLE_PREFIX)) {
    const consumableId = lootId.slice(CONSUMABLE_PREFIX.length)
    if (consumableId === 'smallHp' || consumableId === 'bigHp' || consumableId === 'smallMp') {
      return { kind: 'consumable', consumableId }
    }
    return undefined
  }
  if (!lootId.startsWith(ITEM_PREFIX)) return undefined
  const item = equipmentItemByFillName(lootId.slice(ITEM_PREFIX.length))
  return item ? { kind: 'item', item } : undefined
}

function roundedIndexWeights(length: number): number[] {
  if (length <= 1) return [1]
  return Array.from({ length }, (_, index) => index === 0 || index === length - 1 ? 1 : 2)
}

function fixedLoot(
  lootId: string,
  quantity: number,
  motion: 'falling' | 'homing' = 'falling',
): BattleLootRollDefinition {
  return {
    chance: 1,
    choices: [{ lootId, weight: 1, motion, quantity: { min: quantity, max: quantity } }],
  }
}

export function compileChapterOneLoot(
  monsterId: string,
  context: DropRollContext,
): BattleLootRollDefinition[] {
  const result: BattleLootRollDefinition[] = []
  const soul = monsterSoulDropAmount(monsterId, context)
  if (soul > 0) result.push(fixedLoot(SOUL_LOOT_ID, soul, 'homing'))

  const sourceTable = resolvedMonsterDropTable(monsterId, context)
  if (sourceTable) {
    const weights = roundedIndexWeights(sourceTable.choices.length)
    result.push({
      chance: sourceTable.chance,
      choices: sourceTable.choices.map((item, index) => ({
        lootId: battleLootIdForItem(item),
        weight: weights[index],
        quantity: { min: 1, max: 1 },
      })),
    })
  }

  for (const reward of l1StarterRewards(monsterId, context)) {
    result.push(fixedLoot(battleLootIdForItem(reward.item), reward.qty))
  }

  // BaseMonster.addMedicine() has a nested source RNG tree. This equivalent
  // weighted table preserves its exact aggregate 6.25%/1.25%/7.5% outcomes
  // while keeping the core protocol content-agnostic.
  result.push({
    chance: 0.15,
    choices: [
      { lootId: battleLootIdForConsumable('smallHp'), weight: 5, quantity: { min: 1, max: 1 } },
      { lootId: battleLootIdForConsumable('bigHp'), weight: 1, quantity: { min: 1, max: 1 } },
      { lootId: battleLootIdForConsumable('smallMp'), weight: 6, quantity: { min: 1, max: 1 } },
    ],
  })
  return result
}
