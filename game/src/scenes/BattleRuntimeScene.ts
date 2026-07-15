import Phaser from 'phaser'
import {
  BattleRuntime,
  TICK_MS,
  stableHash,
  type BattleCommand,
  type BattleDefinition,
  type BattleEvent,
  type BattleSnapshot,
  type CombatActorSnapshot,
} from '@zaixu/game-core'
import { BattleRuntimeInput } from '../adapters/battleRuntimeInput'
import { persistBattleRuntimeClear } from '../adapters/battleRuntimeSettlement'
import { compileBattleRuntimeProfile, type CompiledBattleRuntimeProfile } from '../adapters/battleRuntimeProfile'
import {
  presentationForActor,
  snapshotAction,
  speciesForActor,
} from '../adapters/battleRuntimePresentation'
import { compileSl11BattleDefinition } from '../adapters/sl11BattleDefinition'
import { compileSl11RuntimeGateDefinition, useSl11RuntimeGate } from '../adapters/sl11RuntimeGateDefinition'
import { compileSl12BattleDefinition } from '../adapters/sl12BattleDefinition'
import { compileSl12RuntimeGateDefinition } from '../adapters/sl12RuntimeGateDefinition'
import monster2Raw from '../data/monsters/monster2.json'
import monster3Raw from '../data/monsters/monster3.json'
import monster4Raw from '../data/monsters/monster4.json'
import monster7Raw from '../data/monsters/monster7.json'
import monster8Raw from '../data/monsters/monster8.json'
import monster30Raw from '../data/monsters/monster30.json'
import role1Raw from '../data/roles/role1.json'
import { registerRoleAnimations } from '../presentation/registerRoleAnimations'
import type { RoleData } from '../systems/roleData'
import { restoreGameState } from '../systems/save'
import { asSlotId, type SlotId } from '../systems/saveSlots'
import { readSlot } from '../systems/saveSlots'
import { RoleInfoHud } from '../ui/hud/RoleInfoHud'
import { SkillBarHud } from '../ui/hud/SkillBarHud'
import { HUD_ICONS, HUD_TEXTURES, ONLINE_TEXTURES } from '../ui/hud/hudTheme'
import type { BattleData } from './BattleLoadingScene'
import { REG, SCENE, shellStorage } from './shellShared'

export const BATTLE_RUNTIME_READY_EVENT = 'battle-runtime-ready'

const HERO_ID = 'hero-1'
const HERO_TEXTURE = 'runtime-role1'
const WEAPON_SHOW_IDS = [0, 1, 2] as const
const LOOPING_ACTIONS = new Set(['wait', 'wait2', 'walk', 'run'])
const MONSTER_LOOPING_ACTIONS = new Set(['wait', 'walk'])
const TRANSFER_FRAME_COUNT = 10
const SLZ_EFFECT_FRAME_COUNT = 6
const roleData = role1Raw as RoleData
const monsterData: Record<string, RoleData> = {
  monster2: monster2Raw as RoleData,
  monster3: monster3Raw as RoleData,
  monster4: monster4Raw as RoleData,
  monster7: monster7Raw as RoleData,
  monster8: monster8Raw as RoleData,
  monster30: monster30Raw as RoleData,
}

interface ActorView {
  sprite: Phaser.GameObjects.Sprite
  hp: Phaser.GameObjects.Graphics
}

export class BattleRuntimeScene extends Phaser.Scene {
  private definition!: BattleDefinition
  private runtime!: BattleRuntime
  private snapshot!: BattleSnapshot
  private inputAdapter = new BattleRuntimeInput()
  private accumulatorMs = 0
  private readonly actorViews = new Map<string, ActorView>()
  private readonly projectileViews = new Map<string, Phaser.GameObjects.Image>()
  private keys!: Record<
    'left' | 'right' | 'jump' | 'attack' | 'interact' | 'skillY' | 'skillU' | 'skillI' | 'skillO' | 'skillL',
    Phaser.Input.Keyboard.Key
  >
  private weapon!: Phaser.GameObjects.Sprite
  private portal?: Phaser.GameObjects.Container
  private heroHud!: RoleInfoHud
  private skillBar!: SkillBarHud
  private status!: Phaser.GameObjects.Text
  private respawnNotice?: Phaser.GameObjects.Text
  private skillEffect?: Phaser.GameObjects.Sprite
  private eventLog: BattleEvent[] = []
  private campaignIndex = 0
  private activeSlot: SlotId | null = null
  private clearTransitionScheduled = false
  private manualMode = false
  private runtimeProfile?: CompiledBattleRuntimeProfile

  constructor() {
    super(SCENE.battleRuntime)
  }

  init(data?: BattleData): void {
    this.inputAdapter = new BattleRuntimeInput()
    this.accumulatorMs = 0
    this.eventLog = []
    this.actorViews.clear()
    this.projectileViews.clear()
    this.portal = undefined
    this.respawnNotice = undefined
    this.skillEffect = undefined
    this.campaignIndex = data?.campaignIndex ?? 0
    this.activeSlot = data?.activeSlot ?? asSlotId(this.registry.get(REG.activeSlot))
    const saved = this.activeSlot === null ? undefined : readSlot(shellStorage(), this.activeSlot)
    this.runtimeProfile = saved ? compileBattleRuntimeProfile(restoreGameState(saved.save)) : undefined
    this.definition = this.compileDefinition()
    this.clearTransitionScheduled = false
    this.manualMode = false
  }

  preload(): void {
    this.load.spritesheet(HERO_TEXTURE, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    for (const showId of WEAPON_SHOW_IDS) {
      this.load.spritesheet(`runtime-role1-equip${showId}`, `assets/extracted/role1_equip${showId}.png`, {
        frameWidth: roleData.sheet.cellW,
        frameHeight: roleData.sheet.cellH,
      })
    }
    for (const asset of [...HUD_TEXTURES, ...HUD_ICONS, ...ONLINE_TEXTURES]) {
      if (![
        'hud_avatar_wukong', 'hud_ri_bg', 'hud_ri_head', 'hud_ri_hp', 'hud_ri_mp', 'hud_ri_exp',
        'hud_ri_rage', 'skilldock', 'skill_slz',
      ].includes(asset.key)) continue
      if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.url)
    }
    for (const species of Object.keys(this.definition.monsters)) {
      const data = monsterData[species]
      const number = species.slice('monster'.length)
      const file = species === 'monster30' ? 'Monster30_clean' : `Monster${number}`
      this.load.spritesheet(`runtime-${species}`, `assets/extracted/level1/${file}.png`, {
        frameWidth: data.sheet.cellW,
        frameHeight: data.sheet.cellH,
      })
    }
    this.load.image('runtime-pillar', 'assets/generated/pillar_wall.jpg')
    this.load.image('runtime-platform', 'assets/generated/platform_beam.png')
    this.load.image('runtime-cloud-1', 'assets/generated/cloud_puff1.png')
    this.load.image('runtime-cloud-2', 'assets/generated/cloud_puff2.png')
    this.load.image('runtime-floor-bg', 'assets/extracted/level1/floorBg1.png')
    this.load.image('runtime-sl12-foreground', 'assets/extracted/level1/bg12.png')
    this.load.image('runtime-sl12-floor', 'assets/extracted/level1/online_floor12_full.png')
    this.load.image('runtime-projectile', 'assets/extracted/level1/hit1-effects/Monster30Bullet1/01.png')
    for (let frame = 1; frame <= TRANSFER_FRAME_COUNT; frame += 1) {
      this.load.image(`runtime-transfer-${frame}`, `assets/extracted/effects/transferwind_${frame}.png`)
    }
    for (let frame = 1; frame <= SLZ_EFFECT_FRAME_COUNT; frame += 1) {
      const label = String(frame).padStart(2, '0')
      this.load.image(`runtime-slz-${label}`, `assets/extracted/role1-effects/hit6/${label}.png`)
    }
    this.load.audio('runtime-hit12', 'assets/audio/Role1_hit1AndHit2.mp3')
    this.load.audio('runtime-hit34', 'assets/audio/Role1_hit3AndHit4.mp3')
    this.load.audio('runtime-hit5', 'assets/audio/Role1_hit5.mp3')
    this.load.audio('runtime-mon-hurt', 'assets/audio/BeattackByRole1.mp3')
    this.load.audio('runtime-slz-sound', 'assets/audio/Role1_hit6.mp3')
  }

  create(): void {
    this.runtime = new BattleRuntime(this.definition)
    this.snapshot = this.runtime.getSnapshot()
    this.registerAnimations()
    this.buildWorld()
    this.bindInput()
    this.renderSnapshot()
    this.installObservationHook()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    this.events.emit(BATTLE_RUNTIME_READY_EVENT)
  }

  update(_time: number, deltaMs: number): void {
    if (this.manualMode) return
    this.accumulatorMs += Math.min(deltaMs, TICK_MS * 8)
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS
      const nextTick = this.snapshot.tick + 1
      for (const command of this.inputAdapter.sample(HERO_ID, nextTick, {
        left: this.keys.left.isDown,
        right: this.keys.right.isDown,
        jump: this.keys.jump.isDown,
        attack: this.keys.attack.isDown,
        interact: this.keys.interact.isDown,
        skillId: this.activeBoundSkill(),
      })) this.runtime.enqueue(command)
      this.advanceRuntime()
    }
  }

  private registerAnimations(): void {
    registerRoleAnimations(this.anims, roleData, HERO_TEXTURE, LOOPING_ACTIONS, 'runtime-hero-')
    for (const showId of WEAPON_SHOW_IDS) {
      registerRoleAnimations(
        this.anims,
        roleData,
        `runtime-role1-equip${showId}`,
        LOOPING_ACTIONS,
        `runtime-weapon-${showId}-`,
      )
    }
    for (const species of Object.keys(this.definition.monsters)) {
      const data = monsterData[species]
      registerRoleAnimations(this.anims, data, `runtime-${species}`, MONSTER_LOOPING_ACTIONS, `runtime-${species}-`)
    }
    if (!this.anims.exists('runtime-transfer')) {
      this.anims.create({
        key: 'runtime-transfer',
        frames: Array.from({ length: TRANSFER_FRAME_COUNT }, (_, index) => ({ key: `runtime-transfer-${index + 1}` })),
        frameRate: 18,
        repeat: -1,
      })
    }
    if (!this.anims.exists('runtime-slz-effect')) {
      this.anims.create({
        key: 'runtime-slz-effect',
        frames: Array.from({ length: SLZ_EFFECT_FRAME_COUNT }, (_, index) => ({
          key: `runtime-slz-${String(index + 1).padStart(2, '0')}`,
        })),
        frameRate: 24,
        repeat: 0,
      })
    }
  }

  private buildWorld(): void {
    const { bounds, walls } = this.definition.level
    this.cameras.main.setBackgroundColor('#d7edf5')
    const cameraBottomPadding = 120
    this.cameras.main.setBounds(
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top + cameraBottomPadding,
    )
    if (this.definition.level.id === 'sl12') {
      const base = this.add.tileSprite(
        bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
        'runtime-floor-bg',
      ).setOrigin(0).setDepth(-30)
      base.setTileScale(540 / 690)
      this.add.image(0, -56, 'runtime-sl12-foreground').setOrigin(0).setDepth(-10)
      this.add.image(-200, 405, 'runtime-sl12-floor').setOrigin(0).setDepth(2)
    } else {
      const background = this.add.tileSprite(
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top,
      'runtime-pillar',
      ).setOrigin(0).setDepth(-30)
      background.setTileScale(0.95)

      const beamHeight = 42
      for (const wall of walls) {
        if (wall.width < wall.height * 2) continue
        const beam = this.add.tileSprite(wall.x, wall.y, wall.width, beamHeight, 'runtime-platform')
          .setOrigin(0).setDepth(2)
        beam.setTileScale(beamHeight / 292)
      }
      const floor = this.add.tileSprite(bounds.left, 400, bounds.right - bounds.left, 72, 'runtime-platform')
        .setOrigin(0).setDepth(2)
      floor.setTileScale(72 / 292)
      for (const [x, y, key] of [
        [180, 180, 'runtime-cloud-1'], [820, -180, 'runtime-cloud-2'],
        [260, -760, 'runtime-cloud-2'], [760, -1320, 'runtime-cloud-1'],
        [250, -1840, 'runtime-cloud-2'],
      ] as const) {
        this.add.image(x, y, key).setAlpha(0.38).setDepth(-10)
      }
    }

    this.weapon = this.add.sprite(0, 0, this.weaponTexture()).setScale(1.5).setDepth(11)
    this.heroHud = new RoleInfoHud(this, 12, 10, { scale: 1.05 })
    this.skillBar = new SkillBarHud(this, 2, 366, { scale: 1.2 })
    this.skillBar.setSlots((['Y', 'U', 'I', 'O', 'L'] as const).map((hotkey) => ({
      hotkey,
      skillId: this.runtimeProfile?.hud.bindings[hotkey] ?? undefined,
      disabled: !this.runtimeProfile?.hud.bindings[hotkey],
    })))
    this.status = this.add.text(948, 12, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#fff7df',
      stroke: '#2c1b13', strokeThickness: 4,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
  }

  private bindInput(): void {
    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.K,
      attack: Phaser.Input.Keyboard.KeyCodes.J,
      interact: Phaser.Input.Keyboard.KeyCodes.UP,
      skillY: Phaser.Input.Keyboard.KeyCodes.Y,
      skillU: Phaser.Input.Keyboard.KeyCodes.U,
      skillI: Phaser.Input.Keyboard.KeyCodes.I,
      skillO: Phaser.Input.Keyboard.KeyCodes.O,
      skillL: Phaser.Input.Keyboard.KeyCodes.L,
    }) as typeof this.keys
  }

  private renderSnapshot(): void {
    const seen = new Set<string>()
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id)
      const view = this.actorViews.get(actor.id) ?? this.createActorView(actor)
      this.renderActor(actor, view)
    }
    for (const [id, view] of this.actorViews) {
      if (seen.has(id)) continue
      view.sprite.destroy()
      view.hp.destroy()
      this.actorViews.delete(id)
    }
    this.renderProjectiles()
    this.positionSkillEffect()
    this.renderPortal()
    const hero = this.snapshot.actors[0]
    this.heroHud.update({
      level: this.runtimeProfile?.hud.level ?? 1,
      hp: hero.hp,
      maxHp: hero.maxHp,
      mp: this.snapshot.heroSkill.mp,
      maxMp: this.snapshot.heroSkill.maxMp,
      exp: this.runtimeProfile?.hud.exp ?? 0,
      expToNext: this.runtimeProfile?.hud.expToNext ?? 1,
      atk: this.definition.hero.atk,
      weaponName: this.runtimeProfile?.hud.weaponName ?? '行者棍',
    })
    this.status.setText(`${this.definition.level.id}  tick ${this.snapshot.tick}\n${stableHash(this.runtime.getDeterministicState())}`)
    const active = this.snapshot.heroSkill.activeSkillId
    const definition = active ? this.definition.hero.skills[active] : undefined
    const remaining = Math.max(0, this.snapshot.heroSkill.cooldownUntilTick - this.snapshot.tick)
    const cooldownFrac = definition && definition.cooldownTicks > 0 ? remaining / definition.cooldownTicks : 0
    const bindings = this.runtimeProfile?.hud.bindings
    for (const [index, hotkey] of (['Y', 'U', 'I', 'O', 'L'] as const).entries()) {
      this.skillBar.setCooldown(index, bindings?.[hotkey] ? cooldownFrac : 0)
    }
  }

  private activeBoundSkill(): string | null {
    const bindings = this.runtimeProfile?.hud.bindings
    for (const [hotkey, key] of [
      ['Y', this.keys.skillY], ['U', this.keys.skillU], ['I', this.keys.skillI],
      ['O', this.keys.skillO], ['L', this.keys.skillL],
    ] as const) {
      if (key.isDown && bindings?.[hotkey]) return bindings[hotkey]
    }
    return null
  }

  private createActorView(actor: CombatActorSnapshot): ActorView {
    const presentation = presentationForActor(this.definition, actor)
    const sprite = this.add.sprite(0, 0, presentation.texture).setScale(presentation.scale).setDepth(actor.kind === 'hero' ? 10 : 8)
    const hp = this.add.graphics().setDepth(20)
    const view = { sprite, hp }
    this.actorViews.set(actor.id, view)
    if (actor.kind === 'hero') this.cameras.main.startFollow(sprite, true, 0.12, 0.12)
    return view
  }

  private renderActor(actor: CombatActorSnapshot, view: ActorView): void {
    const presentation = presentationForActor(this.definition, actor)
    const x = actor.x + presentation.offset.x
    const y = actor.y + presentation.offset.y
    const visible = actor.lifeState !== 'removed'
    view.sprite.setPosition(x, y).setFlipX(actor.facing === 1).setVisible(visible)
    if (visible) view.sprite.play(`${presentation.animationPrefix}${snapshotAction(actor)}`, true)
    view.hp.clear()
    if (actor.kind === 'monster' && visible) {
      const width = ['monster2', 'monster3', 'monster4'].includes(speciesForActor(actor) ?? '') ? 130 : 68
      view.hp.fillStyle(0x210f0f, 0.85).fillRect(x - width / 2, y - 100, width, 7)
      view.hp.fillStyle(0xe04436, 1).fillRect(x - width / 2 + 1, y - 99, (width - 2) * actor.hp / actor.maxHp, 5)
    }
    if (actor.kind === 'hero') {
      const weaponTexture = this.weaponTexture()
      if (this.weapon.texture.key !== weaponTexture) this.weapon.setTexture(weaponTexture)
      this.weapon.setPosition(x, y).setFlipX(actor.facing === 1).setVisible(visible)
      if (visible) this.weapon.play(`runtime-weapon-${this.snapshot.heroEquipment.weaponShowId}-${snapshotAction(actor)}`, true)
    }
  }

  private weaponTexture(): string {
    return `runtime-role1-equip${this.snapshot?.heroEquipment.weaponShowId ?? this.runtimeProfile?.combat.weaponShowId ?? 0}`
  }

  private renderProjectiles(): void {
    const seen = new Set<string>()
    for (const projectile of this.snapshot.projectiles) {
      seen.add(projectile.id)
      const view = this.projectileViews.get(projectile.id)
        ?? this.add.image(projectile.x, projectile.y, 'runtime-projectile').setScale(0.8).setDepth(14)
      view.setPosition(projectile.x, projectile.y).setRotation(Math.atan2(projectile.vy, projectile.vx))
      this.projectileViews.set(projectile.id, view)
    }
    for (const [id, view] of this.projectileViews) {
      if (seen.has(id)) continue
      view.destroy()
      this.projectileViews.delete(id)
    }
  }

  private renderPortal(): void {
    if (!this.snapshot.level.doorVisible) return
    const door = this.definition.level.door
    if (!this.portal) {
      const swirl = this.add.sprite(0, 0, 'runtime-transfer-1').setScale(1.4).play('runtime-transfer')
      const arrow = this.add.text(0, -105, '↑', {
        fontSize: '46px', color: '#ffffff', stroke: '#1768a8', strokeThickness: 8,
      }).setOrigin(0.5)
      const label = this.add.text(0, -68, '传送', {
        fontSize: '19px', color: '#ffffff', stroke: '#16466b', strokeThickness: 5,
      }).setOrigin(0.5)
      this.portal = this.add.container(door.x + door.width / 2, door.y + door.height / 2, [swirl, arrow, label]).setDepth(15)
      this.tweens.add({ targets: arrow, y: -116, duration: 500, yoyo: true, repeat: -1 })
    }
    this.portal.setVisible(true)
  }

  private presentEvents(events: readonly BattleEvent[]): void {
    for (const event of events) {
      if (event.type === 'attack-started' && event.sourceId === HERO_ID) {
        const key = event.action === 'hit5' ? 'runtime-hit5'
          : event.action === 'hit3' || event.action === 'hit4' ? 'runtime-hit34' : 'runtime-hit12'
        this.sound.play(key, { volume: 0.7 })
      } else if (event.type === 'damage-applied' && event.sourceId === HERO_ID) {
        this.sound.play('runtime-mon-hurt', { volume: 0.6 })
      } else if (event.type === 'skill-cast' && event.sourceId === HERO_ID) {
        this.presentSkillCast(event.skillId)
      } else if (event.type === 'actor-defeated' && event.actorId === HERO_ID) {
        this.showRespawnNotice()
      } else if (event.type === 'actor-respawned' && event.actorId === HERO_ID) {
        this.respawnNotice?.destroy()
        this.respawnNotice = undefined
      } else if (event.type === 'stage-cleared') {
        this.finishStage()
      }
    }
  }

  private showRespawnNotice(): void {
    if (this.respawnNotice) return
    this.respawnNotice = this.add.text(480, 174, '魂归原位', {
      fontSize: '42px', color: '#f4e5ca', stroke: '#361b16', strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
  }

  private presentSkillCast(skillId: string): void {
    if (skillId !== 'slz') return
    this.sound.play('runtime-slz-sound', { volume: 0.65 })
    this.skillEffect?.destroy()
    this.skillEffect = this.add.sprite(0, 0, 'runtime-slz-01').setDepth(14).play('runtime-slz-effect')
    this.skillEffect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.skillEffect?.destroy()
      this.skillEffect = undefined
    })
    this.positionSkillEffect()
  }

  private positionSkillEffect(): void {
    if (!this.skillEffect) return
    const hero = this.snapshot.actors[0]
    const facing = hero.facing
    this.skillEffect
      .setPosition(
        hero.x + this.definition.hero.collisionOffset.x + facing * 30,
        hero.y + this.definition.hero.collisionOffset.y + 40,
      )
      .setFlipX(facing === 1)
  }

  private finishStage(): void {
    if (this.clearTransitionScheduled) return
    this.clearTransitionScheduled = true
    persistBattleRuntimeClear(
      shellStorage(),
      this.activeSlot,
      this.campaignIndex,
    )
    this.add.text(480, 170, `${this.definition.level.id === 'sl12' ? '天宫道' : '九重天'} · 通关`, {
      fontSize: '48px', color: '#fff1b0', stroke: '#5a250f', strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.time.delayedCall(900, () => this.scene.start(SCENE.worldMap))
  }

  private installObservationHook(): void {
    if (!useSl11RuntimeGate(window.location.search)) return
    window.__battleRuntime = {
      getSnapshot: () => structuredClone(this.runtime.getSnapshot()),
      getEvents: () => structuredClone(this.eventLog),
      getHash: () => stableHash(this.runtime.getDeterministicState()),
      enqueue: (command) => this.runtime.enqueue(command as BattleCommand),
      setManualMode: (enabled) => { this.manualMode = enabled },
      step: (ticks = 1) => structuredClone(this.advanceRuntime(ticks)),
    }
  }

  private compileDefinition(): BattleDefinition {
    if (this.campaignIndex === 1) {
      return useSl11RuntimeGate(window.location.search)
        ? compileSl12RuntimeGateDefinition(0x5a17, this.runtimeProfile?.combat)
        : compileSl12BattleDefinition(0x5a17, this.runtimeProfile?.combat)
    }
    return useSl11RuntimeGate(window.location.search)
      ? compileSl11RuntimeGateDefinition(0x5a17, this.runtimeProfile?.combat)
      : compileSl11BattleDefinition(0x5a17, this.runtimeProfile?.combat)
  }

  private advanceRuntime(ticks = 1): BattleSnapshot {
    const events = this.runtime.step(ticks)
    this.eventLog.push(...events)
    if (this.eventLog.length > 300) this.eventLog.splice(0, this.eventLog.length - 300)
    this.presentEvents(events)
    this.snapshot = this.runtime.getSnapshot()
    this.renderSnapshot()
    return this.snapshot
  }

  private shutdown(): void {
    delete window.__battleRuntime
    this.portal?.destroy(true)
    this.respawnNotice?.destroy()
    this.skillEffect?.destroy()
    this.heroHud.container.destroy(true)
    this.skillBar.container.destroy(true)
  }
}
