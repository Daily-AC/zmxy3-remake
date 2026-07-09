import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SOCIAL_SERVER_BASE_URL,
  SOCIAL_SESSION_STORAGE_KEY,
  SocialClient,
  SocialRoomConnection,
  decodeServer,
  encodeClient,
  resolveSocialServerBaseUrl,
  socialRestUrl,
  socialWsUrl,
  type ServerMessage,
  type SocialConnStatus,
  type SocketLike,
} from '../src/net/socialClient'

class FakeSocket implements SocketLike {
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((err?: unknown) => void) | null = null
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.()
  }

  message(raw: string): void {
    this.onmessage?.({ data: raw })
  }

  drop(): void {
    this.onclose?.()
  }

  error(): void {
    this.onerror?.(new Error('socket failed'))
  }
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

const room = {
  id: 'room-1',
  levelId: 'L1',
  ownerId: 'u1',
  status: 'waiting',
  members: [
    { userId: 'u1', username: '悟空', ready: true },
    { userId: 'u2', username: '八戒', ready: false },
  ],
} as const

describe('social URL helpers', () => {
  it('resolves query override before env before deployed default', () => {
    expect(resolveSocialServerBaseUrl('', undefined)).toBe(DEFAULT_SOCIAL_SERVER_BASE_URL)
    expect(resolveSocialServerBaseUrl('', 'http://env.example/social')).toBe('http://env.example/social')
    expect(resolveSocialServerBaseUrl('?socialServer=http://localhost:7100', 'http://env.example/social')).toBe(
      'http://localhost:7100',
    )
  })

  it('derives REST and WS URLs for local development without adding /social', () => {
    expect(socialRestUrl('http://localhost:7100', '/auth/register')).toBe('http://localhost:7100/auth/register')
    expect(socialWsUrl('http://localhost:7100')).toBe('ws://localhost:7100/ws')
  })

  it('preserves a deployed /social prefix for REST and WS', () => {
    const base = 'https://zm-dev.qmledmq.cn:8443/social'
    expect(socialRestUrl(base, '/rooms/abc/join')).toBe('https://zm-dev.qmledmq.cn:8443/social/rooms/abc/join')
    expect(socialWsUrl(base)).toBe('wss://zm-dev.qmledmq.cn:8443/social/ws')
  })
})

describe('social protocol codec', () => {
  it('encodes all lobby client message variants', () => {
    expect(JSON.parse(encodeClient({ type: 'join', token: 'jwt', roomId: 'room-1' }))).toEqual({
      type: 'join',
      token: 'jwt',
      roomId: 'room-1',
    })
    expect(JSON.parse(encodeClient({ type: 'ready', ready: true }))).toEqual({ type: 'ready', ready: true })
    expect(JSON.parse(encodeClient({ type: 'leave' }))).toEqual({ type: 'leave' })
    expect(JSON.parse(encodeClient({ type: 'start' }))).toEqual({ type: 'start' })
  })

  it('encodes combat-sync client message variants', () => {
    expect(JSON.parse(encodeClient({ type: 'state', seq: 4, sentAt: 123, payload: { coopType: 'hero_state' } }))).toEqual({
      type: 'state',
      seq: 4,
      sentAt: 123,
      payload: { coopType: 'hero_state' },
    })
    expect(JSON.parse(encodeClient({ type: 'event', name: 'level_event', payload: { kind: 'boss_defeated' } }))).toEqual({
      type: 'event',
      name: 'level_event',
      payload: { kind: 'boss_defeated' },
    })
  })

  it('decodes every lobby server message variant', () => {
    expect(decodeServer(JSON.stringify({ type: 'room_state', room }))).toEqual({ type: 'room_state', room })
    expect(decodeServer(JSON.stringify({ type: 'member_joined', member: { userId: 'u3', username: '沙僧' } }))).toEqual({
      type: 'member_joined',
      member: { userId: 'u3', username: '沙僧' },
    })
    expect(decodeServer(JSON.stringify({ type: 'member_left', userId: 'u2', newOwnerId: 'u1' }))).toEqual({
      type: 'member_left',
      userId: 'u2',
      newOwnerId: 'u1',
    })
    expect(decodeServer(JSON.stringify({ type: 'ready_changed', userId: 'u2', ready: true }))).toEqual({
      type: 'ready_changed',
      userId: 'u2',
      ready: true,
    })
    expect(decodeServer(JSON.stringify({ type: 'game_start', levelId: 'L2' }))).toEqual({
      type: 'game_start',
      levelId: 'L2',
    })
    expect(decodeServer(JSON.stringify({ type: 'error', message: 'room is not ready' }))).toEqual({
      type: 'error',
      message: 'room is not ready',
    })
  })

  it('decodes combat-sync server frames without validating their payloads', () => {
    expect(decodeServer(JSON.stringify({ type: 'state', fromUserId: 'u2', seq: 9, sentAt: 123, payload: { x: 1 } }))).toEqual({
      type: 'state',
      fromUserId: 'u2',
      seq: 9,
      sentAt: 123,
      payload: { x: 1 },
    })
    expect(decodeServer(JSON.stringify({ type: 'event', fromUserId: 'u2', name: 'hit_intent', payload: { attackId: 7 } }))).toEqual({
      type: 'event',
      fromUserId: 'u2',
      name: 'hit_intent',
      payload: { attackId: 7 },
    })
  })

  it('rejects malformed and unknown frames', () => {
    expect(decodeServer('not json')).toBeNull()
    expect(decodeServer('42')).toBeNull()
    expect(decodeServer('{"type":"bogus"}')).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'state', seq: 1, payload: {}, sentAt: 1 }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'event', fromUserId: 'u2', payload: {} }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'room_state', room: { ...room, status: 'started' } }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'room_state', room: { ...room, members: [{ userId: 'u1' }] } }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'member_joined', member: { userId: 'u3' } }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'member_left', userId: 7 }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'ready_changed', userId: 'u1', ready: 'yes' }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'game_start', levelId: 'L3' }))).toBeNull()
    expect(decodeServer(JSON.stringify({ type: 'error', message: 9 }))).toBeNull()
  })
})

describe('SocialRoomConnection', () => {
  function harness() {
    const sockets: FakeSocket[] = []
    const client = new SocialRoomConnection({
      wsUrl: 'ws://test/ws',
      token: 'jwt',
      roomId: 'room-1',
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    })
    const statuses: SocialConnStatus[] = []
    const messages: ServerMessage[] = []
    client.onStatus = (status) => statuses.push(status)
    client.onMessage = (message) => messages.push(message)
    return { client, sockets, statuses, messages }
  }

  it('sends join as the first frame on open and routes decoded messages', () => {
    const h = harness()
    h.client.connect()
    expect(h.statuses).toEqual(['connecting'])
    expect(h.client.send({ type: 'ready', ready: true })).toBe(false)

    h.sockets[0].open()
    expect(h.statuses).toEqual(['connecting', 'open'])
    expect(JSON.parse(h.sockets[0].sent[0])).toEqual({ type: 'join', token: 'jwt', roomId: 'room-1' })
    expect(h.client.send({ type: 'ready', ready: true })).toBe(true)

    h.sockets[0].message(JSON.stringify({ type: 'room_state', room }))
    expect(h.messages).toEqual([{ type: 'room_state', room }])
  })

  it('drops malformed frames without emitting a message', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()
    h.sockets[0].message('<<garbage>>')
    expect(h.messages).toHaveLength(0)
  })

  it('does not reconnect and surfaces unexpected close/error status changes', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()
    h.sockets[0].drop()
    expect(h.statuses).toEqual(['connecting', 'open', 'closed'])
    expect(h.sockets).toHaveLength(1)

    const next = harness()
    next.client.connect()
    next.sockets[0].error()
    expect(next.statuses).toEqual(['connecting', 'error'])
  })
})

describe('SocialClient session and REST behavior', () => {
  it('stores successful auth sessions and reloads them synchronously', async () => {
    const storage = memoryStorage()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchLike = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init })
      return new Response(
        JSON.stringify({ token: 'jwt', user: { id: 'u1', username: '悟空', createdAt: '2026-07-09T00:00:00.000Z' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    }

    const client = new SocialClient({ baseUrl: 'http://localhost:7100', fetch: fetchLike, storage })
    await expect(client.register('悟空', 'secret')).resolves.toEqual({
      token: 'jwt',
      user: { id: 'u1', username: '悟空', createdAt: '2026-07-09T00:00:00.000Z' },
    })

    expect(calls[0].url).toBe('http://localhost:7100/auth/register')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ username: '悟空', password: 'secret' })
    expect(storage.getItem(SOCIAL_SESSION_STORAGE_KEY)).toContain('"token":"jwt"')

    const resumed = new SocialClient({ baseUrl: 'http://localhost:7100', fetch: fetchLike, storage })
    expect(resumed.getSession()?.user.username).toBe('悟空')
  })

  it('hands off an open game-start room socket to the next room connection claim', () => {
    const storage = memoryStorage()
    storage.setItem(SOCIAL_SESSION_STORAGE_KEY, JSON.stringify({ token: 'jwt', user: { id: 'u1', username: '悟空' } }))
    const sockets: FakeSocket[] = []
    const client = new SocialClient({ baseUrl: 'http://localhost:7100', storage })
    const createSocket = () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    }

    const lobbyConnection = client.openRoomConnection('room-1', createSocket)
    lobbyConnection.connect()
    sockets[0].open()
    sockets[0].message(JSON.stringify({ type: 'game_start', levelId: 'L1' }))
    lobbyConnection.dispose()

    expect(sockets[0].closed).toBe(false)

    const battleConnection = client.openRoomConnection('room-1', createSocket)
    expect(battleConnection).toBe(lobbyConnection)
    expect(battleConnection.isOpen()).toBe(true)

    battleConnection.dispose()
    expect(sockets[0].closed).toBe(true)
    expect(sockets).toHaveLength(1)
  })
})
