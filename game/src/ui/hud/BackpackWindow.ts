import Phaser from 'phaser'
import type { Item } from '../../systems/items'
import type { EquipSlot, Equipment } from '../../systems/equipment'
import { HUD_COLORS, ICON_FALLBACK_KEY } from './hudTheme'
import { rarityCss, rarityName } from './rarity'
import { withinRect, type Rect } from '../screenHit'
import { getSharedSocialClient, resolveSocialServerBaseUrl } from '../../net/socialClient'
import { logicalPointerPosition } from '../../systems/renderScale'

// 个人资料/背包 window — S4 rebuild on the ORIGINAL layout, dual-source per
// docs/playbooks/ui-port-dual-source.md:
//
//  - SKIN (out_res/backpack1.swf, export.pack.BackPack chid444): every baked
//    button/label/tab/stat-box in `backpack_bg` (755x497) IS the real window
//    art, re-rendered by FFDec at its default (no-AS3) state and cropped to
//    its non-transparent bbox. All the coordinates below are that render's
//    *named PlaceObject* translateX/Y (public var name -> instance, e.g.
//    `zbwq`/`txt_hp`/`bpe`), converted BackPack-local px -> this 755x497
//    crop's pixel space via one shared affine offset. That offset was solved
//    empirically (NOT by trusting the analytic canvas math, which the S2/S3
//    棒 already found off by ~170px for filtered symbols): template-match
//    three independently-placed baked buttons (btn_close/sellwhite/prePage)
//    against the fresh full-canvas render and take their common
//    local->canvas delta (753.5-754.0, 480.5-481.15 across the three -- sub-
//    pixel agreement). See tasks/profile-backpack-report.md for the numbers.
//  - BONE (main SWF 打开我开始玩.swf, export.pack.BackPack.as /
//    BackPackElement.as / PackThings.as): the 5x5 grid formula
//    (`x=col*(w+11) y=row*(h+9)`, BackPackElement.as:197-198), the four real
//    equip-type click zones (zbwq/zbfj/zbsp/zbfb = 武器/防具/饰品/法宝 --
//    NOT "武器/头/衣/饰件" as glossed from the reference screenshot; the
//    class's own baked button labels settle it, see report), and the level-
//    badge digit-splice positions (`leveImage()`, BackPack.as:398-429).
//
// zbtx (头衔/title-badge) and zbsz (时装/costume) + their showszmc toggle are
// real AS3 fields but have NO corresponding system in this project (no rank/
// title system, no costume system) -- rendered as inert grey placeholders,
// same treatment as the 时装/经书 right-panel tabs (brief: "无对应系统的页签
// …不造内容", extended here to this analogous left-panel cluster).

export interface BackpackStack {
  item: Item
  qty: number
}

export interface BackpackHeroStats {
  name: string
  level: number
  /** systems/combatPower.ts computeCombatPower() -- 战斗力. */
  combatPower: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  atk: number
  def: number
  /** 幸运 -- heroGrowth.ts rollDailyLuck() (AS3 user/User.as setTadayLuckValue, display-only). */
  luck: number
  /** 魔抗 as a 0-100 percentage (heroIdentity.heroMagicDef() * 100). */
  magicDefPct: number
  /** 暴击 as a 0-100 percentage (heroStats().crit * 100). */
  critPct: number
  /** 闪避 -- no dodge system in this project (AS3 getMiss() has no data-model
   * counterpart here); always 0, kept as an explicit adaptation not a bug. */
  dodgePct: number
  /** 回血 -- no HP-regen-over-time system in this project; always 0. */
  hpRegen: number
  /** 回蓝 -- real value: BattleScene's MP_REGEN_PER_SEC (systems/mp.ts tickMpRegen rate). */
  mpRegen: number
  exp: number
  expToNext: number
  /** 灵魂 -- systems/soulPurse.ts SoulPurse.value (placeholder economy, see its header). */
  soul: number
}

export type BackpackTab = 'equip' | 'item' | 'fashion' | 'script'

const TAB_ORDER: BackpackTab[] = ['equip', 'item', 'fashion', 'script']
/** fashion (时装) / script (经书) have no backing system yet -- brief: 置灰页签，不造内容. */
const DISABLED_TABS: ReadonlySet<BackpackTab> = new Set(['fashion', 'script'])

export interface BackpackWindowOptions {
  /** item -> loaded icon texture key. Default: icon_<id> if present else fallback. */
  iconKeyFor?: (item: Item) => string
  onClose?: () => void
  /** Click an equip-kind item in the 装备 grid tab. */
  onEquip?: (item: Item) => void
  /** Click a filled equip slot on the left panel. */
  onUnequip?: (slot: EquipSlot) => void
  /** Click 出售白装. */
  onSell?: () => void
}

// ---- window geometry: 755x497 backpack_bg, centered in the 960x540 canvas ----
const BG_W = 755
const BG_H = 497
const BG_X = (960 - BG_W) / 2 // 102.5
const BG_Y = (540 - BG_H) / 2 // 21.5

const CLOSE = { x: 699.2, y: 6.6, w: 40, h: 42 }
// Value-text x anchors below are CENTERS (see makeCenteredText), not left
// edges. Source: out_res/backpack1.swf's own DefineEditText tags for each
// named field (txt_name/txt_zdl/txt_hp/... chid388/418/391/...), extracted
// via `ffdec -format text:formatted -selectid <chids> -export text`. Every
// one of them reports `align center` except txt_lh (灵魂), which is `align
// left` in the SWF but rendered centered here anyway per an explicit
// 2026-07-09 brief override (see SOUL_VALUE comment). The report's box-left-
// edge x's (still valid for POSITION) plus each field's own (xmin+xmax)/2
// offset (in the DefineEditText's local twips, applied unscaled since these
// PlaceObjects carry no matrix scale) give the true center x used below.
// x is each field's box CENTER (unchanged, sourced from the DefineEditText
// report -- see the header comment). y is each groove's *vertical* center,
// re-measured (2026-07-09 polish pass) by flood-filling the baked groove's
// dark interior in backpack_bg.png from a seed inside it and taking the
// resulting bbox's y-midpoint -- e.g. txt_name's groove flood-fills to
// y:[65,81] -> center 73. The previous y's (67.3/93.1/...) were each
// groove's approximate TOP edge, which is what makeCenteredText's old
// origin-(0.5,0) treated as a start-of-text y; switched to origin(0.5,0.5)
// below, these must be true centers instead of tops.
const NAME_VALUE = { x: 179.4, y: 73, w: 109 }
const ZDL_VALUE = { x: 176.4, y: 99, w: 109 }
const LEVEL_BADGE = { x: 268.6, y: 52.6, w: 83, h: 59 }
// Spotlight cone in backpack_bg.png (the beam+ground-pool graphic the 悟空
// portrait should stand inside): bbox measured by flood-filling from a seed
// in the ground pool (179,235) across all "brighter than dark panel bg"
// pixels -- resolves to x:[118,241] y:[113,238], i.e. a 123x125 box. cx is
// its horizontal center; groundY is its bottom (the pool's front edge,
// where a standing character's feet/shadow should land).
const SPOTLIGHT = { cx: 179.5, groundY: 238, h: 125 }
// role1_0.png frame (0,0) (the 'wait' idle pose used for this portrait) is a
// 200x200 spritesheet cell, but the drawn Wukong silhouette only occupies a
// sub-rect of it (measured via PIL Image.crop((0,0,200,200)).getbbox()):
// left 70 top 72 right 128 bottom 172 -> 58x100. The previous build scaled
// against the full 200x200 CELL (`fit / Math.max(portrait.width, portrait
// .height)`, i.e. dividing by 200) instead of the actual ~100px-tall
// silhouette -- that's the real "立绘太小" bug: it rendered the character at
// roughly half the size a "fit to spotlight height" scale implies, because
// half of every frame is transparent padding invisible to the eye but very
// much counted by width/height. Fixed below by scaling against this
// measured content box instead, and by anchoring origin at the silhouette's
// own center/feet fractions (not 0.5/1.0, which would still assume the
// content fills the full cell).
const PORTRAIT_CELL = 200
const PORTRAIT_CONTENT = { left: 70, top: 72, right: 128, bottom: 172 }
const PORTRAIT = {
  x: SPOTLIGHT.cx,
  y: SPOTLIGHT.groundY,
  // ~85% of the spotlight's height, per the brief ("按框高等比放大约框高85%").
  targetContentH: SPOTLIGHT.h * 0.85,
}

interface SlotSpec {
  x: number
  y: number
  w: number
  h: number
}

// ---- input: scene-level screen-space hit-testing, NOT Phaser setInteractive ----
// Every clickable rect below is tested by hand against the pointer's raw
// screen coordinates (converted to this window's local space by subtracting
// container.x/y) instead of using GameObject.setInteractive(). Reason: this
// entire window sits in a setScrollFactor(0) container, and Phaser hit-tests
// interactive objects by converting the pointer to WORLD space via the
// camera's current scroll -- it does not account for scrollFactor(0) -- so
// once BattleScene's camera scrolls even slightly (it does continuously,
// following the hero, and vertically during the L1 climb intro), every
// setInteractive() zone here drifts out from under its own rendered button
// while the button itself (correctly) stays put on screen. Symptom filed by
// the user: "打开背包后所有按钮点不动，窗口也关不掉" -- reproduced live via a
// forced camera scroll (scrollX=400): identical clicks that worked at
// scrollX=0 hit nothing once scrolled. Same root cause SkillBarHud hit first
// (4662cd6) and fixed the same way; this window just never got the same fix.
// See ui/screenHit.ts for the shared helper + why this generalizes to every
// other battle-time panel (FurnacePanel, ResultBanner, DialogueBox).
const within = withinRect
type HitResult =
  | { kind: 'close' }
  | { kind: 'tab'; tab: BackpackTab }
  | { kind: 'sell' }
  | { kind: 'prev' }
  | { kind: 'next' }
  | { kind: 'equip'; slot: EquipSlot; item: Item; rect: Rect }
  | { kind: 'grid'; stack: BackpackStack; rect: Rect }
const EQUIP_SLOTS: Record<EquipSlot, SlotSpec> = {
  weapon: { x: 251.7, y: 113.4, w: 50, h: 50 }, // zbwq 武器
  accessory: { x: 322.7, y: 113.4, w: 50, h: 50 }, // zbsp 饰品
  armor: { x: 251.7, y: 188.4, w: 50, h: 50 }, // zbfj 防具
  talisman: { x: 322.7, y: 188.4, w: 50, h: 50 }, // zbfb 法宝
}
// No system backs these (头衔/时装) -- greyed placeholders, non-interactive.
const TITLE_PLACEHOLDER: SlotSpec = { x: 54.1, y: 191.6, w: 50, h: 50 } // zbtx
const FASHION_PLACEHOLDER: SlotSpec = { x: 57.7, y: 113.4, w: 50, h: 50 } // zbsz
const FASHION_TOGGLE_PLACEHOLDER: SlotSpec = { x: 57.7, y: 165.6, w: 49, h: 18 } // showszmc

// Left panel 10-stat table, 2 columns x 5 rows. Labels are baked into
// backpack_bg; only the value text is drawn. x is each field's box CENTER
// (box-left-edge x from the report + that DefineEditText's own
// (xmin+xmax)/2 offset -- see NAME_VALUE comment above); every one of these
// ten fields is `align center` in the real SWF. y is each groove's true
// vertical center (flood-fill measured -- see NAME_VALUE comment above); all
// five rows land on the same two y's since the L/R columns share row height.
const STAT_L = [
  { key: 'hp', x: 156.5, y: 268, w: 109 },
  { key: 'atk', x: 157.1, y: 302, w: 108 },
  { key: 'luck', x: 155.4, y: 335, w: 108 },
  { key: 'crit', x: 157.5, y: 369, w: 113 },
  { key: 'hpRegen', x: 157.8, y: 402, w: 110 },
] as const
const STAT_R = [
  { key: 'mp', x: 319.9, y: 268, w: 108 },
  { key: 'def', x: 321.6, y: 302, w: 111 },
  { key: 'magicDef', x: 320.9, y: 335, w: 111 },
  { key: 'dodge', x: 319.3, y: 369, w: 111 },
  { key: 'mpRegen', x: 318.9, y: 402, w: 108 },
] as const

const EXP_VALUE = { x: 195.1, y: 436, w: 140 } // txt_exp center x = 127.1 + 68.0; y = EXP_FILL's vertical center (flood-fill measured)
// Pixel-scanned from backpack_bg.png: the baked black rounded EXP track sits
// at x=95..308, y=426..445. The fill texture is 214x20 with matching rounded
// alpha corners, so it aligns to the track's outer bbox and renders under txt_exp.
const EXP_FILL = { x: 95, y: 426, w: 214, h: 20 }

// Right panel: 4 category tabs, baked labels, 73x27 each, 74px pitch.
const TAB_ROW = { x: 405.9, y: 61.1, w: 73, h: 27, pitch: 74 }
const GRID_ORIGIN = { x: 405.9, y: 99.1 }
const CELL = { w: 50, h: 50, pitchX: 61, pitchY: 59 } // BackPackElement.as:197-198 -- x=col*(w+11) y=row*(h+9)
const GRID_COLS = 5
const GRID_ROWS = 5
const PAGE_SIZE = GRID_COLS * GRID_ROWS

// txt_lh (灵魂) is `align left` in the real SWF, but the brief explicitly
// asks for it centered both ways in its value sub-box (2026-07-09 polish
// pass) -- overriding SWF fidelity here per that direct request. 552.4 was
// already the value sub-box's left edge (right after the baked "灵魂" label,
// confirmed by flood-filling the groove: it spans the WHOLE labeled box
// x:[504,627], and 552.4+74=626.4 lines up with that box's right edge, so
// the original w:74 is exactly the value sub-box's width); x below is
// recentered to that sub-box's midpoint, y to its flood-filled vertical
// center (box y:[393,408] -> 400.5).
const SOUL_VALUE = { x: 552.4 + 74 / 2, y: 400.5, w: 74 }
const SELL_BTN = { x: 637.2, y: 392.2, w: 62, h: 28 }
const PREV_BTN = { x: 498.7, y: 419.2, w: 86, h: 34 }
const NEXT_BTN = { x: 616.9, y: 419.2, w: 86, h: 34 }
// x centered in the 32.2px gap between prePage/nextPage; y at the buttons'
// own vertical center (PREV_BTN.y + h/2) -- the old y (425.6) sat well above
// that, off-center relative to both buttons.
const NOWPAGE = { x: 600.8, y: PREV_BTN.y + PREV_BTN.h / 2, w: 30 }

const PORTRAIT_TEX = 'role1_0'
const PORTRAIT_FRAME = 0
// Same 200x200 cell grid / frame indexing as PORTRAIT_TEX, zero positional
// offset (BattleScene's weapon overlay mirrors the hero sprite frame-for-
// frame with no offset -- see BattleScene.ts's WEAPON_TEX/weaponSprite
// comments), so frame 0 here lines up on top of PORTRAIT_TEX frame 0 using
// the exact same transform (position/origin/scale) with no extra math.
const WEAPON_TEX = 'role1_equip0'

const DEFAULT_STATS: BackpackHeroStats = {
  name: '', level: 1, combatPower: 0, hp: 0, maxHp: 1, mp: 0, maxMp: 1, atk: 0, def: 0,
  luck: 0, magicDefPct: 0, critPct: 0, dodgePct: 0, hpRegen: 0, mpRegen: 0, exp: 0, expToNext: 1, soul: 0,
}

export class BackpackWindow {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: Required<Pick<BackpackWindowOptions, 'iconKeyFor'>> &
    Pick<BackpackWindowOptions, 'onClose' | 'onEquip' | 'onUnequip' | 'onSell'>

  private readonly nameText: Phaser.GameObjects.Text
  private readonly zdlText: Phaser.GameObjects.Text
  private readonly levelLayer: Phaser.GameObjects.Container
  private readonly statTexts: Record<string, Phaser.GameObjects.Text> = {}
  private readonly expText: Phaser.GameObjects.Text
  private readonly expFill: Phaser.GameObjects.Image | null
  private readonly soulText: Phaser.GameObjects.Text
  private readonly nowpageText: Phaser.GameObjects.Text
  private readonly weaponOverlay: Phaser.GameObjects.Image | null
  private readonly equipLayer: Phaser.GameObjects.Container
  private readonly tabHighlight: Phaser.GameObjects.Rectangle
  private readonly gridLayer: Phaser.GameObjects.Container
  private tooltip?: Phaser.GameObjects.Container

  private stats: BackpackHeroStats = DEFAULT_STATS
  private equipment: Equipment | null = null
  private allStacks: BackpackStack[] = []
  private tab: BackpackTab = 'equip'
  private page = 1

  // Rebuilt by redrawEquip()/redrawGrid() whenever their contents change;
  // consulted by resolveHit() instead of per-object setInteractive() (see the
  // scene-level hit-testing note above SlotSpec).
  private equipHits: { slot: EquipSlot; item: Item; rect: Rect }[] = []
  private gridHits: { stack: BackpackStack; rect: Rect }[] = []
  private hoveredItem: Item | null = null

  constructor(scene: Phaser.Scene, opts: BackpackWindowOptions = {}) {
    this.scene = scene
    this.opts = {
      iconKeyFor: opts.iconKeyFor ?? ((item) => (scene.textures.exists(`icon_${item.id}`) ? `icon_${item.id}` : ICON_FALLBACK_KEY)),
      onClose: opts.onClose,
      onEquip: opts.onEquip,
      onUnequip: opts.onUnequip,
      onSell: opts.onSell,
    }
    const children: Phaser.GameObjects.GameObject[] = []
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      children.push(o)
      return o
    }

    // Dim backdrop over the battlefield (visual only -- click-blocking used
    // to ride on setInteractive() here, but that's the same broken pattern
    // this whole window is being moved off of; nothing else in this scene is
    // mouse-clickable while battling, so there's nothing left to block).
    // Coordinates are LOCAL to this.container (added at BG_X,BG_Y below), not
    // canvas-absolute: a GameObject's x/y become container-local once handed
    // into `scene.add.container(x, y, children)` -- Phaser does not
    // re-normalize them to preserve world position. The previous (480,270)
    // was leftover canvas-center math from before this window had its own
    // container: nested at (BG_X,BG_Y) it actually rendered centered on world
    // (480+BG_X, 270+BG_Y) = (582.5, 291.5), an 960x540 rect covering world
    // x:[102.5,1062.5] y:[21.5,561.5] -- i.e. a BG_X-wide vertical strip at
    // the canvas's LEFT edge (and a BG_Y-tall strip at the top) was never
    // covered by the dim mask, left showing the full-brightness battlefield
    // through a visible "帘缝" while the corresponding strip past the right/
    // bottom canvas edge was harmlessly clipped. Subtracting the container
    // offset makes this rect cover the true canvas (0,0)-(960,540).
    add(scene.add.rectangle(480 - BG_X, 270 - BG_Y, 960, 540, 0x000000, 0.55))

    if (scene.textures.exists('backpack_bg')) {
      add(scene.add.image(0, 0, 'backpack_bg').setOrigin(0, 0))
    } else {
      const g = scene.add.graphics()
      g.fillStyle(HUD_COLORS.panel, 0.98).fillRoundedRect(0, 0, BG_W, BG_H, 16)
      g.lineStyle(2, HUD_COLORS.gold, 0.9).strokeRoundedRect(0, 0, BG_W, BG_H, 16)
      add(g)
    }

    // Close hotspot over the baked red X: no GameObject needed, resolveHit()
    // tests the CLOSE rect directly against pointer coords.

    this.nameText = add(this.makeCenteredText(NAME_VALUE.x, NAME_VALUE.y, NAME_VALUE.w))
    this.zdlText = add(this.makeCenteredText(ZDL_VALUE.x, ZDL_VALUE.y, ZDL_VALUE.w))

    this.levelLayer = add(scene.add.container(0, 0))

    // Portrait (adapted: original composites a fully-dressed dynamic render
    // into the headSit mount point; this project has no equivalent costume-
    // compositing pipeline, so the idle battle sprite stands in). Scaled and
    // anchored against the *measured content box* within the frame (see
    // PORTRAIT/PORTRAIT_CONTENT comments above), not the full 200x200 cell --
    // origin fractions below are that content box's own center-x/bottom-y
    // divided by the cell size, so the visible silhouette (not the cell's
    // padding) ends up horizontally centered on the spotlight and feet-down
    // on its ground pool.
    const portraitOriginX = (PORTRAIT_CONTENT.left + PORTRAIT_CONTENT.right) / 2 / PORTRAIT_CELL
    const portraitOriginY = PORTRAIT_CONTENT.bottom / PORTRAIT_CELL
    const portraitContentH = PORTRAIT_CONTENT.bottom - PORTRAIT_CONTENT.top
    const portraitScale = PORTRAIT.targetContentH / portraitContentH
    if (scene.textures.exists(PORTRAIT_TEX)) {
      const portrait = scene.add
        .image(PORTRAIT.x, PORTRAIT.y, PORTRAIT_TEX, PORTRAIT_FRAME)
        .setOrigin(portraitOriginX, portraitOriginY)
        .setScale(portraitScale)
      add(portrait)
    }
    // Weapon-in-hand overlay: same cell grid/frame/transform as the portrait
    // above (see WEAPON_TEX comment) so it lands directly on the idle pose's
    // fist with no extra alignment math. Hidden by default; redrawEquip()
    // toggles it with the weapon slot's fill state.
    this.weaponOverlay = scene.textures.exists(WEAPON_TEX)
      ? add(
          scene.add
            .image(PORTRAIT.x, PORTRAIT.y, WEAPON_TEX, PORTRAIT_FRAME)
            .setOrigin(portraitOriginX, portraitOriginY)
            .setScale(portraitScale)
            .setVisible(false),
        )
      : null

    this.equipLayer = add(scene.add.container(0, 0))
    this.buildPlaceholderSlot(TITLE_PLACEHOLDER, children)
    this.buildPlaceholderSlot(FASHION_PLACEHOLDER, children)
    this.buildPlaceholderSlot(FASHION_TOGGLE_PLACEHOLDER, children)

    // 10-stat table -- all ten fields are `align center` in the real SWF.
    for (const s of STAT_L) this.statTexts[s.key] = add(this.makeCenteredText(s.x, s.y, s.w))
    for (const s of STAT_R) this.statTexts[s.key] = add(this.makeCenteredText(s.x, s.y, s.w))

    this.expFill = scene.textures.exists('backpack_exp_fill')
      ? add(scene.add.image(EXP_FILL.x, EXP_FILL.y, 'backpack_exp_fill').setOrigin(0, 0))
      : null
    this.expText = add(this.makeCenteredText(EXP_VALUE.x, EXP_VALUE.y, EXP_VALUE.w, 12))

    // Right panel: category tabs.
    this.tabHighlight = add(
      scene.add
        .rectangle(TAB_ROW.x, TAB_ROW.y, TAB_ROW.w, TAB_ROW.h, HUD_COLORS.goldBright, 0.3)
        .setOrigin(0, 0)
        .setStrokeStyle(2, HUD_COLORS.goldBright, 0.9),
    )
    // Disabled-tab dark overlays are still real GameObjects (visual only);
    // the clickable tabs themselves are resolved by resolveHit() against
    // TAB_ROW + index*pitch, no per-tab hotspot GameObject needed.
    TAB_ORDER.forEach((tabId, i) => {
      if (!DISABLED_TABS.has(tabId)) return
      const tx = TAB_ROW.x + i * TAB_ROW.pitch
      add(scene.add.rectangle(tx, TAB_ROW.y, TAB_ROW.w, TAB_ROW.h, 0x1a1a1a, 0.55).setOrigin(0, 0))
    })

    this.gridLayer = add(scene.add.container(0, 0))

    this.soulText = add(this.makeCenteredText(SOUL_VALUE.x, SOUL_VALUE.y, SOUL_VALUE.w))
    // Sell/prev/next hotspots: resolveHit() tests SELL_BTN/PREV_BTN/NEXT_BTN
    // directly, no hotspot GameObjects needed.
    this.nowpageText = add(this.makeCenteredText(NOWPAGE.x, NOWPAGE.y, NOWPAGE.w, 12))

    this.container = scene.add
      .container(BG_X, BG_Y, children)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false)

    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointermove', this.onPointerMove)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
    })
  }

  /** Pointer (screen coords) -> this window's local coords. Valid because
   * the container is scrollFactor(0), scale 1, unrotated -- see the hit-
   * testing note above SlotSpec. */
  private toLocal(pointer: Phaser.Input.Pointer): { lx: number; ly: number } {
    const p = logicalPointerPosition(pointer)
    return { lx: p.x - this.container.x, ly: p.y - this.container.y }
  }

  private resolveHit(lx: number, ly: number): HitResult | null {
    if (within(lx, ly, CLOSE)) return { kind: 'close' }
    for (let i = 0; i < TAB_ORDER.length; i++) {
      const tabId = TAB_ORDER[i]
      if (DISABLED_TABS.has(tabId)) continue
      const rect: Rect = { x: TAB_ROW.x + i * TAB_ROW.pitch, y: TAB_ROW.y, w: TAB_ROW.w, h: TAB_ROW.h }
      if (within(lx, ly, rect)) return { kind: 'tab', tab: tabId }
    }
    if (within(lx, ly, SELL_BTN)) return { kind: 'sell' }
    if (within(lx, ly, PREV_BTN)) return { kind: 'prev' }
    if (within(lx, ly, NEXT_BTN)) return { kind: 'next' }
    for (const h of this.equipHits) if (within(lx, ly, h.rect)) return { kind: 'equip', slot: h.slot, item: h.item, rect: h.rect }
    for (const h of this.gridHits) if (within(lx, ly, h.rect)) return { kind: 'grid', stack: h.stack, rect: h.rect }
    return null
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const { lx, ly } = this.toLocal(pointer)
    const hit = this.resolveHit(lx, ly)
    if (!hit) return
    switch (hit.kind) {
      case 'close':
        this.opts.onClose?.()
        break
      case 'tab':
        this.setTab(hit.tab)
        break
      case 'sell':
        this.opts.onSell?.()
        break
      case 'prev':
        this.setPage(this.page - 1)
        break
      case 'next':
        this.setPage(this.page + 1)
        break
      case 'equip':
        this.opts.onUnequip?.(hit.slot)
        break
      case 'grid':
        if (hit.stack.item.kind === 'equip') this.opts.onEquip?.(hit.stack.item)
        break
    }
  }

  /** Hand cursor + tooltip on hover -- replaces the per-object
   * useHandCursor/pointerover/pointerout that setInteractive() used to give
   * for free (lost when this window moved off setInteractive(), see the
   * hit-testing note above SlotSpec). */
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const { lx, ly } = this.toLocal(pointer)
    const hit = this.resolveHit(lx, ly)
    this.scene.input.manager.canvas.style.cursor = hit ? 'pointer' : ''
    const item = hit?.kind === 'equip' || hit?.kind === 'grid' ? (hit.kind === 'equip' ? hit.item : hit.stack.item) : null
    if (item !== this.hoveredItem) {
      this.hoveredItem = item
      if (item && hit && 'rect' in hit) this.showTooltip(hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h / 2, item)
      else this.hideTooltip()
    }
  }

  open(): this {
    this.container.setVisible(true)
    return this
  }

  close(): this {
    this.hideTooltip()
    this.container.setVisible(false)
    this.scene.input.manager.canvas.style.cursor = ''
    this.hoveredItem = null
    return this
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  setHeroStats(stats: BackpackHeroStats): void {
    this.stats = stats
    this.redrawStats()
  }

  setEquipment(eq: Equipment): void {
    this.equipment = eq
    this.redrawEquip()
  }

  /** Full bag contents; the window filters by the active tab itself
   * (装备=kind 'equip', 道具=everything else -- this project's single
   * Inventory has no separate zblist/djlist arrays like AS3, see report). */
  setInventory(stacks: BackpackStack[]): void {
    this.allStacks = stacks
    this.page = Math.min(this.page, this.totalPages())
    if (this.page < 1) this.page = 1
    this.redrawGrid()
  }

  // ---------- internals ----------

  /** Center-anchored value text -- every value field in this window,
   * including txt_lh (灵魂): the real SWF marks that one `align left`, but
   * the brief explicitly asks it centered like the rest (2026-07-09 polish
   * pass, see SOUL_VALUE comment). Every field's DefineEditText tag in
   * out_res/backpack1.swf otherwise reports `align center` (verified per-
   * field, see the constants' comments above). `x`/`y` are each field's box
   * CENTER (not left edge / top edge) -- origin(0.5,0.5) centers the text on
   * both axes within its groove regardless of the font's own line-height
   * padding, which a top-anchored origin(0.5,0) could not do consistently. */
  private makeCenteredText(x: number, y: number, boxWidth: number, size = 14): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, '', { fontSize: `${size}px`, fontStyle: 'bold', color: HUD_COLORS.text, wordWrap: { width: boxWidth }, align: 'center' })
      .setOrigin(0.5, 0.5)
  }

  private buildPlaceholderSlot(spec: SlotSpec, children: Phaser.GameObjects.GameObject[]): void {
    children.push(
      this.scene.add.rectangle(spec.x, spec.y, spec.w, spec.h, 0x0a0a0a, 0.45).setOrigin(0, 0),
    )
  }

  private setTab(tab: BackpackTab): void {
    if (DISABLED_TABS.has(tab) || this.tab === tab) return
    this.tab = tab
    this.page = 1
    const i = TAB_ORDER.indexOf(tab)
    this.tabHighlight.setPosition(TAB_ROW.x + i * TAB_ROW.pitch, TAB_ROW.y)
    this.redrawGrid()
  }

  private setPage(page: number): void {
    const clamped = Math.max(1, Math.min(this.totalPages(), page))
    if (clamped === this.page) return
    this.page = clamped
    this.redrawGrid()
  }

  private filteredStacks(): BackpackStack[] {
    return this.tab === 'equip'
      ? this.allStacks.filter((s) => s.item.kind === 'equip')
      : this.tab === 'item'
        ? this.allStacks.filter((s) => s.item.kind !== 'equip')
        : [] // fashion/script: no backing data
  }

  private totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredStacks().length / PAGE_SIZE))
  }

  private redrawStats(): void {
    const s = this.stats
    this.nameText.setText(this.resolveDisplayName(s.name))
    this.zdlText.setText(String(Math.round(s.combatPower)))
    this.statTexts.hp.setText(`${Math.max(0, Math.round(s.hp))} / ${Math.round(s.maxHp)}`)
    this.statTexts.mp.setText(`${Math.max(0, Math.round(s.mp))} / ${Math.round(s.maxMp)}`)
    this.statTexts.atk.setText(String(Math.round(s.atk)))
    this.statTexts.def.setText(String(Math.round(s.def)))
    this.statTexts.luck.setText(String(Math.round(s.luck)))
    this.statTexts.magicDef.setText(`${Math.round(s.magicDefPct)} %`)
    this.statTexts.crit.setText(`${Math.round(s.critPct)} %`)
    this.statTexts.dodge.setText(`${Math.round(s.dodgePct)} %`)
    this.statTexts.hpRegen.setText(String(Math.round(s.hpRegen)))
    this.statTexts.mpRegen.setText(String(Math.round(s.mpRegen)))
    this.expText.setText(`${Math.round(s.exp)} / ${Math.round(s.expToNext)}`)
    if (this.expFill) {
      const f = s.expToNext > 0 ? Math.max(0, Math.min(1, s.exp / s.expToNext)) : 0
      this.expFill.setCrop(0, 0, Math.max(0, EXP_FILL.w * f), EXP_FILL.h)
    }
    this.soulText.setText(String(Math.round(s.soul)))
    this.redrawLevelBadge(Math.max(1, Math.floor(s.level)))
  }

  /** 昵称 should show the logged-in social account's username, not the
   * static hero name -- same client-resolution path as LobbyScene's
   * runtimeSocialClient() (getSharedSocialClient + resolveSocialServerBaseUrl
   * off window.location.search / VITE_SOCIAL_SERVER_URL), just inlined here
   * since this window has no scene-level client of its own to borrow. Reads
   * the session live on every redraw (cheap: getSharedSocialClient caches a
   * singleton, getSession() is a plain field read) so a login that happens
   * while the game is running is picked up without recreating the window.
   * `window` doesn't exist in this project's node-based vitest environment
   * (see tests/save.test.ts's note on the same gap) -- guarded so
   * construction/redraw never throws there; falls back to the hero name
   * (heroName) whenever there's no window, no session, or the request throws. */
  private resolveDisplayName(heroName: string): string {
    if (typeof window === 'undefined') return heroName
    try {
      const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
      const username = getSharedSocialClient(baseUrl).getSession()?.user.username
      return username && username.length > 0 ? username : heroName
    } catch {
      return heroName
    }
  }

  private resolveIconKey(item: Item): string {
    return this.opts.iconKeyFor(item)
  }

  /** Ports BackPack.as leveImage(): single digit centered, multi-digit spliced
   * left-to-right at a 26px pitch, both local to the level badge. */
  private redrawLevelBadge(level: number): void {
    this.levelLayer.removeAll(true)
    const digits = String(level).split('')
    digits.forEach((d, i) => {
      const key = `backpack_digit_${d}`
      if (!this.scene.textures.exists(key)) return
      const x = digits.length === 1 ? LEVEL_BADGE.x + 21.8 : LEVEL_BADGE.x + 5.8 + i * 26
      const y = LEVEL_BADGE.y + 13
      this.levelLayer.add(this.scene.add.image(x, y, key).setOrigin(0, 0))
    })
  }

  private redrawEquip(): void {
    this.equipLayer.removeAll(true)
    this.equipHits = []
    this.weaponOverlay?.setVisible(!!this.equipment?.weapon)
    if (!this.equipment) return
    ;(Object.keys(EQUIP_SLOTS) as EquipSlot[]).forEach((slot) => {
      const item = this.equipment![slot]
      if (!item) return
      const spec = EQUIP_SLOTS[slot]
      const cx = spec.x + spec.w / 2
      const cy = spec.y + spec.h / 2
      const key = this.resolveIconKey(item)
      if (this.scene.textures.exists(key)) {
        const icon = this.scene.add.image(cx, cy, key)
        icon.setScale(Math.min(1, (spec.w - 6) / Math.max(icon.width, icon.height)))
        this.equipLayer.add(icon)
      }
      // Click/hover hotspot: see resolveHit(), not a GameObject any more.
      this.equipHits.push({ slot, item, rect: { x: spec.x, y: spec.y, w: spec.w, h: spec.h } })
    })
  }

  private redrawGrid(): void {
    this.gridLayer.removeAll(true)
    this.gridHits = []
    this.hideTooltip()
    const items = this.filteredStacks().slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const i = row * GRID_COLS + col
        const x = GRID_ORIGIN.x + col * CELL.pitchX
        const y = GRID_ORIGIN.y + row * CELL.pitchY
        this.buildCell(x, y, items[i])
      }
    }
    // No spaces around the slash: the 30px NOWPAGE box wraps "1 / 1" onto two
    // lines (fidelity-C follow-up verdict -- single line beats wrapped).
    this.nowpageText.setText(`${this.page}/${this.totalPages()}`)
  }

  private buildCell(x: number, y: number, stack: BackpackStack | undefined): void {
    if (this.scene.textures.exists('backpack_slot')) {
      this.gridLayer.add(this.scene.add.image(x, y, 'backpack_slot').setOrigin(0, 0))
    } else {
      const g = this.scene.add.graphics()
      g.fillStyle(0x2a1c10, 1).fillRoundedRect(x, y, CELL.w, CELL.h, 6)
      g.lineStyle(1, HUD_COLORS.gold, 0.5).strokeRoundedRect(x, y, CELL.w, CELL.h, 6)
      this.gridLayer.add(g)
    }
    if (!stack) return
    const cx = x + CELL.w / 2
    const cy = y + CELL.h / 2

    const iconKey = this.resolveIconKey(stack.item)
    if (this.scene.textures.exists(iconKey)) {
      const icon = this.scene.add.image(cx, cy, iconKey)
      icon.setScale(Math.min(1, (CELL.w - 10) / Math.max(icon.width, icon.height)))
      this.gridLayer.add(icon)
    }
    if (stack.qty > 1) {
      this.gridLayer.add(
        this.scene.add
          .text(x + CELL.w - 4, y + CELL.h - 3, String(stack.qty), { fontSize: '12px', fontStyle: 'bold', color: '#ffffff' })
          .setOrigin(1, 1)
          .setShadow(1, 1, '#000000', 2),
      )
    }
    // Click/hover hotspot: see resolveHit(), not a GameObject any more.
    this.gridHits.push({ stack, rect: { x, y, w: CELL.w, h: CELL.h } })
  }

  private showTooltip(cx: number, cy: number, item: Item): void {
    this.hideTooltip()
    const lines = [
      { t: item.name, c: rarityCss(item.rarity), size: 15, bold: true },
      { t: `品质：${rarityName(item.rarity)}`, c: HUD_COLORS.textDim, size: 12, bold: false },
      { t: kindLabel(item.kind), c: HUD_COLORS.textDim, size: 12, bold: false },
    ]
    if (item.effects && item.effects.length) {
      for (const e of item.effects) lines.push({ t: effectLabel(e), c: '#e8d9a0', size: 12, bold: false })
    }
    const texts = lines.map((l, i) =>
      this.scene.add
        .text(0, i * 17, l.t, { fontSize: `${l.size}px`, color: l.c, fontStyle: l.bold ? 'bold' : 'normal' })
        .setOrigin(0, 0),
    )
    const w = Math.max(...texts.map((t) => t.width)) + 20
    const h = lines.length * 17 + 12
    const bg = this.scene.add.graphics()
    bg.fillStyle(HUD_COLORS.ink, 0.95).fillRoundedRect(0, 0, w, h, 8)
    bg.lineStyle(1.5, HUD_COLORS.gold, 0.9).strokeRoundedRect(0, 0, w, h, 8)
    texts.forEach((t) => t.setPosition(10, 6 + (t.y as number)))
    const tip = this.scene.add.container(Math.min(cx + 30, BG_W - w - 4), cy - h / 2, [bg, ...texts])
    this.container.add(tip)
    this.tooltip = tip
  }

  private hideTooltip(): void {
    this.tooltip?.destroy(true)
    this.tooltip = undefined
  }
}

function kindLabel(kind: Item['kind']): string {
  return kind === 'equip' ? '装备' : kind === 'consumable' ? '道具' : '材料'
}

function effectLabel(e: NonNullable<Item['effects']>[number]): string {
  if (e.type === 'stat') {
    const names: Record<string, string> = { atk: '攻击', def: '防御', hp: '生命', mp: '法力', crit: '暴击' }
    return `${names[e.stat] ?? e.stat} +${e.value}`
  }
  const names: Record<string, string> = { burn: '灼烧', lifesteal: '吸血', freeze: '冰冻' }
  return `${names[e.effect] ?? e.effect} ${Math.round(e.chance * 100)}%`
}
