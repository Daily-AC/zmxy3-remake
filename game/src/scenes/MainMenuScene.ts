import Phaser from 'phaser'
import { SCENE } from './shellShared'

// Title / login shell laid out after the 造梦西游 大闹天庭篇 client title screen
// (docs/reference/zmxy-online-screens/title-menu.png): the character-group + logo
// artwork fills the canvas, and a dark ink menu panel on the right carries a
// vertical menu. Menu items are trimmed to what a single-player local build has
// (no forum / homepage / networked entries).
//
// SOURCE NOTE: title-bg is 造梦 Online-sourced art (whole-series usable — see
// CLAUDE.md). Marked for the packaging style-consistency review.
export const ASSET_SOURCE_ONLINE = true

const TITLE_BG = 'title_bg'
const W = 960
const H = 540
const PANEL_X = 690

type MenuItem = { label: string; action: () => void }

export class MainMenuScene extends Phaser.Scene {
  private overlay?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(TITLE_BG)) {
      this.load.image(TITLE_BG, 'assets/online/title/title-bg.png')
    }
  }

  create(): void {
    // Character-group + logo art, cover-fit to the canvas.
    const bg = this.add.image(W / 2, H / 2, TITLE_BG)
    bg.setScale(Math.max(W / bg.width, H / bg.height))

    this.buildMenuPanel()
    this.add.graphics().lineStyle(2, 0xd9b45a, 0.4).strokeRoundedRect(8, 8, W - 16, H - 16, 12)

    this.input.keyboard?.once('keydown-ENTER', () => this.enter())
    this.exposeHooks()
  }

  private buildMenuPanel(): void {
    // Dark ink panel on the right.
    const g = this.add.graphics().setDepth(5)
    g.fillStyle(0x0a0a0f, 0.68).fillRect(PANEL_X, 0, W - PANEL_X, H)
    g.fillStyle(0x000000, 0.35).fillRect(PANEL_X, 0, 8, H)
    g.lineStyle(2, 0xd9b45a, 0.5).lineBetween(PANEL_X, 14, PANEL_X, H - 14)

    this.add
      .text((PANEL_X + W) / 2, 54, '造梦西游 · 大闹天庭篇', {
        fontSize: '15px',
        color: '#e8d9b0',
        stroke: '#0a0a0f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6)

    const items: MenuItem[] = [
      { label: '新的开始', action: () => this.enter() },
      { label: '读取存档', action: () => this.enter() },
      { label: '游戏帮助', action: () => this.showHelp() },
      { label: '关于我们', action: () => this.showAbout() },
      { label: '退出游戏', action: () => this.quit() },
    ]
    const cx = (PANEL_X + W) / 2
    items.forEach((it, i) => this.buildMenuItem(cx, 118 + i * 66, it))
  }

  private buildMenuItem(cx: number, y: number, item: MenuItem): void {
    const t = this.add
      .text(cx, y, item.label, {
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#f4f4f4',
        stroke: '#0a0a0f',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(7)
      .setInteractive({ useHandCursor: true })
    const underline = this.add.graphics().setDepth(6)
    t.on('pointerover', () => {
      t.setColor('#ffd24a').setScale(1.06)
      underline.clear().lineStyle(2, 0xd9b45a, 0.9).lineBetween(cx - t.width / 2, y + 20, cx + t.width / 2, y + 20)
    })
    t.on('pointerout', () => {
      t.setColor('#f4f4f4').setScale(1)
      underline.clear()
    })
    t.on('pointerdown', () => item.action())
  }

  private enter(): void {
    this.scene.start(SCENE.slotSelect)
  }

  // ---- overlays ----

  private showHelp(): void {
    this.openOverlay('游戏帮助', [
      'A / D　　左右移动',
      'K　　　　跳跃（空中再按二段跳）',
      'J　　　　普通攻击（五段连击）',
      'Y U I O L　技能',
      'W / ↑　　与 NPC 对话',
      'E / U　　穿戴 / 卸下装备',
      'F1　　　　调试信息',
    ])
  }

  private showAbout(): void {
    this.openOverlay('关于我们', [
      '《造梦西游3》重制 · 大闹天庭篇',
      '',
      '用现代栈（Phaser 4 + TypeScript）重写童年',
      '记忆里的造梦西游，并加入 LLM agent 驱动的 NPC：',
      '有记忆、会感知战斗、能现场为你炼独一无二的装备。',
      '',
      '本地单机情怀壳 · 献给每一个曾在 4399 打天庭的人。',
    ])
  }

  private openOverlay(title: string, lines: string[]): void {
    this.closeOverlay()
    const layer = this.add.container(0, 0).setDepth(300)
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive()
    const pw = 620
    const ph = 60 + lines.length * 30 + 60
    const px = W / 2 - pw / 2
    const py = H / 2 - ph / 2
    const panel = this.add.graphics()
    panel.fillStyle(0x1a130b, 0.98).fillRoundedRect(px, py, pw, ph, 16)
    panel.lineStyle(2, 0xd9b45a, 0.9).strokeRoundedRect(px, py, pw, ph, 16)
    const head = this.add
      .text(W / 2, py + 30, title, { fontSize: '26px', fontStyle: 'bold', color: '#f2c65a' })
      .setOrigin(0.5)
    const body = this.add
      .text(W / 2, py + 64, lines.join('\n'), { fontSize: '17px', color: '#f2eddf', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5, 0)
    const close = this.add
      .text(px + pw - 22, py + 18, '✕', { fontSize: '22px', color: '#d9b45a' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.closeOverlay())
    layer.add([shade, panel, head, body, close])
    this.overlay = layer
  }

  private closeOverlay(): void {
    this.overlay?.destroy(true)
    this.overlay = undefined
  }

  private quit(): void {
    // In a desktop (Tauri/Electron) shell this closes the window; in a browser
    // tab close is blocked, so fall back to a farewell overlay.
    try {
      window.close()
    } catch {
      /* ignored */
    }
    this.openOverlay('退出游戏', ['感谢游玩，江湖再会。', '', '（桌面版将关闭窗口；浏览器请直接关闭标签页）'])
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.mainMenu
    w.__shellEnter = () => this.enter()
    w.__shellMenu = (label: string) => {
      const map: Record<string, () => void> = {
        新的开始: () => this.enter(),
        读取存档: () => this.enter(),
        游戏帮助: () => this.showHelp(),
        关于我们: () => this.showAbout(),
        退出游戏: () => this.quit(),
      }
      map[label]?.()
    }
  }
}
