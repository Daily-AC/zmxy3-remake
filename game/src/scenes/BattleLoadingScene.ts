import Phaser from 'phaser'
import type { CoopSession } from '../net/socialClient'
import type { SlotId } from '../systems/saveSlots'
import { activeArtFont } from '../systems/artFont'
import { addEmbers } from '../ui/embers'
import { BATTLE_READY_EVENT } from './BattleScene'
import { BATTLE_RUNTIME_READY_EVENT } from './BattleRuntimeScene'
import {
  battleLoadingBackground,
  battleLoadingContext,
  battleLoadingStatusFrames,
  type BattleLoadingBackground,
  type BattleLoadingContext,
} from './battleLoadingContent'
import { SCENE } from './shellShared'

export interface BattleData {
  campaignIndex: number
  activeSlot?: SlotId
  coopSession?: CoopSession
  runtime?: 'legacy' | 'production'
}

export function battleTarget(data: BattleData): { sceneKey: string; readyEvent: string } {
  return data.runtime === 'production'
    ? { sceneKey: SCENE.battleRuntime, readyEvent: BATTLE_RUNTIME_READY_EVENT }
    : { sceneKey: SCENE.battle, readyEvent: BATTLE_READY_EVENT }
}

interface BattleLoadingData {
  battleData: BattleData
}

interface BattleLoadingState {
  readonly active: true
  readonly label: string
  readonly progress: number
  readonly status: string
  readonly backgroundKey: string
}

export class BattleLoadingScene extends Phaser.Scene {
  private battleData: BattleData = { campaignIndex: 0 }
  private loadingContext: BattleLoadingContext = battleLoadingContext(0)
  private loadingBackground: BattleLoadingBackground = battleLoadingBackground(0)
  private levelLabel = ''
  private progress = 0
  private statusFrames: readonly string[] = battleLoadingStatusFrames(false)
  private status = this.statusFrames[0]
  private statusIndex = 0
  private statusText?: Phaser.GameObjects.Text
  private progressText?: Phaser.GameObjects.Text
  private progressBar?: Phaser.GameObjects.Graphics
  private battle?: Phaser.Scene
  private readyEvent = BATTLE_READY_EVENT

  constructor() {
    super(SCENE.battleLoading)
  }

  init(data?: BattleLoadingData): void {
    this.battleData = data?.battleData ?? { campaignIndex: 0 }
    this.loadingContext = battleLoadingContext(this.battleData.campaignIndex)
    this.loadingBackground = battleLoadingBackground(this.battleData.campaignIndex)
    this.levelLabel = this.loadingContext.label
    this.progress = 0
    this.statusFrames = battleLoadingStatusFrames(Boolean(this.battleData.coopSession))
    this.status = this.statusFrames[0]
    this.statusIndex = 0
  }

  create(): void {
    this.drawBackdrop()
    const fontFamily = activeArtFont().family

    this.add
      .text(72, 82, this.levelLabel, {
        fontFamily,
        fontSize: '18px',
        color: '#ffbf4a',
      })
      .setDepth(5)
    this.add
      .text(68, 154, '天庭推演中', {
        fontFamily,
        fontSize: '52px',
        color: '#fff5e3',
        stroke: '#2a1007',
        strokeThickness: 3,
      })
      .setDepth(5)
    this.add
      .text(72, 226, this.loadingContext.context, {
        fontFamily,
        fontSize: '24px',
        color: '#ffd58a',
      })
      .setDepth(5)
    this.statusText = this.add
      .text(72, 292, this.status, { fontFamily, fontSize: '18px', color: '#ead8bd' })
      .setDepth(5)
    this.progressText = this.add
      .text(480, 456, '0%', { fontFamily, fontSize: '18px', color: '#fff5e3' })
      .setOrigin(1, 0.5)
      .setDepth(5)
    this.progressBar = this.add.graphics().setDepth(5)
    this.drawProgress()

    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        this.statusIndex = (this.statusIndex + 1) % this.statusFrames.length
        this.status = this.statusFrames[this.statusIndex]
        this.statusText?.setText(this.status)
      },
    })

    this.exposeHook()
    const target = battleTarget(this.battleData)
    const battle = this.scene.get(target.sceneKey)
    this.battle = battle
    this.readyEvent = target.readyEvent
    battle.load.on('progress', this.onLoadProgress)
    battle.events.once(this.readyEvent, this.onBattleReady)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown)
    this.scene.launch(target.sceneKey, this.battleData)
    this.scene.bringToTop(SCENE.battleLoading)
  }

  private drawBackdrop(): void {
    const { key } = this.loadingBackground
    if (this.textures.exists(key)) {
      const bg = this.add.image(480, 270, key)
      const fittedScale = Math.max(960 / bg.width, 540 / bg.height)
      bg.setScale(fittedScale * 1.035)
      this.tweens.add({ targets: bg, scale: fittedScale, duration: 5200, ease: 'Sine.easeOut' })
    } else {
      this.add.rectangle(480, 270, 960, 540, 0x140905, 1)
    }

    this.add.rectangle(245, 270, 490, 540, 0x090403, 0.58).setDepth(1)
    const accents = this.add.graphics().setDepth(4)
    accents.lineStyle(2, 0xffa31a, 0.95)
    accents.lineBetween(58, 72, 58, 116)
    accents.lineBetween(58, 72, 102, 72)
    accents.lineStyle(1, 0xffd27a, 0.36)
    accents.lineBetween(72, 340, 326, 340)
    addEmbers(this, { w: 960, h: 540, count: 18, depth: 3 })
  }

  private readonly onLoadProgress = (value: number): void => {
    this.progress = Phaser.Math.Clamp(value, 0, 1)
    this.drawProgress()
  }

  private readonly onBattleReady = (): void => {
    this.progress = 1
    this.drawProgress()
    this.scene.stop(SCENE.battleLoading)
  }

  private readonly onShutdown = (): void => {
    const battle = this.battle
    if (battle) {
      battle.load.off('progress', this.onLoadProgress)
      battle.events.off(this.readyEvent, this.onBattleReady)
    }
    this.battle = undefined
    delete (window as unknown as Record<string, unknown>).__shellLoadingState
  }

  private drawProgress(): void {
    this.progressBar?.clear()
    this.progressBar?.fillStyle(0xfff0d2, 0.22).fillRect(72, 486, 816, 2)
    this.progressBar?.fillStyle(0xffa31a, 1).fillRect(72, 485, 816 * this.progress, 4)
    const markerX = 72 + 816 * this.progress
    this.progressBar?.fillStyle(0xffd27a, 1).fillTriangle(markerX, 480, markerX + 6, 487, markerX, 494)
    this.progressText?.setText(`${Math.round(this.progress * 100)}%`)
  }

  private exposeHook(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellLoadingState = (): BattleLoadingState => ({
      active: true,
      label: this.levelLabel,
      progress: this.progress,
      status: this.status,
      backgroundKey: this.loadingBackground.key,
    })
  }
}
