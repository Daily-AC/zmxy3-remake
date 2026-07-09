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
//  - We have no pet system yet. Its save field is kept as an inert placeholder
//    (always an empty array) so a save written today needs no migration once
//    that system lands -- kagami's version-bump pattern, applied preemptively
//    instead of retroactively.
//  - S5 (skilltree-report.md) is the first real use of the `skills` field this
//    comment used to describe as a placeholder: it's now `SkillTreeSaveState`
//    (systems/skillTree.ts), decoded defensively exactly like every other
//    field below. A pre-S5 save has `skills: null`; decodeSkillTree treats
//    that as a legacy migration and returns `createLegacySkillTreeState()` so
//    players who already had the old five-skill demo loadout keep it. Brand-new
//    saves use `createDefaultSkillTreeState()` instead: only slz is learned and
//    bound to Y. `soul` (soulPurse.ts) is new for the same reason: S5's skill
//    costs need a currency that survives a scene change, so the previously
//    ephemeral wallet is persisted here too.
//  - Version starts at 1, not kagami's 2. Kagami's "2" is the result of a
//    real v1->v2 migration already shipped in their game; we've never
//    shipped a v1, so calling ours "2" would document a migration that
//    never happened. The migration *mechanism* -- a `version` discriminant
//    plus one decode path per version -- is kept and ready for whenever a
//    real v2 is needed; see `parseGameSave`.
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
import type { SkillTreeState, SchoolState, LearnedSkillEntry, BindKey, Role1TreeSkillId } from './skillTree'
import {
  BIND_KEYS,
  ROLE1_SCHOOLS,
  MAX_SCHOOL_LEVEL,
  MAX_SKILL_LEVEL,
  createDefaultSkillTreeState,
  createLegacySkillTreeState,
} from './skillTree'

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
  /** S5: SkillTreeState (systems/skillTree.ts). A pre-S5 save has this as
   * `null`; decodeSkillTree treats that as a legacy five-skill migration. */
  skills: SkillTreeState | null
  /** S5: soulPurse.ts's wallet. See save.ts header re: newly-persisted. */
  soul: number
}

export type GameSave = GameSaveV1

export type CreateGameSaveInput = {
  progression: HeroProgressionState
  equipment: Equipment
  inventory: Inventory
  /** Defaults to createDefaultSkillTreeState() (fresh-character bootstrap). */
  skillTree?: SkillTreeState
  /** Defaults to 0. */
  soul?: number
  now?: Date
}

export type LoadedGameState = {
  progression: HeroProgressionState
  equipment: Equipment
  inventory: Inventory
  skillTree: SkillTreeState
  soul: number
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
    skills: input.skillTree ?? createDefaultSkillTreeState(),
    soul: Math.max(0, Math.floor(input.soul ?? 0)),
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
    skillTree: decodeSkillTree(save.skills),
    soul: nonNegativeNumber((save as unknown as Record<string, unknown>).soul),
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

/**
 * Decode a saved `skills` blob (systems/skillTree.ts's SkillTreeState). Any
 * shape mismatch -- most commonly a pre-S5 save's literal `null` -- falls
 * back to `createLegacySkillTreeState()`, preserving the old five-skill demo
 * loadout for existing users. A validly-shaped but genuinely empty state
 * decodes as empty, not defaulted -- only unreadable data gets the fallback.
 */
function decodeSkillTree(saved: unknown): SkillTreeState {
  if (!isRecord(saved) || !Array.isArray(saved.schools) || saved.schools.length !== 2) {
    return createLegacySkillTreeState()
  }
  const schools = [decodeSchool(saved.schools[0], 0), decodeSchool(saved.schools[1], 1)] as [
    SchoolState,
    SchoolState,
  ]
  // A skill can only legitimately be learned once, in the school it actually
  // belongs to (decodeSchool already filters to that school's own list) --
  // drop any cross-school or duplicate re-appearance from a hand-edited save.
  const learnedNames = new Set<Role1TreeSkillId>()
  for (const school of schools) {
    school.learned = school.learned.filter((e) => {
      if (learnedNames.has(e.skillName)) return false
      learnedNames.add(e.skillName)
      return true
    })
  }
  const bindings = decodeBindings(saved.bindings, learnedNames)
  return { schools, bindings }
}

function decodeSchool(raw: unknown, schoolIndex: 0 | 1): SchoolState {
  if (!isRecord(raw)) return { level: 0, learned: [] }
  const level = clampInteger(raw.level, 0, MAX_SCHOOL_LEVEL)
  const validNames = new Set<string>(ROLE1_SCHOOLS[schoolIndex].skills)
  const learned: LearnedSkillEntry[] = []
  if (Array.isArray(raw.learned)) {
    for (const entry of raw.learned) {
      if (!isRecord(entry)) continue
      if (typeof entry.skillName !== 'string' || !validNames.has(entry.skillName)) continue
      learned.push({
        skillName: entry.skillName as Role1TreeSkillId,
        level: clampInteger(entry.level, 1, MAX_SKILL_LEVEL),
      })
    }
  }
  return { level, learned }
}

function decodeBindings(
  raw: unknown,
  learnedNames: Set<Role1TreeSkillId>,
): Record<BindKey, Role1TreeSkillId | null> {
  const bindings: Record<BindKey, Role1TreeSkillId | null> = { Y: null, U: null, I: null, O: null, L: null }
  if (!isRecord(raw)) return bindings
  const usedSkills = new Set<Role1TreeSkillId>()
  for (const key of BIND_KEYS) {
    const v = raw[key]
    // Only a currently-learned, not-already-bound-elsewhere skill may occupy
    // a key -- guards against a hand-edited save binding an unlearned skill
    // or double-binding one skill to two keys.
    if (typeof v !== 'string' || !learnedNames.has(v as Role1TreeSkillId) || usedSkills.has(v as Role1TreeSkillId)) {
      continue
    }
    bindings[key] = v as Role1TreeSkillId
    usedSkills.add(v as Role1TreeSkillId)
  }
  return bindings
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
  if (typeof value.sourceFillName === 'string') item.sourceFillName = value.sourceFillName
  if (typeof value.sourceType === 'string') item.sourceType = value.sourceType
  if (typeof value.sourceQuality === 'string') item.sourceQuality = value.sourceQuality
  if (typeof value.sourceArray === 'string') item.sourceArray = value.sourceArray
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
