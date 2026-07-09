import Phaser from 'phaser'
import type { CraftCheck, FurnaceRecipe } from '../../systems/furnaceRecipe'
import { HUD_COLORS } from './hudTheme'
import { rarityCss } from './rarity'
import { withinRect, type Rect } from '../screenHit'
import { MODAL_PANEL_DEPTH } from './depths'
import { FRAME_SCALE, FRAME_TEX, WIN } from './FurnacePanel'

export interface FurnaceRecipeViewOptions {
  recipes: FurnaceRecipe[]
  checkFor: (bookFillName: string) => CraftCheck
  onCraftSubmit: (bookFillName: string) => void
  onChatSubmit: (text: string) => void
  onClose?: () => void
}

interface RowView {
  recipe: FurnaceRecipe
  bg: Phaser.GameObjects.Rectangle
  product: Phaser.GameObjects.Text
  detail: Phaser.GameObjects.Text
  status: Phaser.GameObjects.Text
  button: Phaser.GameObjects.Rectangle
  buttonLabel: Phaser.GameObjects.Text
  hitRect: Rect
  canCraftNow: boolean
}

const INK = HUD_COLORS.ink
const GOLD = HUD_COLORS.gold
const ROWS_PER_PAGE = 6

function centerRect(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

function qualityRarity(quality: string): 1 | 2 | 3 {
  if (quality === '粗 糙' || quality === '普 通') return 1
  if (quality === '优 秀' || quality === '精 良') return 2
  return 3
}

function checkStatus(check: CraftCheck): string {
  if (check.ok) return '可打造'
  if (check.reason === 'missing_book') return '缺制作书'
  if (check.reason === 'missing_materials') return `缺${check.missing.map((m) => `${m.name}${m.needed - m.have}`).join('、')}`
  if (check.reason === 'insufficient_soul') return `灵魂不足 ${check.have}/${check.needed}`
  if (check.reason === 'bag_full') return '背包已满'
  return '未知配方'
}

function materialLine(recipe: FurnaceRecipe, check: CraftCheck): string {
  const missing = new Map<string, { have: number; needed: number }>()
  if (!check.ok && check.reason === 'missing_materials') {
    for (const item of check.missing) missing.set(item.fillName, { have: item.have, needed: item.needed })
  }
  const mats = recipe.materials.map((m) => {
    const miss = missing.get(m.fillName)
    return miss ? `${m.name} ${miss.have}/${miss.needed}` : `${m.name} ≥${m.qty}/${m.qty}`
  })
  return `${recipe.bookName} · ${mats.join(' · ')} · 灵魂 ${recipe.soulCost}`
}

export class FurnaceRecipeView {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: FurnaceRecipeViewOptions
  private readonly rowLayer: Phaser.GameObjects.Container
  private readonly chatLayer: Phaser.GameObjects.Container
  private readonly pageText: Phaser.GameObjects.Text
  private readonly sendButton: Phaser.GameObjects.Rectangle
  private readonly closeRect: Rect
  private readonly prevRect: Rect
  private readonly nextRect: Rect
  private readonly sendRect: Rect
  private input!: HTMLInputElement
  private rows: RowView[] = []
  private npcLines: string[] = []
  private page = 0
  private locked = false

  constructor(scene: Phaser.Scene, opts: FurnaceRecipeViewOptions) {
    this.scene = scene
    this.opts = opts

    const children: Phaser.GameObjects.GameObject[] = []
    children.push(scene.add.rectangle(480, 270, 960, 540, 0x000000, 0.6))
    if (scene.textures.exists(FRAME_TEX)) {
      children.push(scene.add.image(WIN.cx, WIN.cy, FRAME_TEX).setScale(FRAME_SCALE))
    } else {
      const g = scene.add.graphics()
      g.fillStyle(HUD_COLORS.panel, 0.98).fillRoundedRect(WIN.cx - 460, WIN.cy - 250, 920, 500, 12)
      g.lineStyle(3, GOLD, 0.9).strokeRoundedRect(WIN.cx - 460, WIN.cy - 250, 920, 500, 12)
      children.push(g)
    }

    children.push(scene.add.text(126, 82, '配方打造', { fontSize: '20px', color: HUD_COLORS.textGold, fontStyle: 'bold' }).setShadow(1, 1, '#000', 3))
    children.push(scene.add.text(620, 82, '太上老君', { fontSize: '20px', color: HUD_COLORS.textGold, fontStyle: 'bold' }).setShadow(1, 1, '#000', 3))

    this.rowLayer = scene.add.container(0, 0)
    children.push(this.rowLayer)
    this.chatLayer = scene.add.container(0, 0)
    children.push(this.chatLayer)

    this.prevRect = centerRect(364, 438, 66, 30)
    this.nextRect = centerRect(534, 438, 66, 30)
    this.pageText = scene.add.text(449, 438, '', { fontSize: '13px', color: HUD_COLORS.textDim }).setOrigin(0.5)
    children.push(
      scene.add.rectangle(364, 438, 66, 30, INK, 0.82).setStrokeStyle(1, 0x6b5f47, 1),
      scene.add.text(364, 438, '上一页', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5),
      this.pageText,
      scene.add.rectangle(534, 438, 66, 30, INK, 0.82).setStrokeStyle(1, 0x6b5f47, 1),
      scene.add.text(534, 438, '下一页', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5),
    )

    const logBg = scene.add.rectangle(738, 262, 246, 284, INK, 0.72).setStrokeStyle(2, 0x6b5f47, 1)
    children.push(logBg)
    children.push(this.buildInput(620, 421, 205))
    this.sendRect = centerRect(852, 421, 58, 30)
    this.sendButton = scene.add.rectangle(852, 421, 58, 30, 0x3a2c12, 0.9).setStrokeStyle(2, GOLD, 0.9)
    children.push(this.sendButton, scene.add.text(852, 421, '发送', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5))

    this.closeRect = centerRect(792, 92, 66, 30)
    children.push(
      scene.add.rectangle(792, 92, 66, 30, INK, 0.85).setStrokeStyle(2, 0x8a7f66, 1),
      scene.add.text(792, 92, '返回', { fontSize: '14px', color: HUD_COLORS.text }).setOrigin(0.5),
    )

    this.container = scene.add.container(0, 0, children).setScrollFactor(0).setDepth(MODAL_PANEL_DEPTH).setVisible(false)
    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointermove', this.onPointerMove)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
    })
    this.refresh()
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  open(): void {
    this.container.setVisible(true)
    this.refresh()
    setTimeout(() => this.input.focus(), 0)
  }

  close(): void {
    if (!this.container.visible) return
    this.container.setVisible(false)
    this.input.blur()
    this.scene.input.manager.canvas.style.cursor = ''
    this.opts.onClose?.()
  }

  refresh(): void {
    this.rebuildRows()
    this.rebuildChat()
  }

  appendNpcLine(text: string): void {
    const line = text.trim()
    if (!line) return
    if (this.npcLines[this.npcLines.length - 1] === line) return
    this.npcLines.push(line)
    this.npcLines = this.npcLines.slice(-8)
    this.rebuildChat()
  }

  setCraftLocked(locked: boolean): void {
    this.locked = locked
    this.input.disabled = locked
    this.sendButton.setAlpha(locked ? 0.55 : 1)
    this.refresh()
  }

  debugState(): {
    isOpen: boolean
    rows: { bookFillName: string; screenX: number; screenY: number; canCraftNow: boolean }[]
    chatInput: { present: boolean; disabled: boolean }
  } {
    return {
      isOpen: this.isOpen,
      rows: this.rows.map((row) => ({
        bookFillName: row.recipe.bookFillName,
        screenX: row.hitRect.x + row.hitRect.w / 2,
        screenY: row.hitRect.y + row.hitRect.h / 2,
        canCraftNow: row.canCraftNow,
      })),
      chatInput: { present: !!this.input, disabled: this.input.disabled },
    }
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const lx = pointer.x - this.container.x
    const ly = pointer.y - this.container.y
    if (withinRect(lx, ly, this.closeRect)) {
      this.close()
      return
    }
    if (!this.locked && withinRect(lx, ly, this.prevRect)) {
      this.page = Math.max(0, this.page - 1)
      this.refresh()
      return
    }
    if (!this.locked && withinRect(lx, ly, this.nextRect)) {
      this.page = Math.min(this.maxPage(), this.page + 1)
      this.refresh()
      return
    }
    if (!this.locked && withinRect(lx, ly, this.sendRect)) {
      this.submitChat()
      return
    }
    for (const row of this.rows) {
      if (!this.locked && row.canCraftNow && withinRect(lx, ly, row.hitRect)) {
        this.opts.onCraftSubmit(row.recipe.bookFillName)
        return
      }
    }
  }

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const lx = pointer.x - this.container.x
    const ly = pointer.y - this.container.y
    const overRow = this.rows.some((row) => !this.locked && row.canCraftNow && withinRect(lx, ly, row.hitRect))
    const overControl =
      withinRect(lx, ly, this.closeRect) ||
      (!this.locked && (withinRect(lx, ly, this.prevRect) || withinRect(lx, ly, this.nextRect) || withinRect(lx, ly, this.sendRect)))
    this.scene.input.manager.canvas.style.cursor = overRow || overControl ? 'pointer' : ''
  }

  private maxPage(): number {
    return Math.max(0, Math.ceil(this.opts.recipes.length / ROWS_PER_PAGE) - 1)
  }

  private rebuildRows(): void {
    this.rowLayer.removeAll(true)
    this.rows = []
    this.page = Math.min(this.page, this.maxPage())
    const start = this.page * ROWS_PER_PAGE
    const visible = this.opts.recipes.slice(start, start + ROWS_PER_PAGE)
    visible.forEach((recipe, index) => {
      const check = this.opts.checkFor(recipe.bookFillName)
      const canCraftNow = check.ok
      const y = 126 + index * 48
      const bg = this.scene.add
        .rectangle(350, y, 470, 42, canCraftNow ? 0x1d2a18 : INK, canCraftNow ? 0.82 : 0.68)
        .setStrokeStyle(2, canCraftNow ? GOLD : 0x5c5141, canCraftNow ? 0.9 : 0.65)
      const product = this.scene.add.text(126, y - 14, `${recipe.productName}`, {
        fontSize: '15px',
        color: rarityCss(qualityRarity(recipe.quality)),
        fontStyle: 'bold',
      })
      const role = recipe.role ? `${recipe.role} · ` : ''
      const detail = this.scene.add.text(126, y + 4, `${role}${recipe.quality} · ${materialLine(recipe, check)}`, {
        fontSize: '11px',
        color: HUD_COLORS.textDim,
      })
      detail.setFixedSize(350, 16)
      const status = this.scene.add.text(516, y - 13, checkStatus(check), {
        fontSize: '11px',
        color: canCraftNow ? '#9cf58f' : '#e0b060',
      }).setOrigin(0.5, 0)
      const button = this.scene.add
        .rectangle(516, y + 10, 70, 24, canCraftNow ? 0x4a3212 : 0x242026, canCraftNow ? 0.95 : 0.65)
        .setStrokeStyle(1, canCraftNow ? GOLD : 0x5c5141, 1)
      const buttonLabel = this.scene.add.text(516, y + 10, '打造', {
        fontSize: '13px',
        color: canCraftNow ? HUD_COLORS.text : '#8d8790',
      }).setOrigin(0.5)
      const row: RowView = {
        recipe,
        bg,
        product,
        detail,
        status,
        button,
        buttonLabel,
        hitRect: centerRect(516, y + 10, 70, 24),
        canCraftNow,
      }
      this.rows.push(row)
      this.rowLayer.add([bg, product, detail, status, button, buttonLabel])
    })
    this.pageText.setText(`${this.page + 1}/${this.maxPage() + 1}`)
  }

  private rebuildChat(): void {
    this.chatLayer.removeAll(true)
    const lines = this.npcLines.length ? this.npcLines : ['老君在炉旁闭目养神。']
    lines.slice(-7).forEach((line, index) => {
      const text = this.scene.add.text(624, 128 + index * 36, line, {
        fontSize: '12px',
        color: index === lines.length - 1 ? HUD_COLORS.textGold : HUD_COLORS.text,
        wordWrap: { width: 226 },
        lineSpacing: 2,
      })
      this.chatLayer.add(text)
    })
  }

  private submitChat(): void {
    if (this.locked) return
    const text = this.input.value.trim()
    if (!text) return
    this.input.value = ''
    this.npcLines.push(`你：${text}`)
    this.npcLines = this.npcLines.slice(-8)
    this.opts.onChatSubmit(text)
    this.rebuildChat()
  }

  private buildInput(leftX: number, cy: number, width: number): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 120
    input.placeholder = '和老君说句话'
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '6px 9px',
      fontSize: '13px',
      border: `1px solid #${GOLD.toString(16)}`,
      borderRadius: '6px',
      background: 'rgba(14,16,26,0.78)',
      color: HUD_COLORS.text,
      outline: 'none',
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        this.submitChat()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
    this.input = input
    return this.scene.add.dom(leftX, cy, input).setOrigin(0, 0.5)
  }
}
