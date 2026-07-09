import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import monster30 from '../src/data/monsters/monster30.json'
import role1 from '../src/data/roles/role1.json'

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Input: { Keyboard: { KeyCodes: { A: 65, D: 68, J: 74, K: 75 } } },
  },
}))

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function readRgbaPng(path: URL): { width: number; height: number; rgba: Buffer } {
  const data = readFileSync(path)
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

  let offset = 8
  let width = 0
  let height = 0
  const idats: Buffer[] = []
  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.subarray(offset + 4, offset + 8).toString('ascii')
    const chunk = data.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      expect(chunk[8]).toBe(8)
      expect(chunk[9]).toBe(6)
      expect(chunk[12]).toBe(0)
    } else if (type === 'IDAT') {
      idats.push(chunk)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const bpp = 4
  const stride = width * bpp
  const inflated = inflateSync(Buffer.concat(idats))
  const rgba = Buffer.alloc(stride * height)
  let src = 0
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++]
    for (let x = 0; x < stride; x++) {
      const raw = inflated[src++]
      const left = x >= bpp ? rgba[y * stride + x - bpp] : 0
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= bpp ? rgba[(y - 1) * stride + x - bpp] : 0
      const value =
        filter === 0 ? raw :
        filter === 1 ? raw + left :
        filter === 2 ? raw + up :
        filter === 3 ? raw + Math.floor((left + up) / 2) :
        filter === 4 ? raw + paeth(left, up, upLeft) :
        raw
      rgba[y * stride + x] = value & 0xff
    }
  }
  return { width, height, rgba }
}

describe('Monster30 visual data', () => {
  it('keeps the AS3 Monster30 cell constants and 0.75 WuKong size ratio', () => {
    expect(monster30.sheet).toMatchObject({ cols: 6, rows: 4, cellW: 150, cellH: 150 })
    expect(monster30.offset).toEqual({ x: 5, y: -2 })
    expect(role1.sheet).toMatchObject({ cellW: 200, cellH: 200 })
    expect(monster30.sheet.cellW / role1.sheet.cellW).toBe(0.75)
    expect(monster30.sheet.cellH / role1.sheet.cellH).toBe(0.75)
  })

  it('uses a cleaned Monster30 sheet with transparent mask pixels removed', async () => {
    const cleanPath = new URL('../public/assets/extracted/level1/Monster30_clean.png', import.meta.url)
    expect(existsSync(cleanPath)).toBe(true)
    const clean = readRgbaPng(cleanPath)

    expect(clean.width).toBe(monster30.sheet.cols * monster30.sheet.cellW)
    expect(clean.height).toBe(monster30.sheet.rows * monster30.sheet.cellH)

    let alpha2Pixels = 0
    for (let i = 3; i < clean.rgba.length; i += 4) {
      if (clean.rgba[i] > 0 && clean.rgba[i] <= 2) alpha2Pixels++
    }
    expect(alpha2Pixels).toBe(0)

    const mod = await import('../src/scenes/BattleScene') as unknown as {
      monsterSheetAssetFor?: (species: string) => { dir: string; file: string } | undefined
    }
    expect(mod.monsterSheetAssetFor?.('monster30')).toEqual({ dir: 'level1', file: 'Monster30_clean' })
  })
})
