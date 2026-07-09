import { describe, expect, it } from 'vitest'
import { clampChatScroll, maxChatScroll, stackChatLayout } from '../src/systems/chatLayout'

describe('stackChatLayout', () => {
  it('stacks heights top-to-bottom with a fixed gap and no trailing gap', () => {
    expect(stackChatLayout([20, 30, 10], 5)).toEqual({
      tops: [0, 25, 60],
      contentHeight: 70, // 20 + 5 + 30 + 5 + 10
    })
  })

  it('returns zero content height for an empty message list', () => {
    expect(stackChatLayout([], 5)).toEqual({ tops: [], contentHeight: 0 })
  })

  it('has no gap after a single item', () => {
    expect(stackChatLayout([42], 8)).toEqual({ tops: [0], contentHeight: 42 })
  })
})

describe('maxChatScroll', () => {
  it('is zero when content fits inside the viewport', () => {
    expect(maxChatScroll(100, 250)).toBe(0)
    expect(maxChatScroll(250, 250)).toBe(0)
  })

  it('is the overflow amount when content exceeds the viewport', () => {
    expect(maxChatScroll(400, 250)).toBe(150)
  })
})

describe('clampChatScroll', () => {
  it('clamps into [0, max] for in-range content', () => {
    expect(clampChatScroll(-40, 400, 250)).toBe(0)
    expect(clampChatScroll(999, 400, 250)).toBe(150)
    expect(clampChatScroll(80, 400, 250)).toBe(80)
  })

  it('collapses to 0 when content fits, regardless of the requested offset', () => {
    expect(clampChatScroll(999, 100, 250)).toBe(0)
    expect(clampChatScroll(-999, 100, 250)).toBe(0)
  })

  it('accepts +/-Infinity as "snap to bottom" / "snap to top" without the caller computing the max', () => {
    expect(clampChatScroll(Number.POSITIVE_INFINITY, 400, 250)).toBe(150)
    expect(clampChatScroll(Number.NEGATIVE_INFINITY, 400, 250)).toBe(0)
  })
})
