import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Input: { Keyboard: { KeyCodes: { A: 65, D: 68, J: 74, K: 75 } } },
  },
}))

describe('BattleScene visual fidelity helpers', () => {
  it('places bg11 in original scene coordinates including BaseGameSence x=-20', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      computeBg11ClimbPlacement?: () => { x: number; y: number; scrollFactorX: number; scrollFactorY: number }
    }

    expect(mod.computeBg11ClimbPlacement).toBeTypeOf('function')
    const placement = mod.computeBg11ClimbPlacement!()

    expect(placement).toEqual({
      x: -79,
      y: -2370,
      scrollFactorX: 1,
      scrollFactorY: 1,
    })
  })

  it('marks mid-cloud climb platforms as adapted low-opacity ink-wash placeholders', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      level1PlatformDebugStyle?: (wall: { type: string; y: number }) => {
        adaptedCloudPlaceholder: boolean
        fillAlpha: number
      }
    }

    expect(mod.level1PlatformDebugStyle).toBeTypeOf('function')
    const cloud = mod.level1PlatformDebugStyle!({ type: 'through', y: -927.1 })
    const ground = mod.level1PlatformDebugStyle!({ type: 'through', y: 321.95 })

    expect(cloud.adaptedCloudPlaceholder).toBe(true)
    expect(cloud.fillAlpha).toBeGreaterThan(0)
    expect(cloud.fillAlpha).toBeLessThanOrEqual(0.16)
    expect(ground.adaptedCloudPlaceholder).toBe(false)
    expect(ground.fillAlpha).toBe(0)
  })

  it('extends climb camera bottom so grounded WuKong is fully visible with ground beneath', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      computeLevel1ClimbCameraBounds?: () => { left: number; top: number; right: number; bottom: number }
    }

    expect(mod.computeLevel1ClimbCameraBounds).toBeTypeOf('function')
    const bounds = mod.computeLevel1ClimbCameraBounds!()
    const viewportH = 540
    const heroBottom = 400 + -15 * 1.5 + (200 / 2) * 1.5
    const scrollYAtGround = bounds.bottom - viewportH

    expect(bounds.bottom).toBeCloseTo(heroBottom + 32)
    expect(heroBottom - scrollYAtGround).toBeLessThanOrEqual(viewportH - 32)
  })

  it('renders item drops as larger transparent icons with rarity-colored names only', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      dropItemVisualSpec?: (rarity: number) => {
        iconMaxSize: number
        backgroundAlpha: number
        rarityRing: boolean
        nearbyFrame: boolean
        nameColor: string
      }
    }

    expect(mod.dropItemVisualSpec).toBeTypeOf('function')
    const spec = mod.dropItemVisualSpec!(3)

    expect(spec.iconMaxSize).toBeGreaterThanOrEqual(39)
    expect(spec.iconMaxSize).toBeLessThanOrEqual(52)
    expect(spec.backgroundAlpha).toBe(0)
    expect(spec.rarityRing).toBe(false)
    expect(spec.nearbyFrame).toBe(false)
    expect(spec.nameColor.toLowerCase()).toBe('#d9a441')
  })
})
