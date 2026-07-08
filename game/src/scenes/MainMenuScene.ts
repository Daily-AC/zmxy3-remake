import Phaser from 'phaser'
import { SCENE } from './shellShared'
import { activeArtFont } from '../systems/artFont'

// Title / login shell laid out after the 造梦西游 大闹天庭篇 client title screen
// (docs/reference/zmxy-online-screens/title-menu.png): the character-group +
// logo artwork fills the canvas, and a dark ink menu panel on the right
// carries a vertical menu. Menu items are trimmed to what a single-player
// local build has (no forum / homepage / networked entries).
//
// 2026-07-08 首屏接线: the background was `title-bg.png`, an actual Online
// promo SCREENSHOT (not clean key art) that baked in 4399's copyright notice
// text, the Online logo (wrong product name), Online's own menu items, and a
// letterbox edge -- flagged as the single worst "live" dirty asset in
// tasks/asset-audit-report.md (players saw another product's legal notice +
// wrong name on the very first screen). Replaced with `keyart-home.png`, a
// generated key-art anchor (CLAUDE.md 总纲 item 0/1 -- ink-wash brush style,
// game-canon character group as reference so the five silhouettes stay
// on-model) commissioned specifically for this screen, no baked text at all.
// Title text also swapped from a live Ma Shan Zheng render to a pre-rendered
// calligraphy bitmap (`title-zaixuxiyou.png`) for a more finished stroke
// weight than a live webfont draw gives at this size; menu items stay on the
// live Ma Shan Zheng font (artFont.ts), unchanged.
//
// The delivered bitmap is near-black ink (RGB ~22,18,15) on transparent --
// correct for compositing over a light page, but this panel is near-black
// ink itself (0x0a0a0f), so the original file is essentially invisible here
// (verified: cropped/zoomed the first real render, the strokes were only
// visible as a faint darker patch). Recolored the ink to solid white with a
// one-off script (RGB channels set to 255, alpha channel untouched --
// identical glyph shapes/kerning, just an ink-color swap for contrast, the
// same reason the live-text title before it was white) rather than ship an
// unreadable title; see `title-zaixuxiyou-white.png` alongside the original.
const KEYART_BG = 'keyart_home'
const TITLE_IMG = 'title_zaixuxiyou_white'
const W = 960
const H = 540
const PANEL_X = 690

// S6 menu-bar geometry, derived from vendor `export.GameMenu` (main SWF AS3,
// game/tmp/s5-as3/othermat-xfl/export/GameMenu.as showMenu()) cross-checked
// against the FFDec composite render of the same symbol
// (game/tmp/s2s3-extract/sprites/sprites/DefineSprite_258_export.GameMenu/1.png,
// which renders every button at its authored/shown position in one frame).
// AS3 showMenu() sets all six item buttons to x=751.15 (vendor stage 940x590)
// -- the "multi-coordinate" trap flagged in ui-port-dual-source.md (x=751
// shown vs x=1110 parked off-stage) -- and the render confirms that same
// x=751.15 as the *left* edge of each item's glyphs (measured 751 vs 751.15,
// 0.15px off). Converted to panel-relative fractions so the geometry survives
// PANEL_X differing slightly from the vendor stage's panel edge:
//   textLeft fraction  = (751 - 690) / (940 - 690) = 0.244
//   divider pad fraction (each side, beyond glyph bounds) = 42 / 250 = 0.168
// Vertical rhythm read off the same render's six divider rows
// (y = 185/232/286/336/377/426, panel-local) and item glyph centers
// (162/209/257/310/356.5), then normalized to header/panel fractions of the
// 590px vendor stage height (header 115/590=0.195, items start
// 162/590=0.275, step ~44.5/590=0.0754 avg of 47.35/47.7/52.9/46.95) and
// re-applied to our 540px canvas -- see tasks/menu-polish-report.md for the
// full derivation table.
const PANEL_W = W - PANEL_X
const TEXT_LEFT_X = PANEL_X + 0.244 * PANEL_W
const DIVIDER_PAD = 0.168 * PANEL_W
const HEADER_Y = 105
const ITEM_Y0 = 148
const ITEM_STEP = 44

type MenuItem = { label: string; action: () => void }

export class MainMenuScene extends Phaser.Scene {
  private overlay?: Phaser.GameObjects.Container

  constructor() {
    super(SCENE.mainMenu)
  }

  preload(): void {
    if (!this.textures.exists(KEYART_BG)) {
      this.load.image(KEYART_BG, 'assets/generated/keyart-home.png')
    }
    if (!this.textures.exists(TITLE_IMG)) {
      this.load.image(TITLE_IMG, 'assets/generated/title-zaixuxiyou-white.png')
    }
  }

  create(): void {
    // Key art, cover-fit to the canvas. Source is 1920x1080 (16:9), our
    // canvas is 960x540 (also 16:9) so cover-fit == contain-fit here, no
    // cropping either axis -- the five-character group sits centered/
    // lower-third by design (generation brief left the upper sky clear for
    // the title/menu panel that overlays it).
    const bg = this.add.image(W / 2, H / 2, KEYART_BG)
    bg.setScale(Math.max(W / bg.width, H / bg.height))

    this.buildMenuPanel()
    this.add.graphics().lineStyle(2, 0xd9b45a, 0.4).strokeRoundedRect(8, 8, W - 16, H - 16, 12)

    this.input.keyboard?.once('keydown-ENTER', () => this.enter())
    this.exposeHooks()
  }

  private buildMenuPanel(): void {
    // Dark ink panel on the right -- fully opaque, keeps the menu legible
    // over whatever sits behind it in the key art (this used to also matter
    // for hiding a baked-in caption from the old Online screenshot
    // background; that background is gone now, but solid ink is still the
    // right call for menu-text contrast/legibility on its own merits).
    const g = this.add.graphics().setDepth(5)
    g.fillStyle(0x0a0a0f, 1).fillRect(PANEL_X, 0, W - PANEL_X, H)
    g.fillStyle(0x000000, 0.35).fillRect(PANEL_X, 0, 8, H)
    g.lineStyle(2, 0xd9b45a, 0.5).lineBetween(PANEL_X, 14, PANEL_X, H - 14)

    // Title bitmap ("再续西游", pre-rendered brush calligraphy -- see
    // TITLE_IMG doc comment above). Source is 1400x443 with the ink content
    // bbox at roughly x:156-1241, y:105-337 (measured via alpha-channel scan)
    // -- i.e. already centered within its own canvas, so a uniform scale +
    // setOrigin(0.5) needs no manual offset correction. Scaled so the
    // content width (~1085px source) lands at ~206px on screen, comfortably
    // inside the ~270px-wide panel with margin either side, and sized
    // similarly to (slightly larger than) the live-text title it replaces
    // (was 36px Ma Shan Zheng, 4 characters).
    this.add
      .image((PANEL_X + W) / 2, HEADER_Y, TITLE_IMG)
      .setScale(0.19)
      .setDepth(6)

    // Vendor set = newGame/continueGame/gameHelp/aboutUs/btnquit (btn_forum
    // omitted per brief -- it points at a 4399 forum URL with no local
    // equivalent). Order matches both the AS3 declaration order and the
    // showMenu() y-ladder (207.65 < 255 < 302.7 < 355.6 < 402.55).
    const items: MenuItem[] = [
      { label: '新的开始', action: () => this.enter() },
      { label: '继续游戏', action: () => this.enter() },
      { label: '游戏帮助', action: () => this.showHelp() },
      { label: '关于我们', action: () => this.showAbout() },
      { label: '退出游戏', action: () => this.quit() },
    ]
    items.forEach((it, i) => this.buildMenuItem(ITEM_Y0 + i * ITEM_STEP, it))
  }

  private buildMenuItem(y: number, item: MenuItem): void {
    // Vendor render is left-aligned starting at the button's own x anchor,
    // not centered in the panel (measured glyph-left == AS3 x to within
    // 0.15px, see the derivation note above) -- our previous centered
    // layout was self-invented chrome.
    // padding.top guards against the top-of-glyph clipping the 2026-07-08
    // feedback screenshot called out: Phaser/Canvas sizes a Text object's
    // render texture from context.measureText, which under-reports the true
    // ascent for this bold CJK glyph set, so tall strokes (e.g. 新/戏/戲-style
    // components) got cropped a few px at the top without it.
    const t = this.add
      .text(TEXT_LEFT_X, y, item.label, {
        fontSize: '28px',
        fontFamily: activeArtFont().family,
        color: '#f4f4f4',
        padding: { top: 10, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setDepth(7)
      .setInteractive({ useHandCursor: true })

    // Persistent divider under every item (vendor has one under all six
    // rows, including the last) -- previously this was only drawn on
    // hover, which is not what the reference shows. Vendor's divider is a
    // soft brush-stroke gradient (brighter center, fading at both ends,
    // measured peak alpha ~0.35); approximated here as a flat-alpha line,
    // an intentional simplification (documented in the report) rather than
    // an attempt at literal gradient reproduction.
    const dividerY = y + 21
    const dividerLeft = Math.max(PANEL_X + 8, TEXT_LEFT_X - DIVIDER_PAD)
    const dividerRight = Math.min(W - 6, TEXT_LEFT_X + t.width + DIVIDER_PAD)
    this.add
      .graphics()
      .setDepth(6)
      .lineStyle(1, 0xffffff, 0.26)
      .lineBetween(dividerLeft, dividerY, dividerRight, dividerY)

    t.on('pointerover', () => t.setColor('#ffd24a'))
    t.on('pointerout', () => t.setColor('#f4f4f4'))
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
        继续游戏: () => this.enter(),
        游戏帮助: () => this.showHelp(),
        关于我们: () => this.showAbout(),
        退出游戏: () => this.quit(),
      }
      map[label]?.()
    }
  }
}
