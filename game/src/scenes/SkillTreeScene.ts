import Phaser from 'phaser'
import { SCENE, REG, shellStorage } from './shellShared'
import type { SlotId } from '../systems/saveSlots'
import { readSlot, writeSlot, buildSlotEnvelope, asSlotId } from '../systems/saveSlots'
import { restoreGameState, createGameSave } from '../systems/save'
import type { LoadedGameState } from '../systems/save'
import { createSoulPurse } from '../systems/soulPurse'
import type { SoulPurse } from '../systems/soulPurse'
import {
  ROLE1_SCHOOLS,
  MAX_SKILL_LEVEL,
  BIND_KEYS,
  getUnlockedSlotCount,
  getSchoolUpgradeCost,
  canUpgradeSchool,
  upgradeSchool,
  isSkillLearned,
  canLearnSkill,
  learnSkill,
  getSkillUpgradeCost,
  canUpgradeSkillLevel,
  upgradeSkillLevel,
  getBindings,
  keyForSkill,
  rebindSkill,
  getLearnedLevel,
  SKILL_DISPLAY,
  skillDisplayName,
} from '../systems/skillTree'
import type { SkillTreeState, Role1TreeSkillId, BindKey } from '../systems/skillTree'
import { Toast } from '../ui/hud/Toast'
import { ensureArtFontsLoaded, activeArtFont } from '../systems/artFont'

// S5 技能树/学习技能 -- 2026-07-08 full rewrite (user: "与其后面改倒不如从0到1").
//
// WHY A FULL REWRITE, NOT A PATCH: the previous version built the whole
// screen on top of two large FFDec-rendered composite bitmaps (a 940x590
// "bg.png" background and an 889x425 "table_school1.png" table+cards
// bitmap). Both bitmaps bake in specific hardcoded content that doesn't
// match the real game state (a "9999999999" placeholder soul count, a
// "当前等级：999" placeholder, school-1-only preview content baked into a
// grid meant to show school-2 too) -- every dynamic value therefore had to
// be patched by drawing an opaque rectangle over the wrong baked pixels and
// redrawing the right ones on top. That is exactly the "很多黑块和重合块"
// the user pointed at: the black rectangles were never decoration, they
// were cover-ups for a bitmap that was fighting the real data. Removing
// bg.png/table_school1.png/rebind_modal.png/the PassiveSkillControl prefab
// eliminates the cover-up architecture at its root instead of patching each
// symptom.
//
// WHAT THIS SCENE IS BUILT FROM NOW (real, evidence-backed, listed so a
// future reader can audit every pixel):
//  1. Real per-skill icon bitmaps (`st_icon_<id>_{locked,unlocked,learned}`,
//     FFDec sprite/button render, tasks/skilltree-report.md §11.2) -- kept
//     unchanged, these were always real and always correct.
//  2. Two NEW small real bitmaps (`card_icon_school1/2.png`), cropped
//     directly from the already-extracted `table_school1.png` (no new FFDec
//     run -- this is deriving a smaller real asset from an existing real
//     asset; the 心法 calligraphy tiles are genuine baked vendor art and
//     isolating just those two tiles avoids dragging in the rest of that
//     bitmap's wrong-content problem).
//  3. Real AS3 coordinates for every functionally load-bearing position
//     (icon/bind/upgrade column x, row y) -- `SkillControl.as`'s
//     `mainskillmc.skillN/skillsetN/upgradeN` Matrix values, unchanged from
//     the prior extraction (tasks/skilltree-report.md §1.2), independently
//     re-verified this pass by cropping table_school1.png at exactly these
//     coordinates and confirming the real skill icon sits there (see
//     report's geometry section). These are hard truth independent of any
//     bitmap and are the "对象树" half of the user's "参照图和对象树为唯一
//     基准" instruction.
//  4. A flat panel palette sampled DIRECTLY from the reference screenshot
//     (`docs/reference/user-flow-refs/skilltree-original.png`, pixel-picked
//     2026-07-08: pure-black top/bottom bars, dark-navy card/table panel
//     fills) -- the "参照图" half of that same instruction. This is NOT the
//     vendor's own ink-wash BuySkill skin (that skin is a different, bluer,
//     watermarked theme) -- per this project's north star ("老玩家无感":
//     match what a real player actually saw), the reference capture is
//     trusted as the real visual target over a static FFDec default-frame
//     render, which the previous version already had two separate incidents
//     of being non-representative (a coincidental debug/preview frame for
//     the placeholder "999" numbers, AND for the whole icon color state --
//     see report item 1).
//  5. Real skill name/description strings for ALL 10 skills, both schools
//     (`SKILL_DISPLAY`) -- previously only used for school-2 while school-1
//     relied on the bitmap's own baked (and differently-styled) text; now
//     both schools render through one unified path.
//
// REMOVED PER USER DIRECTIVE (2026-07-08, relayed by team lead): 被动技能
// and BOSS技能 are gone, not placeholder-disabled -- "没做的先隐掉，不留占位
// 比留着半吊子强". Only the active-skill page exists; there is no tab bar
// (nothing left to switch between). The rebind modal is rebuilt as a plain
// vector popup (dark panel + key-letter text) instead of a cropped
// `rebind_modal.png`/`slot_*.png` bitmap set, matching how BattleScene's own
// `SkillBarHud` already draws hotkey letters as plain bold text -- there is
// no reason for this screen to invent a different convention for the same
// UI element.
//
// KEPT PER MAIN-SESSION TERMINAL REVIEW (技能升级 column): the reference
// screenshot is a fully-maxed save where AS3's own `xflevel>=5` gate hides
// the school-upgrade button, and both schools there are already at max
// individual-skill level too -- it is not evidence the column doesn't
// exist. `SkillControl.as`'s `mainskillmc.upgrade1..5` is a real per-row
// button (`skillupgradeFunc`), so it stays; only the previously-added
// ALWAYS-VISIBLE cost number is gone (AS3 itself only reveals cost via a
// hover tooltip, `mOver`/`mOut`).
//
// Only Role1 (悟空) has a real skill system (heroSkill.ts) -- the only
// selectable hero (S2).

const SKILLTREE_DIR = 'assets/extracted/skilltree/'
const ART_FONT_CSS = `"${activeArtFont().family}", sans-serif`

// Colors picked directly off the reference screenshot (see file header §4).
const BG_BLACK = 0x000000
const PANEL_NAVY = 0x0f1830
const PANEL_BORDER = 0x24406b
const DIVIDER = 0x1c2f4d
const GOLD = '#f2c65a'
const CREAM = '#f2eddf'
const DIM = '#9aa4bd'
const DANGER = '#e07a7a'
const LOCKED = '#4d5570'

// AS3 real coords (SkillControl.as / OtherMat1 xfl, tasks/skilltree-report.md
// §1.2) -- absolute 940x590 stage space, RELATIVE spacing unchanged from the
// prior version. Re-verified this pass: cropping table_school1.png at these
// coordinates (minus the bitmap's own known placement offset) lands exactly
// on each row's real baked icon (game/tmp/skilltree-ui/vendor-row0..4.png) --
// confirms these are the vendor's own native row positions, AND their
// spacing as a % of stage height (13.16%) matches the reference screenshot's
// own measured row spacing as a % of its height (13.17%, 5-point regression
// on icon-column bright-pixel bands, tasks/skilltree-ui-report.md's geometry
// section) almost exactly -- i.e. vendor/AS3 and the reference agree on
// RELATIVE row spacing. What did NOT agree in the previous version's overlay
// (main-session review, "五行下来错位累积超过半行") was a constant, NON-
// growing vertical offset (~32 stage units, confirmed by the same
// regression's residual being <2px at every one of the 5 points, not an
// increasing error) -- root-caused to the previous version's icons and
// header/name text living on two DIFFERENT coordinate systems (icons on
// this ROW_Y, header/names on the table bitmap's own TABLE_OFFSET_Y scheme),
// which is now impossible since this rewrite draws icon+name+desc+bind+
// upgrade for a row from the exact same `y`. The residual ~32-unit offset
// (vendor's own content starting higher in the frame than the reference's
// visually does) is applied here as VERT_SHIFT rather than left as a
// documented exemption, because -- unlike the removed bitmaps -- nothing
// about this rewrite's absolute panel position is AS3-mandated (only the
// row-to-row DELTAS are), so closing a measured, real, cheap-to-fix gap to
// the "老玩家无感" reference target costs nothing.
const VERT_SHIFT = 30
const ROW_ICON_X = 376 // mainskillmc.skillN local x (-272.95) + reg point x (648.45)
const ROW_BIND_X = 784 // mainskillmc.skillsetN local x (135.95) + reg point x (648.45)
const ROW_UPGRADE_X = 856 // mainskillmc.upgradeN local x (207.05) + reg point x (648.45)
const ROW_Y = [125.55, 203.2, 280.2, 357.15, 436.2].map((y) => y + VERT_SHIFT) // mainskillmc.skillN local y + reg point y (317.2)

// Table column layout -- not AS3 values (no bitmap grid to inherit them from
// anymore); chosen as clean, evenly-legible columns around the AS3-real
// icon/bind/upgrade x's above.
const TABLE_X = 254
const TABLE_W = 662 // to stage x=916, 24px right margin
const NAME_COL_CX = 310
const DESC_COL_CX = 582

const CARD_X = 20
const CARD_W = 220
const CARD1_Y = 60 + VERT_SHIFT
const CARD_H = 205
const CARD_GAP = 14
const CARD2_Y = CARD1_Y + CARD_H + CARD_GAP
const PANEL_BOTTOM = CARD1_Y + CARD_H * 2 + CARD_GAP // bottom edge of both panels

const SKILLTREE_TEXTURES: { key: string; url: string }[] = [
  { key: 'st_card_icon_0', url: `${SKILLTREE_DIR}card_icon_school1.png` },
  { key: 'st_card_icon_1', url: `${SKILLTREE_DIR}card_icon_school2.png` },
]
const SCHOOL_SKILL_IDS: Role1TreeSkillId[] = ['slz', 'lys', 'hytj', 'lyfb', 'jdy', 'qsez', 'zz', 'hmz', 'hyjj', 'sx']
for (const id of SCHOOL_SKILL_IDS) {
  for (const state of ['locked', 'unlocked', 'learned'] as const) {
    SKILLTREE_TEXTURES.push({ key: `st_icon_${id}_${state}`, url: `${SKILLTREE_DIR}icon_${id}_${state}.png` })
  }
}

function iconKeyFor(skillName: Role1TreeSkillId, learned: boolean, unlocked: boolean): string {
  const state = learned ? 'learned' : unlocked ? 'unlocked' : 'locked'
  return `st_icon_${skillName}_${state}`
}

/** Rounded dark panel matching the reference's card/table fill -- the single
 * visual primitive this rewrite uses instead of a bitmap + cover-rectangles.
 * Added into `parent` (this scene's scaled/offset `root` container) rather
 * than left as a bare top-level scene object -- a Graphics object created via
 * `scene.add.graphics()` and never reparented renders at whatever position it
 * lands in the Scene's OWN display list, which (since `root` already existed
 * by the time this runs) is AFTER `root` -- meaning it would paint over
 * root's entire rendered content, regardless of what gets added to `root`
 * afterward in JS execution order. Caught live: the first cut of this
 * rewrite rendered two opaque panels that blanked out every header/card/row
 * element underneath them. */
function drawPanel(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(PANEL_NAVY, 1).fillRoundedRect(x, y, w, h, 8)
  g.lineStyle(1, PANEL_BORDER, 0.8).strokeRoundedRect(x, y, w, h, 8)
  parent.add(g)
  return g
}

export class SkillTreeScene extends Phaser.Scene {
  private slot: SlotId | null = null
  private loaded!: LoadedGameState
  private skillTree!: SkillTreeState
  private soulPurse!: SoulPurse
  private heroLevel = 1
  private selectedSchool: 0 | 1 = 0
  private toastUi!: Toast
  private root!: Phaser.GameObjects.Container
  private rowsLayer!: Phaser.GameObjects.Container
  private cardsLayer!: Phaser.GameObjects.Container
  private soulText!: Phaser.GameObjects.Text
  private rebindModal?: Phaser.GameObjects.Container
  private artFontTexts: Phaser.GameObjects.Text[] = []
  private upgradeTooltip?: Phaser.GameObjects.Text

  constructor() {
    super(SCENE.skillTree)
  }

  /** Reuses the shared font loader another concurrent task already built
   * (`systems/artFont.ts`) rather than a second FontFace registration. */
  private loadArtFont(): void {
    ensureArtFontsLoaded()
      .then(() => {
        if (!this.scene.isActive()) return
        for (const t of this.artFontTexts) t.setFontFamily(ART_FONT_CSS).setText(t.text)
      })
      .catch(() => {
        /* fallback stays on the CSS stack's sans-serif -- non-fatal */
      })
  }

  preload(): void {
    for (const t of SKILLTREE_TEXTURES) {
      if (!this.textures.exists(t.key)) this.load.image(t.key, t.url)
    }
  }

  create(): void {
    const storage = shellStorage()
    this.slot = asSlotId(this.registry.get(REG.activeSlot))
    const env = this.slot !== null ? readSlot(storage, this.slot) : undefined
    if (!env || this.slot === null) {
      this.scene.start(SCENE.mainMenu)
      return
    }
    this.loaded = restoreGameState(env.save)
    this.skillTree = this.loaded.skillTree
    this.soulPurse = createSoulPurse(this.loaded.soul)
    this.heroLevel = this.loaded.progression.level

    // 940x590 stage, contain-fit into the 960x540 canvas -- same pillarbox
    // definition WorldMapScene established, reused here.
    const scale = 540 / 590
    const offsetX = (960 - 940 * scale) / 2
    this.root = this.add.container(offsetX, 0).setScale(scale)
    this.toastUi = new Toast(this, 480, 500)

    this.root.add(this.add.rectangle(0, 0, 940, 590, BG_BLACK, 1).setOrigin(0, 0))

    this.buildTopBar()
    drawPanel(this, this.root, CARD_X, CARD1_Y, CARD_W, CARD_H * 2 + CARD_GAP)
    drawPanel(this, this.root, TABLE_X, CARD1_Y, TABLE_W, CARD_H * 2 + CARD_GAP)
    this.buildTableHeader()
    this.buildBottomBar()

    this.cardsLayer = this.add.container(0, 0)
    this.root.add(this.cardsLayer)
    this.rowsLayer = this.add.container(0, 0)
    this.root.add(this.rowsLayer)

    this.loadArtFont()
    this.refresh()
    this.exposeHooks()
  }

  // ---------- static chrome ----------

  private buildTopBar(): void {
    // No vendor/Online bitmap exists for this name badge or an inline potion
    // icon for the hint line (checked both vendor OtherMat1 and
    // docs/reference/zmxy-online-extracted -- neither has a skill-tree
    // folder yet; closing that needs a fresh Online-client capture session,
    // out of this task's scope) -- styled as a gold/outlined art-font badge
    // instead, disclosed as drawn text, not an extracted bitmap.
    const nameBadge = this.add
      .text(20, 10, '悟空', {
        fontFamily: ART_FONT_CSS,
        fontSize: '26px',
        color: '#ffcf5c',
        stroke: '#5a2a0a',
        strokeThickness: 5,
      })
      .setPadding(2, 2, 2, 2)
    this.root.add(nameBadge)
    this.artFontTexts.push(nameBadge)
    this.root.add(
      this.add.text(20, 42, '每个角色只能学习5个技能，学错技能可以到商城购买孟婆药剂来遗忘技能', {
        fontSize: '12px',
        color: DIM,
      }),
    )
    const back = this.add
      .text(916, 20, '返回', { fontSize: '18px', color: CREAM, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
    const backHit = this.add.rectangle(896, 20, 60, 32, 0xffffff, 0).setInteractive({ useHandCursor: true })
    backHit.on('pointerdown', () => this.goBack())
    this.root.add([back, backHit])
  }

  private buildTableHeader(): void {
    const y = CARD1_Y + 20
    const headers: [number, string][] = [
      [NAME_COL_CX, '技能名称'],
      [ROW_ICON_X, '技能图标'],
      [DESC_COL_CX, '技能说明'],
      [ROW_BIND_X, '按键设置'],
      [ROW_UPGRADE_X, '技能升级'],
    ]
    for (const [cx, label] of headers) {
      this.root.add(this.add.text(cx, y, label, { fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5))
    }
    this.root.add(this.add.rectangle(TABLE_X + 12, y + 18, TABLE_W - 24, 1, DIVIDER, 1).setOrigin(0, 0.5))
    // "心法一" card-column header sits at the same y as the table header row,
    // matching the reference's aligned two-panel top edge.
    this.root.add(this.add.text(CARD_X + CARD_W / 2, y, '心法一', { fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5))
    this.root.add(this.add.rectangle(CARD_X + 12, y + 18, CARD_W - 24, 1, DIVIDER, 1).setOrigin(0, 0.5))
  }

  private buildBottomBar(): void {
    // Only the active-skill page exists now (user directive 2026-07-08: hide
    // 被动技能/BOSS技能 entirely rather than leave disabled placeholders) --
    // this is a plain label, not a tab (nothing left to switch between).
    this.root.add(this.add.text(20, PANEL_BOTTOM + 24, '主动技能', { fontSize: '16px', color: CREAM, fontStyle: 'bold' }).setOrigin(0, 0.5))

    // Soul counter: drawn fresh (no baked placeholder digits to cover -- see
    // file header/report item 8, this removes that whole class of bug rather
    // than patching a cover-rectangle again).
    const badgeX = 900
    const badgeY = PANEL_BOTTOM + 24
    this.root.add(this.add.circle(badgeX, badgeY, 26, 0x000000, 1).setStrokeStyle(2, 0xf2c65a, 0.9))
    const soulLabel = this.add
      .text(badgeX, badgeY, '灵魂', { fontFamily: ART_FONT_CSS, fontSize: '13px', color: GOLD, fontStyle: 'bold' })
      .setOrigin(0.5)
    this.root.add(soulLabel)
    this.artFontTexts.push(soulLabel)
    this.soulText = this.add.text(badgeX - 60, badgeY, '', { fontSize: '16px', color: GOLD, fontStyle: 'bold' }).setOrigin(1, 0.5)
    this.root.add(this.soulText)
  }

  private goBack(): void {
    this.persist()
    this.scene.start(SCENE.worldMap)
  }

  // ---------- data-driven redraw ----------

  private refresh(): void {
    this.cardsLayer.removeAll(true)
    this.rowsLayer.removeAll(true)
    this.soulText.setText(`${this.soulPurse.value}`)
    this.buildSchoolCards()
    this.buildSkillRows()
  }

  private buildSchoolCards(): void {
    for (const schoolIndex of [0, 1] as const) {
      const cardY = schoolIndex === 0 ? CARD1_Y : CARD2_Y
      const school = this.skillTree.schools[schoolIndex]
      const labelY = cardY + 36

      if (schoolIndex === 1) {
        this.cardsLayer.add(this.add.text(CARD_X + CARD_W / 2, cardY + 4, '心法二', { fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5, 0))
        this.cardsLayer.add(this.add.rectangle(CARD_X + 12, cardY + 22, CARD_W - 24, 1, DIVIDER, 1).setOrigin(0, 0.5))
      }

      this.cardsLayer.add(this.add.image(CARD_X + 18, labelY, `st_card_icon_${schoolIndex}`).setOrigin(0, 0.5).setDisplaySize(70, 68))
      this.cardsLayer.add(
        this.add.text(CARD_X + 100, labelY - 12, ROLE1_SCHOOLS[schoolIndex].name, { fontSize: '15px', color: CREAM, fontStyle: 'bold' }).setOrigin(0, 0.5),
      )

      const cost = getSchoolUpgradeCost(school.level)
      const selected = this.selectedSchool === schoolIndex
      if (cost !== undefined) {
        const btnColor = selected ? '#ffb347' : LOCKED
        this.cardsLayer.add(this.add.text(CARD_X + 100, labelY + 14, '升级', { fontSize: '14px', color: btnColor, fontStyle: 'bold' }).setOrigin(0, 0.5))
        if (selected) {
          const hitBtn = this.add.rectangle(CARD_X + 118, labelY + 14, 50, 24, 0xffffff, 0).setInteractive({ useHandCursor: true })
          hitBtn.on('pointerdown', () => this.onUpgradeSchool(schoolIndex))
          this.cardsLayer.add(hitBtn)
        }
      }

      const statY1 = labelY + 46
      const statY2 = statY1 + 26
      this.cardsLayer.add(this.add.text(CARD_X + 16, statY1, `当前等级：${school.level}`, { fontSize: '13px', color: DIM }).setOrigin(0, 0.5))
      this.cardsLayer.add(
        this.add
          .text(CARD_X + 16, statY2, cost === undefined ? '心法已满级' : `升级所需灵魂：${cost}`, { fontSize: '13px', color: DIM })
          .setOrigin(0, 0.5),
      )

      // Click anywhere on the card to select it -- the school-card selection
      // cue is just which card's "升级" is highlighted above, no extra drawn
      // selection box (same discipline the previous version already
      // established for this element).
      const hit = this.add.rectangle(CARD_X + CARD_W / 2, cardY + CARD_H / 2, CARD_W, CARD_H, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        this.selectedSchool = schoolIndex
        this.refresh()
      })
      this.cardsLayer.add(hit)
    }
  }

  private onUpgradeSchool(schoolIndex: 0 | 1): void {
    const check = canUpgradeSchool(this.skillTree, schoolIndex, this.soulPurse.value)
    if (check !== true) {
      this.toastUi.show(check, DANGER)
      return
    }
    upgradeSchool(this.skillTree, schoolIndex, this.soulPurse)
    this.persist()
    this.toastUi.show('心法升级', '#ffd873')
    this.refresh()
  }

  private buildSkillRows(): void {
    const school = ROLE1_SCHOOLS[this.selectedSchool]
    const unlocked = getUnlockedSlotCount(this.skillTree.schools[this.selectedSchool].level)
    for (let i = 0; i < 5; i++) {
      const skillName = school.skills[i]
      const y = ROW_Y[i]
      const learned = isSkillLearned(this.skillTree, skillName)
      const level = getLearnedLevel(this.skillTree, skillName)
      const isUnlocked = i < unlocked
      const display = SKILL_DISPLAY[skillName]

      if (i > 0) this.rowsLayer.add(this.add.rectangle(TABLE_X + 12, y - (ROW_Y[i] - ROW_Y[i - 1]) / 2, TABLE_W - 24, 1, DIVIDER, 0.6).setOrigin(0, 0.5))

      const nameColor = learned ? CREAM : isUnlocked ? DIM : LOCKED
      this.rowsLayer.add(
        this.add
          .text(NAME_COL_CX, y, `${skillDisplayName(skillName)}${learned ? `  Lv${level}` : ''}`, { fontSize: '15px', color: nameColor, fontStyle: 'bold' })
          .setOrigin(0.5),
      )
      this.rowsLayer.add(
        this.add
          .text(DESC_COL_CX, y, display?.desc ?? '', {
            fontSize: '11px',
            color: learned ? '#c3cadd' : LOCKED,
            wordWrap: { width: 260 },
            align: 'center',
          })
          .setOrigin(0.5),
      )

      const icon = this.add.image(ROW_ICON_X, y, iconKeyFor(skillName, learned, isUnlocked))
      this.rowsLayer.add(icon)
      if (!isUnlocked) icon.setAlpha(0.55)

      const learnHit = this.add.rectangle(ROW_ICON_X, y, 66, 65, 0xffffff, 0)
      if (!learned && isUnlocked) {
        learnHit.setInteractive({ useHandCursor: true })
        learnHit.on('pointerdown', () => this.onLearn(this.selectedSchool, i))
      }
      this.rowsLayer.add(learnHit)

      if (learned) {
        const key = keyForSkill(this.skillTree, skillName)
        this.rowsLayer.add(
          this.add
            .text(ROW_BIND_X, y, key ?? '设置', { fontSize: '14px', color: key ? GOLD : DIM, fontStyle: 'bold' })
            .setOrigin(0.5),
        )
        const bindHit = this.add.rectangle(ROW_BIND_X, y, 60, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
        bindHit.on('pointerdown', () => this.openRebindModal(skillName))
        this.rowsLayer.add(bindHit)

        // AS3 real coord: mainskillmc.upgradeN (856, rowY) -- kept per
        // terminal review (see file header "KEPT PER..."). What WAS
        // self-added previously (a permanently visible cost number) stays
        // removed; AS3's own mOver/mOut only reveal cost on hover.
        const canUp = canUpgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse.value)
        const atMax = level >= MAX_SKILL_LEVEL
        this.rowsLayer.add(
          this.add
            .text(ROW_UPGRADE_X, y, atMax ? '已满级' : '升级', { fontSize: '14px', color: atMax ? LOCKED : canUp === true ? GOLD : LOCKED, fontStyle: 'bold' })
            .setOrigin(0.5),
        )
        if (!atMax) {
          const upHit = this.add.rectangle(ROW_UPGRADE_X, y, 60, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
          if (canUp === true) upHit.on('pointerdown', () => this.onUpgradeSkill(skillName))
          const cost = getSkillUpgradeCost(level)
          upHit.on('pointerover', () => this.showUpgradeTooltip(ROW_UPGRADE_X, y - 22, `升级需要${cost}灵魂`))
          upHit.on('pointerout', () => this.hideUpgradeTooltip())
          this.rowsLayer.add(upHit)
        }
      } else {
        this.rowsLayer.add(this.add.text(ROW_BIND_X, y, '--', { fontSize: '14px', color: LOCKED }).setOrigin(0.5))
        this.rowsLayer.add(this.add.text(ROW_UPGRADE_X, y, '--', { fontSize: '14px', color: LOCKED }).setOrigin(0.5))
      }
    }
  }

  /** Mirrors AS3 SkillControl.mOver/mOut (SkillControl.as:96-122): the real
   * game only reveals the per-skill upgrade cost on hover, never as
   * permanent table text. */
  private showUpgradeTooltip(x: number, y: number, text: string): void {
    this.hideUpgradeTooltip()
    this.upgradeTooltip = this.add
      .text(x, y, text, { fontSize: '11px', color: '#1a0f08', backgroundColor: '#f2eddf' })
      .setOrigin(0.5)
      .setPadding(4, 2, 4, 2)
    this.rowsLayer.add(this.upgradeTooltip)
  }

  private hideUpgradeTooltip(): void {
    this.upgradeTooltip?.destroy()
    this.upgradeTooltip = undefined
  }

  private onLearn(schoolIndex: 0 | 1, slotIndex: number): void {
    const check = canLearnSkill(this.skillTree, schoolIndex, slotIndex)
    if (check !== true) {
      this.toastUi.show(check, DANGER)
      return
    }
    const learned = learnSkill(this.skillTree, schoolIndex, slotIndex)
    this.persist()
    this.toastUi.show(`已学习${learned ? skillDisplayName(learned) : ''}`, '#ffd873')
    this.refresh()
  }

  private onUpgradeSkill(skillName: Role1TreeSkillId): void {
    const check = canUpgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse.value)
    if (check !== true) {
      this.toastUi.show(check, DANGER)
      return
    }
    upgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse)
    this.persist()
    this.toastUi.show('技能等级提升', '#ffd873')
    this.refresh()
  }

  // ---------- rebind modal (plain vector popup, see file header) ----------

  private openRebindModal(skillName: Role1TreeSkillId): void {
    this.closeRebindModal()
    const modal = this.add.container(0, 0)
    const scrim = this.add.rectangle(470, 295, 940, 590, 0x000000, 0.6).setInteractive()
    modal.add(scrim)

    const w = 420
    const h = 200
    const x0 = 470 - w / 2
    const y0 = 295 - h / 2
    const panel = this.add.graphics()
    panel.fillStyle(PANEL_NAVY, 1).fillRoundedRect(x0, y0, w, h, 10)
    panel.lineStyle(1, 0xf2c65a, 0.8).strokeRoundedRect(x0, y0, w, h, 10)
    modal.add(panel)
    modal.add(this.add.text(470, y0 + 24, `${skillDisplayName(skillName)} · 按键设置`, { fontSize: '15px', color: GOLD, fontStyle: 'bold' }).setOrigin(0.5))

    const slotW = 64
    const gap = 18
    const totalW = BIND_KEYS.length * slotW + (BIND_KEYS.length - 1) * gap
    const startX = 470 - totalW / 2 + slotW / 2
    const slotY = y0 + 120
    for (let i = 0; i < BIND_KEYS.length; i++) {
      const key = BIND_KEYS[i]
      const slotX = startX + i * (slotW + gap)
      const occupant = this.skillTree.bindings[key]
      const isTarget = occupant === skillName
      modal.add(
        this.add
          .rectangle(slotX, slotY, slotW, slotW, 0x000000, 0.4)
          .setStrokeStyle(2, isTarget ? 0xf2c65a : 0x3a4666, 1),
      )
      if (occupant) {
        const iconKey = iconKeyFor(occupant, true, true)
        if (this.textures.exists(iconKey)) modal.add(this.add.image(slotX, slotY - 8, iconKey).setScale(0.55))
      }
      modal.add(this.add.text(slotX, slotY + 22, key, { fontSize: '16px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5))
      const hit = this.add.rectangle(slotX, slotY, slotW, slotW, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => this.onRebind(skillName, key))
      modal.add(hit)
    }

    const closeHit = this.add.rectangle(x0 + w - 20, y0 + 18, 28, 28, 0xffffff, 0).setInteractive({ useHandCursor: true })
    modal.add(closeHit)
    modal.add(this.add.text(x0 + w - 20, y0 + 18, '✕', { fontSize: '16px', color: CREAM }).setOrigin(0.5))
    closeHit.on('pointerdown', () => this.closeRebindModal())

    this.root.add(modal)
    this.rebindModal = modal
  }

  private onRebind(skillName: Role1TreeSkillId, key: BindKey): void {
    if (!rebindSkill(this.skillTree, skillName, key)) return
    this.persist()
    this.closeRebindModal()
    this.toastUi.show(`已绑定到 ${key}`, '#ffd873')
    this.refresh()
  }

  private closeRebindModal(): void {
    this.rebindModal?.destroy(true)
    this.rebindModal = undefined
  }

  // ---------- persistence ----------

  private persist(): void {
    if (this.slot === null) return
    const storage = shellStorage()
    const playtimeSec = readSlot(storage, this.slot)?.meta.playtimeSec ?? 0
    const save = createGameSave({
      progression: this.loaded.progression,
      equipment: this.loaded.equipment,
      inventory: this.loaded.inventory,
      skillTree: this.skillTree,
      soul: this.soulPurse.value,
    })
    writeSlot(storage, this.slot, buildSlotEnvelope(save, playtimeSec))
  }

  // ---------- acceptance hooks ----------

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.skillTree
    w.__skillTreeState = () => ({
      soul: this.soulPurse.value,
      heroLevel: this.heroLevel,
      selectedSchool: this.selectedSchool,
      schools: this.skillTree.schools.map((s) => ({ level: s.level, learned: s.learned.map((e) => ({ ...e })) })),
      bindings: { ...getBindings(this.skillTree) },
    })
    w.__skillTreeSelectSchool = (i: 0 | 1) => {
      this.selectedSchool = i
      this.refresh()
    }
    w.__skillTreeUpgradeSchool = (i: 0 | 1) => this.onUpgradeSchool(i)
    w.__skillTreeLearn = (schoolIndex: 0 | 1, slotIndex: number) => this.onLearn(schoolIndex, slotIndex)
    w.__skillTreeUpgradeSkill = (skillName: Role1TreeSkillId) => this.onUpgradeSkill(skillName)
    w.__skillTreeRebind = (skillName: Role1TreeSkillId, key: BindKey) => this.onRebind(skillName, key)
    w.__skillTreeBack = () => this.goBack()
    w.__skillTreeAddSoul = (amount: number) => {
      this.soulPurse.value = Math.max(0, this.soulPurse.value + Math.floor(amount))
      this.persist()
      this.refresh()
    }
  }
}
