import { describe, it, expect, beforeEach } from 'vitest'
import {
  createGameSave,
  serializeGameSave,
  parseGameSave,
  saveGame,
  loadGame,
  clearGameSave,
  restoreGameState,
  GameSaveVersion,
  GameSaveStorageKey,
  type SaveStorage,
  type GameSave,
} from '../src/systems/save'
import { createProgression, gainExp } from '../src/systems/progression'
import { createEquipment, type Equipment } from '../src/systems/equipment'
import { createInventory, addItem, listStacks, type Inventory } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

// In-memory stand-in for `Storage` (localStorage), isolated per test via
// beforeEach so no state leaks between cases -- there is no jsdom/browser
// `localStorage` in this project's (node) vitest environment, which is the
// point of injecting SaveStorage rather than hardcoding window.localStorage.
function createMemoryStorage(): SaveStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

const sword: Item = {
  id: 'chiyan',
  name: '赤炎噬血杖',
  kind: 'equip',
  rarity: 3,
  effects: [
    { type: 'stat', stat: 'atk', value: 40 },
    { type: 'onHit', effect: 'lifesteal', chance: 0.5, power: 20 },
  ],
}
const herb: Item = { id: 'herb', name: '妖草', kind: 'material', rarity: 1 }

describe('versioned save/load (kagami SaveSystem port)', () => {
  let storage: SaveStorage

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('round-trips progression + equipment + inventory through save/load', () => {
    const progression = createProgression(3, 1)
    gainExp(progression, 500)

    const equipment: Equipment = createEquipment()
    equipment.weapon = sword

    const inventory: Inventory = createInventory(8)
    addItem(inventory, herb, 5)

    const save = createGameSave({
      progression,
      equipment,
      inventory,
      now: new Date('2026-07-07T00:00:00.000Z'),
    })
    saveGame(storage, save)

    const loaded = loadGame(storage)
    expect(loaded).toBeDefined()
    const restored = restoreGameState(loaded!)

    expect(restored.progression).toEqual(progression)
    expect(restored.equipment.weapon).toEqual(sword)
    expect(restored.equipment.armor).toBeNull()
    expect(listStacks(restored.inventory)).toEqual(listStacks(inventory))
    expect(restored.inventory.capacity).toBe(8)
  })

  it('clearGameSave removes the entry so a later load sees nothing', () => {
    const save = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    saveGame(storage, save)
    expect(loadGame(storage)).toBeDefined()

    clearGameSave(storage)
    expect(loadGame(storage)).toBeUndefined()
    expect(storage.getItem(GameSaveStorageKey)).toBeNull()
  })

  it('parseGameSave rejects malformed JSON without throwing', () => {
    expect(parseGameSave('{not json')).toBeUndefined()
    expect(parseGameSave('null')).toBeUndefined()
    expect(parseGameSave('42')).toBeUndefined()
    expect(parseGameSave('[]')).toBeUndefined()
  })

  it('parseGameSave rejects a save with the wrong or missing version', () => {
    const goodSave = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    const wrongVersion = { ...goodSave, version: 999 }
    expect(parseGameSave(JSON.stringify(wrongVersion))).toBeUndefined()

    const noVersion: Record<string, unknown> = { ...goodSave }
    delete noVersion.version
    expect(parseGameSave(JSON.stringify(noVersion))).toBeUndefined()

    expect(GameSaveVersion).toBe(1)
  })

  it('parseGameSave rejects a save missing top-level required sections', () => {
    const goodSave = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    const noInventory: Record<string, unknown> = { ...goodSave }
    delete noInventory.inventory
    expect(parseGameSave(JSON.stringify(noInventory))).toBeUndefined()

    const noSavedAt: Record<string, unknown> = { ...goodSave }
    delete noSavedAt.savedAt
    expect(parseGameSave(JSON.stringify(noSavedAt))).toBeUndefined()
  })

  it('restoreGameState tolerates a corrupt/hand-edited progression block', () => {
    const save: GameSave = {
      version: GameSaveVersion,
      savedAt: new Date().toISOString(),
      progression: { heroId: 999 as any, level: -5, exp: -100, expToNext: NaN as any },
      equipment: { weapon: null, armor: null, accessory: null, talisman: null },
      inventory: { capacity: 8, stacks: [] },
      pets: [],
      skills: null,
    }
    const restored = restoreGameState(save)
    expect(restored.progression.heroId).toBe(5) // clamped into [1,5]
    expect(restored.progression.level).toBe(1) // clamped into [1,maxLevel]
    expect(restored.progression.exp).toBe(0) // negative exp floored to 0, then clamped under expToNext
    expect(Number.isFinite(restored.progression.expToNext)).toBe(true)
  })

  it('restoreGameState drops a malformed equipment/inventory item instead of throwing', () => {
    const save: GameSave = {
      version: GameSaveVersion,
      savedAt: new Date().toISOString(),
      progression: createGameSave({
        progression: createProgression(1),
        equipment: createEquipment(),
        inventory: createInventory(4),
      }).progression,
      equipment: {
        weapon: { id: 'broken' } as any, // missing name/kind/rarity
        armor: null,
        accessory: null,
        talisman: null,
      },
      inventory: {
        capacity: 8,
        stacks: [
          { item: herb, qty: 3 },
          { item: { id: 'ghost' } as any, qty: 5 }, // malformed, should be dropped
          { item: sword, qty: -10 as any }, // non-positive qty, should be dropped
        ],
      },
      pets: [],
      skills: null,
    }
    const restored = restoreGameState(save)
    expect(restored.equipment.weapon).toBeNull()
    const stacks = listStacks(restored.inventory)
    expect(stacks).toHaveLength(1)
    expect(stacks[0].item.id).toBe('herb')
    expect(stacks[0].qty).toBe(3)
  })

  it('restoreGameState defaults cleanly when equipment/inventory sections are entirely absent', () => {
    const save = {
      version: GameSaveVersion,
      savedAt: new Date().toISOString(),
      progression: createProgression(2),
      equipment: {},
      inventory: {},
    } as unknown as GameSave
    const restored = restoreGameState(save)
    expect(restored.equipment).toEqual(createEquipment())
    expect(restored.inventory.capacity).toBe(0)
    expect(listStacks(restored.inventory)).toEqual([])
  })

  it('two injected storages stay isolated from each other', () => {
    const storageA = createMemoryStorage()
    const storageB = createMemoryStorage()
    const saveA = createGameSave({
      progression: createProgression(1, 10),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    saveGame(storageA, saveA)

    expect(loadGame(storageB)).toBeUndefined()
    expect(loadGame(storageA)?.progression.level).toBe(10)
  })

  it('serializeGameSave output round-trips through parseGameSave directly', () => {
    const save = createGameSave({
      progression: createProgression(4, 5),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    const raw = serializeGameSave(save)
    const parsed = parseGameSave(raw)
    expect(parsed).toEqual(save)
  })

  it('pets placeholder is present but inert; skills/soul default when omitted', () => {
    const save = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
    })
    expect(save.pets).toEqual([])
    // S5: fresh saves default to the starter single-skill state, not the old
    // five-skill demo loadout.
    expect(save.skills).not.toBeNull()
    expect(save.skills?.bindings).toEqual({ Y: 'slz', U: null, I: null, O: null, L: null })
    expect(save.soul).toBe(0)
  })

  it('round-trips a real skillTree + soul through save/load (S5)', () => {
    const skillTree = {
      schools: [
        { level: 2, learned: [{ skillName: 'slz' as const, level: 3 }] },
        { level: 0, learned: [] },
      ] as [import('../src/systems/skillTree').SchoolState, import('../src/systems/skillTree').SchoolState],
      bindings: { Y: 'slz' as const, U: null, I: null, O: null, L: null },
    }
    const save = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
      skillTree,
      soul: 1234,
    })
    saveGame(storage, save)
    const loaded = restoreGameState(parseGameSave(storage.getItem(GameSaveStorageKey)!)!)
    expect(loaded.skillTree).toEqual(skillTree)
    expect(loaded.soul).toBe(1234)
  })

  it('restoreGameState migrates skills:null legacy saves to the old five-skill loadout', () => {
    const legacy: GameSave = {
      ...createGameSave({ progression: createProgression(1), equipment: createEquipment(), inventory: createInventory(4) }),
      skills: null,
      soul: undefined as unknown as number,
    }
    const loaded = restoreGameState(legacy)
    expect(loaded.skillTree.bindings).toEqual({ Y: 'slz', U: 'lys', I: 'hytj', O: 'lyfb', L: 'jdy' })
    expect(loaded.soul).toBe(0)
  })

  it('restoreGameState preserves a valid old five-skill saved state instead of re-defaulting it', () => {
    const fiveSkillTree: import('../src/systems/skillTree').SkillTreeState = {
      schools: [
        { level: 1, learned: [{ skillName: 'slz', level: 1 }] },
        {
          level: 4,
          learned: [
            { skillName: 'lys', level: 1 },
            { skillName: 'hytj', level: 1 },
            { skillName: 'lyfb', level: 1 },
            { skillName: 'jdy', level: 1 },
          ],
        },
      ],
      bindings: { Y: 'slz', U: 'lys', I: 'hytj', O: 'lyfb', L: 'jdy' },
    }
    const save = createGameSave({
      progression: createProgression(1),
      equipment: createEquipment(),
      inventory: createInventory(4),
      skillTree: fiveSkillTree,
    })
    const loaded = restoreGameState(save)
    expect(loaded.skillTree).toEqual(fiveSkillTree)
  })
})
