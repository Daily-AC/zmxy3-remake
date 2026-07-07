import { describe, it, expect } from 'vitest'
import {
  CAMPAIGN_LENGTH,
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
    writeCampaignIndex(storage, 1, 2)
    expect(readCampaignIndex(storage, 1)).toBe(2)
  })

  it('keeps each slot independent under the same key prefix', () => {
    const storage = memoryStorage()
    writeCampaignIndex(storage, 0, 1)
    writeCampaignIndex(storage, 1, 3)
    expect(readCampaignIndex(storage, 0)).toBe(1)
    expect(readCampaignIndex(storage, 1)).toBe(3)
    expect(campaignLevelKey(0)).not.toBe(campaignLevelKey(1))
  })

  it('clamps an out-of-range write into [0, CAMPAIGN_LENGTH-1]', () => {
    const storage = memoryStorage()
    writeCampaignIndex(storage, 0, 99)
    expect(readCampaignIndex(storage, 0)).toBe(CAMPAIGN_LENGTH - 1)
    writeCampaignIndex(storage, 0, -5)
    expect(readCampaignIndex(storage, 0)).toBe(0)
  })

  it('tolerates a corrupted/hand-edited stored value', () => {
    const storage = memoryStorage()
    storage.setItem(campaignLevelKey(0), 'not-a-number')
    expect(readCampaignIndex(storage, 0)).toBe(0)
    storage.setItem(campaignLevelKey(0), '2.9')
    expect(readCampaignIndex(storage, 0)).toBe(2) // floors, doesn't round
  })

  it('unlocks every level up to and including the current one', () => {
    expect(isCampaignLevelUnlocked(0, 2)).toBe(true)
    expect(isCampaignLevelUnlocked(2, 2)).toBe(true)
    expect(isCampaignLevelUnlocked(3, 2)).toBe(false)
  })

  it('marks exactly the saved index as current', () => {
    expect(isCampaignLevelCurrent(2, 2)).toBe(true)
    expect(isCampaignLevelCurrent(1, 2)).toBe(false)
    expect(isCampaignLevelCurrent(3, 2)).toBe(false)
  })

  it('derives the three-way visual state', () => {
    expect(campaignNodeVisualState(0, 2)).toBe('unlocked')
    expect(campaignNodeVisualState(2, 2)).toBe('current')
    expect(campaignNodeVisualState(3, 2)).toBe('locked')
  })

  describe('advanceCampaignFrontier', () => {
    it('advances one past the cleared level', () => {
      expect(advanceCampaignFrontier(0, 0)).toBe(1)
      expect(advanceCampaignFrontier(1, 1)).toBe(2)
    })

    it('never regresses when replaying an earlier level', () => {
      expect(advanceCampaignFrontier(0, 3)).toBe(3)
    })

    it('clamps at the last valid index (final level cleared)', () => {
      expect(advanceCampaignFrontier(CAMPAIGN_LENGTH - 1, CAMPAIGN_LENGTH - 1)).toBe(CAMPAIGN_LENGTH - 1)
    })

    it('tolerates an out-of-range saved frontier', () => {
      expect(advanceCampaignFrontier(0, 99)).toBe(CAMPAIGN_LENGTH - 1)
      expect(advanceCampaignFrontier(0, -5)).toBe(1)
    })
  })
})
