// Phaser-independent five-hit ground combo state machine.
//
// Sequence: hit1 -> hit2 -> hit3 -> hit4 (upward launch) -> hit5 (slam).
// Press attack (J) during a swing to queue the next stage; it chains the moment
// the current swing's animation finishes. If no press lands before the window
// closes, the combo resets to idle (wait) and the next press starts at hit1.
//
// Fidelity notes:
//  - The original gates re-entry with `isAttacking()` (you cannot start the next
//    hit until the current animation is effectively done) and each hit is a
//    stationary ground action. We reproduce that: a press mid-swing is BUFFERED,
//    not applied instantly, and horizontal move/jump are suppressed by the caller
//    while a combo is active.
//  - Airborne attacks: skills-input-index.md documents no normal air normal-attack
//    behaviour (only that some skills reject airborne release). So a combo can
//    only START on the ground. TODO-verify: recover the original air normal-attack
//    (if any) from BaseHero and lift this restriction.
//  - The post-swing grace window length is NOT documented numerically; GRACE_MS
//    is a chosen feel value. TODO-verify against the original cancel window.

export type ComboStage = 0 | 1 | 2 | 3 | 4 | 5

export interface ComboConfig {
  /** Animation duration (ms) of each stage; index 1..5, index 0 unused. */
  stageDurationsMs: number[]
  /** Grace window (ms) after a swing finishes during which a press still chains. */
  graceMs: number
  maxStage: ComboStage
}

export interface ComboState {
  stage: ComboStage
  /** Time elapsed within the current stage, in ms. */
  elapsedMs: number
  /** Whether an attack press has been queued during the current stage. */
  buffered: boolean
}

export interface ComboInput {
  attackPressed: boolean
  grounded: boolean
  dtMs: number
}

export interface ComboResult {
  /** Action key to display, e.g. 'hit3', or null when idle. */
  action: string | null
  /** True on the tick a new stage is entered (caller should (re)play the anim). */
  changed: boolean
  /** True while a combo occupies the character (suppress move/jump). */
  attacking: boolean
}

export function initCombo(): ComboState {
  return { stage: 0, elapsedMs: 0, buffered: false }
}

function actionFor(stage: ComboStage): string | null {
  return stage === 0 ? null : `hit${stage}`
}

/** Advance the combo by one tick. Mutates and returns a result descriptor. */
export function stepCombo(
  state: ComboState,
  input: ComboInput,
  cfg: ComboConfig,
): ComboResult {
  // Idle: a press on the ground starts hit1.
  if (state.stage === 0) {
    if (input.attackPressed && input.grounded) {
      state.stage = 1
      state.elapsedMs = 0
      state.buffered = false
      return { action: 'hit1', changed: true, attacking: true }
    }
    return { action: null, changed: false, attacking: false }
  }

  state.elapsedMs += input.dtMs
  const stageDur = cfg.stageDurationsMs[state.stage]

  // Queue a press made during the active swing.
  if (input.attackPressed && state.elapsedMs < stageDur) state.buffered = true

  // Still swinging: hold the current stage.
  if (state.elapsedMs < stageDur) {
    return { action: actionFor(state.stage), changed: false, attacking: true }
  }

  // Swing finished. A press buffered during the swing always chains; a fresh
  // press only chains while still inside the post-swing grace window.
  const inGrace = state.elapsedMs <= stageDur + cfg.graceMs
  const wantsNext = state.buffered || (input.attackPressed && inGrace)
  if (wantsNext && state.stage < cfg.maxStage) {
    state.stage = (state.stage + 1) as ComboStage
    state.elapsedMs = 0
    state.buffered = false
    return { action: actionFor(state.stage), changed: true, attacking: true }
  }

  // Grace window expired (or the final stage finished): reset to idle/wait.
  if (!inGrace || state.stage >= cfg.maxStage) {
    state.stage = 0
    state.elapsedMs = 0
    state.buffered = false
    return { action: null, changed: true, attacking: false }
  }

  // Inside the grace window, no press yet: hold the final swing frame.
  return { action: actionFor(state.stage), changed: false, attacking: true }
}
