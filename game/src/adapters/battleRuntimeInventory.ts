import type { BattleEvent, BattleSnapshot } from '@zaixu/game-core'
import { addItem, type Inventory } from '../systems/inventory'
import type { LoadedGameState } from '../systems/save'
import { resolveBattleLootPayload, type BattleLootPayload } from './battleRuntimeLoot'

type PickupRequest = Extract<BattleEvent, { type: 'loot-pickup-requested' }>

export interface BattleRuntimePickupPlan {
  lootEntityId: string
  requestId: string
  lootId: string
  acceptedQuantity: number
  resourceRestore?: { hp: number; mp: number }
  payload?: BattleLootPayload
}

function cloneInventory(inventory: Inventory): Inventory {
  return {
    capacity: inventory.capacity,
    stacks: inventory.stacks.map((stack) => ({ item: stack.item, qty: stack.qty })),
  }
}

export function planBattleRuntimePickup(
  state: LoadedGameState,
  request: PickupRequest,
  snapshot: BattleSnapshot,
): BattleRuntimePickupPlan {
  const payload = resolveBattleLootPayload(request.lootId)
  const base = {
    lootEntityId: request.lootEntityId,
    requestId: request.requestId,
    lootId: request.lootId,
  }
  if (!payload) return { ...base, acceptedQuantity: 0 }
  if (payload.kind === 'item') {
    const probe = addItem(cloneInventory(state.inventory), payload.item, request.quantity)
    return {
      ...base,
      payload,
      acceptedQuantity: request.quantity - probe.overflow,
    }
  }
  if (payload.kind === 'soul') {
    return { ...base, payload, acceptedQuantity: request.quantity }
  }

  const hero = snapshot.actors.find((actor) => actor.kind === 'hero')
  if (!hero) return { ...base, acceptedQuantity: 0 }
  const multiplier = request.quantity
  const resourceRestore = payload.consumableId === 'smallHp'
    ? { hp: hero.maxHp * 0.25 * multiplier, mp: 0 }
    : payload.consumableId === 'bigHp'
      ? { hp: hero.maxHp * 0.5 * multiplier, mp: 0 }
      : { hp: 0, mp: snapshot.heroSkill.maxMp * 0.25 * multiplier }
  return { ...base, payload, acceptedQuantity: request.quantity, resourceRestore }
}

export function commitBattleRuntimePickup(
  state: LoadedGameState,
  plan: BattleRuntimePickupPlan,
): boolean {
  if (!plan.payload || plan.acceptedQuantity <= 0) return plan.acceptedQuantity === 0
  if (plan.payload.kind === 'item') {
    return addItem(state.inventory, plan.payload.item, plan.acceptedQuantity).ok
  }
  if (plan.payload.kind === 'soul') {
    state.soul += plan.acceptedQuantity
  }
  return true
}
