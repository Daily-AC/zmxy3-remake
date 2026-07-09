import {
  decodeCoopMessage,
  encodeHeroState,
  encodeHitIntent,
  encodeHitSettlement,
  encodeMonsterState,
  type CoopInboundMessage,
  type CoopOutboundMessage,
  type HeroStateSnapshot,
  type HitIntentPayload,
  type HitSettlementPayload,
  type MonsterStateSnapshot,
} from '../systems/coopSync'

export type CoopTransportMessageType = 'state' | 'event'

export interface CoopRoomTransport {
  sendRoomMessage(message: CoopOutboundMessage): boolean
  onRoomMessage(type: CoopTransportMessageType, handler: (message: unknown) => void): () => void
}

export interface CoopChannelOptions {
  onInvalidMessage?: (message: unknown) => void
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

  sendMonsterState(monsters: MonsterStateSnapshot[], seq: number, sentAt: number): boolean {
    return this.send(encodeMonsterState(monsters, seq, sentAt))
  }

  sendHitIntent(intent: HitIntentPayload): boolean {
    return this.send(encodeHitIntent(intent))
  }

  sendHitSettlement(settlement: HitSettlementPayload): boolean {
    return this.send(encodeHitSettlement(settlement))
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
