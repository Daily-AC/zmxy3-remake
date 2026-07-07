// Phaser-independent walk/run state with double-tap run detection.
//
// Evidence (movement-index.md / controls-index.md):
//  - Role1 walk speed 6, run speed 10 px/frame.
//  - Run is entered by a same-direction second press within 500ms and only
//    lasts while that direction stays held; releasing the direction clears run.
//  - Run is NOT a latched mode and NOT "walk animation played faster" — walk
//    and run are distinct animation rows.
//
// Timing here is measured in the deterministic sim clock (accumulated tick ms),
// not wall-clock, so behaviour is reproducible in tests.

export interface MoveConfig {
  walkSpeed: number
  runSpeed: number
  doubleTapWindowMs: number
}

export const DEFAULT_MOVE_CONFIG: MoveConfig = {
  walkSpeed: 6,
  runSpeed: 10,
  doubleTapWindowMs: 500,
}

export type Dir = -1 | 0 | 1

export interface MoveState {
  heldLeft: boolean
  heldRight: boolean
  running: boolean
  /** Direction of the last press, for double-tap matching. */
  lastPressDir: Dir
  lastPressAtMs: number
  facing: -1 | 1
}

export function initMoveState(facing: -1 | 1 = -1): MoveState {
  return {
    heldLeft: false,
    heldRight: false,
    running: false,
    lastPressDir: 0,
    lastPressAtMs: -Infinity,
    facing,
  }
}

function press(state: MoveState, dir: -1 | 1, nowMs: number, cfg: MoveConfig): void {
  const sameDir = state.lastPressDir === dir
  const withinWindow = nowMs - state.lastPressAtMs < cfg.doubleTapWindowMs
  if (sameDir && withinWindow) state.running = true
  state.lastPressDir = dir
  state.lastPressAtMs = nowMs
  state.facing = dir
  if (dir === -1) state.heldLeft = true
  else state.heldRight = true
}

/** Handle a left/right key-down edge at sim time `nowMs`. */
export function pressLeft(state: MoveState, nowMs: number, cfg: MoveConfig): void {
  press(state, -1, nowMs, cfg)
}

export function pressRight(state: MoveState, nowMs: number, cfg: MoveConfig): void {
  press(state, 1, nowMs, cfg)
}

function release(state: MoveState, dir: -1 | 1): void {
  if (dir === -1) state.heldLeft = false
  else state.heldRight = false
  // Releasing any direction drops run; you must re-double-tap to run again.
  if (!state.heldLeft && !state.heldRight) state.running = false
}

export function releaseLeft(state: MoveState): void {
  release(state, -1)
}

export function releaseRight(state: MoveState): void {
  release(state, 1)
}

/** Currently effective movement direction, preferring the most recent press. */
export function currentDir(state: MoveState): Dir {
  if (state.heldLeft && state.heldRight) return state.lastPressDir
  if (state.heldLeft) return -1
  if (state.heldRight) return 1
  return 0
}

/** Horizontal velocity in px/tick given the current move state. */
export function moveVelocity(state: MoveState, cfg: MoveConfig): number {
  const dir = currentDir(state)
  if (dir === 0) return 0
  return dir * (state.running ? cfg.runSpeed : cfg.walkSpeed)
}
