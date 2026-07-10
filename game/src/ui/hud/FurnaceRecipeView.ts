import Phaser from 'phaser'
import { logicalPointerPosition } from '../../systems/renderScale'
import type { CraftCheck, FurnaceRecipe } from '../../systems/furnaceRecipe'
import { HUD_COLORS } from './hudTheme'
import { rarityCss } from './rarity'
import { withinRect, type Rect } from '../screenHit'
import { MODAL_PANEL_DEPTH } from './depths'
import { FRAME_SCALE, FRAME_TEX, WIN } from './FurnacePanel'
import { activeArtFont } from '../../systems/artFont'
import { getSharedSocialClient, resolveSocialServerBaseUrl } from '../../net/socialClient'
import { stackChatLayout, clampChatScroll, maxChatScroll } from '../../systems/chatLayout'
import { CHAT_HISTORY_LIMIT, loadChatHistory, saveChatHistory, type ChatHistoryStorage, type ChatMessage } from '../../systems/chatHistory'

// 2026-07-09 重做（用户："这个页面重做——把老君收到一个入口里，按需要打开；
// 另外现在只展示悟空的装备制作"）：
//   - 配方列表铺满面板主区（此前右半永远被老君聊天栏占着）；
//   - 「太上老君」成为右上角入口按钮，点开一个覆盖式抽屉（聊天记录 + 输入 +
//     发送），老君有新回话时自动弹开；
//   - 配方按角色过滤在调用方做（WorldMapScene 只传悟空 + 无角色限定件），
//     本组件不感知角色语义。
// 公开 API（open/close/refresh/appendNpcLine/setCraftLocked/debugState）与
// 重做前一致，验收 hook 不受影响。
//
// 2026-07-10 抽屉内部重做（老玩家聊天 UX 反馈，四点）：
//   - 溢出修复：所有聊天 Text 补 wordWrap.useAdvancedWrap，中文长句按字宽折
//     行而不是按空格（CJK 没有空格，旧的默认 wordWrap 因此完全不折行、整段
//     文字冲出抽屉右缘）。
//   - ChatGPT 式布局：用户消息=右对齐圆角气泡，老君回复=左侧无气泡平铺文
//     本；npcLines: string[] 换成结构化 ChatMessage[]，堆叠高度按实测文本/
//     气泡高度动态排（见 systems/chatLayout.ts 的纯函数）。
//   - 历史可滚动：chatContentLayer 套 WebGL Mask filter 裁剪到 CHAT_VIEWPORT，滚
//     轮在抽屉开启 + 指针落在该矩形内时平移内容，clamp 逻辑同样在
//     chatLayout.ts；新消息到达强制回滚到底部（snap-to-bottom）。
//   - 按账号持久化：localStorage 经 systems/chatHistory.ts 存取，key 按当前
//     登录用户名区分（未登录落 'guest'），上限 50 条。

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

// Chat drawer geometry (screen-space, all inside `this.container` which sits
// at (0,0) unscaled -- local coords double as screen coords, see the
// container construction at the bottom of the constructor).
const CHAT_VIEWPORT: Rect = { x: 582, y: 172, w: 268, h: 242 }
const CHAT_GAP = 10
const NPC_INSET = 4
const BUBBLE_MAX_FRACTION = 0.78
const BUBBLE_PAD_X = 10
const BUBBLE_PAD_Y = 7
const BUBBLE_RADIUS = 8
const SCROLL_INDICATOR_X = CHAT_VIEWPORT.x + CHAT_VIEWPORT.w + 4
const SCROLL_INDICATOR_MIN_H = 18

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
  private readonly chatContentLayer: Phaser.GameObjects.Container
  private readonly chatMaskShape: Phaser.GameObjects.Graphics
  private readonly scrollIndicator: Phaser.GameObjects.Rectangle
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
  private messages: ChatMessage[] = []
  private historyLoaded = false
  private historyUsername = ''
  private chatScroll = 0
  private chatContentHeight = 0
  private page = 0
  private locked = false
  private drawerOpen = false

  constructor(scene: Phaser.Scene, opts: FurnaceRecipeViewOptions) {
    this.scene = scene
    this.opts = opts

    const children: Phaser.GameObjects.GameObject[] = []
    // Dim backdrop, doubling as the click-swallow layer (see .setInteractive()
    // below): without it, a click anywhere on this panel that doesn't land on
    // one of FurnaceRecipeView's own manually-hit-tested buttons falls
    // straight through Phaser's topOnly input resolution to whatever
    // interactive GameObject sits underneath -- WorldMapScene's level nodes
    // use real setInteractive() (see WorldMapScene.ts's buildFurnaceRecipeView
    // callers), so a click on this panel's body while it's open could enter a
    // level right through the modal. This rect already covers the entire
    // 960x540 canvas at this container's MODAL_PANEL_DEPTH, so making it
    // interactive (with no listener attached) is enough to win Phaser's
    // topOnly pick and swallow the click without doing anything else --
    // FurnaceRecipeView's own buttons are unaffected since they're resolved
    // by the separate scene.input.on('pointerdown') rect-test below, not by
    // Phaser's per-GameObject interactive dispatch.
    children.push(scene.add.rectangle(480, 270, 960, 540, 0x000000, 0.6).setInteractive())
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

    // Scrollable message log: chatContentLayer holds every message group
    // stacked oldest-top -> newest-bottom (see rebuildChat/applyChatScroll);
    // it's masked to CHAT_VIEWPORT via Phaser 4's WebGL Mask filter. The mask
    // shape is created off-list so it does not render as ordinary scene art.
    this.chatContentLayer = scene.add.container(0, 0)
    this.chatMaskShape = scene.make.graphics({}, false).setScrollFactor(0)
    this.chatMaskShape.fillStyle(0xffffff, 1).fillRect(CHAT_VIEWPORT.x, CHAT_VIEWPORT.y, CHAT_VIEWPORT.w, CHAT_VIEWPORT.h)
    this.chatContentLayer.enableFilters()
    this.chatContentLayer.filters!.external.addMask(this.chatMaskShape, false, scene.cameras.main)
    drawerChildren.push(this.chatContentLayer)

    // Thin gold scroll indicator on the drawer's inner right edge -- hidden
    // (zero alpha) whenever the whole history fits without scrolling.
    this.scrollIndicator = scene.add
      .rectangle(SCROLL_INDICATOR_X, CHAT_VIEWPORT.y, 3, CHAT_VIEWPORT.h, GOLD, 0.75)
      .setOrigin(0.5, 0)
      .setVisible(false)
    drawerChildren.push(this.scrollIndicator)

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
    scene.input.on('wheel', this.onWheel)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
      scene.input.off('wheel', this.onWheel)
      this.chatMaskShape.destroy()
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
    this.ensureHistoryLoaded()
    if (this.messages[this.messages.length - 1]?.text === line && this.messages[this.messages.length - 1]?.who === 'npc') return
    this.pushMessage({ who: 'npc', text: line })
    // 老君有新回话而抽屉收着 → 自动弹开（代炼结果/闲聊都别静默丢）。
    if (!this.drawerOpen) this.setDrawerOpen(true)
    this.chatScroll = Number.POSITIVE_INFINITY // snap to newest on arrival
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
    if (open) {
      this.ensureHistoryLoaded()
      if (this.container.visible) setTimeout(() => this.input.focus(), 0)
    } else {
      this.input.blur()
    }
  }

  // ---------- chat persistence ----------

  /** `window.localStorage` typed down to the injectable surface chatHistory.ts
   * expects, or null when unavailable (no window, storage disabled). This
   * view only ever runs inside a live Phaser scene (never under vitest --
   * buildInput() below already calls `document.createElement` unguarded), so
   * `window` normally exists; the guard exists purely for storage being
   * disabled/absent at runtime (private browsing, embedded webview), not for
   * a node test environment. */
  private chatStorage(): ChatHistoryStorage | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage
    } catch {
      return null
    }
  }

  private resolveUsername(): string {
    if (typeof window === 'undefined') return 'guest'
    try {
      const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
      const username = getSharedSocialClient(baseUrl).getSession()?.user.username
      return username && username.length > 0 ? username : 'guest'
    } catch {
      return 'guest'
    }
  }

  /** Loads this account's persisted chat log the first time it's needed
   * (drawer opens, or a message arrives before the drawer has ever been
   * opened -- appendNpcLine can auto-open it). Re-loads if the resolved
   * username changed since the last load (e.g. login completes after the
   * view was constructed as 'guest'), replacing the in-memory session log
   * with that account's own history. */
  private ensureHistoryLoaded(): void {
    const username = this.resolveUsername()
    if (this.historyLoaded && username === this.historyUsername) return
    this.historyLoaded = true
    this.historyUsername = username
    const storage = this.chatStorage()
    this.messages = storage ? loadChatHistory(storage, username) : []
  }

  private pushMessage(message: ChatMessage): void {
    this.messages.push(message)
    if (this.messages.length > CHAT_HISTORY_LIMIT) this.messages = this.messages.slice(-CHAT_HISTORY_LIMIT)
    const storage = this.chatStorage()
    if (storage) saveChatHistory(storage, this.historyUsername, this.messages)
  }

  // ---------- input ----------

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    const p = logicalPointerPosition(pointer)
    const lx = p.x - this.container.x
    const ly = p.y - this.container.y
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
    const p = logicalPointerPosition(pointer)
    const lx = p.x - this.container.x
    const ly = p.y - this.container.y
    const overRow = this.rows.some((row) => !this.locked && row.canCraftNow && withinRect(lx, ly, row.hitRect))
    const overControl =
      withinRect(lx, ly, this.closeRect) ||
      withinRect(lx, ly, this.laojunRect) ||
      (this.drawerOpen && (withinRect(lx, ly, this.drawerCloseRect) || (!this.locked && withinRect(lx, ly, this.sendRect)))) ||
      (!this.locked && (withinRect(lx, ly, this.prevRect) || withinRect(lx, ly, this.nextRect)))
    this.scene.input.manager.canvas.style.cursor = overRow || overControl ? 'pointer' : ''
  }

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number): void => {
    if (!this.container.visible || !this.drawerOpen) return
    const p = logicalPointerPosition(pointer)
    const lx = p.x - this.container.x
    const ly = p.y - this.container.y
    if (!withinRect(lx, ly, CHAT_VIEWPORT)) return
    this.chatScroll = clampChatScroll(this.chatScroll + dy, this.chatContentHeight, CHAT_VIEWPORT.h)
    this.applyChatScroll()
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

  // ---------- chat rendering ----------

  /** ChatGPT-style log: 老君 lines render as flat left-aligned text (no
   * bubble), 你 lines render as right-aligned rounded bubbles that hug their
   * own (wrapped) text width. Every message gets `useAdvancedWrap: true` so
   * CJK text -- which has no spaces for Phaser's default word-boundary
   * wrapper to break on -- wraps by character instead of running past
   * CHAT_VIEWPORT's right edge (the original overflow bug: a long 老君 reply
   * rendered as one un-wrapped line that spilled out of the drawer). Items
   * stack via the pure stackChatLayout() (systems/chatLayout.ts) using each
   * item's *measured* height, so multi-line messages don't overlap the next
   * one. Does not rebuild the current scroll position -- see chatScroll's
   * callers for who resets it (appendNpcLine/submitChat snap to bottom on a
   * genuinely new message; everything else, e.g. setCraftLocked's refresh(),
   * preserves wherever the reader currently is via clampChatScroll). */
  private rebuildChat(): void {
    this.chatContentLayer.removeAll(true)
    const messages: ChatMessage[] = this.messages.length ? this.messages : [{ who: 'npc', text: '老君在炉旁闭目养神。' }]
    const built = messages.map((m) => this.buildChatItem(m))
    const { tops, contentHeight } = stackChatLayout(
      built.map((b) => b.height),
      CHAT_GAP,
    )
    built.forEach((b, i) => {
      b.group.setY(tops[i])
      this.chatContentLayer.add(b.group)
    })
    this.chatContentHeight = contentHeight
    this.chatScroll = clampChatScroll(this.chatScroll, contentHeight, CHAT_VIEWPORT.h)
    this.applyChatScroll()
  }

  private buildChatItem(msg: ChatMessage): { group: Phaser.GameObjects.Container; height: number } {
    if (msg.who === 'npc') {
      const text = this.scene.add.text(CHAT_VIEWPORT.x + NPC_INSET, 0, msg.text, {
        fontSize: '12px',
        fontFamily: activeArtFont().family,
        color: HUD_COLORS.textGold,
        wordWrap: { width: CHAT_VIEWPORT.w - NPC_INSET * 2, useAdvancedWrap: true },
        lineSpacing: 3,
      })
      return { group: this.scene.add.container(0, 0, [text]), height: text.height }
    }
    const maxBubbleW = CHAT_VIEWPORT.w * BUBBLE_MAX_FRACTION
    const maxTextW = maxBubbleW - BUBBLE_PAD_X * 2
    const text = this.scene.add.text(0, 0, msg.text, {
      fontSize: '12px',
      color: HUD_COLORS.text,
      wordWrap: { width: maxTextW, useAdvancedWrap: true },
      lineSpacing: 3,
    })
    const bubbleW = Math.min(maxBubbleW, text.width + BUBBLE_PAD_X * 2)
    const bubbleH = text.height + BUBBLE_PAD_Y * 2
    const bubbleRight = CHAT_VIEWPORT.x + CHAT_VIEWPORT.w
    const bubbleLeft = bubbleRight - bubbleW
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x3a2c12, 0.94).fillRoundedRect(bubbleLeft, 0, bubbleW, bubbleH, BUBBLE_RADIUS)
    bg.lineStyle(1, GOLD, 0.55).strokeRoundedRect(bubbleLeft, 0, bubbleW, bubbleH, BUBBLE_RADIUS)
    text.setPosition(bubbleLeft + BUBBLE_PAD_X, BUBBLE_PAD_Y)
    return { group: this.scene.add.container(0, 0, [bg, text]), height: bubbleH }
  }

  /** Moves the already-built chatContentLayer to reflect this.chatScroll (no
   * rebuild -- cheap enough to call on every wheel tick) and updates the
   * scroll indicator bar. Content coordinate 0 (oldest message's top) maps
   * to screen y = CHAT_VIEWPORT.y - chatScroll, so chatScroll = 0 pins the
   * oldest message to the viewport's top and chatScroll = max pins the
   * newest message's bottom to the viewport's bottom. */
  private applyChatScroll(): void {
    this.chatContentLayer.setY(CHAT_VIEWPORT.y - this.chatScroll)
    const max = maxChatScroll(this.chatContentHeight, CHAT_VIEWPORT.h)
    if (max <= 0) {
      this.scrollIndicator.setVisible(false)
      return
    }
    const barH = Math.max(SCROLL_INDICATOR_MIN_H, (CHAT_VIEWPORT.h * CHAT_VIEWPORT.h) / this.chatContentHeight)
    const travel = CHAT_VIEWPORT.h - barH
    const barY = CHAT_VIEWPORT.y + travel * (this.chatScroll / max)
    this.scrollIndicator.setVisible(true).setSize(3, barH).setY(barY)
  }

  private submitChat(): void {
    if (this.locked) return
    const text = this.input.value.trim()
    if (!text) return
    this.input.value = ''
    this.ensureHistoryLoaded()
    this.pushMessage({ who: 'user', text })
    this.opts.onChatSubmit(text)
    this.chatScroll = Number.POSITIVE_INFINITY // snap to newest on send
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
