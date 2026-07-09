import originalEquipment from '../data/original/equipment.json'
import originalMonsterDrops from '../data/original/monster-drops.json'
import type { Item } from './items'

export interface DropRollContext {
  stage?: number
  level?: number
}

interface OriginalNumberEntry {
  condition: string
  value: number
}

interface OriginalBooleanEntry {
  condition: string
  value: boolean
}

interface OriginalFallListItem {
  name: string
  bigtype: string
}

interface OriginalFallListEntry {
  condition: string
  value: OriginalFallListItem[]
}

interface OriginalMonsterDropRecord {
  className: string
  probability?: OriginalNumberEntry[]
  isBoss?: OriginalBooleanEntry[]
  fallList?: OriginalFallListEntry[]
  gxp?: OriginalNumberEntry[]
}

const originalMonsterTable = (originalMonsterDrops as { monsters: OriginalMonsterDropRecord[] }).monsters
const originalEquipmentItems = (originalEquipment as {
  items: {
    fillName: string
    ename: string
    type: string
    quality: string
    sourceArray?: string
  }[]
}).items

function toClassName(monsterId: string): string {
  const normalized = monsterId.trim()
  if (/^Monster/.test(normalized)) return normalized
  return normalized.replace(/^monster/i, 'Monster')
}

function originalMonsterRecord(monsterId: string): OriginalMonsterDropRecord | undefined {
  const className = toClassName(monsterId)
  return originalMonsterTable.find((monster) => monster.className === className)
}

function conditionMatches(condition: string, context: DropRollContext, isBoss: boolean): boolean {
  if (condition === 'default') return true
  if (condition === 'this.isBoss') return isBoss
  if (condition === 'gc.curStage == 1 && gc.curLevel == 1') return context.stage === 1 && context.level === 1
  if (condition === 'gc.curStage == 5 && gc.curLevel == 1') return context.stage === 5 && context.level === 1
  if (condition === 'gc.curStage == 3 && gc.curLevel == 3 || gc.curStage == 8') {
    return (context.stage === 3 && context.level === 3) || context.stage === 8
  }
  if (condition === 'gc.curStage == 8') return context.stage === 8
  if (condition === 'gc.curStage == 9') return context.stage === 9
  return false
}

function resolveConditional<T>(
  entries: readonly { condition: string; value: T }[] | undefined,
  context: DropRollContext,
  isBoss: boolean,
  fallback: T,
): T {
  if (!entries || entries.length === 0) return fallback
  const nonDefault = entries.find((entry) => entry.condition !== 'default' && conditionMatches(entry.condition, context, isBoss))
  if (nonDefault) return nonDefault.value
  const defaultEntry = entries.find((entry) => entry.condition === 'default')
  return defaultEntry ? defaultEntry.value : fallback
}

function resolveIsBoss(monster: OriginalMonsterDropRecord, context: DropRollContext): boolean {
  return resolveConditional(monster.isBoss, context, false, false)
}

function qualityToRarity(quality: string): Item['rarity'] {
  if (quality === '粗 糙' || quality === '普 通') return 1
  if (quality === '优 秀' || quality === '精 良') return 2
  return 3
}

function fallListItemToItem(entry: OriginalFallListItem): Item {
  const source = originalEquipmentItems.find((item) => item.fillName === entry.name)
  if (!source) {
    return { id: entry.name, name: entry.name, kind: entry.bigtype === 'zb' ? 'equip' : 'material', rarity: 1 }
  }
  const kind: Item['kind'] = entry.bigtype === 'zb' ? 'equip' : source.type === 'zbwp' || source.type === 'wpqhs' ? 'material' : 'equip'
  return {
    id: source.fillName,
    name: source.ename,
    kind,
    rarity: qualityToRarity(source.quality),
    sourceFillName: source.fillName,
    sourceType: source.type,
    sourceQuality: source.quality,
    sourceArray: source.sourceArray,
  }
}

export function rollDrops(
  monsterId: string,
  rng: () => number,
  context: DropRollContext = {},
): { item: Item; qty: number }[] {
  const monster = originalMonsterRecord(monsterId)
  if (!monster) return []

  const isBoss = resolveIsBoss(monster, context)
  const probability = resolveConditional(monster.probability, context, isBoss, 0) * (isBoss ? 1.5 : 1)
  const fallList = resolveConditional(monster.fallList, context, isBoss, [])
  if (probability <= 0 || fallList.length === 0 || rng() > probability) return []

  const index = Math.max(0, Math.min(fallList.length - 1, Math.round(rng() * (fallList.length - 1))))
  return [{ item: fallListItemToItem(fallList[index]), qty: 1 }]
}

export function monsterSoulDropAmount(monsterId: string, context: DropRollContext = {}): number {
  const monster = originalMonsterRecord(monsterId)
  if (!monster) return 0
  const isBoss = resolveIsBoss(monster, context)
  const gxp = resolveConditional(monster.gxp, context, isBoss, 0)
  return Math.max(0, Math.floor(gxp * 2))
}
