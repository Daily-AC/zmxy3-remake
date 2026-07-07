// WebSocket protocol layer for the agent-server NPC brain. The message types and
// codec are pure and unit-tested; the connection lifecycle (reconnect, graceful
// degradation when the server is down) is driven through an injectable socket
// factory so it too is testable without a real network.
//
// Protocol source of truth: agent-server/src/types.ts + agent-server/README.md.

export const DEFAULT_NPC_SERVER_URL = 'ws://localhost:5181'
// Deployed target (must include :8443 — port 443 is blocked upstream):
export const REMOTE_NPC_SERVER_URL = 'wss://zm-dev.qmledmq.cn:8443'

/**
 * Resolve which NPC server to connect to, in priority order:
 *   1. a `?npcServer=<url>` query param (handy for one-off testing),
 *   2. a build-time env override (e.g. VITE_NPC_SERVER_URL),
 *   3. the local dev default.
 * Pure so it can be unit-tested; the scene passes `location.search` + the env.
 */
export function resolveNpcServerUrl(search: string, env?: string): string {
  try {
    const param = new URLSearchParams(search).get('npcServer')
    if (param) return param
  } catch {
    // ignore malformed search strings and fall through
  }
  if (env && env.length > 0) return env
  return DEFAULT_NPC_SERVER_URL
}

// ---------- shared item / goal / craft schema (mirrors agent-server) ----------

export interface NpcItem {
  id: string
  name: string
  kind: 'equipment' | 'material' | 'consumable' | 'quest'
  desc?: string
  qty?: number
}

export interface NpcGoal {
  id: string
  title: string
  desc?: string
}

export interface StatEffect {
  type: 'stat'
  stat: 'atk' | 'def' | 'hp' | 'mp' | 'crit'
  value: number
}

export interface OnHitEffect {
  type: 'onHit'
  effect: 'burn' | 'lifesteal' | 'freeze'
  chance: number
  power: number
}

export type CraftEffect = StatEffect | OnHitEffect

export interface CraftedItem {
  id: string
  name: string
  kind: 'equip'
  rarity: 1 | 2 | 3
  desc: string
  effects: CraftEffect[]
}

// ---------- game -> server ----------

export interface HelloMessage {
  type: 'hello'
  player?: { id?: string; name?: string }
}
export interface WorldEventMessage {
  type: 'world_event'
  kind: string
  data?: Record<string, unknown>
  at?: number
}
export interface PlayerSayMessage {
  type: 'player_say'
  npcId: string
  playerId?: string
  text: string
}
export type ClientMessage = HelloMessage | WorldEventMessage | PlayerSayMessage

// ---------- server -> game ----------

export interface WelcomeMessage {
  type: 'welcome'
  npcIds: string[]
}
export interface NpcThinkingMessage {
  type: 'npc_thinking'
  npcId: string
}
export interface NpcSayMessage {
  type: 'npc_say'
  npcId: string
  text: string
}
export interface GiveItemMessage {
  type: 'give_item'
  npcId: string
  item: NpcItem
}
export interface SetGoalMessage {
  type: 'set_goal'
  npcId: string
  goal: NpcGoal
}
export interface CraftItemMessage {
  type: 'craft_item'
  npcId: string
  item: CraftedItem
}
export interface ErrorMessage {
  type: 'error'
  message: string
}
export type ServerMessage =
  | WelcomeMessage
  | NpcThinkingMessage
  | NpcSayMessage
  | GiveItemMessage
  | SetGoalMessage
  | CraftItemMessage
  | ErrorMessage

const SERVER_TYPES = new Set([
  'welcome',
  'npc_thinking',
  'npc_say',
  'give_item',
  'set_goal',
  'craft_item',
  'error',
])

export function encodeClient(msg: ClientMessage): string {
  return JSON.stringify(msg)
}

/**
 * Parse and shape-check a server frame. Returns null for anything malformed —
 * bad JSON, missing/unknown `type`, or missing required fields — so a hostile
 * or buggy peer can never crash the game loop.
 */
export function decodeServer(raw: string): ServerMessage | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const m = obj as Record<string, unknown>
  if (typeof m.type !== 'string' || !SERVER_TYPES.has(m.type)) return null
  switch (m.type) {
    case 'welcome':
      return Array.isArray(m.npcIds) ? (m as unknown as WelcomeMessage) : null
    case 'npc_thinking':
      return typeof m.npcId === 'string' ? (m as unknown as NpcThinkingMessage) : null
    case 'npc_say':
      return typeof m.npcId === 'string' && typeof m.text === 'string'
        ? (m as unknown as NpcSayMessage)
        : null
    case 'give_item':
      return typeof m.npcId === 'string' && typeof m.item === 'object' && m.item !== null
        ? (m as unknown as GiveItemMessage)
        : null
    case 'set_goal':
      return typeof m.npcId === 'string' && typeof m.goal === 'object' && m.goal !== null
        ? (m as unknown as SetGoalMessage)
        : null
    case 'craft_item':
      return typeof m.npcId === 'string' && typeof m.item === 'object' && m.item !== null
        ? (m as unknown as CraftItemMessage)
        : null
    case 'error':
      return typeof m.message === 'string' ? (m as unknown as ErrorMessage) : null
    default:
      return null
  }
}

// ---------- connection ----------

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** Minimal surface the client needs; satisfied by the browser WebSocket. */
export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((err?: unknown) => void) | null
}

export interface NpcClientOptions {
  url?: string
  player?: { id?: string; name?: string }
  reconnectDelayMs?: number
  /** Injectable socket factory (defaults to the global WebSocket). */
  createSocket?: (url: string) => SocketLike
  /** Injectable timer (defaults to window.setTimeout / clearTimeout). */
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

/**
 * Reconnecting NPC connection. Sends `hello` on every (re)connect, auto-decodes
 * inbound frames, and keeps retrying while the server is down. When not `open`,
 * the game treats the NPC as "in seclusion" and stays fully playable.
 */
export class NpcClient {
  private readonly url: string
  private readonly player?: { id?: string; name?: string }
  private readonly reconnectDelayMs: number
  private readonly createSocket: (url: string) => SocketLike
  private readonly schedule: (fn: () => void, ms: number) => unknown
  private readonly cancel: (handle: unknown) => void

  private socket: SocketLike | null = null
  private reconnectHandle: unknown = null
  private disposed = false
  private _status: ConnStatus = 'closed'

  onStatus: (status: ConnStatus) => void = () => {}
  onMessage: (msg: ServerMessage) => void = () => {}

  constructor(opts: NpcClientOptions = {}) {
    this.url = opts.url ?? DEFAULT_NPC_SERVER_URL
    this.player = opts.player
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 2000
    this.createSocket =
      opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike)
    this.schedule =
      opts.schedule ?? ((fn, ms) => (globalThis.setTimeout as typeof setTimeout)(fn, ms))
    this.cancel = opts.cancel ?? ((h) => (globalThis.clearTimeout as typeof clearTimeout)(h as never))
  }

  get status(): ConnStatus {
    return this._status
  }

  isOpen(): boolean {
    return this._status === 'open'
  }

  connect(): void {
    if (this.disposed) return
    this.setStatus('connecting')
    const sock = this.createSocket(this.url)
    this.socket = sock
    sock.onopen = () => {
      this.setStatus('open')
      this.send({ type: 'hello', player: this.player })
    }
    sock.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? decodeServer(ev.data) : null
      if (msg) this.onMessage(msg)
    }
    sock.onclose = () => this.handleDrop()
    sock.onerror = () => {
      // Errors are followed by close; avoid double-scheduling here.
    }
  }

  private handleDrop(): void {
    this.socket = null
    if (this.disposed) return
    this.setStatus('reconnecting')
    this.reconnectHandle = this.schedule(() => this.connect(), this.reconnectDelayMs)
  }

  /** Send a client message; a no-op (returns false) while not open. */
  send(msg: ClientMessage): boolean {
    if (!this.socket || this._status !== 'open') return false
    this.socket.send(encodeClient(msg))
    return true
  }

  worldEvent(kind: string, data?: Record<string, unknown>): boolean {
    return this.send({ type: 'world_event', kind, data, at: Date.now() })
  }

  playerSay(npcId: string, text: string, playerId?: string): boolean {
    return this.send({ type: 'player_say', npcId, text, playerId })
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectHandle != null) this.cancel(this.reconnectHandle)
    this.socket?.close()
    this.socket = null
    this.setStatus('closed')
  }

  private setStatus(s: ConnStatus): void {
    if (this._status === s) return
    this._status = s
    this.onStatus(s)
  }
}
