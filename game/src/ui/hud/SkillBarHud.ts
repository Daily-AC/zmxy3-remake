import Phaser from 'phaser'

// Bottom-left skill dock, rebuilt on the original 造梦 chrome: the extracted
// export.RoleInfo bottom bar (hud_roleinfo_bottom_skilldock) supplies the 无双
// button + 法宝/宠物/技能/青包/设置 cluster + five carved slots; we only overlay
// the live skill icon, a cooldown sweep, and the hotkey letter. Matching the
// Online battle bar, the slots carry ONLY the hotkey letter (Y U I O L) — no
// level / MP text on the dock (that lives in the skill panel).
//
// SOURCE NOTE: skill ICONS are 造梦 Online art (造3 has no standalone skill-icon
// bitmaps); the dock chrome is extracted 造3 export.RoleInfo. Marked for the
// packaging style review, not a replacement debt.
export const ASSET_SOURCE_ONLINE = true

const DOCK_TEX = 'skilldock'
const DOCK_NATIVE_W = 320
const DOCK_NATIVE_H = 144
const CLUSTER_W = 108 // left 无双+buttons region of the dock art (slots start at x109)
// Slot centers measured in the native 320x144 dock art (see ui-finish-report).
const SLOT_CX = [127, 167, 207, 247, 287]
const SLOT_CY = 72
// The ss_*.png icons already carry their OWN carved frame, so size them to the
// slot SPACING (40px) — they tile edge-to-edge, their frame becomes the slot
// border, and the dock's grey empty slots are fully covered (no muddy double
// border). Matches the Online bar where the icon-frames sit flush.
const SLOT_FIT = 44

export interface SkillSlotData {
  skillId?: string
  iconKey?: string
  hotkey: string
  cooldownFrac?: number
  mpCost?: number
  level?: number
  disabled?: boolean
}

export interface SkillBarHudOptions {
  /** Dock scale (native art is 320x144). */
  scale?: number
  iconKeyFor?: (data: SkillSlotData) => string | undefined
}

interface SlotView {
  cx: number
  cy: number
  size: number
  cd: Phaser.GameObjects.Graphics
}

export class SkillBarHud {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly scale: number
  private readonly iconKeyFor: (d: SkillSlotData) => string | undefined
  private readonly slotLayer: Phaser.GameObjects.Container
  private slots: SlotView[] = []

  constructor(scene: Phaser.Scene, x: number, y: number, opts: SkillBarHudOptions = {}) {
    this.scene = scene
    this.scale = opts.scale ?? 1.3
    this.iconKeyFor =
      opts.iconKeyFor ??
      ((d) => d.iconKey ?? (d.skillId && scene.textures.exists(`skill_${d.skillId}`) ? `skill_${d.skillId}` : undefined))

    const children: Phaser.GameObjects.GameObject[] = []
    if (scene.textures.exists(DOCK_TEX)) {
      // Use ONLY the left cluster (无双 + 法宝/宠物/技能/青包/设置) from the dock art;
      // its grey empty slots are dropped so the icon-frames form the slot row.
      const tex = scene.textures.get(DOCK_TEX)
      if (!tex.has('dock_cluster')) tex.add('dock_cluster', 0, 0, 0, CLUSTER_W, DOCK_NATIVE_H)
      children.push(scene.add.image(0, 0, DOCK_TEX, 'dock_cluster').setOrigin(0, 0).setScale(this.scale))
    }
    // Dark ledge under the slot row (the icon-frames sit flush on it).
    const ledge = scene.add.graphics()
    const lx = (SLOT_CX[0] - 22) * this.scale
    const lw = (SLOT_CX[SLOT_CX.length - 1] + 22 - (SLOT_CX[0] - 22)) * this.scale
    ledge.fillStyle(0x080808, 0.85).fillRoundedRect(lx, (SLOT_CY - 24) * this.scale, lw, 48 * this.scale, 5)
    children.push(ledge)

    this.slotLayer = scene.add.container(0, 0)
    children.push(this.slotLayer)
    this.container = scene.add.container(x, y, children).setScrollFactor(0).setDepth(100)
  }

  /** Native dock size in world units (for positioning by the host scene). */
  get displayHeight(): number {
    return DOCK_NATIVE_H * this.scale
  }
  get displayWidth(): number {
    return DOCK_NATIVE_W * this.scale
  }

  setSlots(slots: SkillSlotData[]): void {
    this.slotLayer.removeAll(true)
    this.slots = []
    slots.slice(0, SLOT_CX.length).forEach((d, i) => this.buildSlot(i, d))
  }

  setCooldown(index: number, frac: number): void {
    const s = this.slots[index]
    if (!s) return
    this.drawCooldown(s, Math.max(0, Math.min(1, frac)))
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v)
    return this
  }

  private buildSlot(i: number, d: SkillSlotData): void {
    const cx = SLOT_CX[i] * this.scale
    const cy = SLOT_CY * this.scale
    const size = SLOT_FIT * this.scale

    // Icon tiles the slot; ADD-blend a faint copy under it to lift the dark
    // extracted art toward the brighter Online look.
    const iconKey = this.iconKeyFor(d)
    if (iconKey && this.scene.textures.exists(iconKey)) {
      const icon = this.scene.add.image(cx, cy, iconKey)
      icon.setScale(size / Math.max(icon.width, icon.height))
      this.slotLayer.add(icon)
      if (d.disabled) {
        icon.setTint(0x777777)
      } else {
        // ADD-blend copy on top lifts the fire toward the brighter Online read.
        const glow = this.scene.add.image(cx, cy, iconKey).setScale(icon.scale)
        glow.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5)
        this.slotLayer.add(glow)
      }
    }

    // Cooldown sweep (top-down dark wipe).
    const cd = this.scene.add.graphics()
    this.slotLayer.add(cd)
    const view: SlotView = { cx, cy, size, cd }
    this.slots.push(view)
    this.drawCooldown(view, d.cooldownFrac ?? 0)

    // Hotkey letter — big, white, centred over the icon (matches the Online bar).
    this.slotLayer.add(
      this.scene.add
        .text(cx, cy, d.hotkey, {
          fontSize: `${Math.round(22 * this.scale)}px`,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setStroke('#1a1008', 4)
        .setShadow(1, 1, '#000', 3),
    )
  }

  private drawCooldown(view: SlotView, frac: number): void {
    const half = view.size / 2
    view.cd.clear()
    if (frac <= 0) return
    view.cd.fillStyle(0x000000, 0.6).fillRect(view.cx - half, view.cy - half, view.size, view.size * frac)
  }
}
