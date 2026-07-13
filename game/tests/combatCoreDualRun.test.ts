import fs from 'node:fs'
import path from 'node:path'
import {
  CombatSession,
  TICK_MS,
  type CombatCommand,
  type CombatSessionDefinition,
  type CombatSnapshot,
} from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import golden from './fixtures/combat-core-slice-legacy-golden.json'
import { buildCombatCoreSliceDefinition } from '../src/adapters/combatCoreDefinition'
import * as combatParity from '../src/adapters/combatCoreParity'
import {
  LegacyCombatSliceOracle,
  runLegacyCombatSliceTrace,
} from '../src/adapters/legacyCombatSliceOracle'

const { compareCombatSnapshots, runCombatCoreParity } = combatParity

const commands: CombatCommand[] = [
  { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' },
  { actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 3, atTick: 3, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 4, atTick: 12, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 5, atTick: 22, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 6, atTick: 32, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 7, atTick: 50, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 8, atTick: 80, type: 'release-right' },
  { actorId: 'hero-1', sequence: 9, atTick: 100, type: 'press-jump' },
]

describe('combat core dual run', () => {
  it('keeps the frozen oracle golden and matches the modern session for 180 ticks', () => {
    const frozenTrace = runLegacyCombatSliceTrace(
      golden.definition as unknown as CombatSessionDefinition,
      golden.commands as readonly CombatCommand[],
      golden.totalTicks,
    )
    expect(frozenTrace.frames).toEqual(golden.frames)
    expect(frozenTrace.finalHash).toBe('e99f9023')

    const definition = buildCombatCoreSliceDefinition({
      monsterX: 600,
      monsterHp: 500,
      monsterAttackRate: 1,
    })
    const report = runCombatCoreParity(definition, commands, 180)
    expect(report.diffs, JSON.stringify(report.diffs, null, 2)).toEqual([])
    expect(report.modernFinalHash).toBe(report.legacyFinalHash)
    expect(report.modernFinalHash).toBe('3da79905')
  })

  it('reports a deliberate actor HP mismatch at the exact actor path', () => {
    const definition = buildCombatCoreSliceDefinition()
    const baseline = {
      version: 1,
      contentVersion: definition.contentVersion,
      tick: 7,
      randomState: definition.seed,
      actors: [{
        id: 'monster-1',
        kind: 'monster',
        contentId: definition.monsters[0].contentId,
        x: 900,
        y: 400,
        facing: -1,
        action: 'wait',
        hp: 150,
        maxHp: 150,
        lifeState: 'ready',
        comboStage: null,
        statuses: ['idle'],
        knockbackVelocityX: 0,
        attackId: 0,
        attacking: false,
      }],
    } satisfies CombatSnapshot
    const changed = structuredClone(baseline)
    changed.actors[0].hp = 149

    expect(compareCombatSnapshots(7, baseline, changed)).toContainEqual({
      tick: 7,
      field: 'actors.monster-1.hp',
      legacy: 150,
      modern: 149,
    })
  })

  it('reports actor order instead of normalizing snapshots by id', () => {
    const definition = buildCombatCoreSliceDefinition()
    const actor = (id: 'hero-1' | 'monster-1'): CombatSnapshot['actors'][number] => ({
      id,
      kind: id === 'hero-1' ? 'hero' : 'monster',
      contentId: id === 'hero-1' ? definition.hero.contentId : definition.monsters[0].contentId,
      x: 0,
      y: 0,
      facing: id === 'hero-1' ? 1 : -1,
      action: 'wait',
      hp: 1,
      maxHp: 1,
      lifeState: 'ready',
      comboStage: null,
      statuses: [],
      knockbackVelocityX: 0,
      attackId: 0,
      attacking: false,
    })
    const snapshot = (ids: readonly ('hero-1' | 'monster-1')[]): CombatSnapshot => ({
        version: 1,
        contentVersion: definition.contentVersion,
        tick: 0,
        randomState: definition.seed,
        actors: ids.map(actor),
      })
    const legacy = snapshot(['hero-1', 'monster-1'])
    const modern = snapshot(['monster-1', 'hero-1'])

    expect(compareCombatSnapshots(9, legacy, modern)).toContainEqual({
      tick: 9,
      field: 'actors.order',
      legacy: ['hero-1', 'monster-1'],
      modern: ['monster-1', 'hero-1'],
    })
  })

  it('reports a swing counter mismatch in the complete checkpoint', () => {
    const definition = buildCombatCoreSliceDefinition()
    const base = new LegacyCombatSliceOracle(definition).getDeterministicState()
    expect(base.domain.monsters[0]).toHaveProperty('swingEventId', 0)
    const changed = structuredClone(base)
    ;(changed.domain.monsters[0] as unknown as Record<string, unknown>).swingEventId = 1
    const compareCombatCheckpoints = (combatParity as unknown as {
      compareCombatCheckpoints: (
        tick: number,
        legacy: typeof base,
        modern: typeof base,
      ) => unknown[]
    }).compareCombatCheckpoints

    expect(compareCombatCheckpoints(11, base, changed)).toContainEqual({
      tick: 11,
      field: 'checkpoint.domain.monsters.0.swingEventId',
      legacy: 0,
      modern: 1,
    })
  })

  it('keeps protected monster frames unconsumed and resumes damage after the guard expires', () => {
    const definition = buildCombatCoreSliceDefinition({ monsterX: 540, monsterAttackRate: 1 })
    definition.hero.maxHp = 1000
    definition.monsters[0].decisionIntervalMs = TICK_MS
    definition.monsters[0].attackDurationMs = 5 * TICK_MS
    definition.monsters[0].attackCooldownMs = 0
    definition.monsters[0].attack = {
      ...definition.monsters[0].attack,
      hitFrameFractions: [0.4],
    }

    const report = runCombatCoreParity(definition, [], 180)
    expect(report.diffs, JSON.stringify(report.diffs, null, 2)).toEqual([])

    const legacy = new LegacyCombatSliceOracle(definition)
    const modern = new CombatSession(definition)
    let landedAtProtection: number | undefined
    let protectedLandedId: number | undefined
    let sawBlockedFrame = false
    let landedAfterProtection = false
    for (let tick = 1; tick <= 180; tick += 1) {
      legacy.step()
      modern.step()
      const checkpoint = legacy.getDeterministicState()
      const monster = checkpoint.domain.monsters[0]
      const heroCombat = checkpoint.domain.heroCombat as Record<string, unknown>
      const protectionUntil = heroCombat.meterInvulnerableUntilMs
      if (typeof protectionUntil === 'number' && tick * TICK_MS < protectionUntil) {
        landedAtProtection ??= monster.attackId
        if (monster.swingEventId > monster.attackId) {
          sawBlockedFrame = true
          if (protectedLandedId === undefined) {
            protectedLandedId = monster.attackId + 1
            const modernHeroCombat = modern.getDeterministicState().domain.heroCombat as Record<string, unknown>
            expect(modernHeroCombat.resolvedHitIds).not.toContain(`monster-1:${protectedLandedId}`)
          }
        }
      } else if (landedAtProtection !== undefined && monster.attackId > landedAtProtection) {
        landedAfterProtection = true
      }
    }

    expect(sawBlockedFrame).toBe(true)
    expect(landedAfterProtection).toBe(true)
    expect(legacy.getDeterministicState().domain.monsters[0].attackId)
      .toBeGreaterThanOrEqual(protectedLandedId as number)
    expect((modern.getDeterministicState().domain.heroCombat as Record<string, unknown>).resolvedHitIds)
      .toContain(`monster-1:${protectedLandedId}`)
    expect(modern.getDeterministicState()).toEqual(legacy.getDeterministicState())
  })

  it('keeps the oracle independent from the modern session implementation', () => {
    const legacySource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/adapters/legacyCombatSliceOracle.ts'),
      'utf8',
    )
    expect(legacySource).not.toMatch(/\bCombatSession\b/)
  })
})
