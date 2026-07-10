import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

describe('BattleScene combat input wiring', () => {
  it('blocks skill casts during an active air attack', () => {
    expect(source()).toMatch(
      /if \(this\.heroState\.combo\.stage !== 0 \|\| this\.heroState\.attacking\) return/,
    )
  })

  it('clears pending attack and jump edges only after a skill cast succeeds', () => {
    expect(source()).toMatch(
      /if \(!result\.ok\) \{[\s\S]*?return\s+\}\s+this\.heroState\.pendingEdges\.pressAttack = false\s+this\.heroState\.pendingEdges\.pressJump = false/,
    )
  })
})
