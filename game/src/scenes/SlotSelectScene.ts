import Phaser from 'phaser'
import { MenuButton } from '../ui/menu/MenuButton'
import { SCENE, REG, shellStorage } from './shellShared'
import {
  SLOT_IDS,
  listSlotSummaries,
  readSlot,
  deleteSlot,
  formatSavedAt,
  type SlotId,
  type SlotSummary,
} from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'

// Save panel redone against the 造梦西游 Online "存档记录" dialog
// (docs/reference/user-flow-refs/saveslots-original.png, spec S3 -- user
// explicitly picked the Online version over vendor 造3's own save UI, which
// FFDec can't extract anyway: SaveInter's panel is pure vector+TextField, no
// baked bitmap exists to pull, see docs/reference/zmxy-online-extracted's
// README "未收录" note). No matching baked asset for the panel chrome exists
// in the Online extract either (same reason -- it's a vector dialog), so
// every layout constant below is "图量": measured off the reference PNG
// (color samples + proportions), not a symbol matrix. See
// tasks/selectrole-saveslots-report.md for the sampled hex values and the
// crop this was measured from.
//
// Structure: two-tone dark panel (lighter-gray header strip + darker-gray
// body, no gold border anywhere), "存档记录" centered title, red X close
// top-right, 2x3 grid of near-black rounded cards (big orange numeral left,
// two text lines right: hero name(s) / timestamp). Reference shows exactly
// two text lines per card -- no level, no playtime -- so both are omitted
// from the card face here (data still lives in SlotSummary, just not
// rendered; see report Adapted/Dropped). Reference also shows no per-card
// avatar/portrait; dropped to match. Empty slots keep the same card chrome
// with "空存档位" instead of name+timestamp.
//
// SOURCE NOTE: whole-series Online art is fair game per CLAUDE.md.
export const ASSET_SOURCE_ONLINE = true

const TITLE_BG = 'title_bg'
const W = 960
const H = 540

// Panel (图量, saveslots-original.png crop proportions -- see report).
const PANEL_X = 30
const PANEL_Y = 42
const PANEL_W = 900
const PANEL_H = 456
const HEADER_H = 64
const RADIUS = 16

// Card grid (2 cols x 3 rows), 图量 from the same crop.
const CARD_W = 411
const CARD_H = 99
const GRID_X = PANEL_X + 20
const GRID_Y = PANEL_Y + HEADER_H + 28
const GAP_X = 37
const GAP_Y = 14
const CARD_RADIUS = 10

// Colors sampled directly off the reference PNG (see report for pixel coords).
const COLOR_HEADER = 0x6e6e6e // header strip ~#747474
const COLOR_BODY = 0x242424 // panel body ~#262626
const COLOR_CARD = 0x0d0d0d // card fill, near-black
const COLOR_ORANGE = 0xc36a3d // slot numeral ~#c06b41
const COLOR_CLOSE = 0xe0392a // close X, vivid red
const COLOR_TITLE = '#f0f0f0'
const COLOR_NAME = '#f0ede6'
const COLOR_TIME = '#a8a8a8'
const COLOR_EMPTY = '#7a7a7a'

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

    // Two-tone panel: header strip (lighter gray) over body (darker gray).
    // Drawn as one rounded rect per tone, header clipped to the top so the
    // outer silhouette still reads as a single rounded card.
    const panel = this.add.graphics()
    panel.fillStyle(COLOR_BODY, 0.97).fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, RADIUS)
    panel.fillStyle(COLOR_HEADER, 0.97)
    panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, HEADER_H, { tl: RADIUS, tr: RADIUS, bl: 0, br: 0 })
    // Square off the header's lower corners against the body tone so the
    // rounded-rect fill doesn't leave a visible seam.
    panel.fillRect(PANEL_X, PANEL_Y + HEADER_H - RADIUS, PANEL_W, RADIUS)

    // Title position tuned against the reference via normalized cross-
    // correlation (weighted centroid), not eyeballed -- see report "终审返修":
    // pre-fix residual was (dx=-0.7, dy=+5.6)px, i.e. X was already aligned,
    // Y needed +6px down. Baseline was (W/2, PANEL_Y+HEADER_H/2).
    this.add
      .text(W / 2 - 1, PANEL_Y + HEADER_H / 2 + 6, '存档记录', {
        fontSize: '26px',
        fontStyle: 'bold',
        color: COLOR_TITLE,
      })
      .setOrigin(0.5)

    // Red ✕ close (top-right of the dialog) -> main menu. Checked against the
    // reference for the 终审返修 pass: the reference's red X actually sits
    // over the *persistent right-side menu strip* (above "新的开始"), not
    // over the 存档记录 dialog itself -- our layout has no such persistent
    // side panel (that's a separate main-menu structure outside S3's scope),
    // so literal pixel-position matching doesn't apply here. Kept at the
    // dialog's own top-right corner as the closest structural equivalent.
    this.add
      .text(PANEL_X + PANEL_W - 10, PANEL_Y - 22, '✕', { fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setTint(COLOR_CLOSE)
      .setInteractive({ useHandCursor: true })
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
    frame.fillStyle(COLOR_CARD, 0.94).fillRoundedRect(left, top, CARD_W, CARD_H, CARD_RADIUS)
    this.cardLayer.add(frame)

    // Big orange slot numeral (left). X tuned +13px right against the
    // reference via weighted-centroid cross-correlation (终审返修: pre-fix
    // residual measured dx=+13.8px on slot 1, dx=+11.4px on slot 2 --
    // averaged, applied uniformly; Y residual was within noise, untouched).
    this.cardLayer.add(
      this.add
        .text(left + 47, cy, `${summary.slot + 1}`, {
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setTint(COLOR_ORANGE),
    )

    if (!summary.occupied) {
      this.buildEmpty(left, cy)
    } else {
      this.buildOccupied(left, cy, summary)
    }

    // Hover highlight on the whole card (subtle, matches the muted palette --
    // no gold anywhere per spec).
    const hover = this.add.graphics()
    this.cardLayer.add(hover)
    const hit = this.add
      .rectangle(left + CARD_W / 2, cy, CARD_W, CARD_H, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => hover.clear().lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(left, top, CARD_W, CARD_H, CARD_RADIUS))
      .on('pointerout', () => hover.clear())
      .on('pointerdown', () => (summary.occupied ? this.continueGame(summary.slot) : this.startNewGame(summary.slot)))
    this.cardLayer.add(hit)

    // Delete ✕ (occupied only): a real save-management need this project has
    // that the reference doesn't show a control for (Online's screenshot has
    // no visible per-card delete affordance) -- kept small/muted so it doesn't
    // compete with the reference's own visual language.
    if (summary.occupied) {
      const del = this.add
        .text(left + CARD_W - 18, top + 14, '✕', { fontSize: '15px', color: '#6a6a6a' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => del.setColor('#e0392a'))
        .on('pointerout', () => del.setColor('#6a6a6a'))
        .on('pointerdown', () => this.askDelete(summary.slot))
      this.cardLayer.add(del)
    }
  }

  private buildEmpty(left: number, cy: number): void {
    this.cardLayer.add(
      this.add.text(left + 100, cy, '空存档位', { fontSize: '19px', color: COLOR_EMPTY }).setOrigin(0, 0.5),
    )
  }

  private buildOccupied(left: number, cy: number, s: Extract<SlotSummary, { occupied: true }>): void {
    const tx = left + 100
    // Two lines only (reference: hero name(s) + timestamp -- no level/playtime
    // shown on the card face, see file header note).
    this.cardLayer.add(
      this.add.text(tx, cy - 16, s.heroName, { fontSize: '20px', fontStyle: 'bold', color: COLOR_NAME }).setOrigin(0, 0.5),
    )
    this.cardLayer.add(
      this.add.text(tx, cy + 14, formatSavedAt(s.savedAt), { fontSize: '15px', color: COLOR_TIME }).setOrigin(0, 0.5),
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
    // S1: a loaded save also lands on the world-map hub -- the original
    // SelectPLace screen is likewise reached before any level, never mid-battle.
    this.scene.start(SCENE.worldMap)
  }

  private askDelete(slot: SlotId): void {
    this.closeConfirm()
    const layer = this.add.container(0, 0).setDepth(300)
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setInteractive()
    const panelG = this.add.graphics()
    panelG.fillStyle(0x1c1c1c, 0.98).fillRoundedRect(300, 190, 360, 160, 14)
    const title = this.add
      .text(480, 232, `删除存档 ${slot + 1}？`, { fontSize: '22px', fontStyle: 'bold', color: COLOR_TITLE })
      .setOrigin(0.5)
    const sub = this.add.text(480, 262, '此操作不可撤销', { fontSize: '15px', color: COLOR_TIME }).setOrigin(0.5)
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
