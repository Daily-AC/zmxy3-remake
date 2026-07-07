import Phaser from 'phaser'
import type { Item } from '../systems/items'

// NPC dialogue panel in the original ink-brush / warm-wood visual language:
//  - background = the central brush band of the original 水墨 text panel art
//    (dialogue_textpanel_crop), not a rectangular box;
//  - a gold-edged avatar frame on the left holding 太上老君's face;
//  - typewriter reveal of the newest line;
//  - the text input lives *inside* the canvas via a Phaser DOM element, kept
//    aligned to game coordinates (no more free-floating HTML input below the
//    canvas). Enter sends (preventDefault so it never navigates), Esc closes.
//  - an optional "炼宝" (forge) overlay in the same ink language: pick which
//    materials to spend, the description input doubles as the craft prompt, and
//    the budget preview updates live. Kept inside this panel rather than a new
//    full-screen UI.

const INK_TEX = 'ink_panel'
// The original 水墨 panel art has its own text baked into the middle, so we use
// only the text-free brushstroke strips along its top and bottom edges as
// decorative borders over a clean dark panel.
const BRUSH_TOP = 'brush_top'
const BRUSH_BOT = 'brush_bot'

/** A craft lot: how many of a bag material the player picked for the furnace. */
export interface CraftLot {
  item: Item
  qty: number
}
/** One selectable material row in the forge overlay. */
export interface CraftMaterialOption {
  item: Item
  owned: number
}

export interface DialogueBoxConfig {
  npcName: string
  avatarTexture: string
  /** Sheet frame + crop rect (in sheet px) for the NPC head. */
  avatarSheetFrame: number
  avatarCrop: { x: number; y: number; w: number; h: number }
  onSubmit: (text: string) => void
  onClose: () => void
  /** Forge: fired when the player clicks the 炼宝 button; scene opens craft mode. */
  onCraftEnter?: () => void
  /** Forge: fired with the description + picked lots when the player confirms. */
  onCraftSubmit?: (description: string, lots: CraftLot[]) => void
  /** Forge: a one-line budget preview for the current selection (scene computes it). */
  craftBudgetPreview?: (lots: CraftLot[]) => string
}

const PANEL = { x: 480, y: 450, w: 912, h: 168 }
const GOLD = 0xd9b45a
const INK = 0x0c0d12

export class DialogueBox {
  private readonly scene: Phaser.Scene
  private readonly cfg: DialogueBoxConfig
  private root!: Phaser.GameObjects.Container
  private textObj!: Phaser.GameObjects.Text
  private dom!: Phaser.GameObjects.DOMElement
  private input!: HTMLInputElement
  private log: string[] = []
  private typing: { idx: number; full: string; shown: number } | null = null
  private _open = false

  // Forge overlay
  private craftRoot!: Phaser.GameObjects.Container
  private craftEnterBtn!: Phaser.GameObjects.Container
  private craftBudgetText!: Phaser.GameObjects.Text
  private craftHintText!: Phaser.GameObjects.Text
  private craftChips: {
    opt: CraftMaterialOption
    selected: number
    rect: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  }[] = []
  private _craftMode = false
  private craftLocked = false

  constructor(scene: Phaser.Scene, cfg: DialogueBoxConfig) {
    this.scene = scene
    this.cfg = cfg
    this.build()
  }

  get isOpen(): boolean {
    return this._open
  }

  get craftMode(): boolean {
    return this._craftMode
  }

  logLines(): string[] {
    return [...this.log]
  }

  private ensureInkBand(): void {
    const tex = this.scene.textures.get(INK_TEX)
    // Text-free brushstroke strips (the art's baked text sits in the middle band).
    if (!tex.has(BRUSH_TOP)) tex.add(BRUSH_TOP, 0, 0, 0, 942, 30)
    if (!tex.has(BRUSH_BOT)) tex.add(BRUSH_BOT, 0, 0, 90, 942, 24)
  }

  private build(): void {
    this.ensureInkBand()
    const { x, y, w, h } = PANEL

    // Rounded dark panel (no square border), warm-wood tint, for legibility.
    const backing = this.scene.add.graphics()
    backing.fillStyle(0x1a130c, 0.82)
    backing.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16)
    backing.lineStyle(2, GOLD, 0.85)
    backing.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 16)
    // Ink brushstroke borders top and bottom for the 水墨 feel.
    const topBrush = this.scene.add
      .image(x, y - h / 2 + 2, INK_TEX, BRUSH_TOP)
      .setDisplaySize(w, 26)
      .setOrigin(0.5, 0)
    const botBrush = this.scene.add
      .image(x, y + h / 2 - 2, INK_TEX, BRUSH_BOT)
      .setDisplaySize(w, 22)
      .setOrigin(0.5, 1)
      .setFlipY(true)

    // Avatar frame: gold ring + inked backing + cropped 老君 face.
    const ax = x - w / 2 + 66
    const ring = this.scene.add.graphics()
    ring.fillStyle(INK, 0.9)
    ring.fillRoundedRect(ax - 50, y - 50, 100, 100, 14)
    ring.lineStyle(3, GOLD, 1)
    ring.strokeRoundedRect(ax - 50, y - 50, 100, 100, 14)
    const avatar = this.makeAvatar(ax, y)

    const nameLabel = this.scene.add
      .text(ax + 66, y - 70, this.cfg.npcName, { fontSize: '17px', color: '#f0d99a', fontStyle: 'bold' })
      .setOrigin(0, 0)

    this.textObj = this.scene.add
      .text(ax + 66, y - 46, '', {
        fontSize: '16px',
        color: '#f2eddf',
        wordWrap: { width: w - 190, useAdvancedWrap: true },
        lineSpacing: 5,
      })
      .setOrigin(0, 0)

    this.dom = this.buildInput(ax + 66, y + 60, w - 190)

    this.root = this.scene.add
      .container(0, 0, [backing, topBrush, botBrush, ring, avatar, nameLabel, this.textObj, this.dom])
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false)

    // 炼宝 entry button, top-right of the dialogue panel (hidden in craft mode).
    const bx = x + w / 2 - 62
    const by = y - h / 2 + 22
    const enterRect = this.scene.add
      .rectangle(bx, by, 92, 32, 0x3a2c12, 0.9)
      .setStrokeStyle(2, GOLD, 1)
      .setInteractive({ useHandCursor: true })
    enterRect.on('pointerdown', () => this.cfg.onCraftEnter?.())
    const enterLabel = this.scene.add
      .text(bx, by, '炼宝 ✦', { fontSize: '14px', color: '#f0d99a', fontStyle: 'bold' })
      .setOrigin(0.5)
    this.craftEnterBtn = this.scene.add.container(0, 0, [enterRect, enterLabel])
    this.root.add(this.craftEnterBtn)

    this.buildCraftOverlay()
  }

  // ---------- forge overlay ----------

  private buildCraftOverlay(): void {
    // Sits just above the dialogue panel, same ink language.
    const w = 912
    const cx = 480
    const top = 150
    const h = 196
    const items: Phaser.GameObjects.GameObject[] = []

    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a130c, 0.9)
    bg.fillRoundedRect(cx - w / 2, top, w, h, 16)
    bg.lineStyle(2, GOLD, 0.9)
    bg.strokeRoundedRect(cx - w / 2, top, w, h, 16)
    items.push(bg)

    const title = this.scene.add
      .text(cx - w / 2 + 24, top + 14, '炼宝炉 · 择材入炉', {
        fontSize: '18px',
        color: '#f0d99a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    items.push(title)

    this.craftHintText = this.scene.add
      .text(cx - w / 2 + 24, top + 44, '点材料择数，下方描述想要的法宝，点「炼制」', {
        fontSize: '13px',
        color: '#b9ad93',
      })
      .setOrigin(0, 0)
    items.push(this.craftHintText)

    this.craftBudgetText = this.scene.add
      .text(cx - w / 2 + 24, top + h - 30, '炉火预算：0 点', {
        fontSize: '15px',
        color: '#ffcf7a',
      })
      .setOrigin(0, 0)
    items.push(this.craftBudgetText)

    // 炼制 / 返回 buttons (bottom-right of the overlay).
    const forgeBtn = this.makeButton(cx + w / 2 - 96, top + h - 26, 96, 34, '炼制 ✦', GOLD, () =>
      this.submitCraft(),
    )
    const backBtn = this.makeButton(cx + w / 2 - 208, top + h - 26, 92, 34, '返回', 0x8a7f66, () =>
      this.closeCraft(),
    )
    items.push(...forgeBtn, ...backBtn)

    this.craftRoot = this.scene.add
      .container(0, 0, items)
      .setScrollFactor(0)
      .setDepth(201)
      .setVisible(false)
  }

  private makeButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const rect = this.scene.add
      .rectangle(cx, cy, w, h, INK, 0.85)
      .setStrokeStyle(2, color, 1)
      .setInteractive({ useHandCursor: true })
    rect.on('pointerdown', onClick)
    const label = this.scene.add
      .text(cx, cy, text, { fontSize: '15px', color: '#f2eddf', fontStyle: 'bold' })
      .setOrigin(0.5)
    return [rect, label]
  }

  /** Enter craft mode with the player's current bag materials. */
  openCraft(options: CraftMaterialOption[]): void {
    if (!this._open) return
    this._craftMode = true
    this.craftLocked = false
    this.craftRoot.setVisible(true)
    this.craftEnterBtn.setVisible(false)
    this.input.placeholder = '描述想要的法宝，如：一柄能吸血的火杖'
    this.input.value = ''
    this.rebuildChips(options)
    this.refreshBudget()
    setTimeout(() => this.input.focus(), 0)
  }

  closeCraft(): void {
    if (!this._craftMode) return
    this._craftMode = false
    this.craftRoot.setVisible(false)
    this.craftEnterBtn.setVisible(true)
    this.input.placeholder = '对老君说点什么，回车发送，Esc 关闭'
  }

  /** While a craft is in flight, freeze the overlay so the player can't double-submit. */
  setCraftLocked(locked: boolean): void {
    this.craftLocked = locked
  }

  private rebuildChips(options: CraftMaterialOption[]): void {
    for (const c of this.craftChips) {
      c.rect.destroy()
      c.label.destroy()
    }
    this.craftChips = []
    const w = 912
    const cx = 480
    const top = 150
    const startX = cx - w / 2 + 24
    const startY = top + 74
    const chipW = 200
    const chipH = 36
    const gapX = 12
    const gapY = 10
    const perRow = 4
    options.slice(0, 8).forEach((opt, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const bx = startX + col * (chipW + gapX) + chipW / 2
      const by = startY + row * (chipH + gapY) + chipH / 2
      const rect = this.scene.add
        .rectangle(bx, by, chipW, chipH, INK, 0.7)
        .setStrokeStyle(2, 0x6b5f47, 1)
        .setInteractive({ useHandCursor: true })
      const label = this.scene.add.text(bx, by, '', { fontSize: '13px', color: '#e8ddc4' }).setOrigin(0.5)
      const chip = { opt, selected: 0, rect, label }
      rect.on('pointerdown', () => this.cycleChip(chip))
      this.craftChips.push(chip)
      this.craftRoot.add([rect, label])
      this.paintChip(chip)
    })
  }

  private cycleChip(chip: DialogueBox['craftChips'][number]): void {
    if (this.craftLocked) return
    chip.selected = (chip.selected + 1) % (chip.opt.owned + 1)
    this.paintChip(chip)
    this.refreshBudget()
  }

  private paintChip(chip: DialogueBox['craftChips'][number]): void {
    const { opt, selected } = chip
    chip.label.setText(`${opt.item.name}  ${selected}/${opt.owned}`)
    chip.rect.setStrokeStyle(2, selected > 0 ? GOLD : 0x6b5f47, 1)
    chip.rect.setFillStyle(selected > 0 ? 0x3a2c12 : INK, selected > 0 ? 0.85 : 0.7)
  }

  private selectedLots(): CraftLot[] {
    return this.craftChips
      .filter((c) => c.selected > 0)
      .map((c) => ({ item: c.opt.item, qty: c.selected }))
  }

  private refreshBudget(): void {
    const lots = this.selectedLots()
    const preview = this.cfg.craftBudgetPreview?.(lots)
    this.craftBudgetText.setText(preview ?? `炉火预算：${lots.length} 种材料`)
  }

  private submitCraft(): void {
    if (this.craftLocked) return
    const description = this.input.value.trim()
    const lots = this.selectedLots()
    this.cfg.onCraftSubmit?.(description, lots)
  }

  private makeAvatar(cx: number, cy: number): Phaser.GameObjects.Image {
    const tex = this.scene.textures.get(this.cfg.avatarTexture)
    if (!tex.has('npc_head')) {
      const src = this.scene.textures.getFrame(this.cfg.avatarTexture, this.cfg.avatarSheetFrame)
      const c = this.cfg.avatarCrop
      tex.add('npc_head', src.sourceIndex, src.cutX + c.x, src.cutY + c.y, c.w, c.h)
    }
    const img = this.scene.add.image(cx, cy, this.cfg.avatarTexture, 'npc_head')
    const scale = 88 / Math.max(this.cfg.avatarCrop.w, this.cfg.avatarCrop.h)
    return img.setScale(scale)
  }

  private buildInput(leftX: number, cy: number, width: number): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 200
    input.placeholder = '对老君说点什么，回车发送，Esc 关闭'
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '6px 10px',
      fontSize: '15px',
      border: `1px solid #${GOLD.toString(16)}`,
      borderRadius: '8px',
      background: 'rgba(14,16,26,0.72)',
      color: '#f2eddf',
      outline: 'none',
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      // preventDefault on Enter/Escape only (not character keys, which would
      // block typing) so Enter can never trigger form submit / page navigation.
      if (e.key === 'Enter') {
        e.preventDefault()
        // In forge mode, Enter confirms the craft (materials + this description);
        // the scene reads the value, so don't clear it here.
        if (this._craftMode) {
          this.submitCraft()
          return
        }
        const text = input.value.trim()
        if (text) {
          input.value = ''
          this.cfg.onSubmit(text)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        // Esc backs out of forge mode first, then closes the dialogue.
        if (this._craftMode) this.closeCraft()
        else this.close()
      }
    })
    this.input = input
    // Origin (0, 0.5): left-aligned, vertically centred on cy.
    return this.scene.add.dom(leftX, cy, input).setOrigin(0, 0.5)
  }

  open(): void {
    if (this._open) return
    this._open = true
    this.root.setVisible(true)
    this.input.value = ''
    this.render()
    // Focus after the element is shown so the caret lands in the box.
    setTimeout(() => this.input.focus(), 0)
  }

  close(): void {
    if (!this._open) return
    this.closeCraft()
    this._open = false
    this.root.setVisible(false)
    this.input.blur()
    this.cfg.onClose()
  }

  /** Clear the text input (used after a craft prompt is sent). */
  clearInput(): void {
    this.input.value = ''
  }

  pushLog(line: string): void {
    this.log.push(line)
    if (this.log.length > 40) this.log.shift()
    this.render()
  }

  startTypewriter(line: string): void {
    if (this.log[this.log.length - 1] === '（老君捻须思索…）') this.log.pop()
    this.log.push('')
    this.typing = { idx: this.log.length - 1, full: line, shown: 0 }
  }

  /** Call each frame from the scene update loop. */
  advanceTypewriter(): void {
    if (!this.typing) return
    this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + 2)
    this.log[this.typing.idx] = this.typing.full.slice(0, this.typing.shown)
    this.render()
    if (this.typing.shown >= this.typing.full.length) this.typing = null
  }

  private render(): void {
    if (!this._open) return
    // Last 3 entries keep the newest line visible above the input row.
    this.textObj.setText(this.log.slice(-3).join('\n'))
  }
}
