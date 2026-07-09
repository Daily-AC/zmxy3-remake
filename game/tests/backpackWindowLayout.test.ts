import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackpackHeroStats, BackpackWindow as BackpackWindowType } from '../src/ui/hud/BackpackWindow'
import { createEquipment } from '../src/systems/equipment'
import type { Item } from '../src/systems/items'

vi.mock('phaser', () => ({
  default: {
    Scenes: {
      Events: {
        SHUTDOWN: 'shutdown',
      },
    },
  },
}))

// Controllable stand-in for the social login session (2026-07-09 昵称 fix):
// the mock factory can't close over a `let` declared later in this module
// (vi.mock is hoisted above imports), so the mutable state lives on this
// vi.hoisted() object instead and tests reach into it directly.
const socialMock = vi.hoisted(() => ({
  session: null as null | { token: string; user: { id: string; username: string } },
}))
vi.mock('../src/net/socialClient', () => ({
  resolveSocialServerBaseUrl: () => 'https://social.test',
  getSharedSocialClient: () => ({ getSession: () => socialMock.session }),
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
  role1_0: { w: 200, h: 200 },
  role1_equip0: { w: 200, h: 200 },
  icon_star_blade: { w: 64, h: 64 },
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

afterEach(() => {
  socialMock.session = null
  vi.unstubAllGlobals()
})

function mockWeaponItem(): Item {
  // 'ptdxzg' (普通的行者棍) is one of the 31 zbwq ids in BackpackWindow's
  // WEAPON_ITEM_IDS -- see equipment.json / furnaceRecipe.ts's `id: source.
  // fillName`.
  return { id: 'ptdxzg', name: '普通的行者棍', kind: 'equip', rarity: 1 }
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

  it('centers value text on both axes instead of top-anchoring it (2026-07-09 polish)', async () => {
    const backpack = await makeBackpack()
    const b = backpack as unknown as {
      nameText: FakeText
      zdlText: FakeText
      soulText: FakeText
      nowpageText: FakeText
      statTexts: Record<string, FakeText>
    }

    // origin(0.5,0.5) everywhere a value renders -- the old origin(0.5,0)
    // top-anchor is exactly the bug the brief reported ("值文本...偏上/偏下").
    for (const t of [b.nameText, b.zdlText, b.soulText, b.nowpageText, b.statTexts.hp, b.statTexts.mp]) {
      expect(t.originX).toBe(0.5)
      expect(t.originY).toBe(0.5)
    }

    // y's are each groove's measured vertical MIDPOINT (see BackpackWindow's
    // NAME_VALUE/STAT_L comments), not its top edge.
    expect(b.nameText.y).toBe(73)
    expect(b.statTexts.hp.y).toBe(268)
    expect(b.statTexts.mp.y).toBe(268)
    // nowpage sits at the prev/next buttons' own vertical center.
    expect(b.nowpageText.y).toBe(419.2 + 34 / 2)
  })

  it('recenters 灵魂 in its value sub-box (was left-aligned, off-box after the prior fix)', async () => {
    const backpack = await makeBackpack()
    const soulText = (backpack as unknown as { soulText: FakeText }).soulText
    // Value sub-box is x:[552.4, 552.4+74] (see SOUL_VALUE's comment) -- the
    // text's centered x must sit at that box's own midpoint, not its left edge.
    expect(soulText.x).toBeCloseTo(552.4 + 37, 5)
    expect(soulText.originX).toBe(0.5)
  })

  it('covers the true 0..960 x 0..540 canvas with the dim backdrop (was container-local-offset, see report)', async () => {
    const backpack = await makeBackpack()
    const container = (backpack as unknown as { container: FakeContainer }).container
    const dimRect = container.children[0]
    // Local-to-container coordinates that, once the container is placed at
    // (BG_X,BG_Y), put this rect's center back on true canvas center (480,270).
    expect(dimRect.x).toBeCloseTo(480 - (960 - 755) / 2, 5)
    expect(dimRect.y).toBeCloseTo(270 - (540 - 497) / 2, 5)
    expect(dimRect.width).toBe(960)
    expect(dimRect.height).toBe(540)
  })

  it('shows the weapon overlay only while the weapon slot is filled', async () => {
    const backpack = await makeBackpack()
    const weaponOverlay = (backpack as unknown as { weaponOverlay: FakeImage | null }).weaponOverlay
    expect(weaponOverlay).not.toBeNull()
    expect(weaponOverlay!.visible).toBe(false)

    const eq = createEquipment()
    eq.weapon = mockWeaponItem()
    backpack.setEquipment(eq)
    expect(weaponOverlay!.visible).toBe(true)

    backpack.setEquipment(createEquipment())
    expect(weaponOverlay!.visible).toBe(false)
  })

  it('maps a weapon-slot item with no dedicated icon to icon_star_blade instead of the generic fallback', async () => {
    const backpack = await makeBackpack()
    const eq = createEquipment()
    eq.weapon = mockWeaponItem()
    backpack.setEquipment(eq)

    const equipLayer = (backpack as unknown as { equipLayer: FakeContainer }).equipLayer
    const icon = equipLayer.children.find((c): c is FakeImage => c instanceof FakeImage)
    expect(icon?.key).toBe('icon_star_blade')
  })

  it('shows the logged-in social username instead of the hero name, falling back when logged out', async () => {
    vi.stubGlobal('window', { location: { search: '' } })
    const backpack = await makeBackpack()
    const nameText = (backpack as unknown as { nameText: FakeText }).nameText

    backpack.setHeroStats(BASE_STATS)
    expect(nameText.text).toBe('孙悟空') // no session yet -> falls back to hero name

    socialMock.session = { token: 't', user: { id: 'u1', username: 'YilinTester' } }
    backpack.setHeroStats(BASE_STATS)
    expect(nameText.text).toBe('YilinTester')

    socialMock.session = null
    backpack.setHeroStats(BASE_STATS)
    expect(nameText.text).toBe('孙悟空')
  })

  it('falls back to the hero name without throwing when window is unavailable (node/vitest env)', async () => {
    const backpack = await makeBackpack()
    const nameText = (backpack as unknown as { nameText: FakeText }).nameText
    expect(() => backpack.setHeroStats(BASE_STATS)).not.toThrow()
    expect(nameText.text).toBe('孙悟空')
  })
})
