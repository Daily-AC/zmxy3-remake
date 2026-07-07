import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'

// Bottom-left skill dock: a row of skill slots (icon + hotkey letter + cooldown
// sweep + MP cost), matching the 造梦 series battle bar (hotkeys Y U I O L).
//
// SOURCE NOTE: the skill ICONS are 造梦 Online-sourced art (造3 has no standalone
// skill-icon bitmaps;全系列可用无版权障碍 — CLAUDE.md). Marked for the packaging
// style-consistency review, NOT a replacement debt. The dock cells, hotkey
// letters and cooldown overlay are DNA-drawn (not Online). Default icon key is
// `skill_<skillId>` (symbol-matched to heroSkill.ts Role1SkillId).
export const ASSET_SOURCE_ONLINE = true

export interface SkillSlotData {
  /** heroSkill.ts Role1SkillId; used for the default icon key `skill_<id>`. */
  skillId?: string
  /** Explicit icon texture key (overrides skillId). */
  iconKey?: string
  hotkey: string
  /** 0 = ready, 1 = just cast (full cooldown). Drives the top-down dark sweep. */
  cooldownFrac?: number
  mpCost?: number
  level?: number
  /** Greyed out (not learned / insufficient MP). */
  disabled?: boolean
}

export interface SkillBarHudOptions {
  cell?: number
  gap?: number
  iconKeyFor?: (data: SkillSlotData) => string | undefined
}

interface SlotView {
  cx: number
  cell: number
  cd: Phaser.GameObjects.Graphics
}

export class SkillBarHud {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: { cell: number; gap: number; iconKeyFor: (d: SkillSlotData) => string | undefined }
  private readonly slotLayer: Phaser.GameObjects.Container
  private slots: SlotView[] = []

  constructor(scene: Phaser.Scene, x: number, y: number, opts: SkillBarHudOptions = {}) {
    this.scene = scene
    this.opts = {
      cell: opts.cell ?? 48,
      gap: opts.gap ?? 8,
      iconKeyFor:
        opts.iconKeyFor ?? ((d) => d.iconKey ?? (d.skillId && scene.textures.exists(`skill_${d.skillId}`) ? `skill_${d.skillId}` : undefined)),
    }
    this.slotLayer = scene.add.container(0, 0)
    this.container = scene.add.container(x, y, [this.slotLayer]).setScrollFactor(0).setDepth(100)
  }

  setSlots(slots: SkillSlotData[]): void {
    this.slotLayer.removeAll(true)
    this.slots = []
    const { cell, gap } = this.opts
    slots.forEach((d, i) => {
      const cx = i * (cell + gap) + cell / 2
      this.buildSlot(cx, cell, d)
    })
  }

  /** Cheap per-frame cooldown update for one slot (0 ready .. 1 full). */
  setCooldown(index: number, frac: number): void {
    const s = this.slots[index]
    if (!s) return
    this.drawCooldown(s, Math.max(0, Math.min(1, frac)))
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v)
    return this
  }

  private buildSlot(cx: number, cell: number, d: SkillSlotData): void {
    const half = cell / 2
    const bg = this.scene.add.graphics()
    bg.fillStyle(HUD_COLORS.trackDark, 0.92).fillRoundedRect(cx - half, -half, cell, cell, 8)
    bg.lineStyle(2, HUD_COLORS.gold, d.disabled ? 0.4 : 0.85).strokeRoundedRect(cx - half, -half, cell, cell, 8)
    this.slotLayer.add(bg)

    const iconKey = this.opts.iconKeyFor(d)
    if (iconKey && this.scene.textures.exists(iconKey)) {
      const icon = this.scene.add.image(cx, 0, iconKey)
      icon.setScale(Math.min(1, (cell - 8) / Math.max(icon.width, icon.height)))
      if (d.disabled) icon.setTint(0x555555)
      this.slotLayer.add(icon)
    }

    // Cooldown sweep (redrawn on update).
    const cd = this.scene.add.graphics()
    this.slotLayer.add(cd)
    const view: SlotView = { cx, cell, cd }
    this.slots.push(view)
    this.drawCooldown(view, d.cooldownFrac ?? 0)

    // Hotkey badge (drawn text — NOT a placeholder).
    const kb = this.scene.add.graphics()
    kb.fillStyle(HUD_COLORS.ink, 0.9).fillRoundedRect(cx + half - 17, half - 15, 15, 13, 3)
    this.slotLayer.add(kb)
    this.slotLayer.add(
      this.scene.add.text(cx + half - 9, half - 9, d.hotkey, { fontSize: '11px', fontStyle: 'bold', color: HUD_COLORS.textGold }).setOrigin(0.5),
    )
    // MP cost (bottom-left).
    if (d.mpCost != null) {
      this.slotLayer.add(
        this.scene.add
          .text(cx - half + 3, half - 12, String(d.mpCost), { fontSize: '10px', color: '#9fd0ff' })
          .setShadow(1, 1, '#000', 2),
      )
    }
    // Level (top-left).
    if (d.level != null) {
      this.slotLayer.add(
        this.scene.add
          .text(cx - half + 3, -half + 2, `Lv${d.level}`, { fontSize: '10px', color: '#e8d9a0' })
          .setShadow(1, 1, '#000', 2),
      )
    }
  }

  private drawCooldown(view: SlotView, frac: number): void {
    const half = view.cell / 2
    view.cd.clear()
    if (frac <= 0) return
    const h = view.cell * frac
    view.cd.fillStyle(0x000000, 0.62).fillRoundedRect(view.cx - half, -half, view.cell, h, 8)
  }
}
