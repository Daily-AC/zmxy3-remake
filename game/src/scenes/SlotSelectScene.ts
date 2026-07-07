import Phaser from 'phaser'
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

// Six-slot save panel laid out after the 造梦西游 大闹天庭篇 save dialog
// (docs/reference/zmxy-online-screens/save-slots.png): a dark panel over the
// dimmed title art, 2 columns x 3 rows of cards, each with a big orange slot
// number + hero + timestamp. Empty card -> character select (new game); occupied
// card -> continue (load); a small ✕ deletes. Reads localStorage on every entry
// so a page refresh shows persisted slots. All storage goes through saveSlots.
//
// SOURCE NOTE: title-bg is 造梦 Online-sourced art (whole-series usable — CLAUDE.md).
export const ASSET_SOURCE_ONLINE = true

const TITLE_BG = 'title_bg'
const W = 960
const H = 540
// Card grid geometry (2 cols x 3 rows).
const CARD_W = 400
const CARD_H = 116
const GRID_X = 62
const GRID_Y = 106
const GAP_X = 26
const GAP_Y = 14

export class SlotSelectScene extends Phaser.Scene {
  private cardLayer!: Phaser.GameObjects.Container
  private confirmLayer?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.slotSelect)
  }

  preload(): void {
    if (!this.textures.exists(TITLE_BG)) this.load.image(TITLE_BG, 'assets/online/title/title-bg.png')
  }

  create(): void {
    // Dimmed title art backdrop (unifies with the main menu).
    if (this.textures.exists(TITLE_BG)) {
      const bg = this.add.image(W / 2, H / 2, TITLE_BG)
      bg.setScale(Math.max(W / bg.width, H / bg.height))
      this.add.graphics().fillStyle(0x07060a, 0.62).fillRect(0, 0, W, H)
    } else {
      this.add.graphics().fillStyle(0x0d0a12, 1).fillRect(0, 0, W, H)
    }

    // Save panel.
    const panel = this.add.graphics()
    panel.fillStyle(0x120d16, 0.92).fillRoundedRect(30, 42, W - 60, H - 84, 16)
    panel.lineStyle(2.5, 0x4a2c12, 1).strokeRoundedRect(30, 42, W - 60, H - 84, 16)
    panel.lineStyle(1, 0xd9b45a, 0.7).strokeRoundedRect(35, 47, W - 70, H - 94, 12)
    this.add
      .text(W / 2, 70, '选择存档', { fontSize: '30px', fontStyle: 'bold', color: '#f2c65a', stroke: '#3a2410', strokeThickness: 5 })
      .setOrigin(0.5)
    // Red ✕ close (top-right) -> main menu.
    this.add
      .text(W - 52, 66, '✕', { fontSize: '26px', fontStyle: 'bold', color: '#e0503a' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', (): void => {})
      .on('pointerdown', () => this.scene.start(SCENE.mainMenu))

    this.cardLayer = this.add.container(0, 0)
    this.renderSlots()
    this.exposeHooks()
  }

  private renderSlots(): void {
    this.cardLayer.removeAll(true)
    const summaries = listSlotSummaries(shellStorage())
    for (const s of summaries) this.buildCard(s)
  }

  private cardOrigin(slot: SlotId): { left: number; top: number } {
    const col = slot % 2
    const row = Math.floor(slot / 2)
    return { left: GRID_X + col * (CARD_W + GAP_X), top: GRID_Y + row * (CARD_H + GAP_Y) }
  }

  private buildCard(summary: SlotSummary): void {
    const { left, top } = this.cardOrigin(summary.slot)
    const cy = top + CARD_H / 2

    const frame = this.add.graphics()
    frame.fillStyle(0x0d0a06, 0.72).fillRoundedRect(left, top, CARD_W, CARD_H, 10)
    frame.lineStyle(1.5, 0x6b4a2c, 1).strokeRoundedRect(left, top, CARD_W, CARD_H, 10)
    this.cardLayer.add(frame)

    // Big orange slot numeral (left).
    this.cardLayer.add(
      this.add
        .text(left + 36, cy, `${summary.slot + 1}`, {
          fontSize: '46px',
          fontStyle: 'bold',
          color: '#ff9a3d',
          stroke: '#3a1c08',
          strokeThickness: 5,
        })
        .setOrigin(0.5),
    )

    if (!summary.occupied) {
      this.buildEmpty(left, top, cy, summary.slot)
    } else {
      this.buildOccupied(left, top, cy, summary)
    }

    // Hover highlight on the whole card.
    const hover = this.add.graphics()
    this.cardLayer.add(hover)
    const hit = this.add
      .rectangle(left + CARD_W / 2, cy, CARD_W, CARD_H, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => hover.clear().lineStyle(2, 0xffd24a, 0.9).strokeRoundedRect(left, top, CARD_W, CARD_H, 10))
      .on('pointerout', () => hover.clear())
      .on('pointerdown', () => (summary.occupied ? this.continueGame(summary.slot) : this.startNewGame(summary.slot)))
    this.cardLayer.add(hit)

    // Delete ✕ (occupied only) sits above the card hit area.
    if (summary.occupied) {
      const del = this.add
        .text(left + CARD_W - 20, top + 16, '✕', { fontSize: '18px', color: '#b06a4a' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => del.setColor('#e0503a'))
        .on('pointerout', () => del.setColor('#b06a4a'))
        .on('pointerdown', () => this.askDelete(summary.slot))
      this.cardLayer.add(del)
    }
  }

  private buildEmpty(left: number, _top: number, cy: number, _slot: SlotId): void {
    this.cardLayer.add(this.add.text(left + 96, cy, '＋', { fontSize: '40px', color: '#5a4a30' }).setOrigin(0.5))
    this.cardLayer.add(
      this.add.text(left + 150, cy, '空存档位', { fontSize: '20px', color: '#8a7f68' }).setOrigin(0, 0.5),
    )
  }

  private buildOccupied(left: number, top: number, cy: number, s: Extract<SlotSummary, { occupied: true }>): void {
    // Round portrait.
    const px = left + 108
    const badge = this.add.graphics()
    badge.fillStyle(0x0e0b07, 0.8).fillCircle(px, cy, 32)
    badge.lineStyle(2, 0xd9b45a, 0.9).strokeCircle(px, cy, 32)
    this.cardLayer.add(badge)
    if (this.textures.exists('role1_0') && s.heroId === 1) {
      const head = this.add.image(px, cy, 'role1_0', 0).setScale(0.55)
      const mask = this.make.graphics({}).fillCircle(px, cy, 30)
      head.setMask(mask.createGeometryMask())
      this.cardLayer.add(head)
    } else {
      this.cardLayer.add(this.add.text(px, cy, s.heroName[0], { fontSize: '30px', color: '#f2c65a' }).setOrigin(0.5))
    }

    const tx = left + 156
    this.cardLayer.add(
      this.add
        .text(tx, top + 20, `${s.heroName}   Lv.${s.level}`, { fontSize: '21px', fontStyle: 'bold', color: '#f2eddf' })
        .setOrigin(0, 0),
    )
    this.cardLayer.add(
      this.add.text(tx, top + 52, `游戏时间 ${formatPlaytime(s.playtimeSec)}`, { fontSize: '15px', color: '#c8bfa6' }).setOrigin(0, 0),
    )
    this.cardLayer.add(
      this.add.text(tx, top + 76, formatSavedAt(s.savedAt), { fontSize: '15px', color: '#9a8f78' }).setOrigin(0, 0),
    )
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
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setInteractive()
    const panelG = this.add.graphics()
    panelG.fillStyle(0x1a130b, 0.98).fillRoundedRect(300, 190, 360, 160, 14)
    panelG.lineStyle(2, 0xb85c3c, 1).strokeRoundedRect(300, 190, 360, 160, 14)
    const title = this.add
      .text(480, 232, `删除存档 ${slot + 1}？`, { fontSize: '22px', fontStyle: 'bold', color: '#f2c65a' })
      .setOrigin(0.5)
    const sub = this.add.text(480, 262, '此操作不可撤销', { fontSize: '15px', color: '#c8bfa6' }).setOrigin(0.5)
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
