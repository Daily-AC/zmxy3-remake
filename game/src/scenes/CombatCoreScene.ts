import Phaser from 'phaser'
import {
  CombatSession,
  TICK_MS,
  createCombatRecording,
  stableHash,
  type CombatActorSnapshot,
  type CombatCommand,
  type CombatEvent,
  type CombatSessionDefinition,
  type CombatSnapshot,
} from '@zaixu/game-core'
import { PRESENTATION_CONTRACT_VERSION } from '@zaixu/presentation-contract'
import { PROTOCOL_VERSION } from '@zaixu/protocol'
import { SAVE_SCHEMA_VERSION } from '@zaixu/save-schema'
import { CombatCoreInput } from '../adapters/combatCoreInput'
import { buildCombatCoreSliceDefinition } from '../adapters/combatCoreDefinition'
import {
  presentationCuesFor,
  type CombatPresentationCue,
} from '../adapters/combatCorePresentation'
import { GAME_VERSION } from '../buildInfo'
import monster7Raw from '../data/monsters/monster7.json'
import role1Raw from '../data/roles/role1.json'
import {
  ROLE1_EFFECTS,
  role1EffectFrameKey,
  role1EffectFrameUrl,
  resolveRole1EffectPlacement,
  type Role1EffectAction,
} from '../data/role1Effects'
import {
  computeVisibleBottomY,
  HERO_IDLE_CONTENT,
  MONSTER_IDLE_CONTENT,
  monsterBaselineCorrectionY,
} from '../presentation/actorVisualMetrics'
import {
  PresentationHitStopGate,
  presentationActionPriority,
} from '../presentation/combatCoreHitStop'
import { registerRoleAnimations } from '../presentation/registerRoleAnimations'
import { SingleFlightSnapshotCapture } from '../presentation/singleFlightSnapshotCapture'
import type { RoleData } from '../systems/roleData'
import { MonsterHpBar } from '../ui/hud/MonsterHpBar'
import { RoleInfoHud } from '../ui/hud/RoleInfoHud'

const HERO_TEXTURE = 'role1_0'
const WEAPON_TEXTURE = 'role1_equip0'
const MONSTER_TEXTURE = 'monster7'
const HERO_SCALE = 1.5
const GROUND_Y = 400
const LOG_LIMIT = 240
const PERF_LIMIT = 600
const HERO_ID = 'hero-1'
const MONSTER_ID = 'monster-1'
const LOOPING_ACTIONS = new Set(['wait', 'wait2', 'walk', 'run'])
const EFFECT_ACTIONS = ['hit1', 'hit3', 'hit4', 'hit5'] as const
const roleData = role1Raw as RoleData
const monsterData = monster7Raw as RoleData

type VisualBaseline = 'initial' | 'hit3' | 'impact' | 'dead'
type StructuredLog = {
  scope: string
  event: string
  tick?: number
  value?: number
  version?: string
  payload?: unknown
}
type PerfSample = { workMs: number; intervalMs: number }

function boundedPush<T>(items: T[], value: T, limit = LOG_LIMIT): void {
  items.push(value)
  if (items.length > limit) items.splice(0, items.length - limit)
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function distribution(values: readonly number[]): Record<string, number> {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? 0,
  }
}

function summarizePerformance(samples: readonly PerfSample[]): Record<string, unknown> {
  const work = samples.map((sample) => sample.workMs).sort((a, b) => a - b)
  const intervals = samples.map((sample) => sample.intervalMs).filter((value) => value > 0).sort((a, b) => a - b)
  const droppedFrameCount = intervals.filter((interval) => interval > 25).length
  return {
    work: distribution(work),
    interval: {
      ...distribution(intervals),
      droppedFrameCount,
      droppedFrameRate: intervals.length === 0 ? 0 : droppedFrameCount / intervals.length,
    },
  }
}

export class CombatCoreScene extends Phaser.Scene {
  private definition!: CombatSessionDefinition
  private session!: CombatSession
  private inputAdapter = new CombatCoreInput()
  private hero!: Phaser.GameObjects.Sprite
  private weapon!: Phaser.GameObjects.Sprite
  private monster!: Phaser.GameObjects.Sprite
  private heroHud!: RoleInfoHud
  private monsterHp!: MonsterHpBar
  private diagnostic!: Phaser.GameObjects.Text
  private keys!: Record<'left' | 'right' | 'jump' | 'attack', Phaser.Input.Keyboard.Key>
  private latestSnapshot!: CombatSnapshot
  private accumulatorMs = 0
  private visualBaseline: VisualBaseline | null = null
  private activeEffect: Phaser.GameObjects.Sprite | null = null
  private readonly commandLog: CombatCommand[] = []
  private readonly commandRecording: CombatCommand[] = []
  private readonly eventLog: CombatEvent[] = []
  private readonly cueLog: CombatPresentationCue[] = []
  private readonly structuredLog: StructuredLog[] = []
  private readonly perfSamples: PerfSample[] = []
  private preStepAt = 0
  private lastPostRenderAt = 0
  private readonly hitStopGate = new PresentationHitStopGate()
  private readonly flashingActors = new Set<string>()
  private screenshotCapture: SingleFlightSnapshotCapture<
    Phaser.Display.Color | HTMLImageElement,
    string
  > | null = null

  constructor() {
    super({ key: 'combat-core-slice' })
  }

  init(): void {
    this.inputAdapter = new CombatCoreInput()
    this.accumulatorMs = 0
    this.visualBaseline = null
    this.commandLog.length = 0
    this.commandRecording.length = 0
    this.eventLog.length = 0
    this.cueLog.length = 0
    this.structuredLog.length = 0
    this.perfSamples.length = 0
    this.preStepAt = 0
    this.lastPostRenderAt = 0
    this.hitStopGate.clear()
    this.flashingActors.clear()
  }

  preload(): void {
    const onProgress = (value: number): void => this.logLoader('progress', value)
    this.load.once('start', () => this.logLoader('start'))
    this.load.on('progress', onProgress)
    this.load.once('complete', () => {
      this.load.off('progress', onProgress)
      this.logLoader('complete', 1)
    })

    this.load.spritesheet(HERO_TEXTURE, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(WEAPON_TEXTURE, 'assets/extracted/role1_equip0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    this.load.spritesheet(MONSTER_TEXTURE, 'assets/extracted/level1/Monster7.png', {
      frameWidth: monsterData.sheet.cellW,
      frameHeight: monsterData.sheet.cellH,
    })
    this.load.image('slice_bg', 'assets/extracted/level1/bg12.png')
    this.load.image('slice_floor', 'assets/extracted/level1/online_floor12.png')
    this.load.audio('hit12', 'assets/audio/Role1_hit1AndHit2.mp3')
    this.load.audio('hit34', 'assets/audio/Role1_hit3AndHit4.mp3')
    this.load.audio('hit5', 'assets/audio/Role1_hit5.mp3')
    this.load.audio('monHurt', 'assets/audio/BeattackByRole1.mp3')
    for (const action of EFFECT_ACTIONS) {
      const effect = ROLE1_EFFECTS[action]
      for (let frame = 1; frame <= effect.frames; frame += 1) {
        this.load.image(role1EffectFrameKey(action, frame), role1EffectFrameUrl(action, frame))
      }
    }
  }

  create(): void {
    const params = new URLSearchParams(window.location.search)
    const proofScenario = params.get('proofScenario')
    this.visualBaseline = this.parseVisualBaseline(params.get('visualBaseline'))
    this.definition = buildCombatCoreSliceDefinition(
      proofScenario === 'combo' ? { monsterX: 600, monsterAttackRate: 0 } : {},
    )
    this.session = new CombatSession(this.definition)
    this.latestSnapshot = this.session.getSnapshot()

    this.buildWorld()
    this.registerAnimations()
    this.buildActors()
    this.buildHud()
    this.bindInput()
    this.screenshotCapture = new SingleFlightSnapshotCapture({
      request: (callback) => this.game.renderer.snapshot(callback, 'image/png'),
      decode: (image) => {
        if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
          return image.src
        }
        throw new Error('renderer snapshot returned a color instead of an image')
      },
    })
    this.installObservationHook()
    this.game.events.on(Phaser.Core.Events.PRE_STEP, this.onPreStep, this)
    this.game.events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)

    if (this.visualBaseline) this.stageVisualBaseline(this.visualBaseline)
    else this.renderSnapshot(this.latestSnapshot)
  }

  update(_time: number, deltaMs: number): void {
    if (this.visualBaseline) return
    this.accumulatorMs += Math.min(deltaMs, TICK_MS * 8)
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS
      const nextTick = this.latestSnapshot.tick + 1
      const commands = this.inputAdapter.sample(HERO_ID, nextTick, {
        left: this.keys.left.isDown,
        right: this.keys.right.isDown,
        jump: this.keys.jump.isDown,
        attack: this.keys.attack.isDown,
      })
      for (const command of commands) {
        this.session.enqueue(command)
        boundedPush(this.commandLog, structuredClone(command))
        this.commandRecording.push(structuredClone(command))
        boundedPush(this.structuredLog, {
          scope: 'command', event: command.type, tick: command.atTick, payload: structuredClone(command),
        })
      }
      const events = this.session.step()
      for (const event of events) {
        boundedPush(this.eventLog, structuredClone(event))
        boundedPush(this.structuredLog, {
          scope: 'domain', event: event.type, tick: event.tick, payload: structuredClone(event),
        })
      }
      const cues = events.flatMap(presentationCuesFor)
      for (const cue of cues) {
        boundedPush(this.cueLog, structuredClone(cue))
        boundedPush(this.structuredLog, {
          scope: 'presentation',
          event: cue.type,
          tick: cue.tick,
          version: cue.presentationVersion,
          payload: structuredClone(cue.payload),
        })
        try {
          this.presentCue(cue)
        } catch (error) {
          boundedPush(this.structuredLog, {
            scope: 'scene-error', event: 'presentation-failed', tick: cue.tick,
            payload: { message: error instanceof Error ? error.message : String(error) },
          })
        }
      }
      this.latestSnapshot = this.session.getSnapshot()
      this.renderSnapshot(this.latestSnapshot)
      boundedPush(this.structuredLog, {
        scope: 'tick',
        event: 'advanced',
        tick: this.latestSnapshot.tick,
        version: this.definition.contentVersion,
        payload: { stateHash: stableHash(this.session.getDeterministicState()) },
      })
    }
  }

  private logLoader(event: string, value?: number): void {
    boundedPush(this.structuredLog, { scope: 'loader', event, value })
    console.info('[combat-core-slice]', { scope: 'loader', event, value })
  }

  private buildWorld(): void {
    this.add.image(0, 0, 'slice_bg').setOrigin(0).setDisplaySize(4430, 540).setDepth(-20)
    this.add.tileSprite(0, GROUND_Y, 4700, 95, 'slice_floor').setOrigin(0).setScale(1.5).setDepth(-10)
    this.cameras.main.setBounds(0, 0, 1500, 540)
  }

  private registerAnimations(): void {
    registerRoleAnimations(this.anims, roleData, HERO_TEXTURE, LOOPING_ACTIONS, '')
    registerRoleAnimations(this.anims, roleData, WEAPON_TEXTURE, LOOPING_ACTIONS, 'weapon_')
    registerRoleAnimations(this.anims, monsterData, MONSTER_TEXTURE, new Set(['wait', 'walk']), 'monster7_')
    for (const action of EFFECT_ACTIONS) {
      const spec = ROLE1_EFFECTS[action]
      const key = `combat-effect-${action}`
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: Array.from({ length: spec.frames }, (_, index) => ({
            key: role1EffectFrameKey(action, index + 1),
          })),
          frameRate: spec.fps,
          repeat: 0,
        })
      }
    }
  }

  private buildActors(): void {
    this.hero = this.add.sprite(0, 0, HERO_TEXTURE).setScale(HERO_SCALE).setDepth(10)
    this.weapon = this.add.sprite(0, 0, WEAPON_TEXTURE).setScale(HERO_SCALE).setDepth(11)
    this.monster = this.add.sprite(0, 0, MONSTER_TEXTURE).setScale(HERO_SCALE).setDepth(8)
    this.cameras.main.startFollow(this.hero, false, 0.12, 0.12)
  }

  private buildHud(): void {
    this.heroHud = new RoleInfoHud(this, 14, 12, { scale: 1.15 })
    this.monsterHp = new MonsterHpBar(this, { width: 72, height: 8 })
    this.diagnostic = this.add.text(948, 10, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#f5e9ce',
      backgroundColor: '#15100dcc',
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(120)
  }

  private bindInput(): void {
    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.K,
      attack: Phaser.Input.Keyboard.KeyCodes.J,
    }) as Record<'left' | 'right' | 'jump' | 'attack', Phaser.Input.Keyboard.Key>
  }

  private renderSnapshot(snapshot: CombatSnapshot): void {
    const hero = snapshot.actors.find((actor) => actor.id === HERO_ID)!
    const monster = snapshot.actors.find((actor) => actor.id === MONSTER_ID)!
    this.renderActor(hero)
    this.renderActor(monster)
    this.heroHud.update({
      level: 1,
      hp: hero.hp,
      maxHp: hero.maxHp,
      mp: 0,
      maxMp: 1,
      exp: 0,
      expToNext: 100,
      atk: this.definition.hero.atk,
      weaponName: '普通的行者棍',
    })
    this.monsterHp.update(monster.hp, monster.maxHp, this.monster.x, this.monster.y - 105, true)
    const hash = stableHash(this.session.getDeterministicState())
    this.diagnostic.setText(`tick ${snapshot.tick}  ${hash}`)
  }

  private renderActor(actor: CombatActorSnapshot, pendingAction: string | null = null): void {
    const actorDef = actor.kind === 'hero'
      ? this.definition.hero
      : this.definition.monsters.find((definition) => definition.id === actor.id)!
    const x = actor.x + actorDef.collisionOffset.x
    const y = actor.y + actorDef.collisionOffset.y
    const sprite = actor.kind === 'hero' ? this.hero : this.monster
    const removed = actor.lifeState === 'removed'
    sprite.setPosition(x, y).setVisible(!removed).setFlipX(actor.facing === 1)
    if (actor.kind === 'hero') this.weapon.setPosition(x, y).setVisible(!removed).setFlipX(actor.facing === 1)
    if (removed || this.hitStopGate.isStopped(actor.id)) return

    const snapshotAction = actor.lifeState === 'dead'
      ? actor.kind === 'hero' ? 'hurt' : 'dead'
      : actor.lifeState === 'hurt' ? 'hurt' : actor.action
    const snapshotPriority = presentationActionPriority(
      actor.lifeState === 'dead' ? 'dead' : snapshotAction,
    )
    const action = pendingAction && presentationActionPriority(pendingAction) >= snapshotPriority
      ? pendingAction
      : snapshotAction
    const heroDead = actor.kind === 'hero' && actor.lifeState === 'dead'
    if (heroDead) {
      sprite.play('hurt')
      this.weapon.play('weapon_hurt')
    } else {
      sprite.play(`${actor.kind === 'hero' ? '' : 'monster7_'}${action}`, true)
      if (actor.kind === 'hero') this.weapon.play(`weapon_${action}`, true)
    }

    const angle = heroDead ? actor.facing * 90 : 0
    sprite.setAngle(angle).setAlpha(heroDead ? 0.82 : 1)
    if (this.flashingActors.has(actor.id)) sprite.setTint(0xffffff)
    else if (heroDead) sprite.setTint(0x9c9c9c)
    else sprite.clearTint()
    if (actor.kind === 'hero') {
      this.weapon.setAngle(angle).setAlpha(heroDead ? 0.82 : 1)
      if (heroDead) this.weapon.setTint(0x9c9c9c)
      else this.weapon.clearTint()
    }
  }

  private presentCue(cue: CombatPresentationCue): void {
    switch (cue.type) {
      case 'swing': {
        if (cue.payload.actorId === HERO_ID) {
          if (cue.payload.sound) this.sound.play(this.soundKey(cue.payload.sound), { volume: 0.55 })
          if (cue.payload.effect && (EFFECT_ACTIONS as readonly string[]).includes(cue.payload.effect)) {
            this.spawnEffect(cue.payload.effect as Role1EffectAction)
          }
          this.playActorAction(cue.payload.actorId, cue.payload.action)
        } else {
          this.playActorAction(cue.payload.actorId, cue.payload.action)
        }
        break
      }
      case 'impact': {
        if (cue.payload.targetId === MONSTER_ID) {
          this.sound.play('monHurt', { volume: 0.6 })
        }
        const actorIds = [cue.payload.sourceId, cue.payload.targetId]
        for (const actorId of this.hitStopGate.begin(actorIds)) {
          this.pauseActorAnimations(actorId, true)
        }
        this.activeEffect?.anims.pause()
        this.time.delayedCall(cue.payload.hitStopMs, () => {
          this.releaseHitStop(actorIds)
        })
        this.cameras.main.shake(70, 0.0022)
        this.flashActor(cue.payload.targetId)
        break
      }
      case 'damage-number':
        this.showDamageNumber(cue.payload.actorId, cue.payload.amount)
        break
      case 'animation':
        this.playActorAction(cue.payload.actorId, cue.payload.action)
        break
      case 'defeated':
        this.playActorAction(cue.payload.actorId, cue.payload.actorId === HERO_ID ? 'hurt' : 'dead')
        break
      case 'removed':
        this.spriteFor(cue.payload.actorId).setVisible(false)
        if (cue.payload.actorId === HERO_ID) this.weapon.setVisible(false)
        break
      case 'respawn':
        this.spriteFor(cue.payload.actorId).setVisible(true)
        if (cue.payload.actorId === HERO_ID) this.weapon.setVisible(true)
        break
    }
  }

  private soundKey(sound: string): string {
    if (sound === 'hit12') return 'hit12'
    if (sound === 'hit34') return 'hit34'
    return 'hit5'
  }

  private spawnEffect(
    action: Role1EffectAction,
    freeze = false,
    facingOverride?: -1 | 1,
  ): Phaser.GameObjects.Sprite {
    this.activeEffect?.destroy()
    const hero = this.latestSnapshot.actors.find((actor) => actor.id === HERO_ID)!
    const placement = resolveRole1EffectPlacement(
      action,
      { x: this.hero.x, y: this.hero.y },
      facingOverride ?? hero.facing,
    )
    const effect = this.add.sprite(placement.x, placement.y, role1EffectFrameKey(action, 1))
      .setDisplayOrigin(placement.originX, placement.originY)
      .setScale(ROLE1_EFFECTS[action].scale)
      .setFlipX(placement.flipX)
      .setDepth(8)
    effect.play(`combat-effect-${action}`)
    if (freeze || this.hitStopGate.hasActiveStops()) effect.anims.pause()
    effect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.activeEffect === effect) this.activeEffect = null
      effect.destroy()
    })
    this.activeEffect = effect
    return effect
  }

  private pauseActorAnimations(actorId: string, paused: boolean): void {
    const sprite = this.spriteFor(actorId)
    if (paused) sprite.anims.pause()
    else sprite.anims.resume()
    if (actorId === HERO_ID) {
      if (paused) this.weapon.anims.pause()
      else this.weapon.anims.resume()
    }
  }

  private flashActor(actorId: string): void {
    const sprite = this.spriteFor(actorId)
    this.flashingActors.add(actorId)
    sprite.setTint(0xffffff)
    this.time.delayedCall(100, () => {
      this.flashingActors.delete(actorId)
      this.renderSnapshot(this.latestSnapshot)
    })
  }

  private showDamageNumber(actorId: string, amount: number): void {
    const sprite = this.spriteFor(actorId)
    const label = this.add.text(sprite.x, sprite.y - 115, `-${amount}`, {
      fontFamily: 'monospace',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffe166',
      stroke: '#57100b',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30)
    this.tweens.add({ targets: label, y: label.y - 36, alpha: 0, duration: 520, onComplete: () => label.destroy() })
  }

  private playActorAction(actorId: string, action: string): void {
    if (!this.hitStopGate.requestAction(actorId, action).applyNow) return
    const sprite = this.spriteFor(actorId)
    sprite.play(`${actorId === HERO_ID ? '' : 'monster7_'}${action}`, true)
    if (actorId === HERO_ID) this.weapon.play(`weapon_${action}`, true)
  }

  private releaseHitStop(actorIds: readonly string[]): void {
    const result = this.hitStopGate.end(actorIds)
    for (const released of result.released) {
      this.pauseActorAnimations(released.actorId, false)
      const actor = this.latestSnapshot.actors.find((entry) => entry.id === released.actorId)
      if (actor) this.renderActor(actor, released.pendingAction)
    }
    if (!result.hasActiveStops) this.activeEffect?.anims.resume()
  }

  private spriteFor(actorId: string): Phaser.GameObjects.Sprite {
    return actorId === HERO_ID ? this.hero : this.monster
  }

  private parseVisualBaseline(value: string | null): VisualBaseline | null {
    return value === 'initial' || value === 'hit3' || value === 'impact' || value === 'dead' ? value : null
  }

  private stageVisualBaseline(fixture: VisualBaseline): void {
    this.renderSnapshot(this.latestSnapshot)
    if (fixture === 'hit3') {
      this.hero.setFlipX(true)
      this.weapon.setFlipX(true)
      this.playActorAction(HERO_ID, 'hit3')
      this.freezeAnimationAt(this.hero, 2)
      this.freezeAnimationAt(this.weapon, 2)
      this.spawnEffect('hit3', true, 1)
      this.logFixtureCues([{ type: 'attack-started', tick: 0, sourceId: HERO_ID, attackId: 1, action: 'hit3', airborne: false }])
    } else if (fixture === 'impact') {
      this.hero.setFlipX(true)
      this.weapon.setFlipX(true)
      this.playActorAction(HERO_ID, 'hit1')
      this.playActorAction(MONSTER_ID, 'hurt')
      this.freezeAnimationAt(this.hero, 2)
      this.freezeAnimationAt(this.weapon, 2)
      this.monster.anims.pause()
      this.spawnEffect('hit1', true, 1)
      this.add.text(this.monster.x, this.monster.y - 115, '-32', {
        fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffe166', stroke: '#57100b', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(30)
      this.logFixtureCues([
        { type: 'attack-started', tick: 0, sourceId: HERO_ID, attackId: 1, action: 'hit1', airborne: false },
        { type: 'hit-confirmed', tick: 0, sourceId: HERO_ID, targetId: MONSTER_ID, attackId: 1 },
        { type: 'damage-applied', tick: 0, sourceId: HERO_ID, targetId: MONSTER_ID, attackId: 1, rawPower: 36, defense: 4, amount: 32, remainingHp: this.definition.monsters[0].stats.hp - 32 },
      ])
    } else if (fixture === 'dead') {
      this.playActorAction(MONSTER_ID, 'dead')
      this.freezeAnimationAt(this.monster, 0)
      this.monsterHp.update(0, this.definition.monsters[0].stats.hp, this.monster.x, this.monster.y - 105, true)
      this.logFixtureCues([{ type: 'actor-defeated', tick: 0, actorId: MONSTER_ID, sourceId: HERO_ID }])
    } else {
      this.freezeAnimationAt(this.hero, 0)
      this.freezeAnimationAt(this.weapon, 0)
      this.freezeAnimationAt(this.monster, 0)
    }
  }

  private freezeAnimationAt(sprite: Phaser.GameObjects.Sprite, index: number): void {
    const frames = sprite.anims.currentAnim?.frames
    if (frames?.length) sprite.anims.setCurrentFrame(frames[index < 0 ? frames.length - 1 : index])
    sprite.anims.pause()
  }

  private logFixtureCues(events: CombatEvent[]): void {
    for (const cue of events.flatMap(presentationCuesFor)) {
      boundedPush(this.cueLog, structuredClone(cue))
      boundedPush(this.structuredLog, {
        scope: 'presentation-fixture',
        event: cue.type,
        tick: cue.tick,
        version: cue.presentationVersion,
        payload: structuredClone(cue.payload),
      })
    }
  }

  private installObservationHook(): void {
    window.__combatCoreSlice = {
      getSnapshot: () => structuredClone(this.session.getSnapshot()),
      getEvents: () => structuredClone(this.eventLog),
      getCommands: () => structuredClone(this.commandLog),
      getPresentationCues: () => structuredClone(this.cueLog),
      getViewState: () => structuredClone(this.currentViewState()),
      getPerformance: () => structuredClone(summarizePerformance(this.perfSamples)),
      getDeterminismProof: () => structuredClone(this.determinismProof()),
      captureBugBundle: async () => {
        const screenshot = await this.captureScreenshot()
        const deterministic = this.session.getDeterministicState()
        return structuredClone({
          schemaVersion: 1,
          gameVersion: GAME_VERSION,
          contentVersion: this.definition.contentVersion,
          saveSchemaVersion: SAVE_SCHEMA_VERSION,
          protocolVersion: PROTOCOL_VERSION,
          presentationVersion: PRESENTATION_CONTRACT_VERSION,
          randomSeed: this.definition.seed,
          recentCommands: this.commandLog.slice(-120),
          domainEvents: this.eventLog.slice(-240),
          presentationCues: this.cueLog.slice(-240),
          safeStateSnapshot: {
            render: this.session.getSnapshot(),
            deterministic,
            stateHash: stableHash(deterministic),
          },
          viewState: this.currentViewState(),
          performance: summarizePerformance(this.perfSamples),
          structuredLogs: this.structuredLog.slice(-240),
          screenshot,
        })
      },
      reset: () => this.scene.restart(),
    }
  }

  private currentViewState(): Record<string, unknown> {
    const bottoms = this.visibleBottoms()
    return {
      fixture: this.visualBaseline,
      heroAnimation: this.hero.anims.currentAnim?.key ?? null,
      heroFrame: this.hero.frame.name,
      heroVisible: this.hero.visible,
      heroPosition: { x: this.hero.x, y: this.hero.y },
      heroVisibleBottomY: bottoms.hero,
      weaponVisible: this.weapon.visible,
      weaponFrame: this.weapon.frame.name,
      monsterAnimation: this.monster.anims.currentAnim?.key ?? null,
      monsterVisible: this.monster.visible,
      monsterPosition: { x: this.monster.x, y: this.monster.y },
      monsterVisibleBottomY: bottoms.monster,
    }
  }

  private determinismProof(): Record<string, unknown> {
    const recording = createCombatRecording(this.definition, this.commandRecording, this.latestSnapshot.tick)
    const liveHash = stableHash(this.session.getDeterministicState())
    return {
      liveHash,
      replayHash: recording.expectedFinalHash,
      matches: liveHash === recording.expectedFinalHash,
      totalTicks: recording.totalTicks,
    }
  }

  private visibleBottoms(): Record<string, number> {
    const hero = this.latestSnapshot.actors.find((actor) => actor.id === HERO_ID)!
    const monster = this.latestSnapshot.actors.find((actor) => actor.id === MONSTER_ID)!
    return {
      hero: computeVisibleBottomY({
        stateY: hero.y,
        offsetY: roleData.offset.y,
        scale: HERO_SCALE,
        cellH: roleData.sheet.cellH,
        contentBottom: HERO_IDLE_CONTENT.bottom,
      }),
      monster: computeVisibleBottomY({
        stateY: monster.y,
        offsetY: monsterData.offset.y,
        scale: HERO_SCALE,
        cellH: monsterData.sheet.cellH,
        contentBottom: MONSTER_IDLE_CONTENT.monster7.bottom,
        baselineCorrectionY: monsterBaselineCorrectionY('monster7'),
      }),
    }
  }

  private captureScreenshot(): Promise<string> {
    return this.screenshotCapture?.capture() ?? Promise.reject(
      new Error('renderer snapshot capture is unavailable'),
    )
  }

  private onPreStep(): void {
    this.preStepAt = performance.now()
  }

  private onPostRender(): void {
    const now = performance.now()
    if (this.preStepAt > 0 && this.lastPostRenderAt > 0) {
      boundedPush(this.perfSamples, {
        workMs: now - this.preStepAt,
        intervalMs: now - this.lastPostRenderAt,
      }, PERF_LIMIT)
    }
    this.lastPostRenderAt = now
  }

  private shutdown(): void {
    this.game.events.off(Phaser.Core.Events.PRE_STEP, this.onPreStep, this)
    this.game.events.off(Phaser.Core.Events.POST_RENDER, this.onPostRender, this)
    this.activeEffect?.destroy()
    if (this.screenshotCapture) {
      this.screenshotCapture.shutdown(new Error('combat core scene shutdown'))
      this.screenshotCapture = null
    }
    this.monsterHp.destroy()
    this.heroHud.container.destroy(true)
    delete window.__combatCoreSlice
  }
}
