import type { SubStageDef } from './level'
import type { Wall, WallType } from './platformSim'

interface GeometryWall {
  type: WallType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

interface GeometrySubStage {
  id: string
  walls?: GeometryWall[]
}

interface Level1GeometryJson {
  subStages?: GeometrySubStage[]
}

const geometryModules = (
  import.meta as unknown as {
    glob: (pattern: string, options: { eager: boolean }) => Record<string, { default: Level1GeometryJson }>
  }
).glob('../data/levels/level1-geometry.json', { eager: true })

function loadedGeometry(): Level1GeometryJson | null {
  const first = Object.values(geometryModules)[0]
  return first?.default ?? null
}

export function wallsForLevel1SubStage(stage: SubStageDef): Wall[] {
  const geometry = loadedGeometry()
  const mined = geometry?.subStages?.find((s) => s.id === stage.id)?.walls
  if (!mined || mined.length === 0) return stage.fallbackWalls
  return mined.map((wall) => ({
    type: wall.type,
    x: wall.x,
    y: wall.y,
    width: wall.width,
    height: wall.height,
    rotation: wall.rotation ?? 0,
  }))
}
