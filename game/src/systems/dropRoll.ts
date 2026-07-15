import originalMonsterDrops from '../data/original/monster-drops.json'
import type { Item } from './items'
import { equipmentItemByFillName } from './furnaceRecipe'
import { isSupportedEquipmentForHero } from './equipment'

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

function fallListItemToItem(entry: OriginalFallListItem): Item {
  const recovered = equipmentItemByFillName(entry.name)
  return recovered ?? {
    id: entry.name,
    name: entry.name,
    kind: entry.bigtype === 'zb' ? 'equip' : 'material',
    rarity: 1,
  }
}

function isCurrentMvpDrop(entry: OriginalFallListItem): boolean {
  if (entry.bigtype !== 'zb') return entry.name === 'wptm'
  return isSupportedEquipmentForHero(fallListItemToItem(entry), 1)
}

export interface ResolvedMonsterDropTable {
  chance: number
  choices: Item[]
}

export function resolvedMonsterDropTable(
  monsterId: string,
  context: DropRollContext = {},
): ResolvedMonsterDropTable | undefined {
  const monster = originalMonsterRecord(monsterId)
  if (!monster) return undefined
  const isBoss = resolveIsBoss(monster, context)
  const chance = Math.min(1, resolveConditional(monster.probability, context, isBoss, 0) * (isBoss ? 1.5 : 1))
  const choices = resolveConditional(monster.fallList, context, isBoss, [])
    .filter(isCurrentMvpDrop)
    .map(fallListItemToItem)
  return chance > 0 && choices.length > 0 ? { chance, choices } : undefined
}

export function rollDrops(
  monsterId: string,
  rng: () => number,
  context: DropRollContext = {},
): { item: Item; qty: number }[] {
  const table = resolvedMonsterDropTable(monsterId, context)
  if (!table || rng() > table.chance) return []
  const index = Math.max(0, Math.min(table.choices.length - 1, Math.round(rng() * (table.choices.length - 1))))
  return [{ item: table.choices[index], qty: 1 }]
}

export function monsterSoulDropAmount(monsterId: string, context: DropRollContext = {}): number {
  const monster = originalMonsterRecord(monsterId)
  if (!monster) return 0
  const isBoss = resolveIsBoss(monster, context)
  const gxp = resolveConditional(monster.gxp, context, isBoss, 0)
  return Math.max(0, Math.floor(gxp * 2))
}
