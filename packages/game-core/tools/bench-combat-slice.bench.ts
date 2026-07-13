import { performance } from 'node:perf_hooks'
import { expect, test } from 'vitest'
import { CombatSession } from '../src/session/combatSession'
import { makeSessionDefinition } from '../tests/fixtures/makeSessionDefinition'

const WARMUP_TICKS = 120
const MEASURED_TICKS = 600

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

test('advances 51 actors within the combat slice tick budget', () => {
  const base = makeSessionDefinition({ monsterAttackRate: 0 })
  const monster = base.monsters[0]
  const definition = {
    ...base,
    monsters: Array.from({ length: 50 }, (_, index) => {
      const x = 180 + index * 24
      return {
        ...monster,
        id: `monster-${index + 1}`,
        spawn: { ...monster.spawn, x },
        patrolMin: x - 20,
        patrolMax: x + 20,
        stats: { ...monster.stats },
        attack: { ...monster.attack, hitbox: { ...monster.attack.hitbox } },
        hurtbox: { ...monster.hurtbox },
      }
    }),
  }
  const session = new CombatSession(definition)
  session.step(WARMUP_TICKS)

  const samples: number[] = []
  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now()
    session.step()
    samples.push(performance.now() - startedAt)
  }

  const snapshot = session.getSnapshot()
  const sorted = [...samples].sort((left, right) => left - right)
  const p50Ms = percentile(sorted, 0.5)
  const p95Ms = percentile(sorted, 0.95)
  const maxMs = sorted.at(-1) ?? 0

  expect(snapshot.actors).toHaveLength(51)
  expect(snapshot.tick).toBe(WARMUP_TICKS + MEASURED_TICKS)
  expect(p95Ms).toBeLessThanOrEqual(5)
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  expect(JSON.parse(JSON.stringify(session.getDeterministicState())))
    .toEqual(session.getDeterministicState())

  console.log(JSON.stringify({
    actors: snapshot.actors.length,
    warmupTicks: WARMUP_TICKS,
    measuredTicks: MEASURED_TICKS,
    p50Ms,
    p95Ms,
    maxMs,
  }))
})
