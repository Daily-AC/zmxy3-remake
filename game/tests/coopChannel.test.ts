import { describe, expect, it } from 'vitest'
import {
  CoopChannel,
  type CoopRoomTransport,
  type CoopTransportMessageType,
} from '../src/net/coopChannel'
import {
  encodeHeroState,
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
        skillId: 'hit3',
        clientTimeMs: 1_125,
      }),
    ).toBe(true)

    expect(transport.sent).toEqual([
      encodeHeroState(hero, 1, 1_000),
      encodeMonsterState([monster], 2, 1_100),
      encodeHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        skillId: 'hit3',
        clientTimeMs: 1_125,
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
})
