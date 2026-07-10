import type { HeroHitPayload, HeroStateSnapshot } from './coopSync'
import { centeredBox, overlaps, type Rect } from './hitbox'
import { resolveIncomingHeroDamage } from './heroScale'

export interface RemoteHeroVisualConfig {
  offset: { x: number; y: number }
  scale: number
  hurtboxWidth: number
  hurtboxHeight: number
}

export interface RemoteHeroHitTarget {
  targetUserId: string
  knockbackX: -1 | 1
}

export interface AliveHeroTarget {
  userId: string
  x: number
  y: number
  alive: boolean
}

export function selectNearestAliveHeroTarget<T extends AliveHeroTarget>(
  monster: { x: number; y: number },
  local: T,
  remotes: T[],
): T | null {
  let nearest: T | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of [local, ...remotes]) {
    if (!candidate.alive) continue
    const distance = Math.hypot(candidate.x - monster.x, candidate.y - monster.y)
    if (distance >= nearestDistance) continue
    nearest = candidate
    nearestDistance = distance
  }
  return nearest
}

export function remoteHeroHurtbox(snapshot: HeroStateSnapshot, visual: RemoteHeroVisualConfig): Rect | null {
  if (!snapshot.alive) return null
  const centerX = snapshot.x + visual.offset.x * visual.scale
  const centerY = snapshot.y + visual.offset.y * visual.scale
  return centeredBox(centerX, centerY, visual.hurtboxWidth, visual.hurtboxHeight)
}

export function selectRemoteHeroHitTargets(
  attackHitbox: Rect,
  monsterCenterX: number,
  snapshots: HeroStateSnapshot[],
  localUserId: string,
  visual: RemoteHeroVisualConfig,
): RemoteHeroHitTarget[] {
  const targets: RemoteHeroHitTarget[] = []
  for (const snapshot of snapshots) {
    if (snapshot.userId === localUserId) continue
    const hurtbox = remoteHeroHurtbox(snapshot, visual)
    if (!hurtbox || !overlaps(attackHitbox, hurtbox)) continue
    const heroCenterX = snapshot.x + visual.offset.x * visual.scale
    targets.push({
      targetUserId: snapshot.userId,
      knockbackX: heroCenterX < monsterCenterX ? -1 : 1,
    })
  }
  return targets
}

export function resolveCoopHeroHitDamage(
  payload: HeroHitPayload,
  heroDef: number,
  heroMagicDefFraction: number,
): number {
  return Math.max(
    1,
    Math.round(resolveIncomingHeroDamage(payload.power, payload.attackKind, heroDef, heroMagicDefFraction)),
  )
}
