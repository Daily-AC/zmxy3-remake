import { describe, it, expect } from 'vitest'
import {
  RoleData,
  ActionSpec,
  actionStartIndex,
  actionFrameIndices,
  actionFrameTimings,
  actionDurationMs,
} from '../src/systems/roleData'
import { TICK_MS } from '../src/systems/tick'
import roleRaw from '../src/data/roles/role1.json'

const roleData = roleRaw as unknown as RoleData

describe('roleData action timing (动作计时器)', () => {
  it('flat frame index is row*cols + col', () => {
    // hit1 lives on row 6, col 0, sheet 6 cols -> index 36.
    expect(actionStartIndex(roleData.sheet, roleData.actions.hit1 as ActionSpec)).toBe(36)
    // hit5 row 9 col 0 -> 54.
    expect(actionStartIndex(roleData.sheet, roleData.actions.hit5 as ActionSpec)).toBe(54)
  })

  it('produces contiguous frame indices for a multi-frame action', () => {
    expect(actionFrameIndices(roleData.sheet, roleData.actions.wait as ActionSpec)).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
  })

  it('per-frame duration equals stopCount * tickMs', () => {
    const timings = actionFrameTimings(roleData.sheet, roleData.actions.wait as ActionSpec, TICK_MS)
    // wait stopCounts [2,2,2,3,2,4] at 30fps.
    expect(timings.map((t) => Math.round(t.durationMs))).toEqual([67, 67, 67, 100, 67, 133])
  })

  it('total action duration is sum(stopCounts) * tickMs', () => {
    // hit1 stopCounts [2,2,1,1,3] = 9 ticks -> 300ms at 30fps.
    expect(Math.round(actionDurationMs(roleData.actions.hit1 as ActionSpec, TICK_MS))).toBe(300)
    // Official 4399 Role1: hit4/hit5 are both 16 ticks, not the shorter
    // 再续天庭 variants previously mixed into this data file.
    expect((roleData.actions.hit4 as ActionSpec).stopCounts).toEqual([1, 1, 1, 1, 12])
    expect((roleData.actions.hit5 as ActionSpec).stopCounts).toEqual([2, 2, 1, 1, 10])
    expect(Math.round(actionDurationMs(roleData.actions.hit4 as ActionSpec, TICK_MS))).toBe(533)
    expect(Math.round(actionDurationMs(roleData.actions.hit5 as ActionSpec, TICK_MS))).toBe(533)
  })

  it('throws when stopCounts length disagrees with frame count', () => {
    const bad: ActionSpec = { col: 0, row: 0, frames: 3, stopCounts: [1, 2] }
    expect(() => actionFrameTimings(roleData.sheet, bad, TICK_MS)).toThrow()
  })
})
