import Phaser from 'phaser'
import {
  BattleRuntime,
  TICK_MS,
  stableHash,
  type BattleDefinition,
  type BattleEvent,
  type BattleSnapshot,
  type CombatActorSnapshot,
} from '@zaixu/game-core'
import { BattleRuntimeInput } from '../adapters/battleRuntimeInput'
import { persistBattleRuntimeClear } from '../adapters/battleRuntimeSettlement'
import {
  presentationForActor,
  snapshotAction,
  speciesForActor,
} from '../adapters/battleRuntimePresentation'
import { compileSl11BattleDefinition } from '../adapters/sl11BattleDefinition'
import monster3Raw from '../data/monsters/monster3.json'
import monster30Raw from '../data/monsters/monster30.json'
import role1Raw from '../data/roles/role1.json'
import { registerRoleAnimations } from '../presentation/registerRoleAnimations'
import type { RoleData } from '../systems/roleData'
import { asSlotId } from '../systems/saveSlots'
import { RoleInfoHud } from '../ui/hud/RoleInfoHud'
import type { BattleData } from './BattleLoadingScene'
import { REG, SCENE, shellStorage } from './shellShared'

export const BATTLE_RUNTIME_READY_EVENT = 'battle-runtime-ready'

const HERO_ID = 'hero-1'
const HERO_TEXTURE = 'runtime-role1'
const WEAPON_TEXTURE = 'runtime-role1-equip0'
const LOOPING_ACTIONS = new Set(['wait', 'wait2', 'walk', 'run'])
const MONSTER_LOOPING_ACTIONS = new Set(['wait', 'walk'])
const TRANSFER_FRAME_COUNT = 10
const roleData = role1Raw as RoleData
const monsterData: Record<string, RoleData> = {
  monster3: monster3Raw as RoleData,
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
  private keys!: Record<'left' | 'right' | 'jump' | 'attack' | 'interact', Phaser.Input.Keyboard.Key>
  private weapon!: Phaser.GameObjects.Sprite
  private portal?: Phaser.GameObjects.Container
  private heroHud!: RoleInfoHud
  private status!: Phaser.GameObjects.Text
  private respawnNotice?: Phaser.GameObjects.Text
  private eventLog: BattleEvent[] = []
  private campaignIndex = 0
  private clearTransitionScheduled = false

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
    this.campaignIndex = data?.campaignIndex ?? 0
    this.clearTransitionScheduled = false
  }

  preload(): void {
    this.load.spritesheet(HERO_TEXTURE, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(WEAPON_TEXTURE, 'assets/extracted/role1_equip0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    for (const species of ['monster3', 'monster30']) {
      const data = monsterData[species]
      this.load.spritesheet(`runtime-${species}`, `assets/extracted/level1/${species === 'monster3' ? 'Monster3' : 'Monster30_clean'}.png`, {
        frameWidth: data.sheet.cellW,
        frameHeight: data.sheet.cellH,
      })
    }
    this.load.image('runtime-pillar', 'assets/generated/pillar_wall.jpg')
    this.load.image('runtime-platform', 'assets/generated/platform_beam.png')
    this.load.image('runtime-cloud-1', 'assets/generated/cloud_puff1.png')
    this.load.image('runtime-cloud-2', 'assets/generated/cloud_puff2.png')
    this.load.image('runtime-projectile', 'assets/extracted/level1/hit1-effects/Monster30Bullet1/01.png')
    for (let frame = 1; frame <= TRANSFER_FRAME_COUNT; frame += 1) {
      this.load.image(`runtime-transfer-${frame}`, `assets/extracted/effects/transferwind_${frame}.png`)
    }
    this.load.audio('runtime-hit12', 'assets/audio/Role1_hit1AndHit2.mp3')
    this.load.audio('runtime-hit34', 'assets/audio/Role1_hit3AndHit4.mp3')
    this.load.audio('runtime-hit5', 'assets/audio/Role1_hit5.mp3')
    this.load.audio('runtime-mon-hurt', 'assets/audio/BeattackByRole1.mp3')
  }

  create(): void {
    this.definition = compileSl11BattleDefinition(0x5a17)
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
      })) this.runtime.enqueue(command)
      const events = this.runtime.step()
      this.eventLog.push(...events)
      if (this.eventLog.length > 300) this.eventLog.splice(0, this.eventLog.length - 300)
      this.presentEvents(events)
      this.snapshot = this.runtime.getSnapshot()
      this.renderSnapshot()
    }
  }

  private registerAnimations(): void {
    registerRoleAnimations(this.anims, roleData, HERO_TEXTURE, LOOPING_ACTIONS, 'runtime-hero-')
    registerRoleAnimations(this.anims, roleData, WEAPON_TEXTURE, LOOPING_ACTIONS, 'runtime-weapon-')
    for (const [species, data] of Object.entries(monsterData)) {
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

    this.weapon = this.add.sprite(0, 0, WEAPON_TEXTURE).setScale(1.5).setDepth(11)
    this.heroHud = new RoleInfoHud(this, 12, 10, { scale: 1.05 })
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
    this.renderPortal()
    const hero = this.snapshot.actors[0]
    this.heroHud.update({
      level: 1,
      hp: hero.hp,
      maxHp: hero.maxHp,
      mp: 0,
      maxMp: 1,
      exp: 0,
      expToNext: 1,
      atk: this.definition.hero.atk,
      weaponName: '行者棍',
    })
    this.status.setText(`sl11  tick ${this.snapshot.tick}\n${stableHash(this.runtime.getDeterministicState())}`)
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
      const width = speciesForActor(actor) === 'monster3' ? 130 : 68
      view.hp.fillStyle(0x210f0f, 0.85).fillRect(x - width / 2, y - 100, width, 7)
      view.hp.fillStyle(0xe04436, 1).fillRect(x - width / 2 + 1, y - 99, (width - 2) * actor.hp / actor.maxHp, 5)
    }
    if (actor.kind === 'hero') {
      this.weapon.setPosition(x, y).setFlipX(actor.facing === 1).setVisible(visible)
      if (visible) this.weapon.play(`runtime-weapon-${snapshotAction(actor)}`, true)
    }
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

  private finishStage(): void {
    if (this.clearTransitionScheduled) return
    this.clearTransitionScheduled = true
    persistBattleRuntimeClear(
      shellStorage(),
      asSlotId(this.registry.get(REG.activeSlot)),
      this.campaignIndex,
    )
    this.add.text(480, 170, '九重天 · 通关', {
      fontSize: '48px', color: '#fff1b0', stroke: '#5a250f', strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.time.delayedCall(900, () => this.scene.start(SCENE.worldMap))
  }

  private installObservationHook(): void {
    window.__battleRuntime = {
      getSnapshot: () => structuredClone(this.runtime.getSnapshot()),
      getEvents: () => structuredClone(this.eventLog),
      getHash: () => stableHash(this.runtime.getDeterministicState()),
      step: (ticks = 1) => {
        this.eventLog.push(...this.runtime.step(ticks))
        this.snapshot = this.runtime.getSnapshot()
        this.renderSnapshot()
        return structuredClone(this.snapshot)
      },
    }
  }

  private shutdown(): void {
    delete window.__battleRuntime
    this.portal?.destroy(true)
    this.respawnNotice?.destroy()
    this.heroHud.container.destroy(true)
  }
}
