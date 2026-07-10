import { describe, expect, it } from 'vitest'
import { loadBattleSaveSeed } from '../src/systems/battleSaveSeed'
import { createGameSave, type LoadedGameState, type SaveStorage } from '../src/systems/save'
import { buildSlotEnvelope, slotStorageKey, writeSlot } from '../src/systems/saveSlots'
import { createProgression } from '../src/systems/progression'
import { createEquipment } from '../src/systems/equipment'
import { addItem, countItem, createInventory } from '../src/systems/inventory'
import { createDefaultSkillTreeState } from '../src/systems/skillTree'
import { equipmentItemByFillName } from '../src/systems/furnaceRecipe'

function createMemoryStorage(): SaveStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

function staleRegistryState(): LoadedGameState {
  return {
    progression: createProgression(1),
    equipment: createEquipment(),
    inventory: createInventory(24),
    skillTree: createDefaultSkillTreeState(),
    soul: 0,
  }
}

function mustItem(fillName: string) {
  const item = equipmentItemByFillName(fillName)
  if (!item) throw new Error(`missing test item ${fillName}`)
  return item
}

describe('loadBattleSaveSeed', () => {
  it('loads the fresh slot as one state even when registry is stale and origin is new', () => {
    const storage = createMemoryStorage()
    const registryLoaded = staleRegistryState()
    const progression = createProgression(1, 4, 77)
    const equipment = createEquipment()
    equipment.armor = mustItem('ptdxzf')
    const inventory = createInventory(24)
    addItem(inventory, mustItem('whg'), 1)
    const save = createGameSave({
      progression,
      equipment,
      inventory,
      skillTree: createDefaultSkillTreeState(),
      soul: 63,
      now: new Date('2026-07-10T10:00:00.000Z'),
    })
    writeSlot(storage, 2, buildSlotEnvelope(save, 91))

    const seed = loadBattleSaveSeed(storage, 2, registryLoaded, 'new')

    expect(seed?.playtimeSec).toBe(91)
    expect(seed?.loaded.progression).toEqual(progression)
    expect(seed?.loaded.equipment.armor?.id).toBe('ptdxzf')
    expect(countItem(seed!.loaded.inventory, 'whg')).toBe(1)
    expect(seed?.loaded.soul).toBe(63)
  })

  it('falls back to the registry state for a continue boot with no readable slot', () => {
    const storage = createMemoryStorage()
    const registryLoaded = staleRegistryState()

    expect(loadBattleSaveSeed(storage, null, registryLoaded, 'continue')).toEqual({
      loaded: registryLoaded,
      playtimeSec: 0,
    })

    storage.setItem(slotStorageKey(0), '{broken')
    expect(loadBattleSaveSeed(storage, 0, registryLoaded, 'continue')).toEqual({
      loaded: registryLoaded,
      playtimeSec: 0,
    })
  })

  it('returns no seed for a new or debug boot without a readable slot', () => {
    const storage = createMemoryStorage()

    expect(loadBattleSaveSeed(storage, null, staleRegistryState(), 'new')).toBeUndefined()
    expect(loadBattleSaveSeed(storage, null, undefined, 'new')).toBeUndefined()
  })
})
