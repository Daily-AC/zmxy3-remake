import Phaser from 'phaser'
import { HUD_COLORS } from './hudTheme'
import { MenuButton } from '../menu/MenuButton'
import { withinRect, type Rect } from '../screenHit'

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

/** One clickable/hoverable region on the banner, in screen space -- see
 * ui/screenHit.ts. Only used for the raw-image retry button branch (the
 * `result_retry`-texture path below); the MenuButton branch handles its own
 * hit-testing via MenuButtonOpts.screenSpaceHit. */
interface Hotspot {
  rect: Rect
  hovered: boolean
  onEnter?: () => void
  onLeave?: () => void
  onClick: () => void
}

export class ResultBanner {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: ResultBannerOptions
  private body?: Phaser.GameObjects.Container
  private hotspots: Hotspot[] = []

  constructor(scene: Phaser.Scene, opts: ResultBannerOptions = {}) {
    this.scene = scene
    this.opts = opts
    // Dim backdrop, visual only -- see ui/screenHit.ts for why click-blocking
    // doesn't ride on setInteractive() here.
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62)
    this.container = scene.add.container(0, 0, [dim]).setScrollFactor(0).setDepth(250).setVisible(false)

    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointermove', this.onPointerMove)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onPointerDown)
      scene.input.off('pointermove', this.onPointerMove)
    })
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    for (const h of this.hotspots) {
      if (withinRect(pointer.x, pointer.y, h.rect)) {
        h.onClick()
        return
      }
    }
  }

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.container.visible) return
    for (const h of this.hotspots) {
      const over = withinRect(pointer.x, pointer.y, h.rect)
      if (over && !h.hovered) {
        h.hovered = true
        h.onEnter?.()
      } else if (!over && h.hovered) {
        h.hovered = false
        h.onLeave?.()
      }
    }
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
    this.hotspots = []
    this.container.setVisible(false)
  }

  get isOpen(): boolean {
    return this.container.visible
  }

  private show(kind: 'success' | 'fail', o: ResultShowOptions): void {
    this.body?.destroy(true)
    this.hotspots = []
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
    // Both branches use screen-space hit-testing (see ui/screenHit.ts) -- this
    // banner sits in a scrollFactor(0) container inside BattleScene, whose
    // camera scrolls continuously, so Phaser's own setInteractive() would
    // drift the same way BackpackWindow's did.
    if (this.scene.textures.exists('result_retry')) {
      const retry = this.scene.add.image(kind === 'success' ? 400 : W / 2, 428, 'result_retry').setScale(0.9)
      this.hotspots.push({
        rect: { x: retry.x - retry.displayWidth / 2, y: retry.y - retry.displayHeight / 2, w: retry.displayWidth, h: retry.displayHeight },
        hovered: false,
        onEnter: () => retry.setTint(0xffe0a0),
        onLeave: () => retry.clearTint(),
        onClick: () => this.opts.onRetry?.(),
      })
      children.push(retry)
    } else {
      const retry = new MenuButton(this.scene, {
        x: kind === 'success' ? 400 : W / 2,
        y: 428,
        width: 150,
        height: 48,
        label: '重新挑战',
        variant: 'danger',
        screenSpaceHit: true,
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
        screenSpaceHit: true,
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
