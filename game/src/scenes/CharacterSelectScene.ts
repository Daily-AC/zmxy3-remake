import Phaser from 'phaser'
import { drawPalaceBackdrop, PALACE_BG_TEX, PALACE_BG_URL } from '../ui/menu/inkBackdrop'
import { MenuButton } from '../ui/menu/MenuButton'
import { SCENE, REG, shellStorage } from './shellShared'
import { createNewSlotEnvelope, writeSlot, type SlotId } from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'
import { createProgression, type HeroId } from '../systems/progression'
import { createEquipment } from '../systems/equipment'
import { createInventory } from '../systems/inventory'

// Character select built on the ORIGINAL 4399 art: `select_role_bg` is the game's
// own SelectRole sprite (5 ink panels: 孙悟空/唐僧/猪八戒/沙僧/???), cropped to its
// content box. Only 悟空 is playable in this milestone; the other four panels are
// tagged 敬请期待. Confirming writes a fresh save into the chosen slot and enters
// battle. The battle scene currently always plays 悟空 (HERO_ID hardcoded), so the
// hero id we persist here is the integration seam documented in the report.

const BG_TEX = 'select_role_bg'
const HERO_TEX = 'role1_0'
const WK_BADGE = 'name_wukong'
const HERO_CELL = 200
const LOCKED_PANELS = [1, 2, 3, 4]

export class CharacterSelectScene extends Phaser.Scene {
  private slot: SlotId = 0
  private selectedHero = 1 // 悟空; the only selectable hero this milestone
  private highlight!: Phaser.GameObjects.Graphics
  private confirmBtn!: MenuButton

  constructor() {
    super(SCENE.characterSelect)
  }

  init(data: { slot?: number }): void {
    this.slot = (data?.slot as SlotId) ?? 0
  }

  preload(): void {
    if (!this.textures.exists(PALACE_BG_TEX)) this.load.image(PALACE_BG_TEX, PALACE_BG_URL)
    if (!this.textures.exists(BG_TEX)) {
      this.load.image(BG_TEX, 'assets/extracted/menu/select_role_bg.png')
    }
    if (!this.textures.exists(WK_BADGE)) {
      this.load.image(WK_BADGE, 'assets/extracted/menu/name_wukong.png')
    }
    if (!this.textures.exists(HERO_TEX)) {
      this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
        frameWidth: HERO_CELL,
        frameHeight: HERO_CELL,
      })
    }
  }

  create(): void {
    drawPalaceBackdrop(this)
    this.add
      .text(480, 44, '选择角色', {
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#f2c65a',
        stroke: '#3a2410',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
    this.add
      .text(480, 80, `存档 ${this.slot + 1} · 悟空可选，其余敬请期待`, { fontSize: '15px', color: '#c8bfa6' })
      .setOrigin(0.5)

    // Original SelectRole panel art, fit under the title.
    const bg = this.add.image(480, 96, BG_TEX).setOrigin(0.5, 0)
    const scale = Math.min(900 / bg.width, 372 / bg.height)
    bg.setScale(scale)
    const dispW = bg.width * scale
    const dispH = bg.height * scale
    const left = 480 - dispW / 2
    const panelW = dispW / 5
    const panelCX = (i: number): number => left + (i + 0.5) * panelW

    // Color 悟空 idle popped over its (grayscale) panel to read as "alive".
    this.add
      .sprite(panelCX(0), 96 + dispH * 0.46, HERO_TEX, 0)
      .setScale((panelW * 0.92) / HERO_CELL)
      .setDepth(6)
    // Colored 悟空 name badge over the baked gray name.
    this.add
      .image(panelCX(0), 96 + dispH * 0.86, WK_BADGE)
      .setScale(Math.min(1.4, (panelW * 0.7) / 76))
      .setDepth(7)

    // Pulsing gold highlight around the 悟空 panel.
    this.highlight = this.add.graphics().setDepth(8)
    this.drawHighlight(panelCX(0) - panelW / 2 + 4, 96 + 6, panelW - 8, dispH - 12)
    this.tweens.add({ targets: this.highlight, alpha: { from: 0.55, to: 1 }, duration: 900, yoyo: true, repeat: -1 })

    // 悟空 panel is clickable (re-affirms selection).
    this.add
      .zone(panelCX(0), 96 + dispH / 2, panelW, dispH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.selectHero(1))

    // Lock tags over the other four panels.
    for (const i of LOCKED_PANELS) {
      const cx = panelCX(i)
      const g = this.add.graphics().setDepth(6)
      g.fillStyle(0x000000, 0.42).fillRect(cx - panelW / 2 + 4, 96 + 6, panelW - 8, dispH - 12)
      this.add
        .text(cx, 96 + dispH * 0.5, '敬请\n期待', {
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#e8d9b0',
          align: 'center',
          stroke: '#2c1d0e',
          strokeThickness: 3,
          lineSpacing: 4,
        })
        .setOrigin(0.5)
        .setDepth(7)
      this.add
        .zone(cx, 96 + dispH / 2, panelW, dispH)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.flashLocked())
    }

    // Bottom controls.
    new MenuButton(this, {
      x: 150,
      y: 508,
      width: 130,
      height: 44,
      label: '← 返回',
      fontSize: 18,
      variant: 'ghost',
      onClick: () => this.scene.start(SCENE.slotSelect),
    })
    this.confirmBtn = new MenuButton(this, {
      x: 620,
      y: 508,
      width: 300,
      height: 50,
      label: '确定出战 · 孙悟空',
      fontSize: 22,
      onClick: () => this.confirm(),
    })

    this.input.keyboard?.once('keydown-ENTER', () => this.confirm())
    this.exposeHooks()
  }

  private drawHighlight(x: number, y: number, w: number, h: number): void {
    this.highlight.clear()
    this.highlight.lineStyle(4, 0xffd873, 1).strokeRoundedRect(x, y, w, h, 8)
    this.highlight.lineStyle(1.5, 0xfff3c0, 0.9).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 6)
  }

  private selectHero(heroId: number): void {
    this.selectedHero = heroId // only 悟空 (1) is reachable this milestone
  }

  private flashLocked(): void {
    const t = this.add
      .text(480, 470, '该角色敬请期待', { fontSize: '20px', fontStyle: 'bold', color: '#ffb26b' })
      .setOrigin(0.5)
      .setDepth(20)
    this.tweens.add({ targets: t, y: 450, alpha: 0, duration: 1100, onComplete: () => t.destroy() })
  }

  private confirm(): void {
    const env = createNewSlotEnvelope({
      // 悟空 = heroId 1 (only selectable this milestone); persisted so a future
      // multi-hero battle scene can read the chosen hero from the save.
      progression: createProgression(this.selectedHero as HeroId),
      equipment: createEquipment(),
      inventory: createInventory(24),
    })
    writeSlot(shellStorage(), this.slot, env)
    this.registry.set(REG.activeSlot, this.slot)
    this.registry.set(REG.activeSave, env.save)
    this.registry.set(REG.loadedState, restoreGameState(env.save))
    this.registry.set(REG.origin, 'new')
    this.scene.start(SCENE.battle)
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.characterSelect
    w.__shellSelectHero = (id: number) => this.selectHero(id)
    w.__shellConfirm = () => this.confirm()
    void this.confirmBtn
  }
}
