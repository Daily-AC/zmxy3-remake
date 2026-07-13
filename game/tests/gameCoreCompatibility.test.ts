import { describe, expect, it } from 'vitest'
import { TICK_MS as legacyTick } from '../src/systems/tick'
import { TICK_MS as packageTick } from '@zaixu/game-core/tick'
import { makeHeroConfig as legacyConfig } from '../src/systems/heroSim'
import { makeHeroConfig as packageConfig } from '@zaixu/game-core/heroSim'

describe('game-core compatibility exports', () => {
  it('keeps existing client imports on the package implementation', () => {
    expect(legacyTick).toBe(packageTick)
    expect(legacyConfig).toBe(packageConfig)
  })
})
