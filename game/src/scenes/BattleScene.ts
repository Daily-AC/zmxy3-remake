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
  MonsterStats,
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
  heroMagicDef,
  heroBaseStats,
  syncHeroEquipment,
  heroStats,
  isHeroDead,
  isHeroInvincible,
} from '../systems/heroIdentity'
import { rollDailyLuck } from '../systems/heroGrowth'
import { computeCombatPower } from '../systems/combatPower'
import { SoulPurse, createSoulPurse, sellCommonEquipment } from '../systems/soulPurse'
import {
  AttackKind,
  NormalAttackHit,
  calculateNormalAttackPower,
  resolveIncomingHeroDamage,
} from '../systems/heroScale'
import { RealSkillId, calculateRealSkillDamage } from '../systems/skillDamageReal'
import {
  LevelDef,
  LevelState,
  MonsterSpawnSpec,
  createLevelState,
  updateLevelSpawn,
  getActiveWaveRoster,
  isBossZoneTriggered,
  markBossTriggered,
  isBossDead,
  revealTransferDoor,
  tryClearArena,
} from '../systems/level'
import { LEVEL_1_WUYING, LEVEL1_MONSTER_NAMES } from '../data/levels/level1'
import { LEVEL_2_TIANWANG, LEVEL2_MONSTER_NAMES } from '../data/levels/level2'
import { LEVEL_3_ERLANGSHEN, LEVEL3_MONSTER_NAMES } from '../data/levels/level3'
import { LEVEL_4_XIENIAN, LEVEL4_MONSTER_NAMES } from '../data/levels/level4'
import { monsterExp } from '../data/monsterExp'
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
import { buildSlotEnvelope, writeSlot, readSlot, heroName } from '../systems/saveSlots'
import { readCampaignIndex, writeCampaignIndex, advanceCampaignFrontier } from '../systems/campaignProgress'
import { SCENE } from './shellShared'
import { MpModel, createMp, getRole1MaxMp, setMaxMp, tickMpRegen } from '../systems/mp'
import {
  Role1SkillRuntime,
  Role1SkillId,
  Role1SkillLevels,
  SkillHitbox,
  createRole1SkillRuntime,
  syncRole1SkillLevels,
  tickRole1SkillRuntime,
  tryCastRole1Skill,
  getRole1SkillMpCost,
} from '../systems/heroSkill'
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
import {
  HUD_TEXTURES,
  HUD_ICONS,
  ONLINE_TEXTURES,
  ICON_FALLBACK_KEY,
  FloatKind,
} from '../ui/hud/hudTheme'
import { RoleInfoHud } from '../ui/hud/RoleInfoHud'
import { SkillBarHud, SkillSlotData } from '../ui/hud/SkillBarHud'
import { BossHpBar, MonsterHpBar } from '../ui/hud/MonsterHpBar'
import { BackpackWindow } from '../ui/hud/BackpackWindow'
import { FurnacePanel } from '../ui/hud/FurnacePanel'
import { ResultBanner } from '../ui/hud/ResultBanner'
import { Toast, spawnFloatingText } from '../ui/hud/Toast'
import roleRaw from '../data/roles/role1.json'

const roleData = roleRaw as unknown as RoleData

// ---- monster species registry (data-driven, all campaign levels) ----
// Action tables (RoleData) for every monster, loaded eagerly by Vite glob so a
// level can spawn any species by id without a static import per monster.
const monsterJsonModules = (
  import.meta as unknown as {
    glob: (p: string, o: { eager: boolean }) => Record<string, { default: RoleData }>
  }
).glob('../data/monsters/*.json', { eager: true })
const MONSTER_DATA: Record<string, RoleData> = {}
for (const [path, mod] of Object.entries(monsterJsonModules)) {
  const m = path.match(/(monster\d+)\.json$/)
  if (m) MONSTER_DATA[m[1]] = mod.default
}
// species id -> the extracted sheet's level dir + file (Capitalized), so the
// preloader can load `assets/extracted/<dir>/<file>.png` for each.
const SPECIES_SHEET: Record<string, { dir: string; file: string }> = {}
for (const [dir, ids] of [
  ['level1', ['2', '3', '4', '5', '7', '8', '30']],
  ['level2', ['6', '9', '10', '15', '16', '19']],
  ['level3', ['1', '11', '12', '13', '14', '20', '21', '22', '23']],
  ['level4', ['31', '32', '33', '34']],
] as [string, string[]][]) {
  for (const n of ids) SPECIES_SHEET['monster' + n] = { dir, file: 'Monster' + n }
}
// Names for boss HP-bar labels, merged from each level pack.
const MONSTER_NAMES: Record<string, string> = {
  ...LEVEL1_MONSTER_NAMES,
  ...LEVEL2_MONSTER_NAMES,
  ...LEVEL3_MONSTER_NAMES,
  ...LEVEL4_MONSTER_NAMES,
}
// Per-boss raw attack power (pre-mitigation), from heroScale.BOSS_REFERENCE /
// level packs. Grunts derive a modest value from their def (see monsterAttackPower).
const BOSS_ATTACK_POWER: Record<string, { power: number; kind: AttackKind }> = {
  monster3: { power: 14, kind: 'physics' }, // 巫鹰 (L1 boss) hit1 physical (level1.ts)
  monster15: { power: 186, kind: 'physics' }, // 多闻天王 hit1
  monster22: { power: 345, kind: 'physics' }, // 二郎神 hit1 (post-buff)
  monster34: { power: 829, kind: 'physics' }, // 邪·悟空 hit1
}

const HERO_TEX = 'role1_0'
// Weapon overlay sheet: same 200×200 grid + same action frames as role1_0, with
// ZERO offset (art-verified: the grip lands in the fist). Only 8 weapon skins
// exist (EQUIP_6/7 are absent in every pack); Stage A uses the default EQUIP_0.
const WEAPON_TEX = 'role1_equip0'
const HERO_ID = 1 as const // 悟空 = kagami hero curve #1 (progression.ts)
const HERO_START_X = 480
const BURN_TICKS = 4
const BURN_INTERVAL_MS = 260
const FREEZE_MS = 1200
const NPC_TEX = 'laojun'
const HERO_SCALE = 1.5
const NPC_SCALE = 1.0
// 太上老君 sheet: 1800×2100, 6 cols × 7 rows of 300px (12.swf Monster65 boss).
const NPC_CELL = 300
const NPC_WAIT_FRAMES = 6 // row 0 = idle
const NPC_IDLE_FRAME_MS = 130
const NPC_OFFSET = { x: -10, y: -30 }
const GROUND_Y = 400
// Floor art (floorBgN) is a whole scene; crop off the top rainbow/palace band
// (already drawn by bg11) and anchor the platform + foreground clouds here.
const FLOOR_CROP_TOP = 0.27
const FLOOR_TOP_Y = 356
const MIN_X = 90
const MAX_X = 1460
const WORLD_W = 1560
const HERO_LOOP = new Set(['wait', 'wait2', 'walk', 'run'])
const MON_LOOP = new Set(['wait', 'walk'])
const NPC_ANIM_PREFIX = 'npc_'
const COMBO_GRACE_MS = 220
// combo.stage (1-5) -> the normal-attack hit key whose real coefficient drives
// damage (heroScale.NORMAL_ATTACK_COEFFICIENT). Index 0 is unused (stage 0 = idle).
const COMBO_STAGE_HIT: (NormalAttackHit | null)[] = [null, 'hit1', 'hit2', 'hit3', 'hit4', 'hit5']
const MON_START_X = 900
const MON_RENDER_OFFSET_Y = 30
const NPC_ID = 'laojun'
const NPC_NAME = '太上老君'
const NPC_X = 1380
const DIALOGUE_RANGE = 120

// --- skills (Role1 悟空) ---
// Demo loadout: every active + sx at level 1 (cheap enough to cast, MP costs
// ~30-40 each). TODO: source real levels from the skill tree once its UI is
// wired (skill-tree-port-report §遗留 — syncRole1SkillLevels reads a levels obj).
const SKILL_DEMO_LEVELS: Partial<Role1SkillLevels> = {
  slz: 1, lys: 1, hytj: 1, lyfb: 1, jdy: 1, qsez: 1, zz: 1, hmz: 1, hyjj: 1, sx: 1,
}
// heroSkill damage is in kagami's original scale (hundreds–thousands) while this
// slice's monster has 150 hp. Scale it down so skills read against current
// numbers. TODO-verify: temporary — remove once the hero-scale pass unifies the
// damage economy (team-lead directive, 2026-07-07). Source of the mismatch:
// skill-tree-port-report.md 数值出处表 (kagami 口径).
const MP_REGEN_PER_SEC = 2 // gentle passive regen (TODO-verify, see mp.ts header)
// SkillHitbox.actionName -> the real (AS3-accurate) skill damage id
// (skillDamageReal.ts). Sub-variant hitboxes (hit8_2 = lyfb's 2nd projectile,
// hmz's two boxes hit10_2/hit10_4) map to their real skill; hit12_1 is the
// visual-only cast MC (no damage). Replaces the old kagami-scale hack.
const REAL_SKILL_BY_ACTION: Record<string, RealSkillId> = {
  hit6: 'slz', hit7: 'hytj', hit8: 'lyfb', hit8_2: 'lyfb', hit9: 'lys',
  hit10_2: 'hmzLianZhan', hit10_4: 'hmzZaDi', hit11_1: 'jdyStage1', hit11_2: 'jdyStage2',
  hit12: 'hyjj', hit13: 'qsez', hit14: 'zz',
}
// Skill dock hotkeys Y U I O L -- the real 造梦西游 player-1 layout. Source: the
// Online 实机 battle-HUD screenshot (docs/reference/zmxy-online-screens/
// battle-hud.png shows five slots keyed Y U I O L, left to right, after the 无双
// ult icon) and kagami SkillUISystem (SkillSlotKeyLabels.p1 / P1_BINDING_ORDER =
// ['Y','U','I','O','L']). The original docks only FIVE actives at once; the other
// four (qsez/zz/hmz/hyjj) live off-dock until a skill-binding UI exists (skill
// tree, future work) -- they stay castable via __castSkill for tests. Default
// loadout = the five 基本技能 in canonical order. Rationale + off-dock note in
// tasks/ui-finish-report.md; do NOT invent extra keys to re-dock the other four.
const SKILL_KEYS: [keyof typeof Phaser.Input.Keyboard.KeyCodes, Role1SkillId][] = [
  ['Y', 'slz'], ['U', 'lys'], ['I', 'hytj'], ['O', 'lyfb'], ['L', 'jdy'],
]
// Skill -> a hero animation that exists in role1.json (the SkillHitbox.actionName
// includes sub-variant labels like 'hit8_2' that aren't standalone hero actions).
const SKILL_ACTION: Record<Role1SkillId, string> = {
  slz: 'hit6', lys: 'hit9', hytj: 'hit7', lyfb: 'hit8', jdy: 'hit11_1',
  qsez: 'hit13', zz: 'hit14', hmz: 'hit10', hyjj: 'hit12',
}

// Item kind coming from the NPC brain -> the game's item kind vocabulary.
function npcKindToGameKind(k: NpcItem['kind'] | 'equip'): Item['kind'] {
  if (k === 'equipment' || k === 'equip') return 'equip'
  if (k === 'consumable') return 'consumable'
  return 'material' // material, quest
}

type CraftedGameItem = Item & { effects?: CraftEffect[] }

/** The campaign level chain L1 -> L2 -> L3 -> L4. L1 keeps its small invented
 * numbers (level.ts LEVEL_1); L2-L4 are the real-scale ports in data/levels/. */
const CAMPAIGN: LevelDef[] = [LEVEL_1_WUYING, LEVEL_2_TIANWANG, LEVEL_3_ERLANGSHEN, LEVEL_4_XIENIAN]

/** One live monster: its sim state + config, its sprite, and the render/combat
 * facts (data table, per-monster elemental status, attack power). */
interface MonsterEntity {
  species: string
  state: MonsterState
  config: MonsterConfig
  sprite: Phaser.GameObjects.Sprite
  data: RoleData
  scale: number
  attackPower: number
  attackKind: AttackKind
  isBoss: boolean
  attackId: number // per-swing dedup for hits this monster deals to the hero
  burn: { ticksLeft: number; nextAtMs: number; power: number } | null
  frozenUntilMs: number
  // Incoming hits (combo / skill / burn), drained one per frame into
  // advanceMonster's single incoming-hit slot — monsterSim dedups by attackId.
  hitQueue: { attackId: number; damage: number }[]
  /** Grunt head HP bar (bosses use the top BossHpBar instead). */
  hpBar?: MonsterHpBar
}

/**
 * Milestone-3 battle scene: parallax level, a Monster30 the hero combos to
 * death with loot -> inventory, and an LLM-driven NPC (太上老君) the player can
 * walk up to and talk with over WebSocket. All game rules live in the
 * Phaser-independent `systems/` and `net/` modules; this scene renders them.
 */
export class BattleScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite
  private npc!: Phaser.GameObjects.Sprite
  private keys!: Record<'a' | 'd' | 'j' | 'k', Phaser.Input.Keyboard.Key>
  private heroState!: HeroState
  private heroConfig!: HeroConfig
  // Level chain: the wave/boss state machine (level.ts) + the live monsters it
  // has spawned (grunts and, once the boss zone triggers, the boss entity).
  private campaignIndex = 0
  private levelState!: LevelState
  private monsters: MonsterEntity[] = []
  private bossEntity: MonsterEntity | null = null
  private portal?: Phaser.GameObjects.Container
  private floorImg?: Phaser.GameObjects.Image
  private bgBase?: Phaser.GameObjects.Image
  private levelBanner?: Phaser.GameObjects.Text
  // Parallax: tilesprites that scroll via tilePositionX. The far base backdrop
  // (bg11) and ground are covering Images (auto-parallax via scrollFactor).
  private bgTiles: { img: Phaser.GameObjects.TileSprite; factor: number }[] = []
  private drops: DropEntity[] = []
  private dropSprites = new Map<DropEntity, Phaser.GameObjects.Container>()
  private pickupCfg!: PickupConfig
  private inventory: Inventory = createInventory(24)
  // Real battle-HUD components (ui/hud/), replacing the old debug text.
  private roleInfoHud!: RoleInfoHud
  private skillBar!: SkillBarHud
  private backpack!: BackpackWindow
  private furnacePanel!: FurnacePanel
  private resultBanner!: ResultBanner
  // Boss-clear result banner -> portal handoff (auto-continues after a beat).
  private bannerTimer?: Phaser.Time.TimerEvent
  private bossBar!: BossHpBar
  private toastUi!: Toast
  // F1 debug telemetry (hidden by default).
  private debugTexts: Phaser.GameObjects.Text[] = []
  private debugVisible = false
  private hud!: Phaser.GameObjects.Text
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
  // Which campaign node WorldMapScene's click passed in (init() data); null
  // when BattleScene is entered directly (dev/debug boot with no shell), which
  // falls back to the slot's saved progress like before S1.
  private entryCampaignIndex: number | null = null
  private playtimeSec = 0
  private playtimeAccMs = 0
  // Esc pause menu (continue / save & quit to main menu).
  private paused = false
  private pauseMenu?: Phaser.GameObjects.Container

  // Skills / MP
  private mp!: MpModel
  private skillRuntime!: Role1SkillRuntime
  // While set, the hero holds a skill cast pose instead of heroSim's action.
  private skillAnim: { action: string; untilMs: number } | null = null
  // Monotonic ids for skill/burn hits, kept clear of combo (from 1). Each
  // monster entity has its own hitQueue; these just guarantee unique ids.
  private skillAttackId = 200000
  private skillBarAccMs = 0

  // Equipment / hero combat state
  private equipment: Equipment = createEquipment()
  private weaponSprite!: Phaser.GameObjects.Sprite
  // Unified hero identity: level/exp (progression) + live hp/death (heroCombat),
  // with equipment layering atk/def on top. Created in create().
  private identity!: HeroIdentityState
  private burnAttackId = 100000 // kept clear of hero attackIds (which start at 1)
  private simClockMs = 0
  // S4 个人资料/背包: 灵魂 wallet (soulPurse.ts -- placeholder economy, see its
  // header) + a once-per-load 幸运 roll (heroGrowth.rollDailyLuck, display-only:
  // not wired into combat math, see combatPower.ts / report).
  private soulPurse: SoulPurse = createSoulPurse()
  private displayLuck = 0

  constructor() {
    super('battle')
  }

  /** WorldMapScene passes which node was clicked; a direct/debug boot into
   * 'battle' (no shell) omits it and falls back to the slot's saved progress. */
  init(data?: { campaignIndex?: number }): void {
    this.entryCampaignIndex = typeof data?.campaignIndex === 'number' ? data.campaignIndex : null
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
    // Every campaign species' sheet (grid size read from its own action table).
    for (const [species, sheet] of Object.entries(SPECIES_SHEET)) {
      const data = MONSTER_DATA[species]
      if (!data) continue
      this.load.spritesheet(species, `assets/extracted/${sheet.dir}/${sheet.file}.png`, {
        frameWidth: data.sheet.cellW,
        frameHeight: data.sheet.cellH,
      })
    }
    // Backgrounds for every level (L1 bg11/12/13 + L2-L4 bgN1/N2/N3, floors).
    for (const key of ['bg11', 'bg12', 'bg13', 'floorBg1']) {
      this.load.image(key, `assets/extracted/level1/${key}.png`)
    }
    for (const n of [2, 3, 4]) {
      this.load.image(`floorBg${n}`, `assets/extracted/level${n}/floorBg${n}.png`)
      const bgCount = n === 4 ? 1 : 3 // L4 only has bg41
      for (let i = 1; i <= bgCount; i++) {
        this.load.image(`bg${n}${i}`, `assets/extracted/level${n}/bg${n}${i}.png`)
      }
    }
    this.load.image('ink_panel', 'assets/extracted/ui/dialogue_textpanel_crop.png')
    // Real battle-HUD art: RoleInfo avatar, boss bar, backpack window/cell,
    // item icons, and Online-sourced skill icons.
    for (const { key, url } of [...HUD_TEXTURES, ...HUD_ICONS, ...ONLINE_TEXTURES]) {
      this.load.image(key, url)
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
    // Register every campaign species' animations under a per-species prefix.
    for (const species of Object.keys(SPECIES_SHEET)) {
      const data = MONSTER_DATA[species]
      if (data && this.textures.exists(species)) {
        this.registerAnimations(data, species, MON_LOOP, species + '_')
      }
    }
    this.registerNpcIdle()

    this.hero = this.add.sprite(480, GROUND_Y, HERO_TEX).setScale(HERO_SCALE).setDepth(10)
    // Weapon overlay: frame-perfect mirror of the hero, shown only when armed.
    this.weaponSprite = this.add
      .sprite(480, GROUND_Y, WEAPON_TEX)
      .setScale(HERO_SCALE)
      .setDepth(11)
      .setVisible(false)
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
    kb.on('keydown-W', () => this.onInteract())
    kb.on('keydown-UP', () => this.onInteract())
    kb.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault()
      this.debugVisible = !this.debugVisible
      for (const t of this.debugTexts) t.setVisible(this.debugVisible)
    })
    // E: equip the first equippable item in the bag. (Unequip is dev-only via the
    // __unequip hook now that U is a skill hotkey; the real unequip is the bag UI.)
    kb.on('keydown-E', () => this.equipFirstFromBag())
    // B: toggle the backpack window.
    kb.on('keydown-B', () => this.toggleBackpack())
    // Y U I O L: cast the five docked Role1 active skills.
    for (const [code, skillId] of SKILL_KEYS) {
      kb.on('keydown-' + code, () => this.castSkill(skillId))
    }

    this.heroConfig = makeHeroConfig({
      groundY: GROUND_Y,
      minX: MIN_X,
      maxX: MAX_X,
      comboStageDurationsMs: this.comboStageDurations(),
      comboGraceMs: COMBO_GRACE_MS,
    })
    this.heroState = initHeroState(this.heroConfig, HERO_START_X)
    this.seedFromSave()
    this.startLevel(this.campaignIndex)

    this.pickupCfg = { gravity: 2, groundY: GROUND_Y, pickupRadius: DEFAULT_PICKUP_RADIUS, tickMs: TICK_MS }

    this.buildHud()
    this.buildDialogue()
    this.buildPauseMenu()
    this.applyHeroRender('wait')
    this.startAudioOnFirstInput()
    this.connectNpc()
    this.exposeDebugHooks()

    kb.on('keydown-ESC', () => this.togglePause())
    // A fresh scene (re)entry: no craft in flight, not paused.
    this.craftPending = null
    this.paused = false
    // Scene shutdown (return to main menu): tear down the NPC socket and close
    // the dialogue so nothing (DOM input, reconnect timer) leaks into the shell.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.npcClient?.dispose()
      this.dialogue?.close()
    })
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
    // Fold the equipped gear's hp/mp affixes into the live pools.
    syncHeroEquipment(this.identity, this.equipment)
    this.soulPurse = createSoulPurse()
    this.displayLuck = rollDailyLuck(this.identity.progression.level)

    // Continue accruing from the slot's stored playtime (lives only in slot meta).
    this.playtimeAccMs = 0
    this.playtimeSec =
      this.activeSlot !== null ? readSlot(window.localStorage, this.activeSlot)?.meta.playtimeSec ?? 0 : 0

    // MP (full) sized to the hero's level; skill runtime with the demo loadout.
    // MP isn't persisted (save.ts has no mp field) — it refills on load/level.
    this.mp = createMp(getRole1MaxMp(this.identity.progression.level) + this.identity.equipMaxMpBonus)
    this.skillRuntime = createRole1SkillRuntime()
    syncRole1SkillLevels(this.skillRuntime, SKILL_DEMO_LEVELS)

    // Campaign level index: WorldMapScene passes the exact node clicked
    // (entryCampaignIndex); a direct/debug boot with no shell falls back to the
    // slot's saved frontier (readCampaignIndex -- systems/campaignProgress,
    // shared with WorldMapScene so both read/write the identical side-channel
    // key; save.ts itself has no level field, see that file's header).
    this.campaignIndex =
      this.entryCampaignIndex !== null
        ? Math.min(Math.max(0, this.entryCampaignIndex), CAMPAIGN.length - 1)
        : this.activeSlot !== null && this.saveOrigin === 'continue'
          ? readCampaignIndex(window.localStorage, this.activeSlot)
          : 0
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
    writeCampaignIndex(window.localStorage, this.activeSlot, this.campaignIndex)
  }

  // ---------- pause / return to main menu ----------

  private buildPauseMenu(): void {
    const scrim = this.add.rectangle(480, 270, 960, 540, 0x05060c, 0.62).setScrollFactor(0)
    const panel = this.add
      .rectangle(480, 276, 380, 320, 0x1a130c, 0.96)
      .setStrokeStyle(2, 0xd9b45a, 0.9)
      .setScrollFactor(0)
    const title = this.add
      .text(480, 168, '暂停', { fontSize: '26px', color: '#f0d99a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
    const resume = this.pauseButton(480, 226, '继续', 0xd9b45a, () => this.togglePause())
    const saveQuit = this.pauseButton(480, 282, '保存并回主菜单', 0x8a7f66, () =>
      this.returnToMainMenu(),
    )
    // Key-help lives here now (kept off the battlefield).
    const help = this.add
      .text(
        480,
        356,
        'A/D 走　K 跳　J 连击\nYUIOL 技能　B 背包\nW/↑ 对话·传送　E 穿戴',
        { fontSize: '14px', color: '#c8bfa6', align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.pauseMenu = this.add
      .container(0, 0, [scrim, panel, title, ...resume, ...saveQuit, help])
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

  // ---------- skills / MP ----------

  /** Keep MP's cap on the hero's level curve; grow current MP by any increase. */
  private syncMpMax(): void {
    const target = getRole1MaxMp(this.identity.progression.level) + this.identity.equipMaxMpBonus
    if (target === this.mp.maxMp) return
    const delta = target - this.mp.maxMp
    setMaxMp(this.mp, target)
    if (delta > 0) this.mp.mp = Math.min(this.mp.maxMp, this.mp.mp + delta)
  }

  private castSkill(skillId: Role1SkillId): void {
    if (this.paused || isHeroDead(this.identity) || this.dialogue?.isOpen) return
    // Combo <-> skill mutual exclusion: don't cast mid-combo, and the shared
    // busy-lock (collectEdges blocks input while cooldownMs > 0) keeps the combo
    // from interrupting a cast.
    if (this.heroState.combo.stage !== 0) return

    const ctx = {
      sourcePower: heroTotalAtk(this.identity, this.equipment),
      x: this.heroState.x,
      y: GROUND_Y,
      facingX: this.heroState.facing,
      targets: this.aliveMonsters().map((e) => ({ id: e.species, x: e.state.x, y: GROUND_Y, isAlive: true })),
    }
    const result = tryCastRole1Skill(this.skillRuntime, this.mp, skillId, ctx)
    if (!result.ok) {
      this.showSkillFail(result.reason)
      return
    }
    // Hold the cast pose for the skill's action duration (shared busy-lock).
    const action = result.reentered && skillId === 'jdy' ? 'hit11_2' : SKILL_ACTION[skillId]
    this.skillAnim = { action, untilMs: this.simClockMs + Math.max(200, this.skillRuntime.cooldownMs) }
    this.playSfx(this.hitSfxKey(5), 0.5)
    this.showToast(`${skillId.toUpperCase()}${result.reentered ? '·二段' : ''}`, '#9fd8ff')
    // Skill level for the real damage formula: jdy stage-2 reuses stage-1's
    // level; others use the runtime's learned level (min 1 since it just cast).
    const skillLevel = Math.max(1, this.skillRuntime.levels[skillId])
    const atk = ctx.sourcePower
    for (const hb of result.hitboxes) this.scheduleSkillHit(hb, skillLevel, atk)
  }

  /** Up/W: dismiss the clear banner (-> portal) first, else use the portal if
   * standing in it, else talk to 老君. */
  private onInteract(): void {
    if (this.resultBanner.isOpen) {
      this.dismissResultBanner()
      return
    }
    if (this.tryUsePortal()) return
    this.tryOpenDialogue()
  }

  private showSkillFail(reason: string): void {
    const msg =
      reason === 'mp' ? '法力不足' :
      reason === 'cooldown' ? '招式未收' :
      reason === 'not-learned' ? '未习得' :
      '无目标'
    this.showToast(msg, '#e0b060')
  }

  /**
   * Turn one SkillHitbox descriptor into a real hit: after its activeAfterMs,
   * check overlap with the monster and, if it connects, apply the AS3-accurate
   * skill damage (skillDamageReal, keyed by the hitbox's actionName) and queue
   * it onto the shared incoming-hit channel. Damage is the real formula now, no
   * artificial scale. Multi-hit (hitIntervalFrames/maxHits) is simplified to a
   * single application per box — full multi-tick is a later pass.
   */
  private scheduleSkillHit(hb: SkillHitbox, skillLevel: number, atk: number): void {
    if (hb.visualOnly) return
    const realId = REAL_SKILL_BY_ACTION[hb.actionName]
    if (!realId) return // unknown/visual sub-variant: no damage
    const dmg = Math.max(1, Math.round(calculateRealSkillDamage(realId, skillLevel, atk)))
    const fire = (): void => {
      const facing = this.heroState.facing
      const hx = this.heroState.x + facing * hb.offsetX
      const hy = GROUND_Y + hb.offsetY
      const box = centeredBox(hx, hy, hb.width, hb.height)
      // A skill box can strike several monsters; queue the hit into each.
      for (const e of this.aliveMonsters()) {
        const mBox = centeredBox(e.state.x, GROUND_Y, 120, 140)
        if (!overlaps(box, mBox)) continue
        const attackId = ++this.skillAttackId
        if (e.state.resolvedAttackIds.includes(attackId)) continue
        e.hitQueue.push({ attackId, damage: dmg })
        this.floatText(e.state.x, GROUND_Y - 90, `-${dmg}`, 'damage')
      }
    }
    if (hb.activeAfterMs > 0) this.time.delayedCall(hb.activeAfterMs, fire)
    else fire()
  }

  private buildBackground(): void {
    // Layering (fixing the old right-edge seam): bg11 is the OPAQUE base scene
    // (palace on clouds, 1132×3051) — the old code tiled it as a narrow front
    // layer, which wrapped and produced the seam while also hiding the detail
    // layers. It is now a slow covering Image behind everything. bg13 (南天门
    // gate panorama) and bg12 (lotus railing) are TRANSPARENT 4900px-wide
    // panoramas that parallax on top and never wrap within the camera's range.
    // Reset accumulators that persist across a scene restart (their old game
    // objects were destroyed on shutdown; keeping stale refs crashes swapBackground).
    this.bgTiles = []
    this.debugTexts = []
    this.drops = []
    this.dropSprites.clear()
    this.playedHitIds.clear()
    this.monsters = []
    this.bossEntity = null
    this.bgBase = this.add
      .image(0, 0, 'bg11')
      .setOrigin(0, 0)
      .setScrollFactor(0.12, 0) // 1132px covers the 960 viewport across the pan
      .setDepth(-40)
    for (const [key, depth, factor] of [
      ['bg13', -30, 0.28],
      // bg12 is the lotus FOREGROUND (leaves + flowers + railings); it sits in
      // front of the floor cloud band so the lotus reads as the ground edge.
      ['bg12', -8, 0.5],
    ] as [string, number, number][]) {
      const ts = this.add.tileSprite(0, 0, 960, 540, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth)
      this.bgTiles.push({ img: ts, factor })
    }
    // Ground band: the level floor art (floorBgN) is a WHOLE scene — palace +
    // rainbow on top, 雕花石台 platform + foreground clouds below. Showing it
    // whole re-drew the rainbow at the bottom (the seam). Crop off the top
    // ~27% (rainbow + palace, already covered by bg11) and place only the
    // platform + clouds band at the hero's feet.
    this.floorImg = this.add.image(0, FLOOR_TOP_Y, 'floorBg1').setOrigin(0, 0).setScrollFactor(0.9, 0).setDepth(-10)
    this.placeFloor('floorBg1')
  }

  /** Point the floor image at a level's floor art, cropped to its ground band. */
  private placeFloor(key: string): void {
    if (!this.floorImg || !this.textures.exists(key)) return
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number }
    const frameName = `${key}__ground`
    const tex = this.textures.get(key)
    if (!tex.has(frameName)) {
      const top = Math.round(src.height * FLOOR_CROP_TOP)
      tex.add(frameName, 0, 0, top, src.width, src.height - top)
    }
    this.floorImg.setTexture(key, frameName)
    this.floorImg.setPosition(0, FLOOR_TOP_Y)
    this.floorImg.scaleX = Math.max(1, (960 + (WORLD_W - 960) * 0.9 + 40) / src.width)
    this.floorImg.scaleY = 1
  }

  /** Swap the parallax + floor textures to a level's own art (L1 uses bg1x, L2
   * bg2x, ...; L4 only has bg41 so its two detail layers reuse it). */
  private swapBackground(levelIndex: number): void {
    const n = levelIndex + 1
    const base = n === 1 ? 'bg11' : `bg${n}1`
    const far = n === 1 ? 'bg13' : this.textures.exists(`bg${n}3`) ? `bg${n}3` : base
    const near = n === 1 ? 'bg12' : this.textures.exists(`bg${n}2`) ? `bg${n}2` : base
    const floor = n === 1 ? 'floorBg1' : `floorBg${n}`
    if (this.textures.exists(base)) this.bgBase?.setTexture(base)
    if (this.bgTiles[0] && this.textures.exists(far)) this.bgTiles[0].img.setTexture(far)
    if (this.bgTiles[1] && this.textures.exists(near)) this.bgTiles[1].img.setTexture(near)
    if (this.textures.exists(floor)) this.placeFloor(floor)
  }

  private registerAnimations(data: RoleData, tex: string, loop: Set<string>, prefix: string): void {
    for (const [name, spec] of Object.entries(data.actions)) {
      // Anims live on the global AnimationManager and survive scene restarts —
      // don't re-create (which warns) when returning to a level we've seen.
      if (this.anims.exists(prefix + name)) continue
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
    if (this.anims.exists(NPC_ANIM_PREFIX + 'wait')) return
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

  // ---------- level / monster manager ----------

  /** (Re)start a campaign level: reset the wave/boss machine, clear monsters,
   * swap the background art, and flash a name banner. */
  private startLevel(index: number): void {
    this.campaignIndex = Math.min(Math.max(0, index), CAMPAIGN.length - 1)
    const def = CAMPAIGN[this.campaignIndex]
    this.levelState = createLevelState(def)
    for (const e of this.monsters) {
      e.hpBar?.destroy()
      e.sprite.destroy()
    }
    this.monsters = []
    this.bossEntity = null
    this.portal?.setVisible(false)
    this.bossBar?.setVisible(false)
    // Close any open scene UI so the previous level's overlays (老君 dialogue,
    // backpack, boss bar) never bleed over the next level's banner.
    this.dialogue?.close()
    this.backpack?.close()
    this.furnacePanel?.close()
    this.resultBanner?.hide()
    this.bannerTimer?.remove(false)
    this.swapBackground(this.campaignIndex)
    this.showLevelBanner(def.name)
  }

  private showLevelBanner(name: string): void {
    this.levelBanner?.destroy()
    const t = this.add
      .text(480, 120, `第 ${this.campaignIndex + 1} 关 · ${name}`, {
        fontSize: '30px',
        color: '#ffe9b0',
        fontStyle: 'bold',
        stroke: '#3a2a10',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(130)
    this.levelBanner = t
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 900, onComplete: () => t.destroy() })
  }

  /** Build a monsterSim config for a species from its own action-table durations
   * (hurt/hit1/dead) and the level pack's stats. */
  private monsterConfigFor(species: string, stats: MonsterStats): MonsterConfig {
    const data = MONSTER_DATA[species] ?? MONSTER_DATA.monster30
    const dur = (a: string, fallback: number): number =>
      data.actions[a] ? actionDurationMs(data.actions[a] as ActionSpec, TICK_MS) : fallback
    return {
      stats,
      patrolMin: MIN_X + 80,
      patrolMax: MAX_X - 80,
      hurtDurationMs: dur('hurt', 260),
      attackDurationMs: dur('hit1', 400),
      deadDurationMs: dur('dead', 600),
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      tickMs: TICK_MS,
      rng: Math.random,
    }
  }

  /** Raw (pre-mitigation) attack power a species deals to the hero. Bosses use
   * recovered values (heroScale.BOSS_REFERENCE); grunts derive a modest value
   * from their def so tougher grunts hit a bit harder. */
  private monsterAttackPower(
    species: string,
    stats: MonsterStats,
    isBoss: boolean,
  ): { power: number; kind: AttackKind } {
    if (isBoss && BOSS_ATTACK_POWER[species]) return BOSS_ATTACK_POWER[species]
    // TODO-verify: grunt attack powers aren't in the level packs; this is a
    // tuning heuristic, not a recovered value.
    return { power: Math.min(60, 8 + stats.def * 1.5), kind: 'physics' }
  }

  private spawnEntity(species: string, stats: MonsterStats, x: number, isBoss: boolean): MonsterEntity {
    const data = MONSTER_DATA[species] ?? MONSTER_DATA.monster30
    const config = this.monsterConfigFor(species, stats)
    const state = initMonster(config, x, GROUND_Y)
    const tex = this.textures.exists(species) ? species : 'monster30'
    // Every species sheet is a native SWF-pixel export in the same coordinate
    // space as the hero's — a boss's SWF art is simply drawn bigger, a small
    // grunt's smaller. So every sprite (grunt or boss) gets the *same*
    // px->world factor as the hero (HERO_SCALE); relative size is then
    // whatever the original art already encodes, with no per-cell "stretch to
    // 200px" normalization and no artificial isBoss multiplier. Verified
    // against docs/reference/zmxy-online-screens/combat-damage.png (turtle
    // grunt ~85-95% of hero height) and the SWF's own idle-frame silhouettes
    // (monster-scale-report.md).
    const scale = HERO_SCALE
    const sprite = this.add.sprite(x, GROUND_Y, tex).setScale(scale).setDepth(isBoss ? 9 : 8)
    const atk = this.monsterAttackPower(species, stats, isBoss)
    const entity: MonsterEntity = {
      species,
      state,
      config,
      sprite,
      data,
      scale,
      attackPower: atk.power,
      attackKind: atk.kind,
      isBoss,
      attackId: 0,
      burn: null,
      frozenUntilMs: 0,
      hitQueue: [],
      // Grunts get a head HP bar; the boss uses the top BossHpBar.
      hpBar: isBoss ? undefined : new MonsterHpBar(this),
    }
    this.monsters.push(entity)
    return entity
  }

  private spawnActiveWave(): void {
    const roster = getActiveWaveRoster(this.levelState)
    roster.forEach((spec: MonsterSpawnSpec, i) => {
      const x = Math.min(MAX_X - 120, Math.max(MIN_X + 120, 720 + i * 190))
      this.spawnEntity(spec.species, spec.stats, x, false)
    })
  }

  private aliveGruntCount(): number {
    return this.monsters.filter(
      (e) => !e.isBoss && e.state.mode !== 'dead' && e.state.mode !== 'gone',
    ).length
  }

  // ---------- boss HP bar ----------

  private updateBossHud(): void {
    const b = this.bossEntity
    if (!b || b.state.mode === 'gone') {
      this.bossBar.setVisible(false)
      return
    }
    this.bossBar.setVisible(true)
    this.bossBar.update({
      name: CAMPAIGN[this.campaignIndex].boss.label,
      hp: b.state.hp,
      maxHp: b.config.stats.hp,
    })
  }

  // ---------- portal / level advance ----------

  private showPortal(): void {
    const door = this.levelState.arena.door
    const cx = door.x + door.width / 2
    const cy = GROUND_Y - 40
    if (!this.portal) {
      const glow = this.add.rectangle(0, 0, 70, 150, 0x7ac7ff, 0.35).setStrokeStyle(3, 0x9fd8ff, 0.9)
      const swirl = this.add.star(0, -10, 6, 12, 26, 0xbfe4ff, 0.7)
      const label = this.add.text(0, -95, '↑ 传送', { fontSize: '16px', color: '#dff0ff', fontStyle: 'bold' }).setOrigin(0.5)
      this.portal = this.add.container(cx, cy, [glow, swirl, label]).setDepth(7)
      this.tweens.add({ targets: swirl, angle: 360, duration: 3000, repeat: -1 })
    }
    this.portal.setPosition(cx, cy).setVisible(true)
    this.showToast('妖王已除！走进传送门 (↑) 进入下一关', '#9fd8ff')
  }

  /** If the portal is open and the hero stands in it, clear the arena and go to
   * the next level. Returns true if it consumed the interact press. */
  private tryUsePortal(): boolean {
    if (!this.levelState.arena.door.visible) return false
    if (!tryClearArena(this.levelState, this.heroState.x, GROUND_Y, true)) return false
    this.onAdvanceLevel()
    return true
  }

  /**
   * S1 world-map hub: clearing a level no longer chains straight into the next
   * one in this scene (screen-fidelity-spec.md S1 -- "通关回 WorldMapScene，不是
   * 传送门串行"). Persist the unlock (never regressing on a replay of an earlier
   * level -- advanceCampaignFrontier), autosave, then hand off to the map; the
   * player re-enters via clicking the next node there.
   */
  private onAdvanceLevel(): void {
    const clearedAll = this.campaignIndex + 1 >= CAMPAIGN.length
    if (this.activeSlot !== null) {
      const frontier = readCampaignIndex(window.localStorage, this.activeSlot)
      this.campaignIndex = advanceCampaignFrontier(this.campaignIndex, frontier)
    }
    this.saveToSlot()
    this.showToast(clearedAll ? '恭喜通关全部关卡！返回世界地图' : '通关！返回世界地图', '#ffe066')
    this.time.delayedCall(900, () => {
      this.npcClient?.dispose()
      this.scene.start(SCENE.worldMap)
    })
  }

  private buildHud(): void {
    // Real battle HUD (ui/hud/): top-left RoleInfo (avatar + HP/MP/EXP + atk),
    // top boss bar, bottom-left skill dock, backpack window (toggle B).
    this.roleInfoHud = new RoleInfoHud(this, 14, 12, { scale: 1.3 })
    this.roleInfoHud.container.setScrollFactor(0).setDepth(100)
    this.bossBar = new BossHpBar(this)
    this.bossBar.setVisible(false)
    // Dock chrome (无双 + cluster + 5 slots) flush to the bottom-left corner.
    this.skillBar = new SkillBarHud(this, 2, 366, { scale: 1.2 })
    this.skillBar.container.setScrollFactor(0).setDepth(100)
    this.backpack = new BackpackWindow(this, {
      iconKeyFor: (item) => (this.textures.exists('icon_' + item.id) ? 'icon_' + item.id : ICON_FALLBACK_KEY),
      onClose: () => this.backpack.close(),
      onEquip: (item) => this.doEquip(item),
      onUnequip: (slot) => this.doUnequip(slot),
      onSell: () => this.doSellCommonEquipment(),
    })
    // 炼丹炉 forge window (replaces the old ink-dialogue craft overlay). Same
    // craft protocol: budget preview + submit run through the scene unchanged.
    this.furnacePanel = new FurnacePanel(this, {
      iconKeyFor: (item) => (this.textures.exists('icon_' + item.id) ? 'icon_' + item.id : ICON_FALLBACK_KEY),
      budgetPreview: (lots) => this.craftBudgetLine(lots),
      onCraftSubmit: (description, lots) => this.submitCraft(description, lots),
    })
    // Stage-clear result banner (boss death -> banner -> portal).
    this.resultBanner = new ResultBanner(this, {
      onContinue: () => this.dismissResultBanner(),
      onRetry: () => {
        this.resultBanner.hide()
        this.bannerTimer?.remove(false)
        this.startLevel(this.campaignIndex)
      },
    })
    this.toastUi = new Toast(this)
    this.refreshSkillBar()

    // F1 debug telemetry (hidden by default).
    this.hud = this.add
      .text(16, 100, '', { fontSize: '13px', color: '#8a93b8', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false)
    this.debugTexts = [this.hud]

    // (Key-help now lives in the Esc pause menu, not over the battlefield.)

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
      // No onCraftEnter: the forge entry point lives on WorldMapScene's 炼丹炉
      // button now (screen-fidelity-spec.md S1). 老君 chat stays available here
      // unchanged; openCraftMode/furnacePanel below stay wired for the
      // __openCraft/__submitCraft acceptance hooks, just not reachable from UI.
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
    this.furnacePanel.open(mats.map((m) => ({ item: m.item, owned: m.qty })))
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
    this.furnacePanel.setCraftLocked(true)
    this.dialogue.pushLog(`悟空：${description}`)
    this.dialogue.pushLog('（老君将材料投入八卦炉，炉火渐炽…）')
    this.furnacePanel.clearInput()
    // Back to the dialogue: 老君's flavor/result types out there (as before).
    this.furnacePanel.close()
  }

  private clearCraftPending(): void {
    if (!this.craftPending) return
    this.craftPending.timer.remove(false)
    this.craftPending = null
    this.furnacePanel.setCraftLocked(false)
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
    tickRole1SkillRuntime(this.skillRuntime, delta)
    // Slow passive MP regen (kagami wires no fixed rate; small value for play
    // feel, TODO-verify — see mp.ts header). maxMp tracks the hero's level.
    tickMpRegen(this.mp, MP_REGEN_PER_SEC, delta)
    this.syncMpMax()
    const edges = this.collectEdges()
    const jumped = edges.pressJump && this.heroState.vertical.grounded
    advanceHero(this.heroState, edges, delta, this.heroConfig)
    if (jumped) this.playSfx('heroJump', 0.4)

    // Hero melee: push combo damage into every monster the swing overlaps.
    this.resolveHeroHits()
    // Level machine: spawn waves, advance every monster + the boss, reveal the
    // portal on boss death, and hand off to the next level when used.
    this.updateLevel(delta)
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
    this.renderMonsters()
    this.updateHud()
    this.updateBossHud()
    this.updateParallax()
    this.updateNpcUi()
    this.dialogue.advanceTypewriter()
  }

  private aliveMonsters(): MonsterEntity[] {
    return this.monsters.filter((e) => e.state.mode !== 'dead' && e.state.mode !== 'gone')
  }

  /** Push one swing's combo damage into every alive monster its box overlaps
   * (monsterSim dedups by attackId, so a monster is hit at most once per swing).
   * onHit procs + sfx fire once per swing, on the first monster struck. */
  private resolveHeroHits(): void {
    const s = this.heroState
    if (s.combo.stage === 0) return
    const box = heroAttackBox(s.x, GROUND_Y, s.facing)
    const hitKey = COMBO_STAGE_HIT[s.combo.stage] ?? 'hit1'
    const atk = heroTotalAtk(this.identity, this.equipment)
    const crit = heroStats(this.identity, this.equipment).crit
    const damage = Math.max(1, Math.round(calculateNormalAttackPower(hitKey, atk, { critChance: crit })))
    let firstHit: MonsterEntity | null = null
    for (const e of this.aliveMonsters()) {
      const mBox = centeredBox(e.state.x, GROUND_Y, 120, 140)
      if (!overlaps(box, mBox)) continue
      if (e.state.resolvedAttackIds.includes(s.attackId)) continue
      if (e.hitQueue.some((h) => h.attackId === s.attackId)) continue
      e.hitQueue.push({ attackId: s.attackId, damage })
      this.floatText(e.state.x, GROUND_Y - 90, `-${damage}`, 'damage')
      if (!firstHit) firstHit = e
    }
    if (firstHit && !this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.playSfx(this.hitSfxKey(s.combo.stage), 0.5)
      this.rollHitProcs(firstHit)
    }
  }

  private rollHitProcs(target: MonsterEntity): void {
    for (const p of rollOnHitProcs(equippedList(this.equipment), Math.random)) {
      if (p.effect === 'lifesteal') this.applyLifesteal(p.power)
      else if (p.effect === 'burn') target.burn = { ticksLeft: BURN_TICKS, nextAtMs: this.simClockMs, power: p.power }
      else if (p.effect === 'freeze') target.frozenUntilMs = this.simClockMs + FREEZE_MS
    }
  }

  // ---------- level tick ----------

  private updateLevel(delta: number): void {
    const heroAlive = !isHeroDead(this.identity)
    // Spawn the next wave when the machine says so.
    if (updateLevelSpawn(this.levelState, this.aliveGruntCount())) this.spawnActiveWave()
    // All stops cleared -> spawn the arena boss (once).
    if (isBossZoneTriggered(this.levelState)) {
      markBossTriggered(this.levelState)
      this.spawnBoss()
    }
    for (const e of this.monsters) this.advanceEntity(e, delta, heroAlive)
    this.reapMonsters()
    // Boss down -> stage-clear banner, then the portal on confirm/timeout. The
    // door is revealed now (so the portal is reachable the moment the banner is
    // dismissed and __usePortal keeps working), but its glow only shows on
    // dismiss.
    if (this.bossEntity && isBossDead(this.bossEntity.state) && !this.levelState.arena.door.visible) {
      revealTransferDoor(this.levelState)
      this.showResultBanner()
    }
  }

  /** Boss cleared: play the 挑战成功 banner with a short stat line, then hand
   * off to the portal on 继续 / timeout. */
  private showResultBanner(): void {
    const bossName = this.bossEntity ? MONSTER_NAMES[this.bossEntity.species] ?? '妖王' : '妖王'
    this.resultBanner.showSuccess({
      stats: [
        CAMPAIGN[this.campaignIndex].name,
        `${bossName}已除`,
        `境界 Lv${this.identity.progression.level}`,
      ],
    })
    this.playSfx('pickup', 0.7)
    this.bannerTimer?.remove(false)
    this.bannerTimer = this.time.delayedCall(6000, () => this.dismissResultBanner())
  }

  /** Close the result banner and reveal the transfer portal glow. */
  private dismissResultBanner(): void {
    if (!this.resultBanner.isOpen) return
    this.bannerTimer?.remove(false)
    this.bannerTimer = undefined
    this.resultBanner.hide()
    this.showPortal()
  }

  private advanceEntity(e: MonsterEntity, delta: number, heroAlive: boolean): void {
    if (e.state.mode === 'gone') return
    // Burn tick -> queue as an incoming hit (monsterSim resolves it normally).
    if (e.state.mode !== 'dead' && e.burn && this.simClockMs >= e.burn.nextAtMs) {
      e.hitQueue.push({ attackId: ++this.burnAttackId, damage: e.burn.power })
      this.floatText(e.state.x, GROUND_Y - 70, `烧 -${e.burn.power}`, 'burn')
      e.burn.ticksLeft -= 1
      e.burn.nextAtMs = this.simClockMs + BURN_INTERVAL_MS
      if (e.burn.ticksLeft <= 0) e.burn = null
    }
    const frozen = this.simClockMs < e.frozenUntilMs
    const incomingHit = e.hitQueue.shift() ?? null
    const events = advanceMonster(
      e.state,
      { heroX: this.heroState.x, heroAlive, incomingHit },
      frozen ? delta * 0.15 : delta,
      e.config,
    )
    for (const ev of events) {
      if (ev.type === 'hurt') this.playSfx('monHurt', 0.6)
      else if (ev.type === 'attack-start') this.monsterHitsHero(e)
      else if (ev.type === 'death') {
        this.spawnDrops(ev.x, ev.y)
        this.npcClient.worldEvent('monster_killed', { monster: MONSTER_NAMES[e.species] ?? e.species })
        this.awardKillExp(ev.x, ev.y, e.species)
      }
    }
  }

  private reapMonsters(): void {
    for (const e of this.monsters) {
      if (e.state.mode === 'gone' && e !== this.bossEntity) {
        e.hpBar?.destroy()
        e.sprite.destroy()
      }
    }
    this.monsters = this.monsters.filter((e) => e.state.mode !== 'gone' || e === this.bossEntity)
  }

  private spawnBoss(): void {
    const def = CAMPAIGN[this.campaignIndex]
    const boss = this.spawnEntity(def.boss.species, def.boss.stats, MON_START_X, true)
    this.bossEntity = boss
    this.levelState.arena.state = 'active'
    this.levelState.arena.boss = boss.state
    this.showToast(`BOSS · ${def.boss.label}`, '#ff9a5a')
  }

  private applyLifesteal(power: number): void {
    const c = this.identity.combat
    const before = c.hp
    c.hp = Math.min(c.maxHp, c.hp + power)
    const healed = c.hp - before
    this.floatText(this.heroState.x, GROUND_Y - 90, `+${healed || power}`, 'heal')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(120, () => this.hero.clearTint())
  }

  private hitSfxKey(stage: number): string {
    if (stage <= 2) return 'hit12'
    if (stage <= 4) return 'hit34'
    return 'hit5'
  }

  // Kill reward: feed the exp through the identity host so a level-up grows the
  // hero's stats. Show light feedback (float text + a level-up toast/flash).
  private awardKillExp(x: number, y: number, species: string): void {
    const result = gainHeroExp(this.identity, monsterExp(species))
    this.floatText(x, y - 40, `+${result.appliedExp} EXP`, 'exp')
    if (result.levelsGained > 0) {
      this.showToast(`升级！ Lv.${result.levelAfter}`, '#ffe066')
      this.floatText(this.heroState.x, GROUND_Y - 110, 'LEVEL UP!', 'exp')
      this.hero.setTint(0xfff2a8)
      this.time.delayedCall(220, () => {
        if (!isHeroDead(this.identity)) this.hero.clearTint()
      })
    }
    this.saveToSlot() // autosave: exp/level changed
  }

  // A monster swing lands: route its raw attack power through the original
  // two-way defense formula (heroScale.resolveIncomingHeroDamage; heroCombat
  // applies none itself), then into the combat model (i-frames/death/respawn).
  private monsterHitsHero(e: MonsterEntity): void {
    if (isHeroDead(this.identity)) return
    if (Math.abs(this.heroState.x - e.state.x) > e.config.stats.attackRange) return
    if (isHeroInvincible(this.identity, this.simClockMs)) return
    const mitigated = Math.max(
      1,
      Math.round(
        resolveIncomingHeroDamage(
          e.attackPower,
          e.attackKind,
          heroTotalDef(this.identity, this.equipment),
          heroMagicDef(this.identity),
        ),
      ),
    )
    const knockbackX = this.heroState.x < e.state.x ? -1 : 1
    const hit: HeroHit = {
      sourceId: e.species,
      attackId: ++e.attackId,
      damage: mitigated,
      knockbackX,
    }
    const events = damageHero(this.identity, hit, this.simClockMs)
    for (const e of events) {
      if (e.type === 'hurt') {
        this.floatText(this.heroState.x, GROUND_Y - 60, `-${mitigated}`, 'crit')
        this.hero.setTint(0xff9a9a)
        this.time.delayedCall(120, () => {
          if (!isHeroDead(this.identity)) this.hero.clearTint()
        })
      } else if (e.type === 'death') {
        this.floatText(this.heroState.x, GROUND_Y - 60, `-${mitigated}`, 'crit')
        this.showToast('悟空倒地…　Esc 可回主菜单', '#ff6b6b')
      }
    }
  }

  private onHeroRespawn(): void {
    this.hero.clearTint()
    this.hero.setAlpha(1)
    this.hero.setAngle(0)
    this.showToast('复活！', '#6ef0a0')
    this.floatText(this.heroState.x, GROUND_Y - 90, '复活', 'heal')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(200, () => this.hero.clearTint())
  }

  /** Rising floating text, styled per FLOAT_STYLES (ui/hud/Toast). */
  private floatText(x: number, y: number, text: string, kind: FloatKind = 'damage'): void {
    spawnFloatingText(this, x, y, text, kind)
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
    // Block input while a dialogue is up, the hero is dead, or a skill's shared
    // busy-lock is active (the latter enforces the skill<->combo exclusion).
    if (this.dialogue.isOpen || isHeroDead(this.identity) || this.skillRuntime.cooldownMs > 0) {
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
      // A skill cast holds its pose for the busy-lock duration, overriding the
      // heroSim action underneath.
      if (this.skillAnim && this.simClockMs >= this.skillAnim.untilMs) this.skillAnim = null
      const effective = this.skillAnim ? this.skillAnim.action : action
      if (this.hero.anims.currentAnim?.key !== effective) this.hero.play(effective)
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

  private renderMonsters(): void {
    for (const e of this.monsters) this.renderEntity(e)
  }

  private renderEntity(e: MonsterEntity): void {
    if (e.state.mode === 'gone') {
      e.sprite.setVisible(false)
      e.hpBar?.setVisible(false)
      return
    }
    const key = e.species + '_' + e.state.action
    // Some species omit a 'dead' row (level 4 monsters fade out with no frame);
    // only switch animations that actually exist, else hold the current pose.
    if (this.anims.exists(key) && e.sprite.anims.currentAnim?.key !== key) e.sprite.play(key)
    e.sprite.setFlipX(e.state.facing === 1)
    const frozen = this.simClockMs < e.frozenUntilMs
    if (frozen) e.sprite.setTint(0x8fc7ff)
    else if (e.burn) e.sprite.setTint(0xff8a5a)
    else e.sprite.clearTint()
    const off = e.data.offset
    e.sprite.setPosition(e.state.x + off.x * e.scale, e.state.y + MON_RENDER_OFFSET_Y + off.y * e.scale)
    // Grunt head HP bar (hidden at full / on death); boss uses the top bar.
    e.hpBar?.update(e.state.hp, e.config.stats.hp, e.state.x, GROUND_Y - 110)
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX
    for (const { img, factor } of this.bgTiles) img.tilePositionX = camX * factor
  }

  private updateHud(): void {
    // Top-left RoleInfo (avatar + HP/MP/EXP bars + atk/weapon).
    const c = this.identity.combat
    const p = this.identity.progression
    this.roleInfoHud.update({
      level: p.level,
      hp: c.hp,
      maxHp: c.maxHp,
      mp: this.mp.mp,
      maxMp: this.mp.maxMp,
      exp: p.exp,
      expToNext: p.expToNext,
      atk: heroTotalAtk(this.identity, this.equipment),
      weaponName: this.equipment.weapon ? this.equipment.weapon.name : '空手',
    })
    // Skill dock cooldown sweep (shared busy-lock, normalized to a nominal cast).
    const cdFrac = this.skillRuntime.cooldownMs > 0 ? Math.min(1, this.skillRuntime.cooldownMs / 1000) : 0
    for (let i = 0; i < SKILL_KEYS.length; i++) this.skillBar.setCooldown(i, cdFrac)
    // Rebuild slot affordability/level a few times a second (MP regens/drains).
    this.skillBarAccMs += this.game.loop.delta
    if (this.skillBarAccMs >= 300) {
      this.skillBarAccMs = 0
      this.refreshSkillBar()
    }

    if (this.debugVisible) {
      const s = this.heroState
      this.hud.setText(
        `Lv${this.campaignIndex + 1} ${CAMPAIGN[this.campaignIndex].name}  怪:${this.aliveMonsters().length}` +
          `\naction:${s.action} combo:${s.combo.stage} x:${s.x.toFixed(0)}  NPC:${this.npcStatusLabel()}`,
      )
    }
  }

  /** (Re)build the bottom-left skill dock from the current loadout/MP. */
  private refreshSkillBar(): void {
    const slots: SkillSlotData[] = SKILL_KEYS.map(([code, skillId]) => {
      const level = this.skillRuntime.levels[skillId]
      const mpCost = level > 0 ? getRole1SkillMpCost(skillId, level) : 0
      // Hotkey label is the key code itself now (Y U I O L).
      return { skillId, hotkey: code, mpCost, level, disabled: level <= 0 || this.mp.mp < mpCost }
    })
    this.skillBar.setSlots(slots)
  }

  private toggleBackpack(): void {
    if (this.dialogue.isOpen) return
    if (this.backpack.isOpen) {
      this.backpack.close()
    } else {
      this.refreshBackpackData()
      this.backpack.open()
    }
  }

  /** Push the current hero/equipment/bag/soul state into the backpack window.
   * Called on open and after anything the panel displays changes (equip,
   * unequip, sell) so an OPEN panel reflects the action immediately. */
  private refreshBackpackData(): void {
    const eq = this.equipment
    const equipAtkBonus = heroTotalAtk(this.identity, eq) - heroBaseStats(this.identity).atk
    this.backpack.setHeroStats({
      name: heroName(this.identity.heroId),
      level: this.identity.progression.level,
      combatPower: computeCombatPower(this.identity.progression.level, equipAtkBonus),
      hp: this.identity.combat.hp,
      maxHp: this.identity.combat.maxHp,
      mp: this.mp.mp,
      maxMp: this.mp.maxMp,
      atk: heroTotalAtk(this.identity, eq),
      def: heroTotalDef(this.identity, eq),
      luck: this.displayLuck,
      magicDefPct: heroMagicDef(this.identity) * 100,
      critPct: heroStats(this.identity, eq).crit * 100,
      dodgePct: 0, // no dodge system in this project (see BackpackWindow.ts header)
      hpRegen: 0, // no hp-regen-over-time system in this project
      mpRegen: MP_REGEN_PER_SEC,
      exp: this.identity.progression.exp,
      expToNext: this.identity.progression.expToNext,
      soul: this.soulPurse.value,
    })
    this.backpack.setEquipment(this.equipment)
    this.backpack.setInventory(listStacks(this.inventory))
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
    syncHeroEquipment(this.identity, this.equipment) // fold new gear hp/mp into pools
    this.showToast(`装备【${item.name}】`, '#ffd873')
    this.saveToSlot() // autosave: equipment/bag changed
    if (this.backpack.isOpen) this.refreshBackpackData()
    return true
  }

  private doUnequip(slot: EquipSlot): boolean {
    const cur = this.equipment[slot]
    if (!unequip(this.equipment, this.inventory, slot)) return false
    syncHeroEquipment(this.identity, this.equipment) // drop the gear hp/mp from pools
    this.showToast(`卸下【${cur?.name ?? ''}】`, '#c8cfe6')
    this.saveToSlot() // autosave: equipment/bag changed
    if (this.backpack.isOpen) this.refreshBackpackData()
    return true
  }

  /** 出售白装 -- ports export.pack.BackPack.as deleteWhiteEquipment (see
   * soulPurse.ts's header for the exact mapping/adaptations). */
  private doSellCommonEquipment(): void {
    const result = sellCommonEquipment(this.inventory, this.soulPurse)
    if (result.soldCount === 0) {
      this.showToast('没有可出售的白装', '#c8cfe6')
      return
    }
    this.showToast(`出售 ${result.soldCount} 件白装，获得灵魂 +${result.soulGained}`, '#ffd873')
    this.saveToSlot()
    if (this.backpack.isOpen) this.refreshBackpackData()
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

  private showToast(text: string, color = '#f0d99a'): void {
    this.toastUi.show(text, color)
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
    const nearestMonster = (): MonsterEntity | null => {
      let best: MonsterEntity | null = null
      let bestD = Infinity
      for (const e of this.aliveMonsters()) {
        const d = Math.abs(e.state.x - this.heroState.x)
        if (d < bestD) { bestD = d; best = e }
      }
      return best
    }
    w.__worldState = () => {
      const nm = nearestMonster()
      return {
        level: this.identity.progression.level,
        campaignIndex: this.campaignIndex,
        levelName: CAMPAIGN[this.campaignIndex].name,
        aliveMonsters: this.aliveMonsters().length,
        boss: this.bossEntity
          ? { species: this.bossEntity.species, hp: Math.round(this.bossEntity.state.hp), maxHp: this.bossEntity.config.stats.hp, mode: this.bossEntity.state.mode }
          : null,
        portalOpen: this.levelState.arena.door.visible,
        // Back-compat: report the nearest monster under the old `monster` key.
        monster: nm ? { species: nm.species, x: Math.round(nm.state.x), hp: Math.round(nm.state.hp), mode: nm.state.mode } : null,
        drops: this.drops.map((d) => ({ id: d.item.id, x: Math.round(d.x), grounded: d.grounded })),
        inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
        heroHp: Math.round(this.identity.combat.hp),
        heroMaxHp: this.identity.combat.maxHp,
        heroDead: isHeroDead(this.identity),
        heroState: this.identity.combat.state,
        exp: this.identity.progression.exp,
        expToNext: this.identity.progression.expToNext,
        atk: heroTotalAtk(this.identity, this.equipment),
        def: heroTotalDef(this.identity, this.equipment),
        weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
        weaponVisible: this.weaponSprite.visible,
      }
    }
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
    // Combat acceptance hooks: drive death/respawn and leveling deterministically
    // without having to grind the live monster.
    w.__damageHero = (dmg: number) => {
      const hit: HeroHit = {
        sourceId: 'debug',
        attackId: ++this.skillAttackId,
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
        attackId: ++this.skillAttackId,
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
      return this.furnacePanel.isOpen
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
      craftMode: this.furnacePanel.isOpen,
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
    // Skill / MP acceptance hooks.
    w.__castSkill = (skillId: Role1SkillId) => {
      const mpBefore = Math.round(this.mp.mp)
      const monsterHpBefore = Math.round(this.aliveMonsters()[0]?.state.hp ?? 0)
      this.castSkill(skillId)
      return {
        cast: this.skillAnim?.action ?? null,
        mpBefore,
        mpAfter: Math.round(this.mp.mp),
        cooldownMs: Math.round(this.skillRuntime.cooldownMs),
        monsterHpBefore,
      }
    }
    w.__skillState = () => ({
      mp: Math.round(this.mp.mp),
      maxMp: this.mp.maxMp,
      cooldownMs: Math.round(this.skillRuntime.cooldownMs),
      levels: this.skillRuntime.levels,
      monsterHp: Math.round(this.aliveMonsters()[0]?.state.hp ?? 0),
    })
    w.__setSkillLevels = (levels: Partial<Role1SkillLevels>) => {
      syncRole1SkillLevels(this.skillRuntime, levels)
      return this.skillRuntime.levels
    }
    w.__toggleBackpack = () => {
      this.toggleBackpack()
      return this.backpack.isOpen
    }
    // Level-chain acceptance hooks.
    w.__levelState = () => ({
      campaignIndex: this.campaignIndex,
      name: CAMPAIGN[this.campaignIndex].name,
      aliveMonsters: this.aliveMonsters().map((e) => ({ species: e.species, hp: Math.round(e.state.hp), isBoss: e.isBoss })),
      boss: this.bossEntity
        ? { species: this.bossEntity.species, hp: Math.round(this.bossEntity.state.hp), maxHp: this.bossEntity.config.stats.hp, dead: isBossDead(this.bossEntity.state) }
        : null,
      portalOpen: this.levelState.arena.door.visible,
      bossTriggered: this.levelState.bossTriggered,
    })
    // Queue a lethal hit into every live grunt (drives the wave machine forward).
    w.__killGrunts = () => {
      let n = 0
      for (const e of this.aliveMonsters()) {
        if (e.isBoss) continue
        e.hitQueue.push({ attackId: ++this.skillAttackId, damage: e.state.hp + e.config.stats.def + 99999 })
        n++
      }
      return n
    }
    // Queue a lethal hit into the boss.
    w.__killBoss = () => {
      if (!this.bossEntity || isBossDead(this.bossEntity.state)) return false
      this.bossEntity.hitQueue.push({
        attackId: ++this.skillAttackId,
        damage: this.bossEntity.state.hp + this.bossEntity.config.stats.def + 99999,
      })
      return true
    }
    // Walk into the portal (teleports the hero to the door first) and advance.
    // Dismiss the clear banner first if it's still up (boss just died).
    w.__usePortal = () => {
      if (this.resultBanner.isOpen) this.dismissResultBanner()
      const d = this.levelState.arena.door
      this.heroState.x = d.x + d.width / 2
      return this.tryUsePortal()
    }
    w.__toggleDebug = () => {
      this.debugVisible = !this.debugVisible
      for (const t of this.debugTexts) t.setVisible(this.debugVisible)
    }
  }
}
