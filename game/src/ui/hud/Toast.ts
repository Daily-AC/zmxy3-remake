import Phaser from 'phaser'
import { HUD_COLORS, FLOAT_STYLES, FloatKind } from './hudTheme'

// Two feedback primitives:
//  - Toast: a centered banner on the ORIGINAL 水墨 text band (hud_ink_band =
//    dialogue_textpanel_crop, the ink brushstroke strip from the original story
//    dialogue art). Used for pickup / level-up / craft messages.
//  - spawnFloatingText: damage / heal / exp numbers that rise and fade. Styles
//    come from hudTheme.FLOAT_STYLES (the parameter table the brief asks for);
//    this renderer is a convenience -- callers may also read FLOAT_STYLES and
//    render their own.

const INK_TEX = 'hud_ink_band'
// The ink band art (942x114) has story text baked into its MIDDLE, so we sample
// only its text-free brushstroke edges (top / bottom ~20px) as decoration --
// same technique the dialogue box uses.
const BRUSH_TOP = 'toast_brush_top'
const BRUSH_BOT = 'toast_brush_bot'

export class Toast {
  private readonly scene: Phaser.Scene
  private readonly x: number
  private readonly y: number
  private current?: Phaser.GameObjects.Container

  constructor(scene: Phaser.Scene, x = 480, y = 150) {
    this.scene = scene
    this.x = x
    this.y = y
  }

  /**
   * Ink-brush combo banner ("N 连击!!"), styled after the 造梦 series hit banner
   * (docs/reference/zmxy-online-screens/combat-damage.png): a dark brushstroke
   * strip with bold orange text that pops in, holds, and fades. Shown near the
   * action rather than centered. `worldX/worldY` default to a right-of-center
   * screen spot.
   */
  combo(count: number, worldX = 640, worldY = 190): void {
    const label = this.scene.add
      .text(0, 0, `${count} 连击!!`, { fontSize: '30px', fontStyle: 'bold', color: '#ff9a2e', stroke: '#3a1408', strokeThickness: 5 })
      .setOrigin(0.5)
    const w = label.width + 70
    const children: Phaser.GameObjects.GameObject[] = []
    if (this.scene.textures.exists(INK_TEX)) {
      this.ensureBrushFrames()
      children.push(this.scene.add.image(0, 0, INK_TEX, BRUSH_TOP).setDisplaySize(w, 40).setOrigin(0.5).setTint(0x000000).setAlpha(0.9))
    } else {
      const g = this.scene.add.graphics()
      g.fillStyle(0x000000, 0.82).fillRoundedRect(-w / 2, -20, w, 40, 10)
      children.push(g)
    }
    children.push(label)
    const c = this.scene.add.container(worldX, worldY, children).setScrollFactor(0).setDepth(212).setScale(0.6)
    this.scene.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.easeOut' })
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 650, duration: 400, onComplete: () => c.destroy(true) })
  }

  private ensureBrushFrames(): void {
    const tex = this.scene.textures.get(INK_TEX)
    // 942x114 band: top and bottom ~20px strips are brushstroke only (no text).
    if (!tex.has(BRUSH_TOP)) tex.add(BRUSH_TOP, 0, 0, 0, 942, 20)
    if (!tex.has(BRUSH_BOT)) tex.add(BRUSH_BOT, 0, 0, 94, 942, 20)
  }

  /** Show a banner; color defaults to gold, or pass a FloatKind-ish css color. */
  show(text: string, color: string = HUD_COLORS.textGold): void {
    this.current?.destroy(true)
    const children: Phaser.GameObjects.GameObject[] = []
    const label = this.scene.add
      .text(0, 0, text, { fontSize: '22px', fontStyle: 'bold', color, stroke: '#2c1d0e', strokeThickness: 4 })
      .setOrigin(0.5)
    const w = Math.max(220, label.width + 90)
    const h = 54

    // Clean dark panel...
    const g = this.scene.add.graphics()
    g.fillStyle(HUD_COLORS.ink, 0.86).fillRoundedRect(-w / 2, -h / 2, w, h, 12)
    g.lineStyle(2, HUD_COLORS.gold, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 12)
    children.push(g)
    // ...decorated with the ink band's text-free top/bottom brush strips.
    if (this.scene.textures.exists(INK_TEX)) {
      this.ensureBrushFrames()
      const top = this.scene.add.image(0, -h / 2 + 3, INK_TEX, BRUSH_TOP).setDisplaySize(w - 8, 16).setOrigin(0.5, 0)
      const bot = this.scene.add.image(0, h / 2 - 3, INK_TEX, BRUSH_BOT).setDisplaySize(w - 8, 14).setOrigin(0.5, 1).setFlipY(true)
      children.push(top, bot)
    }
    children.push(label)

    const c = this.scene.add.container(this.x, this.y, children).setScrollFactor(0).setDepth(210)
    c.setScale(0.8)
    this.current = c
    this.scene.tweens.add({ targets: c, scale: 1, duration: 180, ease: 'Back.easeOut' })
    this.scene.tweens.add({
      targets: c,
      y: this.y - 26,
      alpha: 0,
      delay: 1300,
      duration: 600,
      ease: 'Cubic.easeIn',
      onComplete: () => c.destroy(true),
    })
  }
}

/**
 * Spawn a rising, fading number/label at a world point, styled per FLOAT_STYLES.
 * Returns the Text so callers can override depth/scrollFactor if needed.
 */
export function spawnFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  kind: FloatKind = 'damage',
): Phaser.GameObjects.Text {
  const s = FLOAT_STYLES[kind]
  const t = scene.add
    .text(x, y, text, {
      fontSize: `${s.fontSize}px`,
      color: s.color,
      fontStyle: s.fontStyle,
      stroke: s.stroke,
      strokeThickness: s.strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(30)
  scene.tweens.add({
    targets: t,
    y: y - s.risePx,
    alpha: 0,
    duration: s.durationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  })
  return t
}
