import drops from '../data/drops.json'
import type { Item } from './items'

interface DropEntry {
  itemId: string
  name: string
  kind: Item['kind']
  rarity: Item['rarity']
  weight: number
  qtyMin: number
  qtyMax: number
  chance: number
}

const dropTable = drops as Record<string, DropEntry[]>

function toItem(entry: DropEntry): Item {
  return {
    id: entry.itemId,
    name: entry.name,
    kind: entry.kind,
    rarity: entry.rarity,
  }
}

function rollQty(entry: DropEntry, rng: () => number): number {
  if (entry.qtyMin >= entry.qtyMax) return entry.qtyMin

  const span = entry.qtyMax - entry.qtyMin + 1
  const offset = Math.min(span - 1, Math.floor(rng() * span))
  return entry.qtyMin + offset
}

export function rollDrops(monsterId: string, rng: () => number): { item: Item; qty: number }[] {
  const entries = dropTable[monsterId]
  if (!entries) return []

  const result: { item: Item; qty: number }[] = []
  for (const entry of entries) {
    if (rng() >= entry.chance) continue
    result.push({ item: toItem(entry), qty: rollQty(entry, rng) })
  }
  return result
}
