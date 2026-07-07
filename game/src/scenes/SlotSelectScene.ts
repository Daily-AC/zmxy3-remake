import Phaser from 'phaser'
import { drawPalaceBackdrop, PALACE_BG_TEX, PALACE_BG_URL } from '../ui/menu/inkBackdrop'
import { MenuButton } from '../ui/menu/MenuButton'
import { SCENE, REG, shellStorage } from './shellShared'
import {
  SLOT_IDS,
  listSlotSummaries,
  readSlot,
  deleteSlot,
  formatPlaytime,
  formatSavedAt,
  type SlotId,
  type SlotSummary,
} from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'

// Slot-select menu: three save slots, each either empty (新建存档 -> character
// select) or occupied (continue / delete). Reads localStorage on every entry so
// a page refresh shows the persisted slots -- the acceptance path for
// "刷新页面 → 继续存档槽能读回". All storage access goes through saveSlots (pure
// logic) with the browser localStorage injected here.

const CARD_W = 272
const CARD_H = 312
const CARD_Y = 292
const CARD_X = [176, 480, 784]

export class SlotSelectScene extends Phaser.Scene {
  private cardLayer!: Phaser.GameObjects.Container
  private confirmLayer?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.slotSelect)
  }

  preload(): void {
    if (!this.textures.exists(PALACE_BG_TEX)) this.load.image(PALACE_BG_TEX, PALACE_BG_URL)
  }

  create(): void {
    drawPalaceBackdrop(this)
    this.add
      .text(480, 66, '选择存档', {
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f2c65a',
        stroke: '#3a2410',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
    this.add
      .text(480, 110, '新建一段旅程，或继续未竟的取经路', { fontSize: '16px', color: '#c8bfa6' })
      .setOrigin(0.5)

    new MenuButton(this, {
      x: 90,
      y: 508,
      width: 120,
      height: 40,
      label: '← 返回',
      fontSize: 17,
      variant: 'ghost',
      onClick: () => this.scene.start(SCENE.mainMenu),
    })

    this.cardLayer = this.add.container(0, 0)
    this.renderSlots()
    this.exposeHooks()
  }

  private renderSlots(): void {
    this.cardLayer.removeAll(true)
    const summaries = listSlotSummaries(shellStorage())
    for (const s of summaries) this.buildCard(s)
  }

  private buildCard(summary: SlotSummary): void {
    const cx = CARD_X[summary.slot]
    const top = CARD_Y - CARD_H / 2

    const frame = this.add.graphics()
    frame.fillStyle(0x1a130b, 0.86).fillRoundedRect(cx - CARD_W / 2, top, CARD_W, CARD_H, 14)
    frame.lineStyle(2.5, 0x4a2c12, 1).strokeRoundedRect(cx - CARD_W / 2, top, CARD_W, CARD_H, 14)
    frame.lineStyle(1, 0xd9b45a, 0.8).strokeRoundedRect(cx - CARD_W / 2 + 4, top + 4, CARD_W - 8, CARD_H - 8, 11)
    this.cardLayer.add(frame)

    // Big orange slot numeral + small label, echoing the 造梦 series save panel
    // (docs/reference/zmxy-online-screens/save-slots.png).
    const numeral = this.add
      .text(cx - 26, top + 24, `${summary.slot + 1}`, {
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ff9a3d',
        stroke: '#3a1c08',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    const heading = this.add
      .text(cx + 4, top + 26, '存档', { fontSize: '19px', fontStyle: 'bold', color: '#f0d99a' })
      .setOrigin(0, 0.5)
    this.cardLayer.add([numeral, heading])

    if (!summary.occupied) {
      this.buildEmptyCard(cx, top)
    } else {
      this.buildOccupiedCard(cx, top, summary)
    }
  }

  private buildEmptyCard(cx: number, top: number): void {
    const plus = this.add
      .text(cx, top + 128, '＋', { fontSize: '76px', color: '#6b5a3a' })
      .setOrigin(0.5)
    const label = this.add
      .text(cx, top + 196, '空存档位', { fontSize: '18px', color: '#8a7f68' })
      .setOrigin(0.5)
    this.cardLayer.add([plus, label])

    const btn = new MenuButton(this, {
      x: cx,
      y: top + CARD_H - 44,
      width: 190,
      height: 50,
      label: '新建存档',
      fontSize: 21,
      onClick: () => this.startNewGame(this.slotOf(cx)),
    })
    this.cardLayer.add(btn.container)
  }

  private buildOccupiedCard(cx: number, top: number, s: Extract<SlotSummary, { occupied: true }>): void {
    const portraitY = top + 84
    const badge = this.add.graphics()
    badge.fillStyle(0x0e0b07, 0.7).fillCircle(cx, portraitY, 34)
    badge.lineStyle(2, 0xd9b45a, 0.9).strokeCircle(cx, portraitY, 34)
    this.cardLayer.add(badge)
    // Color 悟空 head from the role sheet if present; else a hero glyph.
    if (this.textures.exists('role1_0') && s.heroId === 1) {
      const head = this.add.image(cx, portraitY, 'role1_0', 0).setScale(0.58)
      const mask = this.make.graphics({}).fillCircle(cx, portraitY, 32)
      head.setMask(mask.createGeometryMask())
      this.cardLayer.add(head)
    } else {
      const glyph = this.add.text(cx, portraitY, s.heroName[0], { fontSize: '38px', color: '#f2c65a' }).setOrigin(0.5)
      this.cardLayer.add(glyph)
    }

    const info = this.add
      .text(
        cx,
        top + 138,
        [`${s.heroName}`, `Lv. ${s.level}`, `游戏时间 ${formatPlaytime(s.playtimeSec)}`, `${formatSavedAt(s.savedAt)}`].join('\n'),
        { fontSize: '16px', color: '#f2eddf', align: 'center', lineSpacing: 5 },
      )
      .setOrigin(0.5, 0)
    this.cardLayer.add(info)

    const cont = new MenuButton(this, {
      x: cx,
      y: top + CARD_H - 54,
      width: 190,
      height: 46,
      label: '继续',
      fontSize: 21,
      onClick: () => this.continueGame(s.slot),
    })
    const del = new MenuButton(this, {
      x: cx,
      y: top + CARD_H - 22,
      width: 130,
      height: 30,
      label: '删除存档',
      fontSize: 15,
      variant: 'danger',
      onClick: () => this.askDelete(s.slot),
    })
    this.cardLayer.add([cont.container, del.container])
  }

  private slotOf(cx: number): SlotId {
    const idx = CARD_X.indexOf(cx)
    return (idx >= 0 ? idx : 0) as SlotId
  }

  // ---------- actions ----------

  private startNewGame(slot: SlotId): void {
    this.scene.start(SCENE.characterSelect, { slot })
  }

  private continueGame(slot: SlotId): void {
    const env = readSlot(shellStorage(), slot)
    if (!env) {
      this.renderSlots()
      return
    }
    this.registry.set(REG.activeSlot, slot)
    this.registry.set(REG.activeSave, env.save)
    this.registry.set(REG.loadedState, restoreGameState(env.save))
    this.registry.set(REG.origin, 'continue')
    this.scene.start(SCENE.battle)
  }

  private askDelete(slot: SlotId): void {
    this.closeConfirm()
    const layer = this.add.container(0, 0).setDepth(300)
    const shade = this.add.rectangle(480, 270, 960, 540, 0x000000, 0.62).setInteractive()
    const panelG = this.add.graphics()
    panelG.fillStyle(0x1a130b, 0.98).fillRoundedRect(300, 190, 360, 160, 14)
    panelG.lineStyle(2, 0xb85c3c, 1).strokeRoundedRect(300, 190, 360, 160, 14)
    const title = this.add
      .text(480, 232, `删除存档 ${slot + 1}？`, { fontSize: '22px', fontStyle: 'bold', color: '#f2c65a' })
      .setOrigin(0.5)
    const sub = this.add
      .text(480, 262, '此操作不可撤销', { fontSize: '15px', color: '#c8bfa6' })
      .setOrigin(0.5)
    layer.add([shade, panelG, title, sub])

    const yes = new MenuButton(this, {
      x: 400,
      y: 316,
      width: 130,
      height: 42,
      label: '确认删除',
      fontSize: 18,
      variant: 'danger',
      onClick: () => {
        deleteSlot(shellStorage(), slot)
        this.closeConfirm()
        this.renderSlots()
      },
    })
    const no = new MenuButton(this, {
      x: 560,
      y: 316,
      width: 130,
      height: 42,
      label: '取消',
      fontSize: 18,
      variant: 'ghost',
      onClick: () => this.closeConfirm(),
    })
    layer.add([yes.container, no.container])
    this.confirmLayer = layer
  }

  private closeConfirm(): void {
    this.confirmLayer?.destroy(true)
    this.confirmLayer = undefined
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.slotSelect
    w.__shellSlots = () => listSlotSummaries(shellStorage())
    w.__shellNewGame = (slot: number) => this.startNewGame((slot as SlotId) ?? 0)
    w.__shellContinue = (slot: number) => this.continueGame((slot as SlotId) ?? 0)
    w.__shellDeleteSlot = (slot: number) => {
      deleteSlot(shellStorage(), (slot as SlotId) ?? 0)
      this.renderSlots()
    }
    w.__shellRefreshSlots = () => this.renderSlots()
    w.__shellAskDelete = (slot: number) => this.askDelete((slot as SlotId) ?? 0)
    w.__shellCloseConfirm = () => this.closeConfirm()
    void SLOT_IDS
  }
}
