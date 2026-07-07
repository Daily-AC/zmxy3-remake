import Phaser from 'phaser'
import { TICK_MS } from '../systems/tick'
import {
  RoleData,
  ActionSpec,
  actionFrameTimings,
  actionDurationMs,
} from '../systems/roleData'
import {
  HeroConfig,
  HeroState,
  HeroEdges,
  NO_EDGES,
  advanceHero,
  initHeroState,
  makeHeroConfig,
} from '../systems/heroSim'
import roleRaw from '../data/roles/role1.json'

const roleData = roleRaw as unknown as RoleData

const TEX = 'role1_0'
const SCALE = 1.5
const GROUND_Y = 400
const MIN_X = 90
const MAX_X = 870
// Animations that repeat forever; everything else plays once and holds.
const LOOPING = new Set(['wait', 'wait2', 'walk', 'run'])
// TODO-verify: post-swing combo grace window is not documented; chosen for feel.
const COMBO_GRACE_MS = 220

/**
 * Battle slice scene. Owns rendering and input capture only — all game rules
 * live in the Phaser-independent `systems/` modules. The scene reads keyboard
 * edges each frame, hands them to `advanceHero`, and mirrors the resulting
 * state onto the sprite.
 */
export class BattleScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite
  private keys!: Record<'a' | 'd' | 'j' | 'k', Phaser.Input.Keyboard.Key>
  private heroState!: HeroState
  private heroConfig!: HeroConfig
  private hud!: Phaser.GameObjects.Text
  /** Debug-injected edges (from playwright), merged into the next frame. */
  private injected: HeroEdges = { ...NO_EDGES }

  constructor() {
    super('battle')
  }

  preload(): void {
    this.load.spritesheet(TEX, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
  }

  create(): void {
    this.registerAnimations()

    // Ground reference line.
    const g = this.add.graphics()
    g.lineStyle(2, 0x2a3358, 1)
    g.lineBetween(0, GROUND_Y + 70, 960, GROUND_Y + 70)

    this.hero = this.add.sprite(480, GROUND_Y, TEX).setScale(SCALE)
    this.applyRender('wait')

    const kb = this.input.keyboard!
    this.keys = {
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    }

    this.heroConfig = makeHeroConfig({
      groundY: GROUND_Y,
      minX: MIN_X,
      maxX: MAX_X,
      comboStageDurationsMs: this.comboStageDurations(),
      comboGraceMs: COMBO_GRACE_MS,
    })
    this.heroState = initHeroState(this.heroConfig, 480)

    this.hud = this.add.text(16, 16, '', {
      fontSize: '15px',
      color: '#8a93b8',
      fontFamily: 'monospace',
    })
    this.add
      .text(480, 508, 'A/D 走（双击跑）　K 跳（可二段）　J 五段连击', {
        fontSize: '17px',
        color: '#8a93b8',
      })
      .setOrigin(0.5)

    this.exposeDebugHooks()
  }

  private registerAnimations(): void {
    for (const [name, spec] of Object.entries(roleData.actions)) {
      const frames = actionFrameTimings(roleData.sheet, spec as ActionSpec, TICK_MS).map(
        (t) => ({ key: TEX, frame: t.index, duration: t.durationMs }),
      )
      this.anims.create({
        key: name,
        frames,
        repeat: LOOPING.has(name) ? -1 : 0,
      })
    }
  }

  private comboStageDurations(): number[] {
    const dur = (a: string): number =>
      actionDurationMs(roleData.actions[a] as ActionSpec, TICK_MS)
    // Index 0 unused; stages 1..5 map to hit1..hit5.
    return [0, dur('hit1'), dur('hit2'), dur('hit3'), dur('hit4'), dur('hit5')]
  }

  update(_time: number, delta: number): void {
    const edges = this.collectEdges()
    advanceHero(this.heroState, edges, delta, this.heroConfig)
    this.applyRender(this.heroState.action)
    this.updateHud()
  }

  private collectEdges(): HeroEdges {
    const k = this.keys
    const edges: HeroEdges = {
      pressLeft: Phaser.Input.Keyboard.JustDown(k.a) || this.injected.pressLeft,
      releaseLeft: Phaser.Input.Keyboard.JustUp(k.a) || this.injected.releaseLeft,
      pressRight: Phaser.Input.Keyboard.JustDown(k.d) || this.injected.pressRight,
      releaseRight: Phaser.Input.Keyboard.JustUp(k.d) || this.injected.releaseRight,
      pressJump: Phaser.Input.Keyboard.JustDown(k.k) || this.injected.pressJump,
      pressAttack: Phaser.Input.Keyboard.JustDown(k.j) || this.injected.pressAttack,
    }
    this.injected = { ...NO_EDGES }
    return edges
  }

  private applyRender(action: string): void {
    if (this.hero.anims.currentAnim?.key !== action) this.hero.play(action)
    // Art faces left; flip when facing right.
    this.hero.setFlipX(this.heroState?.facing === 1)
    const off = roleData.offset
    this.hero.setPosition(
      this.heroState ? this.heroState.x + off.x * SCALE : 480,
      (this.heroState ? this.heroState.vertical.y : GROUND_Y) + off.y * SCALE,
    )
  }

  private updateHud(): void {
    const s = this.heroState
    this.hud.setText(
      [
        `action: ${s.action}`,
        `x: ${s.x.toFixed(0)}  y: ${s.vertical.y.toFixed(0)}  vy: ${s.vertical.vy.toFixed(1)}`,
        `grounded: ${s.vertical.grounded}  jumps: ${s.vertical.jumpCount}`,
        `combo: ${s.combo.stage}  running: ${s.move.running}`,
      ].join('\n'),
    )
  }

  /** Deterministic input + state hooks for automated verification. */
  private exposeDebugHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__scene = this
    w.__inject = (edge: keyof HeroEdges) => {
      this.injected[edge] = true
    }
    w.__heroState = () => ({
      action: this.heroState.action,
      x: this.heroState.x,
      y: this.heroState.vertical.y,
      vy: this.heroState.vertical.vy,
      grounded: this.heroState.vertical.grounded,
      jumpCount: this.heroState.vertical.jumpCount,
      comboStage: this.heroState.combo.stage,
      running: this.heroState.move.running,
      facing: this.heroState.facing,
    })
  }
}
