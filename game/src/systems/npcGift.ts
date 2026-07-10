import { equipmentItemByFillName } from './furnaceRecipe'
import type { Item } from './items'

export const LAOJUN_ORDINARY_STAFF_GIFT_CHANCE = 0.2

export type LaojunGiftResult =
  | { status: 'disallowed'; attempted: false }
  | { status: 'already_attempted'; attempted: true }
  | { status: 'missed'; attempted: true }
  | { status: 'awarded'; attempted: true; item: Item }

export function resolveLaojunGift(
  requestedItemId: string,
  alreadyAttempted: boolean,
  rng: () => number = Math.random,
): LaojunGiftResult {
  if (requestedItemId !== 'ptdxzg') return { status: 'disallowed', attempted: false }
  if (alreadyAttempted) return { status: 'already_attempted', attempted: true }
  if (rng() >= LAOJUN_ORDINARY_STAFF_GIFT_CHANCE) return { status: 'missed', attempted: true }
  const item = equipmentItemByFillName('ptdxzg')
  return item ? { status: 'awarded', attempted: true, item } : { status: 'missed', attempted: true }
}
