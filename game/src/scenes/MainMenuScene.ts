import Phaser from 'phaser'
import { SCENE } from './shellShared'

// 2026-07-09 screen-flow change (用户拍板，总纲 3d): the traditional menu list
// (新的开始/继续游戏/游戏帮助/关于我们/退出游戏/联机共斗) is cut for the
// hackathon. The boot order is now LoginScene-first: this scene degrades to a
// pure "boot then forward to LoginScene" shell, keeping only the key-art
// backdrop for visual continuity (further visual polish deferred to a later
// pass). Every existing "return to main menu" call site elsewhere in the
// codebase (WorldMapScene's save-and-quit, SkillTreeScene's back button,
// CharacterSelectScene's 返回主菜单 button) keeps working unchanged: they all
// land here and get bounced straight into the login gate, which is exactly
// the right behavior for a login-gated flow. SlotSelectScene's own code stays
// in the repo untouched -- it's bypassed in the flow, not deleted (see
// LoginScene.enterGame).
const KEYART_BG = 'keyart_home'
const W = 960
const H = 540
// Keeps the composition's 5th (rightmost) character clear of where the old
// side menu panel used to sit -- see git history for the original derivation.
const BG_SHIFT_X = -140
const AUTO_ENTER_MS = 600

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(KEYART_BG)) {
      this.load.image(KEYART_BG, 'assets/generated/keyart-home.png')
    }
  }

  create(): void {
    if (this.textures.exists(KEYART_BG)) {
      const bg = this.add.image(W / 2 + BG_SHIFT_X, H / 2, KEYART_BG)
      bg.setScale(Math.max(W / bg.width, H / bg.height))
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0f, 1)
    }

    let entered = false
    const enter = (): void => {
      if (entered) return
      entered = true
      this.scene.start(SCENE.coopLogin)
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
