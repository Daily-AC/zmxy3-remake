import { describe, expect, it } from 'vitest'
import { spawnBattleProjectile, stepBattleProjectiles } from '../../src/battle/projectile'

describe('battle projectiles', () => {
  it('uses swept collision and reports one hit', () => {
    const projectile = spawnBattleProjectile({
      id: 'p-1',
      kind: 'Monster30Bullet1',
      sourceId: 'monster-1',
      attackId: 7,
      x: 0,
      y: 0,
      targetX: 100,
      targetY: 0,
      facing: 1,
      speedPxPerSecond: 1000,
      radius: 12,
      ttlMs: 1000,
      damage: 5,
      attackKind: 'physics',
    })

    const before = stepBattleProjectiles([projectile], { x: 100, y: 0, alive: true }, 50)
    expect(before.hits).toEqual([])
    const hit = stepBattleProjectiles(before.remaining, { x: 100, y: 0, alive: true }, 60)
    expect(hit.hits).toEqual([expect.objectContaining({ id: 'p-1', sourceId: 'monster-1', attackId: 7 })])
    expect(hit.remaining).toEqual([])
  })

  it('expires without hitting a dead or distant hero', () => {
    const projectile = spawnBattleProjectile({
      id: 'p-1', kind: 'test', sourceId: 'monster-1', attackId: 1,
      x: 0, y: 0, targetX: 100, targetY: 0, facing: 1,
      speedPxPerSecond: 100, radius: 10, ttlMs: 100, damage: 5, attackKind: 'physics',
    })
    expect(stepBattleProjectiles([projectile], { x: 10, y: 0, alive: false }, 100)).toEqual({
      remaining: [],
      hits: [],
      removedIds: ['p-1'],
    })
  })
})
