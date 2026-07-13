export const TICK_RATE = 30
export const FPS = TICK_RATE
export const TICK_MS = 1000 / TICK_RATE
export const TIME_EPSILON_MS = 1e-6

export function hasReachedDuration(elapsedMs: number, durationMs: number): boolean {
  return elapsedMs + TIME_EPSILON_MS >= durationMs
}
