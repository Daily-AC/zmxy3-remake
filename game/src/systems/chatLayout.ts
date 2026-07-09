// Pure layout math for a vertically-stacked, scrollable chat log (the 太上老君
// chat drawer in FurnaceRecipeView.ts). Kept Phaser-free so it's unit
// testable: the view measures each message's rendered height (font metrics
// depend on the real canvas/Phaser Text object, which this module never
// touches) and hands the resulting heights in here for the stacking/scroll
// arithmetic.

export interface ChatStackResult {
  /** Content-space y (0 = top of the oldest message) for each input height, same order/length as the input array. */
  tops: number[]
  /** Total stacked height, oldest-top to newest-bottom, including inter-item gaps but not a trailing gap. */
  contentHeight: number
}

/** Stacks message heights top-to-bottom with a fixed gap between items (oldest first). */
export function stackChatLayout(heights: number[], gap: number): ChatStackResult {
  const tops: number[] = []
  let y = 0
  for (const h of heights) {
    tops.push(y)
    y += h + gap
  }
  return { tops, contentHeight: heights.length ? y - gap : 0 }
}

/** How far the viewport can scroll down before its bottom edge passes the content's bottom edge. 0 when content fits without scrolling. */
export function maxChatScroll(contentHeight: number, viewportHeight: number): number {
  return Math.max(0, contentHeight - viewportHeight)
}

/** Clamps a scroll offset into [0, maxChatScroll(...)] -- also collapses to 0 when content fits (nothing to scroll). Accepts +/-Infinity so callers can request "snap to bottom" / "snap to top" without computing the max themselves. */
export function clampChatScroll(offset: number, contentHeight: number, viewportHeight: number): number {
  const max = maxChatScroll(contentHeight, viewportHeight)
  if (max <= 0) return 0
  if (offset < 0) return 0
  return Math.min(max, offset)
}
