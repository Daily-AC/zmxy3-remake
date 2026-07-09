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

export const LOGIN_THEME = {
  w: 960,
  h: 540,
  bg: 0x10131d,
  panel: 0x1a130c,
  panelAlpha: 0.94,
  gold: 0xd9b45a,
  text: '#f2eddf',
  muted: '#b8aa8a',
  active: '#ffd873',
  danger: '#e07a7a',
  inputBg: 'rgba(14,16,26,0.82)',
  inputBorder: '#d9b45a',
  fontTitle: '28px',
  fontBody: '17px',
  fontSmall: '14px',
  panelW: 440,
  panelH: 330,
  inputW: 260,
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

  create(): void {
    this.client = runtimeSocialClient()
    if (this.client.getSession()) {
      this.enterGame()
      return
    }

    this.toastUi = new Toast(this)
    this.render()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearRoot())
  }

  private render(): void {
    this.clearRoot()
    const t = LOGIN_THEME
    const cx = t.w / 2
    const cy = t.h / 2
    const left = cx - t.panelW / 2

    const bg = this.add.rectangle(cx, cy, t.w, t.h, t.bg, 1)
    const panel = this.add.graphics()
    panel.fillStyle(t.panel, t.panelAlpha).fillRoundedRect(left, cy - t.panelH / 2, t.panelW, t.panelH, 8)
    panel.lineStyle(2, t.gold, 0.85).strokeRoundedRect(left, cy - t.panelH / 2, t.panelW, t.panelH, 8)

    const title = this.add
      .text(cx, cy - 128, '联机共斗', { fontSize: t.fontTitle, color: t.active, fontStyle: 'bold' })
      .setOrigin(0.5)
    const subtitle = this.add
      .text(cx, cy - 94, this.mode === 'register' ? '注册账号' : '登录账号', { fontSize: t.fontBody, color: t.text })
      .setOrigin(0.5)

    const registerToggle = this.toggleLabel(cx - 54, cy - 58, '注册', this.mode === 'register', () => {
      this.mode = 'register'
      this.render()
    })
    const loginToggle = this.toggleLabel(cx + 54, cy - 58, '登录', this.mode === 'login', () => {
      this.mode = 'login'
      this.render()
    })

    const usernameLabel = this.add.text(cx - t.inputW / 2, cy - 18, '用户名', { fontSize: t.fontSmall, color: t.muted })
    const passwordLabel = this.add.text(cx - t.inputW / 2, cy + 48, '密码', { fontSize: t.fontSmall, color: t.muted })
    const usernameDom = this.buildInput(cx - t.inputW / 2, cy + 12, t.inputW, 'text', '输入用户名')
    const passwordDom = this.buildInput(cx - t.inputW / 2, cy + 78, t.inputW, 'password', '输入密码')
    this.usernameInput = usernameDom.node as HTMLInputElement
    this.passwordInput = passwordDom.node as HTMLInputElement

    const submit = this.button(cx, cy + 138, 150, 36, this.mode === 'register' ? '注册进入' : '登录进入', () => {
      void this.submit()
    })

    this.root = this.add.container(0, 0, [
      bg,
      panel,
      title,
      subtitle,
      registerToggle,
      loginToggle,
      usernameLabel,
      passwordLabel,
      usernameDom,
      passwordDom,
      submit,
    ])
    setTimeout(() => this.usernameInput?.focus(), 0)
  }

  private clearRoot(): void {
    this.root?.destroy(true)
    this.root = undefined
    this.usernameInput = undefined
    this.passwordInput = undefined
  }

  private toggleLabel(
    x: number,
    y: number,
    label: string,
    active: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontSize: LOGIN_THEME.fontBody,
        color: active ? LOGIN_THEME.active : LOGIN_THEME.muted,
        fontStyle: active ? 'bold' : '',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick)
  }

  private button(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const rect = this.add.rectangle(0, 0, w, h, 0x3a2c12, 0.95).setStrokeStyle(2, LOGIN_THEME.gold, 1)
    const text = this.add
      .text(0, 0, label, { fontSize: LOGIN_THEME.fontBody, color: LOGIN_THEME.active, fontStyle: 'bold' })
      .setOrigin(0.5)
    const container = this.add.container(x, y, [rect, text]).setSize(w, h).setInteractive({ useHandCursor: true })
    container.on('pointerdown', onClick)
    return container
  }

  private buildInput(
    leftX: number,
    cy: number,
    width: number,
    type: 'text' | 'password',
    placeholder: string,
  ): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = type
    input.maxLength = 40
    input.placeholder = placeholder
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '7px 10px',
      fontSize: '15px',
      border: `1px solid ${LOGIN_THEME.inputBorder}`,
      borderRadius: '8px',
      background: LOGIN_THEME.inputBg,
      color: LOGIN_THEME.text,
      outline: 'none',
    })
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        void this.submit()
      }
    })
    return this.add.dom(leftX, cy, input).setOrigin(0, 0.5)
  }

  private async submit(): Promise<void> {
    if (this.submitting) return
    const username = this.usernameInput?.value.trim() ?? ''
    const password = this.passwordInput?.value.trim() ?? ''
    if (!username || !password) {
      this.toastUi.show('请填写用户名和密码', LOGIN_THEME.danger)
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
    if (error.code === 'username_taken') return '用户名已存在'
    if (error.code === 'invalid_credentials') return '用户名或密码错误'
    if (error.code === 'invalid_input') return '请填写用户名和密码'
    if (error.code === 'fetch_unavailable') return '当前环境无法发起网络请求'
  }
  return mode === 'register' ? '注册失败，请稍后再试' : '登录失败，请稍后再试'
}

function runtimeSocialClient(): SocialClient {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
  return getSharedSocialClient(baseUrl)
}
