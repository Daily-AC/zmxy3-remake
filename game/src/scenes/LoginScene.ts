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

// 2026-07-09 用户拍板终稿 mock（login-mock-v2, 四人探头版）即素材：整张效果图
// 铺满画布当背景，功能件（输入框/印章热区/模式切换）像素对位叠在画中对应元素
// 上（生图 mock→代码复刻工作流，见 memory feedback-imggen-mock-then-code-
// replicate）。坐标为 mock 原图 2048x1152 → 960x540 画布的 0.46875 缩放后手工
// 对位值，调整时对照 game/public/assets/keyart/login-mock-ref.jpg。
export const LOGIN_THEME = {
  w: 960,
  h: 540,
  bgTexKey: 'login_mock_scroll',
  bgTexPath: 'assets/keyart/login-mock-ref.jpg',
  // Painted-element overlay geometry (canvas px).
  inputUser: { cx: 564, cy: 208, w: 250, h: 32 },
  inputPass: { cx: 564, cy: 279, w: 250, h: 32 },
  seal: { cx: 547, cy: 372, r: 46 },
  // Painted link line measured via PIL dark-pixel scan: orig y 888-936 → canvas
  // cy 426; local paper is warm tan (222,158,98), not pale parchment.
  modeLink: { cx: 538, cy: 426, w: 175, h: 24 },
  // Parchment palette sampled from the mock scroll.
  parchment: '#e9dcbd',
  parchmentPatch: 0xdc9e62,
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

    // Mode toggle: parchment patch covers the painted register line, dynamic
    // text offers the OTHER mode.
    const patch = this.add.rectangle(t.modeLink.cx, t.modeLink.cy, t.modeLink.w, t.modeLink.h, t.parchmentPatch, 1)
    const link = this.add
      .text(t.modeLink.cx, t.modeLink.cy, this.mode === 'register' ? '已有仙籍 · 直接入界' : '初来乍到 · 立名造册', {
        fontSize: t.fontSmall,
        color: t.ink,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.mode = this.mode === 'register' ? 'login' : 'register'
        this.render()
      })
    children.push(patch, link)

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
    box: { cx: number; cy: number; w: number; h: number },
    type: 'text' | 'password',
    placeholder: string,
  ): Phaser.GameObjects.DOMElement {
    const t = LOGIN_THEME
    const input = document.createElement('input')
    input.type = type
    input.maxLength = 40
    input.placeholder = placeholder
    Object.assign(input.style, {
      width: `${box.w}px`,
      height: `${box.h}px`,
      boxSizing: 'border-box',
      padding: '4px 10px',
      fontSize: '15px',
      fontFamily: '"Kaiti SC", "STKaiti", KaiTi, serif',
      border: 'none',
      borderBottom: `2px solid ${t.inkBorder}`,
      borderRadius: '2px',
      background: t.parchment,
      color: t.ink,
      outline: 'none',
      transition: 'box-shadow 160ms ease',
    })
    input.addEventListener('focus', () => {
      input.style.boxShadow = '0 0 0 2px rgba(179,39,30,0.45)'
    })
    input.addEventListener('blur', () => {
      input.style.boxShadow = 'none'
    })
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        this.stampSeal()
        void this.submit()
      }
    })
    return this.add.dom(box.cx, box.cy, input).setOrigin(0.5)
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

function runtimeSocialClient(): SocialClient {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
  return getSharedSocialClient(baseUrl)
}
