import { stableHash } from '../replay/stableHash'

export type CheckpointValue =
  | null
  | boolean
  | number
  | string
  | { kind: 'undefined' }
  | { kind: 'number'; value: 'nan' | 'positive-infinity' | 'negative-infinity' }
  | { kind: 'array'; items: CheckpointValue[] }
  | { kind: 'object'; entries: [string, CheckpointValue][] }

export interface BattleCheckpoint {
  version: 1
  payload: CheckpointValue
  hash: string
}

function encode(input: unknown, ancestors: WeakSet<object>): CheckpointValue {
  if (input === undefined) return { kind: 'undefined' }
  if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
  if (typeof input === 'number') {
    if (Number.isFinite(input)) return input
    if (Number.isNaN(input)) return { kind: 'number', value: 'nan' }
    return { kind: 'number', value: input > 0 ? 'positive-infinity' : 'negative-infinity' }
  }
  if (typeof input !== 'object') throw new TypeError('checkpoint contains non-data value')
  if (ancestors.has(input)) throw new TypeError('checkpoint contains a cycle')
  ancestors.add(input)
  try {
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) throw new TypeError('checkpoint contains a non-plain array')
      return { kind: 'array', items: input.map((item) => encode(item, ancestors)) }
    }
    const prototype = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('checkpoint contains a non-plain object')
    }
    const entries: [string, CheckpointValue][] = []
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)
      if (!descriptor || 'get' in descriptor || 'set' in descriptor || !descriptor.enumerable) {
        throw new TypeError('checkpoint contains an invalid property')
      }
      entries.push([key, encode(descriptor.value, ancestors)])
    }
    return { kind: 'object', entries }
  } finally {
    ancestors.delete(input)
  }
}

function decode(input: CheckpointValue): unknown {
  if (input === null || typeof input === 'boolean' || typeof input === 'number' || typeof input === 'string') {
    return input
  }
  if (input.kind === 'undefined') return undefined
  if (input.kind === 'number') {
    if (input.value === 'nan') return Number.NaN
    return input.value === 'positive-infinity' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  }
  if (input.kind === 'array') return input.items.map(decode)
  return Object.fromEntries(input.entries.map(([key, value]) => [key, decode(value)]))
}

export function createBattleCheckpoint(state: unknown): BattleCheckpoint {
  const payload = encode(state, new WeakSet())
  return { version: 1, payload, hash: stableHash(payload) }
}

export function decodeBattleCheckpoint<T>(checkpoint: BattleCheckpoint): T {
  if (checkpoint === null || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new TypeError('battle checkpoint must be an object')
  }
  if (checkpoint.version !== 1) throw new TypeError('battle checkpoint version must be 1')
  const actualHash = stableHash(checkpoint.payload)
  if (checkpoint.hash !== actualHash) throw new Error('battle checkpoint hash mismatch')
  return decode(checkpoint.payload) as T
}
