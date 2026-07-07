// Phaser-independent vertical physics: gravity, jump, double-jump, landing.
//
// Evidence (movement-index.md):
//  - `jumpPower = -20`; every jump sets vy = jumpPower.
//  - Up to 2 jumps (jumpCount < 2). First jump -> action jump1, second -> jump2.
//  - While action is jump1 and vy turns downward, action switches to jump3 (fall).
//  - Landing resets jumpCount to 0.
//
// TODO-verify: gravity magnitude is NOT in the reverse-engineering docs (only
// jumpPower is given). GRAVITY = 2 px/tick^2 yields a ~90px apex over ~19 ticks
// (~0.63s) of air time at 30fps (semi-implicit Euler), which reads correctly,
// but the exact original value should be recovered from BaseObject's per-frame
// gravity before this is called final.

export type AirAction = 'jump1' | 'jump2' | 'jump3' | null

export interface JumpConfig {
  gravity: number
  jumpPower: number
  groundY: number
  maxJumps: number
}

export const DEFAULT_JUMP_CONFIG: JumpConfig = {
  gravity: 2, // TODO-verify: not documented; tuned to jumpPower=-20 @30fps
  jumpPower: -20,
  groundY: 0,
  maxJumps: 2,
}

export interface VerticalState {
  y: number
  vy: number
  grounded: boolean
  jumpCount: number
  airAction: AirAction
}

export function initVertical(groundY: number): VerticalState {
  return { y: groundY, vy: 0, grounded: true, jumpCount: 0, airAction: null }
}

/**
 * Apply a jump request. No-op if already at the jump-count ceiling. Gating on
 * "not attacking / not hurt" is the caller's responsibility (BaseHero.jump()).
 */
export function requestJump(state: VerticalState, cfg: JumpConfig): void {
  if (state.jumpCount >= cfg.maxJumps) return
  state.vy = cfg.jumpPower
  state.grounded = false
  // First jump -> jump1, second (double) -> jump2 roll.
  state.airAction = state.jumpCount === 0 ? 'jump1' : 'jump2'
  state.jumpCount += 1
}

/** Advance vertical physics by exactly one tick. */
export function stepVertical(state: VerticalState, cfg: JumpConfig): void {
  if (state.grounded) return
  state.vy += cfg.gravity
  state.y += state.vy
  if (state.y >= cfg.groundY) {
    // Landed.
    state.y = cfg.groundY
    state.vy = 0
    state.grounded = true
    state.jumpCount = 0
    state.airAction = null
    return
  }
  // Rising jump1 becomes falling jump3 once velocity turns downward. jump2 (the
  // double-jump roll) is not converted, matching the original transition.
  if (state.airAction === 'jump1' && state.vy >= 0) state.airAction = 'jump3'
}
