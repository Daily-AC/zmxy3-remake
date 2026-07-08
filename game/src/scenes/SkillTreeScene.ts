import Phaser from 'phaser'
import { SCENE, REG, shellStorage } from './shellShared'
import type { SlotId } from '../systems/saveSlots'
import { readSlot, writeSlot, buildSlotEnvelope } from '../systems/saveSlots'
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
import { PrefabLoader, type PrefabDocument } from '../prefab/PrefabLoader'
import passiveSkillControlPrefab from '../data/prefab/PassiveSkillControl.prefab.json'

// S5 技能树/学习技能. Layout AND skin source: dual extraction of the main
// SWF's export.shop.{BuySkill,SkillControl,SkillSetControl,PassiveSkillControl}
// (AS3, 骨) and OtherMat1.swf's matching timeline symbols rendered to real
// PNGs via FFDec's sprite/button exporter (`皮`, Symbol 489/736/193/769,
// `game/tmp/s5-render/`, same technique as S4's backpack_bg.png). Every
// coordinate named "AS3 real coord" is that symbol's literal PlaceObject
// Matrix tx/ty in the 940x590 stage space; every visual element below is a
// real vendor bitmap, not hand-drawn chrome -- see tasks/skilltree-report.md
// §终审返修 for the full asset table and the offset derivation.
//
// TERMINOLOGY NOTE (终审返修 finding): the reference screenshot
// (docs/reference/user-flow-refs/skilltree-original.png, dark card theme) is
// NOT this vendor SWF's own art -- BuySkill's real baked background is a blue
// ink-wash "4399" watermark theme (game/public/assets/extracted/skilltree/bg.png,
// rendered from Symbol 489). Per this project's own established rule
// ("版式与参照分歧时先核 vendor 烘焙默认态再定论，vendor 胜"), this scene uses
// the VENDOR skin, not the reference screenshot's skin -- the reference is
// almost certainly an Online-series reskin, same situation as several other
// screens in this project.
//
// Only Role1 (悟空) has a real skill system (heroSkill.ts) -- the only
// selectable hero (S2). BuySkill's multi-hero portrait row (player1/player2,
// AS3 `added()`) is therefore not reproduced.
//
// SCHOOL-1 (斻系心法) vs SCHOOL-2 (火系心法) asset asymmetry (documented gap,
// see report): Symbol 736 (SkillControl)'s single static frame happens to
// render mainskillmc showing school-1's fully-unlocked preview state (real
// Chinese names + descriptions + full-color icons, all baked) -- there is no
// equivalent baked render reachable for school-2 within this task's
// extraction (mainskillmc's OWN per-frame sprite export does not reproduce
// the same nested button states; likely an FFDec limitation exporting nested
// button-driven sub-timelines in isolation). School-2 rows therefore overlay
// REAL individual skill-icon bitmaps (also FFDec-rendered, see icon_* assets)
// but fall back to the internal id (lys/hytj/lyfb/jdy/hyjj) for the name label
// -- not fabricated Chinese text.

const SKILLTREE_DIR = 'assets/extracted/skilltree/'
const TABLE_OFFSET_X = 1.5 // table_school1.png placement in stage space (see report: row-position cross-check).
const TABLE_OFFSET_Y = 48.3
const ROW_ICON_X = 376 // AS3 real coord: mainskillmc.skillN local x (-272.95) + reg point x (648.45)
const ROW_NAME_X = 470
const ROW_BIND_X = 784 // AS3 real coord: mainskillmc.skillsetN x (135.95) + reg point x (648.45)
const ROW_UPGRADE_X = 856 // AS3 real coord: mainskillmc.upgradeN x (207.05) + reg point x (648.45)
// AS3 real coords: mainskillmc.skillN local y + reg point y (317.2), rows 1-5.
const ROW_Y = [125.55, 203.2, 280.2, 357.15, 436.2]
// Row content band to mask+replace for school 2. Extends LEFT over the
// 技能名称 column too -- the baked school-1 names live there, and masking
// only the icon/说明 band printed TWO names per row (baked 升龙斩 + drawn
// 烈焰闪; caught in 2026-07-08 live verification). 设置/升级 buttons and
// divider lines are shared baked chrome, kept as-is. Name-column center
// measured on table_school1.png (table-local ~300 + offset).
const ROW_MASK_X = 245
const ROW_MASK_W = 450
const ROW_MASK_H = 68
const ROW_NAME_CX = 301.5

const GOLD = '#f2c65a'
const CREAM = '#f2eddf'
const DIM = '#c8bfa6'

type BottomTab = 'active' | 'passive' | 'boss'

const SKILLTREE_TEXTURES: { key: string; url: string }[] = [
  { key: 'st_bg', url: `${SKILLTREE_DIR}bg.png` },
  { key: 'st_table1', url: `${SKILLTREE_DIR}table_school1.png` },
  { key: 'st_rebind_modal', url: `${SKILLTREE_DIR}rebind_modal.png` },
  // st_passive_panel (passive_panel.png, the old single flattened bitmap)
  // dropped: buildPassivePanel now renders the compiled PassiveSkillControl
  // prefab (PASSIVE_PREFAB_TEXTURES below) instead.
  { key: 'st_btn_upgrade_up', url: `${SKILLTREE_DIR}btn_upgrade_up.png` },
  { key: 'st_btn_upgrade_over', url: `${SKILLTREE_DIR}btn_upgrade_over.png` },
  ...(['Y', 'U', 'I', 'O', 'L'] as const).map((k) => ({ key: `st_slot_${k}`, url: `${SKILLTREE_DIR}slot_${k}_1.png` })),
]
// tools/prefab-compiler output for PassiveSkillControl (Symbol 769): the real
// bg shape (758) + the 5 real pskill row widgets (768, flattened -- see
// tools/prefab-compiler/README.md's --flatten-sprite) compiled straight from
// OtherMat1.swf's swf2xml, replacing the single flattened `passive_panel.png`
// hand-collage buildPassivePanel used before. Texture keys below match the
// compiler's own default textureKey ("<characterId>" / "<characterId>_<frame>")
// 1:1 so no textureKeyFor override is needed in PrefabLoader.build().
const PREFAB_DIR = 'assets/extracted/prefab/PassiveSkillControl/'
const PASSIVE_PREFAB_TEXTURES: { key: string; url: string }[] = [
  { key: '758', url: `${PREFAB_DIR}758.png` },
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ key: `768_${i}`, url: `${PREFAB_DIR}768_${i}.png` })),
]
const SCHOOL_SKILL_IDS: Role1TreeSkillId[] = ['slz', 'lys', 'hytj', 'lyfb', 'jdy', 'qsez', 'zz', 'hmz', 'hyjj', 'sx']
for (const id of SCHOOL_SKILL_IDS) {
  for (const state of ['locked', 'unlocked', 'learned'] as const) {
    SKILLTREE_TEXTURES.push({ key: `st_icon_${id}_${state}`, url: `${SKILLTREE_DIR}icon_${id}_${state}.png` })
  }
}

function asSlotId(v: unknown): SlotId | null {
  return v === 0 || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? (v as SlotId) : null
}

function iconKeyFor(skillName: Role1TreeSkillId, learned: boolean, unlocked: boolean): string {
  const state = learned ? 'learned' : unlocked ? 'unlocked' : 'locked'
  return `st_icon_${skillName}_${state}`
}

export class SkillTreeScene extends Phaser.Scene {
  private slot: SlotId | null = null
  private loaded!: LoadedGameState
  private skillTree!: SkillTreeState
  private soulPurse!: SoulPurse
  private heroLevel = 1
  private selectedSchool: 0 | 1 = 0
  private activeTab: BottomTab = 'active'
  private toastUi!: Toast
  private root!: Phaser.GameObjects.Container
  private rowsLayer!: Phaser.GameObjects.Container
  private cardsLayer!: Phaser.GameObjects.Container
  private tableLayer!: Phaser.GameObjects.Container
  private soulText!: Phaser.GameObjects.Text
  private rebindModal?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.skillTree)
  }

  preload(): void {
    for (const t of [...SKILLTREE_TEXTURES, ...PASSIVE_PREFAB_TEXTURES]) {
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
    // definition WorldMapScene established (worldMapTransform), reused here
    // via a plain scale/offset since this scene has no other worldmap import.
    const scale = 540 / 590
    const offsetX = (960 - 940 * scale) / 2
    this.root = this.add.container(offsetX, 0).setScale(scale)
    this.toastUi = new Toast(this, 480, 500)

    // Real vendor background (Symbol 489 BuySkill render, 940x590, 1:1 stage
    // mapping verified against btnback/txtlh/activebtn real coords).
    this.root.add(this.add.image(0, 0, 'st_bg').setOrigin(0, 0))

    this.buildTopBarText()
    this.buildHitZones()
    // Layer order matters: the real table_school1 bitmap (with its baked
    // "999" placeholders) must sit BELOW the dynamic patches/content that
    // cover those placeholders, so it gets its own bottom layer, separate
    // from rowsLayer (which only ever holds per-refresh dynamic content).
    this.tableLayer = this.add.container(0, 0)
    this.root.add(this.tableLayer)
    this.tableLayer.add(this.add.image(TABLE_OFFSET_X, TABLE_OFFSET_Y, 'st_table1').setOrigin(0, 0))
    this.cardsLayer = this.add.container(0, 0)
    this.root.add(this.cardsLayer)
    this.rowsLayer = this.add.container(0, 0)
    this.root.add(this.rowsLayer)

    // AS3 real coord: BuySkill.txtlh (805.95, 544) -- baked placeholder text
    // ("9999999999") patched with the real value (fully opaque covering rect
    // first, wide enough for the longest realistic soul count).
    // txtlh's baked placeholder ("9999999999") is authored at font-size 25 --
    // wide enough that a narrow patch leaves digits peeking out; cover
    // generously out to the stage edge.
    this.root.add(this.add.rectangle(800, 544, 138, 30, 0x0a1a2e, 1).setOrigin(0, 0.5))
    this.soulText = this.add.text(806, 544, '', { fontSize: '16px', color: GOLD, fontStyle: 'bold' }).setOrigin(0, 0.5)
    this.root.add(this.soulText)

    this.refresh()
    this.exposeHooks()
  }

  // ---------- static chrome (real bitmap + minimal patches) ----------

  private buildTopBarText(): void {
    // BuySkill's own baked art (bg.png) has no title/explainer readout at all
    // (its content starts directly with the ink-wash pattern) -- the
    // reference screenshot's "悟空" badge + explainer line is Online-skin
    // chrome with no vendor bitmap counterpart here (see file header). Placed
    // as plain text (no invented card/panel) in the open area above the
    // watermark, matching spec's "顶栏=角色名徽+说明+返回" structurally
    // without fabricating a background asset that doesn't exist in this SWF.
    this.root.add(this.add.text(20, 14, '孙悟空', { fontSize: '20px', color: CREAM, fontStyle: 'bold' }))
    this.root.add(
      this.add.text(20, 38, '每个角色只能学习5个技能，学错技能可以到商城购买孟婆药剂来遗忘技能', {
        fontSize: '12px',
        color: DIM,
      }),
    )
  }

  private buildHitZones(): void {
    // AS3 real coord: BuySkill.btnback (853.3, 23.35). Baked "返回" label
    // already visible in bg.png -- transparent hit-zone only.
    const back = this.add.rectangle(898, 40, 90, 40, 0xffffff, 0).setInteractive({ useHandCursor: true })
    back.on('pointerdown', () => this.goBack())
    this.root.add(back)

    // AS3 real coords: activebtn (62.4,555.95) / passivebtn (163.25,555.95).
    // Baked "主动技能"/"被动技能" labels already visible; hit-zones + a subtle
    // highlight bar (bg has no distinct selected-tab art) drawn per refresh().
    const active = this.add.rectangle(95, 566, 130, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
    active.on('pointerdown', () => this.selectTab('active'))
    const passive = this.add.rectangle(198, 566, 130, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
    passive.on('pointerdown', () => this.selectTab('passive'))
    this.root.add([active, passive])

    // BOSS技能: no AS3 counterpart at all (BuySkill wires only activebtn/
    // passivebtn) -- own text label continuing the tab row, greyed per brief.
    const boss = this.add.text(305, 558, 'BOSS技能', { fontSize: '15px', color: '#5a5f6e' }).setOrigin(0, 0)
    const bossHit = this.add.rectangle(345, 566, 100, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
    bossHit.on('pointerdown', () => this.toastUi.show('敬请期待', '#c8cfe6'))
    this.root.add([boss, bossHit])
  }

  private tabHighlight?: Phaser.GameObjects.Rectangle

  private selectTab(tab: BottomTab): void {
    this.activeTab = tab
    this.refresh()
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
    this.tabHighlight?.destroy()
    this.tabHighlight = this.add
      .rectangle(this.activeTab === 'active' ? 95 : 198, 566, 130, 30, 0xf2c65a, 0.16)
      .setStrokeStyle(1, 0xf2c65a, 0.5)
    this.root.addAt(this.tabHighlight, 1)

    // The baked active-skill table (st_table1) AND the 心法 school cards
    // (当前等级/升级所需灵魂, cardsLayer) only apply to the active-skill tab --
    // both are drawn unconditionally by a prior fix that only caught the
    // table bitmap, not the cards layer, so switching to 被动技能 still
    // showed "心法二/当前等级：4/升级所需灵魂：2000" text bleeding through the
    // new prefab-rendered passive rows (caught in this task's own screenshot
    // verification, 2026-07-08). Both layers are scoped to the active tab.
    this.tableLayer.setVisible(this.activeTab === 'active')
    if (this.activeTab === 'active') {
      this.buildSchoolCards()
      this.buildSkillRows()
    } else if (this.activeTab === 'passive') {
      this.buildPassivePanel()
    }
  }

  private buildSchoolCards(): void {
    for (const schoolIndex of [0, 1] as const) {
      // Positions here are measured DIRECTLY on table_school1.png's own
      // pixels (game/tmp/s5-render/card-grid.png / card2-grid.png), not the
      // AS3 xfname1/leveltxt1/lhtxt1 Matrix tx/ty -- those DOMDynamicText
      // fields turned out NOT to correspond to what's actually visible in
      // this static render (their own content is empty/placeholder-inert
      // here); what's visibly baked at the "当前等级：999"/"升级所需灵魂：999"
      // reading is a separate static design-time mockup graphic at a
      // different position, confirmed by direct pixel measurement after the
      // AS3-coordinate patches visibly missed it. Converted through the same
      // TABLE_OFFSET_X/Y verified against the row icons.
      const school = this.skillTree.schools[schoolIndex]
      // Every position in this block is measured DIRECTLY on
      // table_school1.png's own pixels per card (bright-text bounding-box
      // scan, game/tmp/s5-render/), NOT the AS3 xfname/leveltxt/lhtxt Matrix
      // coordinates -- those DOMDynamicText fields turned out empty/inert in
      // this static render; what's visibly baked is a separate design-time
      // mockup graphic at different positions per card (not a uniform
      // vertical offset between the two cards), confirmed only after
      // AS3-coordinate and shared-offset patches both visibly missed their
      // target. Converted through the same TABLE_OFFSET_X/Y verified against
      // the row icons.
      const nameCx = (schoolIndex === 0 ? 132 : 105) + TABLE_OFFSET_X
      const nameY = (schoolIndex === 0 ? 88 : 289) + TABLE_OFFSET_Y
      const lineX = 21 + TABLE_OFFSET_X
      const levelLineY = (schoolIndex === 0 ? 149 : 350) + TABLE_OFFSET_Y
      const costLineY = (schoolIndex === 0 ? 175 : 375) + TABLE_OFFSET_Y
      // Card 1's baked name already correctly reads "斻系心法" (matches
      // ROLE1_SCHOOLS[0].name byte-for-byte) -- only card 2 needs its
      // mislabeled default ("斻系心法", a design-time placeholder bug in the
      // baked art affecting BOTH cards' name field) patched to "火系心法".
      if (schoolIndex === 1) {
        this.cardsLayer.add(this.add.rectangle(nameCx, nameY, 150, 26, 0x000000, 1))
        this.cardsLayer.add(
          this.add.text(nameCx, nameY, ROLE1_SCHOOLS[1].name, { fontSize: '13px', color: CREAM }).setOrigin(0.5),
        )
      }
      // 当前等级/升级所需灵魂 lines: covering the full measured line (label
      // text included) and redrawing both the label and the real number is
      // the only reliable fix found in this task's time budget -- a small,
      // disclosed departure from "real bitmap only" for these two short
      // status lines (icons/names/descriptions/buttons elsewhere on this
      // screen remain unmodified real pixels; see report §终审返修).
      // Width 196 keeps the mask inside the card column (card interior is
      // pure #000, baked status text ends at table-local x=177); the earlier
      // 280-wide brown strip spilled into the 技能名称 column and blotted out
      // the baked row-2/row-5 names -- caught in final review.
      this.cardsLayer.add(this.add.rectangle(lineX, levelLineY, 196, 22, 0x000000, 1).setOrigin(0, 0.5))
      this.cardsLayer.add(this.add.rectangle(lineX, costLineY, 196, 22, 0x000000, 1).setOrigin(0, 0.5))
      this.cardsLayer.add(
        this.add.text(lineX, levelLineY, `当前等级：${school.level}`, { fontSize: '13px', color: DIM }).setOrigin(0, 0.5),
      )
      const cost = getSchoolUpgradeCost(school.level)
      this.cardsLayer.add(
        this.add
          .text(lineX, costLineY, cost === undefined ? '心法已满级' : `升级所需灵魂：${cost}`, { fontSize: '13px', color: DIM })
          .setOrigin(0, 0.5),
      )

      // No drawn selection box: the AS3's own selection cue IS the shared
      // upgrade button position (firstXFFunc/secondXFFunc move ONE button
      // between y=191.35/391.35) -- the earlier yellow outline was an
      // invented affordance, removed in final review. Cards stay clickable
      // via an invisible hit zone.
      const boxY = schoolIndex === 0 ? 130 : 330
      const hit = this.add.rectangle(150, boxY + 90, 220, 180, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        this.selectedSchool = schoolIndex
        this.refresh()
      })
      this.cardsLayer.add(hit)

      // AS3 real coord: upGradebtn (136.95, 191.35) -- SHARED single button
      // that AS3 moves between the two y's (firstXFFunc/secondXFFunc). The
      // baked frame shows the button on card 1 only, so: card 1 selected ->
      // baked visual + hit zone; card 2 selected -> mask card 1's baked
      // visual and draw the same-language label at the mirrored (+200) y.
      const selected = this.selectedSchool === schoolIndex
      if (schoolIndex === 0 && !selected) {
        this.cardsLayer.add(this.add.rectangle(172, 191.35, 80, 28, 0x000000, 1))
      }
      if (cost !== undefined && selected) {
        const btnY = schoolIndex === 0 ? 191.35 : 391.35
        if (schoolIndex === 1) {
          this.cardsLayer.add(
            this.add.text(172, btnY, '升 级', { fontSize: '15px', color: '#ffb347', fontStyle: 'bold' }).setOrigin(0.5),
          )
        }
        const hitBtn = this.add.rectangle(172, btnY, 70, 26, 0xffffff, 0).setInteractive({ useHandCursor: true })
        hitBtn.on('pointerdown', () => this.onUpgradeSchool(schoolIndex))
        this.cardsLayer.add(hitBtn)
      }
    }
  }

  private onUpgradeSchool(schoolIndex: 0 | 1): void {
    const check = canUpgradeSchool(this.skillTree, schoolIndex, this.soulPurse.value)
    if (check !== true) {
      this.toastUi.show(check, '#e07a7a')
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

      if (this.selectedSchool === 1) {
        // No baked school-2 row content is reachable from this extraction
        // (see file header) -- mask table_school1's baked school-1 row here
        // (fully opaque -- a translucent mask still let bright baked text
        // bleed through) and overlay real school-2 icon bitmap + official
        // name/description strings (SKILL_DISPLAY -- 火系 names supplied by
        // the user from the official Online client, 2026-07-08; they are
        // runtime-served in the original and exist in no extractable asset).
        this.rowsLayer.add(this.add.rectangle(ROW_MASK_X + ROW_MASK_W / 2, y, ROW_MASK_W, ROW_MASK_H, 0x14141a, 1))
        const icon = this.add.image(ROW_ICON_X, y, iconKeyFor(skillName, learned, isUnlocked))
        this.rowsLayer.add(icon)
        // Mirror the baked column layout: name centered in the 技能名称
        // column, description centered in the 技能说明 column.
        this.rowsLayer.add(
          this.add
            .text(ROW_NAME_CX, y, `${skillDisplayName(skillName)}${learned ? ` Lv${level}` : ''}`, {
              fontSize: '15px',
              color: learned ? CREAM : isUnlocked ? DIM : '#6b6458',
              fontStyle: 'bold',
            })
            .setOrigin(0.5),
        )
        this.rowsLayer.add(
          this.add
            .text(ROW_NAME_X + 108, y, SKILL_DISPLAY[skillName]?.desc ?? '', {
              fontSize: '11px',
              color: '#a8aebc',
              wordWrap: { width: 240 },
              align: 'center',
            })
            .setOrigin(0.5),
        )
      } else if (!learned) {
        // School-1: baked icon already shows the correct locked/unlocked
        // visual (grey vs full-color) per table_school1.png -- only overlay a
        // light dimming tint for genuinely LOCKED (not-yet-unlocked) rows so
        // the school-level gate reads clearly (baked default renders every
        // row as if visually available).
        if (!isUnlocked) this.rowsLayer.add(this.add.rectangle(ROW_MASK_X + ROW_MASK_W / 2, y, ROW_MASK_W, ROW_MASK_H, 0x0a0a0c, 0.55))
      }

      // Interactive hit-zones (school-1 keeps the baked visuals; school-2's
      // are drawn above). Icon click = learn.
      const learnHit = this.add.rectangle(ROW_ICON_X, y, 66, 65, 0xffffff, 0)
      if (!learned && isUnlocked) {
        learnHit.setInteractive({ useHandCursor: true })
        learnHit.on('pointerdown', () => this.onLearn(this.selectedSchool, i))
      }
      this.rowsLayer.add(learnHit)

      if (learned) {
        const key = keyForSkill(this.skillTree, skillName)
        // AS3 real coord: mainskillmc.skillsetN (784, rowY). Patch the bound
        // key letter onto the baked "设置" button (a small badge, not a full
        // replacement of the real button art).
        if (key) {
          this.rowsLayer.add(this.add.circle(ROW_BIND_X - 34, y - 20, 9, 0x1a0f08, 1).setStrokeStyle(1, 0xf2c65a))
          this.rowsLayer.add(this.add.text(ROW_BIND_X - 34, y - 20, key, { fontSize: '11px', color: GOLD, fontStyle: 'bold' }).setOrigin(0.5))
        }
        const bindHit = this.add.rectangle(ROW_BIND_X, y, 60, 30, 0xffffff, 0).setInteractive({ useHandCursor: true })
        bindHit.on('pointerdown', () => this.openRebindModal(skillName))
        this.rowsLayer.add(bindHit)

        // AS3 real coord: mainskillmc.upgradeN (856, rowY).
        const canUp = canUpgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse.value)
        const atMax = level >= MAX_SKILL_LEVEL
        const upHit = this.add.rectangle(ROW_UPGRADE_X, y, 60, 30, 0xffffff, 0)
        if (canUp === true) {
          upHit.setInteractive({ useHandCursor: true })
          upHit.on('pointerdown', () => this.onUpgradeSkill(skillName))
        } else if (!atMax) {
          this.rowsLayer.add(this.add.rectangle(ROW_UPGRADE_X, y, 60, 26, 0x0a0a0c, 0.5))
        }
        this.rowsLayer.add(upHit)
        if (!atMax) {
          this.rowsLayer.add(
            this.add.text(ROW_UPGRADE_X, y + 16, `${getSkillUpgradeCost(level)}`, { fontSize: '10px', color: DIM }).setOrigin(0.5),
          )
        }
      }
    }
  }

  private onLearn(schoolIndex: 0 | 1, slotIndex: number): void {
    const check = canLearnSkill(this.skillTree, schoolIndex, slotIndex)
    if (check !== true) {
      this.toastUi.show(check, '#e07a7a')
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
      this.toastUi.show(check, '#e07a7a')
      return
    }
    upgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse)
    this.persist()
    this.toastUi.show('技能等级提升', '#ffd873')
    this.refresh()
  }

  private buildPassivePanel(): void {
    // Compiled PassiveSkillControl (Symbol 769, tools/prefab-compiler) --
    // replaces the single flattened `passive_panel.png` bitmap with the REAL
    // scene graph: the bg shape (758) + 5 real pskill row widgets (768,
    // positioned at the compiler's own recovered matrix tx/ty, which match
    // tasks/skilltree-report.md §1.2's hand-verified coordinates exactly).
    // The 6 baked frames of each row all read "热血" (a generic placeholder
    // label, not "嗜血"/sx -- confirmed by inspecting the renders), so frame
    // 1 is used uniformly; sx (the only Role1 passive this project
    // implements) is already fully handled through the 心法 tree, not this
    // separate panel -- shown dimmed/non-interactive, per brief's
    // "无系统支撑→置灰不造内容". Grey-tinted (not translucent): translucency is
    // what let this panel's rows bleed through over the active table before
    // tableLayer got a visibility toggle for the tab switch.
    const doc = passiveSkillControlPrefab as unknown as PrefabDocument
    const bgBounds = doc.root.children?.[0]?.boundsPx
    // Symbol 769 is never statically placed in BuySkill's timeline (verified:
    // no PlaceObject for characterId 769 anywhere in OtherMat1's swf2xml) --
    // it's instantiated by AS3 at runtime with no baked stage coordinate to
    // recover. Adapted placement: anchor the compiled bg's own top-left to
    // where the prior hand-placed flattened bitmap sat (97,100), so this
    // swap doesn't relitigate a screen position nothing in the SWF specifies.
    const rootX = 97 - (bgBounds?.xmin ?? 0)
    const rootY = 100 - (bgBounds?.ymin ?? 0)
    const built = new PrefabLoader(this).build(doc, { x: rootX, y: rootY })
    built.root.list.forEach((child) => this.tintDeep(child as Phaser.GameObjects.GameObject))
    this.rowsLayer.add(built.root)
    this.rowsLayer.add(
      this.add
        .text(470, 300, '被动技能：本作暂无系统支持', { fontSize: '15px', color: DIM, backgroundColor: '#1a0f08' })
        .setOrigin(0.5)
        .setPadding(8, 4),
    )
  }

  /** Recursively grey-tints every Image under a PrefabLoader-built subtree
   * (Container has no tint of its own to set once for the whole group). */
  private tintDeep(obj: Phaser.GameObjects.GameObject): void {
    if (obj instanceof Phaser.GameObjects.Image) obj.setTint(0x9a9a9a)
    else if (obj instanceof Phaser.GameObjects.Container) {
      obj.list.forEach((child) => this.tintDeep(child as Phaser.GameObjects.GameObject))
    }
  }

  // ---------- rebind modal (real SkillSetControl render, Symbol 193) ----------

  private openRebindModal(skillName: Role1TreeSkillId): void {
    this.closeRebindModal()
    const modal = this.add.container(0, 0)
    const scrim = this.add.rectangle(470, 295, 940, 590, 0x000000, 0.5).setInteractive()
    modal.add(scrim)

    // Real bitmap (506x356), centered on the stage.
    const imgX = 470 - 253
    const imgY = 295 - 178
    modal.add(this.add.image(imgX, imgY, 'st_rebind_modal').setOrigin(0, 0))
    modal.add(
      this.add
        .text(470, imgY + 25, skillDisplayName(skillName), { fontSize: '13px', color: GOLD, fontStyle: 'bold' })
        .setOrigin(0.5),
    )

    // Slot hit-zones measured directly on the bitmap's own pixel grid (see
    // report: this modal is a self-contained popup, not embedded at 1:1 into
    // the outer 940x590 stage, so its own local grid is the source of truth).
    const centersX = [32, 140, 248, 356, 460]
    for (let i = 0; i < BIND_KEYS.length; i++) {
      const key = BIND_KEYS[i]
      const slotX = imgX + centersX[i]
      const slotY = imgY + 262
      const occupant = this.skillTree.bindings[key]
      if (occupant) {
        const iconKey = iconKeyFor(occupant, true, true)
        if (this.textures.exists(iconKey)) modal.add(this.add.image(slotX, slotY - 4, iconKey).setScale(0.7))
      }
      if (occupant === skillName) {
        modal.add(this.add.rectangle(slotX, slotY, 64, 64, 0, 0).setStrokeStyle(2, 0xf2c65a, 1))
      }
      const hit = this.add.rectangle(slotX, slotY, 64, 64, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => this.onRebind(skillName, key))
      modal.add(hit)
    }

    const closeHit = this.add.rectangle(imgX + 490, imgY + 16, 32, 32, 0xffffff, 0).setInteractive({ useHandCursor: true })
    closeHit.on('pointerdown', () => this.closeRebindModal())
    modal.add(closeHit)

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
      activeTab: this.activeTab,
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
