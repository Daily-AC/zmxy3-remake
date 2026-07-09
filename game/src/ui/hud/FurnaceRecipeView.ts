import Phaser from 'phaser'
import type { CraftCheck, FurnaceRecipe } from '../../systems/furnaceRecipe'
import { HUD_COLORS } from './hudTheme'
import { rarityCss } from './rarity'
import { withinRect, type Rect } from '../screenHit'
import { MODAL_PANEL_DEPTH } from './depths'
import { FRAME_SCALE, FRAME_TEX, WIN } from './FurnacePanel'
import { activeArtFont } from '../../systems/artFont'

// 2026-07-09 重做（用户："这个页面重做——把老君收到一个入口里，按需要打开；
// 另外现在只展示悟空的装备制作"）：
//   - 配方列表铺满面板主区（此前右半永远被老君聊天栏占着）；
//   - 「太上老君」成为右上角入口按钮，点开一个覆盖式抽屉（聊天记录 + 输入 +
//     发送），老君有新回话时自动弹开；
//   - 配方按角色过滤在调用方做（WorldMapScene 只传悟空 + 无角色限定件），
//     本组件不感知角色语义。
// 公开 API（open/close/refresh/appendNpcLine/setCraftLocked/debugState）与
// 重做前一致，验收 hook 不受影响。

export interface FurnaceRecipeViewOptions {
  recipes: FurnaceRecipe[]
  checkFor: (bookFillName: string) => CraftCheck
  onCraftSubmit: (bookFillName: string) => void
  onChatSubmit: (text: string) => void
  onClose?: () => void
}

interface RowView {
  recipe: FurnaceRecipe
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
  private readonly chatDrawer: Phaser.GameObjects.Container
  private readonly chatLayer: Phaser.GameObjects.Container
  private readonly pageText: Phaser.GameObjects.Text
  private readonly sendButton: Phaser.GameObjects.Rectangle
  private readonly inputDom: Phaser.GameObjects.DOMElement
  private readonly closeRect: Rect
  private readonly laojunRect: Rect
  private readonly drawerCloseRect: Rect
  private readonly prevRect: Rect
  private readonly nextRect: Rect
  private readonly sendRect: Rect
  private input!: HTMLInputElement
  private rows: RowView[] = []
  private npcLines: string[] = []
  private page = 0
  private locked = false
  private drawerOpen = false

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

    children.push(
      scene.add
        .text(126, 78, '配方打造', {
          fontSize: '24px',
          fontFamily: activeArtFont().family,
          color: HUD_COLORS.textGold,
          stroke: '#2c1a0c',
          strokeThickness: 3,
          padding: { top: 6, bottom: 6 },
        })
        .setShadow(1, 1, '#000', 3),
    )

    this.rowLayer = scene.add.container(0, 0)
    children.push(this.rowLayer)

    // 底部翻页条（居中）。
    this.prevRect = centerRect(396, 442, 74, 30)
    this.nextRect = centerRect(564, 442, 74, 30)
    this.pageText = scene.add.text(480, 442, '', { fontSize: '13px', color: HUD_COLORS.textDim }).setOrigin(0.5)
    children.push(
      scene.add.rectangle(396, 442, 74, 30, INK, 0.82).setStrokeStyle(1, 0x6b5f47, 1),
      scene.add.text(396, 442, '上一页', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5),
      this.pageText,
      scene.add.rectangle(564, 442, 74, 30, INK, 0.82).setStrokeStyle(1, 0x6b5f47, 1),
      scene.add.text(564, 442, '下一页', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5),
    )

    // 右上：太上老君入口 + 返回。
    this.laojunRect = centerRect(706, 92, 104, 30)
    children.push(
      scene.add.rectangle(706, 92, 104, 30, 0x3a2c12, 0.92).setStrokeStyle(2, GOLD, 0.9),
      scene.add.text(706, 92, '太上老君', { fontSize: '14px', color: HUD_COLORS.textGold, fontStyle: 'bold' }).setOrigin(0.5),
    )
    this.closeRect = centerRect(796, 92, 60, 30)
    children.push(
      scene.add.rectangle(796, 92, 60, 30, INK, 0.85).setStrokeStyle(2, 0x8a7f66, 1),
      scene.add.text(796, 92, '返回', { fontSize: '14px', color: HUD_COLORS.text }).setOrigin(0.5),
    )

    // 老君抽屉（覆盖在列表右侧，按需展开）。
    const drawerChildren: Phaser.GameObjects.GameObject[] = []
    const drawerBg = scene.add.graphics()
    drawerBg.fillStyle(0x14100b, 0.97).fillRoundedRect(560, 116, 320, 356, 10)
    drawerBg.lineStyle(2, GOLD, 0.9).strokeRoundedRect(560, 116, 320, 356, 10)
    drawerBg.lineStyle(1, 0x8a6a30, 0.6).strokeRoundedRect(565, 121, 310, 346, 8)
    drawerChildren.push(drawerBg)
    drawerChildren.push(
      scene.add
        .text(600, 136, '太上老君', {
          fontSize: '18px',
          fontFamily: activeArtFont().family,
          color: HUD_COLORS.textGold,
          stroke: '#2c1a0c',
          strokeThickness: 3,
          padding: { top: 4, bottom: 4 },
        })
        .setOrigin(0, 0.5),
    )
    this.drawerCloseRect = centerRect(852, 136, 30, 24)
    drawerChildren.push(
      scene.add.rectangle(852, 136, 30, 24, INK, 0.9).setStrokeStyle(1, 0x8a7f66, 1),
      scene.add.text(852, 136, '×', { fontSize: '16px', color: HUD_COLORS.text }).setOrigin(0.5),
    )
    drawerChildren.push(scene.add.rectangle(720, 292, 288, 260, INK, 0.72).setStrokeStyle(1, 0x6b5f47, 1))
    this.chatLayer = scene.add.container(0, 0)
    drawerChildren.push(this.chatLayer)
    this.inputDom = this.buildInput(578, 442, 224)
    drawerChildren.push(this.inputDom)
    this.sendRect = centerRect(840, 442, 58, 30)
    this.sendButton = scene.add.rectangle(840, 442, 58, 30, 0x3a2c12, 0.9).setStrokeStyle(2, GOLD, 0.9)
    drawerChildren.push(this.sendButton, scene.add.text(840, 442, '发送', { fontSize: '13px', color: HUD_COLORS.text }).setOrigin(0.5))
    this.chatDrawer = scene.add.container(0, 0, drawerChildren).setVisible(false)

    this.container = scene.add
      .container(0, 0, [...children, this.chatDrawer])
      .setScrollFactor(0)
      .setDepth(MODAL_PANEL_DEPTH)
      .setVisible(false)
    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointermove', this.onPointerMove)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
    })
    this.setDrawerOpen(false)
    this.refresh()
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  open(): void {
    this.container.setVisible(true)
    this.refresh()
    if (this.drawerOpen) setTimeout(() => this.input.focus(), 0)
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
    // 老君有新回话而抽屉收着 → 自动弹开（代炼结果/闲聊都别静默丢）。
    if (!this.drawerOpen) this.setDrawerOpen(true)
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
    drawerOpen: boolean
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
      drawerOpen: this.drawerOpen,
    }
  }

  private setDrawerOpen(open: boolean): void {
    this.drawerOpen = open
    this.chatDrawer.setVisible(open)
    // DOM 输入框不完全跟随嵌套容器可见性（Phaser DOMElement 的已知坑），
    // 显式同步 display。
    ;(this.inputDom.node as HTMLElement).style.display = open && this.container.visible ? '' : 'none'
    if (open && this.container.visible) setTimeout(() => this.input.focus(), 0)
    else this.input.blur()
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const lx = pointer.x - this.container.x
    const ly = pointer.y - this.container.y
    if (withinRect(lx, ly, this.closeRect)) {
      this.close()
      return
    }
    if (withinRect(lx, ly, this.laojunRect)) {
      this.setDrawerOpen(!this.drawerOpen)
      return
    }
    if (this.drawerOpen) {
      if (withinRect(lx, ly, this.drawerCloseRect)) {
        this.setDrawerOpen(false)
        return
      }
      if (!this.locked && withinRect(lx, ly, this.sendRect)) {
        this.submitChat()
        return
      }
      // 抽屉展开时挡住其覆盖区域内的列表点击。
      if (lx >= 560 && lx <= 880 && ly >= 116 && ly <= 472) return
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
      withinRect(lx, ly, this.laojunRect) ||
      (this.drawerOpen && (withinRect(lx, ly, this.drawerCloseRect) || (!this.locked && withinRect(lx, ly, this.sendRect)))) ||
      (!this.locked && (withinRect(lx, ly, this.prevRect) || withinRect(lx, ly, this.nextRect)))
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
      const y = 130 + index * 48
      const bg = this.scene.add
        .rectangle(480, y, 700, 42, canCraftNow ? 0x1d2a18 : INK, canCraftNow ? 0.82 : 0.68)
        .setStrokeStyle(2, canCraftNow ? GOLD : 0x5c5141, canCraftNow ? 0.9 : 0.65)
      const product = this.scene.add.text(150, y - 14, `${recipe.productName}`, {
        fontSize: '15px',
        color: rarityCss(qualityRarity(recipe.quality)),
        fontStyle: 'bold',
      })
      const detail = this.scene.add.text(150, y + 4, `${recipe.quality} · ${materialLine(recipe, check)}`, {
        fontSize: '11px',
        color: HUD_COLORS.textDim,
      })
      detail.setFixedSize(500, 16)
      const status = this.scene.add.text(756, y - 13, checkStatus(check), {
        fontSize: '11px',
        color: canCraftNow ? '#9cf58f' : '#e0b060',
      }).setOrigin(0.5, 0)
      const button = this.scene.add
        .rectangle(756, y + 10, 70, 24, canCraftNow ? 0x4a3212 : 0x242026, canCraftNow ? 0.95 : 0.65)
        .setStrokeStyle(1, canCraftNow ? GOLD : 0x5c5141, 1)
      const buttonLabel = this.scene.add.text(756, y + 10, '打造', {
        fontSize: '13px',
        color: canCraftNow ? HUD_COLORS.text : '#8d8790',
      }).setOrigin(0.5)
      this.rows.push({ recipe, hitRect: centerRect(756, y + 10, 70, 24), canCraftNow })
      this.rowLayer.add([bg, product, detail, status, button, buttonLabel])
    })
    this.pageText.setText(`${this.page + 1}/${this.maxPage() + 1}`)
  }

  /** 动态堆叠 + 从旧往新裁剪：长回话按实测高度排版，放不下就丢最旧的，
   * 修掉"老君聊天文本溢出面板"的旧账（此前固定 36px 行距，多行 wrap 会
   * 叠字/出框）。 */
  private rebuildChat(): void {
    this.chatLayer.removeAll(true)
    const lines = this.npcLines.length ? this.npcLines : ['老君在炉旁闭目养神。']
    const boxTop = 172
    const boxBottom = 414
    // 先从最新往回量高度，决定能塞下几条。
    const texts: Phaser.GameObjects.Text[] = []
    for (const line of lines) {
      texts.push(
        this.scene.add
          .text(586, 0, line, {
            fontSize: '12px',
            color: HUD_COLORS.text,
            wordWrap: { width: 266 },
            lineSpacing: 3,
          })
          .setVisible(false),
      )
    }
    const gap = 10
    let need = 0
    let firstShown = texts.length
    for (let i = texts.length - 1; i >= 0; i--) {
      const h = texts[i].height + gap
      if (need + h > boxBottom - boxTop) break
      need += h
      firstShown = i
    }
    let y = boxTop
    texts.forEach((t, i) => {
      if (i < firstShown) {
        t.destroy()
        return
      }
      t.setY(y).setVisible(true)
      if (i === texts.length - 1) t.setColor(HUD_COLORS.textGold)
      y += t.height + gap
      this.chatLayer.add(t)
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
