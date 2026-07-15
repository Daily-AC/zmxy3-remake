/// <reference types="vite/client" />

declare const __GAME_VERSION__: string

interface Window {
  __combatCoreSlice?: CombatCoreSliceObservation
  __battleRuntime?: BattleRuntimeObservation
}

interface BattleRuntimeObservation {
  getSnapshot(): unknown
  getEvents(): unknown
  getHash(): string
  enqueue(command: { type: string; skillId?: string; actorId: string; sequence: number; atTick: number }): void
  setManualMode(enabled: boolean): void
  step(ticks?: number): unknown
  equipItem(itemId: string): boolean
  getWeaponTexture(): string
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
