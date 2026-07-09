import Phaser from 'phaser'

// Top-left battle HUD, assembled from the ORIGINAL export.RoleInfo object tree
// (OtherMat1.swf chid341) — child bitmaps placed at their SWF PlaceObject
// coordinates, NOT redrawn. Coordinates are the object-tree translations in px
// (twips/20), verified by pixel-diff against the extracted composite
// (hud_roleinfo_top_avatar_bars). See tasks/ui-finish-report.md.
//
//   hud_ri_bg   (chid264) @ (1,2)    — ink blob + 3 tapered bar tracks + level ring
//   hud_ri_head (chid273) @ (8,-5)   — 悟空 face in its ink ring (min-diff calibrated)
//   hud_ri_hp/mp/exp (297/300/303, 143x11) @ bar coords — colored fills, cropped by fraction
//   numbers  (txthp/txtmp/txtexp)    — dynamic, centered on the bar
//   level    (txtlevel) @ (7,61)     — dynamic
//
// The HP/MP/EXP letter labels are drawn text (no standalone label bitmap in the
// object tree); everything else is original art.

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
  scale?: number
}

// Object-tree geometry (native px). Bars are all 143x11 and share the left edge.
const BG = { x: 1, y: 2 }
const HEAD = { x: 8, y: -5 }
const BAR_W = 143
const BAR_H = 11
const BARS = [
  { key: 'hud_ri_hp', x: 85, y: 16 },
  { key: 'hud_ri_mp', x: 86, y: 35 },
  { key: 'hud_ri_exp', x: 86, y: 54 },
] as const
const NUM_X = 140 // "9999" centre over the bar (matches the composite)
const LABELS = ['HP', 'MP', 'EXP']
// Level ink-ring centre, measured directly off hud_ri_bg.png's own pixels
// (battle-fidelity brief B1, "不许目测"): the 226x86 bitmap bakes TWO
// circles -- a big one under hud_ri_head (the avatar socket) and a small,
// distinctly outlined ring at the bottom-left (alpha bbox x:[1,38] y:[54,86],
// clipped by the image's own bottom edge) that is the actual level ring.
// Its centre in the bitmap's local space is ~(19.5, 71); BG below is placed
// at (1,2), so the ring's centre in RoleInfoHud's own coordinate space is
// (1+19.5, 2+71) rounded. The previous (22, 79) sat near the ring's
// bottom-left edge instead of its centre (team-lead's "数字在墨圈左下角" call).
const LEVEL = { x: 20, y: 72 }
// chid262 怒气/无双 charge meter：2026-07-09 用户拍板移到左下角无双按钮簇旁
// （SkillBarHud 里渲染），不再挂在头像条下面——此前按 object-tree 坐标放在
// (3,87) 的白条被用户红框点名"位置不对"。

export class RoleInfoHud {
  readonly container: Phaser.GameObjects.Container
  private readonly fills: Phaser.GameObjects.Image[] = []
  private readonly nums: Phaser.GameObjects.Text[] = []
  private readonly levelText: Phaser.GameObjects.Text
  private data: RoleInfoData = {
    level: 1, hp: 1, maxHp: 1, mp: 0, maxMp: 1, exp: 0, expToNext: 1, atk: 0, weaponName: '空手',
  }

  constructor(scene: Phaser.Scene, x: number, y: number, opts: RoleInfoHudOptions = {}) {
    const s = opts.scale ?? 1
    const children: Phaser.GameObjects.GameObject[] = []
    const img = (key: string, ox: number, oy: number): Phaser.GameObjects.Image | null =>
      scene.textures.exists(key) ? scene.add.image(ox * s, oy * s, key).setOrigin(0, 0).setScale(s) : null

    // Ink chrome (blob + tapered tracks + level ring).
    const bg = img('hud_ri_bg', BG.x, BG.y)
    if (bg) children.push(bg)
    else {
      const g = scene.add.graphics()
      g.fillStyle(0x0c0d12, 0.5).fillRoundedRect(0, 0, 230 * s, 90 * s, 8)
      children.push(g)
    }
    const head = img('hud_ri_head', HEAD.x, HEAD.y)
    if (head) children.push(head)

    // Bar fills (cropped by fraction each frame) + labels + numbers.
    BARS.forEach((b, i) => {
      const fill = img(b.key, b.x, b.y)
      if (fill) {
        this.fills.push(fill)
        children.push(fill)
      }
      children.push(
        scene.add
          .text((b.x + 3) * s, (b.y + BAR_H / 2) * s, LABELS[i], {
            fontSize: `${Math.round(11 * s)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0, 0.5)
          .setStroke('#1a1008', 3),
      )
      const num = scene.add
        .text(NUM_X * s, (b.y + BAR_H / 2) * s, '', {
          fontSize: `${Math.round(12 * s)}px`,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setStroke('#1a1008', 3)
      this.nums.push(num)
      children.push(num)
    })

    this.levelText = scene.add
      .text(LEVEL.x * s, LEVEL.y * s, '1', {
        fontSize: `${Math.round(16 * s)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#1a1008', 3)
    children.push(this.levelText)

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
    const fr = [
      d.maxHp > 0 ? d.hp / d.maxHp : 0,
      d.maxMp > 0 ? d.mp / d.maxMp : 0,
      d.expToNext > 0 ? d.exp / d.expToNext : 0,
    ]
    this.fills.forEach((fill, i) => {
      const f = Math.max(0, Math.min(1, Number.isFinite(fr[i]) ? fr[i] : 0))
      // Reveal the left `f` of the fill (empty track shows through on the right).
      fill.setCrop(0, 0, Math.max(0, BAR_W * f), BAR_H)
    })
    this.nums[0]?.setText(`${Math.max(0, Math.round(d.hp))}/${d.maxHp}`)
    this.nums[1]?.setText(`${Math.max(0, Math.round(d.mp))}/${d.maxMp}`)
    this.nums[2]?.setText(`${Math.round(d.exp)}/${d.expToNext}`)
    this.levelText.setText(String(d.level))
  }
}
