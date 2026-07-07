import Phaser from 'phaser'
import { SCENE, REG, shellStorage } from './shellShared'
import {
  WORLDMAP_NODES,
  WORLDMAP_DECORATIONS,
  WORLDMAP_CHESTS,
  WORLDMAP_BUTTONS,
  worldMapTransform,
} from '../data/worldmapNodes'
import type { WorldMapButton, WorldMapButtonAction } from '../data/worldmapNodes'
import { readCampaignIndex, writeCampaignIndex, isCampaignLevelUnlocked, campaignNodeVisualState } from '../systems/campaignProgress'
import type { SlotId } from '../systems/saveSlots'
import { readSlot, writeSlot, buildSlotEnvelope } from '../systems/saveSlots'
import { restoreGameState, createGameSave } from '../systems/save'
import type { LoadedGameState } from '../systems/save'
import { listStacks, addItem } from '../systems/inventory'
import {
  buildCraftRequest,
  lockMaterials,
  consumeMaterials,
  refundMaterials,
  validateCraftedEquipment,
  computeBudget,
} from '../systems/furnace'
import type { MaterialLot, CraftTransaction, AttributeBudget } from '../systems/furnace'
import { NpcClient, resolveNpcServerUrl } from '../net/npcClient'
import type { ServerMessage, CraftedItem } from '../net/npcClient'
import { FurnacePanel } from '../ui/hud/FurnacePanel'
import type { CraftMaterialOption } from '../ui/hud/FurnacePanel'
import { HUD_TEXTURES, HUD_ICONS, ICON_FALLBACK_KEY } from '../ui/hud/hudTheme'
import { Toast } from '../ui/hud/Toast'

// S1 世界地图 hub. Everything below the map art (nodes/decorations/chests/
// buttons + coordinates) is data-driven from data/worldmapNodes.ts, which is
// itself a literal transcript of the export.SelectPLace object tree + AS3
// (dual-source pipeline, tasks/worldmap-report.md). This scene only:
//   - places that art at its xfl Matrix tx/ty inside one scaled+offset
//     container (worldMapTransform contain-fits the 940x590 original stage
//     into our 960x540 canvas -- pillarboxed, zero content cropped, no
//     per-element hand tuning),
//   - derives node click/hover state from the save's campaign frontier
//     (systems/campaignProgress, save-driven -- see that module's header for
//     why this differs from the AS3's own curBigStage debug-override branch),
//   - and wires the seven bottom buttons to real handlers where the milestone
//     has one (save/furnace/back), else a "敬请期待" toast (screen-fidelity-
//     spec.md S1: 商城/学习技能/活动/任务 置灰 this milestone).
//
// The 炼丹炉 forge lives here now (moved from BattleScene's dialogue -- see
// DialogueBox.ts / BattleScene.buildDialogue), reading/writing the PERSISTED
// slot inventory directly (not a live battle Inventory), since the map has no
// battle session running underneath it.

const WORLDMAP_DIR = 'assets/extracted/worldmap/'
const MAP_BG_TEX = 'wm_map_bg'
const FURNACE_TEX_KEYS = new Set(['furnace_frame', 'furnace_making'])
// export.SelectPLace has no "locked" art state (its mOut() only ever shows
// frame 1 "normal" or frame 2 "current") -- campaignProgress.ts already notes
// the bare SWF gives no locked cue, so a grey tint is our own minimal
// affordance for screen-fidelity-spec.md's "未解锁置灰", applied uniformly to
// every non-interactive node/button here rather than invented per-element.
const GREY_TINT = 0x8a8a8a
const NPC_ID = 'laojun'

// A symbol's PlaceObject Matrix tx/ty maps its LOCAL (0,0), which is NOT
// necessarily its artwork's top-left corner: buttons/chests are authored
// top-left-anchored (origin (0,0) lines their Matrix tx/ty up directly with
// the exported bitmap's top-left pixel), but the NODE marker symbols (Symbol
// 857/871/864/878/886/897/904/911/918 in OtherMat1.swf's library) AND five
// of the six landmark decorations have their local origin inside the
// artwork. Rendering those with origin (0,0) shifts them right+down by the
// artwork's negative local bounds -- the exact ghost-offset the 2026-07-08
// review overlay caught on llbt/dsgbtn/sssl/kls/btnnmg and the s1_3 gate.
//
// Each fraction below = (-boundsXmin/width, -boundsYmin/height) of the
// symbol's visual-state bounds (up/over/down for buttons, all placed
// children for sprites), computed from OtherMat1's swf2xml by chaining
// PlaceObject matrices down to shape bounds (tmp/worldmap-extract/
// deco_origins.py). Cross-check: that derivation reproduces s1_1
// (0.495,0.659) and s1_2 (0.460,0.532) exactly as the earlier per-node
// BitmapFill-Matrix reading did (tasks/worldmap-report.md). Every state PNG
// of a given symbol shares identical pixel dimensions (verified), so one
// fraction covers all states. s1_3 (Symbol 864) is a 677x568 scenery sprite
// (the stone gate + steps); its deeper nesting defeated the BitmapFill
// shortcut, but the recursive bounds walk resolves it to (0.101,0.102) --
// the earlier origin(0,0) approximation is removed.
const NODE_ORIGIN: Record<string, { x: number; y: number }> = {
  s1_1: { x: 0.495, y: 0.659 },
  s1_2: { x: 0.46, y: 0.532 },
  s1_3: { x: 0.101, y: 0.102 },
  s2_1: { x: 0.46, y: 0.466 },
  s2_2: { x: 0.476, y: 0.582 },
  s2_3: { x: 0.497, y: 0.655 },
  s3_1: { x: 0.54, y: 0.54 },
  s3_2: { x: 0.547, y: 0.611 },
  s3_3: { x: 0.531, y: 0.443 },
}
function nodeOrigin(id: string): { x: number; y: number } {
  return NODE_ORIGIN[id] ?? { x: 0, y: 0 }
}

// Landmark decoration origins, same derivation (deco_origins.py; each
// symbol's bounds match its exported PNG's pixel size exactly, except kls
// 171x156 bounds vs 171x160 PNG -- <=4px residual, recorded in the report).
// sgzz is genuinely top-left-authored and stays (0,0).
const DECO_ORIGIN: Record<string, { x: number; y: number }> = {
  dsgbtn: { x: 0.516, y: 0.563 },
  llbt: { x: 0.5, y: 0.5 },
  sgzz: { x: 0, y: 0 },
  btnnmg: { x: 0.668, y: 0.487 },
  kls: { x: 0.538, y: 0.535 },
  sssl: { x: 0.525, y: 0.504 },
}
function decoOrigin(id: string): { x: number; y: number } {
  return DECO_ORIGIN[id] ?? { x: 0, y: 0 }
}

function asSlotId(v: unknown): SlotId | null {
  return v === 0 || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? (v as SlotId) : null
}

export class WorldMapScene extends Phaser.Scene {
  private slot: SlotId | null = null
  private loaded!: LoadedGameState
  private playtimeSec = 0
  private currentIndex = 0
  private furnacePanel!: FurnacePanel
  private toastUi!: Toast
  private npcClient!: NpcClient
  private craftPending: {
    requestId: string
    tx: CraftTransaction
    budget: AttributeBudget
    timer: Phaser.Time.TimerEvent
  } | null = null
  private craftSeq = 0

  constructor() {
    super(SCENE.worldMap)
  }

  preload(): void {
    if (!this.textures.exists(MAP_BG_TEX)) this.load.image(MAP_BG_TEX, `${WORLDMAP_DIR}map_bg.jpg`)

    const keys = new Set<string>()
    for (const n of WORLDMAP_NODES) {
      keys.add(n.textureNormal)
      if (n.textureCurrent) keys.add(n.textureCurrent)
      if (n.textureHover) keys.add(n.textureHover)
    }
    for (const d of WORLDMAP_DECORATIONS) keys.add(d.textureNormal)
    for (const c of WORLDMAP_CHESTS) keys.add(c.textureNormal)
    for (const b of WORLDMAP_BUTTONS) keys.add(b.texture)
    for (const key of keys) {
      // Every worldmap texture key is "wm_" + the extracted filename stem.
      if (!this.textures.exists(key)) this.load.image(key, `${WORLDMAP_DIR}${key.slice(3)}.png`)
    }

    for (const t of HUD_TEXTURES) {
      if (FURNACE_TEX_KEYS.has(t.key) && !this.textures.exists(t.key)) this.load.image(t.key, t.url)
    }
    for (const t of HUD_ICONS) {
      if (!this.textures.exists(t.key)) this.load.image(t.key, t.url)
    }
  }

  create(): void {
    const storage = shellStorage()
    this.slot = asSlotId(this.registry.get(REG.activeSlot))
    const env = this.slot !== null ? readSlot(storage, this.slot) : undefined
    if (!env || this.slot === null) {
      // WorldMapScene is only ever entered via the shell with a slot already
      // written (CharacterSelectScene.confirm / SlotSelectScene.continueGame).
      // A missing slot means a direct/debug boot with nothing to act on.
      this.scene.start(SCENE.mainMenu)
      return
    }
    this.loaded = restoreGameState(env.save)
    this.playtimeSec = env.meta.playtimeSec
    this.currentIndex = readCampaignIndex(storage, this.slot)

    this.renderMap()
    this.buildFurnace()
    this.toastUi = new Toast(this)
    this.connectNpc()
    this.exposeHooks()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.npcClient?.dispose())
  }

  // ---------- map rendering ----------

  private renderMap(): void {
    const { scale, offsetX, offsetY } = worldMapTransform(960, 540)
    const map = this.add.container(offsetX, offsetY).setScale(scale)

    if (this.textures.exists(MAP_BG_TEX)) {
      map.add(this.add.image(0, 0, MAP_BG_TEX).setOrigin(0, 0))
    }

    for (const deco of WORLDMAP_DECORATIONS) {
      if (!this.textures.exists(deco.textureNormal)) continue
      const origin = decoOrigin(deco.id)
      const img = this.add.image(deco.x, deco.y, deco.textureNormal).setOrigin(origin.x, origin.y)
      if (deco.scale) img.setScale(deco.scale)
      map.add(img)
    }

    for (const node of WORLDMAP_NODES) {
      const origin = nodeOrigin(node.id)
      if (node.kind === 'locked') {
        if (!this.textures.exists(node.textureNormal)) continue
        map
          .add(this.add.image(node.x, node.y, node.textureNormal).setOrigin(origin.x, origin.y).setTint(GREY_TINT))
        continue
      }
      const campaignIndex = node.campaignIndex as number
      const state = campaignNodeVisualState(campaignIndex, this.currentIndex)
      const restTex = state === 'current' && node.textureCurrent ? node.textureCurrent : node.textureNormal
      if (!this.textures.exists(restTex)) continue
      const img = this.add.image(node.x, node.y, restTex).setOrigin(origin.x, origin.y)
      if (state === 'locked') {
        img.setTint(GREY_TINT)
      } else {
        img.setInteractive({ useHandCursor: true })
        img.on('pointerover', () => {
          if (node.textureHover && this.textures.exists(node.textureHover)) img.setTexture(node.textureHover)
        })
        img.on('pointerout', () => img.setTexture(restTex))
        img.on('pointerdown', () => this.tryEnterLevel(campaignIndex))
      }
      map.add(img)
    }

    for (const chest of WORLDMAP_CHESTS) {
      if (!this.textures.exists(chest.textureNormal)) continue
      map.add(this.add.image(chest.x, chest.y, chest.textureNormal).setOrigin(0, 0))
    }

    for (const btn of WORLDMAP_BUTTONS) {
      if (!this.textures.exists(btn.texture)) continue
      const img = this.add.image(btn.x, btn.y, btn.texture).setOrigin(0, 0).setInteractive({ useHandCursor: true })
      if (!btn.enabled) img.setTint(GREY_TINT).setAlpha(0.75)
      img.on('pointerdown', () => this.onButton(btn))
      map.add(img)
    }
  }

  private tryEnterLevel(campaignIndex: number): boolean {
    if (!isCampaignLevelUnlocked(campaignIndex, this.currentIndex)) return false
    this.npcClient?.dispose()
    this.scene.start(SCENE.battle, { campaignIndex })
    return true
  }

  private onButton(btn: WorldMapButton): void {
    if (!btn.enabled) {
      this.toastUi.show('敬请期待', '#c8cfe6')
      return
    }
    if (btn.action === 'save') this.doSave()
    else if (btn.action === 'furnace') this.openFurnace()
    else if (btn.action === 'back') this.goToMainMenu()
  }

  private doSave(): void {
    this.persistSlot()
    // Verbatim export.SelectPLace.saveGame() flavor text (tasks/worldmap-report.md).
    this.toastUi.show('存档成功，记得时常备份存档！', '#ffd873')
  }

  private goToMainMenu(): void {
    this.npcClient?.dispose()
    this.scene.start(SCENE.mainMenu)
  }

  private persistSlot(): void {
    if (this.slot === null) return
    const storage = shellStorage()
    const save = createGameSave({
      progression: this.loaded.progression,
      equipment: this.loaded.equipment,
      inventory: this.loaded.inventory,
    })
    writeSlot(storage, this.slot, buildSlotEnvelope(save, this.playtimeSec))
    writeCampaignIndex(storage, this.slot, this.currentIndex)
  }

  // ---------- forge (炼丹炉) ----------
  // Same protocol as BattleScene's forge (systems/furnace: lock -> request ->
  // validate -> consume/refund), just sourced from the persisted slot
  // inventory instead of a live battle Inventory, and persisted back to the
  // slot on a successful craft.

  private buildFurnace(): void {
    this.furnacePanel = new FurnacePanel(this, {
      iconKeyFor: (item) => (this.textures.exists('icon_' + item.id) ? 'icon_' + item.id : ICON_FALLBACK_KEY),
      budgetPreview: (lots) => this.craftBudgetLine(lots),
      onCraftSubmit: (description, lots) => this.submitCraft(description, lots),
    })
  }

  private craftBudgetLine(lots: MaterialLot[]): string {
    if (lots.length === 0) return '炉火预算：0 点（先择材）'
    const b = computeBudget(lots)
    return `炉火预算：${b.points} 点（atk≤${b.caps.atk} def≤${b.caps.def} hp≤${b.caps.hp}）`
  }

  private bagMaterials(): CraftMaterialOption[] {
    return listStacks(this.loaded.inventory)
      .filter((s) => s.item.kind === 'material')
      .map((s) => ({ item: s.item, owned: s.qty }))
  }

  private openFurnace(): void {
    if (this.craftPending) {
      this.toastUi.show('老君正在炼制上一件…', '#c8cfe6')
      return
    }
    const mats = this.bagMaterials()
    if (mats.length === 0) {
      this.toastUi.show('囊中空空，先去打些妖怪取材吧', '#c8cfe6')
      return
    }
    this.furnacePanel.open(mats)
  }

  private submitCraft(description: string, lots: MaterialLot[]): void {
    if (this.craftPending) return
    if (lots.length === 0) {
      this.toastUi.show('先择些材料入炉', '#e0b060')
      return
    }
    if (description.length === 0) {
      this.toastUi.show('说说想要什么法宝', '#e0b060')
      return
    }
    if (!this.npcClient.isOpen()) {
      this.toastUi.show('太上老君正在闭关…', '#7a7f95')
      return
    }
    const requestId = `wmcraft-${Date.now()}-${++this.craftSeq}`
    const tx = lockMaterials(this.loaded.inventory, requestId, lots)
    if (!tx) {
      this.toastUi.show('材料不足', '#e07a7a')
      return
    }
    const payload = buildCraftRequest(description, lots)
    const sent = this.npcClient.craftRequest(NPC_ID, requestId, description, payload.materials, payload.budget, 'p1')
    if (!sent) {
      refundMaterials(this.loaded.inventory, tx)
      this.toastUi.show('太上老君正在闭关…材料已退回', '#7a7f95')
      return
    }
    const timer = this.time.delayedCall(20000, () => this.onCraftTimeout(requestId))
    this.craftPending = { requestId, tx, budget: payload.budget, timer }
    this.furnacePanel.setCraftLocked(true)
    this.furnacePanel.clearInput()
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
      addItem(this.loaded.inventory, validation.item, 1)
      this.furnacePanel.setResult(validation.item)
      this.toastUi.show(`炼成【${validation.item.name}】`, '#ffd873')
      this.persistSlot()
    } else {
      refundMaterials(this.loaded.inventory, pending.tx)
      this.toastUi.show(flavor || '此宝虚影溃散，材料尚不足以定形。', '#e0b060')
    }
    this.clearCraftPending()
  }

  private onCraftReject(reason: string, requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.loaded.inventory, pending.tx)
    this.toastUi.show(`炼制未成：${reason}，材料已退回`, '#e07a7a')
    this.clearCraftPending()
  }

  private onCraftTimeout(requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.loaded.inventory, pending.tx)
    this.toastUi.show('炉火久候无成，材料已退回', '#e07a7a')
    this.clearCraftPending()
  }

  private connectNpc(): void {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const url = resolveNpcServerUrl(window.location.search, env?.VITE_NPC_SERVER_URL)
    this.npcClient = new NpcClient({ url, player: { id: 'p1', name: '悟空' } })
    this.npcClient.onMessage = (m) => this.onNpcMessage(m)
    this.npcClient.connect()
  }

  private onNpcMessage(m: ServerMessage): void {
    if (m.type === 'craft_result') this.onCraftResult(m.item, m.flavor, m.requestId)
    else if (m.type === 'craft_reject') this.onCraftReject(m.reason, m.requestId)
  }

  // ---------- acceptance hooks ----------

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.worldMap
    w.__shellMapState = () => ({
      slot: this.slot,
      currentIndex: this.currentIndex,
      nodes: WORLDMAP_NODES.filter((n) => n.kind === 'campaign').map((n) => ({
        id: n.id,
        campaignIndex: n.campaignIndex,
        state: campaignNodeVisualState(n.campaignIndex as number, this.currentIndex),
      })),
      buttons: WORLDMAP_BUTTONS.map((b) => ({ id: b.id, action: b.action, enabled: b.enabled })),
    })
    w.__shellMapEnterLevel = (idx: number) => this.tryEnterLevel(idx)
    w.__shellMapAction = (action: WorldMapButtonAction) => {
      const btn = WORLDMAP_BUTTONS.find((b) => b.action === action)
      if (btn) this.onButton(btn)
    }
    w.__shellMapCraftState = () => ({
      pending: !!this.craftPending,
      craftOpen: this.furnacePanel.isOpen,
      npcOnline: this.npcClient.isOpen(),
      materials: this.bagMaterials().map((m) => ({ id: m.item.id, name: m.item.name, qty: m.owned })),
    })
    w.__shellMapSubmitCraft = (description: string, sel: { id: string; qty: number }[]) => {
      const stacks = listStacks(this.loaded.inventory)
      const lots: MaterialLot[] = []
      for (const s of sel) {
        const stack = stacks.find((st) => st.item.id === s.id)
        if (stack) lots.push({ item: stack.item, qty: s.qty })
      }
      this.submitCraft(description, lots)
      return { pending: !!this.craftPending, requestId: this.craftPending?.requestId ?? null }
    }
  }
}
