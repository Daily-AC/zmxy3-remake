import { describe, expect, it, vi } from 'vitest'
import type { BackpackHeroStats, BackpackWindow as BackpackWindowType } from '../src/ui/hud/BackpackWindow'

vi.mock('phaser', () => ({
  default: {
    Scenes: {
      Events: {
        SHUTDOWN: 'shutdown',
      },
    },
  },
}))

class FakeGameObject {
  visible = true
  originX = 0
  originY = 0
  depth = 0
  scrollFactor = 1

  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}

  setOrigin(x: number, y = x): this {
    this.originX = x
    this.originY = y
    return this
  }

  setScrollFactor(value: number): this {
    this.scrollFactor = value
    return this
  }

  setDepth(value: number): this {
    this.depth = value
    return this
  }

  setVisible(value: boolean): this {
    this.visible = value
    return this
  }

  setStrokeStyle(): this {
    return this
  }

  setShadow(): this {
    return this
  }

  setScale(): this {
    return this
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }
}

class FakeImage extends FakeGameObject {
  crop: { x: number; y: number; w: number; h: number } | null = null

  constructor(x: number, y: number, public key: string, width: number, height: number) {
    super(x, y, width, height)
  }

  setCrop(x: number, y: number, w: number, h: number): this {
    this.crop = { x, y, w, h }
    return this
  }
}

class FakeText extends FakeGameObject {
  text = ''

  constructor(
    x: number,
    y: number,
    text: string,
    public style: { fontSize?: string; wordWrap?: { width: number } },
  ) {
    super(x, y)
    this.text = text
  }

  setText(text: string): this {
    this.text = text
    return this
  }
}

class FakeContainer extends FakeGameObject {
  constructor(x: number, y: number, public children: FakeGameObject[] = []) {
    super(x, y)
  }

  add(child: FakeGameObject): this {
    this.children.push(child)
    return this
  }

  removeAll(): this {
    this.children = []
    return this
  }
}

class FakeGraphics extends FakeGameObject {
  fillStyle(): this {
    return this
  }

  fillRoundedRect(): this {
    return this
  }

  lineStyle(): this {
    return this
  }

  strokeRoundedRect(): this {
    return this
  }
}

const TEXTURE_SIZES: Record<string, { w: number; h: number }> = {
  backpack_bg: { w: 755, h: 497 },
  backpack_exp_fill: { w: 214, h: 20 },
}

function makeScene() {
  return {
    textures: {
      exists: (key: string) => key in TEXTURE_SIZES,
    },
    add: {
      image: (x: number, y: number, key: string) => {
        const size = TEXTURE_SIZES[key] ?? { w: 1, h: 1 }
        return new FakeImage(x, y, key, size.w, size.h)
      },
      rectangle: (x: number, y: number, w: number, h: number) => new FakeGameObject(x, y, w, h),
      graphics: () => new FakeGraphics(),
      text: (x: number, y: number, text: string, style: { fontSize?: string; wordWrap?: { width: number } }) => new FakeText(x, y, text, style),
      container: (x: number, y: number, children: FakeGameObject[] = []) => new FakeContainer(x, y, children),
    },
    input: {
      on: () => undefined,
      off: () => undefined,
      manager: { canvas: { style: { cursor: '' } } },
    },
    events: {
      once: () => undefined,
    },
  }
}

async function makeBackpack(): Promise<BackpackWindowType> {
  const { BackpackWindow } = await import('../src/ui/hud/BackpackWindow')
  return new BackpackWindow(makeScene() as never)
}

const BASE_STATS: BackpackHeroStats = {
  name: '孙悟空',
  level: 5,
  combatPower: 0,
  hp: 100,
  maxHp: 100,
  mp: 100,
  maxMp: 100,
  atk: 10,
  def: 10,
  luck: 0,
  magicDefPct: 0,
  critPct: 0,
  dodgePct: 0,
  hpRegen: 0,
  mpRegen: 0,
  exp: 50,
  expToNext: 100,
  soul: 0,
}

describe('BackpackWindow layout invariants', () => {
  it('places the EXP fill on the baked progress track', async () => {
    const backpack = await makeBackpack()
    const expFill = (backpack as unknown as { expFill: FakeImage }).expFill
    const track = { x: 95, y: 426, w: 214, h: 20 }

    expect({ x: expFill.x, y: expFill.y, w: expFill.width, h: expFill.height }).toEqual(track)

    backpack.setHeroStats(BASE_STATS)
    expect(expFill.crop).toEqual({ x: 0, y: 0, w: track.w / 2, h: track.h })
  })

  it('keeps the page number text box inside the prev/next button gap', async () => {
    const backpack = await makeBackpack()
    const pageText = (backpack as unknown as { nowpageText: FakeText }).nowpageText
    const pageWidth = pageText.style.wordWrap?.width ?? 0
    const pageLeft = pageText.x - pageWidth / 2
    const pageRight = pageText.x + pageWidth / 2

    const prevRight = 498.7 + 86
    const nextLeft = 616.9

    expect(pageLeft).toBeGreaterThanOrEqual(prevRight)
    expect(pageRight).toBeLessThanOrEqual(nextLeft)
  })
})
