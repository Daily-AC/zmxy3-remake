import type { Item } from './items'

const MAX_STACK_SIZE = 99

export interface InventoryStack {
  item: Item
  qty: number
}

export interface Inventory {
  capacity: number
  stacks: InventoryStack[]
}

function normalizeQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0
  return Math.max(0, Math.floor(qty))
}

export function createInventory(capacity: number): Inventory {
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0
  return { capacity: safeCapacity, stacks: [] }
}

export function addItem(
  inv: Inventory,
  item: Item,
  qty: number,
): { ok: boolean; overflow: number } {
  let remaining = normalizeQty(qty)

  // Equipment carries an independently rolled stat payload. Two copies with
  // the same fillName are still distinct objects and must never be merged.
  if (item.kind !== 'equip') {
    for (const stack of inv.stacks) {
      if (remaining === 0) break
      if (stack.item.id !== item.id || stack.qty >= MAX_STACK_SIZE) continue

      const moved = Math.min(MAX_STACK_SIZE - stack.qty, remaining)
      stack.qty += moved
      remaining -= moved
    }
  }

  while (remaining > 0 && inv.stacks.length < inv.capacity) {
    const moved = item.kind === 'equip' ? 1 : Math.min(MAX_STACK_SIZE, remaining)
    inv.stacks.push({ item, qty: moved })
    remaining -= moved
  }

  return { ok: remaining === 0, overflow: remaining }
}

/** Remove the exact equipment object selected by the backpack UI. */
export function removeItemInstance(inv: Inventory, item: Item): boolean {
  const index = inv.stacks.findIndex((stack) => stack.item === item && stack.qty > 0)
  if (index < 0) return false
  const stack = inv.stacks[index]
  stack.qty -= 1
  if (stack.qty === 0) inv.stacks.splice(index, 1)
  return true
}

export function removeItem(inv: Inventory, itemId: string, qty: number): boolean {
  const amount = normalizeQty(qty)
  if (amount === 0) return true
  if (countItem(inv, itemId) < amount) return false

  let remaining = amount
  for (const stack of inv.stacks) {
    if (remaining === 0) break
    if (stack.item.id !== itemId) continue

    const removed = Math.min(stack.qty, remaining)
    stack.qty -= removed
    remaining -= removed
  }

  for (let i = inv.stacks.length - 1; i >= 0; i--) {
    if (inv.stacks[i].qty === 0) inv.stacks.splice(i, 1)
  }

  return true
}

export function countItem(inv: Inventory, itemId: string): number {
  return inv.stacks.reduce((sum, stack) => {
    if (stack.item.id !== itemId) return sum
    return sum + stack.qty
  }, 0)
}

export function listStacks(inv: Inventory): { item: Item; qty: number }[] {
  return inv.stacks.map((stack) => ({ item: stack.item, qty: stack.qty }))
}
