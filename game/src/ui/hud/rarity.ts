// Item rarity -> display name + text color. The original 4399 game had NO
// rarity border art (see UI MANIFEST §3): it distinguished quality purely by the
// item NAME's text color. We keep that language -- no frame overlays, just a
// colored label. Our Item.rarity is a 3-tier scale (items.ts: 1|2|3), narrower
// than the original 5-tier (普通/优秀/精良/史诗/邪灵), so this maps our three
// tiers onto the same hues BattleScene already uses for drop stars
// (0x5fd6a0 / 0x6ba8ff / 0xd9a441) -- consistency with the one existing
// rarity-color usage in the codebase beats reproducing tiers we can't store.

import type { Item } from '../../systems/items'

export type Rarity = Item['rarity'] // 1 | 2 | 3

export interface RarityStyle {
  /** Numeric color for Phaser tint / graphics. */
  color: number
  /** CSS hex for Text.setColor. */
  css: string
  /** Chinese tier name shown in the tooltip. */
  name: string
}

const STYLES: Record<Rarity, RarityStyle> = {
  1: { color: 0x5fd6a0, css: '#5fd6a0', name: '优良' },
  2: { color: 0x6ba8ff, css: '#6ba8ff', name: '精良' },
  3: { color: 0xd9a441, css: '#d9a441', name: '史诗' },
}

const FALLBACK: RarityStyle = { color: 0x9fb0c8, css: '#9fb0c8', name: '普通' }

export function rarityStyle(rarity: number): RarityStyle {
  return STYLES[rarity as Rarity] ?? FALLBACK
}

export function rarityColor(rarity: number): number {
  return rarityStyle(rarity).color
}

export function rarityCss(rarity: number): string {
  return rarityStyle(rarity).css
}

export function rarityName(rarity: number): string {
  return rarityStyle(rarity).name
}
