import { describe, it, expect } from 'vitest'
import { rarityStyle, rarityColor, rarityCss, rarityName } from '../src/ui/hud/rarity'
import type { Item } from '../src/systems/items'

describe('hud rarity -> color/name mapping', () => {
  it('maps each of the three item tiers to a distinct color', () => {
    const colors = [1, 2, 3].map(rarityColor)
    expect(new Set(colors).size).toBe(3)
    expect(rarityColor(1)).toBe(0x5fd6a0)
    expect(rarityColor(2)).toBe(0x6ba8ff)
    expect(rarityColor(3)).toBe(0xd9a441)
  })

  it('css and numeric colors agree', () => {
    for (const r of [1, 2, 3] as const) {
      const s = rarityStyle(r)
      expect(s.css.toLowerCase()).toBe('#' + s.color.toString(16).padStart(6, '0'))
    }
  })

  it('gives each tier a Chinese name', () => {
    expect(rarityName(1)).toBe('优良')
    expect(rarityName(2)).toBe('精良')
    expect(rarityName(3)).toBe('史诗')
  })

  it('falls back safely for an out-of-range rarity', () => {
    const f = rarityStyle(99)
    expect(f.name).toBe('普通')
    expect(f.color).toBe(0x9fb0c8)
    expect(rarityCss(0)).toBe('#9fb0c8')
  })

  it('accepts a real Item rarity field', () => {
    const item: Item = { id: 'x', name: '赤炎杖', kind: 'equip', rarity: 3 }
    expect(rarityName(item.rarity)).toBe('史诗')
  })
})
