import Phaser from 'phaser'
import { drawInkBackdrop } from '../ui/menu/inkBackdrop'
import { MenuButton } from '../ui/menu/MenuButton'
import { SCENE } from './shellShared'

// The nostalgia "login" shell. Single-player, so this is a period-feel façade,
// not a real account system: it shows the title, a 游客 (guest) login line, and
// an 进入游戏 button that carries straight into slot selection. Art is the shared
// ink backdrop plus the color 悟空 idle frame (role1_0 frame 0) for life.

const HERO_TEX = 'role1_0'
const HERO_CELL = 200

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(HERO_TEX)) {
      this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
        frameWidth: HERO_CELL,
        frameHeight: HERO_CELL,
      })
    }
  }

  create(): void {
    drawInkBackdrop(this)

    // Title block.
    this.add
      .text(480, 118, '造梦西游 3', {
        fontSize: '68px',
        fontStyle: 'bold',
        color: '#f2c65a',
        stroke: '#3a2410',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setShadow(3, 5, '#000000', 8, true, true)
    this.add
      .text(480, 178, '再续天庭  ·  Remake', {
        fontSize: '22px',
        color: '#e8d9b0',
        stroke: '#2c1d0e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)

    // 悟空 idle portrait with a gentle bob so the screen isn't static.
    const hero = this.add.sprite(700, 380, HERO_TEX, 0).setScale(1.7).setDepth(5)
    this.tweens.add({
      targets: hero,
      y: hero.y - 10,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Faux guest-login line.
    this.add
      .text(300, 320, '账号', { fontSize: '18px', color: '#c8bfa6' })
      .setOrigin(0, 0.5)
    const acct = this.add.graphics()
    acct.fillStyle(0x0e0b07, 0.6).fillRoundedRect(300, 336, 260, 40, 8)
    acct.lineStyle(1.5, 0xd9b45a, 0.7).strokeRoundedRect(300, 336, 260, 40, 8)
    this.add
      .text(316, 356, '游客（本地存档）', { fontSize: '17px', color: '#f2eddf' })
      .setOrigin(0, 0.5)

    new MenuButton(this, {
      x: 430,
      y: 440,
      width: 260,
      height: 58,
      label: '进入游戏',
      fontSize: 26,
      onClick: () => this.enter(),
    }).setDepth(10)

    this.add
      .text(480, 512, '本地假登录 · 情怀壳 · 回车 / 点击进入', {
        fontSize: '13px',
        color: '#8a7f68',
      })
      .setOrigin(0.5)

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
