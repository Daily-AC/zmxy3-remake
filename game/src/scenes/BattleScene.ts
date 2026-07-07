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
  NpcClient,
  ConnStatus,
  ServerMessage,
  NpcItem,
  CraftedItem,
  CraftEffect,
  resolveNpcServerUrl,
} from '../net/npcClient'
import roleRaw from '../data/roles/role1.json'
import monsterRaw from '../data/monsters/monster30.json'

const roleData = roleRaw as unknown as RoleData
const monsterData = monsterRaw as unknown as RoleData

const HERO_TEX = 'role1_0'
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
  private bgLayers: { img: Phaser.GameObjects.TileSprite; factor: number }[] = []
  private drops: DropEntity[] = []
  private dropSprites = new Map<DropEntity, Phaser.GameObjects.Container>()
  private pickupCfg!: PickupConfig
  private inventory: Inventory = createInventory(24)
  private hud!: Phaser.GameObjects.Text
  private invText!: Phaser.GameObjects.Text
  private mhpText!: Phaser.GameObjects.Text
  private playedHitIds = new Set<number>()
  private bgmStarted = false
  private injected: HeroEdges = { ...NO_EDGES }

  // NPC / dialogue
  private npcClient!: NpcClient
  private npcStatus: ConnStatus = 'closed'
  private npcTag!: Phaser.GameObjects.Text
  private promptText!: Phaser.GameObjects.Text
  private dialogBg!: Phaser.GameObjects.Rectangle
  private dialogText!: Phaser.GameObjects.Text
  private dialogInput!: HTMLInputElement
  private dialogueOpen = false
  private npcLog: string[] = []
  private typing: { idx: number; full: string; shown: number } | null = null
  private toast?: Phaser.GameObjects.Text

  constructor() {
    super('battle')
  }

  preload(): void {
    this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
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
    this.buildDialogueUi()
    this.applyHeroRender('wait')
    this.applyMonsterRender()
    this.startAudioOnFirstInput()
    this.connectNpc()
    this.exposeDebugHooks()
  }

  private buildBackground(): void {
    const layers: [string, number, number][] = [
      ['bg13', -40, 0.15],
      ['bg12', -30, 0.3],
      ['bg11', -20, 0.55],
    ]
    for (const [key, depth, factor] of layers) {
      const ts = this.add.tileSprite(0, 0, 960, 540, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth)
      this.bgLayers.push({ img: ts, factor })
    }
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
    this.hud = this.add
      .text(16, 12, '', { fontSize: '14px', color: '#8a93b8', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.mhpText = this.add
      .text(16, 92, '', { fontSize: '14px', color: '#e08a8a', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.invText = this.add
      .text(760, 12, '', { fontSize: '14px', color: '#c8d0f0', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
    this.add
      .text(480, 512, 'A/D 走　K 跳　J 五段连击　W/↑ 对话　走近掉落自动拾取', {
        fontSize: '14px',
        color: '#8a93b8',
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5)

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

  private buildDialogueUi(): void {
    this.dialogBg = this.add
      .rectangle(480, 430, 900, 190, 0x0a0e1a, 0.86)
      .setStrokeStyle(2, 0x3a4368)
      .setScrollFactor(0)
      .setDepth(90)
      .setVisible(false)
    this.dialogText = this.add
      // useAdvancedWrap breaks mid-run, required for CJK text which has no spaces
      // for the default word-wrap to break on (otherwise long lines overflow).
      .text(48, 348, '', {
        fontSize: '16px',
        color: '#e8ecff',
        wordWrap: { width: 830, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(91)
      .setVisible(false)

    // A DOM input overlay for text entry (Phaser keyboard is disabled while open).
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = '对老君说点什么，回车发送，Esc 关闭'
    input.maxLength = 200
    Object.assign(input.style, {
      position: 'absolute',
      left: '50%',
      bottom: '18px',
      transform: 'translateX(-50%)',
      width: '820px',
      padding: '8px 12px',
      fontSize: '15px',
      border: '1px solid #3a4368',
      borderRadius: '6px',
      background: '#141a2e',
      color: '#e8ecff',
      outline: 'none',
      display: 'none',
      zIndex: '50',
    })
    const parent = this.game.canvas.parentElement ?? document.body
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
    parent.appendChild(input)
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') this.submitDialogue()
      else if (e.key === 'Escape') this.closeDialogue()
    })
    this.dialogInput = input
    this.events.once('shutdown', () => input.remove())
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
        this.pushLog('（老君捻须思索…）')
        break
      case 'npc_say':
        this.startTypewriter(`${NPC_NAME}：${m.text}`)
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
    this.updateNpcUi()
    this.advanceTypewriter()
  }

  private resolveHeroHit(): { attackId: number; damage: number } | null {
    const s = this.heroState
    if (s.combo.stage === 0) return null
    if (this.monsterState.mode === 'dead' || this.monsterState.mode === 'gone') return null
    const box = heroAttackBox(s.x, GROUND_Y, s.facing)
    const mBox = centeredBox(this.monsterState.x, GROUND_Y, 120, 140)
    if (!overlaps(box, mBox)) return null
    if (!this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.playSfx(this.hitSfxKey(s.combo.stage), 0.5)
    }
    return { attackId: s.attackId, damage: STAGE_DAMAGE[s.combo.stage] }
  }

  private hitSfxKey(stage: number): string {
    if (stage <= 2) return 'hit12'
    if (stage <= 4) return 'hit34'
    return 'hit5'
  }

  private handleMonsterEvents(events: { type: string; x: number; y: number }[]): void {
    for (const e of events) {
      if (e.type === 'hurt') this.playSfx('monHurt', 0.6)
      else if (e.type === 'death') {
        this.spawnDrops(e.x, e.y)
        this.npcClient.worldEvent('monster_killed', { monster: MONSTER_DISPLAY_NAME })
      }
    }
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
    if (this.dialogueOpen) {
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
    this.hero.setPosition(this.heroState.x + off.x * HERO_SCALE, this.heroState.vertical.y + off.y * HERO_SCALE)
  }

  private applyMonsterRender(): void {
    if (this.monsterState.mode === 'gone') {
      this.monster.setVisible(false)
      return
    }
    const key = MON_ANIM_PREFIX + this.monsterState.action
    if (this.monster.anims.currentAnim?.key !== key) this.monster.play(key)
    this.monster.setFlipX(this.monsterState.facing === 1)
    const off = monsterData.offset
    this.monster.setPosition(
      this.monsterState.x + off.x * MON_SCALE,
      this.monsterState.y + MON_RENDER_OFFSET_Y + off.y * MON_SCALE,
    )
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX
    for (const { img, factor } of this.bgLayers) img.tilePositionX = camX * factor
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
  }

  private npcStatusLabel(): string {
    return this.npcClient?.isOpen() ? '在线' : '闭关中'
  }

  private updateNpcUi(): void {
    const online = this.npcClient.isOpen()
    this.npcTag.setText(online ? NPC_NAME : `${NPC_NAME}（闭关中）`)
    this.npcTag.setColor(online ? '#d9c07a' : '#7a7f95')
    const near = Math.abs(this.heroState.x - NPC_X) < DIALOGUE_RANGE
    this.promptText.setVisible(near && online && !this.dialogueOpen)
  }

  // ---------- dialogue ----------

  private tryOpenDialogue(): void {
    if (this.dialogueOpen) return
    if (Math.abs(this.heroState.x - NPC_X) >= DIALOGUE_RANGE) return
    if (!this.npcClient.isOpen()) {
      this.showToast(`${NPC_NAME}正在闭关…`, '#7a7f95')
      return
    }
    this.dialogueOpen = true
    this.input.keyboard!.enabled = false // free the keyboard for the DOM input
    this.dialogBg.setVisible(true)
    this.dialogText.setVisible(true)
    this.dialogInput.style.display = 'block'
    this.dialogInput.value = ''
    this.dialogInput.focus()
    if (this.npcLog.length === 0) this.pushLog(`${NPC_NAME}：猴头，来炼丹房作甚？`)
    this.renderDialog()
  }

  private closeDialogue(): void {
    if (!this.dialogueOpen) return
    this.dialogueOpen = false
    this.input.keyboard!.enabled = true
    this.dialogBg.setVisible(false)
    this.dialogText.setVisible(false)
    this.dialogInput.style.display = 'none'
    this.dialogInput.blur()
  }

  private submitDialogue(): void {
    const text = this.dialogInput.value.trim()
    if (!text) return
    this.dialogInput.value = ''
    this.pushLog(`悟空：${text}`)
    this.npcClient.playerSay(NPC_ID, text, 'p1')
  }

  private pushLog(line: string): void {
    this.npcLog.push(line)
    if (this.npcLog.length > 30) this.npcLog.shift()
    this.renderDialog()
  }

  private startTypewriter(line: string): void {
    // Replace the trailing "thinking" placeholder if present.
    if (this.npcLog[this.npcLog.length - 1] === '（老君捻须思索…）') this.npcLog.pop()
    this.npcLog.push('')
    this.typing = { idx: this.npcLog.length - 1, full: line, shown: 0 }
  }

  private advanceTypewriter(): void {
    if (!this.typing) return
    this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + 2)
    this.npcLog[this.typing.idx] = this.typing.full.slice(0, this.typing.shown)
    this.renderDialog()
    if (this.typing.shown >= this.typing.full.length) this.typing = null
  }

  private renderDialog(): void {
    if (!this.dialogueOpen) return
    // Cap the shown history so wrapped multi-line replies still fit the box and
    // the newest line stays visible; older lines scroll off the top.
    this.dialogText.setText(this.npcLog.slice(-4).join('\n'))
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
    })
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
    w.__npc = () => ({
      status: this.npcStatus,
      online: this.npcClient.isOpen(),
      dialogueOpen: this.dialogueOpen,
      log: [...this.npcLog],
    })
    // Drive a real conversation without touching the DOM input.
    w.__npcSay = (text: string) => {
      if (!this.dialogueOpen) this.tryOpenDialogue()
      if (!this.dialogueOpen) return false
      this.pushLog(`悟空：${text}`)
      return this.npcClient.playerSay(NPC_ID, text, 'p1')
    }
    w.__npcOpen = () => this.tryOpenDialogue()
    w.__npcClose = () => this.closeDialogue()
  }
}
