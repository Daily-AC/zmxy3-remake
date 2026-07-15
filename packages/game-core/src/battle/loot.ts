import type { ActorId } from '../session/types'

export const BATTLE_AUTHORITY_ID = 'battle-authority'

export interface BattleLootRollDefinition {
  chance: number
  choices: readonly BattleLootChoiceDefinition[]
}

export interface BattleLootChoiceDefinition {
  lootId: string
  weight: number
  motion?: 'falling' | 'homing'
  quantity: { min: number; max: number }
}

export interface BattleLootPhysicsDefinition {
  gravityPerTick: number
  spawnOffsetY: number
  pickupRadius: number
  retryDelayTicks: number
}

export type BattleLootState = 'falling' | 'grounded' | 'pending'

export interface BattleLootEntity {
  id: string
  lootId: string
  sourceActorId: ActorId
  quantity: number
  motion: 'falling' | 'homing'
  x: number
  y: number
  vy: number
  state: BattleLootState
  requestOrdinal: number
  pendingRequestId: string | null
  nextRequestTick: number
}

export interface BattleLootPickupRequest {
  lootEntityId: string
  requestId: string
  lootId: string
  quantity: number
}

export function createBattleLootEntity(input: {
  id: string
  lootId: string
  sourceActorId: ActorId
  quantity: number
  x: number
  y: number
  motion?: 'falling' | 'homing'
}): BattleLootEntity {
  return {
    ...input,
    motion: input.motion ?? 'falling',
    vy: 0,
    state: 'falling',
    requestOrdinal: 0,
    pendingRequestId: null,
    nextRequestTick: 0,
  }
}

export function stepBattleLoot(
  entities: BattleLootEntity[],
  hero: { x: number; y: number; alive: boolean },
  tick: number,
  physics: BattleLootPhysicsDefinition,
  resolveLanding: (query: { x: number; fromY: number; toY: number; vy: number }) => number | null,
): BattleLootPickupRequest[] {
  const requests: BattleLootPickupRequest[] = []
  for (const entity of entities) {
    if (entity.state === 'pending') continue
    if (entity.motion === 'homing' && hero.alive) {
      const dx = hero.x - entity.x
      const dy = hero.y - entity.y
      const distance = Math.hypot(dx, dy)
      entity.vy = Math.min(16, entity.vy + 0.9)
      if (distance <= Math.max(26, entity.vy)) {
        entity.x = hero.x
        entity.y = hero.y
        entity.state = 'grounded'
      } else if (distance > 0) {
        entity.x += (dx / distance) * entity.vy
        entity.y += (dy / distance) * entity.vy
      }
    }
    if (entity.motion === 'falling' && entity.state === 'falling') {
      const fromY = entity.y
      entity.vy += physics.gravityPerTick
      entity.y += entity.vy
      const landingY = resolveLanding({ x: entity.x, fromY, toY: entity.y, vy: entity.vy })
      if (landingY !== null) {
        entity.y = landingY
        entity.vy = 0
        entity.state = 'grounded'
      }
    }
    if (!hero.alive || tick < entity.nextRequestTick) continue
    const requestRadius = entity.motion === 'homing' ? Math.max(26, entity.vy) : physics.pickupRadius
    if (Math.hypot(hero.x - entity.x, hero.y - entity.y) > requestRadius) continue
    entity.requestOrdinal += 1
    entity.pendingRequestId = `${entity.id}:pickup:${String(entity.requestOrdinal).padStart(4, '0')}`
    entity.state = 'pending'
    requests.push({
      lootEntityId: entity.id,
      requestId: entity.pendingRequestId,
      lootId: entity.lootId,
      quantity: entity.quantity,
    })
  }
  return requests
}

export function resolveBattleLootPickup(
  entities: BattleLootEntity[],
  input: { lootEntityId: string; requestId: string; acceptedQuantity: number },
  tick: number,
  retryDelayTicks: number,
): { acceptedQuantity: number; remainingQuantity: number } | null {
  const index = entities.findIndex((entity) => entity.id === input.lootEntityId)
  if (index < 0) return null
  const entity = entities[index]
  if (entity.state !== 'pending' || entity.pendingRequestId !== input.requestId) return null
  if (!Number.isSafeInteger(input.acceptedQuantity) || input.acceptedQuantity < 0 || input.acceptedQuantity > entity.quantity) {
    return null
  }
  entity.quantity -= input.acceptedQuantity
  const remainingQuantity = entity.quantity
  if (remainingQuantity === 0) {
    entities.splice(index, 1)
  } else {
    entity.state = 'grounded'
    entity.pendingRequestId = null
    entity.nextRequestTick = tick + retryDelayTicks
  }
  return { acceptedQuantity: input.acceptedQuantity, remainingQuantity }
}
