import type { CombatActorSnapshot, CombatSnapshot } from './types'

export function cloneSerializable<T>(value: T): T {
  const ancestors = new WeakSet<object>()

  const cloneDataProperty = (owner: object, key: PropertyKey): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    if (!descriptor || 'get' in descriptor || 'set' in descriptor) {
      throw new TypeError('serializable data must not contain accessors')
    }
    if (!descriptor.enumerable) {
      throw new TypeError('serializable data must not contain non-enumerable properties')
    }
    return clone(descriptor.value)
  }

  const clone = (input: unknown): unknown => {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError('serializable numbers must be finite')
      return input
    }
    if (typeof input !== 'object') {
      throw new TypeError('value contains non-serializable data')
    }
    if (ancestors.has(input)) throw new TypeError('serializable data must not contain cycles')

    ancestors.add(input)
    try {
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype) {
          throw new TypeError('serializable data must contain only plain arrays')
        }
        const keys = Reflect.ownKeys(input)
        for (const key of keys) {
          if (typeof key === 'symbol') {
            throw new TypeError('serializable arrays must not contain symbol properties')
          }
          if (key === 'length') continue
          const index = Number(key)
          if (!Number.isInteger(index) || index < 0 || index >= input.length || String(index) !== key) {
            throw new TypeError('serializable arrays may contain only indexed properties')
          }
        }

        const result: unknown[] = []
        for (let index = 0; index < input.length; index += 1) {
          if (!Object.hasOwn(input, index)) {
            throw new TypeError('serializable arrays must not contain empty slots')
          }
          result.push(cloneDataProperty(input, String(index)))
        }
        return result
      }

      const prototype = Object.getPrototypeOf(input)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('serializable data must contain only plain objects')
      }
      const result = Object.create(prototype) as Record<string, unknown>
      for (const key of Reflect.ownKeys(input)) {
        if (typeof key === 'symbol') {
          throw new TypeError('serializable objects must not contain symbol properties')
        }
        Object.defineProperty(result, key, {
          configurable: true,
          enumerable: true,
          value: cloneDataProperty(input, key),
          writable: true,
        })
      }
      return result
    } finally {
      ancestors.delete(input)
    }
  }

  return clone(value) as T
}

export function createCombatSnapshot(
  contentVersion: string,
  tick: number,
  randomState: number,
  actors: readonly CombatActorSnapshot[],
): CombatSnapshot {
  return cloneSerializable({
    version: 1,
    contentVersion,
    tick,
    randomState,
    actors: actors.map((actor) => ({ ...actor })),
  })
}
