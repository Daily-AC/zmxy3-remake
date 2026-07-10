import Phaser from 'phaser'
import type { CoopSession } from '../net/socialClient'
import { activeArtFont } from '../systems/artFont'
import { drawInkBackdrop } from '../ui/menu/inkBackdrop'
import { BATTLE_READY_EVENT } from './BattleScene'
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

const CAMPAIGN_NAMES = ['九重天', '天宫道', '二郎神关', '邪念之境'] as const
const STATUS_FRAMES = ['正在调兵', '正在调兵.', '正在调兵..', '正在调兵...'] as const

export class BattleLoadingScene extends Phaser.Scene {
  private battleData: BattleData = { campaignIndex: 0 }
  private levelLabel = ''
  private progress = 0
  private status: string = STATUS_FRAMES[0]
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
    const campaignIndex = Phaser.Math.Clamp(Math.floor(this.battleData.campaignIndex), 0, CAMPAIGN_NAMES.length - 1)
    this.levelLabel = `第 ${campaignIndex + 1} 关 · ${CAMPAIGN_NAMES[campaignIndex]}`
    this.progress = 0
    this.status = STATUS_FRAMES[0]
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
    this.statusText = this.add
      .text(480, 302, this.status, { fontFamily, fontSize: '18px', color: '#c8b88f' })
      .setOrigin(0.5)
    this.progressText = this.add
      .text(480, 378, '0%', { fontFamily, fontSize: '16px', color: '#f2eddf' })
      .setOrigin(0.5)
    this.progressBar = this.add.graphics()
    this.drawProgress()

    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        this.statusIndex = (this.statusIndex + 1) % STATUS_FRAMES.length
        this.status = STATUS_FRAMES[this.statusIndex]
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
    this.progressBar?.fillStyle(0x3a2814, 0.9).fillRoundedRect(250, 342, 460, 12, 6)
    this.progressBar?.fillStyle(0xd9b45a, 1).fillRoundedRect(250, 342, 460 * this.progress, 12, 6)
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
