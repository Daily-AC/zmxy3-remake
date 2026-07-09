import Phaser from 'phaser'
import { SCENE } from './shellShared'
import { addEmbers } from '../ui/embers'

// 2026-07-09 screen-flow change (用户拍板，总纲 3d): the traditional menu list
// (新的开始/继续游戏/游戏帮助/关于我们/退出游戏/联机共斗) is cut for the
// hackathon. The boot order is now LoginScene-first: this scene degrades to a
// splash gate over the fiery keyart (总纲 3c 拍板终稿: keyart-v1-dawn), then
// forwards to LoginScene. Every existing "return to main menu" call site
// elsewhere keeps working unchanged: they all land here and bounce into the
// login gate. SlotSelectScene stays in the repo untouched -- bypassed, not
// deleted (see LoginScene.enterGame).
const KEYART_BG = 'keyart_menu_dawn'
const W = 960
const H = 540
// Long enough to actually read the splash (the old 600ms flashed past the
// keyart); still skippable instantly by click/Enter.
const AUTO_ENTER_MS = 2200

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(KEYART_BG)) {
      this.load.image(KEYART_BG, 'assets/keyart/menu-keyart.jpg')
    }
  }

  create(): void {
    if (this.textures.exists(KEYART_BG)) {
      // 2736x1536 art designed for full-bleed 16:9 -- title calligraphy is part
      // of the composition (right third), so no shift, no crop games.
      const bg = this.add.image(W / 2, H / 2, KEYART_BG)
      bg.setScale(Math.max(W / bg.width, H / bg.height))
      // Slow settle: 1.05 -> 1.0 Ken-Burns so the splash breathes.
      bg.setScale(bg.scale * 1.05)
      this.tweens.add({ targets: bg, scale: bg.scale / 1.05, duration: 2400, ease: 'Sine.easeOut' })
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0f, 1)
    }

    addEmbers(this, { w: W, h: H })

    const hint = this.add
      .text(W - 158, H - 26, '轻触入界', { fontSize: '15px', color: '#f5e6c8' })
      .setOrigin(0.5)
      .setAlpha(0)
    this.tweens.add({ targets: hint, alpha: { from: 0.15, to: 0.95 }, duration: 900, yoyo: true, repeat: -1 })

    this.cameras.main.fadeIn(500, 0, 0, 0)

    let entered = false
    const enter = (): void => {
      if (entered) return
      entered = true
      this.cameras.main.fadeOut(220, 0, 0, 0)
      this.time.delayedCall(230, () => this.scene.start(SCENE.coopLogin))
    }
    this.time.delayedCall(AUTO_ENTER_MS, enter)
    this.input.once('pointerdown', enter)
    this.input.keyboard?.once('keydown-ENTER', enter)

    this.exposeHooks()
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.mainMenu
    w.__shellEnter = () => this.scene.start(SCENE.coopLogin)
  }
}
