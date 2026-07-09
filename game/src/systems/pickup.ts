// Phaser-independent ground-drop physics + auto-pickup proximity.
//
// Original (drops-index.md): a drop spawns at `x = monster.x, y = monster.y-100`
// then falls to the ground; the hero auto-collects when close enough. The exact
// pickup distance is not decompiled (FallEquipObj.colwho has no explicit hit test),
// so PICKUP_RADIUS is a chosen value — TODO-verify against the original.

import type { Item } from './items'
import type { ConsumableId } from './consumables'

interface DropPhysics {
  x: number
  y: number
  vy: number
  grounded: boolean
}

export interface ItemDropEntity extends DropPhysics {
  kind?: 'item'
  item: Item
  qty: number
}

export interface SoulDropEntity extends DropPhysics {
  kind: 'soul'
  amount: number
}

export interface ConsumableDropEntity extends DropPhysics {
  kind: 'consumable'
  consumableId: ConsumableId
}

export type DropEntity = ItemDropEntity | SoulDropEntity | ConsumableDropEntity

export type PickedStack = PickedItemStack | PickedSoul | PickedConsumable

export interface PickedItemStack {
  kind?: 'item'
  item: Item
  qty: number
}

export interface PickedSoul {
  kind: 'soul'
  amount: number
}

export interface PickedConsumable {
  kind: 'consumable'
  consumableId: ConsumableId
}

export interface PickupConfig {
  gravity: number
  groundY: number
  pickupRadius: number
  tickMs: number
  /** Optional platform resolver. Absent preserves the original single-groundY behavior. */
  platformResolver?: (query: { x: number; fromY: number; toY: number; vy: number }) => {
    kind: 'land' | 'head'
    y: number
  } | null
}

// TODO-verify: not decompiled; chosen so walking up to a drop collects it.
export const DEFAULT_PICKUP_RADIUS = 70

export function spawnDrop(
  item: Item,
  qty: number,
  monsterX: number,
  monsterY: number,
): ItemDropEntity {
  return { kind: 'item', item, qty, x: monsterX, y: monsterY - 100, vy: 0, grounded: false }
}

export function spawnSoulDrop(amount: number, monsterX: number, monsterY: number): SoulDropEntity {
  return { kind: 'soul', amount: Math.max(0, Math.floor(amount)), x: monsterX, y: monsterY - 100, vy: 0, grounded: false }
}

export function spawnConsumableDrop(consumableId: ConsumableId, monsterX: number, monsterY: number): ConsumableDropEntity {
  return { kind: 'consumable', consumableId, x: monsterX, y: monsterY - 100, vy: 0, grounded: false }
}

/**
 * Advance drops by one tick: fall to the ground, then auto-collect any within
 * `pickupRadius` of the hero. Non-mutating — returns the surviving drops and the
 * items collected this tick.
 */
export function stepDrops(
  drops: DropEntity[],
  heroX: number,
  heroY: number,
  cfg: PickupConfig,
): { remaining: DropEntity[]; picked: PickedStack[] } {
  const remaining: DropEntity[] = []
  const picked: PickedStack[] = []
  for (const d of drops) {
    if (!d.grounded) {
      const fromY = d.y
      d.vy += cfg.gravity
      d.y += d.vy
      const platformHit = cfg.platformResolver?.({ x: d.x, fromY, toY: d.y, vy: d.vy }) ?? null
      if (platformHit?.kind === 'land') {
        d.y = platformHit.y
        d.vy = 0
        d.grounded = true
      } else if (d.y >= cfg.groundY) {
        d.y = cfg.groundY
        d.vy = 0
        d.grounded = true
      }
    }
    const dx = heroX - d.x
    const dy = heroY - d.y
    if (Math.hypot(dx, dy) <= cfg.pickupRadius) {
      if (d.kind === 'soul') {
        picked.push({ kind: 'soul', amount: d.amount })
      } else if (d.kind === 'consumable') {
        picked.push({ kind: 'consumable', consumableId: d.consumableId })
      } else {
        picked.push({ item: d.item, qty: d.qty })
      }
    } else {
      remaining.push(d)
    }
  }
  return { remaining, picked }
}
