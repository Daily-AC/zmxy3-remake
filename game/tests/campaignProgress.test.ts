import { describe, it, expect } from 'vitest'
import {
  CAMPAIGN_LENGTH,
  ACTIVE_CAMPAIGN_LENGTH,
  campaignLevelKey,
  readCampaignIndex,
  writeCampaignIndex,
  isCampaignLevelUnlocked,
  isCampaignLevelCurrent,
  campaignNodeVisualState,
  advanceCampaignFrontier,
} from '../src/systems/campaignProgress'

/** In-memory stand-in for the injectable SaveStorage surface (matches the
 * pattern used by save.test.ts / saveSlots tests). */
function memoryStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('campaignProgress', () => {
  it('defaults an untouched slot to level index 0', () => {
    const storage = memoryStorage()
    expect(readCampaignIndex(storage, 0)).toBe(0)
  })

  it('round-trips a written index', () => {
    const storage = memoryStorage()
    writeCampaignIndex(storage, 1, 1)
    expect(readCampaignIndex(storage, 1)).toBe(1)
  })

  it('keeps each slot independent under the same key prefix', () => {
    const storage = memoryStorage()
    writeCampaignIndex(storage, 0, 0)
    writeCampaignIndex(storage, 1, 1)
    expect(readCampaignIndex(storage, 0)).toBe(0)
    expect(readCampaignIndex(storage, 1)).toBe(1)
    expect(campaignLevelKey(0)).not.toBe(campaignLevelKey(1))
  })

  // Clamp ceiling is ACTIVE_CAMPAIGN_LENGTH-1 (1, i.e. L2), not
  // CAMPAIGN_LENGTH-1 (3) -- the 2026-07-08 L1+L2 scope cut caps every index
  // this module hands out, independent of BattleScene's own (still 4-long,
  // data untouched) CAMPAIGN array. See ACTIVE_CAMPAIGN_LENGTH doc comment.
  it('clamps an out-of-range write into [0, ACTIVE_CAMPAIGN_LENGTH-1]', () => {
    const storage = memoryStorage()
    writeCampaignIndex(storage, 0, 99)
    expect(readCampaignIndex(storage, 0)).toBe(ACTIVE_CAMPAIGN_LENGTH - 1)
    writeCampaignIndex(storage, 0, -5)
    expect(readCampaignIndex(storage, 0)).toBe(0)
  })

  it('tolerates a corrupted/hand-edited stored value', () => {
    const storage = memoryStorage()
    storage.setItem(campaignLevelKey(0), 'not-a-number')
    expect(readCampaignIndex(storage, 0)).toBe(0)
    storage.setItem(campaignLevelKey(0), '0.9')
    expect(readCampaignIndex(storage, 0)).toBe(0) // floors, doesn't round
  })

  it('unlocks every level up to and including the current one', () => {
    expect(isCampaignLevelUnlocked(0, 1)).toBe(true)
    expect(isCampaignLevelUnlocked(1, 1)).toBe(true)
    expect(isCampaignLevelUnlocked(2, 1)).toBe(false)
  })

  it('marks exactly the saved index as current', () => {
    expect(isCampaignLevelCurrent(1, 1)).toBe(true)
    expect(isCampaignLevelCurrent(0, 1)).toBe(false)
    expect(isCampaignLevelCurrent(2, 1)).toBe(false)
  })

  it('derives the three-way visual state', () => {
    expect(campaignNodeVisualState(0, 1)).toBe('unlocked')
    expect(campaignNodeVisualState(1, 1)).toBe('current')
    expect(campaignNodeVisualState(2, 1)).toBe('locked')
  })

  // L3/L4 scope cut (worldmapNodes.ts s1_3/s2_1, campaignIndex 2/3): a save
  // written back when CAMPAIGN_LENGTH (4) was still the live ceiling (or any
  // hand-edited/out-of-range value) must read back clamped to
  // ACTIVE_CAMPAIGN_LENGTH-1, so the currentIndex WorldMapScene actually uses
  // can never make these two nodes resolve to anything but 'locked'.
  it('a pre-scope-cut or corrupted saved index reads back capped, keeping L3/L4 locked', () => {
    const storage = memoryStorage()
    storage.setItem(campaignLevelKey(0), String(CAMPAIGN_LENGTH - 1)) // old save, index 3
    const currentIndex = readCampaignIndex(storage, 0)
    expect(currentIndex).toBe(ACTIVE_CAMPAIGN_LENGTH - 1)
    expect(campaignNodeVisualState(2, currentIndex)).toBe('locked')
    expect(campaignNodeVisualState(3, currentIndex)).toBe('locked')
  })

  describe('advanceCampaignFrontier', () => {
    it('advances one past the cleared level', () => {
      expect(advanceCampaignFrontier(0, 0)).toBe(1)
    })

    it('never regresses when replaying an earlier level', () => {
      expect(advanceCampaignFrontier(0, 1)).toBe(1)
    })

    it('clamps at the last valid index (L2 cleared -- scope cut ceiling, not CAMPAIGN_LENGTH-1)', () => {
      expect(advanceCampaignFrontier(ACTIVE_CAMPAIGN_LENGTH - 1, ACTIVE_CAMPAIGN_LENGTH - 1)).toBe(
        ACTIVE_CAMPAIGN_LENGTH - 1,
      )
    })

    it('tolerates an out-of-range saved frontier', () => {
      expect(advanceCampaignFrontier(0, 99)).toBe(ACTIVE_CAMPAIGN_LENGTH - 1)
      expect(advanceCampaignFrontier(0, -5)).toBe(1)
    })

    it('never advances past L2 even if BattleScene passes a cleared index from the still-4-long CAMPAIGN array (defense in depth for the scope cut)', () => {
      expect(advanceCampaignFrontier(CAMPAIGN_LENGTH - 1, 0)).toBe(ACTIVE_CAMPAIGN_LENGTH - 1)
    })
  })
})
