import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'
import { MenuButton } from '../menu/MenuButton'

// Stage clear / fail result screen: dim overlay + a big 挑战成功/失败 banner +
// a results strip with stats + retry / continue buttons. Meant for the level
// chain (boss death -> clear, hero death -> fail).
//
// SOURCE NOTE: the banner / results-strip / retry-button art are 造梦 Online-
// sourced (造3 has same-named export.win.GameWin / export.lose.GameFail but
// they're vector+TextField, not bitmap-exportable;全系列可用无版权障碍 —
// CLAUDE.md). Marked for the packaging style-consistency review, NOT a
// replacement debt. Falls back to DNA-drawn text/buttons if art isn't loaded.
export const ASSET_SOURCE_ONLINE = true

export interface ResultBannerOptions {
  onRetry?: () => void
  onContinue?: () => void
}

export interface ResultShowOptions {
  /** Stat lines shown on the results strip, e.g. ['用时 01:24', '击杀 37', '获得灵魂 x120']. */
  stats?: string[]
}

const W = 960
const H = 540

export class ResultBanner {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: ResultBannerOptions
  private body?: Phaser.GameObjects.Container

  constructor(scene: Phaser.Scene, opts: ResultBannerOptions = {}) {
    this.scene = scene
    this.opts = opts
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setInteractive()
    this.container = scene.add.container(0, 0, [dim]).setScrollFactor(0).setDepth(250).setVisible(false)
  }

  showSuccess(o: ResultShowOptions = {}): void {
    this.show('success', o)
  }

  showFail(o: ResultShowOptions = {}): void {
    this.show('fail', o)
  }

  hide(): void {
    this.body?.destroy(true)
    this.body = undefined
    this.container.setVisible(false)
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  private show(kind: 'success' | 'fail', o: ResultShowOptions): void {
    this.body?.destroy(true)
    const children: Phaser.GameObjects.GameObject[] = []
    const bannerTex = kind === 'success' ? 'result_success' : 'result_fail'

    // Big banner (falls back to text if the placeholder art isn't loaded).
    if (this.scene.textures.exists(bannerTex)) {
      children.push(this.scene.add.image(W / 2, 172, bannerTex).setScale(0.9))
    } else {
      children.push(
        this.scene.add
          .text(W / 2, 160, kind === 'success' ? '挑战成功' : '挑战失败', {
            fontSize: '52px',
            fontStyle: 'bold',
            color: kind === 'success' ? '#ffd24a' : '#ff6b6b',
            stroke: '#3a2410',
            strokeThickness: 8,
          })
          .setOrigin(0.5),
      )
    }

    // Results strip + stats.
    if (this.scene.textures.exists('result_my')) {
      children.push(this.scene.add.image(W / 2, 300, 'result_my').setScale(0.9))
    }
    const stats = o.stats ?? []
    if (stats.length) {
      children.push(
        this.scene.add
          .text(W / 2, 340, stats.join('     '), { fontSize: '18px', color: HUD_COLORS.text, align: 'center' })
          .setOrigin(0.5)
          .setShadow(1, 1, '#000', 3),
      )
    }

    // Buttons: retry (placeholder image if present) + continue (drawn, success only).
    if (this.scene.textures.exists('result_retry')) {
      const retry = this.scene.add
        .image(kind === 'success' ? 400 : W / 2, 428, 'result_retry')
        .setScale(0.9)
        .setInteractive({ useHandCursor: true })
      retry.on('pointerover', () => retry.setTint(0xffe0a0)).on('pointerout', () => retry.clearTint())
      retry.on('pointerdown', () => this.opts.onRetry?.())
      children.push(retry)
    } else {
      const retry = new MenuButton(this.scene, {
        x: kind === 'success' ? 400 : W / 2,
        y: 428,
        width: 150,
        height: 48,
        label: '重新挑战',
        variant: 'danger',
        onClick: () => this.opts.onRetry?.(),
      })
      children.push(retry.container)
    }
    if (kind === 'success') {
      const cont = new MenuButton(this.scene, {
        x: 560,
        y: 428,
        width: 150,
        height: 48,
        label: '继续',
        onClick: () => this.opts.onContinue?.(),
      })
      children.push(cont.container)
    }

    const body = this.scene.add.container(0, 0, children).setScrollFactor(0)
    body.setScale(0.85)
    this.scene.tweens.add({ targets: body, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.container.add(body)
    this.body = body
    this.container.setVisible(true)
  }
}
