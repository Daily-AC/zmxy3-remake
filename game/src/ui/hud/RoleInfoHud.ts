import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'

// Top-left battle HUD: the original RoleInfo avatar (ink-framed 悟空 portrait,
// extracted from OtherMat1.swf export.RoleInfo -> hud_avatar_wukong) with a live
// level badge, plus HP / MP / EXP bars. The original composite bakes the numbers
// INTO the bar strokes (unusable for live values), so the bars are redrawn here
// in the original palette (HP red / MP blue / EXP gold) and driven by data;
// the avatar is the untouched extracted art. MP is included now because
// heroSkill/mp.ts are already in the codebase and light up on wiring.
//
// Pure view: `update(data)` is the only data entry point. It reads a flat
// RoleInfoData (see mapping from HeroIdentityState in tasks/ui-round2-report.md)
// so the component never imports the combat systems.

export interface RoleInfoData {
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  exp: number
  expToNext: number
  atk: number
  weaponName: string
}

export interface RoleInfoHudOptions {
  avatarTexture?: string
  scale?: number
}

const AVATAR_TEX = 'hud_avatar_wukong'
const BAR_X = 78
const BAR_W = 172
const BAR_H = 15
const EXP_H = 9
const ROW_HP = 6
const ROW_MP = 27
const ROW_EXP = 48

export class RoleInfoHud {
  readonly container: Phaser.GameObjects.Container
  private readonly bars: Phaser.GameObjects.Graphics
  private readonly levelText: Phaser.GameObjects.Text
  private readonly hpText: Phaser.GameObjects.Text
  private readonly mpText: Phaser.GameObjects.Text
  private readonly expText: Phaser.GameObjects.Text
  private readonly statText: Phaser.GameObjects.Text
  private data: RoleInfoData = {
    level: 1, hp: 1, maxHp: 1, mp: 0, maxMp: 1, exp: 0, expToNext: 1, atk: 0, weaponName: '空手',
  }

  constructor(scene: Phaser.Scene, x: number, y: number, opts: RoleInfoHudOptions = {}) {
    const avatarTex = opts.avatarTexture ?? AVATAR_TEX
    const children: Phaser.GameObjects.GameObject[] = []

    // Backing plate so bars read over a bright battle background.
    const plate = scene.add.graphics()
    plate.fillStyle(HUD_COLORS.ink, 0.42).fillRoundedRect(-6, -6, 272, 82, 10)
    children.push(plate)

    // Real extracted avatar (falls back to a drawn disc if not loaded).
    if (scene.textures.exists(avatarTex)) {
      const av = scene.add.image(32, 32, avatarTex)
      const s = 66 / Math.max(av.width, av.height)
      av.setScale(s)
      children.push(av)
    } else {
      const g = scene.add.graphics()
      g.fillStyle(0x2a1c10, 1).fillCircle(32, 32, 30)
      g.lineStyle(2, HUD_COLORS.gold, 1).strokeCircle(32, 32, 30)
      children.push(g)
    }

    // Level badge over the avatar's lower-left (covers the baked "99"), tucked
    // clear of the bar labels to the right.
    const badge = scene.add.graphics()
    badge.fillStyle(HUD_COLORS.ink, 0.94).fillCircle(16, 56, 14)
    badge.lineStyle(2, HUD_COLORS.gold, 1).strokeCircle(16, 56, 14)
    this.levelText = scene.add
      .text(16, 56, '1', { fontSize: '14px', fontStyle: 'bold', color: HUD_COLORS.textGold })
      .setOrigin(0.5)
    children.push(badge, this.levelText)

    // Bars are redrawn each update.
    this.bars = scene.add.graphics()
    children.push(this.bars)

    // Bar labels (static) + values (dynamic).
    const label = (t: string, y: number): Phaser.GameObjects.Text =>
      scene.add.text(BAR_X - 2, y + 1, t, { fontSize: '11px', fontStyle: 'bold', color: HUD_COLORS.text }).setOrigin(1, 0)
    children.push(label('HP', ROW_HP), label('MP', ROW_MP), label('EXP', ROW_EXP - 1))
    const value = (y: number, h: number): Phaser.GameObjects.Text =>
      scene.add
        .text(BAR_X + BAR_W - 6, y + h / 2, '', { fontSize: '11px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(1, 0.5)
        .setShadow(1, 1, '#000000', 2)
    this.hpText = value(ROW_HP, BAR_H)
    this.mpText = value(ROW_MP, BAR_H)
    this.expText = value(ROW_EXP, EXP_H)
    children.push(this.hpText, this.mpText, this.expText)

    // Attack + weapon line under the bars.
    this.statText = scene.add.text(BAR_X - 2, ROW_EXP + EXP_H + 5, '', {
      fontSize: '12px',
      color: HUD_COLORS.textDim,
    })
    children.push(this.statText)

    this.container = scene.add.container(x, y, children).setScrollFactor(0).setDepth(100)
    this.redraw()
  }

  update(data: RoleInfoData): void {
    this.data = data
    this.redraw()
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v)
    return this
  }

  setDepth(d: number): this {
    this.container.setDepth(d)
    return this
  }

  private redraw(): void {
    const d = this.data
    this.levelText.setText(String(d.level))
    this.hpText.setText(`${Math.max(0, Math.round(d.hp))}/${d.maxHp}`)
    this.mpText.setText(`${Math.max(0, Math.round(d.mp))}/${d.maxMp}`)
    this.expText.setText(`${Math.round(d.exp)}/${d.expToNext}`)
    this.statText.setText(`攻击 ${d.atk}    武器 ${d.weaponName}`)

    const g = this.bars
    g.clear()
    this.drawBar(g, ROW_HP, BAR_H, d.hp / d.maxHp, HUD_COLORS.hp)
    this.drawBar(g, ROW_MP, BAR_H, d.mp / d.maxMp, HUD_COLORS.mp)
    this.drawBar(g, ROW_EXP, EXP_H, d.exp / d.expToNext, HUD_COLORS.exp)
  }

  private drawBar(g: Phaser.GameObjects.Graphics, y: number, h: number, frac: number, color: number): void {
    const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0))
    const r = Math.min(4, h / 2)
    // Dark track.
    g.fillStyle(HUD_COLORS.trackDark, 1).fillRoundedRect(BAR_X, y, BAR_W, h, r)
    // Colored fill.
    if (f > 0) {
      g.fillStyle(color, 1).fillRoundedRect(BAR_X, y, Math.max(h, BAR_W * f), h, r)
      // Top gloss highlight for a lit read.
      g.fillStyle(0xffffff, 0.22).fillRoundedRect(BAR_X + 1, y + 1, Math.max(h, BAR_W * f) - 2, Math.max(1, h * 0.4), r)
    }
    // Gold hairline frame.
    g.lineStyle(1.5, HUD_COLORS.gold, 0.85).strokeRoundedRect(BAR_X, y, BAR_W, h, r)
  }
}
