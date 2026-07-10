import { describe, expect, it } from 'vitest'
import type { MonsterSpawnSpec } from '../src/systems/level'
import {
  advanceWaveSpawnQueue,
  createWaveSpawnQueue,
  waveMonsterCapacity,
} from '../src/systems/waveSpawnQueue'

const point: MonsterSpawnSpec = {
  species: 'monster8',
  stats: { hp: 80, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.3, def: 2 },
  x: 347.6,
  delayMs: 2000,
  intervalMs: 1000,
  quantity: 4,
}

describe('MonsterAppearPoint runtime queue', () => {
  it('spawns the first monster after delay plus one interval', () => {
    const queue = createWaveSpawnQueue([point])

    expect(advanceWaveSpawnQueue(queue, 2999, 6)).toEqual([])
    expect(advanceWaveSpawnQueue(queue, 1, 6).map((spawn) => spawn.species)).toEqual(['monster8'])
  })

  it('holds due monsters while the live cap is full, then drains only available slots', () => {
    const queue = createWaveSpawnQueue([{ ...point, delayMs: 0, intervalMs: 0, quantity: 10 }])

    expect(advanceWaveSpawnQueue(queue, 0, 0)).toEqual([])
    expect(queue).toHaveLength(10)
    expect(advanceWaveSpawnQueue(queue, 0, 2)).toHaveLength(2)
    expect(queue).toHaveLength(8)
    expect(advanceWaveSpawnQueue(queue, 0, 1)).toHaveLength(1)
    expect(queue).toHaveLength(7)
  })

  it('uses six live monsters solo and eight in coop', () => {
    expect(waveMonsterCapacity(false)).toBe(6)
    expect(waveMonsterCapacity(true)).toBe(8)
  })
})
