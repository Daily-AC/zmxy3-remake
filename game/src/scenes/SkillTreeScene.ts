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
  BIND_KEYS,
  getUnlockedSlotCount,
  getSchoolUpgradeCost,
  canUpgradeSchool,
  upgradeSchool,
  isSkillLearned,
  canLearnSkill,
  learnSkill,
  getBindings,
  keyForSkill,
  rebindSkill,
  SKILL_DISPLAY,
  skillDisplayName,
} from '../systems/skillTree'
import type { SkillTreeState, Role1TreeSkillId, BindKey } from '../systems/skillTree'
import { Toast } from '../ui/hud/Toast'
import { HUD_COLORS } from '../ui/hud/hudTheme'
import { MenuButton } from '../ui/menu/MenuButton'
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
//     unchanged, these were always real and always correct. Confirmed this
//     pass: the `locked` frame is ALREADY baked grayscale by the original
//     game and the `unlocked` frame already bakes in a "学习" prompt, so no
//     extra programmatic desaturation is applied on top -- only alpha
//     dimming (unchanged) plus a small drawn lock badge (new, see
//     `drawLockBadge`) for an explicit locked cue.
//  2. Two NEW small real bitmaps (`card_icon_school1/2.png`), cropped
//     directly from the already-extracted `table_school1.png` (no new FFDec
//     run -- this is deriving a smaller real asset from an existing real
//     asset; the 心法 calligraphy tiles are genuine baked vendor art and
//     isolating just those two tiles avoids dragging in the rest of that
//     bitmap's wrong-content problem).
//  3. Real AS3 coordinates for every functionally load-bearing position
//     (icon/bind/action column x, row y) -- `SkillControl.as`'s
//     `mainskillmc.skillN/skillsetN/upgradeN` Matrix values, unchanged from
//     the prior extraction (tasks/skilltree-report.md §1.2). The 5th
//     column's x (formerly `upgradeN`, AS3's per-skill upgrade button) is
//     REUSED for the new activate/status column below rather than dropped --
//     it's still a real, load-bearing row position, just re-purposed.
//  4. Real skill name/description strings for ALL 10 skills, both schools
//     (`SKILL_DISPLAY`).
//
// REMOVED PER USER DIRECTIVE (2026-07-08, relayed by team lead): 被动技能
// and BOSS技能 are gone, not placeholder-disabled -- "没做的先隐掉，不留占位
// 比留着半吊子强". Only the active-skill page exists; there is no tab bar.
// The rebind modal is a plain vector popup, matching how BattleScene's own
// `SkillBarHud` already draws hotkey letters as plain bold text.
//
// 2026-07-09 SEMANTICS + VISUAL REDO (tasks/skilltree-redo-brief.md, user
// 3-point feedback) -- supersedes the 07-08 pass's "KEPT PER MAIN-SESSION
// TERMINAL REVIEW" call on the per-skill 技能升级 column:
//  - Per-skill upgrade is a real AS3 feature (`skillupgradeFunc`), but it
//    requires a 技能书 (skill-book) item system this project hasn't built.
//    User ruling: "如果没做技能书，先不要留这个口子" -- the UI entry point
//    (button, column, hover tooltip) is removed; the engine functions
//    (`upgradeSkillLevel`/`getSkillUpgradeCost`/`canUpgradeSkillLevel` in
//    skillTree.ts) are kept, dormant, commented as reserved for when a real
//    skill-book system lands. This scene no longer imports or calls them.
//  - The row's primary action is renamed to what it actually does per AS3
//    (`SkillControl.as buy()`): 激活 (activate = `learnSkill`, free, auto-
//    binds), not "升级" (upgrade, a different AS3 action this project isn't
//    exposing). The repurposed 5th column now reads 操作 and shows one of
//    三态: locked (心法等级不足) / 激活 (clickable) / 已激活.
//  - 心法卡's own upgrade (spends soul to unlock more slots,
//    `upgradeSchool`) is real and unaffected -- only its button label
//    changes, from "升级" to "提升心法", so it reads as a clearly different
//    action from the retracted per-skill button that used to sit two
//    columns over.
//  - `createLegacySkillTreeState()`'s pre-S5 demo loadout (all 4 fire-school
//    skills pre-learned) is no longer used by save.ts's migration path --
//    see save.ts header. Kept in skillTree.ts as an inert, documented
//    function; not imported here.
//  - Visual: the 07-08 pass's flat navy-blue panel (`0x0f1830`, sampled off
//    a reference screenshot) is replaced with this project's actual
//    established ink+gold HUD language (`ui/hud/hudTheme.ts`'s
//    `HUD_COLORS`, already shared by every BattleScene HUD panel and
//    Toast) -- CLAUDE.md 总纲 3c ("水墨×暗金", "大胆炫技") takes priority
//    over the older reference-screenshot-fidelity rationale for this
//    specific color choice. Table/card panels get a double-line (dark
//    edge + thin gold inset) border instead of a single flat line; the
//    school-card titles, table headers, and skill names/descriptions read
//    through the project's brush font (`activeArtFont`, same mechanism
//    LoginScene/CharacterSelectScene use) instead of the browser sans-serif
//    fallback; 返回 is now a shared `MenuButton` (ghost variant) instead of
//    bespoke text+hit-rect.
//
// Only Role1 (悟空) has a real skill system (heroSkill.ts) -- the only
// selectable hero (S2).

const SKILLTREE_DIR = 'assets/extracted/skilltree/'
const ART_FONT_CSS = `"${activeArtFont().family}", sans-serif`

// Palette: this project's shared ink+gold HUD language (ui/hud/hudTheme.ts),
// reused verbatim rather than re-sampled from a screenshot -- see header
// "2026-07-09 SEMANTICS + VISUAL REDO". LOCKED/DANGER have no HUD_COLORS
// equivalent (Toast/HUD components don't need a "disabled" or "error" tone)
// so stay locally defined, picked to sit in the same warm-dark family.
const BG_INK = HUD_COLORS.ink
const PANEL_FILL = HUD_COLORS.panel
const PANEL_EDGE = HUD_COLORS.edge
const PANEL_INNER_GOLD = HUD_COLORS.gold
const DIVIDER = HUD_COLORS.edge
const GOLD = HUD_COLORS.textGold // standard gold text (learned/active status)
const GOLD_BRIGHT = '#f2c65a' // emphasis: clickable activate action, selection highlight
const GOLD_BRIGHT_NUM = HUD_COLORS.goldBright
const CREAM = HUD_COLORS.text
const DIM = HUD_COLORS.textDim
const DANGER = '#e07a7a'
const LOCKED = '#6b6152'

// AS3 real coords (SkillControl.as / OtherMat1 xfl, tasks/skilltree-report.md
// §1.2) -- absolute 940x590 stage space. See file header §3 for the 5th
// column's 2026-07-09 repurposing (upgrade -> activate/status).
const VERT_SHIFT = 30
const ROW_ICON_X = 376 // mainskillmc.skillN local x (-272.95) + reg point x (648.45)
const ROW_BIND_X = 784 // mainskillmc.skillsetN local x (135.95) + reg point x (648.45)
const ROW_ACTION_X = 856 // mainskillmc.upgradeN local x (207.05) + reg point x (648.45) -- reused, see header
const ROW_Y = [125.55, 203.2, 280.2, 357.15, 436.2].map((y) => y + VERT_SHIFT) // mainskillmc.skillN local y + reg point y (317.2)

// Table column layout -- not AS3 values (no bitmap grid to inherit them from
// anymore); chosen as clean, evenly-legible columns around the AS3-real
// icon/bind/action x's above.
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

/** Dark ink panel with a double-line dark-edge + thin gold-inset border --
 * this project's shared "暗金描边" panel treatment (matches the outer/inner
 * line pairing MenuButton and CharacterSelectScene's action buttons already
 * use), replacing the 07-08 pass's single-line flat-navy panel. Added into
 * `parent` (this scene's scaled/offset `root` container) rather than left as
 * a bare top-level scene object -- see the original 07-08 note this
 * preserves: a bare `scene.add.graphics()` renders after `root` in the
 * Scene's own display list and paints over everything already in `root`. */
function drawPanel(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(PANEL_FILL, 0.93).fillRoundedRect(x, y, w, h, 10)
  g.lineStyle(2, PANEL_EDGE, 1).strokeRoundedRect(x, y, w, h, 10)
  g.lineStyle(1, PANEL_INNER_GOLD, 0.5).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 8)
  parent.add(g)
  return g
}

const LOCKED_NUM = 0x6b6152

/** Minimalist vector padlock badge (no emoji/baked art -- no lock asset
 * exists in the extracted skilltree set, see task brief B). Drawn small and
 * bottom-right of a locked skill's icon. */
function drawLockBadge(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(0x000000, 0.6).fillCircle(cx, cy, 13)
  g.lineStyle(2, LOCKED_NUM, 0.95)
  g.beginPath()
  g.arc(cx, cy - 3, 5, Math.PI, 0, false)
  g.strokePath()
  g.fillStyle(LOCKED_NUM, 0.95).fillRoundedRect(cx - 6, cy - 2, 12, 9, 2)
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
  private returnScene: string = SCENE.worldMap

  constructor() {
    super(SCENE.skillTree)
  }

  init(data?: { returnScene?: string }): void {
    this.returnScene = data?.returnScene === SCENE.battle ? SCENE.battle : SCENE.worldMap
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

    this.root.add(this.add.rectangle(0, 0, 940, 590, BG_INK, 1).setOrigin(0, 0))

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
    // folder yet) -- styled as a gold/outlined art-font badge instead,
    // disclosed as drawn text, not an extracted bitmap.
    const nameBadge = this.add
      .text(20, 10, '悟空', {
        fontFamily: ART_FONT_CSS,
        fontSize: '26px',
        color: GOLD_BRIGHT,
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
    // Shared MenuButton (ghost variant, same warm-wood chrome every other
    // menu/back action in the game uses) instead of the 07-08 pass's bespoke
    // text+hit-rect. Its container is added into `root` like everything
    // else on this screen, so it inherits the same contain-fit scale/offset
    // and its x/y are plain 940x590 stage coordinates.
    const backBtn = new MenuButton(this, {
      x: 878,
      y: 22,
      width: 96,
      height: 34,
      label: '返回',
      fontSize: 16,
      variant: 'ghost',
      onClick: () => this.goBack(),
    })
    this.root.add(backBtn.container)
  }

  private buildTableHeader(): void {
    const y = CARD1_Y + 20
    const headers: [number, string][] = [
      [NAME_COL_CX, '技能名称'],
      [ROW_ICON_X, '技能图标'],
      [DESC_COL_CX, '技能说明'],
      [ROW_BIND_X, '按键设置'],
      [ROW_ACTION_X, '操作'],
    ]
    for (const [cx, label] of headers) {
      const t = this.add.text(cx, y, label, { fontFamily: ART_FONT_CSS, fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5)
      this.root.add(t)
      this.artFontTexts.push(t)
    }
    this.root.add(this.add.rectangle(TABLE_X + 12, y + 18, TABLE_W - 24, 1, DIVIDER, 0.8).setOrigin(0, 0.5))
    // "心法一" card-column header sits at the same y as the table header row,
    // matching the reference's aligned two-panel top edge.
    const cardHeader = this.add.text(CARD_X + CARD_W / 2, y, '心法一', { fontFamily: ART_FONT_CSS, fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5)
    this.root.add(cardHeader)
    this.artFontTexts.push(cardHeader)
    this.root.add(this.add.rectangle(CARD_X + 12, y + 18, CARD_W - 24, 1, DIVIDER, 0.8).setOrigin(0, 0.5))
  }

  private buildBottomBar(): void {
    // Only the active-skill page exists now (user directive 2026-07-08: hide
    // 被动技能/BOSS技能 entirely rather than leave disabled placeholders) --
    // this is a plain label, not a tab (nothing left to switch between).
    const activeLabel = this.add.text(20, PANEL_BOTTOM + 24, '主动技能', { fontFamily: ART_FONT_CSS, fontSize: '16px', color: CREAM, fontStyle: 'bold' }).setOrigin(0, 0.5)
    this.root.add(activeLabel)
    this.artFontTexts.push(activeLabel)

    // Soul counter: drawn fresh (no baked placeholder digits to cover).
    const badgeX = 900
    const badgeY = PANEL_BOTTOM + 24
    this.root.add(this.add.circle(badgeX, badgeY, 26, 0x000000, 1).setStrokeStyle(2, GOLD_BRIGHT_NUM, 0.9))
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
    if (this.returnScene === SCENE.battle) {
      this.scene.stop()
      this.scene.resume(SCENE.battle)
      return
    }
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
      const selected = this.selectedSchool === schoolIndex

      // Whole-card select zone, added FIRST so it sits under every other hit
      // zone in this card (Phaser's default topOnly input mode gives the
      // pointer event to only the topmost object at that point -- adding
      // this after the "提升心法" button's own hit zone would silently make
      // the button unclickable, since the card zone covers it entirely).
      const hit = this.add.rectangle(CARD_X + CARD_W / 2, cardY + CARD_H / 2, CARD_W, CARD_H, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        this.selectedSchool = schoolIndex
        this.refresh()
      })
      this.cardsLayer.add(hit)

      if (schoolIndex === 1) {
        const h2 = this.add.text(CARD_X + CARD_W / 2, cardY + 4, '心法二', { fontFamily: ART_FONT_CSS, fontSize: '14px', color: CREAM, fontStyle: 'bold' }).setOrigin(0.5, 0)
        this.cardsLayer.add(h2)
        this.artFontTexts.push(h2)
        this.cardsLayer.add(this.add.rectangle(CARD_X + 12, cardY + 22, CARD_W - 24, 1, DIVIDER, 0.8).setOrigin(0, 0.5))
      }

      // Selection highlight: a brighter gold inset ring around the selected
      // card, on top of the shared panel border -- the only extra selection
      // cue this screen draws (matches the previous version's discipline of
      // not over-decorating an already-clear affordance).
      if (selected) {
        const ring = this.add.graphics()
        ring.lineStyle(2, GOLD_BRIGHT_NUM, 0.85).strokeRoundedRect(CARD_X + 2, cardY + 2, CARD_W - 4, CARD_H - 4, 8)
        this.cardsLayer.add(ring)
      }

      this.cardsLayer.add(this.add.image(CARD_X + 18, labelY, `st_card_icon_${schoolIndex}`).setOrigin(0, 0.5).setDisplaySize(70, 68))
      const schoolName = this.add
        .text(CARD_X + 100, labelY - 12, ROLE1_SCHOOLS[schoolIndex].name, { fontFamily: ART_FONT_CSS, fontSize: '15px', color: CREAM, fontStyle: 'bold' })
        .setOrigin(0, 0.5)
      this.cardsLayer.add(schoolName)
      this.artFontTexts.push(schoolName)

      const cost = getSchoolUpgradeCost(school.level)
      if (cost !== undefined) {
        // 2026-07-09: relabeled from "升级" to "提升心法" -- see file header,
        // this must read as unmistakably different from the retracted
        // per-skill upgrade button that used to sit in the table to the
        // right.
        const btnColor = selected ? GOLD_BRIGHT : LOCKED
        const btnText = this.add.text(CARD_X + 100, labelY + 14, '提升心法', { fontSize: '14px', color: btnColor, fontStyle: 'bold' }).setOrigin(0, 0.5)
        this.cardsLayer.add(btnText)
        if (selected) {
          const hitBtn = this.add.rectangle(CARD_X + 140, labelY + 14, 96, 24, 0xffffff, 0).setInteractive({ useHandCursor: true })
          hitBtn.on('pointerover', () => btnText.setColor(CREAM))
          hitBtn.on('pointerout', () => btnText.setColor(GOLD_BRIGHT))
          hitBtn.on('pointerdown', () => this.onUpgradeSchool(schoolIndex))
          this.cardsLayer.add(hitBtn)
        }
      }

      const statY1 = labelY + 46
      const statY2 = statY1 + 26
      this.cardsLayer.add(this.add.text(CARD_X + 16, statY1, `当前等级：${school.level}`, { fontSize: '13px', color: DIM }).setOrigin(0, 0.5))
      this.cardsLayer.add(
        this.add
          .text(CARD_X + 16, statY2, cost === undefined ? '心法已满级' : `提升所需灵魂：${cost}`, { fontSize: '13px', color: DIM })
          .setOrigin(0, 0.5),
      )
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
    this.toastUi.show('心法已提升', GOLD_BRIGHT)
    this.refresh()
  }

  private buildSkillRows(): void {
    const school = ROLE1_SCHOOLS[this.selectedSchool]
    const unlocked = getUnlockedSlotCount(this.skillTree.schools[this.selectedSchool].level)
    for (let i = 0; i < 5; i++) {
      const skillName = school.skills[i]
      const y = ROW_Y[i]
      const learned = isSkillLearned(this.skillTree, skillName)
      const isUnlocked = i < unlocked
      const display = SKILL_DISPLAY[skillName]

      if (i > 0) this.rowsLayer.add(this.add.rectangle(TABLE_X + 12, y - (ROW_Y[i] - ROW_Y[i - 1]) / 2, TABLE_W - 24, 1, DIVIDER, 0.5).setOrigin(0, 0.5))

      // Name/desc tone: three distinct tiers -- learned (bright cream),
      // available-to-activate (warm gold, marks "you can act on this row"),
      // locked (muted). Previously available and locked shared one DIM tone.
      const nameColor = learned ? CREAM : isUnlocked ? GOLD : LOCKED
      this.rowsLayer.add(
        this.add
          .text(NAME_COL_CX, y, skillDisplayName(skillName), { fontSize: '15px', color: nameColor, fontStyle: 'bold' })
          .setOrigin(0.5),
      )
      this.rowsLayer.add(
        this.add
          .text(DESC_COL_CX, y, display?.desc ?? '', {
            fontSize: '11px',
            color: learned ? DIM : LOCKED,
            wordWrap: { width: 260 },
            align: 'center',
          })
          .setOrigin(0.5),
      )

      // Icon halo: gold ring for learned (active), faint ring for
      // available-unlearned (activatable), none for locked -- drawn under
      // the icon so it reads as a backing glow, not an overlay.
      if (learned) {
        this.rowsLayer.add(this.add.circle(ROW_ICON_X, y, 34, GOLD_BRIGHT_NUM, 0.1).setStrokeStyle(2, GOLD_BRIGHT_NUM, 0.85))
      } else if (isUnlocked) {
        this.rowsLayer.add(this.add.circle(ROW_ICON_X, y, 34, 0x000000, 0).setStrokeStyle(1.5, GOLD_BRIGHT_NUM, 0.4))
      }

      const icon = this.add.image(ROW_ICON_X, y, iconKeyFor(skillName, learned, isUnlocked))
      this.rowsLayer.add(icon)
      if (!isUnlocked) {
        // The `locked` icon frame is already baked grayscale by the original
        // game (verified against the extracted PNGs) -- alpha dim is enough,
        // no extra tint needed. The lock badge is the new explicit cue.
        icon.setAlpha(0.55)
        this.rowsLayer.add(drawLockBadge(this, ROW_ICON_X + 22, y + 20))
      }

      const learnHit = this.add.rectangle(ROW_ICON_X, y, 66, 65, 0xffffff, 0)
      if (!learned && isUnlocked) {
        learnHit.setInteractive({ useHandCursor: true })
        learnHit.on('pointerdown', () => this.onLearn(this.selectedSchool, i))
      }
      this.rowsLayer.add(learnHit)

      if (learned) {
        const key = keyForSkill(this.skillTree, skillName)
        const keyText = this.add.text(ROW_BIND_X, y, key ?? '设置', { fontSize: '14px', color: key ? GOLD_BRIGHT : DIM, fontStyle: 'bold' }).setOrigin(0.5)
        this.rowsLayer.add(keyText)
        const bindHit = this.add.rectangle(ROW_BIND_X, y, 60, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
        bindHit.on('pointerover', () => keyText.setColor(CREAM))
        bindHit.on('pointerout', () => keyText.setColor(key ? GOLD_BRIGHT : DIM))
        bindHit.on('pointerdown', () => this.openRebindModal(skillName))
        this.rowsLayer.add(bindHit)

        // 操作 column, learned state: status only, matching AS3's own read
        // (a learned/bound skill has nothing left to click here -- rebinding
        // lives in the 按键设置 column to its left).
        this.rowsLayer.add(this.add.text(ROW_ACTION_X, y, '已激活', { fontSize: '14px', color: GOLD, fontStyle: 'bold' }).setOrigin(0.5))
      } else if (isUnlocked) {
        this.rowsLayer.add(this.add.text(ROW_BIND_X, y, '--', { fontSize: '14px', color: LOCKED }).setOrigin(0.5))

        // 操作 column, activatable state: the row's one real action --
        // 激活 = learnSkill (free, auto-binds). Both this hit zone and the
        // icon's own hit zone above trigger the same handler.
        const activateText = this.add.text(ROW_ACTION_X, y, '激活', { fontSize: '15px', color: GOLD_BRIGHT, fontStyle: 'bold' }).setOrigin(0.5)
        this.rowsLayer.add(activateText)
        const activateHit = this.add.rectangle(ROW_ACTION_X, y, 64, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
        activateHit.on('pointerover', () => activateText.setColor(CREAM).setScale(1.08))
        activateHit.on('pointerout', () => activateText.setColor(GOLD_BRIGHT).setScale(1))
        activateHit.on('pointerdown', () => this.onLearn(this.selectedSchool, i))
        this.rowsLayer.add(activateHit)
      } else {
        // Locked state: 心法等级不足, nothing clickable in either column.
        this.rowsLayer.add(this.add.text(ROW_BIND_X, y, '--', { fontSize: '14px', color: LOCKED }).setOrigin(0.5))
        this.rowsLayer.add(this.add.text(ROW_ACTION_X, y, '锁定', { fontSize: '14px', color: LOCKED, fontStyle: 'bold' }).setOrigin(0.5))
      }
    }
  }

  private onLearn(schoolIndex: 0 | 1, slotIndex: number): void {
    const check = canLearnSkill(this.skillTree, schoolIndex, slotIndex)
    if (check !== true) {
      this.toastUi.show(check, DANGER)
      return
    }
    const learned = learnSkill(this.skillTree, schoolIndex, slotIndex)
    this.persist()
    // Feedback per brief B: Toast (existing) + a gold flash tween on the
    // newly-activated row's icon position -- no native dialogs.
    this.flashActivate(ROW_ICON_X, ROW_Y[slotIndex])
    this.toastUi.show(`已激活${learned ? skillDisplayName(learned) : ''}`, GOLD_BRIGHT)
    this.refresh()
  }

  /** Gold ring pulse at a world point -- same additive-blend ring technique
   * LoginScene's stampSeal() already uses for its own "confirmed" feedback,
   * reused here for visual-language consistency rather than inventing a
   * second flash primitive. */
  private flashActivate(x: number, y: number): void {
    const ring = this.add.circle(x, y, 24, GOLD_BRIGHT_NUM, 0.5)
    ring.setBlendMode(Phaser.BlendModes.ADD)
    this.root.add(ring)
    this.tweens.add({
      targets: ring,
      radius: 50,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
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
    panel.fillStyle(PANEL_FILL, 1).fillRoundedRect(x0, y0, w, h, 10)
    panel.lineStyle(2, PANEL_EDGE, 1).strokeRoundedRect(x0, y0, w, h, 10)
    panel.lineStyle(1, GOLD_BRIGHT_NUM, 0.8).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 8)
    modal.add(panel)
    const title = this.add.text(470, y0 + 24, `${skillDisplayName(skillName)} · 按键设置`, { fontFamily: ART_FONT_CSS, fontSize: '15px', color: GOLD_BRIGHT, fontStyle: 'bold' }).setOrigin(0.5)
    modal.add(title)
    this.artFontTexts.push(title)

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
          .setStrokeStyle(2, isTarget ? GOLD_BRIGHT_NUM : PANEL_EDGE, 1),
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
    modal.add(this.add.text(x0 + w - 20, y0 + 18, '×', { fontSize: '18px', color: CREAM }).setOrigin(0.5))
    closeHit.on('pointerdown', () => this.closeRebindModal())

    this.root.add(modal)
    this.rebindModal = modal
  }

  private onRebind(skillName: Role1TreeSkillId, key: BindKey): void {
    if (!rebindSkill(this.skillTree, skillName, key)) return
    this.persist()
    this.closeRebindModal()
    this.toastUi.show(`已绑定到 ${key}`, GOLD_BRIGHT)
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
    w.__skillTreeRebind = (skillName: Role1TreeSkillId, key: BindKey) => this.onRebind(skillName, key)
    w.__skillTreeBack = () => this.goBack()
    w.__skillTreeAddSoul = (amount: number) => {
      this.soulPurse.value = Math.max(0, this.soulPurse.value + Math.floor(amount))
      this.persist()
      this.refresh()
    }
  }
}
