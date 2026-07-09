export const DEFAULT_SOCIAL_SERVER_BASE_URL = 'https://zm-dev.qmledmq.cn:8443/social'
export const SOCIAL_SESSION_STORAGE_KEY = 'zmxy.social.session'

export type LevelId = 'L1' | 'L2'
export type RoomStatus = 'waiting' | 'in_game'

export interface SocialUser {
  id: string
  username: string
  createdAt?: string
}

export interface SocialSession {
  token: string
  user: SocialUser
}

export interface RoomMember {
  userId: string
  username: string
  ready: boolean
}

export interface RoomSnapshot {
  id: string
  levelId: LevelId
  ownerId: string
  status: RoomStatus
  members: RoomMember[]
}

export interface CoopSession {
  roomId: string
  levelId: LevelId
  myUserId: string
  hostUserId: string
  isHost: boolean
  peers: Array<{ userId: string; username: string }>
}

export type ClientMessage =
  | { type: 'join'; token: string; roomId: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'leave' }
  | { type: 'start' }

export type ServerMessage =
  | { type: 'room_state'; room: RoomSnapshot }
  | { type: 'member_joined'; member: { userId: string; username: string } }
  | { type: 'member_left'; userId: string; newOwnerId?: string }
  | { type: 'ready_changed'; userId: string; ready: boolean }
  | { type: 'game_start'; levelId: LevelId }
  | { type: 'error'; message: string }

const SERVER_TYPES = new Set(['room_state', 'member_joined', 'member_left', 'ready_changed', 'game_start', 'error'])

export function resolveSocialServerBaseUrl(search: string, env?: string): string {
  try {
    const param = new URLSearchParams(search).get('socialServer')
    if (param) return param
  } catch {
    // ignore malformed search strings and fall through
  }
  if (env && env.length > 0) return env
  return DEFAULT_SOCIAL_SERVER_BASE_URL
}

export function socialRestUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}

export function socialWsUrl(base: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  if (cleanBase.startsWith('https://')) return `wss://${cleanBase.slice('https://'.length)}/ws`
  if (cleanBase.startsWith('http://')) return `ws://${cleanBase.slice('http://'.length)}/ws`
  return `${cleanBase}/ws`
}

export function encodeClient(msg: ClientMessage): string {
  return JSON.stringify(msg)
}

export function decodeServer(raw: string): ServerMessage | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(obj) || typeof obj.type !== 'string' || !SERVER_TYPES.has(obj.type)) return null

  switch (obj.type) {
    case 'room_state': {
      const room = decodeRoomSnapshot(obj.room)
      return room ? { type: 'room_state', room } : null
    }
    case 'member_joined':
      return isRecord(obj.member) && typeof obj.member.userId === 'string' && typeof obj.member.username === 'string'
        ? { type: 'member_joined', member: { userId: obj.member.userId, username: obj.member.username } }
        : null
    case 'member_left':
      if (typeof obj.userId !== 'string') return null
      return typeof obj.newOwnerId === 'string'
        ? { type: 'member_left', userId: obj.userId, newOwnerId: obj.newOwnerId }
        : { type: 'member_left', userId: obj.userId }
    case 'ready_changed':
      return typeof obj.userId === 'string' && typeof obj.ready === 'boolean'
        ? { type: 'ready_changed', userId: obj.userId, ready: obj.ready }
        : null
    case 'game_start':
      return isLevelId(obj.levelId) ? { type: 'game_start', levelId: obj.levelId } : null
    case 'error':
      return typeof obj.message === 'string' ? { type: 'error', message: obj.message } : null
    default:
      return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLevelId(value: unknown): value is LevelId {
  return value === 'L1' || value === 'L2'
}

function isRoomStatus(value: unknown): value is RoomStatus {
  return value === 'waiting' || value === 'in_game'
}

function decodeRoomMember(value: unknown): RoomMember | null {
  if (!isRecord(value)) return null
  return typeof value.userId === 'string' && typeof value.username === 'string' && typeof value.ready === 'boolean'
    ? { userId: value.userId, username: value.username, ready: value.ready }
    : null
}

function decodeRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    !isLevelId(value.levelId) ||
    typeof value.ownerId !== 'string' ||
    !isRoomStatus(value.status) ||
    !Array.isArray(value.members)
  ) {
    return null
  }
  const members = value.members.map(decodeRoomMember)
  if (members.some((member) => member === null)) return null
  return {
    id: value.id,
    levelId: value.levelId,
    ownerId: value.ownerId,
    status: value.status,
    members: members as RoomMember[],
  }
}

function decodeUser(value: unknown): SocialUser | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.username !== 'string') return null
  const user: SocialUser = { id: value.id, username: value.username }
  if (typeof value.createdAt === 'string') user.createdAt = value.createdAt
  return user
}

function decodeSession(value: unknown): SocialSession | null {
  if (!isRecord(value) || typeof value.token !== 'string') return null
  const user = decodeUser(value.user)
  return user ? { token: value.token, user } : null
}

function decodeRoomResponse(value: unknown): RoomSnapshot | null {
  return isRecord(value) ? decodeRoomSnapshot(value.room) : null
}

function decodeLeaveRoomResponse(value: unknown): RoomSnapshot | null | undefined {
  if (!isRecord(value)) return undefined
  if (value.room === null) return null
  return decodeRoomSnapshot(value.room) ?? undefined
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class SocialRestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'SocialRestError'
    this.status = status
    this.code = code
  }
}

export interface SocialClientOptions {
  baseUrl?: string
  fetch?: FetchLike
  storage?: Storage | null
}

export class SocialClient {
  readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly storage: Storage | null
  private session: SocialSession | null

  constructor(opts: SocialClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_SOCIAL_SERVER_BASE_URL
    this.fetchImpl = opts.fetch ?? defaultFetch
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage
    this.session = readStoredSession(this.storage)
  }

  getSession(): SocialSession | null {
    return this.session ? { token: this.session.token, user: { ...this.session.user } } : null
  }

  requireSession(): SocialSession {
    const session = this.getSession()
    if (!session) throw new SocialRestError(401, 'not_logged_in')
    return session
  }

  async register(username: string, password: string): Promise<SocialSession> {
    return this.auth('/auth/register', username, password)
  }

  async login(username: string, password: string): Promise<SocialSession> {
    return this.auth('/auth/login', username, password)
  }

  logout(): void {
    this.session = null
    try {
      this.storage?.removeItem(SOCIAL_SESSION_STORAGE_KEY)
    } catch {
      // Ignore storage write failures; in-memory session is already cleared.
    }
  }

  async createRoom(levelId: LevelId): Promise<RoomSnapshot> {
    return this.requestRoom('/rooms', {
      method: 'POST',
      body: JSON.stringify({ levelId }),
    })
  }

  async joinRoom(roomId: string): Promise<RoomSnapshot> {
    return this.requestRoom(`/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST' })
  }

  async leaveRoom(roomId: string): Promise<RoomSnapshot | null> {
    const body = await this.requestJson(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST' }, true)
    const room = decodeLeaveRoomResponse(body)
    if (room === undefined) throw new SocialRestError(200, 'invalid_response')
    return room
  }

  async getRoom(roomId: string): Promise<RoomSnapshot> {
    return this.requestRoom(`/rooms/${encodeURIComponent(roomId)}`, { method: 'GET' })
  }

  openRoomConnection(roomId: string, createSocket?: (url: string) => SocketLike): SocialRoomConnection {
    const session = this.requireSession()
    return new SocialRoomConnection({
      wsUrl: socialWsUrl(this.baseUrl),
      token: session.token,
      roomId,
      createSocket,
    })
  }

  private async auth(path: '/auth/register' | '/auth/login', username: string, password: string): Promise<SocialSession> {
    const body = await this.requestJson(
      path,
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      false,
    )
    const session = decodeSession(body)
    if (!session) throw new SocialRestError(200, 'invalid_response')
    this.setSession(session)
    return this.requireSession()
  }

  private async requestRoom(path: string, init: RequestInit): Promise<RoomSnapshot> {
    const body = await this.requestJson(path, init, true)
    const room = decodeRoomResponse(body)
    if (!room) throw new SocialRestError(200, 'invalid_response')
    return room
  }

  private async requestJson(path: string, init: RequestInit, authed: boolean): Promise<unknown> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (authed) headers.authorization = `Bearer ${this.requireSession().token}`

    const response = await this.fetchImpl(socialRestUrl(this.baseUrl, path), {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    })
    const body = await readJson(response)
    if (!response.ok) throw new SocialRestError(response.status, readErrorCode(body))
    return body
  }

  private setSession(session: SocialSession): void {
    this.session = { token: session.token, user: { ...session.user } }
    try {
      this.storage?.setItem(SOCIAL_SESSION_STORAGE_KEY, JSON.stringify(this.session))
    } catch {
      // Browsers can reject localStorage writes; keeping the in-memory session is enough for this run.
    }
  }
}

async function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  const fetchImpl = globalThis.fetch
  if (!fetchImpl) throw new SocialRestError(0, 'fetch_unavailable')
  return fetchImpl(input, init)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readErrorCode(body: unknown): string {
  return isRecord(body) && typeof body.error === 'string' ? body.error : 'request_failed'
}

function defaultStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

function readStoredSession(storage: Storage | null): SocialSession | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(SOCIAL_SESSION_STORAGE_KEY)
    if (!raw) return null
    return decodeSession(JSON.parse(raw))
  } catch {
    return null
  }
}

let sharedClient: SocialClient | null = null

export function getSharedSocialClient(baseUrl: string): SocialClient {
  if (!sharedClient || sharedClient.baseUrl !== baseUrl) sharedClient = new SocialClient({ baseUrl })
  return sharedClient
}

export type SocialConnStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((err?: unknown) => void) | null
}

export interface SocialRoomConnectionOptions {
  wsUrl: string
  token: string
  roomId: string
  createSocket?: (url: string) => SocketLike
}

export class SocialRoomConnection {
  private readonly wsUrl: string
  private readonly token: string
  private readonly roomId: string
  private readonly createSocket: (url: string) => SocketLike
  private socket: SocketLike | null = null
  private disposed = false
  private _status: SocialConnStatus = 'closed'

  onStatus: (status: SocialConnStatus) => void = () => {}
  onMessage: (msg: ServerMessage) => void = () => {}

  constructor(opts: SocialRoomConnectionOptions) {
    this.wsUrl = opts.wsUrl
    this.token = opts.token
    this.roomId = opts.roomId
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike)
  }

  get status(): SocialConnStatus {
    return this._status
  }

  isOpen(): boolean {
    return this._status === 'open'
  }

  connect(): void {
    if (this.disposed) return
    this.setStatus('connecting')
    const socket = this.createSocket(this.wsUrl)
    this.socket = socket
    socket.onopen = () => {
      this.setStatus('open')
      this.send({ type: 'join', token: this.token, roomId: this.roomId })
    }
    socket.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? decodeServer(ev.data) : null
      if (msg) this.onMessage(msg)
    }
    socket.onerror = () => {
      if (!this.disposed) this.setStatus('error')
    }
    socket.onclose = () => {
      this.socket = null
      if (!this.disposed) this.setStatus('closed')
    }
  }

  send(msg: ClientMessage): boolean {
    if (!this.socket || this._status !== 'open') return false
    this.socket.send(encodeClient(msg))
    return true
  }

  leave(): void {
    this.send({ type: 'leave' })
    this.dispose()
  }

  dispose(): void {
    this.disposed = true
    this.socket?.close()
    this.socket = null
    this.setStatus('closed')
  }

  private setStatus(status: SocialConnStatus): void {
    if (this._status === status) return
    this._status = status
    this.onStatus(status)
  }
}
