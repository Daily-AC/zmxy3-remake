import type { LoadedGameState } from '../systems/save'
import {
  heroMagicDef,
  heroStats,
  createHeroIdentity,
  syncHeroEquipment,
} from '../systems/heroIdentity'
import { weaponShowIdForItem } from '../systems/equipment'
import { getLearnedLevel } from '../systems/skillTree'
import type { Sl11BattleProfile } from './sl11BattleDefinition'

const SUPPORTED_WEAPON_SHOW_IDS = new Set([0, 1, 2])

export interface CompiledBattleRuntimeProfile {
  combat: Partial<Sl11BattleProfile>
  hud: {
    level: number
    exp: number
    expToNext: number
    weaponName: string
    bindings: LoadedGameState['skillTree']['bindings']
  }
}

export function compileBattleRuntimeProfile(state: LoadedGameState): CompiledBattleRuntimeProfile {
  const identity = createHeroIdentity(state.progression.heroId, state.progression.level)
  identity.progression.exp = state.progression.exp
  syncHeroEquipment(identity, state.equipment)
  const stats = heroStats(identity, state.equipment)
  const requestedShowId = state.equipment.weapon ? weaponShowIdForItem(state.equipment.weapon) : 0
  const weaponShowId = requestedShowId !== null && SUPPORTED_WEAPON_SHOW_IDS.has(requestedShowId)
    ? requestedShowId
    : 0

  return {
    combat: {
      maxHp: identity.combat.maxHp,
      atk: stats.atk,
      def: stats.def,
      magicDefenseFraction: heroMagicDef(identity),
      critChance: stats.crit,
      maxMp: identity.maxMp,
      slzLevel: getLearnedLevel(state.skillTree, 'slz'),
      weaponItemId: state.equipment.weapon?.id ?? null,
      armorItemId: state.equipment.armor?.id ?? null,
      weaponShowId,
    },
    hud: {
      level: state.progression.level,
      exp: state.progression.exp,
      expToNext: state.progression.expToNext,
      weaponName: state.equipment.weapon?.name ?? '行者棍',
      bindings: { ...state.skillTree.bindings },
    },
  }
}
