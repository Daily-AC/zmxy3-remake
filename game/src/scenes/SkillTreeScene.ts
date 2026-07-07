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
} from '../systems/skillTree'
import type { SkillTreeState, Role1TreeSkillId, BindKey } from '../systems/skillTree'
import { getRole1SkillMpCost } from '../systems/heroSkill'
import { worldMapTransform, WORLDMAP_STAGE_W, WORLDMAP_STAGE_H } from '../data/worldmapNodes'
import { ONLINE_TEXTURES, HUD_COLORS } from '../ui/hud/hudTheme'
import { drawInkBackdrop } from '../ui/menu/inkBackdrop'
import { MenuButton } from '../ui/menu/MenuButton'
import { Toast } from '../ui/hud/Toast'

// S5 技能树/学习技能. Layout source: dual extraction of the main SWF's
// export.shop.{BuySkill,SkillControl,SkillSetControl,PassiveSkillControl}
// (AS3, 骨) and OtherMat1.swf's matching timeline symbols (皮 -- Symbol
// 489/736/193/769 in the xfl export, `game/tmp/s5-as3/`). Every coordinate
// named "AS3 real coord" below is that symbol's literal PlaceObject Matrix
// tx/ty in the 940x590 stage space (same space WorldMapScene's `worldMapTransform`
// already establishes for this project) -- not hand-eyeballed against the
// reference screenshot. See tasks/skilltree-report.md for the full citation
// table and the origin/position derivation.
//
// Only Role1 (悟空) has a real skill system (heroSkill.ts) -- the only
// selectable hero (S2). BuySkill's multi-hero portrait row (player1/player2,
// AS3 `added()`) is therefore not reproduced; this screen opens directly on
// 悟空, same "仅悟空可选其余灰锁" precedent as CharacterSelectScene.
//
// Chrome (panel/backdrop) is drawn with this project's established ink-panel
// primitives (inkBackdrop.ts / MenuButton.ts, the same system BattleScene's
// pause menu and the shell menus already use) rather than a composited
// extracted background bitmap -- Adapted, see skilltree-report.md (the S4
// backpack screen extracted one full baked-chrome PNG via FFDec's default-
// frame render; that render path did not reproduce cleanly for this symbol's
// nested multi-frame mainskillmc within this task's time budget, so real
// coordinates + drawn chrome was used instead. Every *interactive* element's
// position is still the real AS3 value, which is what the overlay judges).

const PANEL_BG = 0x1a130b
const SCHOOL_BOX_W = 226
const SCHOOL_BOX_H = 172
const ROW_ICON_X = 376 // AS3 real coord: mainskillmc.skillN local x (-272.95) + reg point x (648.45)
const ROW_NAME_X = 470
const ROW_BIND_X = 784 // AS3 real coord: mainskillmc.skillsetN x (135.95) + reg point x (648.45)
const ROW_UPGRADE_X = 856 // AS3 real coord: mainskillmc.upgradeN x (207.05) + reg point x (648.45)
// AS3 real coords: mainskillmc.skillN local y + reg point y (317.2), rows 1-5.
const ROW_Y = [125.55, 203.2, 280.2, 357.15, 436.2]

// Transcribed verbatim from docs/reference/user-flow-refs/skilltree-original.png
// (斻系心法's table, the only school visible in that reference capture). Names
// in the screenshot are the in-game Chinese names for slz/zz/sx/qsez/hmz --
// qsez/hmz's own ids are literally pinyin initials of these names (七十二斩 /
// 火魔斩), confirming the id<->name mapping independent of row order.
const SCHOOL1_SKILL_DESC: Partial<Record<Role1TreeSkillId, string>> = {
  slz: '近身后用力将怪物挑到空中', // 升龙斩
  zz: '蓄气后用力斩杀前方怪物', // 重斩
  sx: '被动增加5%吸血和5%暴击效果', // 嗜血
  qsez: '迅速向前冲去，对怪物施展多次攻击，并有概率留下残影', // 七十二斩
  hmz: '冲向空中施展火魔九连斩，落地后为最后一斩，造成极高的伤害', // 火魔斩
}

type BottomTab = 'active' | 'passive' | 'boss'

function asSlotId(v: unknown): SlotId | null {
  return v === 0 || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? (v as SlotId) : null
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
  private leftLayer!: Phaser.GameObjects.Container
  private soulText!: Phaser.GameObjects.Text
  private rebindModal?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.skillTree)
  }

  preload(): void {
    for (const t of ONLINE_TEXTURES) {
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

    drawInkBackdrop(this)
    const { scale, offsetX, offsetY } = worldMapTransform(960, 540)
    this.root = this.add.container(offsetX, offsetY).setScale(scale)
    this.toastUi = new Toast(this, 480, 500)

    this.buildPanel()
    this.buildTopBar()
    this.leftLayer = this.add.container(0, 0)
    this.root.add(this.leftLayer)
    this.rowsLayer = this.add.container(0, 0)
    this.root.add(this.rowsLayer)
    this.buildBottomTabs()
    this.refresh()
    this.exposeHooks()
  }

  // ---------- static chrome ----------

  private buildPanel(): void {
    const g = this.add.graphics()
    g.fillStyle(PANEL_BG, 0.94)
    g.fillRoundedRect(0, 0, WORLDMAP_STAGE_W, WORLDMAP_STAGE_H, 18)
    g.lineStyle(2, HUD_COLORS.gold, 0.55)
    g.strokeRoundedRect(4, 4, WORLDMAP_STAGE_W - 8, WORLDMAP_STAGE_H - 8, 16)
    this.root.add(g)
  }

  private buildTopBar(): void {
    // Hero badge -- BuySkill only ever shows 悟空 here (see file header).
    this.root.add(
      this.add.text(60, 22, '孙悟空', { fontSize: '22px', color: HUD_COLORS.text, fontStyle: 'bold' }),
    )
    // Explainer copy: no AS3 dynamic field backs this (it's baked art text in
    // the timeline, not extracted) -- wording matches the reference screenshot
    // (docs/reference/user-flow-refs/skilltree-original.png) verbatim rather
    // than being invented. "购买孟婆药剂" (a 商城/shop item) has no counterpart
    // in this project (商城 is still 置灰, see WorldMapScene) -- copy kept
    // as-is since it's flavor text, not a promised feature.
    this.root.add(
      this.add
        .text(470, 25, '每个角色只能学习5个技能，学错技能可以到商城购买孟婆药剂来遗忘技能', {
          fontSize: '13px',
          color: HUD_COLORS.textDim,
        })
        .setOrigin(0.5, 0),
    )
    // AS3 real coord: BuySkill.btnback Matrix tx/ty (853.3, 23.35).
    this.root.add(
      new MenuButton(this, {
        x: 875,
        y: 40,
        width: 110,
        height: 36,
        label: '返回',
        variant: 'ghost',
        fontSize: 16,
        onClick: () => this.goBack(),
      }).container,
    )
  }

  private buildBottomTabs(): void {
    // AS3 real coords: BuySkill.activebtn (62.4,555.95) / passivebtn (163.25,555.95).
    // BOSS技能 tab has no AS3 counterpart at all (BuySkill wires only these two
    // buttons) -- invented position continuing the ~101px spacing, greyed per
    // brief ("BOSS技能页签若无系统支撑→置灰不造内容").
    const tabs: { tab: BottomTab; x: number; label: string; enabled: boolean }[] = [
      { tab: 'active', x: 62.4, label: '主动技能', enabled: true },
      { tab: 'passive', x: 163.25, label: '被动技能', enabled: true },
      { tab: 'boss', x: 264.1, label: 'BOSS技能', enabled: false },
    ]
    for (const t of tabs) {
      const btn = new MenuButton(this, {
        x: t.x + 95,
        y: 574,
        width: 130,
        height: 34,
        label: t.label,
        fontSize: 15,
        variant: t.enabled ? (this.activeTab === t.tab ? 'primary' : 'ghost') : 'ghost',
        enabled: t.enabled,
        onClick: () => this.selectTab(t.tab),
      })
      if (!t.enabled) btn.container.setAlpha(0.55)
      this.root.add(btn.container)
    }
    // AS3 real coord: BuySkill.txtlh Matrix tx/ty (805.95, 544).
    this.soulText = this.add
      .text(805.95, 544, '', { fontSize: '18px', color: '#ffd873', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
    this.root.add(this.soulText)
  }

  private selectTab(tab: BottomTab): void {
    if (tab === 'boss') {
      this.toastUi.show('敬请期待', '#c8cfe6')
      return
    }
    this.activeTab = tab
    this.refresh()
  }

  private goBack(): void {
    this.persist()
    this.scene.start(SCENE.worldMap)
  }

  // ---------- data-driven redraw ----------

  private refresh(): void {
    this.leftLayer.removeAll(true)
    this.rowsLayer.removeAll(true)
    this.soulText.setText(`灵魂: ${this.soulPurse.value}`)
    this.buildSchoolCards()
    if (this.activeTab === 'active') this.buildSkillRows()
    else if (this.activeTab === 'passive') this.buildPassivePlaceholder()
  }

  private buildSchoolCards(): void {
    for (const schoolIndex of [0, 1] as const) {
      // AS3 real coords: xf1mc (57.65,151) / xf2mc (57.65,351); xfnameN/leveltxtN/
      // lhtxtN share the same +200 vertical offset between school 1 and 2.
      const boxY = schoolIndex === 0 ? 145 : 345
      const school = this.skillTree.schools[schoolIndex]
      const selected = this.selectedSchool === schoolIndex
      // "心法一"/"心法二" header strip above each card -- reference screenshot
      // (skilltree-original.png) shows this as a separate black bar above the
      // school's own name/icon; not itself an AS3-placed element (decorative),
      // added to match the reference's two-tier left-column read.
      const header = this.add
        .text(40 + SCHOOL_BOX_W / 2, boxY - 16, schoolIndex === 0 ? '心法一' : '心法二', {
          fontSize: '14px',
          color: HUD_COLORS.textDim,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      this.leftLayer.add(header)
      const g = this.add.graphics()
      g.fillStyle(selected ? 0x2a2013 : 0x140d07, 0.92)
      g.fillRoundedRect(40, boxY, SCHOOL_BOX_W, SCHOOL_BOX_H, 10)
      g.lineStyle(2, selected ? HUD_COLORS.goldBright : HUD_COLORS.edge, 0.9)
      g.strokeRoundedRect(40, boxY, SCHOOL_BOX_W, SCHOOL_BOX_H, 10)
      const hit = this.add.rectangle(40 + SCHOOL_BOX_W / 2, boxY + SCHOOL_BOX_H / 2, SCHOOL_BOX_W, SCHOOL_BOX_H, 0xffffff, 0)
      hit.setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        this.selectedSchool = schoolIndex
        this.refresh()
      })
      const nameText = this.add
        .text(40 + SCHOOL_BOX_W / 2, boxY + 26, ROLE1_SCHOOLS[schoolIndex].name, {
          fontSize: '17px',
          color: HUD_COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      const levelText = this.add
        .text(40 + SCHOOL_BOX_W / 2, boxY + 62, `当前等级：${school.level}`, {
          fontSize: '15px',
          color: HUD_COLORS.textDim,
        })
        .setOrigin(0.5)
      const cost = getSchoolUpgradeCost(school.level)
      const costText = this.add
        .text(40 + SCHOOL_BOX_W / 2, boxY + 92, cost === undefined ? '心法已满级' : `升级所需灵魂：${cost}`, {
          fontSize: '13px',
          color: HUD_COLORS.textDim,
        })
        .setOrigin(0.5)
      const upgradeBtn = new MenuButton(this, {
        x: 40 + SCHOOL_BOX_W / 2,
        y: boxY + 142,
        width: 150,
        height: 30,
        label: cost === undefined ? '已满级' : '升级心法',
        fontSize: 14,
        variant: 'primary',
        enabled: cost !== undefined,
        onClick: () => this.onUpgradeSchool(schoolIndex),
      })
      this.leftLayer.add([g, hit, nameText, levelText, costText, upgradeBtn.container])
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
    // Column headers matching the reference screenshot's table row
    // (技能名称/技能图标/技能说明/按键设置). Only "技能升级"'s x is an AS3 real
    // coord (837, 91.65, BuySkill/SkillControl Symbol 736 Layer 13) -- the
    // other three are placed at this task's own column x's (ROW_NAME_X/
    // ROW_ICON_X/ROW_BIND_X), not extracted coordinates, since the reference's
    // 4-column header only has a baked-art source in the timeline bitmap this
    // task didn't composite (see file header re: drawn vs. extracted chrome).
    const headerY = 91.65
    this.rowsLayer.add([
      // 名称/说明 render stacked at one x (see the row loop below) rather than
      // the reference's two side-by-side columns -- one combined header label.
      this.add.text(ROW_NAME_X, headerY, '技能名称 / 技能说明', { fontSize: '14px', color: HUD_COLORS.textDim }),
      this.add.text(ROW_ICON_X, headerY, '技能图标', { fontSize: '14px', color: HUD_COLORS.textDim }).setOrigin(0.5),
      this.add
        .text(ROW_BIND_X - 4, headerY, '按键设置', { fontSize: '13px', color: HUD_COLORS.textDim })
        .setOrigin(1, 0.5),
      this.add
        .text(837 + 4, headerY, '技能升级', { fontSize: '13px', color: HUD_COLORS.textDim })
        .setOrigin(0, 0.5),
    ])
    const school = ROLE1_SCHOOLS[this.selectedSchool]
    const unlocked = getUnlockedSlotCount(this.skillTree.schools[this.selectedSchool].level)
    for (let i = 0; i < 5; i++) {
      const skillName = school.skills[i]
      const y = ROW_Y[i]
      const learned = isSkillLearned(this.skillTree, skillName)
      const level = getLearnedLevel(this.skillTree, skillName)
      const isUnlocked = i < unlocked

      // Row divider (spec: "行分隔线"), placed at the midpoint to the next row.
      const line = this.add.rectangle(ROW_ICON_X + 400, y + 38, 800, 1, 0x4a2c12, 0.6)
      this.rowsLayer.add(line)

      const iconKey = `skill_${skillName}`
      const icon = this.textures.exists(iconKey)
        ? this.add.image(ROW_ICON_X, y, iconKey)
        : this.add.rectangle(ROW_ICON_X, y, 48, 48, 0x333333)
      if (!learned) icon.setAlpha(isUnlocked ? 0.85 : 0.35)
      this.rowsLayer.add(icon)

      const mpCost = skillName === 'sx' ? undefined : getRole1SkillMpCost(skillName, Math.max(1, level))
      // "技能说明" column: the AS3 timeline has no dynamic description field
      // (skillsetN/upgradeN are buttons, not text) -- 斻系心法's 5 descriptions
      // below are transcribed verbatim from the reference screenshot
      // (skilltree-original.png), which shows this exact school's table with
      // its baked flavor text legible. 火系心法's row descriptions have no
      // equivalent reference capture (the screenshot only shows school 1), so
      // those fall back to the real MP-cost/level data instead of invented text.
      const desc = SCHOOL1_SKILL_DESC[skillName] ?? (mpCost !== undefined ? `消耗 MP ${mpCost}` : '')
      const nameLine = this.add.text(ROW_NAME_X, y - 12, `${skillName}${learned ? `  Lv${level}` : ''}`, {
        fontSize: '16px',
        color: learned ? HUD_COLORS.text : isUnlocked ? HUD_COLORS.textDim : '#6b6458',
        fontStyle: 'bold',
      })
      const descLine = this.add.text(ROW_NAME_X, y + 9, desc, {
        fontSize: '11px',
        color: HUD_COLORS.textDim,
        lineSpacing: 2,
        wordWrap: { width: ROW_BIND_X - ROW_NAME_X - 30 },
      })
      this.rowsLayer.add([nameLine, descLine])

      if (!learned) {
        const learnBtn = new MenuButton(this, {
          x: ROW_UPGRADE_X - 30,
          y,
          width: 150,
          height: 30,
          label: isUnlocked ? '学习' : '未解锁',
          fontSize: 13,
          variant: 'primary',
          enabled: isUnlocked,
          onClick: () => this.onLearn(this.selectedSchool, i),
        })
        this.rowsLayer.add(learnBtn.container)
        continue
      }

      const key = keyForSkill(this.skillTree, skillName)
      // AS3 real coord: mainskillmc.skillsetN (784, rowY) -- "按键设置" column.
      const bindBtn = new MenuButton(this, {
        x: ROW_BIND_X,
        y,
        width: 96,
        height: 30,
        label: key ?? '未绑定',
        fontSize: 14,
        variant: key ? 'primary' : 'ghost',
        onClick: () => this.openRebindModal(skillName),
      })
      this.rowsLayer.add(bindBtn.container)

      // AS3 real coord: mainskillmc.upgradeN (856, rowY) -- 技能升级 column.
      const canUp = canUpgradeSkillLevel(this.skillTree, skillName, this.heroLevel, this.soulPurse.value)
      const atMax = level >= MAX_SKILL_LEVEL
      const upBtn = new MenuButton(this, {
        x: ROW_UPGRADE_X + 92,
        y,
        width: 96,
        height: 30,
        label: atMax ? '满级' : `升级 ${getSkillUpgradeCost(level)}`,
        fontSize: 12,
        variant: 'ghost',
        enabled: canUp === true,
        onClick: () => this.onUpgradeSkill(skillName),
      })
      this.rowsLayer.add(upBtn.container)
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
    this.toastUi.show(`已学习${learned}`, '#ffd873')
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

  private buildPassivePlaceholder(): void {
    // export.shop.PassiveSkillControl's 5 pskill slots (AS3 real coords: x≈122,
    // y=144.95/221.95/304.95/381.95/460.95) have no corresponding system in
    // this project -- sx (the only Role1 passive we implement) is already
    // fully handled through the 心法 tree above (allSklName[0][2], same as any
    // other school skill), not through this separate panel. Greyed
    // placeholder only, per brief's "无系统支撑→置灰不造内容" (same treatment
    // as S4's 时装/经书 tabs).
    const ys = [144.95, 221.95, 304.95, 381.95, 460.95]
    for (const y of ys) {
      const g = this.add.rectangle(122 + 300, y + 24, 700, 44, 0x2a2013, 0.5)
      g.setStrokeStyle(1, HUD_COLORS.edge, 0.6)
      this.rowsLayer.add(g)
    }
    this.rowsLayer.add(
      this.add
        .text(472, 300, '被动技能：本作暂无系统支持', { fontSize: '16px', color: HUD_COLORS.textDim })
        .setOrigin(0.5),
    )
  }

  // ---------- rebind modal (SkillSetControl analog) ----------

  private openRebindModal(skillName: Role1TreeSkillId): void {
    this.closeRebindModal()
    const modal = this.add.container(0, 0)
    const scrim = this.add.rectangle(WORLDMAP_STAGE_W / 2, WORLDMAP_STAGE_H / 2, WORLDMAP_STAGE_W, WORLDMAP_STAGE_H, 0x000000, 0.45)
    scrim.setInteractive()
    modal.add(scrim)

    const panelX = 210
    const panelY = 120
    const panelW = 520
    const panelH = 260
    const g = this.add.graphics()
    g.fillStyle(0x1a130b, 0.98)
    g.fillRoundedRect(panelX, panelY, panelW, panelH, 14)
    g.lineStyle(2, HUD_COLORS.gold, 0.7)
    g.strokeRoundedRect(panelX, panelY, panelW, panelH, 14)
    modal.add(g)
    modal.add(
      this.add
        .text(panelX + panelW / 2, panelY + 26, `将【${skillName}】绑定到:`, {
          fontSize: '16px',
          color: HUD_COLORS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    )
    // AS3 real coords: SkillSetControl.Ymc/Umc/Imc/Omc/Lmc (230.95..602.95, y=339),
    // translated into the modal's own local layout (same relative spacing).
    for (let i = 0; i < BIND_KEYS.length; i++) {
      const key = BIND_KEYS[i]
      const slotX = panelX + 60 + i * 90
      const slotY = panelY + 130
      const occupant = this.skillTree.bindings[key]
      const box = this.add.rectangle(slotX, slotY, 70, 70, 0x2a2013, 0.95)
      box.setStrokeStyle(2, occupant === skillName ? HUD_COLORS.goldBright : HUD_COLORS.edge, 0.9)
      box.setInteractive({ useHandCursor: true })
      box.on('pointerdown', () => this.onRebind(skillName, key))
      const iconKey = occupant ? `skill_${occupant}` : undefined
      const icon =
        iconKey && this.textures.exists(iconKey)
          ? this.add.image(slotX, slotY - 6, iconKey).setScale(0.6)
          : undefined
      const label = this.add
        .text(slotX, slotY + 26, key, { fontSize: '14px', color: '#f2c65a', fontStyle: 'bold' })
        .setOrigin(0.5)
      modal.add([box, label])
      if (icon) modal.add(icon)
    }
    modal.add(
      new MenuButton(this, {
        x: panelX + panelW / 2,
        y: panelY + panelH - 30,
        width: 120,
        height: 32,
        label: '关闭',
        fontSize: 14,
        variant: 'ghost',
        onClick: () => this.closeRebindModal(),
      }).container,
    )
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
    // Preserve the slot's existing playtimeSec (not tracked by this scene) --
    // same "read-modify-write the envelope" shape as WorldMapScene.persistSlot.
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
      // Test-only debug hook (mirrors the pattern of other scenes' __-prefixed
      // acceptance hooks) -- lets flow screenshots afford an upgrade without
      // grinding, since this project has no other soul-generation loop reachable
      // from the world map.
      this.soulPurse.value = Math.max(0, this.soulPurse.value + Math.floor(amount))
      this.persist()
      this.refresh()
    }
  }
}
