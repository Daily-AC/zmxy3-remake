// Glue shared by the three shell scenes (main menu / slot select / character
// select). Registry keys carry the chosen slot and the loaded state forward to
// the battle scene; `shellStorage` is the one place the shell reaches for the
// real browser localStorage (saveSlots itself stays storage-agnostic).

import type { SaveStorage } from '../systems/save'
import type { SlotId } from '../systems/saveSlots'
import type { LoadedGameState, GameSave } from '../systems/save'

export const SCENE = {
  mainMenu: 'mainmenu',
  slotSelect: 'slotselect',
  characterSelect: 'charselect',
  worldMap: 'worldmap',
  coopLogin: 'cooplogin',
  coopLobby: 'cooplobby',
  battleLoading: 'battle-loading',
  battle: 'battle',
  battleRuntime: 'battle-runtime',
  skillTree: 'skilltree',
} as const

/**
 * Registry keys (Phaser game-global DataManager) used to hand the selected
 * slot + loaded game state to whoever integrates the battle scene later. The
 * shell writes these; BattleScene does not read them yet (documented as the
 * integration interface in tasks/meta-shell-report.md).
 */
export const REG = {
  activeSlot: 'shell.activeSlot',
  loadedState: 'shell.loadedState',
  activeSave: 'shell.activeSave',
  origin: 'shell.origin',
} as const

export interface ShellHandoff {
  slot: SlotId
  save: GameSave
  loaded: LoadedGameState
  origin: 'new' | 'continue'
}

/** The real localStorage; typed down to the injectable SaveStorage surface. */
export function shellStorage(): SaveStorage {
  return window.localStorage
}
