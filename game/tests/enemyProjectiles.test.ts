import { describe, expect, it } from 'vitest'
import {
  spawnEnemyProjectile,
  stepEnemyProjectiles,
  stepEnemyProjectilesAgainstTargets,
} from '../src/systems/enemyProjectiles'

describe('enemyProjectiles: Monster30Bullet1-style enemy projectile hitbox', () => {
  it('flies toward the target and emits one real hero hit when its segment reaches the hero', () => {
    const projectile = spawnEnemyProjectile({
      id: 1,
      kind: 'Monster30Bullet1',
      sourceId: 'monster30',
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

    const before = stepEnemyProjectiles([projectile], { x: 100, y: 0, alive: true }, 50)
    expect(before.hits).toEqual([])
    expect(before.remaining[0].x).toBeCloseTo(50)

    const hit = stepEnemyProjectiles(before.remaining, { x: 100, y: 0, alive: true }, 60)
    expect(hit.hits).toEqual([{
      kind: 'Monster30Bullet1',
      sourceId: 'monster30',
      attackId: 7,
      x: 110,
      y: 0,
      damage: 5,
      attackKind: 'physics',
    }])
    expect(hit.remaining).toEqual([])
  })

  it('expires without a hit after ttlMs', () => {
    const projectile = spawnEnemyProjectile({
      id: 1,
      kind: 'Monster30Bullet1',
      sourceId: 'monster30',
      attackId: 7,
      x: 0,
      y: 0,
      targetX: 100,
      targetY: 0,
      facing: 1,
      speedPxPerSecond: 100,
      radius: 12,
      ttlMs: 100,
      damage: 5,
      attackKind: 'physics',
    })

    const state = stepEnemyProjectiles([projectile], { x: 999, y: 0, alive: true }, 100)

    expect(state.hits).toEqual([])
    expect(state.remaining).toEqual([])
  })

  it('reports which live local or remote hero a host-authoritative projectile hit', () => {
    const projectile = spawnEnemyProjectile({
      id: 2,
      kind: 'Monster30Bullet1',
      sourceId: 'monster30-2',
      attackId: 9,
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

    const result = stepEnemyProjectilesAgainstTargets(
      [projectile],
      [
        { targetId: 'u-host', x: 999, y: 0, alive: true },
        { targetId: 'u-peer', x: 100, y: 0, alive: true },
      ],
      110,
    )

    expect(result.hits).toEqual([expect.objectContaining({ targetId: 'u-peer', attackId: 9 })])
    expect(result.remaining).toEqual([])
  })
})
