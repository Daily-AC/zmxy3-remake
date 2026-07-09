import Phaser from 'phaser'
import { Toast } from '../ui/hud/Toast'
import {
  SocialRestError,
  getSharedSocialClient,
  resolveSocialServerBaseUrl,
  type CoopSession,
  type LevelId,
  type RoomSnapshot,
  type ServerMessage,
  type SocialClient,
  type SocialRoomConnection,
} from '../net/socialClient'
import { SCENE } from './shellShared'

export const LOBBY_THEME = {
  w: 960,
  h: 540,
  bg: 0x10131d,
  panel: 0x1a130c,
  panelAlpha: 0.94,
  row: 0x241a10,
  gold: 0xd9b45a,
  disabled: 0x5d5140,
  text: '#f2eddf',
  muted: '#b8aa8a',
  active: '#ffd873',
  good: '#6ef0a0',
  danger: '#e07a7a',
  inputBg: 'rgba(14,16,26,0.82)',
  inputBorder: '#d9b45a',
  fontTitle: '26px',
  fontBody: '17px',
  fontSmall: '14px',
  panelW: 660,
  panelH: 390,
  inputW: 240,
} as const

type LobbyMode = 'roomSelect' | 'inRoom'
export type LobbyRoomView = RoomSnapshot | null

export function isOwner(room: RoomSnapshot | null, myUserId: string): boolean {
  return room?.ownerId === myUserId
}

export function roomMemberReady(room: RoomSnapshot | null, myUserId: string): boolean {
  return room?.members.find((member) => member.userId === myUserId)?.ready ?? false
}

export function canStartRoom(room: RoomSnapshot | null, myUserId: string): boolean {
  return (
    !!room &&
    isOwner(room, myUserId) &&
    room.status === 'waiting' &&
    room.members.length > 0 &&
    room.members.every((member) => member.ready)
  )
}

export function levelIdToIndex(levelId: LevelId): number {
  return levelId === 'L1' ? 0 : 1
}

export function reduceRoomState(room: LobbyRoomView, message: ServerMessage): LobbyRoomView {
  switch (message.type) {
    case 'room_state':
      return message.room
    case 'member_joined':
      if (!room || room.members.some((member) => member.userId === message.member.userId)) return room
      return {
        ...room,
        members: [...room.members, { userId: message.member.userId, username: message.member.username, ready: false }],
      }
    case 'member_left':
      if (!room) return null
      return {
        ...room,
        ownerId: message.newOwnerId ?? room.ownerId,
        members: room.members.filter((member) => member.userId !== message.userId),
      }
    case 'ready_changed':
      if (!room) return null
      return {
        ...room,
        members: room.members.map((member) =>
          member.userId === message.userId ? { ...member, ready: message.ready } : { ...member },
        ),
      }
    default:
      return room
  }
}

export class LobbyScene extends Phaser.Scene {
  private client!: SocialClient
  private toastUi!: Toast
  private root?: Phaser.GameObjects.Container
  private roomInput?: HTMLInputElement
  private mode: LobbyMode = 'roomSelect'
  private selectedLevel: LevelId = 'L1'
  private room: RoomSnapshot | null = null
  private connection: SocialRoomConnection | null = null
  private busy = false
  private statusLine = ''
  private suppressCloseToast = false

  constructor() {
    super(SCENE.coopLobby)
  }

  create(): void {
    this.client = runtimeSocialClient()
    if (!this.client.getSession()) {
      this.scene.start(SCENE.coopLogin)
      return
    }

    this.toastUi = new Toast(this)
    this.render()
    this.exposeHooks()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.suppressCloseToast = true
      this.connection?.dispose()
      this.clearRoot()
    })
  }

  /** Acceptance-test hooks, same convention as every other shell scene
   * (MainMenuScene/SlotSelectScene/CharacterSelectScene/WorldMapScene) --
   * lets scripted verification drive this canvas-rendered UI without pixel
   * coordinates. */
  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__shellScene = () => SCENE.coopLobby
    w.__shellLobbyState = () => ({
      mode: this.mode,
      room: this.room,
      myUserId: this.client.getSession()?.user.id ?? null,
      busy: this.busy,
      statusLine: this.statusLine,
    })
    w.__shellLobbyCreateRoom = (levelId: LevelId) => {
      this.selectedLevel = levelId
      void this.createRoom()
    }
    w.__shellLobbyJoinRoom = (roomId: string) => {
      if (this.roomInput) this.roomInput.value = roomId
      void this.joinTypedRoom()
    }
    w.__shellLobbyToggleReady = () => this.toggleReady()
    w.__shellLobbyStart = () => this.startRoom()
    w.__shellLobbyBackToMap = () => this.backToMap()
    w.__shellLobbyLogout = () => this.logout()
  }

  private render(): void {
    if (this.mode === 'inRoom') this.renderRoom()
    else this.renderRoomSelect()
  }

  private renderRoomSelect(): void {
    this.clearRoot()
    const t = LOBBY_THEME
    const cx = t.w / 2
    const cy = t.h / 2
    const panel = this.basePanel('联机大厅')
    const user = this.client.getSession()?.user.username ?? ''
    const userText = this.add.text(cx, cy - 138, `当前账号：${user}`, { fontSize: t.fontSmall, color: t.muted }).setOrigin(0.5)

    const levelLabel = this.add.text(cx - 210, cy - 78, '关卡', { fontSize: t.fontBody, color: t.text }).setOrigin(0, 0.5)
    const l1 = this.button(cx - 76, cy - 78, 74, 34, 'L1', () => {
      this.selectedLevel = 'L1'
      this.render()
    }, !this.busy, this.selectedLevel === 'L1')
    const l2 = this.button(cx + 8, cy - 78, 74, 34, 'L2', () => {
      this.selectedLevel = 'L2'
      this.render()
    }, !this.busy, this.selectedLevel === 'L2')
    const create = this.button(cx + 142, cy - 78, 150, 34, '创建房间', () => {
      void this.createRoom()
    }, !this.busy)

    const joinLabel = this.add.text(cx - 210, cy - 8, '加入房间', { fontSize: t.fontBody, color: t.text }).setOrigin(0, 0.5)
    const input = this.buildInput(cx - 76, cy - 8, t.inputW, '输入房间 ID', () => {
      void this.joinTypedRoom()
    })
    this.roomInput = input.node as HTMLInputElement
    const join = this.button(cx + 200, cy - 8, 110, 34, '加入', () => {
      void this.joinTypedRoom()
    }, !this.busy)

    const status = this.add
      .text(cx, cy + 64, this.statusLine, { fontSize: t.fontSmall, color: this.busy ? t.active : t.muted })
      .setOrigin(0.5)
    // 2026-07-09: lobby entry moved from the main menu to a button on the
    // world map (see WorldMapScene.goToLobby), so this needs its own way
    // back that doesn't log the player out.
    const back = this.button(cx - 120, cy + 126, 110, 32, '返回地图', () => this.backToMap(), !this.busy)
    const logout = this.button(cx + 120, cy + 126, 110, 32, '退出登录', () => this.logout(), !this.busy)

    this.root = this.add.container(0, 0, [panel, userText, levelLabel, l1, l2, create, joinLabel, input, join, status, back, logout])
  }

  private renderRoom(): void {
    this.clearRoot()
    const t = LOBBY_THEME
    const cx = t.w / 2
    const cy = t.h / 2
    const panel = this.basePanel('房间准备')
    const room = this.room
    const me = this.client.requireSession().user.id
    const header = this.add
      .text(
        cx,
        cy - 140,
        room ? `房间 ${room.id} · ${room.levelId}${isOwner(room, me) ? ' · 房主' : ''}` : '正在连接房间...',
        { fontSize: t.fontBody, color: t.active },
      )
      .setOrigin(0.5)
    const hint = this.add
      .text(cx, cy - 112, '把房间 ID 发给队友，对方在大厅输入后加入', { fontSize: t.fontSmall, color: t.muted })
      .setOrigin(0.5)

    const children: Phaser.GameObjects.GameObject[] = [panel, header, hint]
    if (room) {
      room.members.forEach((member, index) => {
        const y = cy - 58 + index * 34
        const row = this.add.rectangle(cx, y, 470, 28, t.row, 0.9).setStrokeStyle(1, t.gold, 0.25)
        const ownerMark = member.userId === room.ownerId ? '房主' : '队员'
        const meMark = member.userId === me ? ' · 我' : ''
        const name = this.add
          .text(cx - 220, y, `${member.username}（${ownerMark}${meMark}）`, { fontSize: t.fontSmall, color: t.text })
          .setOrigin(0, 0.5)
        const ready = this.add
          .text(cx + 140, y, member.ready ? '已准备' : '未准备', {
            fontSize: t.fontSmall,
            color: member.ready ? t.good : t.muted,
          })
          .setOrigin(0, 0.5)
        children.push(row, name, ready)
      })
    }

    const readyLabel = roomMemberReady(room, me) ? '取消准备' : '准备'
    const readyButton = this.button(cx - 146, cy + 126, 120, 34, readyLabel, () => this.toggleReady(), !!room)
    const startButton = isOwner(room, me)
      ? this.button(cx, cy + 126, 120, 34, '开始', () => this.startRoom(), canStartRoom(room, me))
      : this.add.container(0, 0)
    const leaveButton = this.button(cx + 146, cy + 126, 120, 34, '离开', () => this.leaveRoom(), true)
    children.push(readyButton, startButton, leaveButton)

    this.root = this.add.container(0, 0, children)
  }

  private basePanel(title: string): Phaser.GameObjects.Container {
    const t = LOBBY_THEME
    const cx = t.w / 2
    const cy = t.h / 2
    const bg = this.add.rectangle(cx, cy, t.w, t.h, t.bg, 1)
    const panel = this.add.graphics()
    panel.fillStyle(t.panel, t.panelAlpha).fillRoundedRect(cx - t.panelW / 2, cy - t.panelH / 2, t.panelW, t.panelH, 8)
    panel.lineStyle(2, t.gold, 0.85).strokeRoundedRect(cx - t.panelW / 2, cy - t.panelH / 2, t.panelW, t.panelH, 8)
    const titleText = this.add.text(cx, cy - 174, title, { fontSize: t.fontTitle, color: t.active, fontStyle: 'bold' }).setOrigin(0.5)
    return this.add.container(0, 0, [bg, panel, titleText])
  }

  private clearRoot(): void {
    this.root?.destroy(true)
    this.root = undefined
    this.roomInput = undefined
  }

  private button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    enabled = true,
    active = false,
  ): Phaser.GameObjects.Container {
    const fill = active ? 0x4a3817 : enabled ? 0x3a2c12 : LOBBY_THEME.disabled
    const rect = this.add.rectangle(0, 0, w, h, fill, enabled ? 0.95 : 0.65).setStrokeStyle(2, LOBBY_THEME.gold, enabled ? 1 : 0.35)
    const text = this.add
      .text(0, 0, label, {
        fontSize: LOBBY_THEME.fontBody,
        color: enabled ? LOBBY_THEME.active : LOBBY_THEME.muted,
        fontStyle: active ? 'bold' : '',
      })
      .setOrigin(0.5)
    const container = this.add.container(x, y, [rect, text]).setSize(w, h)
    if (enabled) container.setInteractive({ useHandCursor: true }).on('pointerdown', onClick)
    return container
  }

  private buildInput(leftX: number, cy: number, width: number, placeholder: string, onEnter: () => void): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 64
    input.placeholder = placeholder
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '7px 10px',
      fontSize: '15px',
      border: `1px solid ${LOBBY_THEME.inputBorder}`,
      borderRadius: '8px',
      background: LOBBY_THEME.inputBg,
      color: LOBBY_THEME.text,
      outline: 'none',
    })
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        onEnter()
      }
    })
    return this.add.dom(leftX, cy, input).setOrigin(0, 0.5)
  }

  private async createRoom(): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.statusLine = '创建房间中...'
    this.render()
    try {
      const room = await this.client.createRoom(this.selectedLevel)
      this.openRoomSocket(room.id)
    } catch (error) {
      this.toastUi.show(lobbyErrorMessage(error), LOBBY_THEME.danger)
      this.busy = false
      this.statusLine = ''
      this.render()
    }
  }

  private async joinTypedRoom(): Promise<void> {
    if (this.busy) return
    const roomId = this.roomInput?.value.trim() ?? ''
    if (!roomId) {
      this.toastUi.show('请输入房间 ID', LOBBY_THEME.danger)
      return
    }

    this.busy = true
    this.statusLine = '加入房间中...'
    this.render()
    try {
      const room = await this.client.joinRoom(roomId)
      this.openRoomSocket(room.id)
    } catch (error) {
      this.toastUi.show(lobbyErrorMessage(error), LOBBY_THEME.danger)
      this.busy = false
      this.statusLine = ''
      this.render()
    }
  }

  private openRoomSocket(roomId: string): void {
    this.connection?.dispose()
    this.room = null
    this.statusLine = '连接房间中...'
    this.connection = this.client.openRoomConnection(roomId)
    this.connection.onStatus = (status) => {
      if ((status === 'closed' || status === 'error') && !this.suppressCloseToast) this.handleConnectionDrop(status)
    }
    this.connection.onMessage = (message) => this.onRoomMessage(message)
    this.connection.connect()
    this.render()
  }

  private onRoomMessage(message: ServerMessage): void {
    if (message.type === 'error') {
      this.toastUi.show(message.message, LOBBY_THEME.danger)
      return
    }
    if (message.type === 'game_start') {
      this.startBattle(message.levelId)
      return
    }

    this.room = reduceRoomState(this.room, message)
    if (message.type === 'room_state') {
      this.mode = 'inRoom'
      this.busy = false
      this.statusLine = ''
    }
    if (this.mode === 'inRoom') this.render()
  }

  private handleConnectionDrop(status: 'closed' | 'error'): void {
    if (!this.busy && this.mode !== 'inRoom') return
    this.toastUi.show(status === 'error' ? '联机连接异常' : '联机连接已断开', LOBBY_THEME.danger)
    this.connection = null
    this.room = null
    this.mode = 'roomSelect'
    this.busy = false
    this.statusLine = ''
    this.render()
  }

  private toggleReady(): void {
    if (!this.room) return
    const ready = !roomMemberReady(this.room, this.client.requireSession().user.id)
    if (!this.connection?.send({ type: 'ready', ready })) this.toastUi.show('房间连接未就绪', LOBBY_THEME.danger)
  }

  private startRoom(): void {
    const myUserId = this.client.requireSession().user.id
    if (!canStartRoom(this.room, myUserId)) {
      this.toastUi.show('全员准备后才能开始', LOBBY_THEME.danger)
      return
    }
    if (!this.connection?.send({ type: 'start' })) this.toastUi.show('房间连接未就绪', LOBBY_THEME.danger)
  }

  private leaveRoom(): void {
    this.suppressCloseToast = true
    this.connection?.leave()
    this.suppressCloseToast = false
    this.connection = null
    this.room = null
    this.mode = 'roomSelect'
    this.busy = false
    this.statusLine = ''
    this.render()
  }

  private logout(): void {
    this.client.logout()
    this.scene.start(SCENE.coopLogin)
  }

  /** Back out to the world map without touching the session -- WorldMapScene
   * reads its slot from the registry, which is still set from login/select,
   * so this needs no extra data. */
  private backToMap(): void {
    this.scene.start(SCENE.worldMap)
  }

  private startBattle(levelId: LevelId): void {
    const room = this.room
    if (!room) return
    const myUserId = this.client.requireSession().user.id
    const coopSession: CoopSession = {
      roomId: room.id,
      levelId,
      myUserId,
      hostUserId: room.ownerId,
      isHost: room.ownerId === myUserId,
      peers: room.members
        .filter((member) => member.userId !== myUserId)
        .map((member) => ({ userId: member.userId, username: member.username })),
    }
    this.suppressCloseToast = true
    this.connection?.dispose()
    this.scene.start(SCENE.battle, { campaignIndex: levelIdToIndex(levelId), coopSession })
  }
}

export function lobbyErrorMessage(error: unknown): string {
  if (error instanceof SocialRestError) {
    if (error.code === 'not_logged_in' || error.code === 'unauthorized') return '请重新登录'
    if (error.code === 'not_found') return '房间不存在'
    if (error.code === 'full') return '房间已满'
    if (error.code === 'in_game') return '房间已开始'
    if (error.code === 'already_member') return '你已在该房间中'
    if (error.code === 'invalid_level') return '关卡无效'
    if (error.code === 'fetch_unavailable') return '当前环境无法发起网络请求'
  }
  return '联机请求失败，请稍后再试'
}

function runtimeSocialClient(): SocialClient {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
  return getSharedSocialClient(baseUrl)
}
