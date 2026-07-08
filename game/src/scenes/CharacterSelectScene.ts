import Phaser from 'phaser'
import { SCENE, REG, shellStorage } from './shellShared'
import { createNewSlotEnvelope, writeSlot, type SlotId } from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'
import { createProgression, type HeroId } from '../systems/progression'
import { createEquipment } from '../systems/equipment'
import { createInventory } from '../systems/inventory'

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
// visuals were in scope this pass.

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
// "敬请期待" affordance is honest (a real character exists, just not playable
// yet). Panel 4 ("???") is NOT in this list: AS3's SelectRole has no btn5 at
// all for it -- it's pure decoration (DefineSprite_1011, static, no button
// states, tasks/selectrole-saveslots-report.md §2), so any lock/label text on
// top of it was self-added and never existed in the original. Verdict
// 2026-07-08: removed -- the panel now renders exactly as baked into the
// idle/selected art with zero affordance, matching AS3's own zero
// interactivity there ("老玩家无感").
const LOCKED_PANELS = [1, 2, 3]
const LOCKED_LABEL = ['唐僧', '猪八戒', '沙僧']

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
  }

  create(): void {
    // Scene底色 matches the panel row's own ink black so the contain-fit
    // pillarbox reads as part of the artwork, not a visible letterbox seam.
    this.add.graphics().fillStyle(0x0b0a0d, 1).fillRect(0, 0, 960, 540)

    const scale = 540 / ART_H
    const offsetX = (960 - ART_W * scale) / 2
    this.row = this.add.container(offsetX, 0).setScale(scale)

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

    // Locked panels 2-4 (唐僧/猪八戒/沙僧): same "敬请期待" affordance as
    // before, restyled to sit flush in the full-bleed row (no boxed card
    // look). Panel 5 ("???") deliberately excluded -- see LOCKED_PANELS doc
    // comment above.
    for (const i of LOCKED_PANELS) {
      const cx = i * PANEL_W
      const label = this.add
        .text(cx + PANEL_W / 2, ART_H * 0.42, '敬请\n期待', {
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#e8d9b0',
          align: 'center',
          stroke: '#2c1d0e',
          strokeThickness: 4,
          lineSpacing: 6,
        })
        .setOrigin(0.5)
        .setAlpha(0.88)
      this.row.add(label)
      this.row.add(
        this.add
          .zone(cx, 0, PANEL_W, ART_H)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.flashLocked(LOCKED_LABEL[i - 1])),
      )
    }

    // Keyboard: Enter confirms once selected. Esc returns to slot select --
    // deliberately NOT a visible button (spec removes the bottom button bar
    // entirely; this is a keyboard-only escape hatch so the screen isn't a
    // dead end, invisible so it doesn't violate "无按钮条").
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.isSelected) this.confirm()
    })
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SCENE.slotSelect))

    this.exposeHooks()
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
      .text(480, 500, `${name} 敬请期待`, { fontSize: '20px', fontStyle: 'bold', color: '#ffb26b' })
      .setOrigin(0.5)
      .setDepth(20)
    this.tweens.add({ targets: t, y: 480, alpha: 0, duration: 1100, onComplete: () => t.destroy() })
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
    this.scene.start(SCENE.worldMap)
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.characterSelect
    w.__shellSelectHero = (id: number) => this.selectHero(id)
    w.__shellConfirm = () => this.confirm()
  }
}
