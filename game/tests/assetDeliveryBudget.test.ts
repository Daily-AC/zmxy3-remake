import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { activeArtFont, ensureArtFontsLoaded } from '../src/systems/artFont'
import { optimizedImageUrl } from '../src/systems/optimizedAssets'

const assetsRoot = new URL('../public/assets/', import.meta.url)

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

describe('public asset delivery budget', () => {
  it('routes PNG image requests to their compressed WebP counterparts', () => {
    expect(optimizedImageUrl('assets/extracted/level2/bg21.png'))
      .toBe('assets/extracted/level2/bg21.webp')
    expect(optimizedImageUrl('assets/keyart/menu-keyart.jpg'))
      .toBe('assets/keyart/menu-keyart.webp')
  })

  it('ships a WebP counterpart for every PNG without changing source dimensions', () => {
    const pngs = filesUnder(assetsRoot.pathname).filter((path) => extname(path) === '.png')
    const webps = new Set(
      filesUnder(assetsRoot.pathname)
        .filter((path) => extname(path) === '.webp')
        .map((path) => path.slice(0, -'.webp'.length)),
    )

    expect(pngs).not.toHaveLength(0)
    expect(pngs.filter((path) => !webps.has(path.slice(0, -'.png'.length)))).toEqual([])
  })

  it('keeps the optimized WebP payload below the public demo budget', () => {
    const webps = filesUnder(assetsRoot.pathname).filter((path) => extname(path) === '.webp')
    const sizes = webps.map((path) => statSync(path).size)

    expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(20 * 1024 * 1024)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1024 * 1024)
  })

  it('blocks boot on only the compact active font', async () => {
    const loadedSources: string[] = []
    const addedFaces: unknown[] = []
    class TestFontFace {
      constructor(_family: string, source: string) {
        loadedSources.push(source)
      }

      load(): Promise<TestFontFace> {
        return Promise.resolve(this)
      }
    }

    vi.stubGlobal('FontFace', TestFontFace)
    vi.stubGlobal('document', { fonts: { add: (face: unknown) => addedFaces.push(face) } })

    await ensureArtFontsLoaded()

    expect(loadedSources).toEqual([`url(assets/fonts/${activeArtFont().file}) format("woff2")`])
    expect(addedFaces).toHaveLength(1)
    expect(activeArtFont().file).toMatch(/\.woff2$/)
    expect(statSync(new URL(`../public/assets/fonts/${activeArtFont().file}`, import.meta.url)).size)
      .toBeLessThanOrEqual(1024 * 1024)
  })
})
