import { advanceCampaignFrontier, readCampaignIndex, writeCampaignIndex } from '../systems/campaignProgress'
import type { SaveStorage } from '../systems/save'
import type { SlotId } from '../systems/saveSlots'

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
