import { describe, expect, it } from 'vitest'
import {
  TICK_MS as INDEX_TICK_MS,
  TICK_RATE as INDEX_TICK_RATE,
} from '@zaixu/game-core'
import {
  TICK_MS as SUBPATH_TICK_MS,
  TICK_RATE as SUBPATH_TICK_RATE,
} from '@zaixu/game-core/tick'

describe('game-core package boundary', () => {
  it('exposes the canonical fixed tick through both public entry points', () => {
    expect(INDEX_TICK_RATE).toBe(30)
    expect(INDEX_TICK_MS).toBeCloseTo(1000 / 30)
    expect(SUBPATH_TICK_RATE).toBe(INDEX_TICK_RATE)
    expect(SUBPATH_TICK_MS).toBe(INDEX_TICK_MS)
    expect('document' in globalThis).toBe(false)
  })
})
