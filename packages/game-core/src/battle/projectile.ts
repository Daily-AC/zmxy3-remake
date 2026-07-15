export type BattleAttackKind = 'physics' | 'magic'

export interface BattleProjectile {
  id: string
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
  attackKind: BattleAttackKind
}

export interface BattleProjectileSpawn {
  id: string
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
  attackKind: BattleAttackKind
}

export interface BattleProjectileHit {
  id: string
  sourceId: string
  attackId: number
  damage: number
  attackKind: BattleAttackKind
}

export function spawnBattleProjectile(spawn: BattleProjectileSpawn): BattleProjectile {
  const dx = spawn.targetX - spawn.x
  const dy = spawn.targetY - spawn.y
  const length = Math.hypot(dx, dy)
  const nx = length > 0.0001 ? dx / length : spawn.facing
  const ny = length > 0.0001 ? dy / length : 0
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

export function stepBattleProjectiles(
  projectiles: readonly BattleProjectile[],
  hero: { x: number; y: number; alive: boolean },
  dtMs: number,
): { remaining: BattleProjectile[]; hits: BattleProjectileHit[]; removedIds: string[] } {
  const remaining: BattleProjectile[] = []
  const hits: BattleProjectileHit[] = []
  const removedIds: string[] = []
  const dtSeconds = Math.max(0, dtMs) / 1000

  for (const projectile of projectiles) {
    const fromX = projectile.x
    const fromY = projectile.y
    projectile.ageMs += Math.max(0, dtMs)
    projectile.x += projectile.vx * dtSeconds
    projectile.y += projectile.vy * dtSeconds
    if (hero.alive && distancePointToSegment(
      hero.x,
      hero.y,
      fromX,
      fromY,
      projectile.x,
      projectile.y,
    ) <= projectile.radius) {
      hits.push({
        id: projectile.id,
        sourceId: projectile.sourceId,
        attackId: projectile.attackId,
        damage: projectile.damage,
        attackKind: projectile.attackKind,
      })
      removedIds.push(projectile.id)
    } else if (projectile.ageMs < projectile.ttlMs) {
      remaining.push(projectile)
    } else {
      removedIds.push(projectile.id)
    }
  }
  return { remaining, hits, removedIds }
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const lengthSquared = abx * abx + aby * aby
  if (lengthSquared <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSquared))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}
