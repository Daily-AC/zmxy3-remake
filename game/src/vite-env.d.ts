/// <reference types="vite/client" />

declare const __GAME_VERSION__: string

interface Window {
  __combatCoreSlice?: CombatCoreSliceObservation
}

interface CombatCoreSliceObservation {
  getSnapshot(): unknown
  getEvents(): unknown
  getCommands(): unknown
  getPresentationCues(): unknown
  getViewState(): unknown
  getPerformance(): unknown
  getDeterminismProof(): unknown
  captureBugBundle(): Promise<unknown>
  reset(): void
}
