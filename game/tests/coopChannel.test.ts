import { describe, expect, it } from 'vitest'
import {
  CoopChannel,
  createSocialRoomTransport,
  type CoopRoomTransport,
  type CoopTransportMessageType,
} from '../src/net/coopChannel'
import type { ServerMessage, SocialRoomConnection } from '../src/net/socialClient'
import {
  encodeHeroState,
  encodeHeroHit,
  encodeHitIntent,
  encodeMonsterState,
  type CoopInboundMessage,
  type CoopOutboundMessage,
  type HeroStateSnapshot,
  type MonsterStateSnapshot,
} from '../src/systems/coopSync'

class MockTransport implements CoopRoomTransport {
  sent: CoopOutboundMessage[] = []
  listeners: Record<CoopTransportMessageType, Array<(message: unknown) => void>> = {
    state: [],
    event: [],
  }

  sendRoomMessage(message: CoopOutboundMessage): boolean {
    this.sent.push(message)
    return true
  }

  onRoomMessage(type: CoopTransportMessageType, handler: (message: unknown) => void): () => void {
    this.listeners[type].push(handler)
    return () => {
      this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== handler)
    }
  }

  emit(type: CoopTransportMessageType, message: unknown): void {
    for (const handler of this.listeners[type]) handler(message)
  }
}

const hero: HeroStateSnapshot = {
  userId: 'u-peer',
  heroId: 'wukong',
  x: 120,
  y: 360,
  facing: 1,
  action: 'run',
  animState: 'run-right',
  hp: 85,
  maxHp: 100,
  alive: true,
}

const monster: MonsterStateSnapshot = {
  monsterId: 'm-1',
  x: 500,
  y: 360,
  facing: -1,
  action: 'walk',
  hp: 50,
  maxHp: 50,
  alive: true,
}

describe('CoopChannel', () => {
  it('sends coopSync state and event messages through the room transport', () => {
    const transport = new MockTransport()
    const channel = new CoopChannel(transport)

    expect(channel.sendHeroState(hero, 1, 1_000)).toBe(true)
    expect(channel.sendMonsterState([monster], 2, 1_100)).toBe(true)
    expect(
      channel.sendHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damage: 35,
        skillId: 'hit3',
        clientTimeMs: 1_125,
      }),
    ).toBe(true)
    expect(
      channel.sendHeroHit({
        targetUserId: 'u-peer',
        sourceMonsterId: 'monster3-1',
        attackId: 'monster3-1:7',
        power: 14,
        attackKind: 'physics',
        knockbackX: -1,
      }),
    ).toBe(true)

    expect(transport.sent).toEqual([
      encodeHeroState(hero, 1, 1_000),
      encodeMonsterState([monster], 2, 1_100),
      encodeHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damage: 35,
        skillId: 'hit3',
        clientTimeMs: 1_125,
      }),
      encodeHeroHit({
        targetUserId: 'u-peer',
        sourceMonsterId: 'monster3-1',
        attackId: 'monster3-1:7',
        power: 14,
        attackKind: 'physics',
        knockbackX: -1,
      }),
    ])
  })

  it('subscribes to typed room messages and drops unrelated or malformed frames', () => {
    const transport = new MockTransport()
    const invalid: unknown[] = []
    const channel = new CoopChannel(transport, { onInvalidMessage: (message) => invalid.push(message) })
    const received: CoopInboundMessage[] = []

    const unsubscribe = channel.subscribe((message) => received.push(message))
    const heroMessage = { ...encodeHeroState(hero, 3, 1_200), fromUserId: 'u-peer' }
    const intentMessage = {
      ...encodeHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damage: 35,
        clientTimeMs: 1_225,
      }),
      fromUserId: 'u-peer',
    }

    transport.emit('state', JSON.stringify(heroMessage))
    transport.emit('event', intentMessage)
    transport.emit('event', { type: 'event', name: 'unrelated', payload: {} })
    transport.emit('state', { type: 'state', seq: 1, sentAt: 1, payload: { coopType: 'broken' } })

    expect(received).toEqual([heroMessage, intentMessage])
    expect(invalid).toHaveLength(2)

    unsubscribe()
    transport.emit('event', intentMessage)
    expect(received).toHaveLength(2)
  })

  it('adapts SocialRoomConnection into a typed multi-subscriber room transport', () => {
    const sent: unknown[] = []
    const connection = {
      onMessage: () => {},
      send: (message: unknown) => {
        sent.push(message)
        return true
      },
    } as Pick<SocialRoomConnection, 'onMessage' | 'send'>
    const transport = createSocialRoomTransport(connection)
    const stateFrames: unknown[] = []
    const eventFramesA: unknown[] = []
    const eventFramesB: unknown[] = []

    const unsubscribeState = transport.onRoomMessage('state', (message) => stateFrames.push(message))
    const unsubscribeEventA = transport.onRoomMessage('event', (message) => eventFramesA.push(message))
    transport.onRoomMessage('event', (message) => eventFramesB.push(message))

    const heroMessage = { ...encodeHeroState(hero, 3, 1_200), fromUserId: 'u-peer' }
    const intentMessage = {
      ...encodeHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damage: 35,
        clientTimeMs: 1_225,
      }),
      fromUserId: 'u-peer',
    }

    expect(transport.sendRoomMessage(encodeMonsterState([monster], 4, 1_300))).toBe(true)
    connection.onMessage(heroMessage as ServerMessage)
    connection.onMessage(intentMessage as ServerMessage)
    connection.onMessage({ type: 'ready_changed', userId: 'u-peer', ready: true } as ServerMessage)
    unsubscribeState()
    unsubscribeEventA()
    connection.onMessage(heroMessage as ServerMessage)
    connection.onMessage(intentMessage as ServerMessage)

    expect(sent).toEqual([encodeMonsterState([monster], 4, 1_300)])
    expect(stateFrames).toEqual([heroMessage])
    expect(eventFramesA).toEqual([intentMessage])
    expect(eventFramesB).toEqual([intentMessage, intentMessage])
  })
})
