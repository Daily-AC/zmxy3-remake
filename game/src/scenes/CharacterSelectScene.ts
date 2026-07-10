import Phaser from 'phaser'
import { SCENE, REG, shellStorage } from './shellShared'
import { createNewSlotEnvelope, writeSlot, type SlotId } from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'
import { createProgression, type HeroId } from '../systems/progression'
import { createEquipment } from '../systems/equipment'
import { createInventory } from '../systems/inventory'
import { activeArtFont } from '../systems/artFont'
import { configureLogicalCamera } from '../systems/renderScale'
import { roomIdFromInvite } from '../systems/roomInvite'

// SelectRole, redone against the original AS3 (`打开我开始玩.swf` ->
// `export.SelectRole`, tasks/decompile-as3-ui-report-codex.md) + real per-panel
// button art pulled straight from OtherMat1.swf (DefineSprite_1012). See
// tasks/selectrole-saveslots-report.md for the full extraction trail
// (tools/selectrole-origins.py) and origin table.
//
// Layout truth: SelectRole is five FULL-BLEED ink panels, no border, no title,
// no button bar (screen-fidelity-spec.md S2). Idle state is one flattened
// render of all five panels (all grayscale -- the original achieves "gray" via
// a runtime ColorMatrixFilter on the SAME colored art, not a separate baked
// asset, confirmed from the button records' filterList). Selecting swaps the
// whole-row texture for one where panel 1 (悟空) is the colorful/red "over"
// button-state art, empirically aligned onto the base canvas (see report).
// AS3's over() handler adds a "1P"/"2P" badge (real linkage-class bitmaps,
// chid 11/14) at `button.x - 50, y = 40` in SelectRole's own coordinate space;
// same math, reused here as a fixed offset once mapped into our asset's pixel
// space (report §origin table).
//
// Interaction: only 悟空 (panel 1) is playable this milestone (functional
// scope unchanged from the prior shell -- other four panels stay locked, same
// as before, just restyled to fit the borderless five-panel format). AS3's
// real single-player behavior is "one click selects AND confirms" (`onClick`
// -> `newRole()` -> `selectOver()` immediately); this project's shell instead
// keeps the pre-existing two-step select/confirm UX (click to select, click
// again or Enter to confirm) because the confirm hooks
// (`__shellSelectHero`/`__shellConfirm`) are a fixed external contract from
// the prior milestone and the brief keeps behavior unchanged -- only the
// visuals were in scope this pass. 2026-07-08 visual-feedback round added a
// visible "开始游戏" button (docs/reference/user-flow-refs/
// selectrole-original-buttons.png, real original-client screenshot) that
// short-circuits both steps (auto-selects 悟空 then confirms), plus a
// "返回主菜单" button -- see buildActionButtons().
//
// "请输入名字" removed (2026-07-08 verdict): it was baked into the FFDec
// render of AS3's `username` TextField (SelectRole.as:21, real field, not
// invented), but this project never wired a name-entry UI to it -- no scene
// ever read/set `username.text`, and systems/progression.ts + save.ts have no
// player-name field at all. Since the box was purely decorative dead weight
// here (not "an input we're choosing to hide", there was never an input),
// removing it has zero functional impact; hero identity/display name still
// comes solely from the fixed per-role data (roleData.ts). The bake-in was
// patched out of both select_role_idle.png/select_role_selected_wukong.png
// with a texture-clone inpaint (donor: same y-band under the "???" panel,
// which is pixel-identical background gradient with no text) rather than a
// flat color patch, so the ink-crack texture stays continuous -- see
// tasks/verdict-fixes-report.md for the exact region + method.

// The full 5-panel row, both states, are pre-composited PNGs (942x619,
// FFDec sprite export cropped to content bbox) rather than assembled at
// runtime from the four independent per-button crops -- panel widths in the
// source aren't quite uniform (art bleeds past the nominal ~188px column, see
// report), so compositing once offline (with an empirically verified pixel
// offset per panel, not the raw PlaceObject matrix -- FFDec's per-symbol
// canvas padding when a ColorMatrixFilter is present doesn't match the
// analytic twips math, see report "Origin/placement pitfall") is both more
// faithful and simpler than five independently-positioned sprites at runtime.
const IDLE_TEX = 'select_role_idle'
const SELECTED_WUKONG_TEX = 'select_role_selected_wukong'
const BADGE_1P_TEX = 'badge_1p'

// Native pixel space of the extracted art (see report). All panel/hit-zone
// math below is expressed in these units; the whole row is contain-fit
// (never cropped) into the 960x540 canvas, per the mandatory "S1 棒" pillarbox
// rule in docs/playbooks/ui-port-dual-source.md (cover-fit would clip the
// panel row's top/bottom ink border -- the exact mistake that rule exists to
// prevent).
const ART_W = 942
const ART_H = 619
const PANEL_W = ART_W / 5
// Badge placement: AS3 `badge.x = btn.x - 50; badge.y = 40` in SelectRole's
// local space, mapped into this asset's pixel space via the same offset that
// aligned panel 1's button art onto the base canvas (canvas_px = local_px +
// 16.29, +193.55; see tools/selectrole-origins.py + report). Cross-checked
// visually against selectrole-original-1p.png -- matches.
const BADGE_X = 69
const BADGE_Y = 59

// Panels 1-3 (唐僧/猪八戒/沙僧) are real AS3 button slots (btn2/btn3/btn4,
// tasks/selectrole-saveslots-report.md §1) -- locked this milestone, so the
// "敬请期待" label is honest (a real character exists, just not playable
// yet). Panel 4 ("???") has no btn5 in AS3 at all (DefineSprite_1011, static
// decoration, tasks/selectrole-saveslots-report.md §2) -- pure "???"
// silhouette, no label. This flipped twice in one day (round 1: removed
// panel 4's label on the AS3-fidelity argument -> round 2: team-lead brief
// said the user reversed that, restore it to all four -> round 2 terminal
// review: team-lead corrected that the reversal was scoped to the *style*
// of panels 1-3's label only, panel 4 was never meant to get one back, the
// "定案" stands). This is the terminal state: panel 4 excluded, matching the
// very first (round 1) decision. If this flips again, resist the urge to
// "reconcile" the two rounds' doc comments into a novel -- just state the
// current rule and cite the round-1/selectrole-saveslots-report.md AS3 facts.
const LOCKED_PANELS = [1, 2, 3]
const LOCKED_LABEL = ['唐僧', '猪八戒', '沙僧']

// Label vertical position: native-art y-band that's genuinely empty gradient
// background on every panel -- below the character's feet/shadow (~y430-460)
// and above the baked name row (~y505+). The original layout (ART_H*0.42,
// removed here) sat mid-chest/face height, which is exactly what the
// 2026-07-08 feedback screenshot's blue boxes called out as covering faces.
const LOCKED_LABEL_Y = ART_H * 0.772

// "开始游戏"/"返回主菜单" buttons (2026-07-08 addition; 2026-07-09 moved OFF
// the artwork into a dedicated band BELOW it, per user feedback -- the old
// y=505 placement sat on top of the panel art). The panel row is now
// contain-fit to ART_BAND_H instead of the full 540 canvas height, freeing
// the bottom strip for the button pair. Laid out in canvas space (not inside
// the scaled `row` container) so their text/stroke stays crisp.
const ART_BAND_H = 470
const ACTION_BTN_Y = 507
const START_BTN_X = 402
const BACK_BTN_X = 568
// Ambient backdrop (2026-07-09, user feedback "两边都是黑的"): the panel art
// doesn't cover the full 960x540 canvas, so a blurred+darkened cover-fit
// derivative of the SAME idle art (tools: PIL gaussian 14px, brightness 0.55,
// generated/select-bg-blur.jpg) fills the whole frame behind it -- ambient
// extension of the artwork itself, no new style introduced.
const AMBIENT_BG_TEX = 'select_role_ambient_bg'

export class CharacterSelectScene extends Phaser.Scene {
  private slot: SlotId = 0
  private selectedHero = 1 // 悟空; the only selectable hero this milestone
  private isSelected = false
  private idleImg!: Phaser.GameObjects.Image
  private selectedImg!: Phaser.GameObjects.Image
  private badge!: Phaser.GameObjects.Image
  private row!: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.characterSelect)
  }

  init(data: { slot?: number }): void {
    this.slot = (data?.slot as SlotId) ?? 0
    this.isSelected = false
  }

  preload(): void {
    if (!this.textures.exists(IDLE_TEX)) {
      this.load.image(IDLE_TEX, 'assets/extracted/menu/select_role_idle.png')
    }
    if (!this.textures.exists(SELECTED_WUKONG_TEX)) {
      this.load.image(SELECTED_WUKONG_TEX, 'assets/extracted/menu/select_role_selected_wukong.png')
    }
    if (!this.textures.exists(BADGE_1P_TEX)) {
      this.load.image(BADGE_1P_TEX, 'assets/extracted/menu/badge_1p.png')
    }
    if (!this.textures.exists(AMBIENT_BG_TEX)) {
      this.load.image(AMBIENT_BG_TEX, 'assets/generated/select-bg-blur.jpg')
    }
  }

  create(): void {
    configureLogicalCamera(this)
    // Base ink black under everything, then the blurred ambient derivative of
    // the artwork itself cover-fills the canvas (see AMBIENT_BG_TEX comment),
    // with a soft edge vignette so the sharp panel row stays the focal point.
    this.add.graphics().fillStyle(0x0b0a0d, 1).fillRect(0, 0, 960, 540)
    if (this.textures.exists(AMBIENT_BG_TEX)) {
      this.add.image(480, 270, AMBIENT_BG_TEX)
    }
    const vignette = this.add.graphics()
    vignette.fillGradientStyle(0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0.85, 0.85, 0, 0)
    vignette.fillRect(0, 0, 960, 90)
    vignette.fillGradientStyle(0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0, 0, 0.9, 0.9)
    vignette.fillRect(0, 430, 960, 110)

    const scale = ART_BAND_H / ART_H
    const offsetX = (960 - ART_W * scale) / 2
    this.row = this.add.container(offsetX, 4).setScale(scale)

    this.idleImg = this.add.image(0, 0, IDLE_TEX).setOrigin(0, 0)
    this.selectedImg = this.add.image(0, 0, SELECTED_WUKONG_TEX).setOrigin(0, 0).setVisible(false)
    this.row.add([this.idleImg, this.selectedImg])

    this.badge = this.add.image(BADGE_X, BADGE_Y, BADGE_1P_TEX).setOrigin(0, 0).setVisible(false).setDepth(10)
    this.row.add(this.badge)

    // Panel 1 (悟空): click selects, click again (or Enter) confirms --
    // matches spec "确认=再次点击/回车" while keeping the two-step contract
    // the existing __shellSelectHero/__shellConfirm hooks assume.
    this.row.add(
      this.add
        .zone(0, 0, PANEL_W, ART_H)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.onPanel1Click()),
    )

    // Locked panels 2-4 (唐僧/猪八戒/沙僧): single-line "敬请期待" sitting in
    // the empty gradient gap between the character's feet and the baked name
    // row (LOCKED_LABEL_Y doc comment above) -- redesigned 2026-07-08 so it
    // no longer overlaps any face (the old two-line ART_H*0.42 placement
    // did, per the feedback screenshot's blue boxes). Panel 5 ("???")
    // deliberately excluded -- see LOCKED_PANELS doc comment above.
    for (const i of LOCKED_PANELS) {
      const cx = i * PANEL_W
      const label = this.add
        .text(cx + PANEL_W / 2, LOCKED_LABEL_Y, '敬请期待', {
          fontSize: '24px',
          fontFamily: activeArtFont().family,
          color: '#e8d9b0',
          align: 'center',
          stroke: '#2c1d0e',
          strokeThickness: 4,
          padding: { top: 8, bottom: 8 },
        })
        .setOrigin(0.5)
        .setAlpha(0.9)
      this.row.add(label)
      this.row.add(
        this.add
          .zone(cx, 0, PANEL_W, ART_H)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.flashLocked(LOCKED_LABEL[i - 1])),
      )
    }

    this.buildActionButtons()

    // Keyboard: Enter confirms once selected. Esc returns to slot select --
    // both are shortcuts alongside the visible buttons below, not a
    // replacement for them.
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.isSelected) this.confirm()
    })
    // 2026-07-09: SlotSelectScene is bypassed in the hackathon flow (see
    // LoginScene.enterGame) -- ESC now matches the "返回主菜单" button below
    // rather than dead-ending into an unreachable slot picker.
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SCENE.mainMenu))

    this.exposeHooks()
  }

  /**
   * "开始游戏" / "返回主菜单" -- added 2026-07-08 per
   * docs/reference/user-flow-refs/selectrole-original-buttons.png (a real
   * original-client screenshot showing both buttons at the bottom of this
   * exact screen). No original pixel art for these two specific buttons was
   * found: grepped the full decompiled string tables of both `OtherMat1.swf`
   * and the main SWF `打开我开始玩.swf` for "开始游戏"/"返回主菜单" -- the
   * only hit is an unrelated multiplayer-lobby debug trace string
   * ("301---开始游戏" in BaseMutiLevelListenering.as), and `GMain.as`'s
   * `showSelectRolw()` adds only the bare `SelectRole` sprite with no sibling
   * buttons. The docs/reference/zmxy-online-extracted/ Online dump (checked
   * as a secondary source per CLAUDE.md) also has no select-role category.
   * Falling back per brief: styled as a code-drawn rounded/gradient button
   * rhyming with this project's established red/gold chrome (worldmap
   * buttons, dialogue highlights) rather than the Flash-default
   * `button_generic_*` skins the MANIFEST calls out as visually unused by the
   * real game -- documented here as Adapted, not extracted, art.
   */
  private buildActionButtons(): void {
    this.buildActionButton(START_BTN_X, 150, '开始游戏', 0xd94f4f, 0x7a1414, () => this.startGame())
    this.buildActionButton(BACK_BTN_X, 130, '返回主菜单', 0xb23a3a, 0x5a1414, () => this.scene.start(SCENE.mainMenu))
  }

  private buildActionButton(cx: number, w: number, label: string, topColor: number, bottomColor: number, onClick: () => void): void {
    const h = 34
    const x = cx - w / 2
    const y = ACTION_BTN_Y - h / 2
    const g = this.add.graphics().setDepth(50)
    g.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1)
    g.fillRoundedRect(x, y, w, h, 10)
    g.lineStyle(2, 0xf2c65a, 0.95)
    g.strokeRoundedRect(x, y, w, h, 10)

    this.add
      .text(cx, ACTION_BTN_Y, label, {
        fontSize: '19px',
        fontFamily: activeArtFont().family,
        color: '#fff6df',
        stroke: '#4a0f0f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(51)

    const zone = this.add
      .zone(cx, ACTION_BTN_Y, w, h)
      .setDepth(52)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => g.setAlpha(0.85))
    zone.on('pointerout', () => g.setAlpha(1))
    zone.on('pointerdown', () => onClick())
  }

  private onPanel1Click(): void {
    if (!this.isSelected) {
      this.selectHero(1)
    } else {
      this.confirm()
    }
  }

  private selectHero(heroId: number): void {
    if (heroId !== 1) return // only 悟空 selectable this milestone
    this.selectedHero = heroId
    this.isSelected = true
    this.idleImg.setVisible(false)
    this.selectedImg.setVisible(true)
    this.badge.setVisible(true)
  }

  private flashLocked(name: string): void {
    const t = this.add
      .text(480, 468, `${name} 敬请期待`, { fontSize: '20px', fontFamily: activeArtFont().family, color: '#ffb26b' })
      .setOrigin(0.5)
      .setDepth(20)
    this.tweens.add({ targets: t, y: 448, alpha: 0, duration: 1100, onComplete: () => t.destroy() })
  }

  /** "开始游戏" button: always confirms with 悟空 (the only playable hero this
   * milestone), auto-selecting first if the player hasn't clicked his panel
   * yet -- see buildActionButtons() doc comment for why this exists
   * alongside the older click-portrait-twice/Enter flow. */
  private startGame(): void {
    this.selectHero(1)
    this.confirm()
  }

  private confirm(): void {
    const env = createNewSlotEnvelope({
      // 悟空 = heroId 1 (only selectable this milestone); persisted so a future
      // multi-hero battle scene can read the chosen hero from the save.
      progression: createProgression(this.selectedHero as HeroId),
      equipment: createEquipment(),
      inventory: createInventory(24),
    })
    writeSlot(shellStorage(), this.slot, env)
    this.registry.set(REG.activeSlot, this.slot)
    this.registry.set(REG.activeSave, env.save)
    this.registry.set(REG.loadedState, restoreGameState(env.save))
    this.registry.set(REG.origin, 'new')
    // S1: selecting a hero lands on the world-map hub, not straight into
    // battle (screen-fidelity-spec.md S1 -- 选人确认→WorldMapScene).
    this.scene.start(roomIdFromInvite(window.location.search) ? SCENE.coopLobby : SCENE.worldMap)
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.characterSelect
    w.__shellSelectHero = (id: number) => this.selectHero(id)
    w.__shellConfirm = () => this.confirm()
    w.__shellStartGame = () => this.startGame()
    w.__shellBackToMenu = () => this.scene.start(SCENE.mainMenu)
  }
}
