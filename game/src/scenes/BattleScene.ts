import Phaser from 'phaser'
import { TICK_MS } from '../systems/tick'
import { RoleData, ActionSpec, actionFrameTimings, actionDurationMs } from '../systems/roleData'
import {
  HeroConfig,
  HeroState,
  HeroEdges,
  NO_EDGES,
  advanceHero,
  initHeroState,
  makeHeroConfig,
} from '../systems/heroSim'
import {
  MonsterConfig,
  MonsterState,
  MONSTER30_STATS,
  initMonster,
  advanceMonster,
} from '../systems/monsterSim'
import { heroAttackBox, centeredBox, overlaps } from '../systems/hitbox'
import { DropEntity, PickupConfig, DEFAULT_PICKUP_RADIUS, spawnDrop, stepDrops } from '../systems/pickup'
import { createInventory, addItem, listStacks, Inventory } from '../systems/inventory'
import { rollDrops } from '../systems/dropRoll'
import roleRaw from '../data/roles/role1.json'
import monsterRaw from '../data/monsters/monster30.json'

const roleData = roleRaw as unknown as RoleData
const monsterData = monsterRaw as unknown as RoleData

const HERO_TEX = 'role1_0'
const MON_TEX = 'monster30'
const HERO_SCALE = 1.5
const MON_SCALE = 1.5
const GROUND_Y = 400 // hero/monster sim centre-y; feet rest near GROUND_Y+70
const FLOOR_LINE = GROUND_Y + 70
const MIN_X = 90
const MAX_X = 1420 // wider than the viewport; camera follows the hero
const WORLD_W = 1520
const HERO_LOOP = new Set(['wait', 'wait2', 'walk', 'run'])
const MON_LOOP = new Set(['wait', 'walk'])
const MON_ANIM_PREFIX = 'm30_'
// TODO-verify: post-swing combo grace window is not documented; chosen for feel.
const COMBO_GRACE_MS = 220
// Per-stage melee damage. Placeholder pending the real getRealPower() formula
// (combat-rules-index.md: hit1-3 ≈ 2.0875*Hurt, hit4/5 higher). TODO-verify.
const STAGE_DAMAGE = [0, 30, 30, 35, 45, 60]
const MON_START_X = 900
const MON_RENDER_OFFSET_Y = 30 // monster cell is shorter; nudge feet to the floor

/**
 * Milestone-2 battle scene: parallax level, a Monster30 the hero can combo to
 * death, loot drops that auto-pickup into an inventory, and audio. All rules
 * live in Phaser-independent `systems/` modules; this scene renders them and
 * captures input.
 */
export class BattleScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite
  private monster!: Phaser.GameObjects.Sprite
  private keys!: Record<'a' | 'd' | 'j' | 'k', Phaser.Input.Keyboard.Key>
  private heroState!: HeroState
  private heroConfig!: HeroConfig
  private monsterState!: MonsterState
  private monsterConfig!: MonsterConfig
  private bgLayers: { img: Phaser.GameObjects.TileSprite; factor: number }[] = []
  private drops: DropEntity[] = []
  private dropSprites = new Map<DropEntity, Phaser.GameObjects.Container>()
  private pickupCfg!: PickupConfig
  private inventory: Inventory = createInventory(24)
  private hud!: Phaser.GameObjects.Text
  private invText!: Phaser.GameObjects.Text
  private mhpText!: Phaser.GameObjects.Text
  /** Hero attack ids whose connect-sfx already played, to avoid re-triggering. */
  private playedHitIds = new Set<number>()
  private bgmStarted = false
  private injected: HeroEdges = { ...NO_EDGES }

  constructor() {
    super('battle')
  }

  preload(): void {
    this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(MON_TEX, 'assets/extracted/level1/Monster30.png', {
      frameWidth: monsterData.sheet.cellW,
      frameHeight: monsterData.sheet.cellH,
    })
    for (const key of ['bg11', 'bg12', 'bg13', 'floorBg1']) {
      this.load.image(key, `assets/extracted/level1/${key}.png`)
    }
    const audio: Record<string, string> = {
      bgm: 'bg1.mp3',
      hit12: 'Role1_hit1AndHit2.mp3',
      hit34: 'Role1_hit3AndHit4.mp3',
      hit5: 'Role1_hit5.mp3',
      heroJump: 'Role1_jump.mp3',
      monHurt: 'BeattackByRole1.mp3',
      pickup: 'pickup.mp3',
    }
    for (const [key, file] of Object.entries(audio)) {
      this.load.audio(key, `assets/audio/${file}`)
    }
  }

  create(): void {
    this.buildBackground()
    this.registerAnimations(roleData, HERO_TEX, HERO_LOOP, '')
    this.registerAnimations(monsterData, MON_TEX, MON_LOOP, MON_ANIM_PREFIX)

    this.hero = this.add.sprite(480, GROUND_Y, HERO_TEX).setScale(HERO_SCALE).setDepth(10)
    this.monster = this.add.sprite(MON_START_X, GROUND_Y, MON_TEX).setScale(MON_SCALE).setDepth(9)

    this.cameras.main.setBounds(0, 0, WORLD_W, 540)
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1)

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
    this.setupMonster()

    this.pickupCfg = {
      gravity: 2,
      groundY: GROUND_Y,
      pickupRadius: DEFAULT_PICKUP_RADIUS,
      tickMs: TICK_MS,
    }

    this.buildHud()
    this.applyHeroRender('wait')
    this.applyMonsterRender()
    this.startAudioOnFirstInput()
    this.exposeDebugHooks()
  }

  private buildBackground(): void {
    // Depth-ordered parallax layers, each a TileSprite covering the viewport so
    // the wide panorama textures scroll horizontally as the camera moves.
    const layers: [string, number, number][] = [
      // key, depth, parallax factor (far -> near)
      ['bg13', -40, 0.15],
      ['bg12', -30, 0.3],
      ['bg11', -20, 0.55],
    ]
    for (const [key, depth, factor] of layers) {
      const ts = this.add
        .tileSprite(0, 0, 960, 540, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth)
      this.bgLayers.push({ img: ts, factor })
    }
    // Floor strip pinned to the bottom, aligned so its top meets the walk line.
    const floor = this.add
      .tileSprite(0, FLOOR_LINE, 960, 540 - FLOOR_LINE, 'floorBg1')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10)
    this.bgLayers.push({ img: floor, factor: 1 })
    const line = this.add.graphics().setScrollFactor(0).setDepth(-9)
    line.lineStyle(2, 0x1a2140, 0.6)
    line.lineBetween(0, FLOOR_LINE, 960, FLOOR_LINE)
  }

  private registerAnimations(data: RoleData, tex: string, loop: Set<string>, prefix: string): void {
    for (const [name, spec] of Object.entries(data.actions)) {
      const frames = actionFrameTimings(data.sheet, spec as ActionSpec, TICK_MS).map((t) => ({
        key: tex,
        frame: t.index,
        duration: t.durationMs,
      }))
      this.anims.create({ key: prefix + name, frames, repeat: loop.has(name) ? -1 : 0 })
    }
  }

  private comboStageDurations(): number[] {
    const dur = (a: string): number => actionDurationMs(roleData.actions[a] as ActionSpec, TICK_MS)
    return [0, dur('hit1'), dur('hit2'), dur('hit3'), dur('hit4'), dur('hit5')]
  }

  private setupMonster(): void {
    const dur = (a: string): number =>
      actionDurationMs(monsterData.actions[a] as ActionSpec, TICK_MS)
    this.monsterConfig = {
      stats: MONSTER30_STATS,
      patrolMin: 760,
      patrolMax: 1360,
      hurtDurationMs: dur('hurt'),
      attackDurationMs: dur('hit1'),
      deadDurationMs: dur('dead'),
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      tickMs: TICK_MS,
      rng: Math.random,
    }
    this.monsterState = initMonster(this.monsterConfig, MON_START_X, GROUND_Y)
  }

  private buildHud(): void {
    this.hud = this.add
      .text(16, 12, '', { fontSize: '14px', color: '#8a93b8', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.mhpText = this.add
      .text(16, 92, '', { fontSize: '14px', color: '#e08a8a', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.invText = this.add
      .text(760, 12, '', { fontSize: '14px', color: '#c8d0f0', fontFamily: 'monospace', align: 'right' })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
    this.add
      .text(480, 512, 'A/D 走（双击跑）　K 跳　J 五段连击　走近掉落自动拾取', {
        fontSize: '15px',
        color: '#8a93b8',
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5)
  }

  update(_time: number, delta: number): void {
    const edges = this.collectEdges()
    const jumped = edges.pressJump && this.heroState.vertical.grounded
    advanceHero(this.heroState, edges, delta, this.heroConfig)
    if (jumped) this.playSfx('heroJump', 0.4)

    const hit = this.resolveHeroHit()
    const events = advanceMonster(
      this.monsterState,
      { heroX: this.heroState.x, heroAlive: true, incomingHit: hit },
      delta,
      this.monsterConfig,
    )
    this.handleMonsterEvents(events)
    this.stepDropsAndPickup()

    this.applyHeroRender(this.heroState.action)
    this.applyMonsterRender()
    this.updateHud()
    this.updateParallax()
  }

  /** Compute the hero's melee hit on the monster this frame, if any. */
  private resolveHeroHit(): { attackId: number; damage: number } | null {
    const s = this.heroState
    if (s.combo.stage === 0) return null
    if (this.monsterState.mode === 'dead' || this.monsterState.mode === 'gone') return null
    const box = heroAttackBox(s.x, GROUND_Y, s.facing)
    const mBox = centeredBox(this.monsterState.x, GROUND_Y, 120, 140)
    if (!overlaps(box, mBox)) return null
    const damage = STAGE_DAMAGE[s.combo.stage]
    if (!this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.playSfx(this.hitSfxKey(s.combo.stage), 0.5)
    }
    return { attackId: s.attackId, damage }
  }

  private hitSfxKey(stage: number): string {
    if (stage <= 2) return 'hit12'
    if (stage <= 4) return 'hit34'
    return 'hit5'
  }

  private handleMonsterEvents(events: { type: string; x: number; y: number }[]): void {
    for (const e of events) {
      if (e.type === 'hurt') this.playSfx('monHurt', 0.6)
      else if (e.type === 'death') this.spawnDrops(e.x, e.y)
    }
  }

  private spawnDrops(x: number, y: number): void {
    const rolled = rollDrops('monster30', Math.random)
    for (const { item, qty } of rolled) {
      const drop = spawnDrop(item, qty, x, y)
      this.drops.push(drop)
      this.dropSprites.set(drop, this.makeDropSprite(drop))
    }
  }

  private makeDropSprite(drop: DropEntity): Phaser.GameObjects.Container {
    const rarityColor = [0x9fb0c8, 0x5fd6a0, 0x6ba8ff, 0xd9a441][drop.item.rarity] ?? 0x9fb0c8
    const gem = this.add.star(0, 0, 4, 6, 13, rarityColor).setStrokeStyle(2, 0xffffff, 0.7)
    const label = this.add
      .text(0, 20, `${drop.item.name}${drop.qty > 1 ? ' ×' + drop.qty : ''}`, {
        fontSize: '12px',
        color: '#e8ecff',
      })
      .setOrigin(0.5, 0)
    return this.add.container(drop.x, drop.y, [gem, label]).setDepth(8)
  }

  private stepDropsAndPickup(): void {
    const { remaining, picked } = stepDrops(this.drops, this.heroState.x, GROUND_Y, this.pickupCfg)
    // Remove collected drop sprites.
    for (const d of this.drops) {
      if (!remaining.includes(d)) {
        this.dropSprites.get(d)?.destroy()
        this.dropSprites.delete(d)
      }
    }
    this.drops = remaining
    for (const d of this.drops) this.dropSprites.get(d)?.setPosition(d.x, d.y)
    if (picked.length > 0) {
      for (const { item, qty } of picked) addItem(this.inventory, item, qty)
      this.playSfx('pickup', 0.7)
    }
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

  private applyHeroRender(action: string): void {
    if (this.hero.anims.currentAnim?.key !== action) this.hero.play(action)
    this.hero.setFlipX(this.heroState.facing === 1)
    const off = roleData.offset
    this.hero.setPosition(
      this.heroState.x + off.x * HERO_SCALE,
      this.heroState.vertical.y + off.y * HERO_SCALE,
    )
  }

  private applyMonsterRender(): void {
    if (this.monsterState.mode === 'gone') {
      this.monster.setVisible(false)
      return
    }
    const key = MON_ANIM_PREFIX + this.monsterState.action
    if (this.monster.anims.currentAnim?.key !== key) this.monster.play(key)
    // Art faces left; flip when facing right.
    this.monster.setFlipX(this.monsterState.facing === 1)
    const off = monsterData.offset
    this.monster.setPosition(
      this.monsterState.x + off.x * MON_SCALE,
      this.monsterState.y + MON_RENDER_OFFSET_Y + off.y * MON_SCALE,
    )
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX
    for (const { img, factor } of this.bgLayers) {
      img.tilePositionX = camX * factor
    }
  }

  private updateHud(): void {
    const s = this.heroState
    this.hud.setText(
      [
        `action: ${s.action}  combo: ${s.combo.stage}`,
        `x: ${s.x.toFixed(0)}  grounded: ${s.vertical.grounded}  jumps: ${s.vertical.jumpCount}`,
        `running: ${s.move.running}  facing: ${s.facing === 1 ? 'right' : 'left'}`,
      ].join('\n'),
    )
    const m = this.monsterState
    this.mhpText.setText(`Monster30  hp: ${m.hp}/${MONSTER30_STATS.hp}  ${m.mode}`)
    const stacks = listStacks(this.inventory)
    const body = stacks.length
      ? stacks.map((st) => `${st.item.name} ×${st.qty}`).join('\n')
      : '(空)'
    this.invText.setText('背包\n' + body)
  }

  private startAudioOnFirstInput(): void {
    const start = (): void => {
      if (this.bgmStarted) return
      this.bgmStarted = true
      this.sound.add('bgm', { loop: true, volume: 0.35 }).play()
    }
    this.input.keyboard?.once('keydown', start)
    this.input.once('pointerdown', start)
  }

  private playSfx(key: string, volume: number): void {
    if (this.sound.locked) return
    this.sound.play(key, { volume })
  }

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
      attackId: this.heroState.attackId,
    })
    w.__worldState = () => ({
      monster: {
        x: this.monsterState.x,
        hp: this.monsterState.hp,
        mode: this.monsterState.mode,
        action: this.monsterState.action,
      },
      drops: this.drops.map((d) => ({ id: d.item.id, x: Math.round(d.x), grounded: d.grounded })),
      inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
    })
    // Teleport the hero next to the monster (verification convenience only).
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
  }
}
