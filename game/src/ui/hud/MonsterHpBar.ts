import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'

// Monster health bars, two flavors:
//  - MonsterHpBar: a small world-space bar that floats above a regular monster,
//    shown once it has taken damage. No original art exists for the tiny
//    overhead bar (the 4399 game only drew a boss banner), so it is drawn in the
//    HUD palette.
//  - BossHpBar: the top-of-screen boss banner using the ORIGINAL boss art -- the
//    extracted red brush fill (hud_boss_bar_fill, main SWF BossBlood chid 82) --
//    with a dynamic name plate (label from level.ts BossSpec.label) and a
//    right-to-left depletion. The original bakes the boss name into the art, so
//    the plate + label are redrawn to stay dynamic.
//
// Both are pure views: `update(...)` is the only data entry point.

const BOSS_FILL_TEX = 'hud_boss_bar_fill'

export class MonsterHpBar {
  readonly container: Phaser.GameObjects.Container
  private readonly g: Phaser.GameObjects.Graphics
  private readonly w: number
  private readonly h: number

  constructor(scene: Phaser.Scene, opts: { width?: number; height?: number } = {}) {
    this.w = opts.width ?? 56
    this.h = opts.height ?? 7
    this.g = scene.add.graphics()
    // World-space (scrollFactor 1) so it tracks the monster as the camera pans.
    this.container = scene.add.container(0, 0, [this.g]).setDepth(20).setVisible(false)
  }

  /** Position above a world point and set fill; hides at full or non-positive hp. */
  update(hp: number, maxHp: number, worldX: number, worldY: number, showAtFull = false): void {
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
    if (hp <= 0 || (frac >= 1 && !showAtFull)) {
      this.container.setVisible(false)
      return
    }
    this.container.setVisible(true).setPosition(worldX, worldY)
    const g = this.g
    const x = -this.w / 2
    g.clear()
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x - 1, -1, this.w + 2, this.h + 2, 3)
    g.fillStyle(HUD_COLORS.trackDark, 1).fillRoundedRect(x, 0, this.w, this.h, 2)
    const col = frac > 0.5 ? HUD_COLORS.hp : frac > 0.25 ? 0xe0913a : 0xc23030
    g.fillStyle(col, 1).fillRoundedRect(x, 0, Math.max(2, this.w * frac), this.h, 2)
    g.lineStyle(1, HUD_COLORS.gold, 0.7).strokeRoundedRect(x, 0, this.w, this.h, 2)
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v)
    return this
  }

  destroy(): void {
    this.container.destroy(true)
  }
}

export class BossHpBar {
  readonly container: Phaser.GameObjects.Container
  private readonly cover: Phaser.GameObjects.Graphics
  private readonly nameText: Phaser.GameObjects.Text
  private readonly hpText: Phaser.GameObjects.Text
  private readonly barX: number
  private readonly barW: number
  private readonly barH: number

  constructor(scene: Phaser.Scene, x = 480, y = 34, opts: { barWidth?: number } = {}) {
    this.barW = opts.barWidth ?? 430
    this.barH = 24
    this.barX = -this.barW / 2 + 60 // shift right to leave room for the name plate
    const children: Phaser.GameObjects.GameObject[] = []

    // Name plate (dark ink blob + gold edge), left of the bar.
    const plateW = 120
    const plateX = this.barX - plateW - 8
    const plate = scene.add.graphics()
    plate.fillStyle(HUD_COLORS.ink, 0.92).fillRoundedRect(plateX, -this.barH / 2 - 4, plateW, this.barH + 8, 8)
    plate.lineStyle(2, HUD_COLORS.gold, 0.9).strokeRoundedRect(plateX, -this.barH / 2 - 4, plateW, this.barH + 8, 8)
    this.nameText = scene.add
      .text(plateX + plateW / 2, 0, '', { fontSize: '18px', fontStyle: 'bold', color: HUD_COLORS.textGold })
      .setOrigin(0.5)
    children.push(plate, this.nameText)

    // Bar: dark track, then the original red brush fill, then a depletion cover.
    const track = scene.add.graphics()
    track.fillStyle(HUD_COLORS.trackDark, 1).fillRoundedRect(this.barX, -this.barH / 2, this.barW, this.barH, 5)
    children.push(track)
    if (scene.textures.exists(BOSS_FILL_TEX)) {
      const fill = scene.add.image(this.barX, 0, BOSS_FILL_TEX).setOrigin(0, 0.5)
      fill.setDisplaySize(this.barW, this.barH)
      children.push(fill)
    } else {
      const fg = scene.add.graphics()
      fg.fillStyle(HUD_COLORS.hp, 1).fillRoundedRect(this.barX, -this.barH / 2, this.barW, this.barH, 5)
      children.push(fg)
    }
    // Depletion cover (redrawn) hides the right (empty) part of the brush.
    this.cover = scene.add.graphics()
    children.push(this.cover)
    // Gold frame on top.
    const frame = scene.add.graphics()
    frame.lineStyle(2, HUD_COLORS.gold, 0.9).strokeRoundedRect(this.barX, -this.barH / 2, this.barW, this.barH, 5)
    children.push(frame)
    this.hpText = scene.add
      .text(this.barX + this.barW / 2, 0, '', { fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 2)
    children.push(this.hpText)

    this.container = scene.add.container(x, y, children).setScrollFactor(0).setDepth(100).setVisible(false)
  }

  update(data: { name: string; hp: number; maxHp: number }): void {
    this.container.setVisible(true)
    this.nameText.setText(data.name)
    const frac = data.maxHp > 0 ? Math.max(0, Math.min(1, data.hp / data.maxHp)) : 0
    this.hpText.setText(`${Math.max(0, Math.round(data.hp))} / ${data.maxHp}`)
    const filledW = this.barW * frac
    this.cover.clear()
    if (frac < 1) {
      this.cover
        .fillStyle(HUD_COLORS.trackDark, 0.96)
        .fillRoundedRect(this.barX + filledW, -this.barH / 2, this.barW - filledW, this.barH, 5)
    }
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v)
    return this
  }
}
