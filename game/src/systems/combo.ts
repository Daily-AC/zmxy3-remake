// Phaser-independent five-hit ground combo state machine.
//
// Sequence: hit1 -> hit2 -> hit3 -> hit4 (upward launch) -> hit5 (slam).
// A press DURING an active swing does nothing; only a FRESH press landing
// after the swing's animation has fully finished (and within the post-swing
// grace window) chains to the next stage. If no press lands before the
// window closes, the combo resets to idle (wait) and the next press starts
// a new chain at hit1.
//
// Fidelity notes (hitstun-triad pen, 2026-07-09 -- corrected from this
// module's earlier "buffered mid-swing press" design, which was NOT sourced
// from AS3 and directly caused the reported "无限眩晕/无脑通关" exploit):
//  - Decompiled `export.hero.Role1.myKeyDown()` (打开我开始玩.swf): the
//    attack-key case REJECTS the press outright while
//    `isAttacking() || isBeAttacking()` is true --
//    `if (isAttacking()||isBeAttacking()) { return; } this.normalHit(); ...`
//    -- there is no buffering/queuing at all in the original; a press mid-swing
//    is simply lost, exactly like a press during hurt/dead is lost. The
//    player must physically press the attack key AGAIN once the current
//    swing's animation has ended for the next stage to start.
//  - `Role1.normalHit()`'s own chain-continuation window: `hitNum` resets to
//    1 if `curtime - lasttime > 25*60` (i.e. more than 1500ms since the last
//    hit landed), otherwise `hitNum++` continues the chain. That 1500ms is
//    the real AS3 value for `graceMs` below (was a placeholder 220ms before
//    this pen, this module's own header used to flag it "chosen feel value,
//    TODO-verify" -- now verified).
//  - Net effect of the fix: chaining the full 5-hit combo now requires the
//    player to land FIVE SEPARATE key-down edges (repeated taps, not a hold
//    or a mid-swing mash), each within 1500ms of the previous hit landing --
//    matching the original's actual input model and giving every monster's
//    hurtDurationMs (500ms, uniform across L1/L2 species) a real chance to
//    expire between hits in ordinary play, instead of being trivially
//    re-triggered by a held/rapid-buffered attack button.
//  - Each hit is still a stationary ground action; horizontal move/jump are
//    suppressed by the caller while a combo is active (unchanged).
//  - Airborne attacks: skills-input-index.md documents no normal air normal-attack
//    behaviour (only that some skills reject airborne release). So a combo can
//    only START on the ground. TODO-verify: recover the original air normal-attack
//    (if any) from BaseHero and lift this restriction.

export type ComboStage = 0 | 1 | 2 | 3 | 4 | 5

export interface ComboConfig {
  /** Animation duration (ms) of each stage; index 1..5, index 0 unused. */
  stageDurationsMs: number[]
  /** Grace window (ms) after a swing finishes during which a FRESH press still
   * chains (real AS3 value: 1500ms, `Role1.normalHit()`'s `25*60` hitNum-reset
   * threshold -- see file header). */
  graceMs: number
  maxStage: ComboStage
}

export interface ComboState {
  stage: ComboStage
  /** Time elapsed within the current stage, in ms. */
  elapsedMs: number
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
  return { stage: 0, elapsedMs: 0 }
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
      return { action: 'hit1', changed: true, attacking: true }
    }
    return { action: null, changed: false, attacking: false }
  }

  state.elapsedMs += input.dtMs
  const stageDur = cfg.stageDurationsMs[state.stage]

  // Still swinging: hold the current stage. A press landing here is simply
  // lost -- Role1.as's myKeyDown() rejects the attack key outright while
  // isAttacking() is true (`return` before even reaching normalHit()); there
  // is no buffer/queue concept in the original (see file header).
  if (state.elapsedMs < stageDur) {
    return { action: actionFor(state.stage), changed: false, attacking: true }
  }

  // Swing finished. Only a FRESH press landing inside the post-swing grace
  // window chains to the next stage (Role1.normalHit()'s hitNum-continuation
  // window, see file header).
  const inGrace = state.elapsedMs <= stageDur + cfg.graceMs
  if (input.attackPressed && inGrace && state.stage < cfg.maxStage) {
    state.stage = (state.stage + 1) as ComboStage
    state.elapsedMs = 0
    return { action: actionFor(state.stage), changed: true, attacking: true }
  }

  // Grace window expired (or the final stage finished): reset to idle/wait.
  if (!inGrace || state.stage >= cfg.maxStage) {
    state.stage = 0
    state.elapsedMs = 0
    return { action: null, changed: true, attacking: false }
  }

  // Inside the grace window, no fresh press yet: the swing itself is over,
  // so the hero is free to move/jump/idle right away (mirrors isAttacking()
  // flipping false the instant the animation ends in the original) -- only
  // `state.stage` is kept alive in the background as chain memory, waiting
  // to see whether a fresh press arrives before the window closes.
  return { action: null, changed: false, attacking: false }
}
