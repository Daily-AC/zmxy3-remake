// Phaser-independent vertical physics: gravity, jump, double-jump, landing.
//
// Evidence (movement-index.md):
//  - `jumpPower = -20`; every jump sets vy = jumpPower.
//  - Up to 2 jumps (jumpCount < 2). First jump -> action jump1, second -> jump2.
//  - While action is jump1 and vy turns downward, action switches to jump3 (fall).
//  - Landing resets jumpCount to 0.
//
// Gravity (combat-triage pen, 2026-07-10 -- corrects the module's previous
// TODO-verify placeholder of 2, which caused the reported "跳跃抛体太快，
// 高度不够" complaint): `base.BaseObject.as:55` declares
// `protected var graity:Number = 1.5;` -- the hero's own baseline (Role1/
// BaseHero never overrides this field; `BaseHero.as:1616`'s per-tick
// `this.speed.y += graity` is exactly this module's `state.vy += cfg.gravity`
// step below). `BaseHero.as` DOES reassign `graity` to 3.75/1.5 inside
// `turnToGXP()`/`turnToNormal()`, but that pair is a temporary combat-buff
// toggle (无双), not the resting jump arc, so it is out of scope here.
// gravity=1.5, jumpPower=-20 (semi-implicit Euler) yields a ~124px apex over
// ~26 ticks (~0.87s) of air time at 30fps -- a real ~38% higher/slower arc
// than the old placeholder, not a guessed tuning pass.

export type AirAction = 'jump1' | 'jump2' | 'jump3' | null

export interface JumpConfig {
  gravity: number
  jumpPower: number
  groundY: number
  maxJumps: number
  /** Optional platform resolver. Absent preserves the original single-groundY behavior. */
  platformResolver?: (query: { x: number; fromY: number; toY: number; vy: number }) => {
    kind: 'land' | 'head'
    y: number
  } | null
}

export const DEFAULT_JUMP_CONFIG: JumpConfig = {
  gravity: 1.5, // base.BaseObject.as:55 `graity` default -- see file header
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
export function stepVertical(state: VerticalState, cfg: JumpConfig, x: number = 0): void {
  if (state.grounded) return
  const fromY = state.y
  state.vy += cfg.gravity
  state.y += state.vy
  const platformHit = cfg.platformResolver?.({ x, fromY, toY: state.y, vy: state.vy }) ?? null
  if (platformHit?.kind === 'head') {
    state.y = platformHit.y
    state.vy = 0
    if (state.airAction === 'jump1') state.airAction = 'jump3'
    return
  }
  if (platformHit?.kind === 'land') {
    state.y = platformHit.y
    state.vy = 0
    state.grounded = true
    state.jumpCount = 0
    state.airAction = null
    return
  }
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
