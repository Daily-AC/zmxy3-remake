import Phaser from 'phaser'
import type { Item } from '../../systems/items'
import { HUD_COLORS, ICON_FALLBACK_KEY } from './hudTheme'
import { rarityCss, rarityName } from './rarity'

// Backpack / 个人资料 window on the ORIGINAL art (backpack_window, export.pack.
// BackPack from backpack1.swf, cropped). The window's right panel is an empty
// brown area in the source; we tile the original single-cell art
// (backpack_slot, export.pack.PackThings) into a 6x4 = 24 grid aligned to
// inventory.ts capacity, drop item icons in, and show a hover tooltip. Rarity is
// conveyed by the item NAME's text color only (no border art) -- the original's
// own language, see rarity.ts + UI MANIFEST.
//
// Pure view: `setItems(stacks)` drives it; icon lookup is injectable so this
// never hard-codes the item.id -> icon mapping.

export interface BackpackStack {
  item: Item
  qty: number
}

export interface BackpackWindowOptions {
  x?: number
  y?: number
  cols?: number
  rows?: number
  /** item -> loaded icon texture key. Default: icon_<id> if present else fallback. */
  iconKeyFor?: (item: Item) => string
  onClose?: () => void
}

const WINDOW_TEX = 'backpack_window'
const SLOT_TEX = 'backpack_slot'
// Grid region inside the 755x497 window art (right panel), in image-local coords
// (origin = window center). Measured from the cropped window.
const GRID_LEFT = 30
const GRID_TOP = -150
const CELL = 50
const GAP = 5.5

export class BackpackWindow {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: Required<Omit<BackpackWindowOptions, 'onClose'>> & Pick<BackpackWindowOptions, 'onClose'>
  private readonly slotLayer: Phaser.GameObjects.Container
  private tooltip?: Phaser.GameObjects.Container

  constructor(scene: Phaser.Scene, opts: BackpackWindowOptions = {}) {
    this.scene = scene
    this.opts = {
      x: opts.x ?? 480,
      y: opts.y ?? 270,
      cols: opts.cols ?? 6,
      rows: opts.rows ?? 4,
      iconKeyFor: opts.iconKeyFor ?? ((item) => (scene.textures.exists(`icon_${item.id}`) ? `icon_${item.id}` : ICON_FALLBACK_KEY)),
      onClose: opts.onClose,
    }
    const children: Phaser.GameObjects.GameObject[] = []

    if (scene.textures.exists(WINDOW_TEX)) {
      children.push(scene.add.image(0, 0, WINDOW_TEX))
    } else {
      const g = scene.add.graphics()
      g.fillStyle(HUD_COLORS.panel, 0.98).fillRoundedRect(-377, -248, 755, 497, 16)
      g.lineStyle(2, HUD_COLORS.gold, 0.9).strokeRoundedRect(-377, -248, 755, 497, 16)
      children.push(g)
    }

    // Close hotspot over the baked red X (top-right of the window art).
    const close = scene.add
      .rectangle(348, -232, 46, 46, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.opts.onClose?.())
    children.push(close)

    this.slotLayer = scene.add.container(0, 0)
    children.push(this.slotLayer)

    this.container = scene.add.container(this.opts.x, this.opts.y, children).setScrollFactor(0).setDepth(200).setVisible(false)
  }

  open(): this {
    this.container.setVisible(true)
    return this
  }

  close(): this {
    this.hideTooltip()
    this.container.setVisible(false)
    return this
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  setItems(stacks: BackpackStack[]): void {
    this.slotLayer.removeAll(true)
    this.hideTooltip()
    const { cols, rows } = this.opts
    const total = cols * rows
    for (let i = 0; i < total; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = GRID_LEFT + col * (CELL + GAP) + CELL / 2
      const cy = GRID_TOP + row * (CELL + GAP) + CELL / 2
      this.buildSlot(cx, cy, stacks[i])
    }
  }

  private buildSlot(cx: number, cy: number, stack: BackpackStack | undefined): void {
    if (this.scene.textures.exists(SLOT_TEX)) {
      this.slotLayer.add(this.scene.add.image(cx, cy, SLOT_TEX))
    } else {
      const g = this.scene.add.graphics()
      g.fillStyle(0x2a1c10, 1).fillRoundedRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL, 6)
      g.lineStyle(1, HUD_COLORS.gold, 0.5).strokeRoundedRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL, 6)
      this.slotLayer.add(g)
    }
    if (!stack) return

    const iconKey = this.opts.iconKeyFor(stack.item)
    if (this.scene.textures.exists(iconKey)) {
      const icon = this.scene.add.image(cx, cy, iconKey)
      const s = Math.min(1, (CELL - 10) / Math.max(icon.width, icon.height))
      icon.setScale(s)
      this.slotLayer.add(icon)
    }
    if (stack.qty > 1) {
      this.slotLayer.add(
        this.scene.add
          .text(cx + CELL / 2 - 4, cy + CELL / 2 - 3, String(stack.qty), {
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(1, 1)
          .setShadow(1, 1, '#000000', 2),
      )
    }
    // Hover: show a rarity-colored tooltip.
    const hit = this.scene.add
      .rectangle(cx, cy, CELL, CELL, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.showTooltip(cx, cy, stack))
      .on('pointerout', () => this.hideTooltip())
    this.slotLayer.add(hit)
  }

  private showTooltip(cx: number, cy: number, stack: BackpackStack): void {
    this.hideTooltip()
    const item = stack.item
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
    const tip = this.scene.add.container(cx + CELL / 2 + 6, cy - h / 2, [bg, ...texts])
    // Keep the tooltip inside the window horizontally.
    if (cx + CELL / 2 + 6 + w > 372) tip.setX(cx - CELL / 2 - 6 - w)
    this.slotLayer.add(tip)
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
