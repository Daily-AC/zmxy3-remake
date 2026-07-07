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
import type { Item } from '../systems/items'
import {
  Equipment,
  EquipSlot,
  createEquipment,
  equip,
  unequip,
  equippedList,
  slotForItem,
  heroAtk,
  comboHitDamage,
} from '../systems/equipment'
import { rollOnHitProcs } from '../systems/effects'
import {
  NpcClient,
  ConnStatus,
  ServerMessage,
  NpcItem,
  CraftedItem,
  CraftEffect,
  resolveNpcServerUrl,
} from '../net/npcClient'
import { DialogueBox } from '../ui/DialogueBox'
import roleRaw from '../data/roles/role1.json'
import monsterRaw from '../data/monsters/monster30.json'

const roleData = roleRaw as unknown as RoleData
const monsterData = monsterRaw as unknown as RoleData

const HERO_TEX = 'role1_0'
// Weapon overlay sheet: same 200×200 grid + same action frames as role1_0, with
// ZERO offset (art-verified: the grip lands in the fist). Only 8 weapon skins
// exist (EQUIP_6/7 are absent in every pack); Stage A uses the default EQUIP_0.
const WEAPON_TEX = 'role1_equip0'
const HERO_MAX_HP = 500
const HERO_BASE_ATK = 20 // nominal base for the atk readout; combo damage uses STAGE_DAMAGE + equip atk
const MONSTER_TOUCH_DMG = 14 // light chip so lifesteal has something to heal back
const BURN_TICKS = 4
const BURN_INTERVAL_MS = 260
const FREEZE_MS = 1200
const NPC_TEX = 'laojun'
const MON_TEX = 'monster30'
const HERO_SCALE = 1.5
const NPC_SCALE = 1.0
const MON_SCALE = 1.5
// 太上老君 sheet: 1800×2100, 6 cols × 7 rows of 300px (12.swf Monster65 boss).
const NPC_CELL = 300
const NPC_WAIT_FRAMES = 6 // row 0 = idle
const NPC_IDLE_FRAME_MS = 130
const NPC_OFFSET = { x: -10, y: -30 }
const GROUND_Y = 400
const FLOOR_LINE = GROUND_Y + 70
const MIN_X = 90
const MAX_X = 1460
const WORLD_W = 1560
const HERO_LOOP = new Set(['wait', 'wait2', 'walk', 'run'])
const MON_LOOP = new Set(['wait', 'walk'])
const MON_ANIM_PREFIX = 'm30_'
const NPC_ANIM_PREFIX = 'npc_'
const COMBO_GRACE_MS = 220
const STAGE_DAMAGE = [0, 30, 30, 35, 45, 60] // TODO-verify (see combat notes)
const MON_START_X = 900
const MON_RENDER_OFFSET_Y = 30
const NPC_ID = 'laojun'
const NPC_NAME = '太上老君'
const NPC_X = 1380
const DIALOGUE_RANGE = 120
const MONSTER_DISPLAY_NAME = '云头妖鸟'

// Item kind coming from the NPC brain -> the game's item kind vocabulary.
function npcKindToGameKind(k: NpcItem['kind'] | 'equip'): Item['kind'] {
  if (k === 'equipment' || k === 'equip') return 'equip'
  if (k === 'consumable') return 'consumable'
  return 'material' // material, quest
}

type CraftedGameItem = Item & { effects?: CraftEffect[] }

/**
 * Milestone-3 battle scene: parallax level, a Monster30 the hero combos to
 * death with loot -> inventory, and an LLM-driven NPC (太上老君) the player can
 * walk up to and talk with over WebSocket. All game rules live in the
 * Phaser-independent `systems/` and `net/` modules; this scene renders them.
 */
export class BattleScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite
  private monster!: Phaser.GameObjects.Sprite
  private npc!: Phaser.GameObjects.Sprite
  private keys!: Record<'a' | 'd' | 'j' | 'k', Phaser.Input.Keyboard.Key>
  private heroState!: HeroState
  private heroConfig!: HeroConfig
  private monsterState!: MonsterState
  private monsterConfig!: MonsterConfig
  // Parallax: tilesprites that scroll via tilePositionX. The far base backdrop
  // (bg11) and ground are covering Images (auto-parallax via scrollFactor).
  private bgTiles: { img: Phaser.GameObjects.TileSprite; factor: number }[] = []
  private drops: DropEntity[] = []
  private dropSprites = new Map<DropEntity, Phaser.GameObjects.Container>()
  private pickupCfg!: PickupConfig
  private inventory: Inventory = createInventory(24)
  private invText!: Phaser.GameObjects.Text
  // Debug telemetry, hidden by default, toggled with F1.
  private debugTexts: Phaser.GameObjects.Text[] = []
  private debugVisible = false
  private hud!: Phaser.GameObjects.Text
  private mhpText!: Phaser.GameObjects.Text
  private playedHitIds = new Set<number>()
  private bgmStarted = false
  private injected: HeroEdges = { ...NO_EDGES }

  // NPC / dialogue
  private npcClient!: NpcClient
  private npcStatus: ConnStatus = 'closed'
  private npcTag!: Phaser.GameObjects.Text
  private promptText!: Phaser.GameObjects.Text
  private dialogue!: DialogueBox
  private dialogueFresh = true
  private toast?: Phaser.GameObjects.Text

  // Equipment / hero combat state
  private equipment: Equipment = createEquipment()
  private weaponSprite!: Phaser.GameObjects.Sprite
  private heroHp = HERO_MAX_HP
  private statsText!: Phaser.GameObjects.Text
  private heroHpBar!: Phaser.GameObjects.Graphics
  // onHit effect state, applied scene-side without touching the locked
  // monsterSim/combo modules.
  private burn: { ticksLeft: number; nextAtMs: number; power: number } | null = null
  private burnAttackId = 100000 // kept clear of hero attackIds (which start at 1)
  private frozenUntilMs = 0
  private simClockMs = 0

  constructor() {
    super('battle')
  }

  preload(): void {
    this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(WEAPON_TEX, 'assets/extracted/role1_equip0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(NPC_TEX, 'assets/extracted/npc/laojun_sheet.png', {
      frameWidth: NPC_CELL,
      frameHeight: NPC_CELL,
    })
    this.load.spritesheet(MON_TEX, 'assets/extracted/level1/Monster30.png', {
      frameWidth: monsterData.sheet.cellW,
      frameHeight: monsterData.sheet.cellH,
    })
    for (const key of ['bg11', 'bg12', 'bg13', 'floorBg1']) {
      this.load.image(key, `assets/extracted/level1/${key}.png`)
    }
    this.load.image('ink_panel', 'assets/extracted/ui/dialogue_textpanel_crop.png')
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
    this.registerNpcIdle()

    this.hero = this.add.sprite(480, GROUND_Y, HERO_TEX).setScale(HERO_SCALE).setDepth(10)
    // Weapon overlay: frame-perfect mirror of the hero, shown only when armed.
    this.weaponSprite = this.add
      .sprite(480, GROUND_Y, WEAPON_TEX)
      .setScale(HERO_SCALE)
      .setDepth(11)
      .setVisible(false)
    this.monster = this.add.sprite(MON_START_X, GROUND_Y, MON_TEX).setScale(MON_SCALE).setDepth(9)
    this.npc = this.add
      .sprite(NPC_X + NPC_OFFSET.x * NPC_SCALE, GROUND_Y + NPC_OFFSET.y * NPC_SCALE, NPC_TEX)
      .setScale(NPC_SCALE)
      .setDepth(9)
    this.npc.play(NPC_ANIM_PREFIX + 'wait')

    this.cameras.main.setBounds(0, 0, WORLD_W, 540)
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1)

    const kb = this.input.keyboard!
    this.keys = {
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    }
    kb.on('keydown-W', () => this.tryOpenDialogue())
    kb.on('keydown-UP', () => this.tryOpenDialogue())
    kb.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault()
      this.debugVisible = !this.debugVisible
      for (const t of this.debugTexts) t.setVisible(this.debugVisible)
    })
    // E: equip the first equippable item in the bag. U: take the weapon off.
    kb.on('keydown-E', () => this.equipFirstFromBag())
    kb.on('keydown-U', () => this.doUnequip('weapon'))

    this.heroConfig = makeHeroConfig({
      groundY: GROUND_Y,
      minX: MIN_X,
      maxX: MAX_X,
      comboStageDurationsMs: this.comboStageDurations(),
      comboGraceMs: COMBO_GRACE_MS,
    })
    this.heroState = initHeroState(this.heroConfig, 480)
    this.setupMonster()

    this.pickupCfg = { gravity: 2, groundY: GROUND_Y, pickupRadius: DEFAULT_PICKUP_RADIUS, tickMs: TICK_MS }

    this.buildHud()
    this.buildDialogue()
    this.applyHeroRender('wait')
    this.applyMonsterRender(false)
    this.startAudioOnFirstInput()
    this.connectNpc()
    this.exposeDebugHooks()
  }

  private buildBackground(): void {
    // Layering (fixing the old right-edge seam): bg11 is the OPAQUE base scene
    // (palace on clouds, 1132×3051) — the old code tiled it as a narrow front
    // layer, which wrapped and produced the seam while also hiding the detail
    // layers. It is now a slow covering Image behind everything. bg13 (南天门
    // gate panorama) and bg12 (lotus railing) are TRANSPARENT 4900px-wide
    // panoramas that parallax on top and never wrap within the camera's range.
    this.add
      .image(0, 0, 'bg11')
      .setOrigin(0, 0)
      .setScrollFactor(0.12, 0) // 1132px covers the 960 viewport across the pan
      .setDepth(-40)
    for (const [key, depth, factor] of [
      ['bg13', -30, 0.28],
      ['bg12', -20, 0.5],
    ] as [string, number, number][]) {
      const ts = this.add.tileSprite(0, 0, 960, 540, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth)
      this.bgTiles.push({ img: ts, factor })
    }
    // Ground band: a covering Image scaled to span the whole world width so it
    // never wraps at the right edge either.
    const floor = this.add.image(0, FLOOR_LINE, 'floorBg1').setOrigin(0, 0).setScrollFactor(0.9, 0).setDepth(-10)
    floor.scaleX = Math.max(1, (960 + (WORLD_W - 960) * 0.9 + 40) / floor.width)
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

  /**
   * 太上老君 idle loop from row 0 of the boss sheet. No initBBDC stopCounts
   * exist for this repurposed boss art, so use a uniform slow per-frame duration.
   */
  private registerNpcIdle(): void {
    const frames = []
    for (let i = 0; i < NPC_WAIT_FRAMES; i++) {
      frames.push({ key: NPC_TEX, frame: i, duration: NPC_IDLE_FRAME_MS })
    }
    this.anims.create({ key: NPC_ANIM_PREFIX + 'wait', frames, repeat: -1 })
  }

  private comboStageDurations(): number[] {
    const dur = (a: string): number => actionDurationMs(roleData.actions[a] as ActionSpec, TICK_MS)
    return [0, dur('hit1'), dur('hit2'), dur('hit3'), dur('hit4'), dur('hit5')]
  }

  private setupMonster(): void {
    const dur = (a: string): number => actionDurationMs(monsterData.actions[a] as ActionSpec, TICK_MS)
    this.monsterConfig = {
      stats: MONSTER30_STATS,
      patrolMin: 720,
      patrolMax: 1120,
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
    // Debug telemetry — hidden by default, F1 toggles. Acceptance hooks
    // (__heroState/__worldState) are unaffected; this is only on-screen text.
    this.hud = this.add
      .text(16, 12, '', { fontSize: '14px', color: '#8a93b8', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false)
    this.mhpText = this.add
      .text(16, 92, '', { fontSize: '14px', color: '#e08a8a', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false)
    this.debugTexts.push(this.hud, this.mhpText)

    // Inventory strip: a semi-transparent dark plate so white text reads over
    // the bright clouds.
    this.add
      .rectangle(958, 10, 190, 92, 0x0c0d12, 0.5)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(99)
    this.invText = this.add
      .text(778, 18, '', { fontSize: '14px', color: '#e8ecff', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.add
      .text(480, 520, 'A/D 走　K 跳　J 五段连击　W/↑ 对话　E 穿戴 U 卸下　F1 调试', {
        fontSize: '13px',
        color: '#c8cfe6',
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5)

    // Hero stat panel (top-left): HP bar + current attack + equipped weapon.
    this.add.rectangle(12, 10, 260, 68, 0x0c0d12, 0.5).setOrigin(0, 0).setScrollFactor(0).setDepth(99)
    this.heroHpBar = this.add.graphics().setScrollFactor(0).setDepth(100)
    this.statsText = this.add
      .text(22, 46, '', { fontSize: '13px', color: '#e8ecff' })
      .setScrollFactor(0)
      .setDepth(100)

    // NPC name tag (world-space, above the NPC).
    this.npcTag = this.add
      .text(NPC_X, GROUND_Y - 150, NPC_NAME, { fontSize: '16px', color: '#d9c07a' })
      .setOrigin(0.5)
      .setDepth(20)
    this.promptText = this.add
      .text(NPC_X, GROUND_Y - 125, '↑ 对话', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false)
  }

  private buildDialogue(): void {
    this.dialogue = new DialogueBox(this, {
      npcName: NPC_NAME,
      avatarTexture: NPC_TEX,
      avatarSheetFrame: 0,
      // Head region within 老君's 300×300 idle frame 0.
      avatarCrop: { x: 96, y: 30, w: 150, h: 150 },
      onSubmit: (text) => {
        this.dialogue.pushLog(`悟空：${text}`)
        this.npcClient.playerSay(NPC_ID, text, 'p1')
      },
      onClose: () => {
        this.input.keyboard!.enabled = true
      },
    })
  }

  private connectNpc(): void {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const url = resolveNpcServerUrl(window.location.search, env?.VITE_NPC_SERVER_URL)
    this.npcClient = new NpcClient({
      url,
      player: { id: 'p1', name: '悟空' },
    })
    this.npcClient.onStatus = (s) => {
      this.npcStatus = s
    }
    this.npcClient.onMessage = (m) => this.onNpcMessage(m)
    this.npcClient.connect()
  }

  private onNpcMessage(m: ServerMessage): void {
    switch (m.type) {
      case 'welcome':
        break
      case 'npc_thinking':
        this.dialogue.pushLog('（老君捻须思索…）')
        break
      case 'npc_say':
        this.dialogue.startTypewriter(`${NPC_NAME}：${m.text}`)
        break
      case 'give_item':
        this.receiveItem(this.npcItemToGame(m.item), m.item.qty ?? 1)
        break
      case 'craft_item':
        this.receiveItem(this.craftedToGame(m.item), 1)
        break
      case 'set_goal':
        this.showToast(`新目标：${m.goal.title}`, '#7ac7ff')
        break
      case 'error':
        break
    }
  }

  private npcItemToGame(item: NpcItem): Item {
    return { id: item.id, name: item.name, kind: npcKindToGameKind(item.kind), rarity: 1 }
  }

  private craftedToGame(item: CraftedItem): CraftedGameItem {
    return {
      id: item.id,
      name: item.name,
      kind: 'equip',
      rarity: item.rarity,
      effects: item.effects,
    }
  }

  private receiveItem(item: Item, qty: number): void {
    addItem(this.inventory, item, qty)
    this.showToast(`获得【${item.name}】`, '#ffd873')
    this.playSfx('pickup', 0.7)
  }

  update(_time: number, delta: number): void {
    this.simClockMs += delta
    const edges = this.collectEdges()
    const jumped = edges.pressJump && this.heroState.vertical.grounded
    advanceHero(this.heroState, edges, delta, this.heroConfig)
    if (jumped) this.playSfx('heroJump', 0.4)

    const monsterAlive = this.monsterState.mode !== 'dead' && this.monsterState.mode !== 'gone'
    // A single incoming-hit channel: prefer the hero's melee hit; otherwise let
    // a due burn tick ride it (deferred a frame when they collide).
    let incomingHit = this.resolveHeroHit()
    if (!incomingHit && monsterAlive && this.burn && this.simClockMs >= this.burn.nextAtMs) {
      incomingHit = { attackId: ++this.burnAttackId, damage: this.burn.power }
      this.burn.ticksLeft -= 1
      this.burn.nextAtMs = this.simClockMs + BURN_INTERVAL_MS
      this.floatText(this.monsterState.x, GROUND_Y - 70, `烧 -${this.burn.power}`, '#ff7a4d')
      if (this.burn.ticksLeft <= 0) this.burn = null
    }
    // Freeze = a heavy slow (keeps hit resolution working, unlike a hard skip).
    const frozen = this.simClockMs < this.frozenUntilMs
    const events = advanceMonster(
      this.monsterState,
      { heroX: this.heroState.x, heroAlive: true, incomingHit },
      frozen ? delta * 0.15 : delta,
      this.monsterConfig,
    )
    this.handleMonsterEvents(events)
    this.stepDropsAndPickup()

    this.applyHeroRender(this.heroState.action)
    this.applyMonsterRender(frozen)
    this.updateHud()
    this.updateParallax()
    this.updateNpcUi()
    this.dialogue.advanceTypewriter()
  }

  private resolveHeroHit(): { attackId: number; damage: number } | null {
    const s = this.heroState
    if (s.combo.stage === 0) return null
    if (this.monsterState.mode === 'dead' || this.monsterState.mode === 'gone') return null
    const box = heroAttackBox(s.x, GROUND_Y, s.facing)
    const mBox = centeredBox(this.monsterState.x, GROUND_Y, 120, 140)
    if (!overlaps(box, mBox)) return null
    // First frame this swing connects: play sfx and roll the weapon's onHit procs.
    if (!this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.playSfx(this.hitSfxKey(s.combo.stage), 0.5)
      this.rollHitProcs()
    }
    return { attackId: s.attackId, damage: comboHitDamage(STAGE_DAMAGE[s.combo.stage], this.equipment) }
  }

  private rollHitProcs(): void {
    for (const p of rollOnHitProcs(equippedList(this.equipment), Math.random)) {
      if (p.effect === 'lifesteal') this.applyLifesteal(p.power)
      else if (p.effect === 'burn') this.burn = { ticksLeft: BURN_TICKS, nextAtMs: this.simClockMs, power: p.power }
      else if (p.effect === 'freeze') this.frozenUntilMs = this.simClockMs + FREEZE_MS
    }
  }

  private applyLifesteal(power: number): void {
    const before = this.heroHp
    this.heroHp = Math.min(HERO_MAX_HP, this.heroHp + power)
    const healed = this.heroHp - before
    this.floatText(this.heroState.x, GROUND_Y - 90, `+${healed || power}`, '#6ef07a')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(120, () => this.hero.clearTint())
  }

  private hitSfxKey(stage: number): string {
    if (stage <= 2) return 'hit12'
    if (stage <= 4) return 'hit34'
    return 'hit5'
  }

  private handleMonsterEvents(events: { type: string; x: number; y: number }[]): void {
    for (const e of events) {
      if (e.type === 'hurt') this.playSfx('monHurt', 0.6)
      else if (e.type === 'attack-start') this.monsterHitsHero()
      else if (e.type === 'death') {
        this.spawnDrops(e.x, e.y)
        this.npcClient.worldEvent('monster_killed', { monster: MONSTER_DISPLAY_NAME })
      }
    }
  }

  // Light chip damage so lifesteal has something to heal back (the full
  // hero-damage/death pass is a later slice; this just closes the equip loop).
  private monsterHitsHero(): void {
    if (Math.abs(this.heroState.x - this.monsterState.x) > MONSTER30_STATS.attackRange) return
    this.heroHp = Math.max(0, this.heroHp - MONSTER_TOUCH_DMG)
    this.floatText(this.heroState.x, GROUND_Y - 60, `-${MONSTER_TOUCH_DMG}`, '#ff5a5a')
    this.hero.setTint(0xff9a9a)
    this.time.delayedCall(120, () => this.hero.clearTint())
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontSize: '18px', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(30)
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 700, onComplete: () => t.destroy() })
  }

  private spawnDrops(x: number, y: number): void {
    for (const { item, qty } of rollDrops('monster30', Math.random)) {
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
    for (const d of this.drops) {
      if (!remaining.includes(d)) {
        this.dropSprites.get(d)?.destroy()
        this.dropSprites.delete(d)
      }
    }
    this.drops = remaining
    for (const d of this.drops) this.dropSprites.get(d)?.setPosition(d.x, d.y)
    if (picked.length > 0) {
      for (const { item, qty } of picked) {
        addItem(this.inventory, item, qty)
        this.npcClient.worldEvent('item_obtained', { item: item.name, qty })
      }
      this.playSfx('pickup', 0.7)
    }
  }

  private collectEdges(): HeroEdges {
    if (this.dialogue.isOpen) {
      this.injected = { ...NO_EDGES }
      return { ...NO_EDGES }
    }
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
    const px = this.heroState.x + off.x * HERO_SCALE
    const py = this.heroState.vertical.y + off.y * HERO_SCALE
    this.hero.setPosition(px, py)
    // Weapon overlay: frame-perfect mirror of the hero (zero offset), only armed.
    if (this.equipment.weapon) {
      this.weaponSprite.setVisible(true)
      this.weaponSprite.setFrame(this.hero.frame.name)
      this.weaponSprite.setFlipX(this.heroState.facing === 1)
      this.weaponSprite.setPosition(px, py)
    } else {
      this.weaponSprite.setVisible(false)
    }
  }

  private applyMonsterRender(frozen: boolean): void {
    if (this.monsterState.mode === 'gone') {
      this.monster.setVisible(false)
      return
    }
    const key = MON_ANIM_PREFIX + this.monsterState.action
    if (this.monster.anims.currentAnim?.key !== key) this.monster.play(key)
    this.monster.setFlipX(this.monsterState.facing === 1)
    // Elemental tints: freeze = blue, burn = red, otherwise normal.
    if (frozen) this.monster.setTint(0x8fc7ff)
    else if (this.burn) this.monster.setTint(0xff8a5a)
    else this.monster.clearTint()
    const off = monsterData.offset
    this.monster.setPosition(
      this.monsterState.x + off.x * MON_SCALE,
      this.monsterState.y + MON_RENDER_OFFSET_Y + off.y * MON_SCALE,
    )
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX
    for (const { img, factor } of this.bgTiles) img.tilePositionX = camX * factor
  }

  private updateHud(): void {
    const s = this.heroState
    this.hud.setText(
      [
        `action: ${s.action}  combo: ${s.combo.stage}`,
        `x: ${s.x.toFixed(0)}  grounded: ${s.vertical.grounded}  jumps: ${s.vertical.jumpCount}`,
        `NPC: ${this.npcStatusLabel()}`,
      ].join('\n'),
    )
    const m = this.monsterState
    this.mhpText.setText(`${MONSTER_DISPLAY_NAME}  hp: ${m.hp}/${MONSTER30_STATS.hp}  ${m.mode}`)
    const stacks = listStacks(this.inventory)
    const body = stacks.length ? stacks.map((st) => `${st.item.name} ×${st.qty}`).join('\n') : '(空)'
    this.invText.setText('背包\n' + body)

    // Hero HP bar + stats.
    const bar = this.heroHpBar
    bar.clear()
    bar.fillStyle(0x2a1414, 1).fillRoundedRect(22, 20, 200, 16, 4)
    const frac = this.heroHp / HERO_MAX_HP
    bar.fillStyle(0xd94a4a, 1).fillRoundedRect(22, 20, Math.max(2, 200 * frac), 16, 4)
    bar.lineStyle(1, 0xd9b45a, 0.8).strokeRoundedRect(22, 20, 200, 16, 4)
    const atk = heroAtk(HERO_BASE_ATK, this.equipment)
    const weaponName = this.equipment.weapon ? this.equipment.weapon.name : '空手'
    this.statsText.setText(`HP ${this.heroHp}/${HERO_MAX_HP}　攻击 ${atk}　武器: ${weaponName}`)
  }

  // ---------- equipment ----------

  private equipFirstFromBag(): void {
    const equipItem = listStacks(this.inventory)
      .map((s) => s.item)
      .find((it) => slotForItem(it) !== null)
    if (equipItem) this.doEquip(equipItem)
  }

  private doEquip(item: Item): boolean {
    if (!equip(this.equipment, this.inventory, item)) return false
    this.showToast(`装备【${item.name}】`, '#ffd873')
    return true
  }

  private doUnequip(slot: EquipSlot): boolean {
    const cur = this.equipment[slot]
    if (!unequip(this.equipment, this.inventory, slot)) return false
    this.showToast(`卸下【${cur?.name ?? ''}】`, '#c8cfe6')
    return true
  }

  private npcStatusLabel(): string {
    return this.npcClient?.isOpen() ? '在线' : '闭关中'
  }

  private updateNpcUi(): void {
    const online = this.npcClient.isOpen()
    this.npcTag.setText(online ? NPC_NAME : `${NPC_NAME}（闭关中）`)
    this.npcTag.setColor(online ? '#d9c07a' : '#7a7f95')
    const near = Math.abs(this.heroState.x - NPC_X) < DIALOGUE_RANGE
    this.promptText.setVisible(near && online && !this.dialogue.isOpen)
  }

  // ---------- dialogue ----------

  private tryOpenDialogue(): void {
    if (this.dialogue.isOpen) return
    if (Math.abs(this.heroState.x - NPC_X) >= DIALOGUE_RANGE) return
    if (!this.npcClient.isOpen()) {
      this.showToast(`${NPC_NAME}正在闭关…`, '#7a7f95')
      return
    }
    this.input.keyboard!.enabled = false // free the keyboard for the input box
    if (this.dialogueFresh) {
      this.dialogue.pushLog(`${NPC_NAME}：猴头，来炼丹房作甚？`)
      this.dialogueFresh = false
    }
    this.dialogue.open()
  }

  private showToast(text: string, color: string): void {
    this.toast?.destroy()
    const t = this.add
      .text(480, 200, text, { fontSize: '30px', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
    this.toast = t
    this.tweens.add({ targets: t, y: 160, alpha: 0, duration: 1800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() })
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
      grounded: this.heroState.vertical.grounded,
      comboStage: this.heroState.combo.stage,
      attackId: this.heroState.attackId,
      facing: this.heroState.facing,
    })
    w.__worldState = () => ({
      monster: { x: this.monsterState.x, hp: this.monsterState.hp, mode: this.monsterState.mode },
      drops: this.drops.map((d) => ({ id: d.item.id, x: Math.round(d.x), grounded: d.grounded })),
      inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
      heroHp: this.heroHp,
      atk: heroAtk(HERO_BASE_ATK, this.equipment),
      weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
      weaponVisible: this.weaponSprite.visible,
      frozen: this.simClockMs < this.frozenUntilMs,
      burning: this.burn !== null,
    })
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
    // Equipment acceptance hooks.
    w.__equip = (itemId?: string) => {
      const item = itemId
        ? listStacks(this.inventory).map((s) => s.item).find((it) => it.id === itemId)
        : listStacks(this.inventory).map((s) => s.item).find((it) => slotForItem(it) !== null)
      return item ? this.doEquip(item) : false
    }
    w.__unequip = () => this.doUnequip('weapon')
    w.__setHeroHp = (hp: number) => {
      this.heroHp = Math.max(0, Math.min(HERO_MAX_HP, hp))
    }
    w.__giveCraftedWeapon = () => {
      // A test weapon with atk + guaranteed lifesteal, mirroring an NPC craft.
      const it: Item = {
        id: 'test_chiyan',
        name: '赤炎噬血杖',
        kind: 'equip',
        rarity: 3,
        effects: [
          { type: 'stat', stat: 'atk', value: 45 },
          { type: 'onHit', effect: 'lifesteal', chance: 1, power: 25 },
        ],
      }
      addItem(this.inventory, it, 1)
    }
    w.__npc = () => ({
      status: this.npcStatus,
      online: this.npcClient.isOpen(),
      dialogueOpen: this.dialogue.isOpen,
      log: this.dialogue.logLines(),
    })
    // Drive a real conversation without touching the DOM input.
    w.__npcSay = (text: string) => {
      if (!this.dialogue.isOpen) this.tryOpenDialogue()
      if (!this.dialogue.isOpen) return false
      this.dialogue.pushLog(`悟空：${text}`)
      return this.npcClient.playerSay(NPC_ID, text, 'p1')
    }
    w.__npcOpen = () => this.tryOpenDialogue()
    w.__npcClose = () => this.dialogue.close()
    w.__toggleDebug = () => {
      this.debugVisible = !this.debugVisible
      for (const t of this.debugTexts) t.setVisible(this.debugVisible)
    }
  }
}
