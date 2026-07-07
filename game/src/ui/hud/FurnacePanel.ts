import Phaser from 'phaser'
import type { Item } from '../../systems/items'
import { HUD_COLORS, ICON_FALLBACK_KEY } from './hudTheme'
import { rarityCss } from './rarity'

// 炼制 / 制作 panel on the ORIGINAL art (furnace_making = export.strength.Making
// from backpack1.swf -- the 4399 game's real material-into-craft window: 制作书 +
// 基本材料 x2 + 宝石 x3 slots, 生成物 result, 打造 button, all baked). There is NO
// separate 八卦炉 window symbol in any pack (only baguaEffect FX in EIcon1); the
// strength.* panels are the client's actual crafting UI -- evidence in
// tasks/ui-round2-report.md.
//
// This wraps that art for our agent-furnace flow: material slots take the items
// the player feeds the furnace, 生成物 previews the crafted result, and 打造 is a
// live button. Slot coordinates are image-local (origin = panel center).
// Pure view: setMaterials / setResult / setInfo drive it; onCraft is the button.

const PANEL_TEX = 'furnace_making'
// Slot centers in the 354x385 art, image-local (origin center). 5 input slots
// (2 基本材料 + 3 宝石) + 1 result (生成物).
// Measured from furnace_making.png slot cells (rows at local y -86 / -13 / +122).
const INPUT_SLOTS: { x: number; y: number }[] = [
  { x: -104, y: -86 }, // 基本材料 L
  { x: 52, y: -86 }, // 基本材料 R
  { x: -108, y: -13 }, // 宝石 1
  { x: 0, y: -13 }, // 宝石 2
  { x: 108, y: -13 }, // 宝石 3
]
const RESULT_SLOT = { x: -108, y: 122 }
const CRAFT_BTN = { x: 42, y: 158, w: 120, h: 38 }
const ICON_FIT = 44

export interface FurnaceInfo {
  name: string
  cost: number
}

export interface FurnacePanelOptions {
  x?: number
  y?: number
  iconKeyFor?: (item: Item) => string
  onCraft?: () => void
  onClose?: () => void
}

export class FurnacePanel {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: Required<Omit<FurnacePanelOptions, 'onCraft' | 'onClose'>> &
    Pick<FurnacePanelOptions, 'onCraft' | 'onClose'>
  private readonly itemLayer: Phaser.GameObjects.Container
  private readonly nameText: Phaser.GameObjects.Text
  private readonly costText: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, opts: FurnacePanelOptions = {}) {
    this.scene = scene
    this.opts = {
      x: opts.x ?? 480,
      y: opts.y ?? 280,
      iconKeyFor: opts.iconKeyFor ?? ((item) => (scene.textures.exists(`icon_${item.id}`) ? `icon_${item.id}` : ICON_FALLBACK_KEY)),
      onCraft: opts.onCraft,
      onClose: opts.onClose,
    }
    const children: Phaser.GameObjects.GameObject[] = []

    if (scene.textures.exists(PANEL_TEX)) {
      children.push(scene.add.image(0, 0, PANEL_TEX))
    } else {
      const g = scene.add.graphics()
      g.fillStyle(HUD_COLORS.panel, 0.98).fillRoundedRect(-177, -192, 354, 385, 14)
      g.lineStyle(2, HUD_COLORS.gold, 0.9).strokeRoundedRect(-177, -192, 354, 385, 14)
      children.push(g)
    }

    this.itemLayer = scene.add.container(0, 0)
    children.push(this.itemLayer)

    // Dynamic 名称 / 所需灵魂 text (to the right of the 生成物 slot).
    this.nameText = scene.add.text(-56, 110, '', { fontSize: '15px', color: HUD_COLORS.textGold, fontStyle: 'bold' }).setOrigin(0, 0.5).setShadow(1, 1, '#000', 3)
    this.costText = scene.add.text(-56, 134, '', { fontSize: '13px', color: '#e8d9a0' }).setOrigin(0, 0.5).setShadow(1, 1, '#000', 3)
    children.push(this.nameText, this.costText)

    // Interactive 打造 button hotspot over the baked art.
    const btn = scene.add
      .rectangle(CRAFT_BTN.x, CRAFT_BTN.y, CRAFT_BTN.w, CRAFT_BTN.h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(0xffffff, 0.12))
      .on('pointerout', () => btn.setFillStyle(0xffffff, 0.001))
      .on('pointerdown', () => this.opts.onCraft?.())
    children.push(btn)

    this.container = scene.add.container(this.opts.x, this.opts.y, children).setScrollFactor(0).setDepth(200).setVisible(false)
  }

  open(): this {
    this.container.setVisible(true)
    return this
  }

  close(): this {
    this.container.setVisible(false)
    return this
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  /** Fill the 5 input slots (extra items ignored). */
  setMaterials(items: Item[]): void {
    this.rebuild(items, this.currentResult, this.currentInfo)
  }

  setResult(item: Item | null): void {
    this.currentResult = item
    this.rebuild(this.currentMaterials, item, this.currentInfo)
  }

  setInfo(info: FurnaceInfo | null): void {
    this.currentInfo = info
    this.nameText.setText(info ? info.name : '')
    this.costText.setText(info ? `所需灵魂 ${info.cost}` : '')
  }

  private currentMaterials: Item[] = []
  private currentResult: Item | null = null
  private currentInfo: FurnaceInfo | null = null

  private rebuild(materials: Item[], result: Item | null, info: FurnaceInfo | null): void {
    this.currentMaterials = materials
    this.itemLayer.removeAll(true)
    materials.slice(0, INPUT_SLOTS.length).forEach((it, i) => this.placeIcon(it, INPUT_SLOTS[i]))
    if (result) {
      this.placeIcon(result, RESULT_SLOT)
      // Name in the result's rarity color.
      this.nameText.setColor(rarityCss(result.rarity))
    } else {
      this.nameText.setColor(HUD_COLORS.textGold)
    }
    this.setInfo(info)
  }

  private placeIcon(item: Item, at: { x: number; y: number }): void {
    const key = this.opts.iconKeyFor(item)
    if (!this.scene.textures.exists(key)) return
    const icon = this.scene.add.image(at.x, at.y, key)
    icon.setScale(Math.min(1, ICON_FIT / Math.max(icon.width, icon.height)))
    this.itemLayer.add(icon)
  }
}
