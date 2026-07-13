import { describe, expect, it } from 'vitest'
import { defineContentId } from '@zaixu/content'
import { cloneSerializable, createCombatSnapshot } from '../src/session/snapshot'
import type { CombatActorSnapshot } from '../src/session/types'

function actor(): CombatActorSnapshot {
  return {
    id: 'hero-1',
    kind: 'hero',
    contentId: defineContentId('character.zaixu.wukong'),
    x: 480,
    y: 400,
    facing: 1,
    action: 'stand',
    hp: 120,
    maxHp: 120,
    lifeState: 'ready',
    comboStage: null,
    statuses: ['ready'],
    knockbackVelocityX: 0,
    attackId: 0,
    attacking: false,
  }
}

describe('cloneSerializable', () => {
  it('deep-clones plain serializable data', () => {
    const source = { nested: { values: [1, 'two', true, null] } }
    const clone = cloneSerializable(source)

    source.nested.values[0] = 99

    expect(clone).toEqual({ nested: { values: [1, 'two', true, null] } })
    expect(clone).not.toBe(source)
    expect(clone.nested).not.toBe(source.nested)
    expect(clone.nested.values).not.toBe(source.nested.values)
  })

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
    ['function', () => 1],
    ['symbol', Symbol('value')],
    ['bigint', 1n],
  ])('rejects %s', (_name, value) => {
    expect(() => cloneSerializable(value)).toThrow(TypeError)
  })

  it('rejects cycles', () => {
    const value: Record<string, unknown> = {}
    value.self = value
    expect(() => cloneSerializable(value)).toThrow(TypeError)
  })

  it('rejects accessors without executing getters', () => {
    let getterCalls = 0
    const value = Object.defineProperty({}, 'answer', {
      enumerable: true,
      get: () => {
        getterCalls += 1
        return 42
      },
    })

    expect(() => cloneSerializable(value)).toThrow(TypeError)
    expect(getterCalls).toBe(0)
  })

  it('rejects symbol and non-enumerable properties', () => {
    const symbolProperty = Object.defineProperty({}, Symbol('hidden'), { enumerable: true, value: 1 })
    const nonEnumerable = Object.defineProperty({}, 'hidden', { enumerable: false, value: 1 })
    expect(() => cloneSerializable(symbolProperty)).toThrow(TypeError)
    expect(() => cloneSerializable(nonEnumerable)).toThrow(TypeError)
  })

  it('rejects non-plain objects and Array subclasses', () => {
    class Values extends Array<number> {}
    expect(() => cloneSerializable(new Date())).toThrow(TypeError)
    expect(() => cloneSerializable(new Values(1, 2))).toThrow(TypeError)
  })
})

describe('createCombatSnapshot', () => {
  it('owns a deep clone of actor state', () => {
    const source = actor()
    const snapshot = createCombatSnapshot('combat-core-slice@1', 3, 7, [source])

    ;(source.statuses as string[])[0] = 'changed'
    source.x = -1

    expect(snapshot.actors[0].statuses).toEqual(['ready'])
    expect(snapshot.actors[0].x).toBe(480)
    expect(snapshot.actors[0]).not.toBe(source)
  })
})
