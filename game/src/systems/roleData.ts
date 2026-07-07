// Phaser-independent role sprite-sheet data model + action timing helpers.
//
// The animation timing model comes straight from the original game's
// `initBBDC()` (see docs/research/asset-pipeline-notes.md): each action row is
// a list of `stopCounts`, one per used cell, where a cell's on-screen duration
// is `stopCount * tickMs`. There is no single frameRate — durations are
// per-frame, so we compute explicit per-frame timings here and hand them to
// Phaser as `AnimationFrame.duration`.

export type Facing = 'left' | 'right'

export interface SheetSpec {
  cols: number
  rows: number
  cellW: number
  cellH: number
  facing: Facing
}

export interface ActionSpec {
  col: number
  row: number
  frames: number
  /** Original per-cell hold counts; `stopCounts[i] * tickMs` = frame duration. */
  stopCounts: number[]
  /** Original `setFrameCount` row value; kept for fidelity, not required here. */
  frameCount?: number | number[]
}

export interface RoleData {
  sheet: SheetSpec
  offset: { x: number; y: number }
  actions: Record<string, ActionSpec>
}

export interface FrameTiming {
  /** Flat frame index into the sheet: `row * cols + col`. */
  index: number
  durationMs: number
}

/** Flat sheet index of the first cell of an action. */
export function actionStartIndex(sheet: SheetSpec, action: ActionSpec): number {
  return action.row * sheet.cols + action.col
}

/** Flat sheet indices for every cell of an action, left to right. */
export function actionFrameIndices(sheet: SheetSpec, action: ActionSpec): number[] {
  const start = actionStartIndex(sheet, action)
  const out: number[] = []
  for (let i = 0; i < action.frames; i++) out.push(start + i)
  return out
}

/**
 * Per-frame timings for an action. Throws if `stopCounts` length does not match
 * the declared frame count — a data-integrity guard so a bad role JSON fails
 * loudly instead of silently mistiming animations.
 */
export function actionFrameTimings(
  sheet: SheetSpec,
  action: ActionSpec,
  tickMs: number,
): FrameTiming[] {
  if (action.stopCounts.length !== action.frames) {
    throw new Error(
      `stopCounts length ${action.stopCounts.length} != frames ${action.frames}`,
    )
  }
  const indices = actionFrameIndices(sheet, action)
  return indices.map((index, i) => ({
    index,
    durationMs: action.stopCounts[i] * tickMs,
  }))
}

/** Total on-screen duration of one pass of an action, in ms. */
export function actionDurationMs(action: ActionSpec, tickMs: number): number {
  return action.stopCounts.reduce((sum, c) => sum + c, 0) * tickMs
}
