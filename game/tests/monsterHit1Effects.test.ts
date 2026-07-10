import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  MONSTER_HIT1_EFFECTS,
  monsterHit1EffectFrameUrl,
  type MonsterHit1EffectPhase,
} from '../src/data/monsterHit1Effects'

interface ManifestEntry {
  monsterId: string
  symbolId: number
  kind: 'visual' | 'hitbox-only'
  timelineFrames: number
  shippedFrames: number
  visibleFrames: number
  fps: number
  canvasPx: { width: number; height: number }
  pivotPx: { x: number; y: number }
  assetPath: string | null
}

const MANIFEST = JSON.parse(
  readFileSync(
    new URL('../public/assets/extracted/level1/hit1-effects/manifest.json', import.meta.url),
    'utf-8',
  ),
) as { effects: Record<string, ManifestEntry> }

describe('official L1/L2 monster hit1 effects', () => {
  it('covers every active monster and preserves both Monster2 hit1 phases', () => {
    expect(Object.keys(MONSTER_HIT1_EFFECTS)).toEqual([
      'Monster30',
      'Monster8',
      'Monster7',
      'Monster4',
      'Monster3',
      'Monster2',
    ])
    expect(MONSTER_HIT1_EFFECTS.Monster2).toHaveLength(2)
  })

  it('records Monster8 and Monster7 as official invisible hitboxes', () => {
    for (const monsterId of ['Monster8', 'Monster7'] as const) {
      const [effect] = MONSTER_HIT1_EFFECTS[monsterId]
      expect(effect.kind).toBe('hitbox-only')
      expect(effect.shippedFrames).toBe(0)
      expect(effect.visibleFrames).toBe(0)
      expect(monsterHit1EffectFrameUrl(effect, 1)).toBeUndefined()
    }
  })

  it('keeps the runtime manifest aligned with the extracted asset manifest', () => {
    const phases = Object.values(MONSTER_HIT1_EFFECTS).flat() as MonsterHit1EffectPhase[]
    expect(phases).toHaveLength(7)

    for (const phase of phases) {
      expect(MANIFEST.effects[phase.sourceSymbol], phase.sourceSymbol).toMatchObject(phase)
    }
  })

  it('ships every declared visual frame as a PNG', () => {
    for (const phases of Object.values(MONSTER_HIT1_EFFECTS)) {
      for (const phase of phases) {
        for (let frame = 1; frame <= phase.shippedFrames; frame++) {
          const url = monsterHit1EffectFrameUrl(phase, frame)
          expect(url, `${phase.sourceSymbol} frame ${frame}`).toBeDefined()
          const file = new URL(`../public/${url}`, import.meta.url)
          expect(existsSync(file), url).toBe(true)
          expect(readFileSync(file).subarray(1, 4).toString('ascii'), url).toBe('PNG')
        }
      }
    }
  })
})
