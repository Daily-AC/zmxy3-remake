import { describe, expect, it } from 'vitest'
import { persistBattleRuntimeClear } from '../src/adapters/battleRuntimeSettlement'
import { campaignLevelKey } from '../src/systems/campaignProgress'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('persistBattleRuntimeClear', () => {
  it('unlocks the next active campaign level', () => {
    const storage = memoryStorage()

    expect(persistBattleRuntimeClear(storage, 2, 0)).toBe(1)
    expect(storage.getItem(campaignLevelKey(2))).toBe('1')
  })

  it('does not regress the frontier when replaying an earlier level', () => {
    const storage = memoryStorage()
    storage.setItem(campaignLevelKey(1), '1')

    expect(persistBattleRuntimeClear(storage, 1, 0)).toBe(1)
    expect(storage.getItem(campaignLevelKey(1))).toBe('1')
  })

  it('does not write when the runtime has no active save slot', () => {
    const storage = memoryStorage()

    expect(persistBattleRuntimeClear(storage, null, 0)).toBeNull()
    expect(storage.length).toBe(0)
  })
})
