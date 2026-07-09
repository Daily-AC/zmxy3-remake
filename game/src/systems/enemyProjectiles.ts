import type { AttackKind } from './heroScale'

export interface EnemyProjectile {
  id: number
  kind: string
  sourceId: string
  attackId: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  ttlMs: number
  ageMs: number
  damage: number
  attackKind: AttackKind
}

export interface EnemyProjectileSpawn {
  id: number
  kind: string
  sourceId: string
  attackId: number
  x: number
  y: number
  targetX: number
  targetY: number
  facing: -1 | 1
  speedPxPerSecond: number
  radius: number
  ttlMs: number
  damage: number
  attackKind: AttackKind
}

export interface EnemyProjectileHit {
  kind: string
  sourceId: string
  attackId: number
  x: number
  y: number
  damage: number
  attackKind: AttackKind
}

export function spawnEnemyProjectile(spawn: EnemyProjectileSpawn): EnemyProjectile {
  const dx = spawn.targetX - spawn.x
  const dy = spawn.targetY - spawn.y
  const len = Math.hypot(dx, dy)
  const nx = len > 0.0001 ? dx / len : spawn.facing
  const ny = len > 0.0001 ? dy / len : 0
  return {
    id: spawn.id,
    kind: spawn.kind,
    sourceId: spawn.sourceId,
    attackId: spawn.attackId,
    x: spawn.x,
    y: spawn.y,
    vx: nx * spawn.speedPxPerSecond,
    vy: ny * spawn.speedPxPerSecond,
    radius: Math.max(1, spawn.radius),
    ttlMs: Math.max(0, spawn.ttlMs),
    ageMs: 0,
    damage: spawn.damage,
    attackKind: spawn.attackKind,
  }
}

export function stepEnemyProjectiles(
  projectiles: EnemyProjectile[],
  hero: { x: number; y: number; alive: boolean },
  dtMs: number,
): { remaining: EnemyProjectile[]; hits: EnemyProjectileHit[] } {
  const remaining: EnemyProjectile[] = []
  const hits: EnemyProjectileHit[] = []
  const dtSeconds = Math.max(0, dtMs) / 1000

  for (const p of projectiles) {
    const fromX = p.x
    const fromY = p.y
    p.ageMs += Math.max(0, dtMs)
    p.x += p.vx * dtSeconds
    p.y += p.vy * dtSeconds

    if (hero.alive && distancePointToSegment(hero.x, hero.y, fromX, fromY, p.x, p.y) <= p.radius) {
      hits.push({
        kind: p.kind,
        sourceId: p.sourceId,
        attackId: p.attackId,
        x: p.x,
        y: p.y,
        damage: p.damage,
        attackKind: p.attackKind,
      })
      continue
    }

    if (p.ageMs < p.ttlMs) remaining.push(p)
  }

  return { remaining, hits }
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby
  if (abLenSq <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  const cx = ax + abx * t
  const cy = ay + aby * t
  return Math.hypot(px - cx, py - cy)
}
