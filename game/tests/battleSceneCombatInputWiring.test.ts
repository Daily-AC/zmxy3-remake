import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

describe('BattleScene combat input wiring', () => {
  it('blocks skill casts during an active air attack', () => {
    expect(source()).toMatch(
      /if \(this\.heroState\.combo\.stage !== 0 \|\| this\.heroState\.attacking\) return/,
    )
  })

  it('clears all hero input after a skill cast succeeds', () => {
    expect(source()).toMatch(/clearHeroInputForLock\(this\.heroState\)/)
  })

  it('queues the first swing sound until WebAudio finishes unlocking', () => {
    expect(source()).toMatch(
      /if \(this\.sound\.locked\) \{\s*this\.sound\.once\(Phaser\.Sound\.Events\.UNLOCKED, \(\) => this\.sound\.play\(key, \{ volume \}\)\)/,
    )
  })
})
