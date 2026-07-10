import { restoreGameState, type LoadedGameState, type SaveStorage } from './save'
import { readSlot, type SlotId } from './saveSlots'

export interface BattleSaveSeed {
  loaded: LoadedGameState
  playtimeSec: number
}

export function loadBattleSaveSeed(
  storage: SaveStorage,
  activeSlot: SlotId | null,
  registryLoaded: LoadedGameState | undefined,
  saveOrigin: 'new' | 'continue',
): BattleSaveSeed | undefined {
  if (activeSlot !== null) {
    const fresh = readSlot(storage, activeSlot)
    if (fresh) {
      return {
        loaded: restoreGameState(fresh.save),
        playtimeSec: fresh.meta.playtimeSec,
      }
    }
  }
  if (saveOrigin === 'continue' && registryLoaded) {
    return { loaded: registryLoaded, playtimeSec: 0 }
  }
  return undefined
}
