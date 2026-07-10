import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  ROLE1_EFFECTS,
  role1EffectForAction,
  role1EffectFrameUrl,
  type Role1EffectAction,
} from '../src/data/role1Effects'

interface Role1EffectManifestEntry {
  sourceSymbol: string
  frames: number
  fps: number
  scale: number
  pivotPx: { x: number; y: number }
  anchor: string
  offset: { forward: number; y: number }
  followAnchor: boolean
}

const ROLE1_EFFECT_MANIFEST = JSON.parse(
  readFileSync(new URL('../public/assets/extracted/role1-effects/manifest.json', import.meta.url), 'utf-8'),
) as Record<string, Role1EffectManifestEntry>

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

  it('records the Role1.as hero-local spawn offsets for the mapped attacks', () => {
    const expectedAttachments = {
      hit1: { anchor: 'hero', offset: { forward: 120, y: 5 }, followAnchor: true },
      hit3: { anchor: 'hero', offset: { forward: 30, y: -110 }, followAnchor: true },
      hit4: { anchor: 'hero', offset: { forward: 160, y: -10 }, followAnchor: true },
      hit5: { anchor: 'hero', offset: { forward: 165, y: -20 }, followAnchor: true },
      hit6: { anchor: 'hero', offset: { forward: 30, y: 40 }, followAnchor: true },
      hit7: { anchor: 'hero', offset: { forward: 175, y: -30 }, followAnchor: true },
      hit8: { anchor: 'hero', offset: { forward: -20, y: 30 }, followAnchor: true },
      hit9: { anchor: 'hero', offset: { forward: 120, y: -50 }, followAnchor: true },
      hit10: { anchor: 'hero', offset: { forward: 150, y: -35 }, followAnchor: false },
      hit11_1: { anchor: 'hero', offset: { forward: 50, y: -50 }, followAnchor: true },
      hit11_2: { anchor: 'hero', offset: { forward: 0, y: -50 }, followAnchor: true },
      hit12: { anchor: 'target', offset: { forward: 0, y: 0 }, followAnchor: false },
      hit13: { anchor: 'target', offset: { forward: 0, y: 0 }, followAnchor: false },
      hit14: { anchor: 'hero', offset: { forward: -15, y: -85 }, followAnchor: false },
    } as const

    for (const [action, attachment] of Object.entries(expectedAttachments)) {
      expect(role1EffectForAction(action), action).toMatchObject(attachment)
    }
  })

  it('defines a source attachment contract for every mapped effect', () => {
    for (const [action, effect] of Object.entries(ROLE1_EFFECTS)) {
      expect(['hero', 'target', 'world'], `${action} anchor`).toContain(effect.anchor)
      expect(effect.pivotPx.x, `${action} pivot x`).toBeTypeOf('number')
      expect(effect.pivotPx.y, `${action} pivot y`).toBeTypeOf('number')
      expect(effect.scale, `${action} scale`).toBe(1)
      expect(effect.followAnchor, `${action} follow anchor`).toBeTypeOf('boolean')
    }
  })

  it('keeps every runtime effect field aligned with the tracked manifest', () => {
    expect(Object.keys(ROLE1_EFFECTS)).toEqual(Object.keys(ROLE1_EFFECT_MANIFEST))

    for (const [action, effect] of Object.entries(ROLE1_EFFECTS)) {
      const manifestEffect = ROLE1_EFFECT_MANIFEST[action]
      expect({
        sourceSymbol: effect.sourceSymbol,
        frames: effect.frames,
        fps: effect.fps,
        scale: effect.scale,
        pivotPx: effect.pivotPx,
        anchor: effect.anchor,
        offset: effect.offset,
        followAnchor: effect.followAnchor,
      }, action).toEqual({
        sourceSymbol: manifestEffect.sourceSymbol,
        frames: manifestEffect.frames,
        fps: manifestEffect.fps,
        scale: manifestEffect.scale,
        pivotPx: manifestEffect.pivotPx,
        anchor: manifestEffect.anchor,
        offset: manifestEffect.offset,
        followAnchor: manifestEffect.followAnchor,
      })
    }
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
