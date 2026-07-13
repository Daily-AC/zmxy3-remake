import { PROTOCOL_VERSION } from '@zaixu/protocol'
import type { CombatCommand } from './commands'

export type DeterministicValue =
  | null
  | boolean
  | number
  | string
  | readonly DeterministicValue[]
  | { readonly [key: string]: DeterministicValue }

export interface CombatDeterministicState {
  version: 1
  contentVersion: string
  domain: {
    tick: number
    randomState: number
    definition: DeterministicValue
    heroSimulation: DeterministicValue
    heroCombat: DeterministicValue
    monsters: readonly {
      id: string
      attackId: number
      simulation: DeterministicValue
    }[]
  }
  protocol: {
    protocolVersion: typeof PROTOCOL_VERSION
    queuedCommands: readonly CombatCommand[]
    lastSeenSequences: readonly { actorId: string; sequence: number }[]
  }
}

export function toDeterministicValue(value: unknown): DeterministicValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    if (value === Number.POSITIVE_INFINITY) return 'positive-infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'negative-infinity'
    return 'nan'
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toDeterministicValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, toDeterministicValue(entry)]),
    )
  }
  throw new TypeError('deterministic state contains a non-serializable value')
}
