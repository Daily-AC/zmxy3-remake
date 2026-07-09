import Phaser from 'phaser'
import type { Item } from '../../systems/items'
import type { EquipSlot, Equipment } from '../../systems/equipment'
import { HUD_COLORS, ICON_FALLBACK_KEY } from './hudTheme'
import { rarityCss, rarityName } from './rarity'
import { withinRect, type Rect } from '../screenHit'

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
// Value-text anchors below are CENTERS (see makeValueText), not left edges.
// Source: out_res/backpack1.swf's own DefineEditText tags for each named
// field (txt_name/txt_zdl/txt_hp/... chid388/418/391/...), extracted via
// `ffdec -format text:formatted -selectid <chids> -export text`. Every one of
// them reports `align center` except txt_lh (灵魂) which is `align left` --
// that's the real ground truth for "居中/居左": the report's box-left-edge
// x's (still valid for POSITION) plus each field's own (xmin+xmax)/2 offset
// (in the DefineEditText's local twips, applied unscaled since these
// PlaceObjects carry no matrix scale) give the true center x used below.
const NAME_VALUE = { x: 179.4, y: 67.3, w: 109 } // txt_name center = 127.1 + 52.3
const ZDL_VALUE = { x: 176.4, y: 93.1, w: 109 } // txt_zdl center = 124.1 + 52.3
const LEVEL_BADGE = { x: 268.6, y: 52.6, w: 83, h: 59 }
// headSit mount point, out_res/backpack1.swf sprite444 PlaceObject `name="headSit"`
// local (tx,ty) = (280.25,235.85) twips/20 -> crop-space (169.9,182.6) via the
// report's shared affine offset (-110.3,-53.3). The previous build used the
// RAW un-transformed local (280,235) directly as a crop coordinate -- that's
// the actual "武器栏里蹲了一只悟空" bug: it shifted the portrait ~110px right,
// straight on top of the weapon/accessory equip-slot cluster (x 251.7-372.7).
// Fixed to the real headSit x; size trimmed from 150->110 so it sits cleanly
// in the gap between the title/fashion placeholders (right edge ~108) and the
// equip-slot cluster (left edge 251.7), matching the reference screenshot's
// layout (立绘 stands alone in that gap, not overlapping either icon column).
const PORTRAIT = { x: 169.9, y: 182.6, fit: 110 }

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
// backpack_bg; only the value text is drawn. x below is each field's CENTER
// (box-left-edge x from the report + that DefineEditText's own
// (xmin+xmax)/2 offset -- see NAME_VALUE comment above); every one of these
// ten fields is `align center` in the real SWF.
const STAT_L = [
  { key: 'hp', x: 156.5, y: 260.3, w: 109 },
  { key: 'atk', x: 157.1, y: 293.7, w: 108 },
  { key: 'luck', x: 155.4, y: 327.7, w: 108 },
  { key: 'crit', x: 157.5, y: 360.8, w: 113 },
  { key: 'hpRegen', x: 157.8, y: 394.2, w: 110 },
] as const
const STAT_R = [
  { key: 'mp', x: 319.9, y: 260.3, w: 108 },
  { key: 'def', x: 321.6, y: 293.7, w: 111 },
  { key: 'magicDef', x: 320.9, y: 327.7, w: 111 },
  { key: 'dodge', x: 319.3, y: 361.3, w: 111 },
  { key: 'mpRegen', x: 318.9, y: 393.8, w: 108 },
] as const

const EXP_VALUE = { x: 195.1, y: 428.8, w: 140 } // txt_exp center = 127.1 + 68.0, also align center
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

// txt_lh (灵魂) is the one field the real SWF marks `align left` -- kept as
// the box's left edge (matches the existing makeValueText left-origin path).
const SOUL_VALUE = { x: 552.4, y: 397.2, w: 74 }
const SELL_BTN = { x: 637.2, y: 392.2, w: 62, h: 28 }
const PREV_BTN = { x: 498.7, y: 419.2, w: 86, h: 34 }
const NEXT_BTN = { x: 616.9, y: 419.2, w: 86, h: 34 }
const NOWPAGE = { x: 600.8, y: 425.6, w: 30 } // centered in the 32.2px gap between prePage and nextPage

const PORTRAIT_TEX = 'role1_0'
const PORTRAIT_FRAME = 0

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
    add(scene.add.rectangle(480, 270, 960, 540, 0x000000, 0.55))

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
    // compositing pipeline, so the idle battle sprite stands in). Positioned
    // at headSit's real coordinate (see PORTRAIT comment above) and sized to
    // fit the gap between the title/fashion placeholders and the equip-slot
    // cluster without overlapping either -- the previous build's wrong
    // coordinate is what put a full-size Wukong on top of the weapon slot.
    if (scene.textures.exists(PORTRAIT_TEX)) {
      const portrait = scene.add.image(PORTRAIT.x, PORTRAIT.y, PORTRAIT_TEX, PORTRAIT_FRAME).setOrigin(0.5, 0.85)
      const fit = PORTRAIT.fit / Math.max(portrait.width, portrait.height)
      portrait.setScale(fit)
      add(portrait)
    }

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

    this.soulText = add(this.makeValueText(SOUL_VALUE.x, SOUL_VALUE.y, SOUL_VALUE.w))
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
    return { lx: pointer.x - this.container.x, ly: pointer.y - this.container.y }
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

  /** Left-anchored value text -- only txt_lh (灵魂, `align left` in the real SWF) uses this. */
  private makeValueText(x: number, y: number, wrapWidth: number, size = 14): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, '', { fontSize: `${size}px`, fontStyle: 'bold', color: HUD_COLORS.text, wordWrap: { width: wrapWidth }, align: 'left' })
      .setOrigin(0, 0)
  }

  /** Center-anchored value text -- every other stat/name/exp/nowpage field:
   * every one of their DefineEditText tags in out_res/backpack1.swf reports
   * `align center` (verified per-field, see the constants' comments above).
   * `x` is the field's box CENTER, not its left edge. */
  private makeCenteredText(x: number, y: number, boxWidth: number, size = 14): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, '', { fontSize: `${size}px`, fontStyle: 'bold', color: HUD_COLORS.text, wordWrap: { width: boxWidth }, align: 'center' })
      .setOrigin(0.5, 0)
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
    this.nameText.setText(s.name)
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
    if (!this.equipment) return
    ;(Object.keys(EQUIP_SLOTS) as EquipSlot[]).forEach((slot) => {
      const item = this.equipment![slot]
      if (!item) return
      const spec = EQUIP_SLOTS[slot]
      const cx = spec.x + spec.w / 2
      const cy = spec.y + spec.h / 2
      const key = this.opts.iconKeyFor(item)
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
    this.nowpageText.setText(`${this.page} / ${this.totalPages()}`)
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

    const iconKey = this.opts.iconKeyFor(stack.item)
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
