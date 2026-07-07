// Three-slot save management, layered on top of the single-save primitives in
// systems/save.ts (which this module never modifies -- that file is shared with
// other work streams). save.ts owns one `GameSave` blob under one fixed key;
// the original 4399 game let you pick between multiple save slots from the main
// menu, so this module wraps save.ts with:
//   - a per-slot localStorage key (slot 0/1/2),
//   - a small metadata envelope (`SlotMeta`) carrying the bits the slot-select
//     menu shows -- hero, level, playtime, timestamp -- so the menu can render
//     a slot summary WITHOUT doing a full `restoreGameState` of every slot.
//
// Pure logic, no Phaser/DOM: storage is an injected `SaveStorage`
// (`window.localStorage` at runtime, an in-memory stub in tests), matching
// save.ts's own dependency-injection style.
//
// Drift-proofing: `heroId`/`level`/`savedAt` in a stored envelope are treated as
// display cache only. On read we re-derive them from the embedded `GameSave`
// (the source of truth), keeping only `playtimeSec` from the stored meta (which
// has no home inside GameSave). A hand-edited meta therefore can never make the
// menu disagree with what actually loads.

import type { HeroId } from './progression'
import type { GameSaveV1, SaveStorage, CreateGameSaveInput } from './save'
import { createGameSave, serializeGameSave, parseGameSave } from './save'

export const SLOT_COUNT = 3
export type SlotId = 0 | 1 | 2
export const SLOT_IDS: readonly SlotId[] = [0, 1, 2]

/** Envelope schema version, independent of GameSave's own `version`. */
export const SlotEnvelopeVersion = 1 as const

/** localStorage key for a slot's envelope. Namespaced apart from save.ts's key. */
export function slotStorageKey(slot: SlotId): string {
  return `zmxy3-remake.slot.v1.${slot}`
}

/** Display names for the five heroes (heroId is the kagami curve index). */
export const HERO_NAMES: Record<HeroId, string> = {
  1: '孙悟空',
  2: '唐僧',
  3: '猪八戒',
  4: '沙僧',
  5: '白龙马',
}

export function heroName(heroId: HeroId): string {
  return HERO_NAMES[heroId] ?? `英雄${heroId}`
}

export interface SlotMeta {
  heroId: HeroId
  level: number
  /** Accumulated play time in whole seconds. */
  playtimeSec: number
  /** ISO timestamp of the embedded save (mirrors GameSave.savedAt). */
  savedAt: string
}

export interface SlotEnvelope {
  slotVersion: typeof SlotEnvelopeVersion
  meta: SlotMeta
  save: GameSaveV1
}

export type SlotSummary =
  | { slot: SlotId; occupied: false }
  | {
      slot: SlotId
      occupied: true
      heroId: HeroId
      heroName: string
      level: number
      playtimeSec: number
      savedAt: string
    }

/**
 * Wrap a `GameSave` in a slot envelope, deriving all display metadata from the
 * save itself so meta can never drift from the save. `playtimeSec` is the one
 * field with no source inside GameSave, so it is passed in (clamped to a
 * non-negative integer).
 */
export function buildSlotEnvelope(save: GameSaveV1, playtimeSec = 0): SlotEnvelope {
  return {
    slotVersion: SlotEnvelopeVersion,
    meta: {
      heroId: save.progression.heroId,
      level: save.progression.level,
      playtimeSec: clampSeconds(playtimeSec),
      savedAt: save.savedAt,
    },
    save,
  }
}

/** Fresh envelope for a brand-new game (playtime 0), reusing save.ts's factory. */
export function createNewSlotEnvelope(input: CreateGameSaveInput): SlotEnvelope {
  return buildSlotEnvelope(createGameSave(input), 0)
}

export function serializeSlotEnvelope(env: SlotEnvelope): string {
  return JSON.stringify(env)
}

/**
 * Parse a stored envelope. Returns undefined (never throws) on malformed JSON,
 * an unrecognized envelope version, or an embedded save that fails save.ts's own
 * validation. On success the returned envelope is rebuilt via `buildSlotEnvelope`
 * so its meta is re-derived from the validated save (only `playtimeSec` survives
 * from the stored meta).
 */
export function parseSlotEnvelope(raw: string): SlotEnvelope | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(value)) return undefined
  if (value.slotVersion !== SlotEnvelopeVersion) return undefined
  if (!isRecord(value.save)) return undefined
  // Reuse save.ts's full validation rather than duplicating it here.
  const save = parseGameSave(serializeGameSave(value.save as unknown as GameSaveV1))
  if (!save) return undefined
  const playtimeSec = isRecord(value.meta) ? clampSeconds(value.meta.playtimeSec) : 0
  return buildSlotEnvelope(save, playtimeSec)
}

export function writeSlot(storage: SaveStorage, slot: SlotId, env: SlotEnvelope): void {
  storage.setItem(slotStorageKey(slot), serializeSlotEnvelope(env))
}

export function readSlot(storage: SaveStorage, slot: SlotId): SlotEnvelope | undefined {
  const raw = storage.getItem(slotStorageKey(slot))
  return raw === null ? undefined : parseSlotEnvelope(raw)
}

export function deleteSlot(storage: SaveStorage, slot: SlotId): void {
  storage.removeItem(slotStorageKey(slot))
}

/** Menu-facing summary for one slot; an empty or unreadable slot reads as empty. */
export function readSlotSummary(storage: SaveStorage, slot: SlotId): SlotSummary {
  const env = readSlot(storage, slot)
  if (!env) return { slot, occupied: false }
  return {
    slot,
    occupied: true,
    heroId: env.meta.heroId,
    heroName: heroName(env.meta.heroId),
    level: env.meta.level,
    playtimeSec: env.meta.playtimeSec,
    savedAt: env.meta.savedAt,
  }
}

export function listSlotSummaries(storage: SaveStorage): SlotSummary[] {
  return SLOT_IDS.map((slot) => readSlotSummary(storage, slot))
}

/** Format seconds as H:MM:SS (hours omitted when zero -> MM:SS). */
export function formatPlaytime(totalSec: number): string {
  const s = clampSeconds(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Short human date (locale-independent) for the slot card, e.g. 2026-07-07 15:04. */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function clampSeconds(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
