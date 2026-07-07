import Phaser from 'phaser'

// NPC dialogue panel in the original ink-brush / warm-wood visual language:
//  - background = the central brush band of the original 水墨 text panel art
//    (dialogue_textpanel_crop), not a rectangular box;
//  - a gold-edged avatar frame on the left holding 太上老君's face;
//  - typewriter reveal of the newest line;
//  - the text input lives *inside* the canvas via a Phaser DOM element, kept
//    aligned to game coordinates (no more free-floating HTML input below the
//    canvas). Enter sends (preventDefault so it never navigates), Esc closes.
//  - a 炼宝 button opens the 炼丹炉 forge window (ui/hud/FurnacePanel); the forge
//    UI itself lives there now, not in this panel. This box stays chat-only.

const INK_TEX = 'ink_panel'
// The original 水墨 panel art has its own text baked into the middle, so we use
// only the text-free brushstroke strips along its top and bottom edges as
// decorative borders over a clean dark panel.
const BRUSH_TOP = 'brush_top'
const BRUSH_BOT = 'brush_bot'

export interface DialogueBoxConfig {
  npcName: string
  avatarTexture: string
  /** Sheet frame + crop rect (in sheet px) for the NPC head. */
  avatarSheetFrame: number
  avatarCrop: { x: number; y: number; w: number; h: number }
  onSubmit: (text: string) => void
  onClose: () => void
  /** Forge: fired when the player clicks the 炼宝 button; scene opens the 炼丹炉. */
  onCraftEnter?: () => void
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

  constructor(scene: Phaser.Scene, cfg: DialogueBoxConfig) {
    this.scene = scene
    this.cfg = cfg
    this.build()
  }

  get isOpen(): boolean {
    return this._open
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

    // 炼宝 button, top-right of the dialogue panel — opens the 炼丹炉 forge window.
    // Only rendered when the host scene actually wires a forge (S1 moved the
    // forge entry point to WorldMapScene's 炼丹炉 button; BattleScene no longer
    // passes onCraftEnter, so this dialogue stays chat-only there).
    if (this.cfg.onCraftEnter) {
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
      this.root.add(this.scene.add.container(0, 0, [enterRect, enterLabel]))
    }
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
        const text = input.value.trim()
        if (text) {
          input.value = ''
          this.cfg.onSubmit(text)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
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
