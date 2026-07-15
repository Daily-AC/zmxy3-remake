import { craft, type CraftOutcome } from '../systems/furnaceRecipe'
import type { LoadedGameState } from '../systems/save'

type CraftFailure = Exclude<CraftOutcome, { ok: true }>

export interface BattleRuntimeCraftPlan {
  transactionId: string
  recipeId: string
  nextState: LoadedGameState
  item: Extract<CraftOutcome, { ok: true }>['item']
  soulSpent: number
}

export type BattleRuntimeCraftPlanResult =
  | { ok: true; plan: BattleRuntimeCraftPlan }
  | CraftFailure

/** Plan against a cloned save so inventory, soul, and RNG-derived output land together. */
export function planBattleRuntimeCraft(
  state: LoadedGameState,
  transactionId: string,
  recipeId: string,
  rng: () => number = Math.random,
): BattleRuntimeCraftPlanResult {
  const nextState = structuredClone(state)
  const outcome = craft(nextState.inventory, nextState.soul, recipeId, rng)
  if (!outcome.ok) return outcome
  nextState.soul = outcome.newSoul
  return {
    ok: true,
    plan: {
      transactionId,
      recipeId,
      nextState,
      item: outcome.item,
      soulSpent: outcome.soulSpent,
    },
  }
}

export function commitBattleRuntimeCraft(state: LoadedGameState, plan: BattleRuntimeCraftPlan): void {
  state.inventory = structuredClone(plan.nextState.inventory)
  state.soul = plan.nextState.soul
}
