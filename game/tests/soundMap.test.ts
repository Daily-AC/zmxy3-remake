import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  HERO_ACTION_SOUND,
  EVENT_SOUND,
  resolveHeroActionSound,
  resolveEventSound,
  SoundDef,
} from '../src/data/soundMap'

const AUDIO_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public/assets/audio',
)

function nonNullDefs(): SoundDef[] {
  return [...Object.values(HERO_ACTION_SOUND), ...Object.values(EVENT_SOUND)].filter(
    (d): d is SoundDef => d !== null,
  )
}

describe('soundMap (pure data: event/action -> audio asset)', () => {
  it('every non-null entry points to a file that actually exists on disk', () => {
    for (const def of nonNullDefs()) {
      const file = path.join(AUDIO_DIR, `${def.key}.mp3`)
      expect(existsSync(file), `missing audio file for key "${def.key}": ${file}`).toBe(true)
    }
  })

  it('volumes are within a sane 0..1 range', () => {
    for (const def of nonNullDefs()) {
      expect(def.volume).toBeGreaterThan(0)
      expect(def.volume).toBeLessThanOrEqual(1)
    }
  })

  it('only the level-1 bgm loops; one-shot sfx do not', () => {
    for (const [name, def] of Object.entries(EVENT_SOUND)) {
      if (def) expect(def.loop, `${name} loop flag`).toBe(name === 'bgm_level1')
    }
    for (const def of Object.values(HERO_ACTION_SOUND)) {
      if (def) expect(def.loop).toBe(false)
    }
  })

  it('resolveHeroActionSound / resolveEventSound return null for unknown keys, not throw', () => {
    expect(resolveHeroActionSound('nonexistent-action')).toBeNull()
    expect(resolveEventSound('nonexistent-event')).toBeNull()
  })

  it('documented gaps are explicit nulls, not missing keys (verified against Music.swf, not an oversight)', () => {
    for (const k of ['jump3', 'wait', 'wait2', 'walk', 'run']) {
      expect(HERO_ACTION_SOUND).toHaveProperty(k)
      expect(HERO_ACTION_SOUND[k]).toBeNull()
    }
    for (const k of ['levelup', 'respawn', 'ui_click']) {
      expect(EVENT_SOUND).toHaveProperty(k)
      expect(EVENT_SOUND[k]).toBeNull()
    }
  })
})
