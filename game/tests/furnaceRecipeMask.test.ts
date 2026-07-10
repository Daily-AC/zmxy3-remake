import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('FurnaceRecipeView WebGL chat clipping', () => {
  it('uses the Phaser 4 mask filter instead of the Canvas-only setMask API', () => {
    const source = readFileSync(new URL('../src/ui/hud/FurnaceRecipeView.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/\.filters!?\.external\.addMask\(/)
    expect(source).not.toContain('.setMask(')
  })
})
