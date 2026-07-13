import type { CommandRejectionReason, CombatCommand } from './commands'
import type { ActorId } from './types'

interface EventBase {
  tick: number
}

export type CombatEvent =
  | (EventBase & { type: 'command-rejected'; command: CombatCommand; reason: CommandRejectionReason })
  | (EventBase & {
      type: 'attack-started'
      sourceId: ActorId
      attackId: number
      action: string
      airborne: boolean
    })
  | (EventBase & { type: 'hit-confirmed'; sourceId: ActorId; targetId: ActorId; attackId: number })
  | (EventBase & {
      type: 'damage-applied'
      sourceId: ActorId
      targetId: ActorId
      attackId: number
      rawPower: number
      defense: number
      amount: number
      remainingHp: number
    })
  | (EventBase & { type: 'actor-staggered'; actorId: ActorId; untilTick: number })
  | (EventBase & { type: 'actor-defeated'; actorId: ActorId; sourceId: ActorId })
  | (EventBase & { type: 'actor-removed'; actorId: ActorId })
  | (EventBase & { type: 'actor-respawned'; actorId: ActorId; x: number; y: number })
