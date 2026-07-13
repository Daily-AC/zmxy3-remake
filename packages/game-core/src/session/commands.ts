import type { ActorId } from './types'

export type CombatCommandType =
  | 'press-left'
  | 'release-left'
  | 'press-right'
  | 'release-right'
  | 'press-jump'
  | 'press-attack'

export interface CombatCommand {
  actorId: ActorId
  sequence: number
  atTick: number
  type: CombatCommandType
}

export type CommandRejectionReason =
  | 'unknown-actor'
  | 'stale-sequence'
  | 'dead'
  | 'busy'
