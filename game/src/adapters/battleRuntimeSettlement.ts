import { advanceCampaignFrontier, readCampaignIndex, writeCampaignIndex } from '../systems/campaignProgress'
import type { SaveStorage } from '../systems/save'
import type { SlotId } from '../systems/saveSlots'
import type { LoadedGameState } from '../systems/save'
import { createGameSave } from '../systems/save'
import { buildSlotEnvelope, writeSlot } from '../systems/saveSlots'

/** Persist a cleared production-runtime stage without regressing replayed saves. */
export function persistBattleRuntimeClear(
  storage: SaveStorage,
  slot: SlotId | null,
  clearedCampaignIndex: number,
): number | null {
  if (slot === null) return null
  const frontier = advanceCampaignFrontier(clearedCampaignIndex, readCampaignIndex(storage, slot))
  writeCampaignIndex(storage, slot, frontier)
  return frontier
}

export function persistBattleRuntimeState(
  storage: SaveStorage,
  slot: SlotId | null,
  state: LoadedGameState,
  playtimeSec: number,
): boolean {
  if (slot === null) return false
  const save = createGameSave({
    progression: state.progression,
    equipment: state.equipment,
    inventory: state.inventory,
    skillTree: state.skillTree,
    soul: state.soul,
  })
  writeSlot(storage, slot, buildSlotEnvelope(save, playtimeSec))
  return true
}
