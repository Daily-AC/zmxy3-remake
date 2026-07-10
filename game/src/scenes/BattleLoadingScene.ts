import Phaser from 'phaser'
import type { CoopSession } from '../net/socialClient'
import { activeArtFont } from '../systems/artFont'
import { drawInkBackdrop } from '../ui/menu/inkBackdrop'
import { BATTLE_READY_EVENT } from './BattleScene'
import {
  battleLoadingContext,
  battleLoadingStatusFrames,
  type BattleLoadingContext,
} from './battleLoadingContent'
import { SCENE } from './shellShared'

export interface BattleData {
  campaignIndex: number
  coopSession?: CoopSession
}

interface BattleLoadingData {
  battleData: BattleData
}

interface BattleLoadingState {
  readonly active: true
  readonly label: string
  readonly progress: number
  readonly status: string
}

export class BattleLoadingScene extends Phaser.Scene {
  private battleData: BattleData = { campaignIndex: 0 }
  private loadingContext: BattleLoadingContext = battleLoadingContext(0)
  private levelLabel = ''
  private progress = 0
  private statusFrames: readonly string[] = battleLoadingStatusFrames(false)
  private status = this.statusFrames[0]
  private statusIndex = 0
  private statusText?: Phaser.GameObjects.Text
  private progressText?: Phaser.GameObjects.Text
  private progressBar?: Phaser.GameObjects.Graphics
  private battle?: Phaser.Scene

  constructor() {
    super(SCENE.battleLoading)
  }

  init(data?: BattleLoadingData): void {
    this.battleData = data?.battleData ?? { campaignIndex: 0 }
    this.loadingContext = battleLoadingContext(this.battleData.campaignIndex)
    this.levelLabel = this.loadingContext.label
    this.progress = 0
    this.statusFrames = battleLoadingStatusFrames(Boolean(this.battleData.coopSession))
    this.status = this.statusFrames[0]
    this.statusIndex = 0
  }

  create(): void {
    drawInkBackdrop(this)
    const fontFamily = activeArtFont().family

    this.add.text(480, 172, this.levelLabel, { fontFamily, fontSize: '24px', color: '#d9b45a' }).setOrigin(0.5)
    this.add
      .text(480, 226, '天庭推演中', {
        fontFamily,
        fontSize: '42px',
        color: '#f2eddf',
        stroke: '#3a2814',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
    this.add
      .text(480, 286, this.loadingContext.context, {
        fontFamily,
        fontSize: '20px',
        color: '#e3cf9a',
      })
      .setOrigin(0.5)
    this.statusText = this.add
      .text(480, 326, this.status, { fontFamily, fontSize: '18px', color: '#c8b88f' })
      .setOrigin(0.5)
    this.progressText = this.add
      .text(480, 402, '0%', { fontFamily, fontSize: '16px', color: '#f2eddf' })
      .setOrigin(0.5)
    this.progressBar = this.add.graphics()
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
    const battle = this.scene.get(SCENE.battle)
    this.battle = battle
    battle.load.on('progress', this.onLoadProgress)
    battle.events.once(BATTLE_READY_EVENT, this.onBattleReady)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown)
    this.scene.launch(SCENE.battle, this.battleData)
    this.scene.bringToTop(SCENE.battleLoading)
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
      battle.events.off(BATTLE_READY_EVENT, this.onBattleReady)
    }
    this.battle = undefined
    delete (window as unknown as Record<string, unknown>).__shellLoadingState
  }

  private drawProgress(): void {
    this.progressBar?.clear()
    this.progressBar?.fillStyle(0x3a2814, 0.9).fillRoundedRect(250, 366, 460, 12, 6)
    this.progressBar?.fillStyle(0xd9b45a, 1).fillRoundedRect(250, 366, 460 * this.progress, 12, 6)
    this.progressText?.setText(`${Math.round(this.progress * 100)}%`)
  }

  private exposeHook(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellLoadingState = (): BattleLoadingState => ({
      active: true,
      label: this.levelLabel,
      progress: this.progress,
      status: this.status,
    })
  }
}
