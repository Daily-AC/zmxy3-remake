// Per-slot "which campaign level is the player on" tracking, factored out of
// BattleScene so WorldMapScene (the new S1 hub) can read/write the same state
// without reaching into a Phaser scene. Pure logic, no Phaser/DOM -- storage is
// the same injectable `SaveStorage` used by save.ts/saveSlots.ts.
//
// Mirrors export.SelectPLace.added() (tasks/worldmap-report.md AS3 excerpt):
// the original only attaches CLICK listeners to node MovieClips from stage 1
// up through (curBigStage, curBigLevel) -- i.e. every level up to and
// including "current" is reachable/replayable; anything past it has no
// listener at all (silently unclickable, no visual distinction in the SWF
// itself). We keep the same "index <= current -> reachable" rule but add a
// visible locked/grey state for anything beyond it (screen-fidelity-spec.md
// S1: "当前进度可点、未解锁置灰") since the bare SWF gives no such cue.

import type { SaveStorage } from './save'
import type { SlotId } from './saveSlots'

/** BattleScene's CAMPAIGN chain length (LEVEL_1_WUYING..LEVEL_4_XIENIAN). Kept
 * as a constant here (not re-imported from BattleScene, which is Phaser-bound)
 * so this module stays Phaser-free; BattleScene's own CAMPAIGN.length is the
 * source of truth and must stay in sync with this value. */
export const CAMPAIGN_LENGTH = 4

/** Same key BattleScene has always used for its per-slot level side-channel
 * (save.ts's GameSaveV1 has no level field -- see save.ts header). Moved here
 * verbatim so WorldMapScene and BattleScene read/write the identical key. */
export function campaignLevelKey(slot: SlotId): string {
  return `zmxy3-remake.slot.v1.${slot}.level`
}

function clampIndex(n: number): number {
  return Math.min(Math.max(0, n), CAMPAIGN_LENGTH - 1)
}

/** The saved campaign index for a slot, defaulting to 0 (level 1) and clamped
 * into range for a corrupted/hand-edited value. Never throws. */
export function readCampaignIndex(storage: SaveStorage, slot: SlotId): number {
  const raw = storage.getItem(campaignLevelKey(slot))
  const n = raw === null ? 0 : Math.floor(Number(raw))
  return Number.isFinite(n) ? clampIndex(n) : 0
}

export function writeCampaignIndex(storage: SaveStorage, slot: SlotId, index: number): void {
  storage.setItem(campaignLevelKey(slot), String(clampIndex(Math.floor(index))))
}

/** A level is reachable (clickable on the map, replayable once cleared) once
 * saved progress has reached or passed it. */
export function isCampaignLevelUnlocked(levelIndex: number, currentIndex: number): boolean {
  return levelIndex <= currentIndex
}

/** The single node that gets the "current" visual (export.SelectPLace's
 * `gotoAndStop(2)` on `s{curBigStage}_{curBigLevel}`). */
export function isCampaignLevelCurrent(levelIndex: number, currentIndex: number): boolean {
  return levelIndex === currentIndex
}

export type CampaignNodeVisualState = 'current' | 'unlocked' | 'locked'

export function campaignNodeVisualState(levelIndex: number, currentIndex: number): CampaignNodeVisualState {
  if (isCampaignLevelCurrent(levelIndex, currentIndex)) return 'current'
  if (isCampaignLevelUnlocked(levelIndex, currentIndex)) return 'unlocked'
  return 'locked'
}

/**
 * The new saved frontier after clearing `clearedIndex` (BattleScene calls this
 * when the player walks through the post-boss portal): one past the cleared
 * level, clamped into range, but never regressing below whatever was already
 * unlocked -- replaying an earlier level (clearedIndex < savedFrontier) must
 * not roll progress backward.
 */
export function advanceCampaignFrontier(clearedIndex: number, savedFrontier: number): number {
  return Math.max(clampIndex(savedFrontier), clampIndex(clearedIndex + 1))
}
