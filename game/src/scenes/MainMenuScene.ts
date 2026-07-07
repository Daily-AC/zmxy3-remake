import Phaser from 'phaser'
import { MenuButton } from '../ui/menu/MenuButton'
import { SCENE } from './shellShared'

// Title / login shell built on the ORIGINAL cover artwork: `title_logo_bg` is the
// game's own 造梦西游3 大闹天庭篇 logo art (blue ink-splatter title screen,
// extracted from the main SWF, chid 410 — the image the original client shows
// while loading). Single-player, so the only interaction is a 进入游戏 entry into
// slot selection, with a small guest-login note kept for period feel. No
// system-font title: the logo lives in the art itself.

const LOGO_BG = 'title_logo_bg'
const CANVAS_W = 960
const CANVAS_H = 540

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(LOGO_BG)) {
      this.load.image(LOGO_BG, 'assets/extracted/menu/title_logo_bg.png')
    }
  }

  create(): void {
    // Original cover art, cover-fit to the canvas (logo stays centered).
    const bg = this.add.image(CANVAS_W / 2, CANVAS_H / 2, LOGO_BG)
    const scale = Math.max(CANVAS_W / bg.width, CANVAS_H / bg.height)
    bg.setScale(scale)

    // Soft bottom vignette so the button/text read over the busy art.
    this.add.graphics().fillStyle(0x0a1830, 0.3).fillRect(0, CANVAS_H - 150, CANVAS_W, 150)

    new MenuButton(this, {
      x: 480,
      y: 452,
      width: 280,
      height: 60,
      label: '进入游戏',
      fontSize: 27,
      onClick: () => this.enter(),
    }).setDepth(10)

    this.add
      .text(480, 500, '游客登录 · 本地存档　　回车 / 点击进入', {
        fontSize: '14px',
        color: '#dfeaff',
        stroke: '#0a1830',
        strokeThickness: 3,
      })
      .setOrigin(0.5)

    // Gold hairline frame to tie the shell scenes together.
    this.add.graphics().lineStyle(2, 0xd9b45a, 0.4).strokeRoundedRect(8, 8, CANVAS_W - 16, CANVAS_H - 16, 12)

    this.input.keyboard?.once('keydown-ENTER', () => this.enter())
    this.exposeHooks()
  }

  private enter(): void {
    this.scene.start(SCENE.slotSelect)
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.mainMenu
    w.__shellEnter = () => this.enter()
  }
}
