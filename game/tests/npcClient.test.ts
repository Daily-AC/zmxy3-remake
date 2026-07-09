import { describe, it, expect } from 'vitest'
import {
  encodeClient,
  decodeServer,
  NpcClient,
  SocketLike,
  ServerMessage,
  ConnStatus,
  resolveNpcServerUrl,
  DEFAULT_NPC_SERVER_URL,
  REMOTE_NPC_SERVER_URL,
} from '../src/net/npcClient'

// A controllable fake socket + manual scheduler to drive the connection state
// machine deterministically, with no real network or timers.
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
  // test helpers
  open(): void {
    this.onopen?.()
  }
  message(raw: string): void {
    this.onmessage?.({ data: raw })
  }
  drop(): void {
    this.onclose?.()
  }
}

function harness() {
  const sockets: FakeSocket[] = []
  const timers: (() => void)[] = []
  const client = new NpcClient({
    url: 'ws://test',
    player: { id: 'p1', name: '悟空' },
    reconnectDelayMs: 100,
    createSocket: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    schedule: (fn) => {
      timers.push(fn)
      return timers.length - 1
    },
    cancel: () => {},
  })
  const statuses: ConnStatus[] = []
  const messages: ServerMessage[] = []
  client.onStatus = (s) => statuses.push(s)
  client.onMessage = (m) => messages.push(m)
  return { client, sockets, timers, statuses, messages }
}

describe('npc protocol codec', () => {
  it('round-trips a client message', () => {
    const raw = encodeClient({ type: 'player_say', npcId: 'laojun', text: '你好' })
    expect(JSON.parse(raw)).toEqual({ type: 'player_say', npcId: 'laojun', text: '你好' })
  })

  it('round-trips player_say material and soul snapshots for recipe tools', () => {
    const raw = encodeClient({
      type: 'player_say',
      npcId: 'laojun',
      playerId: 'p1',
      text: '帮我炼尾火棍',
      materials: [{ id: 'wptm', name: '檀木', rarity: 1, qty: 20 }],
      soul: 200,
    })
    expect(JSON.parse(raw)).toEqual({
      type: 'player_say',
      npcId: 'laojun',
      playerId: 'p1',
      text: '帮我炼尾火棍',
      materials: [{ id: 'wptm', name: '檀木', rarity: 1, qty: 20 }],
      soul: 200,
    })
  })

  it('decodes valid server frames by type', () => {
    expect(decodeServer('{"type":"welcome","npcIds":["laojun"]}')).toEqual({
      type: 'welcome',
      npcIds: ['laojun'],
    })
    expect(decodeServer('{"type":"npc_say","npcId":"laojun","text":"猴头"}')).toMatchObject({
      type: 'npc_say',
      text: '猴头',
    })
    expect(decodeServer('{"type":"craft_recipe","npcId":"laojun","recipeId":"whgzzs","flavor":"炉火正旺。"}')).toEqual({
      type: 'craft_recipe',
      npcId: 'laojun',
      recipeId: 'whgzzs',
      flavor: '炉火正旺。',
    })
  })

  it('rejects malformed or unknown frames as null', () => {
    expect(decodeServer('not json')).toBeNull()
    expect(decodeServer('{"type":"bogus"}')).toBeNull()
    expect(decodeServer('{"type":"npc_say","npcId":"laojun"}')).toBeNull() // missing text
    expect(decodeServer('{"type":"craft_recipe","npcId":"laojun","recipeId":"whgzzs"}')).toBeNull()
    expect(decodeServer('42')).toBeNull()
  })
})

describe('resolveNpcServerUrl', () => {
  it('defaults to local dev when nothing is provided', () => {
    expect(resolveNpcServerUrl('')).toBe(DEFAULT_NPC_SERVER_URL)
  })
  it('uses the env override when present', () => {
    expect(resolveNpcServerUrl('', REMOTE_NPC_SERVER_URL)).toBe(REMOTE_NPC_SERVER_URL)
  })
  it('a ?npcServer= query param wins over the env', () => {
    expect(resolveNpcServerUrl('?npcServer=wss://zm-dev.qmledmq.cn:8443', 'ws://other')).toBe(
      'wss://zm-dev.qmledmq.cn:8443',
    )
  })
})

describe('NpcClient connection lifecycle', () => {
  it('sends hello on open and routes decoded messages', () => {
    const h = harness()
    h.client.connect()
    expect(h.statuses).toEqual(['connecting'])
    expect(h.client.isOpen()).toBe(false)

    h.sockets[0].open()
    expect(h.client.isOpen()).toBe(true)
    expect(JSON.parse(h.sockets[0].sent[0])).toEqual({
      type: 'hello',
      player: { id: 'p1', name: '悟空' },
    })

    h.sockets[0].message('{"type":"welcome","npcIds":["laojun"]}')
    expect(h.messages).toEqual([{ type: 'welcome', npcIds: ['laojun'] }])
  })

  it('drops garbage frames without emitting a message', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()
    h.sockets[0].message('<<garbage>>')
    expect(h.messages).toHaveLength(0)
  })

  it('refuses to send while not open (graceful degradation)', () => {
    const h = harness()
    h.client.connect() // connecting, not open
    expect(h.client.playerSay('laojun', 'hi')).toBe(false)
    h.sockets[0].open()
    expect(h.client.worldEvent('monster_killed', { monster: '妖鸟' })).toBe(true)
  })

  it('playerSay forwards optional recipe material and soul context', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()

    expect(
      h.client.playerSay('laojun', '帮我炼尾火棍', 'p1', {
        materials: [{ id: 'wptm', name: '檀木', rarity: 1, qty: 20 }],
        soul: 200,
      }),
    ).toBe(true)

    expect(JSON.parse(h.sockets[0].sent[1])).toEqual({
      type: 'player_say',
      npcId: 'laojun',
      text: '帮我炼尾火棍',
      playerId: 'p1',
      materials: [{ id: 'wptm', name: '檀木', rarity: 1, qty: 20 }],
      soul: 200,
    })
  })

  it('reconnects after a drop and re-sends hello', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()
    h.sockets[0].drop()
    expect(h.statuses).toEqual(['connecting', 'open', 'reconnecting'])
    expect(h.timers).toHaveLength(1)

    h.timers[0]() // fire the reconnect timer
    expect(h.sockets).toHaveLength(2) // a fresh socket was created
    h.sockets[1].open()
    expect(h.client.isOpen()).toBe(true)
    expect(JSON.parse(h.sockets[1].sent[0]).type).toBe('hello')
  })

  it('stops reconnecting once disposed', () => {
    const h = harness()
    h.client.connect()
    h.sockets[0].open()
    h.client.dispose()
    expect(h.client.status).toBe('closed')
    expect(h.sockets[0].closed).toBe(true)
    // A late drop after dispose must not schedule a reconnect.
    h.sockets[0].drop()
    expect(h.timers).toHaveLength(0)
  })
})
