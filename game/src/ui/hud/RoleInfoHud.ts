import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'

// Top-left battle HUD, rebuilt to the original 造梦 look (docs/reference/
// zmxy-online-screens/battle-hud-user2.png + extracted export.RoleInfo art):
//  - the ink-framed 悟空 avatar (hud_avatar_wukong) floats free — NO container
//    plate (the plate was the biggest "web" tell);
//  - the level is a white number in the avatar's ink dot (not a gold ring);
//  - HP / MP / EXP are SHORT, THICK ink-outlined capsules with a dark label tab
//    at the left end and a big white centred number on the bar.
// The original composite bakes the fills+numbers into the strip (unusable for
// live values), so the bars are redrawn in the original palette and driven by
// data; the avatar is the untouched extracted art. Pure view: update(data).

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
}

const AVATAR_TEX = 'hud_avatar_wukong'
const AV_W = 74 // displayed avatar size (native 84x94)

// Bars: short + thick capsules to the right of the avatar.
const BAR_X = 66
const BAR_W = 150
const BAR_H = 17
const EXP_H = 12
const TAB_W = 30 // dark label tab at the left end of each bar
const ROW_HP = 4
const ROW_MP = 26
const ROW_EXP = 48

export class RoleInfoHud {
  readonly container: Phaser.GameObjects.Container
  private readonly bars: Phaser.GameObjects.Graphics
  private readonly levelText: Phaser.GameObjects.Text
  private readonly hpText: Phaser.GameObjects.Text
  private readonly mpText: Phaser.GameObjects.Text
  private readonly expText: Phaser.GameObjects.Text
  private data: RoleInfoData = {
    level: 1, hp: 1, maxHp: 1, mp: 0, maxMp: 1, exp: 0, expToNext: 1, atk: 0, weaponName: '空手',
  }

  constructor(scene: Phaser.Scene, x: number, y: number, opts: RoleInfoHudOptions = {}) {
    const avatarTex = opts.avatarTexture ?? AVATAR_TEX
    const children: Phaser.GameObjects.GameObject[] = []

    // Ink-framed avatar (falls back to a drawn disc if the art isn't loaded).
    if (scene.textures.exists(avatarTex)) {
      const av = scene.add.image(0, 0, avatarTex).setOrigin(0, 0)
      // Crop off the stray white bar baked into the bottom of the extracted art.
      av.setCrop(0, 0, av.width, 83)
      av.setScale(AV_W / av.width)
      children.push(av)
    } else {
      const g = scene.add.graphics()
      g.fillStyle(0x2a1c10, 1).fillCircle(AV_W / 2, AV_W / 2, AV_W / 2)
      g.lineStyle(2, HUD_COLORS.gold, 1).strokeCircle(AV_W / 2, AV_W / 2, AV_W / 2)
      children.push(g)
    }

    // Level: a small ink blob at the avatar's lower-left + white number on it
    // (covers the baked "99"; matches the Online 等级墨点).
    // Aligned over the avatar art's baked ink dot (native ~(30,70) of 84x94).
    const dotX = AV_W * 0.357
    const dotY = AV_W * 0.735
    const dot = scene.add.graphics()
    dot.fillStyle(HUD_COLORS.ink, 0.98).fillCircle(dotX, dotY, 15)
    this.levelText = scene.add
      .text(dotX, dotY, '1', { fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setShadow(1, 1, '#000000', 2)
    children.push(dot, this.levelText)

    // Bars (redrawn each update).
    this.bars = scene.add.graphics()
    children.push(this.bars)

    // Big white centred numbers over each bar.
    const value = (y: number, h: number): Phaser.GameObjects.Text =>
      scene.add
        .text(BAR_X + TAB_W + (BAR_W - TAB_W) / 2, y + h / 2 + 0.5, '', {
          fontSize: h >= BAR_H ? '13px' : '11px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setStroke('#1a1008', 3.5)
    this.hpText = value(ROW_HP, BAR_H)
    this.mpText = value(ROW_MP, BAR_H)
    this.expText = value(ROW_EXP, EXP_H)
    children.push(this.hpText, this.mpText, this.expText)

    // Static white labels on the dark left tabs.
    const label = (t: string, y: number, h: number): Phaser.GameObjects.Text =>
      scene.add
        .text(BAR_X + TAB_W / 2, y + h / 2, t, { fontSize: '10px', fontStyle: 'bold', color: '#f2eddf' })
        .setOrigin(0.5)
    children.push(label('HP', ROW_HP, BAR_H), label('MP', ROW_MP, BAR_H), label('EXP', ROW_EXP, EXP_H))

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

    const g = this.bars
    g.clear()
    this.drawBar(g, ROW_HP, BAR_H, d.hp / d.maxHp, HUD_COLORS.hp, 'HP')
    this.drawBar(g, ROW_MP, BAR_H, d.mp / d.maxMp, HUD_COLORS.mp, 'MP')
    this.drawBar(g, ROW_EXP, EXP_H, d.exp / d.expToNext, HUD_COLORS.exp, 'EXP')
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    y: number,
    h: number,
    frac: number,
    color: number,
    _label: string,
  ): void {
    const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0))
    const r = h / 2 // full-capsule caps
    // Dark ink track (whole capsule).
    g.fillStyle(HUD_COLORS.trackDark, 1).fillRoundedRect(BAR_X, y, BAR_W, h, r)
    // Colored fill in the track region (right of the tab).
    const trackX = BAR_X + TAB_W
    const trackW = BAR_W - TAB_W
    if (f > 0) {
      g.fillStyle(color, 1).fillRoundedRect(trackX, y, Math.max(h, trackW * f), h, r)
      g.fillStyle(0xffffff, 0.22).fillRoundedRect(trackX + 1, y + 1, Math.max(h, trackW * f) - 2, Math.max(1, h * 0.36), r)
    }
    // Dark label tab at the left end.
    g.fillStyle(HUD_COLORS.ink, 1).fillRoundedRect(BAR_X, y, TAB_W, h, r)
    // Thick dark ink outline around the whole bar.
    g.lineStyle(2, 0x1a1008, 0.95).strokeRoundedRect(BAR_X, y, BAR_W, h, r)
  }
}
