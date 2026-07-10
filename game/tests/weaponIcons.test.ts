import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { HUD_ARMOR_ICON_IDS, HUD_ICONS, HUD_WEAPON_ICON_IDS } from '../src/ui/hud/hudTheme'

describe('official weapon icons', () => {
  it('preloads one EIcon1 bitmap for every original weapon fillName', () => {
    expect(HUD_WEAPON_ICON_IDS).toHaveLength(31)
    expect(new Set(HUD_WEAPON_ICON_IDS).size).toBe(31)

    for (const id of HUD_WEAPON_ICON_IDS) {
      expect(HUD_ICONS).toContainEqual({ key: `icon_${id}`, url: `assets/extracted/icons/${id}.png` })
      const file = new URL(`../public/assets/extracted/icons/${id}.png`, import.meta.url)
      expect(existsSync(file), id).toBe(true)
      expect(readFileSync(file).subarray(1, 4).toString('ascii'), id).toBe('PNG')
    }
  })
})

describe('official active armor icons', () => {
  it('preloads the two Wukong armors reachable in L1/L2', () => {
    expect(HUD_ARMOR_ICON_IDS).toEqual(['ptdxzf', 'kys'])
    for (const id of HUD_ARMOR_ICON_IDS) {
      expect(HUD_ICONS).toContainEqual({ key: `icon_${id}`, url: `assets/extracted/icons/${id}.png` })
      const file = new URL(`../public/assets/extracted/icons/${id}.png`, import.meta.url)
      expect(existsSync(file), id).toBe(true)
      expect(readFileSync(file).subarray(1, 4).toString('ascii'), id).toBe('PNG')
    }
  })
})
