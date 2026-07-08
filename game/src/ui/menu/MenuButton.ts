import Phaser from 'phaser'
import { withinRect, type Rect } from '../screenHit'

// Reusable menu button in the game's established visual DNA: warm-wood /
// orange-yellow rounded plate with a dark-brown edge and a thin gold inner line,
// mirroring the original 4399 button skin (`button_game_style_*` in the UI
// MANIFEST) rather than the plain Flash default skins. Drawn with Graphics so it
// needs no bespoke button atlas; a transparent Rectangle on top is the hit area.
//
// By default this uses Phaser's native setInteractive(), which is correct and
// simplest in the static-camera scenes this button normally lives in (main
// menu, slot select, world map). Pass `screenSpaceHit: true` when embedding
// this button inside a scrollFactor(0) container in a scene whose camera
// scrolls (e.g. ResultBanner, shown over BattleScene) -- native
// setInteractive() hit-tests in world space via the camera's current scroll
// and drifts out from under the rendered button the moment the camera moves.
// See ui/screenHit.ts for the full mechanism.

export type MenuButtonVariant = 'primary' | 'ghost' | 'danger'

export interface MenuButtonOpts {
  x: number
  y: number
  width: number
  height: number
  label: string
  fontSize?: number
  variant?: MenuButtonVariant
  enabled?: boolean
  /** See the file header note: true for scrolling-camera hosts (ResultBanner
   * in BattleScene), false (default) for static-camera menu/map scenes. */
  screenSpaceHit?: boolean
  onClick: () => void
}

type Palette = { top: number; bottom: number; edge: number; inner: number; text: string }

const PALETTES: Record<MenuButtonVariant, Palette> = {
  // Orange-yellow wood plate, dark-brown edge, gold inner line, near-black text.
  primary: { top: 0xf2c65a, bottom: 0xd98f2e, edge: 0x4a2c12, inner: 0xfbe6a0, text: '#3a2410' },
  // Quieter parchment/wood for secondary actions.
  ghost: { top: 0x6b4a2c, bottom: 0x4a3016, edge: 0x2c1a0c, inner: 0xd9b45a, text: '#f2eddf' },
  // Muted red-brown for destructive (delete) actions.
  danger: { top: 0xb85c3c, bottom: 0x8a3a22, edge: 0x3a1408, inner: 0xe6a06a, text: '#f7e9df' },
}

const DISABLED: Palette = { top: 0x555045, bottom: 0x3a352e, edge: 0x24211c, inner: 0x6b6458, text: '#9b968c' }

export class MenuButton {
  readonly container: Phaser.GameObjects.Container
  private readonly opts: Required<Omit<MenuButtonOpts, 'onClick'>> & Pick<MenuButtonOpts, 'onClick'>
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly text: Phaser.GameObjects.Text
  private readonly hit: Phaser.GameObjects.Rectangle
  private enabled: boolean
  private state: 'idle' | 'hover' | 'down' = 'idle'

  constructor(scene: Phaser.Scene, opts: MenuButtonOpts) {
    this.opts = {
      fontSize: 20,
      variant: 'primary',
      enabled: true,
      screenSpaceHit: false,
      ...opts,
    }
    this.enabled = this.opts.enabled

    const { width: w, height: h } = this.opts
    this.gfx = scene.add.graphics()
    this.text = scene.add
      .text(0, 0, this.opts.label, {
        fontSize: `${this.opts.fontSize}px`,
        fontStyle: 'bold',
        color: PALETTES[this.opts.variant].text,
      })
      .setOrigin(0.5)
    this.hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0)

    this.container = scene.add
      .container(this.opts.x, this.opts.y, [this.gfx, this.text, this.hit])
      .setScrollFactor(0)

    if (this.opts.screenSpaceHit) {
      this.wireScreenSpaceHit(scene)
    } else {
      this.hit.setInteractive({ useHandCursor: true })
      this.hit.on('pointerover', () => {
        if (!this.enabled) return
        this.state = 'hover'
        this.redraw()
      })
      this.hit.on('pointerout', () => {
        if (!this.enabled) return
        this.state = 'idle'
        this.redraw()
      })
      this.hit.on('pointerdown', () => {
        if (!this.enabled) return
        this.state = 'down'
        this.redraw()
      })
      this.hit.on('pointerup', () => {
        if (!this.enabled) return
        const wasDown = this.state === 'down'
        this.state = 'hover'
        this.redraw()
        if (wasDown) this.opts.onClick()
      })
    }

    this.redraw()
  }

  /** See the file header note + ui/screenHit.ts. Registers scene-level
   * pointer listeners (instead of setInteractive() on this.hit) that hit-test
   * against this button's actual on-screen rect, computed fresh each time via
   * getWorldTransformMatrix() -- robust to however deep this button ends up
   * nested (ResultBanner puts it inside its own `body` sub-container).
   * Cleaned up on scene shutdown AND on this button's own container being
   * destroyed (ResultBanner tears down and rebuilds its buttons on every
   * show()), so repeated boss-clear banners don't accumulate dead listeners. */
  private wireScreenSpaceHit(scene: Phaser.Scene): void {
    const rectNow = (): Rect => {
      const m = this.container.getWorldTransformMatrix()
      const { width: w, height: h } = this.opts
      return { x: m.tx - w / 2, y: m.ty - h / 2, w, h }
    }
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (!this.enabled || !this.container.visible) return
      const over = withinRect(pointer.x, pointer.y, rectNow())
      if (over && this.state === 'idle') {
        this.state = 'hover'
        this.redraw()
      } else if (!over && this.state === 'hover') {
        this.state = 'idle'
        this.redraw()
      }
    }
    const onDown = (pointer: Phaser.Input.Pointer): void => {
      if (!this.enabled || !this.container.visible) return
      if (!withinRect(pointer.x, pointer.y, rectNow())) return
      this.state = 'down'
      this.redraw()
    }
    const onUp = (pointer: Phaser.Input.Pointer): void => {
      if (!this.enabled || !this.container.visible) return
      const wasDown = this.state === 'down'
      const over = withinRect(pointer.x, pointer.y, rectNow())
      this.state = over ? 'hover' : 'idle'
      this.redraw()
      if (wasDown && over) this.opts.onClick()
    }
    scene.input.on('pointermove', onMove)
    scene.input.on('pointerdown', onDown)
    scene.input.on('pointerup', onUp)
    const cleanup = (): void => {
      scene.input.off('pointermove', onMove)
      scene.input.off('pointerdown', onDown)
      scene.input.off('pointerup', onUp)
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.container.once(Phaser.GameObjects.Events.DESTROY, cleanup)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!this.opts.screenSpaceHit) this.hit.input && (this.hit.input.enabled = enabled)
    if (!enabled) this.state = 'idle'
    this.redraw()
  }

  setDepth(depth: number): this {
    this.container.setDepth(depth)
    return this
  }

  private redraw(): void {
    const { width: w, height: h } = this.opts
    const pal = this.enabled ? PALETTES[this.opts.variant] : DISABLED
    const g = this.gfx
    const x = -w / 2
    const y = -h / 2
    const lift = this.state === 'down' ? 2 : 0
    g.clear()
    // Drop shadow.
    g.fillStyle(0x000000, 0.28)
    g.fillRoundedRect(x + 3, y + 4, w, h, 10)
    // Base plate.
    g.fillStyle(pal.bottom, 1)
    g.fillRoundedRect(x, y + lift, w, h, 10)
    // Top highlight band for a lit, glossy read (upper ~55%).
    g.fillStyle(pal.top, this.state === 'hover' ? 1 : 0.92)
    g.fillRoundedRect(x + 2, y + 2 + lift, w - 4, h * 0.55, 8)
    // Dark wood edge + thin gold inner line.
    g.lineStyle(2.5, pal.edge, 1)
    g.strokeRoundedRect(x, y + lift, w, h, 10)
    g.lineStyle(1, pal.inner, this.enabled ? 0.9 : 0.5)
    g.strokeRoundedRect(x + 3, y + 3 + lift, w - 6, h - 6, 7)
    this.text.setColor(pal.text).setPosition(0, lift)
    this.text.setAlpha(this.enabled ? 1 : 0.85)
  }
}
