import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('BattleScene pickup wiring', () => {
  it('passes heroVisualCenter().y to stepDrops instead of the flat GROUND_Y constant', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(
      /const heroCenter = this\.heroVisualCenter\(\)\s+const \{ remaining, picked \} = stepDrops\(this\.drops, this\.heroState\.x, heroCenter\.y, this\.pickupCfg\)/,
    )
  })
})
