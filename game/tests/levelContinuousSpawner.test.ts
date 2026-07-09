import { describe, it, expect } from 'vitest'
import {
  createContinuousSpawnerState,
  updateContinuousSpawner,
  type ContinuousSpawnerSpec,
} from '../src/systems/level'
import { LEVEL1_MONSTER_STATS } from '../src/data/levels/level1'

function spec(): ContinuousSpawnerSpec {
  return {
    initialDelayMs: 3000,
    intervalMs: 6000,
    count: 2,
    roster: [{ species: 'monster30', stats: LEVEL1_MONSTER_STATS.monster30 }],
    offsetX: { min: -150, max: 150 },
    offsetY: { min: -300, max: -100 },
    heightTrigger: {
      thresholdY: -1900,
      boss: {
        species: 'monster3',
        stats: LEVEL1_MONSTER_STATS.monster3,
        label: '巫鹰',
        x: 750,
        y: -2050,
      },
    },
  }
}

function rng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('continuous spawner (StageListener11 Monster30 swarm)', () => {
  it('fires first wave at 3s, then every 6s, with 2 Monster30 at hero.x±150 and hero.y-[100,300]', () => {
    const state = createContinuousSpawnerState(spec())
    const random = rng([0, 1, 0.5, 0.25])

    expect(updateContinuousSpawner(state, { x: 1000, y: -400, alive: true }, 2999, random).spawns).toHaveLength(0)

    const first = updateContinuousSpawner(state, { x: 1000, y: -400, alive: true }, 1, random)
    expect(first.spawns.map((s) => s.species)).toEqual(['monster30', 'monster30'])
    expect(first.spawns[0]).toMatchObject({ x: 850, y: -500 })
    expect(first.spawns[1]).toMatchObject({ x: 1000, y: -650 })

    expect(updateContinuousSpawner(state, { x: 1000, y: -400, alive: true }, 5999, random).spawns).toHaveLength(0)
    expect(updateContinuousSpawner(state, { x: 1000, y: -400, alive: true }, 1, random).spawns).toHaveLength(2)
  })

  it('height trigger spawns 巫鹰 at (750,-2050) exactly once', () => {
    const state = createContinuousSpawnerState(spec())

    const first = updateContinuousSpawner(state, { x: 700, y: -1900, alive: true }, 0, () => 0.5)
    expect(first.bossSpawn).toMatchObject({ species: 'monster3', x: 750, y: -2050 })

    const second = updateContinuousSpawner(state, { x: 700, y: -1950, alive: true }, 16, () => 0.5)
    expect(second.bossSpawn).toBeNull()
  })

  it('keeps firing Monster30 waves after the boss has been triggered and is active', () => {
    const state = createContinuousSpawnerState(spec())
    updateContinuousSpawner(state, { x: 700, y: -1900, alive: true }, 0, () => 0.5)

    const afterBoss = updateContinuousSpawner(state, { x: 700, y: -1950, alive: true }, 3000, () => 0.5)
    expect(afterBoss.bossSpawn).toBeNull()
    expect(afterBoss.spawns.map((s) => s.species)).toEqual(['monster30', 'monster30'])
  })
})
