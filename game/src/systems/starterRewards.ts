import type { Item } from './items'
import { equipmentItemByFillName } from './furnaceRecipe'

export interface StarterReward {
  item: Item
  qty: number
}

const STARTER_REWARD_SPECS = [
  { fillName: 'ptdxzg', qty: 1 },
  { fillName: 'ptdxzf', qty: 1 },
  { fillName: 'wptm', qty: 3 },
] as const

const L1_STARTER_REWARDS: StarterReward[] = STARTER_REWARD_SPECS.map(({ fillName, qty }) => {
  const item = equipmentItemByFillName(fillName)
  if (!item) throw new Error(`missing original starter reward item: ${fillName}`)
  return { item, qty }
})

export function l1StarterRewards(
  monsterId: string,
  context: { stage?: number; level?: number },
): StarterReward[] {
  if (monsterId.trim().toLowerCase() !== 'monster3') return []
  if (context.stage !== 1 || context.level !== 1) return []
  return L1_STARTER_REWARDS.map((reward) => ({ ...reward }))
}
