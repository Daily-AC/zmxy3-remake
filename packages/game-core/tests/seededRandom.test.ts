import { describe, expect, it } from 'vitest'
import { SeededRandom } from '../src/random/seededRandom'

describe('SeededRandom', () => {
  it('matches the xorshift32 reference sequence', () => {
    const random = new SeededRandom(1)
    expect(random.nextUint32()).toBe(270369)
    expect(random.nextUint32()).toBe(67634689)
    expect(random.nextUint32()).toBe(2647435461)
  })

  it('continues exactly from a serialized state', () => {
    const first = new SeededRandom(0x12345678)
    first.next()
    const resumed = SeededRandom.fromState(first.getState())
    expect(resumed.nextUint32()).toBe(first.nextUint32())
  })

  it('maps a zero seed to a non-zero deterministic state', () => {
    expect(new SeededRandom(0).getState()).toBe(0x6d2b79f5)
  })
})
