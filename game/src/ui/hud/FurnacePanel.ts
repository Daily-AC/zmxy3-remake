import Phaser from 'phaser'
import type { Item } from '../../systems/items'
import { HUD_COLORS, ICON_FALLBACK_KEY } from './hudTheme'
import { rarityCss } from './rarity'
import { withinRect, type Rect } from '../screenHit'
import { MODAL_PANEL_DEPTH } from './depths'
import { logicalPointerPosition } from '../../systems/renderScale'

// 炼丹炉 (forge) window on the ORIGINAL art: the official StrengthEquipment 打造
// tab. Two pieces of real 4399 art compose it:
//   - furnace_frame  = the ink-brush window with the baked 炼丹炉 title
//     (StrengthEquipmentv1090.swf / docs/reference/zmxy3-official/furnace-ui/
//     panel-header-炼丹炉.png), the outer 八卦炉 window;
//   - furnace_making = export.strength.Making, the material-into-craft layout:
//     制作书 + 基本材料 x2 + 宝石 x3 slots -> 生成物 result, 打造 button.
//
// This is a straight presentation swap for the agent-furnace flow that used to
// run inside the 水墨 dialogue overlay. The FLOW is unchanged: pick material
// lots -> live 炉火 budget -> describe the wish -> 打造 fires onCraftSubmit, and
// the scene runs the exact same lockMaterials/craftRequest/validate/addItem
// protocol. The wish-description input is our agent-forge increment (the
// original 打造 is a deterministic recipe); everything else mirrors the game.
export const ASSET_SOURCE_ONLINE = false // 打造 art is official 造3 (Online 大闹天庭篇)

export const FRAME_TEX = 'furnace_frame'
const MAKING_TEX = 'furnace_making'

// The 打造 layout (furnace_making) sits on the LEFT of the window; the material
// picker + wish input + budget live on the RIGHT. Coordinates below are all
// screen-space in the 960x540 game canvas.
export const WIN = { cx: 480, cy: 272 }
export const FRAME_SCALE = 1.05 // fits 479px art inside 540 canvas, 炼丹炉 title visible
const MAKING = { x: 312, y: 272 } // furnace_making center (354x385, origin center)

// Slot centers inside furnace_making, image-local (origin = image center):
// 5 input slots (2 基本材料 + 3 宝石) + 1 生成物 result.
const INPUT_SLOTS: { x: number; y: number }[] = [
  { x: -104, y: -86 }, // 基本材料 L
  { x: 52, y: -86 }, // 基本材料 R
  { x: -108, y: -13 }, // 宝石 1
  { x: 0, y: -13 }, // 宝石 2
  { x: 108, y: -13 }, // 宝石 3
]
const RESULT_SLOT = { x: -108, y: 122 } // 生成物
const CRAFT_BTN = { x: 42, y: 158, w: 120, h: 38 } // baked 打造 button hotspot
const ICON_FIT = 40

const GOLD = 0xd9b45a
const INK = 0x0c0d12

/** A craft lot: how many of a bag material the player fed the furnace. */
export interface CraftLot {
  item: Item
  qty: number
}
/** One selectable material the furnace can spend. */
export interface CraftMaterialOption {
  item: Item
  owned: number
}

export interface FurnacePanelOptions {
  iconKeyFor?: (item: Item) => string
  /** Fired with the wish + picked lots when the player clicks 打造 / presses Enter. */
  onCraftSubmit?: (description: string, lots: CraftLot[]) => void
  /** One-line 炉火 budget preview for the current selection (scene computes it). */
  budgetPreview?: (lots: CraftLot[]) => string
  onClose?: () => void
}

interface Chip {
  opt: CraftMaterialOption
  selected: number
  rect: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  /** Click/hover hotspot in screen space -- see onPointerDown/onPointerMove,
   * not Phaser's setInteractive() (this whole panel sits in a
   * scrollFactor(0) container inside BattleScene's scrolling camera). */
  hitRect: Rect
}

function centerRect(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export class FurnacePanel {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: Required<Pick<FurnacePanelOptions, 'iconKeyFor'>> &
    Pick<FurnacePanelOptions, 'onCraftSubmit' | 'budgetPreview' | 'onClose'>
  private readonly slotLayer: Phaser.GameObjects.Container
  private readonly pickerLayer: Phaser.GameObjects.Container
  private readonly resultText: Phaser.GameObjects.Text
  private readonly budgetText: Phaser.GameObjects.Text
  private readonly craftBtn: Phaser.GameObjects.Rectangle
  private readonly dom: Phaser.GameObjects.DOMElement
  private input!: HTMLInputElement
  private chips: Chip[] = []
  private locked = false
  private currentResult: Item | null = null
  private readonly craftRect: Rect
  private readonly closeRect: Rect

  constructor(scene: Phaser.Scene, opts: FurnacePanelOptions = {}) {
    this.scene = scene
    this.opts = {
      iconKeyFor:
        opts.iconKeyFor ?? ((item) => (scene.textures.exists(`icon_${item.id}`) ? `icon_${item.id}` : ICON_FALLBACK_KEY)),
      onCraftSubmit: opts.onCraftSubmit,
      budgetPreview: opts.budgetPreview,
      onClose: opts.onClose,
    }
    const children: Phaser.GameObjects.GameObject[] = []

    // Dim backdrop (visual only -- see ui/screenHit.ts for why click-blocking
    // doesn't ride on setInteractive() here).
    const dim = scene.add.rectangle(480, 270, 960, 540, 0x000000, 0.6)
    children.push(dim)

    // 炼丹炉 window frame (falls back to a drawn ink panel if art is missing).
    if (scene.textures.exists(FRAME_TEX)) {
      children.push(scene.add.image(WIN.cx, WIN.cy, FRAME_TEX).setScale(FRAME_SCALE))
    } else {
      const g = scene.add.graphics()
      g.fillStyle(HUD_COLORS.panel, 0.98).fillRoundedRect(WIN.cx - 460, WIN.cy - 250, 920, 500, 16)
      g.lineStyle(3, GOLD, 0.9).strokeRoundedRect(WIN.cx - 460, WIN.cy - 250, 920, 500, 16)
      children.push(g)
      children.push(scene.add.text(WIN.cx - 440, WIN.cy - 240, '炼丹炉', { fontSize: '22px', color: '#f2c65a', fontStyle: 'bold' }))
    }

    // The 打造 layout art on the left.
    if (scene.textures.exists(MAKING_TEX)) {
      children.push(scene.add.image(MAKING.x, MAKING.y, MAKING_TEX))
    }
    this.slotLayer = scene.add.container(0, 0)
    children.push(this.slotLayer)

    // 打造 button over the baked art -- hover/click handled by resolveHit(),
    // not setInteractive() (see ui/screenHit.ts).
    this.craftRect = centerRect(MAKING.x + CRAFT_BTN.x, MAKING.y + CRAFT_BTN.y, CRAFT_BTN.w, CRAFT_BTN.h)
    this.craftBtn = scene.add.rectangle(MAKING.x + CRAFT_BTN.x, MAKING.y + CRAFT_BTN.y, CRAFT_BTN.w, CRAFT_BTN.h, 0xffffff, 0.001)
    children.push(this.craftBtn)

    // ---- Right column: title, picker, wish input, budget ----
    const rx = 512 // right-column left edge
    children.push(
      scene.add.text(rx, 96, '择材入炉', { fontSize: '18px', color: '#f0d99a', fontStyle: 'bold' }).setShadow(1, 1, '#000', 3),
    )
    children.push(
      scene.add
        .text(rx, 122, '点材料择数 · 下方写下心愿 · 点「打造」', { fontSize: '12px', color: '#c8bfa6' })
        .setShadow(1, 1, '#000', 2),
    )

    this.pickerLayer = scene.add.container(0, 0)
    children.push(this.pickerLayer)

    this.budgetText = scene.add
      .text(rx, 372, '炉火预算：0 点', { fontSize: '14px', color: '#ffcf7a', fontStyle: 'bold' })
      .setShadow(1, 1, '#000', 3)
    children.push(this.budgetText)

    // Crafted-item readout (shown when a result is set).
    this.resultText = scene.add
      .text(rx, 394, '', { fontSize: '13px', color: HUD_COLORS.textGold })
      .setShadow(1, 1, '#000', 3)
    children.push(this.resultText)

    children.push(
      scene.add.text(rx, 412, '心愿', { fontSize: '13px', color: '#c8bfa6' }).setShadow(1, 1, '#000', 2),
    )
    this.dom = this.buildInput(rx, 434, 300)
    children.push(this.dom)

    // 返回 (close) button, top-right of the window.
    this.closeRect = centerRect(792, 92, 66, 30)
    const closeBtn = scene.add.rectangle(792, 92, 66, 30, INK, 0.85).setStrokeStyle(2, 0x8a7f66, 1)
    const closeLabel = scene.add.text(792, 92, '返回', { fontSize: '14px', color: '#f2eddf' }).setOrigin(0.5)
    children.push(closeBtn, closeLabel)

    this.container = scene.add.container(0, 0, children).setScrollFactor(0).setDepth(MODAL_PANEL_DEPTH).setVisible(false)

    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointermove', this.onPointerMove)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
    })
  }

  /** See ui/screenHit.ts -- one scene-level listener for the whole panel
   * instead of setInteractive() per button, so chips rebuilt on every
   * open()/rebuildChips() never need their own listener wiring/cleanup. */
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const p = logicalPointerPosition(pointer)
    const lx = p.x - this.container.x
    const ly = p.y - this.container.y
    if (withinRect(lx, ly, this.closeRect)) {
      this.close()
      return
    }
    if (!this.locked && withinRect(lx, ly, this.craftRect)) {
      this.submit()
      return
    }
    for (const chip of this.chips) {
      if (withinRect(lx, ly, chip.hitRect)) {
        this.cycleChip(chip)
        return
      }
    }
  }

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const p = logicalPointerPosition(pointer)
    const lx = p.x - this.container.x
    const ly = p.y - this.container.y
    const overCraft = !this.locked && withinRect(lx, ly, this.craftRect)
    this.craftBtn.setFillStyle(0xffffff, overCraft ? 0.12 : 0.001)
    const overAny = overCraft || withinRect(lx, ly, this.closeRect) || this.chips.some((c) => withinRect(lx, ly, c.hitRect))
    this.scene.input.manager.canvas.style.cursor = overAny ? 'pointer' : ''
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  /** Open the furnace with the player's current bag materials. */
  open(options: CraftMaterialOption[]): void {
    this.locked = false
    this.currentResult = null
    this.rebuildChips(options)
    this.setResult(null)
    this.input.value = ''
    this.input.placeholder = '描述想要的法宝，如：一柄能吸血的火杖'
    this.refreshSlots()
    this.refreshBudget()
    this.container.setVisible(true)
    setTimeout(() => this.input.focus(), 0)
  }

  close(): void {
    if (!this.container.visible) return
    this.container.setVisible(false)
    this.input.blur()
    this.scene.input.manager.canvas.style.cursor = ''
    this.opts.onClose?.()
  }

  /** Freeze the panel while a craft is in flight (no double-submit). */
  setCraftLocked(locked: boolean): void {
    this.locked = locked
    this.input.disabled = locked
    this.craftBtn.setFillStyle(0xffffff, 0.001)
  }

  clearInput(): void {
    this.input.value = ''
  }

  /** Show the crafted item in the 生成物 slot + a rarity-colored readout. */
  setResult(item: Item | null): void {
    this.currentResult = item
    this.refreshSlots()
    if (item) this.resultText.setText(`生成：${item.name}`).setColor(rarityCss(item.rarity))
    else this.resultText.setText('')
  }

  // ---------- internals ----------

  private rebuildChips(options: CraftMaterialOption[]): void {
    this.pickerLayer.removeAll(true)
    this.chips = []
    const startX = 512
    const startY = 152
    const chipW = 138
    const chipH = 30
    const gapX = 10
    const gapY = 8
    const perRow = 2
    options.slice(0, 10).forEach((opt, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const bx = startX + col * (chipW + gapX) + chipW / 2
      const by = startY + row * (chipH + gapY) + chipH / 2
      const rect = this.scene.add.rectangle(bx, by, chipW, chipH, INK, 0.7).setStrokeStyle(2, 0x6b5f47, 1)
      const label = this.scene.add.text(bx, by, '', { fontSize: '12px', color: '#e8ddc4' }).setOrigin(0.5)
      const chip: Chip = { opt, selected: 0, rect, label, hitRect: centerRect(bx, by, chipW, chipH) }
      this.chips.push(chip)
      this.pickerLayer.add([rect, label])
      this.paintChip(chip)
    })
  }

  private cycleChip(chip: Chip): void {
    if (this.locked) return
    chip.selected = (chip.selected + 1) % (chip.opt.owned + 1)
    this.paintChip(chip)
    this.refreshSlots()
    this.refreshBudget()
  }

  private paintChip(chip: Chip): void {
    chip.label.setText(`${chip.opt.item.name} ${chip.selected}/${chip.opt.owned}`)
    chip.rect.setStrokeStyle(2, chip.selected > 0 ? GOLD : 0x6b5f47, 1)
    chip.rect.setFillStyle(chip.selected > 0 ? 0x3a2c12 : INK, chip.selected > 0 ? 0.85 : 0.7)
  }

  private selectedLots(): CraftLot[] {
    return this.chips.filter((c) => c.selected > 0).map((c) => ({ item: c.opt.item, qty: c.selected }))
  }

  /** Fill the 5 input slots with the picked material types + the result. */
  private refreshSlots(): void {
    this.slotLayer.removeAll(true)
    const picked = this.chips.filter((c) => c.selected > 0)
    picked.slice(0, INPUT_SLOTS.length).forEach((c, i) => this.placeIcon(c.opt.item, INPUT_SLOTS[i]))
    if (this.currentResult) this.placeIcon(this.currentResult, RESULT_SLOT)
  }

  private placeIcon(item: Item, at: { x: number; y: number }): void {
    const key = this.opts.iconKeyFor(item)
    if (!this.scene.textures.exists(key)) return
    const icon = this.scene.add.image(MAKING.x + at.x, MAKING.y + at.y, key)
    icon.setScale(Math.min(1, ICON_FIT / Math.max(icon.width, icon.height)))
    this.slotLayer.add(icon)
  }

  private refreshBudget(): void {
    const lots = this.selectedLots()
    const preview = this.opts.budgetPreview?.(lots)
    this.budgetText.setText(preview ?? `炉火预算：${lots.length} 种材料`)
  }

  private submit(): void {
    if (this.locked) return
    const description = this.input.value.trim()
    this.opts.onCraftSubmit?.(description, this.selectedLots())
  }

  private buildInput(leftX: number, cy: number, width: number): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 200
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '6px 10px',
      fontSize: '14px',
      border: `1px solid #${GOLD.toString(16)}`,
      borderRadius: '8px',
      background: 'rgba(14,16,26,0.72)',
      color: '#f2eddf',
      outline: 'none',
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        this.submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
    this.input = input
    return this.scene.add.dom(leftX, cy, input).setOrigin(0, 0.5)
  }
}
