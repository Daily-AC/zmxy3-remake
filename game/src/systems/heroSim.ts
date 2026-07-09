// Phaser-independent hero simulation: composes locomotion, jump physics and the
// combo state machine into one deterministic, fixed-timestep step. The Phaser
// scene only gathers input edges and renders the resulting `action`/position.
//
// Timestep: physics and combo advance in discrete 30fps ticks (TICK_MS) so the
// integer per-frame speeds from the original game stay faithful regardless of
// the browser's real frame rate. A real-time delta is accumulated and drained
// one tick at a time; input edges are applied on the first tick of the batch.

import { TICK_MS } from './tick'
import {
  MoveConfig,
  MoveState,
  DEFAULT_MOVE_CONFIG,
  initMoveState,
  pressLeft,
  pressRight,
  releaseLeft,
  releaseRight,
  currentDir,
  moveVelocity,
} from './locomotion'
import {
  JumpConfig,
  VerticalState,
  DEFAULT_JUMP_CONFIG,
  initVertical,
  requestJump,
  stepVertical,
} from './jump'
import { ComboConfig, ComboState, initCombo, stepCombo } from './combo'

export interface HeroConfig {
  move: MoveConfig
  jump: JumpConfig
  combo: ComboConfig
  minX: number
  maxX: number
  tickMs: number
  /** Optional horizontal wall resolver. Absent preserves minX/maxX-only movement. */
  resolveHorizontal?: (query: { fromX: number; toX: number; y: number }) => number
}

export interface HeroState {
  vertical: VerticalState
  move: MoveState
  combo: ComboState
  x: number
  action: string
  facing: -1 | 1
  /**
   * Monotonic id of the current attack swing. Bumped each time a new combo
   * stage begins, so a struck target can dedup and take each of the five hits
   * at most once. 0 means no swing has started yet.
   */
  attackId: number
  /** Accumulated real time not yet consumed by a full tick. */
  accMs: number
  /** Deterministic sim clock (sum of ticks), used for double-tap timing. */
  simClockMs: number
}

/** Input edges observed during one rendered frame. */
export interface HeroEdges {
  pressLeft: boolean
  releaseLeft: boolean
  pressRight: boolean
  releaseRight: boolean
  pressJump: boolean
  pressAttack: boolean
}

export const NO_EDGES: HeroEdges = {
  pressLeft: false,
  releaseLeft: false,
  pressRight: false,
  releaseRight: false,
  pressJump: false,
  pressAttack: false,
}

export function initHeroState(cfg: HeroConfig, x: number): HeroState {
  return {
    vertical: initVertical(cfg.jump.groundY),
    move: initMoveState(-1),
    combo: initCombo(),
    x,
    action: 'wait',
    facing: -1,
    attackId: 0,
    accMs: 0,
    simClockMs: 0,
  }
}

function selectAction(state: HeroState, attacking: boolean, comboAction: string | null): string {
  if (attacking && comboAction) return comboAction
  if (!state.vertical.grounded) return state.vertical.airAction ?? 'jump3'
  if (currentDir(state.move) !== 0) return state.move.running ? 'run' : 'walk'
  return 'wait'
}

/** Advance exactly one 30fps tick. `edges` are applied only on this tick. */
function tick(state: HeroState, edges: HeroEdges, cfg: HeroConfig): void {
  state.simClockMs += cfg.tickMs

  // Direction edges -> move state (double-tap run uses the sim clock).
  if (edges.pressLeft) pressLeft(state.move, state.simClockMs, cfg.move)
  if (edges.pressRight) pressRight(state.move, state.simClockMs, cfg.move)
  if (edges.releaseLeft) releaseLeft(state.move)
  if (edges.releaseRight) releaseRight(state.move)

  // Combo: starts only on the ground (see combo.ts airborne note).
  const comboRes = stepCombo(
    state.combo,
    { attackPressed: edges.pressAttack, grounded: state.vertical.grounded, dtMs: cfg.tickMs },
    cfg.combo,
  )

  // Each new combo stage is a fresh swing -> a new attack id for hit dedup.
  if (comboRes.changed && state.combo.stage > 0) state.attackId += 1

  // Jump: blocked only while genuinely mid-swing (comboRes.attacking, i.e.
  // AS3's isAttacking()) -- hitstun-triad pen: this used to key off
  // `state.combo.stage > 0` computed BEFORE stepCombo, which (now that stage
  // legitimately stays nonzero through the whole post-swing chain window,
  // see combo.ts's header) would have kept blocking jump for up to 1500ms
  // after every swing even though the hero is actually free to act again the
  // instant the swing itself ends -- Role1.as's own jump case in myKeyDown()
  // only rejects the press while isAttacking()||isBeAttacking(), never
  // merely because a combo chain window is still open in the background.
  if (edges.pressJump && !comboRes.attacking) requestJump(state.vertical, cfg.jump)

  // Horizontal movement, suppressed while a combo occupies the character.
  if (!comboRes.attacking) {
    const fromX = state.x
    const toX = state.x + moveVelocity(state.move, cfg.move)
    state.x = cfg.resolveHorizontal?.({ fromX, toX, y: state.vertical.y }) ?? toX
    if (state.x < cfg.minX) state.x = cfg.minX
    if (state.x > cfg.maxX) state.x = cfg.maxX
    const dir = currentDir(state.move)
    if (dir !== 0) state.facing = dir === -1 ? -1 : 1
  }

  stepVertical(state.vertical, cfg.jump, state.x)

  state.action = selectAction(state, comboRes.attacking, comboRes.action)
}

/**
 * Advance the hero by a real-time delta (ms). Returns the same (mutated) state.
 * Runs zero or more fixed ticks; input edges apply to the first tick only.
 */
export function advanceHero(
  state: HeroState,
  edges: HeroEdges,
  dtMs: number,
  cfg: HeroConfig,
): HeroState {
  state.accMs += dtMs
  let first = true
  // Guard against spiral-of-death on huge deltas (e.g. tab regains focus).
  let budget = 8
  while (state.accMs >= cfg.tickMs && budget-- > 0) {
    tick(state, first ? edges : NO_EDGES, cfg)
    state.accMs -= cfg.tickMs
    first = false
  }
  if (budget <= 0) state.accMs = 0
  // If no full tick elapsed this frame, still apply edges next call by leaving
  // them to the caller — but to avoid dropping a press on a fast frame we run
  // one catch-up tick when edges are present and nothing ran.
  if (first && hasEdge(edges)) tick(state, edges, cfg)
  return state
}

function hasEdge(e: HeroEdges): boolean {
  return (
    e.pressLeft ||
    e.releaseLeft ||
    e.pressRight ||
    e.releaseRight ||
    e.pressJump ||
    e.pressAttack
  )
}

/** Build a HeroConfig from stage geometry and the combo stage durations. */
export function makeHeroConfig(opts: {
  groundY: number
  minX: number
  maxX: number
  comboStageDurationsMs: number[]
  comboGraceMs: number
}): HeroConfig {
  return {
    move: DEFAULT_MOVE_CONFIG,
    jump: { ...DEFAULT_JUMP_CONFIG, groundY: opts.groundY },
    combo: {
      stageDurationsMs: opts.comboStageDurationsMs,
      graceMs: opts.comboGraceMs,
      maxStage: 5,
    },
    minX: opts.minX,
    maxX: opts.maxX,
    tickMs: TICK_MS,
  }
}
