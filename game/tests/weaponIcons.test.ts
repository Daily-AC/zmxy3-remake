import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  HUD_ARMOR_ICON_IDS,
  HUD_ICONS,
  HUD_WEAPON_ICON_IDS,
  WORLD_DROP_ICONS,
} from '../src/ui/hud/hudTheme'

const sha256 = (file: URL) => createHash('sha256').update(readFileSync(file)).digest('hex')

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

describe('official transparent world-drop icons', () => {
  it.each([
    ['ptdxzg', '40743d2519359e1e1304491390109a8bf530390384ab81a0ab17757f19f54867'],
    ['whg', 'ea258d01764f0af6965e55cc2c2239d2556a9ad7d1ec9fede8e97841dcaa9343'],
    ['ptdxzf', '4cbe233f0edb0a23b27e13eaf923b28bb1820dd4406f43392b26e7007236d3ec'],
    ['kys', '270ead60ec6d41069aeb4be3c40fea2ed72a5a9951d86fd018f94f790b442dfc'],
  ])('uses the EIcon1 fall_%s bitmap rather than the opaque backpack icon', (id, expectedHash) => {
    expect(WORLD_DROP_ICONS).toContainEqual({
      key: `drop_icon_${id}`,
      url: `assets/extracted/drop-icons/${id}.png`,
    })
    const file = new URL(`../public/assets/extracted/drop-icons/${id}.png`, import.meta.url)
    expect(existsSync(file), id).toBe(true)
    expect(sha256(file), id).toBe(expectedHash)
    expect(sha256(file), id).not.toBe(sha256(new URL(`../public/assets/extracted/icons/${id}.png`, import.meta.url)))
  })

  it('uses the original timber bitmaps in the backpack and on the ground', () => {
    expect(HUD_ICONS).toContainEqual({
      key: 'icon_wptm',
      url: 'assets/extracted/icons/wptm.png',
    })
    expect(WORLD_DROP_ICONS).toContainEqual({
      key: 'drop_icon_wptm',
      url: 'assets/extracted/drop-icons/wptm.png',
    })

    const backpack = new URL('../public/assets/extracted/icons/wptm.png', import.meta.url)
    const ground = new URL('../public/assets/extracted/drop-icons/wptm.png', import.meta.url)
    expect(existsSync(backpack)).toBe(true)
    expect(existsSync(ground)).toBe(true)
    expect(sha256(backpack)).toBe('7147aef07390c295cc8c365c9b5e4ce9ea2f5f1cb9d574560e65387a94d6bbb4')
    expect(sha256(ground)).toBe('409d1ae6f2a69d503310b310b256424dd1875867cf2dc7bce03422f4bf0444d9')
    expect(sha256(ground)).not.toBe(sha256(backpack))
  })
})
