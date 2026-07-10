import { describe, expect, it } from 'vitest'
import { LEVEL_1_SL12, LEVEL_2_TIANGONGDAO } from '../src/data/levels/level1'

describe('official sl12 Tian Gong Dao scene contract', () => {
  it('preserves every StopPoint registration and the terminal boss marker', () => {
    expect(LEVEL_1_SL12.stopPoints.map(({ stopX, stopY, betweenRandL, isBoss }) => ({
      stopX,
      stopY,
      betweenRandL,
      isBoss,
    }))).toEqual([
      { stopX: 1147.4, stopY: 215.25, betweenRandL: 1150, isBoss: false },
      { stopX: 1809.7, stopY: 208.55, betweenRandL: 1150, isBoss: false },
      { stopX: 2813.95, stopY: 189.35, betweenRandL: 1150, isBoss: false },
      { stopX: 3790.2, stopY: 258.35, betweenRandL: 1150, isBoss: false },
      { stopX: 4661.55, stopY: 240.7, betweenRandL: 1150, isBoss: true },
    ])
  })

  it('preserves the source display-list order and 2D coordinates of all MonsterAppearPoints', () => {
    const points = LEVEL_1_SL12.stopPoints.flatMap((stop) => stop.roster)
    expect(points.map(({ species, x, y, delayMs, intervalMs, quantity }) => ({
      species,
      x,
      y,
      delayMs,
      intervalMs,
      quantity,
    }))).toEqual([
      { species: 'monster8', x: 347.6, y: 328.85, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster8', x: 967.55, y: 323.2, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster7', x: 1266.7, y: 328.85, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster8', x: 1521.4, y: 396, delayMs: 2000, intervalMs: 1000, quantity: 5 },
      { species: 'monster7', x: 1783.5, y: 333, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster7', x: 1948.8, y: 343.2, delayMs: 2000, intervalMs: 1000, quantity: 6 },
      { species: 'monster7', x: 2661.45, y: 343.2, delayMs: 2000, intervalMs: 1000, quantity: 6 },
      { species: 'monster7', x: 2945.25, y: 387.2, delayMs: 2000, intervalMs: 1000, quantity: 3 },
      { species: 'monster8', x: 2888.95, y: 387.2, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster7', x: 3559.3, y: 388, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster8', x: 3635.4, y: 388, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster4', x: 4009.8, y: 343.2, delayMs: 2000, intervalMs: 1000, quantity: 1 },
      { species: 'monster2', x: 4606.85, y: 351.2, delayMs: 2000, intervalMs: 1000, quantity: 1 },
    ])
  })

  it('keeps Qianliyan and Shunfenger together as the final official boss wave', () => {
    const finalStop = LEVEL_1_SL12.stopPoints.at(-1)
    expect(finalStop?.isBoss).toBe(true)
    expect(finalStop?.roster.map((point) => point.species)).toEqual(['monster4', 'monster2'])
    expect(finalStop?.roster.map((point) => point.delayMs)).toEqual([2000, 2000])
  })

  it('preserves all four collision boundaries and the mined transfer door', () => {
    const stage = LEVEL_2_TIANGONGDAO.subStages[0]
    expect(stage.fallbackWalls).toEqual([
      { type: 'solid', x: -180.629, y: 501.05, width: 5199.959, height: 20 },
      { type: 'solid', x: 4859.875, y: -411, width: 115.349, height: 999.999 },
      { type: 'solid', x: -195.997, y: -138.582, width: 23.295, height: 699.965, rotation: 90 },
      { type: 'throughDownButUp', x: -184.66, y: -138.5, width: 5200.019, height: 20 },
    ])
    expect(stage.door).toEqual({ x: 4520.9, y: 341.65, width: 185.8, height: 165 })
  })

  it('records the official five-hit fbEnter mechanism in its real scene space', () => {
    const stage = LEVEL_2_TIANGONGDAO.subStages[0]
    expect(stage.fbEntrance).toEqual({
      registration: { x: 1760, y: 334.65 },
      collision: { x: 2073.55, y: 398.6, width: 49, height: 64 },
      requiredHits: 5,
      hitCooldownFrames: 24,
      stayFrames: 72,
      animationFrames: 30,
    })
  })
})
