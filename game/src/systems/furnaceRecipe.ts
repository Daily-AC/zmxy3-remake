import originalEquipment from '../data/original/equipment.json'
import { addItem, countItem, removeItem, type Inventory } from './inventory'
import type { Effect, Item } from './items'

type RawStat = number | { base: number; rand: number }

interface OriginalEquipmentRecord {
  fillName: string
  ename: string
  type: string
  user: string
  quality: string
  sourceArray?: string
  stats: {
    ehp: RawStat
    emp: RawStat
    eatt: RawStat
    edef: RawStat
    ecrit: RawStat
    emiss: RawStat
    eahp: RawStat
    eamp: RawStat
    eatblood: RawStat
    magicdef: RawStat
    deephit: RawStat
  }
}

const originalEquipmentItems = (originalEquipment as { items: OriginalEquipmentRecord[] }).items

// bookFillName -> material lots. Verbatim from tasks/economy-archaeology-report.md §Q1.
export const RECIPE_MATERIALS: Record<string, [string, number][]> = {
  whgzzs: [['wptm', 20]],
  jmczzs: [['wptm', 10], ['wpxt', 10]],
  bspzzs: [['wpsc', 20]],
  dtkzzs: [['wpxt', 20]],
  tfljzzs: [['wpsc', 20], ['wpxt', 20]],
  wtpzzs: [['wptm', 20], ['wpxt', 20]],
  yhjzzs: [['wpsc', 20], ['wpxt', 20]],
  jmyzzs: [['wpsc', 40]],
  mgzhzzs: [['wptm', 20], ['wpxt', 40]],
  hljhzzs: [['wpsc', 80]],
  wsjgzzs: [['wpxt', 80]],
  ydjgzzs: [['wptm', 40], ['wpxt', 40]],
  tdlzjzzs: [['wptm', 40], ['wpxt', 80]],
  xleyzzs: [['wpsc', 80], ['wpxt', 80]],
  xlczzzs: [['wpsc', 160]],
  xlryzzs: [['wpxt', 160]],
  xlyjzzs: [['wpsc', 160]],
  xlthzzs: [['wptm', 80], ['wpxt', 80]],
  xltczzs: [['wptm', 160]],
  xltzzzs: [['wpxt', 160]],
  xltszzs: [['wptm', 80], ['wpxt', 80]],
  llyzzs: [['yhs', 3], ['tss', 3]],
  ryjgbzzs: [['yhs', 7], ['wpxt', 999]],
  dszkzzs: [['tss', 7], ['wpsc', 999]],
  lhzzzs: [['yhs', 7], ['wpxt', 999]],
  jljszzs: [['tss', 7], ['wpsc', 999]],
  jcdpzzs: [['yhs', 7], ['wpxt', 999]],
  tpzyzzs: [['tss', 7], ['wpsc', 999]],
  mdflczzs: [['yhs', 7], ['wpxt', 999]],
  mdyszzs: [['tss', 7], ['wpsc', 999]],
  qlgzzs: [['yhs', 3], ['wpxt', 300]],
  qljzzs: [['tss', 3], ['wpsc', 300]],
  plzzzs: [['yhs', 3], ['wpxt', 300]],
  plpzzs: [['tss', 3], ['wpsc', 300]],
  ylfzzs: [['yhs', 3], ['wpxt', 300]],
  ylkzzs: [['tss', 3], ['wpsc', 300]],
  jljzzs: [['tss', 3], ['wpsc', 300]],
  jlczzs: [['yhs', 3], ['wpxt', 300]],
  jlgzzs: [['yhs', 3], ['wpxt', 300]],
}

const SOUL_BY_QUALITY: Record<string, number> = {
  '粗 糙': 50,
  '普 通': 100,
  '优 秀': 200,
  '精 良': 400,
  '史 诗': 800,
  '传 说': 1600,
}

const SALE_VALUE_BY_QUALITY: Record<string, number> = {
  '粗 糙': 10,
  '普 通': 20,
  '优 秀': 40,
  '精 良': 80,
  '史 诗': 160,
  '传 说': 320,
  '邪 灵': 640,
  '渊 邪': 640,
  '魂 器': 1280,
  '神 器': 2560,
}

const STAT_EFFECTS: { source: keyof OriginalEquipmentRecord['stats']; stat: Extract<Effect, { type: 'stat' }>['stat'] }[] = [
  { source: 'eatt', stat: 'atk' },
  { source: 'edef', stat: 'def' },
  { source: 'ehp', stat: 'hp' },
  { source: 'emp', stat: 'mp' },
  { source: 'ecrit', stat: 'crit' },
]

export interface FurnaceRecipe {
  bookFillName: string
  bookName: string
  productFillName: string
  productName: string
  role: string
  quality: string
  materials: { fillName: string; name: string; qty: number }[]
  soulCost: number
  requiresBook: boolean
}

export const BEGINNER_RECIPE: FurnaceRecipe = {
  bookFillName: 'starter_whg',
  bookName: '新手锻造：尾火棍',
  productFillName: 'whg',
  productName: '尾火棍',
  role: '悟空',
  quality: '优 秀',
  materials: [{ fillName: 'wptm', name: '檀木', qty: 3 }],
  soulCost: 20,
  requiresBook: false,
}

export type CraftCheck =
  | { ok: true }
  | { ok: false; reason: 'unknown_recipe' }
  | { ok: false; reason: 'missing_book' }
  | { ok: false; reason: 'missing_materials'; missing: { fillName: string; name: string; needed: number; have: number }[] }
  | { ok: false; reason: 'insufficient_soul'; needed: number; have: number }
  | { ok: false; reason: 'bag_full' }

export type CraftOutcome =
  | { ok: true; item: Item; soulSpent: number; newSoul: number }
  | Extract<CraftCheck, { ok: false }>

function equipmentByFillName(fillName: string): OriginalEquipmentRecord | undefined {
  return originalEquipmentItems.find((item) => item.fillName === fillName)
}

function productFillNameForBook(bookFillName: string): string {
  return bookFillName.replace(/zzs$/, '')
}

function qualityToRarity(quality: string): Item['rarity'] {
  if (quality === '粗 糙' || quality === '普 通') return 1
  if (quality === '优 秀' || quality === '精 良') return 2
  return 3
}

function itemKind(source: OriginalEquipmentRecord): Item['kind'] {
  return source.type === 'zbwp' || source.type === 'wpqhs' ? 'material' : 'equip'
}

function baseItemFromEquipment(source: OriginalEquipmentRecord): Item {
  return {
    id: source.fillName,
    name: source.ename,
    kind: itemKind(source),
    rarity: qualityToRarity(source.quality),
    sourceFillName: source.fillName,
    sourceType: source.type,
    sourceUser: source.user,
    sourceQuality: source.quality,
    sourceSaleValue: SALE_VALUE_BY_QUALITY[source.quality] ?? 0,
    sourceArray: source.sourceArray,
  }
}

function resolveRawStat(raw: RawStat, rng: () => number): number {
  if (typeof raw === 'number') return raw
  const roll = Math.max(0, Math.min(1, rng()))
  if (Number.isInteger(raw.base) && Number.isInteger(raw.rand)) {
    return raw.base + Math.round(roll * raw.rand)
  }
  return raw.base + roll * raw.rand
}

function equipmentEffects(source: OriginalEquipmentRecord, rng: () => number): Effect[] {
  const effects: Effect[] = []
  for (const entry of STAT_EFFECTS) {
    const value = resolveRawStat(source.stats[entry.source], rng)
    if (value !== 0) effects.push({ type: 'stat', stat: entry.stat, value })
  }
  return effects
}

function runtimeItemFromEquipment(source: OriginalEquipmentRecord, rng: () => number): Item {
  const item = baseItemFromEquipment(source)
  if (item.kind !== 'equip') return item
  const effects = equipmentEffects(source, rng)
  return effects.length > 0 ? { ...item, effects } : item
}

function craftedItemFromRecipe(recipe: FurnaceRecipe, rng: () => number): Item {
  const source = equipmentByFillName(recipe.productFillName)
  if (!source) {
    return { id: recipe.productFillName, name: recipe.productName, kind: 'equip', rarity: 1, effects: [] }
  }
  return runtimeItemFromEquipment(source, rng)
}

function buildRecipe(book: OriginalEquipmentRecord): FurnaceRecipe | undefined {
  const materials = RECIPE_MATERIALS[book.fillName]
  const product = equipmentByFillName(productFillNameForBook(book.fillName))
  if (!materials || !product) return undefined
  return {
    bookFillName: book.fillName,
    bookName: book.ename,
    productFillName: product.fillName,
    productName: product.ename,
    role: product.user,
    quality: product.quality,
    materials: materials.map(([fillName, qty]) => ({
      fillName,
      name: equipmentByFillName(fillName)?.ename ?? fillName,
      qty,
    })),
    soulCost: SOUL_BY_QUALITY[product.quality] ?? SOUL_BY_QUALITY['传 说'],
    requiresBook: true,
  }
}

export function listRecipes(): FurnaceRecipe[] {
  const recoveredRecipes = originalEquipmentItems
    .filter((item) => item.ename.endsWith('制作书'))
    .map(buildRecipe)
    .filter((recipe): recipe is FurnaceRecipe => recipe !== undefined)
  return [BEGINNER_RECIPE, ...recoveredRecipes]
}

export function findRecipe(bookFillName: string): FurnaceRecipe | undefined {
  return listRecipes().find((recipe) => recipe.bookFillName === bookFillName)
}

export function canCraft(inventory: Inventory, soul: number, recipeFill: string): CraftCheck {
  const recipe = findRecipe(recipeFill)
  if (!recipe) return { ok: false, reason: 'unknown_recipe' }
  if (recipe.requiresBook && countItem(inventory, recipe.bookFillName) < 1) {
    return { ok: false, reason: 'missing_book' }
  }

  const missing = recipe.materials
    .map((material) => ({
      fillName: material.fillName,
      name: material.name,
      needed: material.qty,
      have: countItem(inventory, material.fillName),
    }))
    .filter((material) => material.have < material.needed)
  if (missing.length > 0) return { ok: false, reason: 'missing_materials', missing }
  if (soul < recipe.soulCost) return { ok: false, reason: 'insufficient_soul', needed: recipe.soulCost, have: soul }
  return { ok: true }
}

export function craft(
  inventory: Inventory,
  soul: number,
  recipeFill: string,
  rng: () => number = Math.random,
): CraftOutcome {
  const check = canCraft(inventory, soul, recipeFill)
  if (!check.ok) return check

  const recipe = findRecipe(recipeFill)
  if (!recipe) return { ok: false, reason: 'unknown_recipe' }

  const beforeStacks = inventory.stacks.map((stack) => ({ item: stack.item, qty: stack.qty }))
  if (recipe.requiresBook) removeItem(inventory, recipe.bookFillName, 1)
  for (const material of recipe.materials) removeItem(inventory, material.fillName, material.qty)

  const item = craftedItemFromRecipe(recipe, recipe.requiresBook ? rng : () => 0)
  const added = addItem(inventory, item, 1)
  if (!added.ok) {
    inventory.stacks.splice(0, inventory.stacks.length, ...beforeStacks)
    return { ok: false, reason: 'bag_full' }
  }

  return { ok: true, item, soulSpent: recipe.soulCost, newSoul: soul - recipe.soulCost }
}

/** Resolve any equipment.json fillName to a runtime Item for debug/test bootstrapping. */
export function equipmentItemByFillName(fillName: string, rng: () => number = () => 0): Item | undefined {
  const source = equipmentByFillName(fillName)
  return source ? runtimeItemFromEquipment(source, rng) : undefined
}
