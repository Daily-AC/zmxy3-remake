import roleRaw from '../data/roles/role1.json'
import type { RoleData } from '../systems/roleData'

export interface VisualContentBounds {
  top: number
  bottom: number
}

export const HERO_IDLE_CONTENT: VisualContentBounds = { top: 72, bottom: 172 }

export const MONSTER_IDLE_CONTENT: Readonly<Record<string, VisualContentBounds>> = {
  monster2: { top: 40, bottom: 171 },
  monster3: { top: 40, bottom: 146 },
  monster4: { top: 39, bottom: 156 },
  monster5: { top: 159, bottom: 298 },
  monster6: { top: 159, bottom: 335 },
  monster7: { top: 29, bottom: 130 },
  monster8: { top: 29, bottom: 123 },
  monster9: { top: 59, bottom: 170 },
  monster10: { top: 59, bottom: 173 },
  monster15: { top: 120, bottom: 309 },
  monster16: { top: 29, bottom: 240 },
  monster19: { top: 59, bottom: 181 },
  monster30: { top: 33, bottom: 108 },
}

const roleData = roleRaw as RoleData
const monsterJsonModules = (
  import.meta as unknown as {
    glob: (path: string, options: { eager: boolean }) => Record<string, { default: RoleData }>
  }
).glob('../data/monsters/*.json', { eager: true })

const monsterData: Record<string, RoleData> = {}
for (const [path, module] of Object.entries(monsterJsonModules)) {
  const match = path.match(/(monster\d+)\.json$/)
  if (match) monsterData[match[1]] = module.default
}

export function visibleBottomOffset(
  cellH: number,
  offsetY: number,
  scale: number,
  contentBottom: number,
): number {
  return offsetY * scale + (contentBottom - cellH / 2) * scale
}

export function computeVisibleTopY(input: {
  stateY: number
  offsetY: number
  scale: number
  cellH: number
  contentTop: number
  baselineCorrectionY?: number
}): number {
  return input.stateY +
    input.offsetY * input.scale +
    (input.contentTop - input.cellH / 2) * input.scale +
    (input.baselineCorrectionY ?? 0)
}

export function computeVisibleBottomY(input: {
  stateY: number
  offsetY: number
  scale: number
  cellH: number
  contentBottom: number
  baselineCorrectionY?: number
}): number {
  return input.stateY +
    visibleBottomOffset(input.cellH, input.offsetY, input.scale, input.contentBottom) +
    (input.baselineCorrectionY ?? 0)
}

export function monsterBaselineCorrectionY(species: string): number {
  if (species === 'monster30') return 0
  const bounds = MONSTER_IDLE_CONTENT[species]
  const data = monsterData[species]
  if (!bounds || !data) return 0
  const heroBottom = visibleBottomOffset(
    roleData.sheet.cellH,
    roleData.offset.y,
    1.5,
    HERO_IDLE_CONTENT.bottom,
  )
  const monsterBottom = visibleBottomOffset(
    data.sheet.cellH,
    data.offset.y,
    1.5,
    bounds.bottom,
  )
  return heroBottom - monsterBottom
}
