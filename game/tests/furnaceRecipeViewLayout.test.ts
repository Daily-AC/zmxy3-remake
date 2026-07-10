import { describe, expect, it } from 'vitest'
import { laojunHeaderLayout } from '../src/ui/hud/furnaceRecipeLayout'

describe('Laojun chat drawer header layout', () => {
  it('centers the portrait and puts the name directly above it without entering the chat viewport', () => {
    const layout = laojunHeaderLayout()
    expect(layout.nameX).toBe(layout.portraitX)
    expect(layout.nameY).toBeLessThan(layout.portraitY - layout.portraitSize / 2)
    expect(layout.portraitY + layout.portraitSize / 2).toBeLessThan(layout.chatViewportY)
    expect(layout.portraitX).toBe(720)
  })
})
