import { describe, expect, it } from 'vitest'
import { missingHostMonsterSnapshots } from '../src/systems/coopMonsterRuntime'
import type { MonsterStateSnapshot } from '../src/systems/coopSync'

const snapshot = (monsterId: string, species: string, isBoss = false): MonsterStateSnapshot => ({
  monsterId,
  species,
  isBoss,
  x: 500,
  y: 400,
  facing: -1,
  action: 'walk',
  hp: 50,
  maxHp: 50,
  alive: true,
})

describe('peer monster runtime reconciliation', () => {
  it('creates only entities missing from the peer and preserves host identity metadata', () => {
    const missing = missingHostMonsterSnapshots(
      new Set(['monster8-host-1']),
      [
        snapshot('monster8-host-1', 'monster8'),
        snapshot('monster4-host-2', 'monster4', true),
      ],
    )

    expect(missing).toEqual([snapshot('monster4-host-2', 'monster4', true)])
  })
})
