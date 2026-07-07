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
} from '../systems/equipment'
import {
  HeroIdentityState,
  createHeroIdentity,
  gainHeroExp,
  damageHero,
  updateHeroIdentity,
  heroTotalAtk,
  heroTotalDef,
  isHeroDead,
  isHeroInvincible,
} from '../systems/heroIdentity'
import type { HeroHit } from '../systems/heroCombat'
import { rollOnHitProcs } from '../systems/effects'
import {
  MaterialLot,
  AttributeBudget,
  CraftTransaction,
  buildCraftRequest,
  lockMaterials,
  consumeMaterials,
  refundMaterials,
  validateCraftedEquipment,
  computeBudget,
} from '../systems/furnace'
import type { LoadedGameState } from '../systems/save'
import { createGameSave } from '../systems/save'
import type { SlotId } from '../systems/saveSlots'
import { buildSlotEnvelope, writeSlot, readSlot } from '../systems/saveSlots'
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
const HERO_ID = 1 as const // 悟空 = kagami hero curve #1 (progression.ts)
// Monster30's swing damage before the hero's def is subtracted. TODO-verify: no
// per-attack damage exists in kagami's Monster30 record (it was a ranged bullet
// monster, see monsterSim.ts DIVERGENCE); tuned so a level-1 hero (80 hp) can
// take a handful of hits before going down.
const MONSTER_ATTACK_DMG = 14
// Exp per Monster30 kill. TODO-verify: monster JSON carries no exp field yet
// (progression.ts note); this clears level 1 (needs 135) in ~2 kills for a
// demo-visible level-up.
const MONSTER30_KILL_EXP = 80
const HERO_START_X = 480
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
  // Forge: one in-flight craft at a time. Holds the locked-material transaction,
  // the budget the return is re-validated against, and a timeout that refunds.
  private craftPending: {
    requestId: string
    tx: CraftTransaction
    budget: AttributeBudget
    timer: Phaser.Time.TimerEvent
  } | null = null
  private craftSeq = 0

  // Save-slot wiring (shell -> battle -> shell). activeSlot/origin come from the
  // registry the shell populated; playtimeSec accrues here (only place it can).
  private activeSlot: SlotId | null = null
  private saveOrigin: 'new' | 'continue' = 'new'
  private playtimeSec = 0
  private playtimeAccMs = 0
  // Esc pause menu (continue / save & quit to main menu).
  private paused = false
  private pauseMenu?: Phaser.GameObjects.Container

  // Equipment / hero combat state
  private equipment: Equipment = createEquipment()
  private weaponSprite!: Phaser.GameObjects.Sprite
  // Unified hero identity: level/exp (progression) + live hp/death (heroCombat),
  // with equipment layering atk/def on top. Created in create().
  private identity!: HeroIdentityState
  private monsterAttackId = 0 // per-swing dedup key for incoming monster hits
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
    this.heroState = initHeroState(this.heroConfig, HERO_START_X)
    this.seedFromSave()
    this.setupMonster()

    this.pickupCfg = { gravity: 2, groundY: GROUND_Y, pickupRadius: DEFAULT_PICKUP_RADIUS, tickMs: TICK_MS }

    this.buildHud()
    this.buildDialogue()
    this.buildPauseMenu()
    this.applyHeroRender('wait')
    this.applyMonsterRender(false)
    this.startAudioOnFirstInput()
    this.connectNpc()
    this.exposeDebugHooks()

    kb.on('keydown-ESC', () => this.togglePause())
    // A fresh scene (re)entry: no craft in flight, not paused.
    this.craftPending = null
    this.paused = false
  }

  // ---------- save-slot wiring ----------

  /**
   * Seed hero identity / equipment / inventory from the slot the shell loaded
   * (registry keys set by SlotSelect/CharacterSelect). Falls back to a fresh
   * level-1 悟空 when launched straight into 'battle' with no shell (debug).
   */
  private seedFromSave(): void {
    const slot = this.registry.get('shell.activeSlot')
    this.activeSlot = slot === 0 || slot === 1 || slot === 2 ? (slot as SlotId) : null
    this.saveOrigin = this.registry.get('shell.origin') === 'continue' ? 'continue' : 'new'

    const loaded = this.registry.get('shell.loadedState') as LoadedGameState | undefined
    if (loaded && this.saveOrigin === 'continue') {
      this.identity = createHeroIdentity(loaded.progression.heroId, loaded.progression.level)
      // Exact exp (createProgression already set expToNext + clamped for the level).
      this.identity.progression = loaded.progression
      this.equipment = loaded.equipment
      this.inventory = loaded.inventory
    } else {
      this.identity = createHeroIdentity(HERO_ID)
      this.equipment = createEquipment()
      this.inventory = createInventory(24)
    }

    // Continue accruing from the slot's stored playtime (lives only in slot meta).
    this.playtimeAccMs = 0
    this.playtimeSec =
      this.activeSlot !== null ? readSlot(window.localStorage, this.activeSlot)?.meta.playtimeSec ?? 0 : 0
  }

  /** Write the current live state back to the active slot (no-op without a slot). */
  private saveToSlot(): void {
    if (this.activeSlot === null) return
    const save = createGameSave({
      progression: this.identity.progression,
      equipment: this.equipment,
      inventory: this.inventory,
    })
    writeSlot(window.localStorage, this.activeSlot, buildSlotEnvelope(save, this.playtimeSec))
  }

  // ---------- pause / return to main menu ----------

  private buildPauseMenu(): void {
    const scrim = this.add.rectangle(480, 270, 960, 540, 0x05060c, 0.62).setScrollFactor(0)
    const panel = this.add
      .rectangle(480, 270, 360, 240, 0x1a130c, 0.96)
      .setStrokeStyle(2, 0xd9b45a, 0.9)
      .setScrollFactor(0)
    const title = this.add
      .text(480, 190, '暂停', { fontSize: '26px', color: '#f0d99a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
    const resume = this.pauseButton(480, 250, '继续', 0xd9b45a, () => this.togglePause())
    const saveQuit = this.pauseButton(480, 306, '保存并回主菜单', 0x8a7f66, () =>
      this.returnToMainMenu(),
    )
    this.pauseMenu = this.add
      .container(0, 0, [scrim, panel, title, ...resume, ...saveQuit])
      .setScrollFactor(0)
      .setDepth(300)
      .setVisible(false)
  }

  private pauseButton(
    cx: number,
    cy: number,
    text: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const rect = this.add
      .rectangle(cx, cy, 280, 44, 0x2a2013, 0.95)
      .setStrokeStyle(2, color, 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    rect.on('pointerdown', onClick)
    const label = this.add
      .text(cx, cy, text, { fontSize: '17px', color: '#f2eddf', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
    return [rect, label]
  }

  private togglePause(): void {
    // Esc inside the dialogue is handled by the dialogue itself (keyboard is
    // disabled there), so this only fires during normal play.
    if (this.dialogue?.isOpen) return
    this.paused = !this.paused
    this.pauseMenu?.setVisible(this.paused)
  }

  private returnToMainMenu(): void {
    this.saveToSlot()
    this.npcClient?.dispose()
    this.paused = false
    this.pauseMenu?.setVisible(false)
    this.scene.start('mainmenu')
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

    // Hero stat panel (top-left): level/exp + HP bar + attack + equipped weapon.
    this.add.rectangle(12, 10, 280, 84, 0x0c0d12, 0.5).setOrigin(0, 0).setScrollFactor(0).setDepth(99)
    this.heroHpBar = this.add.graphics().setScrollFactor(0).setDepth(100)
    this.statsText = this.add
      .text(22, 42, '', { fontSize: '13px', color: '#e8ecff', lineSpacing: 3 })
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
      onCraftEnter: () => this.openCraftMode(),
      onCraftSubmit: (description, lots) => this.submitCraft(description, lots),
      craftBudgetPreview: (lots) => this.craftBudgetLine(lots),
    })
  }

  // ---------- forge (炼丹炉) ----------

  private bagMaterials(): MaterialLot[] {
    return listStacks(this.inventory)
      .filter((s) => s.item.kind === 'material')
      .map((s) => ({ item: s.item, qty: s.qty }))
  }

  private openCraftMode(): void {
    if (this.craftPending) {
      this.showToast('老君正在炼制上一件…', '#c8cfe6')
      return
    }
    const mats = this.bagMaterials()
    if (mats.length === 0) {
      this.dialogue.pushLog('（囊中空空，先去打些妖怪取材吧）')
      return
    }
    this.dialogue.openCraft(mats.map((m) => ({ item: m.item, owned: m.qty })))
  }

  private craftBudgetLine(lots: MaterialLot[]): string {
    if (lots.length === 0) return '炉火预算：0 点（先择材）'
    const b = computeBudget(lots)
    return `炉火预算：${b.points} 点（atk≤${b.caps.atk} def≤${b.caps.def} hp≤${b.caps.hp}）`
  }

  private submitCraft(description: string, lots: MaterialLot[]): void {
    if (this.craftPending) return
    if (lots.length === 0) {
      this.showToast('先择些材料入炉', '#e0b060')
      return
    }
    if (description.length === 0) {
      this.showToast('说说想要什么法宝', '#e0b060')
      return
    }
    if (!this.npcClient.isOpen()) {
      this.showToast(`${NPC_NAME}正在闭关…`, '#7a7f95')
      return
    }
    const requestId = `craft-${Date.now()}-${++this.craftSeq}`
    const tx = lockMaterials(this.inventory, requestId, lots)
    if (!tx) {
      this.showToast('材料不足', '#e07a7a')
      return
    }
    const payload = buildCraftRequest(description, lots)
    const sent = this.npcClient.craftRequest(
      NPC_ID,
      requestId,
      description,
      payload.materials,
      payload.budget,
      'p1',
    )
    if (!sent) {
      refundMaterials(this.inventory, tx)
      this.showToast(`${NPC_NAME}正在闭关…材料已退回`, '#7a7f95')
      return
    }
    const timer = this.time.delayedCall(20000, () => this.onCraftTimeout(requestId))
    this.craftPending = { requestId, tx, budget: payload.budget, timer }
    this.dialogue.setCraftLocked(true)
    this.dialogue.pushLog(`悟空：${description}`)
    this.dialogue.pushLog('（老君将材料投入八卦炉，炉火渐炽…）')
    this.dialogue.clearInput()
    this.dialogue.closeCraft()
  }

  private clearCraftPending(): void {
    if (!this.craftPending) return
    this.craftPending.timer.remove(false)
    this.craftPending = null
    this.dialogue.setCraftLocked(false)
  }

  private onCraftResult(item: CraftedItem, flavor: string, requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    const validation = validateCraftedEquipment(item, pending.budget)
    if (validation.ok) {
      consumeMaterials(pending.tx)
      addItem(this.inventory, validation.item, 1)
      this.dialogue.startTypewriter(`${NPC_NAME}：${flavor}`)
      this.showToast(`炼成【${validation.item.name}】`, '#ffd873')
      this.playSfx('pickup', 0.7)
      this.saveToSlot() // autosave: bag gained a forged item
    } else {
      refundMaterials(this.inventory, pending.tx)
      this.dialogue.startTypewriter(
        `${NPC_NAME}：${flavor || '此宝虚影溃散，材料尚不足以定形。'}`,
      )
      this.showToast('材料不足以炼此宝，已退回', '#e0b060')
    }
    this.clearCraftPending()
  }

  private onCraftReject(reason: string, requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.inventory, pending.tx)
    this.dialogue.pushLog(`（炼制未成：${reason}，材料已退回）`)
    this.showToast('炼制未成，材料已退回', '#e07a7a')
    this.clearCraftPending()
  }

  private onCraftTimeout(requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.inventory, pending.tx)
    this.dialogue.pushLog('（炉火久候无成，材料已退回）')
    this.showToast('炼制超时，材料已退回', '#e07a7a')
    this.clearCraftPending()
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
      case 'craft_result':
        this.onCraftResult(m.item, m.flavor, m.requestId)
        break
      case 'craft_reject':
        this.onCraftReject(m.reason, m.requestId)
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
    if (this.paused) return
    // Accrue play time (whole seconds) for the slot summary.
    this.playtimeAccMs += delta
    if (this.playtimeAccMs >= 1000) {
      const whole = Math.floor(this.playtimeAccMs / 1000)
      this.playtimeSec += whole
      this.playtimeAccMs -= whole * 1000
    }
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
    const heroAlive = !isHeroDead(this.identity)
    const events = advanceMonster(
      this.monsterState,
      { heroX: this.heroState.x, heroAlive, incomingHit },
      frozen ? delta * 0.15 : delta,
      this.monsterConfig,
    )
    this.handleMonsterEvents(events)
    // Hero combat upkeep: hurt->ready, i-frame expiry, knockback integration,
    // and auto-respawn (in place near the level start, clear of the monster).
    const combatEvents = updateHeroIdentity(
      this.identity,
      this.heroState,
      { minX: MIN_X, maxX: MAX_X },
      this.simClockMs,
      delta,
      HERO_START_X,
    )
    for (const e of combatEvents) {
      if (e.type === 'respawn') this.onHeroRespawn()
    }
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
    // Combo damage = stage base + the hero's total atk (level curve + equipment),
    // so both leveling up and equipping a weapon raise the numbers the player sees.
    const damage = STAGE_DAMAGE[s.combo.stage] + heroTotalAtk(this.identity, this.equipment)
    // First frame this swing connects: play sfx, roll onHit procs, and float the
    // damage number so the equip/level atk increase is visible on screen.
    if (!this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.playSfx(this.hitSfxKey(s.combo.stage), 0.5)
      this.rollHitProcs()
      this.floatText(this.monsterState.x, GROUND_Y - 90, `-${damage}`, '#ffe37a')
    }
    return { attackId: s.attackId, damage }
  }

  private rollHitProcs(): void {
    for (const p of rollOnHitProcs(equippedList(this.equipment), Math.random)) {
      if (p.effect === 'lifesteal') this.applyLifesteal(p.power)
      else if (p.effect === 'burn') this.burn = { ticksLeft: BURN_TICKS, nextAtMs: this.simClockMs, power: p.power }
      else if (p.effect === 'freeze') this.frozenUntilMs = this.simClockMs + FREEZE_MS
    }
  }

  private applyLifesteal(power: number): void {
    const c = this.identity.combat
    const before = c.hp
    c.hp = Math.min(c.maxHp, c.hp + power)
    const healed = c.hp - before
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
        this.awardKillExp(e.x, e.y)
      }
    }
  }

  // Kill reward: feed the exp through the identity host so a level-up grows the
  // hero's stats. Show light feedback (float text + a level-up toast/flash).
  private awardKillExp(x: number, y: number): void {
    const result = gainHeroExp(this.identity, MONSTER30_KILL_EXP)
    this.floatText(x, y - 40, `+${result.appliedExp} EXP`, '#c8b0ff')
    if (result.levelsGained > 0) {
      this.showToast(`升级！ Lv.${result.levelAfter}`, '#ffe066')
      this.floatText(this.heroState.x, GROUND_Y - 110, `LEVEL UP!`, '#ffe066')
      this.hero.setTint(0xfff2a8)
      this.time.delayedCall(220, () => {
        if (!isHeroDead(this.identity)) this.hero.clearTint()
      })
    }
    this.saveToSlot() // autosave: exp/level changed
  }

  // A monster swing lands: subtract the hero's def, then run it through the
  // combat model (i-frames / death / respawn are all decided there). Feedback
  // (hurt tint, damage number, death toast) is driven off the returned events.
  private monsterHitsHero(): void {
    if (isHeroDead(this.identity)) return
    if (Math.abs(this.heroState.x - this.monsterState.x) > MONSTER30_STATS.attackRange) return
    if (isHeroInvincible(this.identity, this.simClockMs)) return
    const mitigated = Math.max(1, MONSTER_ATTACK_DMG - heroTotalDef(this.identity, this.equipment))
    const knockbackX = this.heroState.x < this.monsterState.x ? -1 : 1
    const hit: HeroHit = {
      sourceId: 'monster30',
      attackId: ++this.monsterAttackId,
      damage: mitigated,
      knockbackX,
    }
    const events = damageHero(this.identity, hit, this.simClockMs)
    for (const e of events) {
      if (e.type === 'hurt') {
        this.floatText(this.heroState.x, GROUND_Y - 60, `-${mitigated}`, '#ff5a5a')
        this.hero.setTint(0xff9a9a)
        this.time.delayedCall(120, () => {
          if (!isHeroDead(this.identity)) this.hero.clearTint()
        })
      } else if (e.type === 'death') {
        this.floatText(this.heroState.x, GROUND_Y - 60, `-${mitigated}`, '#ff5a5a')
        this.showToast('悟空倒地…　Esc 可回主菜单', '#ff6b6b')
      }
    }
  }

  private onHeroRespawn(): void {
    this.hero.clearTint()
    this.hero.setAlpha(1)
    this.hero.setAngle(0)
    this.showToast('复活！', '#6ef0a0')
    this.floatText(this.heroState.x, GROUND_Y - 90, '复活', '#6ef0a0')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(200, () => this.hero.clearTint())
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
    if (this.dialogue.isOpen || isHeroDead(this.identity)) {
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
    const dead = isHeroDead(this.identity)
    if (dead) {
      // 倒地: no dedicated death frame on role1, so hold the hurt pose, tip the
      // sprite over and gray it out. Re-applied every frame so transient tints
      // (hurt/heal delayedCalls) can't clear it before respawn.
      if (this.hero.anims.currentAnim?.key !== 'hurt') this.hero.play('hurt')
      this.hero.setAngle(this.heroState.facing === 1 ? 90 : -90)
      this.hero.setAlpha(1)
      this.hero.setTint(0x777777)
    } else {
      if (this.hero.anims.currentAnim?.key !== action) this.hero.play(action)
      this.hero.setAngle(0)
      // Flicker while the per-hit / meter i-frames are up (clear read that the
      // hero is briefly untargetable after a hit).
      const flicker =
        isHeroInvincible(this.identity, this.simClockMs) && Math.floor(this.simClockMs / 90) % 2 === 0
      this.hero.setAlpha(flicker ? 0.4 : 1)
    }
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
      this.weaponSprite.setAngle(this.hero.angle)
      this.weaponSprite.setAlpha(this.hero.alpha)
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
    const c = this.identity.combat
    const hp = Math.round(c.hp)
    const bar = this.heroHpBar
    bar.clear()
    bar.fillStyle(0x2a1414, 1).fillRoundedRect(22, 20, 200, 16, 4)
    const frac = c.maxHp > 0 ? c.hp / c.maxHp : 0
    const barColor = isHeroDead(this.identity) ? 0x555555 : 0xd94a4a
    bar.fillStyle(barColor, 1).fillRoundedRect(22, 20, Math.max(2, 200 * frac), 16, 4)
    bar.lineStyle(1, 0xd9b45a, 0.8).strokeRoundedRect(22, 20, 200, 16, 4)
    const atk = heroTotalAtk(this.identity, this.equipment)
    const weaponName = this.equipment.weapon ? this.equipment.weapon.name : '空手'
    const p = this.identity.progression
    this.statsText.setText(
      `Lv.${p.level}  EXP ${p.exp}/${p.expToNext}\nHP ${hp}/${c.maxHp}　攻击 ${atk}　武器: ${weaponName}`,
    )
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
    this.saveToSlot() // autosave: equipment/bag changed
    return true
  }

  private doUnequip(slot: EquipSlot): boolean {
    const cur = this.equipment[slot]
    if (!unequip(this.equipment, this.inventory, slot)) return false
    this.showToast(`卸下【${cur?.name ?? ''}】`, '#c8cfe6')
    this.saveToSlot() // autosave: equipment/bag changed
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
      heroHp: Math.round(this.identity.combat.hp),
      heroMaxHp: this.identity.combat.maxHp,
      heroDead: isHeroDead(this.identity),
      heroState: this.identity.combat.state,
      level: this.identity.progression.level,
      exp: this.identity.progression.exp,
      expToNext: this.identity.progression.expToNext,
      atk: heroTotalAtk(this.identity, this.equipment),
      def: heroTotalDef(this.identity, this.equipment),
      weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
      weaponVisible: this.weaponSprite.visible,
      frozen: this.simClockMs < this.frozenUntilMs,
      burning: this.burn !== null,
    })
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
    // Combat acceptance hooks: drive death/respawn and leveling deterministically
    // without having to grind the live monster.
    w.__damageHero = (dmg: number) => {
      const hit: HeroHit = {
        sourceId: 'debug',
        attackId: ++this.monsterAttackId,
        damage: dmg,
        knockbackX: -1,
      }
      return damageHero(this.identity, hit, this.simClockMs).map((e) => e.type)
    }
    w.__killHero = () => {
      // Debug kill bypasses any active i-frames so it always lands.
      this.identity.combat.invulnerableUntilMs = 0
      this.identity.combat.meterInvulnerableUntilMs = undefined
      const hit: HeroHit = {
        sourceId: 'debug',
        attackId: ++this.monsterAttackId,
        damage: this.identity.combat.maxHp + 999,
        knockbackX: -1,
      }
      const evs = damageHero(this.identity, hit, this.simClockMs).map((e) => e.type)
      if (evs.includes('death')) this.showToast(`${'悟空倒地'}…`, '#ff6b6b')
      return evs
    }
    // Acceptance helpers to hold a death frame regardless of wall-clock: kill
    // and suspend the auto-respawn timer, then release it on demand.
    w.__killHeroSticky = () => {
      const evs = (w.__killHero as () => string[])()
      this.identity.combat.respawnAtMs = Number.POSITIVE_INFINITY
      return evs
    }
    w.__respawnHero = () => {
      // Make the respawn due now; updateHeroIdentity fires it next frame.
      this.identity.combat.respawnAtMs = this.simClockMs
    }
    w.__gainExp = (amount: number) => {
      const r = gainHeroExp(this.identity, amount)
      if (r.levelsGained > 0) this.showToast(`升级！ Lv.${r.levelAfter}`, '#ffe066')
      return { level: r.levelAfter, levelsGained: r.levelsGained, exp: this.identity.progression.exp }
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
      this.identity.combat.hp = Math.max(0, Math.min(this.identity.combat.maxHp, hp))
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
    // Grant a bundle of real monster materials (acceptance shortcut for the
    // furnace flow, standing in for several kills' drops).
    w.__giveMaterials = () => {
      const demonSoul: Item = { id: 'demon_soul', name: '妖怪残魂', kind: 'material', rarity: 1 }
      const silverOre: Item = { id: 'silver_ore', name: '白银矿石', kind: 'material', rarity: 2 }
      addItem(this.inventory, demonSoul, 20)
      addItem(this.inventory, silverOre, 12)
      return this.bagMaterials().map((m) => ({ id: m.item.id, name: m.item.name, qty: m.qty }))
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
    // Forge acceptance hooks — drive the real craft path (lock/request/validate).
    w.__openCraft = () => {
      if (!this.dialogue.isOpen) this.tryOpenDialogue()
      this.openCraftMode()
      return this.dialogue.craftMode
    }
    w.__submitCraft = (description: string, sel: { id: string; qty: number }[]) => {
      const stacks = listStacks(this.inventory)
      const lots: MaterialLot[] = []
      for (const s of sel) {
        const stack = stacks.find((st) => st.item.id === s.id)
        if (stack) lots.push({ item: stack.item, qty: s.qty })
      }
      this.submitCraft(description, lots)
      return { pending: !!this.craftPending, requestId: this.craftPending?.requestId ?? null }
    }
    w.__craftState = () => ({
      pending: !!this.craftPending,
      requestId: this.craftPending?.requestId ?? null,
      craftMode: this.dialogue.craftMode,
      materials: this.bagMaterials().map((m) => ({ id: m.item.id, name: m.item.name, qty: m.qty })),
    })
    // Save-slot acceptance hooks.
    w.__saveState = () => ({
      activeSlot: this.activeSlot,
      origin: this.saveOrigin,
      playtimeSec: this.playtimeSec,
      level: this.identity.progression.level,
      exp: this.identity.progression.exp,
      weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
      inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
    })
    w.__saveNow = () => {
      this.saveToSlot()
      return this.activeSlot
    }
    w.__togglePause = () => {
      this.togglePause()
      return this.paused
    }
    w.__returnToMenu = () => this.returnToMainMenu()
    w.__toggleDebug = () => {
      this.debugVisible = !this.debugVisible
      for (const t of this.debugTexts) t.setVisible(this.debugVisible)
    }
  }
}
