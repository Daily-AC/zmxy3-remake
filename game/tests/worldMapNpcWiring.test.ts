import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('WorldMap bounded NPC gifts', () => {
  it('handles give_item through the bounded canonical gift resolver', () => {
    const source = readFileSync(new URL('../src/scenes/WorldMapScene.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/m\.type === 'give_item'/)
    expect(source).toMatch(/resolveLaojunGift\(m\.item\.id, this\.laojunGiftAttempted/)
    expect(source).toMatch(/addItem\(this\.loaded\.inventory, result\.item, 1\)/)
    expect(source).toMatch(/this\.persistSlot\(\)/)
  })

  it('rejects model-supplied recipes outside the one implemented live recipe', () => {
    const source = readFileSync(new URL('../src/scenes/WorldMapScene.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/const LIVE_RECIPE_ID = 'starter_whg'/)
    expect(source).toMatch(/if \(bookFillName !== LIVE_RECIPE_ID\)/)
  })
})
