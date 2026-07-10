import Phaser from 'phaser'
import { Toast } from '../ui/hud/Toast'
import { activeArtFont } from '../systems/artFont'
import { MenuButton } from '../ui/menu/MenuButton'
import type { MenuButtonVariant } from '../ui/menu/MenuButton'
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
import { configureLogicalCamera } from '../systems/renderScale'
import { BATTLE_LOADING_BACKGROUNDS } from './battleLoadingContent'

// 2026-07-09 视觉重做（用户打磨反馈：素面板 → 全游戏统一的水墨×暗金基调）。
// 逻辑/协议/验收 hook 与重做前完全一致，只换了渲染层：地图暗化作底、双线金边
// 墨面板、毛笔字体标题、MenuButton（主菜单同款木纹按钮）替代素色矩形按钮。
export const LOBBY_THEME = {
  w: 960,
  h: 540,
  bg: 0x0b0a0d,
  panel: 0x14100b,
  panelAlpha: 0.93,
  row: 0x241a10,
  gold: 0xd9b45a,
  goldDim: 0x8a6a30,
  disabled: 0x5d5140,
  text: '#f2eddf',
  muted: '#b8aa8a',
  active: '#ffd873',
  good: '#6ef0a0',
  danger: '#e07a7a',
  inputBg: 'rgba(20,14,8,0.9)',
  inputBorder: '#d9b45a',
  fontTitle: '34px',
  fontBody: '17px',
  fontSmall: '14px',
  panelW: 640,
  panelH: 440,
  inputW: 250,
} as const

const LOBBY_BG_TEX = 'wm_map_bg'

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

  preload(): void {
    // 世界地图原画作暗化底图（玩家从地图进大厅，视觉上是同一空间的延续）。
    if (!this.textures.exists(LOBBY_BG_TEX)) this.load.image(LOBBY_BG_TEX, 'assets/extracted/worldmap/map_bg.jpg')
    for (const background of BATTLE_LOADING_BACKGROUNDS) {
      if (!this.textures.exists(background.key)) this.load.image(background.key, background.url)
    }
  }

  create(): void {
    configureLogicalCamera(this)
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
    const panel = this.basePanel('联机大厅')
    this.root = this.add.container(0, 0, [panel])

    const user = this.client.getSession()?.user.username ?? ''
    this.root.add(
      this.add.text(cx, 148, `当前账号 · ${user}`, { fontSize: t.fontSmall, color: t.muted }).setOrigin(0.5),
    )

    this.root.add(this.sectionLabel(238, 205, '关　卡'))
    this.lobbyButton(408, 205, 86, 40, 'L1', () => {
      this.selectedLevel = 'L1'
      this.render()
    }, !this.busy, this.selectedLevel === 'L1' ? 'primary' : 'ghost')
    this.lobbyButton(504, 205, 86, 40, 'L2', () => {
      this.selectedLevel = 'L2'
      this.render()
    }, !this.busy, this.selectedLevel === 'L2' ? 'primary' : 'ghost')
    this.lobbyButton(650, 205, 150, 40, '创建房间', () => {
      void this.createRoom()
    }, !this.busy, 'primary')

    this.root.add(this.sectionLabel(238, 285, '加入房间'))
    const input = this.buildInput(330, 285, t.inputW, '输入房间 ID', () => {
      void this.joinTypedRoom()
    })
    this.roomInput = input.node as HTMLInputElement
    this.root.add(input)
    this.lobbyButton(650, 285, 110, 40, '加入', () => {
      void this.joinTypedRoom()
    }, !this.busy, 'ghost')

    this.root.add(
      this.add
        .text(cx, 345, this.statusLine, { fontSize: t.fontSmall, color: this.busy ? t.active : t.muted })
        .setOrigin(0.5),
    )
    // 2026-07-09: lobby entry moved from the main menu to a button on the
    // world map (see WorldMapScene.goToLobby), so this needs its own way
    // back that doesn't log the player out.
    this.lobbyButton(390, 428, 150, 40, '返回地图', () => this.backToMap(), !this.busy, 'ghost')
    this.lobbyButton(570, 428, 150, 40, '退出登录', () => this.logout(), !this.busy, 'danger')
  }

  private renderRoom(): void {
    this.clearRoot()
    const t = LOBBY_THEME
    const cx = t.w / 2
    const panel = this.basePanel('房间准备')
    this.root = this.add.container(0, 0, [panel])
    const room = this.room
    const me = this.client.requireSession().user.id

    this.root.add(
      this.add
        .text(
          cx,
          150,
          room ? `房间 ${room.id} · ${room.levelId}${isOwner(room, me) ? ' · 房主' : ''}` : '正在连接房间...',
          { fontSize: '19px', color: t.active, fontStyle: 'bold' },
        )
        .setOrigin(0.5),
    )
    this.root.add(
      this.add
        .text(cx, 178, '把房间 ID 发给队友，对方在大厅输入后加入', { fontSize: t.fontSmall, color: t.muted })
        .setOrigin(0.5),
    )

    if (room) {
      room.members.forEach((member, index) => {
        const y = 220 + index * 42
        const row = this.add.graphics()
        row.fillStyle(t.row, 0.92).fillRoundedRect(cx - 250, y - 17, 500, 34, 8)
        row.lineStyle(1, t.gold, 0.35).strokeRoundedRect(cx - 250, y - 17, 500, 34, 8)
        const ownerMark = member.userId === room.ownerId ? '房主' : '队员'
        const meMark = member.userId === me ? ' · 我' : ''
        const name = this.add
          .text(cx - 228, y, `${member.username}（${ownerMark}${meMark}）`, { fontSize: t.fontSmall, color: t.text })
          .setOrigin(0, 0.5)
        const ready = this.add
          .text(cx + 160, y, member.ready ? '已准备' : '未准备', {
            fontSize: t.fontSmall,
            color: member.ready ? t.good : t.muted,
            fontStyle: member.ready ? 'bold' : '',
          })
          .setOrigin(0, 0.5)
        this.root?.add([row, name, ready])
      })
    }

    const readyLabel = roomMemberReady(room, me) ? '取消准备' : '准　备'
    this.lobbyButton(334, 428, 140, 40, readyLabel, () => this.toggleReady(), !!room, 'primary')
    if (isOwner(room, me)) {
      this.lobbyButton(480, 428, 130, 40, '开　始', () => this.startRoom(), canStartRoom(room, me), 'primary')
    }
    this.lobbyButton(626, 428, 130, 40, '离　开', () => this.leaveRoom(), true, 'danger')
  }

  /** 全屏底：暗化世界地图 + 墨色渐晕 + 双线金边墨面板 + 毛笔字标题。 */
  private basePanel(title: string): Phaser.GameObjects.Container {
    const t = LOBBY_THEME
    const cx = t.w / 2
    const cy = t.h / 2
    const children: Phaser.GameObjects.GameObject[] = []

    children.push(this.add.rectangle(cx, cy, t.w, t.h, t.bg, 1))
    if (this.textures.exists(LOBBY_BG_TEX)) {
      // map_bg 940x590 cover-fit 进 960x540（放大 1.022，垂直居中裁切）。
      const img = this.add.image(cx, cy, LOBBY_BG_TEX)
      const s = Math.max(t.w / img.width, t.h / img.height)
      img.setScale(s).setAlpha(0.35)
      children.push(img)
    }
    const shade = this.add.graphics()
    shade.fillStyle(0x0b0a0d, 0.55).fillRect(0, 0, t.w, t.h)
    shade.fillGradientStyle(0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0.85, 0.85, 0, 0)
    shade.fillRect(0, 0, t.w, 120)
    shade.fillGradientStyle(0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0x0b0a0d, 0, 0, 0.9, 0.9)
    shade.fillRect(0, t.h - 120, t.w, 120)
    children.push(shade)

    const px = cx - t.panelW / 2
    const py = cy - t.panelH / 2
    const panel = this.add.graphics()
    panel.fillStyle(t.panel, t.panelAlpha).fillRoundedRect(px, py, t.panelW, t.panelH, 12)
    panel.lineStyle(3, 0x2c1a0c, 1).strokeRoundedRect(px - 2, py - 2, t.panelW + 4, t.panelH + 4, 14)
    panel.lineStyle(2, t.gold, 0.9).strokeRoundedRect(px, py, t.panelW, t.panelH, 12)
    panel.lineStyle(1, t.goldDim, 0.7).strokeRoundedRect(px + 6, py + 6, t.panelW - 12, t.panelH - 12, 9)
    children.push(panel)

    const titleText = this.add
      .text(cx, py + 44, title, {
        fontSize: t.fontTitle,
        fontFamily: activeArtFont().family,
        color: t.active,
        stroke: '#2c1a0c',
        strokeThickness: 4,
        padding: { top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
    children.push(titleText)

    // 标题下分隔线：两翼渐隐金线 + 中央菱形。
    const divider = this.add.graphics()
    const dy = py + 78
    divider.fillGradientStyle(t.gold, t.gold, t.gold, t.gold, 0, 0.85, 0, 0.85)
    divider.fillRect(cx - 200, dy, 194, 1.5)
    divider.fillGradientStyle(t.gold, t.gold, t.gold, t.gold, 0.85, 0, 0.85, 0)
    divider.fillRect(cx + 6, dy, 194, 1.5)
    divider.fillStyle(t.gold, 0.95)
    divider.beginPath()
    divider.moveTo(cx, dy - 4)
    divider.lineTo(cx + 5, dy + 0.75)
    divider.lineTo(cx, dy + 5.5)
    divider.lineTo(cx - 5, dy + 0.75)
    divider.closePath()
    divider.fillPath()
    children.push(divider)

    return this.add.container(0, 0, children)
  }

  private sectionLabel(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontSize: '22px',
        fontFamily: activeArtFont().family,
        color: '#e8d9b0',
        stroke: '#2c1a0c',
        strokeThickness: 3,
        padding: { top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
  }

  private clearRoot(): void {
    this.root?.destroy(true)
    this.root = undefined
    this.roomInput = undefined
  }

  /** MenuButton（主菜单/世界地图同款木纹按钮）挂进 root，随 render() 重建销毁。 */
  private lobbyButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    enabled = true,
    variant: MenuButtonVariant = 'ghost',
  ): MenuButton {
    const btn = new MenuButton(this, {
      x,
      y,
      width: w,
      height: h,
      label,
      fontSize: 17,
      variant,
      enabled,
      onClick,
    })
    this.root?.add(btn.container)
    return btn
  }

  private buildInput(leftX: number, cy: number, width: number, placeholder: string, onEnter: () => void): Phaser.GameObjects.DOMElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 64
    input.placeholder = placeholder
    Object.assign(input.style, {
      width: `${width}px`,
      boxSizing: 'border-box',
      padding: '9px 12px',
      fontSize: '15px',
      border: `1.5px solid ${LOBBY_THEME.inputBorder}`,
      borderRadius: '6px',
      background: LOBBY_THEME.inputBg,
      color: LOBBY_THEME.text,
      outline: 'none',
      letterSpacing: '0.06em',
      boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.55)',
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
    this.scene.start(SCENE.battleLoading, {
      battleData: { campaignIndex: levelIdToIndex(levelId), coopSession },
    })
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
