// Phaser-independent ground-drop physics + auto-pickup proximity.
//
// Original (drops-index.md): a drop spawns at `x = monster.x, y = monster.y-100`
// then falls to the ground; the hero auto-collects when close enough. The exact
// pickup distance is not decompiled (FallEquipObj.colwho has no explicit hit test),
// so PICKUP_RADIUS is a chosen value — TODO-verify against the original.

import type { Item } from './items'

export interface DropEntity {
  item: Item
  qty: number
  x: number
  y: number
  vy: number
  grounded: boolean
}

export interface PickedStack {
  item: Item
  qty: number
}

export interface PickupConfig {
  gravity: number
  groundY: number
  pickupRadius: number
  tickMs: number
}

// TODO-verify: not decompiled; chosen so walking up to a drop collects it.
export const DEFAULT_PICKUP_RADIUS = 70

export function spawnDrop(
  item: Item,
  qty: number,
  monsterX: number,
  monsterY: number,
): DropEntity {
  return { item, qty, x: monsterX, y: monsterY - 100, vy: 0, grounded: false }
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
      d.vy += cfg.gravity
      d.y += d.vy
      if (d.y >= cfg.groundY) {
        d.y = cfg.groundY
        d.vy = 0
        d.grounded = true
      }
    }
    const dx = heroX - d.x
    const dy = heroY - d.y
    if (Math.hypot(dx, dy) <= cfg.pickupRadius) {
      picked.push({ item: d.item, qty: d.qty })
    } else {
      remaining.push(d)
    }
  }
  return { remaining, picked }
}
