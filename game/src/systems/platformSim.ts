// Phaser-independent rectangle collision for AS3 stage walls/platforms.
//
// Source semantics: PhysicsWorld.addSubObj/BaseObject.nearToWall branches:
// - isWall: blocks landing, head, and side motion.
// - isThroughWall/isThroughUpButDownWall: one-way top support only while falling.
// - isThroughDownButUpWall: inverse one-way ceiling/side blocker; no landing.
//
// Adapted: the Flash code can fall through to bitmap-precision tests for
// rotated/irregular shapes. The remake geometry contract supplies axis-aligned
// rectangles, so this module intentionally resolves AABB/point motion only.

export type WallType = 'solid' | 'through' | 'throughUpButDown' | 'throughDownButUp'

export interface Wall {
  type: WallType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface VerticalMotionQuery {
  x: number
  fromY: number
  toY: number
  vy: number
  halfWidth?: number
}

export interface VerticalMotionHit {
  kind: 'land' | 'head'
  y: number
  wall: Wall
}

export interface HorizontalMotionQuery {
  fromX: number
  toX: number
  y: number
  halfWidth?: number
  halfHeight?: number
}

export interface HorizontalMotionResult {
  x: number
  blocked: boolean
  wall?: Wall
}

function canLandOn(type: WallType): boolean {
  return type === 'solid' || type === 'through' || type === 'throughUpButDown'
}

function blocksHead(type: WallType): boolean {
  return type === 'solid' || type === 'throughDownButUp'
}

function blocksSide(type: WallType): boolean {
  return type === 'solid' || type === 'throughDownButUp'
}

function horizontalOverlap(wall: Wall, x: number, halfWidth = 0): boolean {
  return x + halfWidth >= wall.x && x - halfWidth <= wall.x + wall.width
}

function verticalOverlap(wall: Wall, y: number, halfHeight = 0): boolean {
  return y + halfHeight >= wall.y && y - halfHeight <= wall.y + wall.height
}

/** Resolve one vertical point/body-center sweep against the nearest crossed surface. */
export function resolveVerticalMotion(walls: readonly Wall[], query: VerticalMotionQuery): VerticalMotionHit | null {
  const halfWidth = query.halfWidth ?? 0

  if (query.vy >= 0 && query.toY >= query.fromY) {
    let best: VerticalMotionHit | null = null
    for (const wall of walls) {
      if (!canLandOn(wall.type)) continue
      if (!horizontalOverlap(wall, query.x, halfWidth)) continue
      const top = wall.y
      if (query.fromY <= top && query.toY >= top) {
        if (!best || top < best.y) best = { kind: 'land', y: top, wall }
      }
    }
    return best
  }

  if (query.vy < 0 && query.toY <= query.fromY) {
    let best: VerticalMotionHit | null = null
    for (const wall of walls) {
      if (!blocksHead(wall.type)) continue
      if (!horizontalOverlap(wall, query.x, halfWidth)) continue
      const bottom = wall.y + wall.height
      if (query.fromY >= bottom && query.toY <= bottom) {
        if (!best || bottom > best.y) best = { kind: 'head', y: bottom, wall }
      }
    }
    return best
  }

  return null
}

/** Resolve one horizontal point/body-center sweep against side-blocking walls. */
export function resolveHorizontalMotion(
  walls: readonly Wall[],
  query: HorizontalMotionQuery,
): HorizontalMotionResult {
  const halfWidth = query.halfWidth ?? 0
  const halfHeight = query.halfHeight ?? 0

  if (query.toX === query.fromX) return { x: query.toX, blocked: false }

  const movingRight = query.toX > query.fromX
  let best: HorizontalMotionResult | null = null

  for (const wall of walls) {
    if (!blocksSide(wall.type)) continue
    if (!verticalOverlap(wall, query.y, halfHeight)) continue

    if (movingRight) {
      const left = wall.x - halfWidth
      if (query.fromX <= left && query.toX >= left) {
        if (!best || left < best.x) best = { x: left, blocked: true, wall }
      }
    } else {
      const right = wall.x + wall.width + halfWidth
      if (query.fromX >= right && query.toX <= right) {
        if (!best || right > best.x) best = { x: right, blocked: true, wall }
      }
    }
  }

  return best ?? { x: query.toX, blocked: false }
}
