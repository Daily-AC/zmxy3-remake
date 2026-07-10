import {
  decodeCoopMessage,
  encodeHeroState,
  encodeHeroHit,
  encodeHitIntent,
  encodeHitSettlement,
  encodeMonsterState,
  type CoopInboundMessage,
  type CoopOutboundMessage,
  type HeroStateSnapshot,
  type HeroHitPayload,
  type HitIntentPayload,
  type HitSettlementPayload,
  type MonsterStateSnapshot,
} from '../systems/coopSync'
import type { ServerMessage, SocialRoomConnection } from './socialClient'

export type CoopTransportMessageType = 'state' | 'event'

export interface CoopRoomTransport {
  sendRoomMessage(message: CoopOutboundMessage): boolean
  onRoomMessage(type: CoopTransportMessageType, handler: (message: unknown) => void): () => void
}

export interface CoopChannelOptions {
  onInvalidMessage?: (message: unknown) => void
}

export function createSocialRoomTransport(
  connection: Pick<SocialRoomConnection, 'send' | 'onMessage'>,
): CoopRoomTransport {
  const subscribers: Record<CoopTransportMessageType, Set<(message: unknown) => void>> = {
    state: new Set(),
    event: new Set(),
  }

  connection.onMessage = (message: ServerMessage) => {
    if (message.type !== 'state' && message.type !== 'event') return
    for (const handler of subscribers[message.type]) handler(message)
  }

  return {
    sendRoomMessage(message) {
      return connection.send(message)
    },
    onRoomMessage(type, handler) {
      subscribers[type].add(handler)
      return () => {
        subscribers[type].delete(handler)
      }
    },
  }
}

export class CoopChannel {
  private readonly transport: CoopRoomTransport
  private readonly onInvalidMessage: (message: unknown) => void

  constructor(transport: CoopRoomTransport, options: CoopChannelOptions = {}) {
    this.transport = transport
    this.onInvalidMessage = options.onInvalidMessage ?? (() => {})
  }

  send(message: CoopOutboundMessage): boolean {
    return this.transport.sendRoomMessage(message)
  }

  sendHeroState(hero: HeroStateSnapshot, seq: number, sentAt: number): boolean {
    return this.send(encodeHeroState(hero, seq, sentAt))
  }

  sendMonsterState(monsters: MonsterStateSnapshot[], seq: number, sentAt: number, progressMaxX?: number): boolean {
    return this.send(encodeMonsterState(monsters, seq, sentAt, progressMaxX))
  }

  sendHitIntent(intent: HitIntentPayload): boolean {
    return this.send(encodeHitIntent(intent))
  }

  sendHitSettlement(settlement: HitSettlementPayload): boolean {
    return this.send(encodeHitSettlement(settlement))
  }

  sendHeroHit(hit: HeroHitPayload): boolean {
    return this.send(encodeHeroHit(hit))
  }

  subscribe(handler: (message: CoopInboundMessage) => void): () => void {
    const onMessage = (raw: unknown) => {
      const message = decodeCoopMessage(raw)
      if (message) {
        handler(message)
        return
      }
      this.onInvalidMessage(raw)
    }
    const unsubscribeState = this.transport.onRoomMessage('state', onMessage)
    const unsubscribeEvent = this.transport.onRoomMessage('event', onMessage)
    return () => {
      unsubscribeState()
      unsubscribeEvent()
    }
  }
}
