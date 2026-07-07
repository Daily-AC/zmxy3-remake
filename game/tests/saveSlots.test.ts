import { describe, it, expect, beforeEach } from 'vitest'
import {
  SLOT_COUNT,
  SLOT_IDS,
  slotStorageKey,
  buildSlotEnvelope,
  createNewSlotEnvelope,
  serializeSlotEnvelope,
  parseSlotEnvelope,
  writeSlot,
  readSlot,
  deleteSlot,
  readSlotSummary,
  listSlotSummaries,
  formatPlaytime,
  formatSavedAt,
  heroName,
  SlotEnvelopeVersion,
  type SlotId,
} from '../src/systems/saveSlots'
import { createGameSave, type SaveStorage } from '../src/systems/save'
import { createProgression, gainExp } from '../src/systems/progression'
import { createEquipment, type Equipment } from '../src/systems/equipment'
import { createInventory, addItem, listStacks, type Inventory } from '../src/systems/inventory'
import type { Item } from '../src/systems/items'

// Same in-memory Storage stub used by save.test.ts -- no jsdom localStorage in
// the node vitest env, which is why SaveStorage is injected.
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
  effects: [{ type: 'stat', stat: 'atk', value: 40 }],
}
const herb: Item = { id: 'herb', name: '妖草', kind: 'material', rarity: 1 }

function newGameEnvelope(opts?: { level?: number; playtimeSec?: number }) {
  const progression = createProgression(1, opts?.level ?? 1)
  const equipment: Equipment = createEquipment()
  const inventory: Inventory = createInventory(24)
  const save = createGameSave({
    progression,
    equipment,
    inventory,
    now: new Date('2026-07-07T15:04:00.000Z'),
  })
  return buildSlotEnvelope(save, opts?.playtimeSec ?? 0)
}

describe('saveSlots (three-slot wrapper over save.ts)', () => {
  let storage: SaveStorage

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('exposes exactly six slots with distinct namespaced keys', () => {
    expect(SLOT_COUNT).toBe(6)
    expect(SLOT_IDS).toEqual([0, 1, 2, 3, 4, 5])
    const keys = SLOT_IDS.map((s) => slotStorageKey(s))
    expect(new Set(keys).size).toBe(6)
    for (const k of keys) expect(k).toMatch(/^zmxy3-remake\.slot\.v1\.\d$/)
  })

  it('every slot reads as empty on a fresh storage', () => {
    for (const s of SLOT_IDS) {
      expect(readSlot(storage, s)).toBeUndefined()
      expect(readSlotSummary(storage, s)).toEqual({ slot: s, occupied: false })
    }
    expect(listSlotSummaries(storage)).toHaveLength(6)
  })

  it('round-trips a new game through write/read preserving save contents', () => {
    const progression = createProgression(1, 1)
    gainExp(progression, 500)
    const equipment = createEquipment()
    equipment.weapon = sword
    const inventory = createInventory(24)
    addItem(inventory, herb, 5)

    const env = createNewSlotEnvelope({
      progression,
      equipment,
      inventory,
      now: new Date('2026-07-07T15:04:00.000Z'),
    })
    writeSlot(storage, 1, env)

    const back = readSlot(storage, 1)
    expect(back).toBeDefined()
    expect(back!.slotVersion).toBe(SlotEnvelopeVersion)
    expect(back!.save.progression).toEqual(progression)
    expect(back!.save.equipment.weapon).toEqual(sword)
    expect(back!.save.inventory.stacks).toEqual([{ item: herb, qty: 5 }])
    expect(back!.meta.playtimeSec).toBe(0)
  })

  it('summary reports hero/level/playtime for an occupied slot', () => {
    writeSlot(storage, 2, newGameEnvelope({ level: 7, playtimeSec: 3725 }))
    const sum = readSlotSummary(storage, 2)
    expect(sum.occupied).toBe(true)
    if (!sum.occupied) throw new Error('unreachable')
    expect(sum.heroId).toBe(1)
    expect(sum.heroName).toBe('孙悟空')
    expect(sum.level).toBe(7)
    expect(sum.playtimeSec).toBe(3725)
    expect(sum.savedAt).toBe('2026-07-07T15:04:00.000Z')
  })

  it('slots are isolated: writing one leaves the others empty', () => {
    writeSlot(storage, 0, newGameEnvelope({ level: 3 }))
    expect(readSlotSummary(storage, 0).occupied).toBe(true)
    expect(readSlotSummary(storage, 1).occupied).toBe(false)
    expect(readSlotSummary(storage, 2).occupied).toBe(false)
  })

  it('deleteSlot clears just that slot', () => {
    writeSlot(storage, 0, newGameEnvelope())
    writeSlot(storage, 1, newGameEnvelope())
    deleteSlot(storage, 0)
    expect(readSlot(storage, 0)).toBeUndefined()
    expect(readSlot(storage, 1)).toBeDefined()
  })

  it('re-derives meta from the embedded save, ignoring a tampered meta', () => {
    const env = newGameEnvelope({ level: 5, playtimeSec: 100 })
    // Corrupt the display cache: claim a different hero and level than the save.
    const tampered = {
      ...env,
      meta: { ...env.meta, heroId: 4, level: 99 },
    }
    writeSlot(storage, 0, tampered as typeof env)
    const sum = readSlotSummary(storage, 0)
    if (!sum.occupied) throw new Error('unreachable')
    // Truth comes from save.progression (hero 1, level 5), not the tampered meta.
    expect(sum.heroId).toBe(1)
    expect(sum.level).toBe(5)
    // playtime has no home in the save, so the stored value is kept.
    expect(sum.playtimeSec).toBe(100)
  })

  it('parseSlotEnvelope rejects malformed / wrong-version / bad-save envelopes', () => {
    expect(parseSlotEnvelope('{not json')).toBeUndefined()
    expect(parseSlotEnvelope('null')).toBeUndefined()
    expect(parseSlotEnvelope('42')).toBeUndefined()

    const good = newGameEnvelope()
    const wrongVersion = { ...good, slotVersion: 999 }
    expect(parseSlotEnvelope(JSON.stringify(wrongVersion))).toBeUndefined()

    const noSave: Record<string, unknown> = { ...good }
    delete noSave.save
    expect(parseSlotEnvelope(JSON.stringify(noSave))).toBeUndefined()

    // Embedded save with a version save.ts won't accept -> whole slot unreadable.
    const badSave = { ...good, save: { ...good.save, version: 999 } }
    expect(parseSlotEnvelope(JSON.stringify(badSave))).toBeUndefined()
  })

  it('an unreadable stored slot surfaces as empty in the summary', () => {
    storage.setItem(slotStorageKey(1), '{garbage')
    expect(readSlotSummary(storage, 1)).toEqual({ slot: 1, occupied: false })
  })

  it('serialize/parse round-trips exactly (playtime survives)', () => {
    const env = newGameEnvelope({ level: 4, playtimeSec: 999 })
    const raw = serializeSlotEnvelope(env)
    const parsed = parseSlotEnvelope(raw)
    expect(parsed).toEqual(env)
  })

  it('formatPlaytime renders MM:SS under an hour and H:MM:SS past it', () => {
    expect(formatPlaytime(0)).toBe('00:00')
    expect(formatPlaytime(65)).toBe('01:05')
    expect(formatPlaytime(3725)).toBe('1:02:05')
    expect(formatPlaytime(-10)).toBe('00:00')
  })

  it('formatSavedAt formats a valid ISO and degrades gracefully', () => {
    expect(formatSavedAt('2026-07-07T15:04:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(formatSavedAt('not-a-date')).toBe('—')
  })

  it('heroName covers the roster and falls back for unknown ids', () => {
    expect(heroName(1)).toBe('孙悟空')
    expect(heroName(5)).toBe('白龙马')
  })
})
