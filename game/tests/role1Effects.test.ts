import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  ROLE1_EFFECTS,
  role1EffectForAction,
  role1EffectFrameUrl,
  type Role1EffectAction,
} from '../src/data/role1Effects'

describe('official Role1 effect mapping', () => {
  it('maps normal combo actions to the matching official bullet symbols', () => {
    expect(role1EffectForAction('hit1')?.sourceSymbol).toBe('Role1Bullet1')
    expect(role1EffectForAction('hit3')?.sourceSymbol).toBe('Role1Bullet3')
    expect(role1EffectForAction('hit4')?.sourceSymbol).toBe('Role1Bullet4')
    expect(role1EffectForAction('hit5')?.sourceSymbol).toBe('Role1Bullet5')
  })

  it('covers every implemented active-skill action with official animation frames', () => {
    for (const action of ['hit6', 'hit7', 'hit8', 'hit9', 'hit10', 'hit11_1', 'hit11_2', 'hit12', 'hit13', 'hit14']) {
      const effect = role1EffectForAction(action)
      expect(effect, action).toBeDefined()
      expect(effect?.frames, action).toBeGreaterThan(1)
    }
    expect(Object.keys(ROLE1_EFFECTS)).toHaveLength(14)
  })

  it('ships every mapped PNG frame in the public asset tree', () => {
    for (const [action, spec] of Object.entries(ROLE1_EFFECTS)) {
      for (let frame = 1; frame <= spec.frames; frame++) {
        const url = role1EffectFrameUrl(action as Role1EffectAction, frame)
        const file = new URL(`../public/${url}`, import.meta.url)
        expect(existsSync(file), url).toBe(true)
        expect(readFileSync(file).subarray(1, 4).toString('ascii'), url).toBe('PNG')
      }
    }
  })
})
