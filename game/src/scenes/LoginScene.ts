import Phaser from 'phaser'
import { Toast } from '../ui/hud/Toast'
import {
  SocialRestError,
  getSharedSocialClient,
  resolveSocialServerBaseUrl,
  type SocialClient,
} from '../net/socialClient'
import { SCENE, REG, shellStorage } from './shellShared'
import { readSlot } from '../systems/saveSlots'
import { restoreGameState } from '../systems/save'
import { addEmbers } from '../ui/embers'
import { configureLogicalCamera } from '../systems/renderScale'

// 2026-07-09 用户拍板终稿 mock（login-mock-v2, 四人探头版）即素材：整张效果图
// 铺满画布当背景，功能件（输入框/印章热区/模式切换）像素对位叠在画中对应元素
// 上（生图 mock→代码复刻工作流，见 memory feedback-imggen-mock-then-code-
// replicate）。坐标为 mock 原图 2048x1152 → 960x540 画布的 0.46875 缩放后手工
// 对位值，调整时对照 game/public/assets/keyart/login-mock-ref.jpg。
export const LOGIN_THEME = {
  w: 960,
  h: 540,
  // login-bg.jpg = login-mock-v2 with painted 仙号/符咒 glyphs and the painted
  // register line ERASED via texture clone (tools: inline PIL, see progress
  // 17:2x) so transparent inputs can live inside the painted frames without
  // covering them with flat patches (用户打回的糊弄点).
  bgTexKey: 'login_bg_clean',
  bgTexPath: 'assets/keyart/login-bg.jpg',
  // Painted-element overlay geometry (canvas px), PIL-measured. The hand-drawn
  // scroll leans: per-element rotations (rad) measured from ink borders.
  inputUser: { cx: 564, cy: 207, w: 248, h: 30, rot: 0.028 },
  inputPass: { cx: 566, cy: 283, w: 248, h: 30, rot: 0.026 },
  seal: { cx: 547, cy: 372, r: 46 },
  modeLink: { cx: 540, cy: 427, rot: 0.049 },
  // Parchment palette sampled from the mock scroll.
  parchment: '#e9dcbd',
  ink: '#2f2418',
  inkBorder: '#4a3a24',
  sealRed: 0xb3271e,
  danger: '#e07a7a',
  text: '#f2eddf',
  fontBody: '16px',
  fontSmall: '13px',
} as const

type LoginMode = 'register' | 'login'

export class LoginScene extends Phaser.Scene {
  private client!: SocialClient
  private toastUi!: Toast
  private root?: Phaser.GameObjects.Container
  private usernameInput?: HTMLInputElement
  private passwordInput?: HTMLInputElement
  private mode: LoginMode = 'register'
  private submitting = false

  constructor() {
    super(SCENE.coopLogin)
  }

  preload(): void {
    if (!this.textures.exists(LOGIN_THEME.bgTexKey)) {
      this.load.image(LOGIN_THEME.bgTexKey, LOGIN_THEME.bgTexPath)
    }
  }

  create(): void {
    configureLogicalCamera(this)
    this.client = runtimeSocialClient()
    if (this.client.getSession()) {
      this.enterGame()
      return
    }

    this.toastUi = new Toast(this)
    this.render()
    this.cameras.main.fadeIn(450, 0, 0, 0)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearRoot())
  }

  private render(): void {
    this.clearRoot()
    const t = LOGIN_THEME

    const children: Phaser.GameObjects.GameObject[] = []

    if (this.textures.exists(t.bgTexKey)) {
      const bg = this.add.image(t.w / 2, t.h / 2, t.bgTexKey)
      bg.setScale(Math.max(t.w / bg.width, t.h / bg.height))
      children.push(bg)
      // Scroll unfurl illusion: the whole sheet settles down a few px while
      // fading in (the mock's scroll reads as freshly unrolled).
      bg.y -= 8
      this.tweens.add({ targets: bg, y: t.h / 2, duration: 650, ease: 'Back.easeOut' })
    } else {
      children.push(this.add.rectangle(t.w / 2, t.h / 2, t.w, t.h, 0x1a130c, 1))
    }

    // DOM inputs sit exactly over the painted 仙号/符咒 boxes; opaque parchment
    // background hides the painted placeholder glyphs beneath.
    const userDom = this.buildInput(t.inputUser, 'text', '仙号')
    const passDom = this.buildInput(t.inputPass, 'password', '符咒')
    this.usernameInput = userDom.node as HTMLInputElement
    this.passwordInput = passDom.node as HTMLInputElement
    children.push(userDom, passDom)

    // 入界 seal: painted art is the button; add an invisible circular hit zone
    // plus a press "stamp" animation overlay.
    const sealZone = this.add
      .circle(t.seal.cx, t.seal.cy, t.seal.r, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    sealZone.on('pointerdown', () => {
      this.stampSeal()
      void this.submit()
    })
    children.push(sealZone)

    // Mode toggle: the painted register line is erased from login-bg.jpg, so
    // dynamic ink text draws straight on parchment, tilted with the scroll.
    const link = this.add
      .text(t.modeLink.cx, t.modeLink.cy, this.mode === 'register' ? '已有仙籍 · 直接入界' : '初来乍到 · 立名造册', {
        fontSize: t.fontSmall,
        fontFamily: '"Kaiti SC", "STKaiti", KaiTi, serif',
        color: t.ink,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setRotation(t.modeLink.rot)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.mode = this.mode === 'register' ? 'login' : 'register'
        this.render()
      })
    children.push(link)

    this.root = this.add.container(0, 0, children)
    addEmbers(this, { w: t.w, h: t.h, count: 14 })
    setTimeout(() => this.usernameInput?.focus(), 0)
  }

  /** Red ripple + squash on the painted seal -- the "stamp" feedback. */
  private stampSeal(): void {
    const t = LOGIN_THEME
    const ring = this.add.circle(t.seal.cx, t.seal.cy, t.seal.r * 0.7, t.sealRed, 0.5)
    ring.setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: ring,
      radius: t.seal.r * 1.7,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  private clearRoot(): void {
    this.root?.destroy(true)
    this.root = undefined
    this.usernameInput = undefined
    this.passwordInput = undefined
  }

  private buildInput(
    box: { cx: number; cy: number; w: number; h: number; rot: number },
    type: 'text' | 'password',
    placeholder: string,
  ): Phaser.GameObjects.DOMElement {
    const t = LOGIN_THEME
    ensurePlaceholderStyle()
    const input = document.createElement('input')
    input.type = type
    input.maxLength = 40
    input.placeholder = placeholder
    input.className = 'wendie-input'
    // Fully transparent: the painted frame IS the input chrome. Focus feedback
    // is a soft ink underline, not a box.
    Object.assign(input.style, {
      width: `${box.w}px`,
      height: `${box.h}px`,
      boxSizing: 'border-box',
      padding: '4px 10px',
      fontSize: '16px',
      fontFamily: '"Kaiti SC", "STKaiti", KaiTi, serif',
      border: 'none',
      background: 'transparent',
      color: t.ink,
      caretColor: '#8a1f18',
      outline: 'none',
      transition: 'text-shadow 160ms ease',
      // Phaser DOMElement.setRotation does not reach the node in this setup;
      // rotate the input itself so text/caret sit on the hand-drawn tilt.
      transform: `rotate(${(box.rot * 180) / Math.PI}deg)`,
    })
    input.addEventListener('focus', () => {
      input.style.textShadow = '0 0 6px rgba(179,39,30,0.35)'
    })
    input.addEventListener('blur', () => {
      input.style.textShadow = 'none'
    })
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        this.stampSeal()
        void this.submit()
      }
    })
    return this.add.dom(box.cx, box.cy, input).setOrigin(0.5).setRotation(box.rot)
  }

  private async submit(): Promise<void> {
    if (this.submitting) return
    const username = this.usernameInput?.value.trim() ?? ''
    const password = this.passwordInput?.value.trim() ?? ''
    if (!username || !password) {
      this.toastUi.show('请填写仙号和符咒', LOGIN_THEME.danger)
      return
    }

    this.submitting = true
    try {
      if (this.mode === 'register') await this.client.register(username, password)
      else await this.client.login(username, password)
      this.enterGame()
    } catch (error) {
      this.toastUi.show(authErrorMessage(error, this.mode), LOGIN_THEME.danger)
    } finally {
      this.submitting = false
    }
  }

  /**
   * 2026-07-09 screen-flow change (用户拍板): login is now the game's front
   * gate, not an entry into the lobby. SlotSelectScene's picker UI is
   * deactivated for the hackathon (code stays in the repo, just bypassed) --
   * this replicates its per-slot decision for the fixed slot 0: an existing
   * save resumes straight to the world map (mirrors
   * SlotSelectScene.continueGame), an empty one goes through character
   * select once (mirrors SlotSelectScene.startNewGame). The lobby is reached
   * later from a button on the world map, not from here.
   */
  private enterGame(): void {
    const storage = shellStorage()
    const env = readSlot(storage, 0)
    if (env) {
      this.registry.set(REG.activeSlot, 0)
      this.registry.set(REG.activeSave, env.save)
      this.registry.set(REG.loadedState, restoreGameState(env.save))
      this.registry.set(REG.origin, 'continue')
      this.scene.start(SCENE.worldMap)
      return
    }
    this.scene.start(SCENE.characterSelect, { slot: 0 })
  }
}

export function authErrorMessage(error: unknown, mode: LoginMode): string {
  if (error instanceof SocialRestError) {
    if (error.code === 'username_taken') return '此仙号已有人立名'
    if (error.code === 'invalid_credentials') return '仙号或符咒有误'
    if (error.code === 'invalid_input') return '请填写仙号和符咒'
    if (error.code === 'fetch_unavailable') return '当前环境无法发起网络请求'
  }
  return mode === 'register' ? '立名失败，请稍后再试' : '入界失败，请稍后再试'
}

/** Inject the ::placeholder rule once (inline styles can't target it). */
function ensurePlaceholderStyle(): void {
  if (document.getElementById('wendie-input-style')) return
  const style = document.createElement('style')
  style.id = 'wendie-input-style'
  style.textContent = '.wendie-input::placeholder { color: rgba(47,36,24,0.42); font-family: "Kaiti SC","STKaiti",KaiTi,serif; }'
  document.head.appendChild(style)
}

function runtimeSocialClient(): SocialClient {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
  return getSharedSocialClient(baseUrl)
}
