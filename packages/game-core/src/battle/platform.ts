// Renderer-independent collision for recovered AS3 wall rectangles.

export type BattleWallType = 'solid' | 'through' | 'throughUpButDown' | 'throughDownButUp'

export interface BattleWall {
  type: BattleWallType
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
  wall: BattleWall
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
  wall?: BattleWall
}

function canLandOn(type: BattleWallType): boolean {
  return type === 'solid' || type === 'through' || type === 'throughUpButDown'
}

function blocksHead(type: BattleWallType): boolean {
  return type === 'solid' || type === 'throughDownButUp'
}

function blocksSide(type: BattleWallType): boolean {
  return type === 'solid' || type === 'throughDownButUp'
}

function horizontalOverlap(wall: BattleWall, x: number, halfWidth = 0): boolean {
  return x + halfWidth >= wall.x && x - halfWidth <= wall.x + wall.width
}

function verticalOverlap(wall: BattleWall, y: number, halfHeight = 0): boolean {
  return y + halfHeight >= wall.y && y - halfHeight <= wall.y + wall.height
}

export function resolveVerticalMotion(
  walls: readonly BattleWall[],
  query: VerticalMotionQuery,
): VerticalMotionHit | null {
  const halfWidth = query.halfWidth ?? 0

  if (query.vy >= 0 && query.toY >= query.fromY) {
    let best: VerticalMotionHit | null = null
    for (const wall of walls) {
      if (!canLandOn(wall.type) || !horizontalOverlap(wall, query.x, halfWidth)) continue
      const top = wall.y
      if (query.fromY <= top && query.toY >= top && (!best || top < best.y)) {
        best = { kind: 'land', y: top, wall }
      }
    }
    return best
  }

  if (query.vy < 0 && query.toY <= query.fromY) {
    let best: VerticalMotionHit | null = null
    for (const wall of walls) {
      if (!blocksHead(wall.type) || !horizontalOverlap(wall, query.x, halfWidth)) continue
      const bottom = wall.y + wall.height
      if (query.fromY >= bottom && query.toY <= bottom && (!best || bottom > best.y)) {
        best = { kind: 'head', y: bottom, wall }
      }
    }
    return best
  }

  return null
}

export function resolveHorizontalMotion(
  walls: readonly BattleWall[],
  query: HorizontalMotionQuery,
): HorizontalMotionResult {
  const halfWidth = query.halfWidth ?? 0
  const halfHeight = query.halfHeight ?? 0
  if (query.toX === query.fromX) return { x: query.toX, blocked: false }

  const movingRight = query.toX > query.fromX
  let best: HorizontalMotionResult | null = null

  for (const wall of walls) {
    if (!blocksSide(wall.type) || !verticalOverlap(wall, query.y, halfHeight)) continue
    if (movingRight) {
      const left = wall.x - halfWidth
      if (query.fromX <= left && query.toX >= left && (!best || left < best.x)) {
        best = { x: left, blocked: true, wall }
      }
    } else {
      const right = wall.x + wall.width + halfWidth
      if (query.fromX >= right && query.toX <= right && (!best || right > best.x)) {
        best = { x: right, blocked: true, wall }
      }
    }
  }

  return best ?? { x: query.toX, blocked: false }
}
