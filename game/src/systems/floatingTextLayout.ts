export interface FloatingTextPosition {
  x: number
  y: number
}

interface RecentAnchor {
  x: number
  y: number
  atMs: number
  lane: number
}

const LANE_OFFSETS: readonly FloatingTextPosition[] = [
  { x: 0, y: 0 },
  { x: -56, y: -48 },
  { x: 56, y: -48 },
  { x: -112, y: 0 },
  { x: 112, y: 0 },
  { x: -112, y: -96 },
  { x: 112, y: -96 },
  { x: 0, y: -96 },
  { x: -56, y: -144 },
  { x: 56, y: -144 },
  { x: -112, y: -192 },
  { x: 112, y: -192 },
]

/**
 * Separates combat numbers created in the same short burst around a crowded
 * target. Distant targets keep their exact anchor, so unrelated hits do not
 * jump around the screen.
 */
export class FloatingTextLaneAllocator {
  private recent: RecentAnchor[] = []

  constructor(
    private readonly windowMs = 120,
    private readonly clusterRadiusX = 96,
    private readonly clusterRadiusY = 60,
  ) {}

  clear(): void {
    this.recent = []
  }

  allocate(x: number, y: number, nowMs: number): FloatingTextPosition {
    this.recent = this.recent.filter((entry) => nowMs >= entry.atMs && nowMs - entry.atMs <= this.windowMs)
    const nearby = this.recent.filter(
      (entry) => Math.abs(entry.x - x) <= this.clusterRadiusX && Math.abs(entry.y - y) <= this.clusterRadiusY,
    )
    const lane = nearby.length === 0 ? 0 : Math.max(...nearby.map((entry) => entry.lane)) + 1
    this.recent.push({ x, y, atMs: nowMs, lane })
    const offset = LANE_OFFSETS[lane % LANE_OFFSETS.length]
    const page = Math.floor(lane / LANE_OFFSETS.length)
    return { x: x + offset.x, y: y + offset.y - page * 220 }
  }
}
