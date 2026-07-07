// Versioned save/load for persistable game state. Ported from
// kagami-phaser's src/systems/SaveSystem.ts (see zmxy3-remake root
// CLAUDE.md: 移植 > 重写). Pure logic, no Phaser/browser dependency --
// `SaveStorage` is an injectable `Pick<Storage, ...>` so tests use an
// in-memory stub and the runtime wires up `window.localStorage` later.
//
// Adaptations vs. kagami:
//  - Kagami's Player1Save/PlayerPetSave equipment entries are a *registry
//    lookup key* (fillName) because EquipmentDefinition is heavy static data
//    addressed by name. Our `Item` (systems/items.ts) is already
//    self-contained plain data (id/name/kind/rarity/effects) -- there is no
//    registry, so equipment and inventory items are serialized inline and
//    validated in place instead of resolved against a passed-in catalog.
//  - We have no pet/skill systems yet. Their save fields are kept as inert
//    placeholders (always an empty array / null) so a save written today
//    needs no migration once those systems land -- kagami's version-bump
//    pattern, applied preemptively instead of retroactively.
//  - Version starts at 1, not kagami's 2. Kagami's "2" is the result of a
//    real v1->v2 migration already shipped in their game; we've never
//    shipped a v1, so calling ours "2" would document a migration that
//    never happened. The migration *mechanism* -- a `version` discriminant
//    plus one decode path per version -- is kept and ready for whenever a
//    real v2 (pets, skills, ...) is needed; see `parseGameSave`.
//  - Defensive decoding (isRecord/clampInteger/nonNegativeNumber guards)
//    mirrors kagami's tolerance for missing fields and stale/hand-edited
//    saves, applied to our smaller schema.

import type { HeroId, HeroProgressionState } from './progression'
import { createProgression, ProgressionTuning } from './progression'
import type { Item, Effect } from './items'
import type { Equipment } from './equipment'
import { createEquipment } from './equipment'
import type { Inventory } from './inventory'
import { createInventory, addItem } from './inventory'

export const GameSaveVersion = 1 as const
export const GameSaveStorageKey = 'zmxy3-remake.save.v1'

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type EquipmentSaveState = {
  weapon: Item | null
  armor: Item | null
  accessory: Item | null
  talisman: Item | null
}

export type InventorySaveState = {
  capacity: number
  stacks: { item: Item; qty: number }[]
}

export type GameSaveV1 = {
  version: typeof GameSaveVersion
  savedAt: string
  progression: HeroProgressionState
  equipment: EquipmentSaveState
  inventory: InventorySaveState
  /** Not implemented yet -- reserved so a future pet system needs no migration. */
  pets: unknown[]
  /** Not implemented yet -- reserved so a future skill system needs no migration. */
  skills: unknown
}

export type GameSave = GameSaveV1

export type CreateGameSaveInput = {
  progression: HeroProgressionState
  equipment: Equipment
  inventory: Inventory
  now?: Date
}

export type LoadedGameState = {
  progression: HeroProgressionState
  equipment: Equipment
  inventory: Inventory
}

export function createGameSave(input: CreateGameSaveInput): GameSave {
  return {
    version: GameSaveVersion,
    savedAt: (input.now ?? new Date()).toISOString(),
    progression: { ...input.progression },
    equipment: {
      weapon: input.equipment.weapon,
      armor: input.equipment.armor,
      accessory: input.equipment.accessory,
      talisman: input.equipment.talisman,
    },
    inventory: {
      capacity: input.inventory.capacity,
      stacks: input.inventory.stacks.map((stack) => ({ item: stack.item, qty: stack.qty })),
    },
    pets: [],
    skills: null,
  }
}

export function serializeGameSave(save: GameSave): string {
  return JSON.stringify(save)
}

/**
 * Parse and validate a raw save string. Returns undefined (never throws) if
 * the JSON is malformed or the top-level shape/version doesn't match --
 * there is no earlier version to migrate from yet, so an unrecognized
 * `version` is treated as unreadable rather than guessed at. Sub-field
 * defects (a corrupt item, an out-of-range level) are tolerated later by
 * `restoreGameState`'s decoders instead of failing the whole load here.
 */
export function parseGameSave(raw: string): GameSave | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) return undefined
    if (value.version !== GameSaveVersion) return undefined
    if (typeof value.savedAt !== 'string') return undefined
    if (!isRecord(value.progression) || !isRecord(value.equipment) || !isRecord(value.inventory)) {
      return undefined
    }
    return value as unknown as GameSave
  } catch {
    return undefined
  }
}

export function saveGame(storage: SaveStorage, save: GameSave): void {
  storage.setItem(GameSaveStorageKey, serializeGameSave(save))
}

export function loadGame(storage: SaveStorage): GameSave | undefined {
  const raw = storage.getItem(GameSaveStorageKey)
  return raw === null ? undefined : parseGameSave(raw)
}

export function clearGameSave(storage: SaveStorage): void {
  storage.removeItem(GameSaveStorageKey)
}

/** Rebuild live game state from a parsed save, tolerating missing/invalid sub-fields. */
export function restoreGameState(save: GameSave): LoadedGameState {
  return {
    progression: decodeProgression(save.progression),
    equipment: decodeEquipment(save.equipment),
    inventory: decodeInventory(save.inventory),
  }
}

function decodeProgression(saved: unknown): HeroProgressionState {
  if (!isRecord(saved)) return createProgression(1)
  const heroId = clampInteger(saved.heroId, 1, 5) as HeroId
  const level = clampInteger(saved.level, 1, ProgressionTuning.maxLevel)
  const exp = nonNegativeNumber(saved.exp)
  // createProgression re-derives expToNext and clamps exp into range for
  // the level, so a hand-edited or stale `expToNext` value can't desync
  // from the curve -- reuses progression.ts's own validation, not a copy.
  return createProgression(heroId, level, exp)
}

function decodeEquipment(saved: unknown): Equipment {
  const eq = createEquipment()
  if (!isRecord(saved)) return eq
  eq.weapon = decodeItem(saved.weapon)
  eq.armor = decodeItem(saved.armor)
  eq.accessory = decodeItem(saved.accessory)
  eq.talisman = decodeItem(saved.talisman)
  return eq
}

const MAX_SANE_STACK_QTY = 999_999

function decodeInventory(saved: unknown): Inventory {
  const capacity = isRecord(saved) ? clampInteger(saved.capacity, 0, 9999) : 0
  const inv = createInventory(capacity)
  if (!isRecord(saved) || !Array.isArray(saved.stacks)) return inv

  for (const entry of saved.stacks) {
    if (!isRecord(entry)) continue
    const item = decodeItem(entry.item)
    if (!item) continue
    const qty = clampInteger(entry.qty, 0, MAX_SANE_STACK_QTY)
    if (qty <= 0) continue
    // addItem enforces the real stack-size and slot-capacity invariants, so
    // decode doesn't need to duplicate them.
    addItem(inv, item, qty)
  }
  return inv
}

const ITEM_KINDS = new Set<Item['kind']>(['material', 'equip', 'consumable'])
const RARITIES = new Set<Item['rarity']>([1, 2, 3])
type StatEffect = Extract<Effect, { type: 'stat' }>
type OnHitEffect = Extract<Effect, { type: 'onHit' }>
const STAT_KEYS = new Set<StatEffect['stat']>(['atk', 'def', 'hp', 'mp', 'crit'])
const ONHIT_KINDS = new Set<OnHitEffect['effect']>(['burn', 'lifesteal', 'freeze'])

function decodeItem(value: unknown): Item | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (typeof value.name !== 'string') return null
  if (typeof value.kind !== 'string' || !ITEM_KINDS.has(value.kind as Item['kind'])) return null
  if (typeof value.rarity !== 'number' || !RARITIES.has(value.rarity as Item['rarity'])) return null

  const item: Item = {
    id: value.id,
    name: value.name,
    kind: value.kind as Item['kind'],
    rarity: value.rarity as Item['rarity'],
  }
  const effects = decodeEffects(value.effects)
  if (effects.length > 0) item.effects = effects
  return item
}

function decodeEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) return []
  const out: Effect[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (
      entry.type === 'stat' &&
      STAT_KEYS.has(entry.stat as StatEffect['stat']) &&
      Number.isFinite(entry.value)
    ) {
      out.push({ type: 'stat', stat: entry.stat as StatEffect['stat'], value: entry.value as number })
      continue
    }
    if (
      entry.type === 'onHit' &&
      ONHIT_KINDS.has(entry.effect as OnHitEffect['effect']) &&
      Number.isFinite(entry.chance) &&
      Number.isFinite(entry.power)
    ) {
      out.push({
        type: 'onHit',
        effect: entry.effect as OnHitEffect['effect'],
        chance: entry.chance as number,
        power: entry.power as number,
      })
    }
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampInteger(value: unknown, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.floor(value as number) : min
  return Math.min(max, Math.max(min, n))
}

function nonNegativeNumber(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0
}
