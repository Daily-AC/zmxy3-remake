import { describe, expect, it } from 'vitest'
import { PresentationHitStopGate } from '../src/presentation/combatCoreHitStop'

describe('combat core presentation hit stop', () => {
  it('queues hurt and dead without applying them, then releases the highest-priority action', () => {
    const gate = new PresentationHitStopGate()
    expect(gate.begin(['hero-1', 'monster-1'])).toEqual(['hero-1', 'monster-1'])
    expect(gate.requestAction('monster-1', 'hurt')).toEqual({ applyNow: false })
    expect(gate.requestAction('monster-1', 'dead')).toEqual({ applyNow: false })

    expect(gate.end(['hero-1', 'monster-1'])).toEqual({
      released: [
        { actorId: 'hero-1', pendingAction: null },
        { actorId: 'monster-1', pendingAction: 'dead' },
      ],
      hasActiveStops: false,
    })
  })

  it('keeps overlapping hit stops frozen until the final release', () => {
    const gate = new PresentationHitStopGate()
    expect(gate.begin(['hero-1', 'monster-1'])).toEqual(['hero-1', 'monster-1'])
    expect(gate.begin(['hero-1', 'monster-1'])).toEqual([])
    expect(gate.requestAction('monster-1', 'hurt')).toEqual({ applyNow: false })

    expect(gate.end(['hero-1', 'monster-1'])).toEqual({
      released: [],
      hasActiveStops: true,
    })
    expect(gate.end(['hero-1', 'monster-1'])).toEqual({
      released: [
        { actorId: 'hero-1', pendingAction: null },
        { actorId: 'monster-1', pendingAction: 'hurt' },
      ],
      hasActiveStops: false,
    })
  })
})
