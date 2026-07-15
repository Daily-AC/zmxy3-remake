import type { BattleDefinition, BattleHeroLoadout } from '@zaixu/game-core'
import { compileWukongBattleHero } from './chapterOneBattleCompiler'
import { compileBattleRuntimeProfile } from './battleRuntimeProfile'
import {
  equip,
  equipEligibility,
  unequip,
  type EquipEligibility,
  type EquipSlot,
} from '../systems/equipment'
import type { Item } from '../systems/items'
import type { LoadedGameState } from '../systems/save'

export type BattleRuntimeEquipmentFailure = EquipEligibility | 'inventory_full' | 'empty_slot'

export interface BattleRuntimeEquipmentPlan {
  transactionId: string
  kind: 'equip' | 'unequip'
  itemName: string
  nextState: LoadedGameState
  loadout: BattleHeroLoadout
}

export type BattleRuntimeEquipmentPlanResult =
  | { ok: true; plan: BattleRuntimeEquipmentPlan }
  | { ok: false; reason: BattleRuntimeEquipmentFailure }

function compileLoadout(state: LoadedGameState, definition: BattleDefinition): BattleHeroLoadout {
  const profile = compileBattleRuntimeProfile(state)
  const hero = compileWukongBattleHero(
    definition.level.heroSpawn,
    definition.level.bounds,
    profile.combat,
  )
  return {
    maxHp: hero.maxHp,
    atk: hero.atk,
    def: hero.def,
    magicDefenseFraction: hero.magicDefenseFraction,
    critChance: hero.critChance,
    maxMp: hero.maxMp,
    equipment: hero.equipment,
    skills: hero.skills,
  }
}

export function planBattleRuntimeEquip(
  state: LoadedGameState,
  definition: BattleDefinition,
  transactionId: string,
  item: Item,
): BattleRuntimeEquipmentPlanResult {
  const eligibility = equipEligibility(item, state.progression.heroId)
  if (eligibility !== 'ok') return { ok: false, reason: eligibility }
  const stackIndex = state.inventory.stacks.findIndex((stack) => stack.item === item)
  if (stackIndex < 0) return { ok: false, reason: 'not_equipment' }
  const nextState = structuredClone(state)
  const plannedItem = nextState.inventory.stacks[stackIndex]?.item
  if (!plannedItem || !equip(nextState.equipment, nextState.inventory, plannedItem, nextState.progression.heroId)) {
    return { ok: false, reason: 'inventory_full' }
  }
  return {
    ok: true,
    plan: {
      transactionId,
      kind: 'equip',
      itemName: item.name,
      loadout: compileLoadout(nextState, definition),
      nextState,
    },
  }
}

export function planBattleRuntimeUnequip(
  state: LoadedGameState,
  definition: BattleDefinition,
  transactionId: string,
  slot: EquipSlot,
): BattleRuntimeEquipmentPlanResult {
  const current = state.equipment[slot]
  if (!current) return { ok: false, reason: 'empty_slot' }
  const nextState = structuredClone(state)
  if (!unequip(nextState.equipment, nextState.inventory, slot)) {
    return { ok: false, reason: 'inventory_full' }
  }
  return {
    ok: true,
    plan: {
      transactionId,
      kind: 'unequip',
      itemName: current.name,
      loadout: compileLoadout(nextState, definition),
      nextState,
    },
  }
}

export function commitBattleRuntimeEquipment(
  state: LoadedGameState,
  plan: BattleRuntimeEquipmentPlan,
): void {
  state.equipment = structuredClone(plan.nextState.equipment)
  state.inventory = structuredClone(plan.nextState.inventory)
}
