import { describe, expect, it } from 'vitest'
import { MONSTER_ATTACKS } from '../src/systems/attackSpec'
import {
  CANONICAL_LEGACY_COMMANDS,
  LegacyCombatSliceOracle,
  createLegacyCombatSliceDefinition,
  legacyFinalizeIncomingHeroDamage,
  legacyHeroSwingIntent,
  legacyMonsterKnockbackDirection,
  legacyMonsterAttackHitbox,
  runLegacyCombatSliceTrace,
  type LegacyCombatEvent,
  type LegacySliceDefinition,
} from '../src/adapters/legacyCombatSliceOracle'
import { TICK_MS } from '../src/systems/tick'

function monsterDamageEvents(trace: ReturnType<typeof runLegacyCombatSliceTrace>): Extract<LegacyCombatEvent, { type: 'damage-applied' }>[] {
  return trace.frames
    .flatMap((frame) => frame.events)
    .filter((event): event is Extract<LegacyCombatEvent, { type: 'damage-applied' }> =>
      event.type === 'damage-applied' && event.sourceId === 'monster-1')
}

function monster2Definition(): LegacySliceDefinition {
  const definition = structuredClone(createLegacyCombatSliceDefinition())
  definition.hero.spawn.x = 490
  const monster = definition.monsters[0]
  monster.spawn.x = 600
  monster.stats.normalAttackRate = 1
  monster.decisionIntervalMs = TICK_MS
  monster.attackDurationMs = 5 * TICK_MS
  monster.attackCooldownMs = 0
  monster.attack = structuredClone(MONSTER_ATTACKS.monster2.hit1)
  monster.attackPower = 10
  return definition
}

describe('legacy combat slice helpers', () => {
  it('consumes two rolls for every active hero swing candidate', () => {
    let calls = 0
    const intent = legacyHeroSwingIntent({
      attacking: true,
      comboStage: 1,
      attackId: 7,
      facing: 1,
      center: { x: 100, y: 400 },
      atk: 36,
      critChance: 0,
      random: () => {
        calls += 1
        return 0.5
      },
    })

    expect(calls).toBe(2)
    expect(intent).toEqual({
      attackId: 7,
      action: 'hit1',
      rawPower: 36,
      hitbox: { x: 120, y: 325, w: 130, h: 150 },
    })
  })

  it('resolves monster geometry without presentation metadata', () => {
    expect(legacyMonsterAttackHitbox(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, -1))
      .toMatchObject({ x: 340, y: 239, w: 160, h: 150 })
  })

  it('finalizes incoming damage with legacy rounding and a one-point floor', () => {
    expect(legacyFinalizeIncomingHeroDamage(7, 'magic', 0, 0.1)).toBe(6)
    expect(legacyFinalizeIncomingHeroDamage(0.4, 'magic', 0, 0)).toBe(1)
  })

  it('derives knockback from current positions after the hero crosses behind', () => {
    expect(legacyMonsterKnockbackDirection(610, 600)).toBe(1)
    expect(legacyMonsterKnockbackDirection(590, 600)).toBe(-1)
  })

  it('preserves special numbers for deterministic checkpoint encoding', () => {
    const definition = createLegacyCombatSliceDefinition()
    definition.hero.maxX = Number.POSITIVE_INFINITY
    definition.hero.minX = Number.NEGATIVE_INFINITY
    definition.hero.atk = Number.NaN

    const checkpoint = new LegacyCombatSliceOracle(definition).getDeterministicState()

    expect(checkpoint.domain.definition).toMatchObject({
      hero: {
        maxX: 'positive-infinity',
        minX: 'negative-infinity',
        atk: 'nan',
      },
    })
  })

  it('owns definition data and rejects cyclic input', () => {
    const definition = createLegacyCombatSliceDefinition()
    const oracle = new LegacyCombatSliceOracle(definition)
    definition.hero.atk = 999
    expect(oracle.getDeterministicState().domain.definition).toMatchObject({ hero: { atk: 36 } })

    const cyclic = createLegacyCombatSliceDefinition() as LegacySliceDefinition & { cycle?: unknown }
    cyclic.cycle = cyclic
    expect(() => new LegacyCombatSliceOracle(cyclic)).toThrow()
  })

  it('gives both Monster2 hit frames distinct landed-hit ids', () => {
    const trace = runLegacyCombatSliceTrace(monster2Definition(), [], 6)
    const damage = monsterDamageEvents(trace)

    expect(damage).toHaveLength(2)
    expect(damage.map((event) => event.attackId)).toEqual([1, 2])
    expect(damage.map((event) => event.amount)).toEqual([8, 8])
  })

  it('does not advance the legacy local-hit counter for a fully whiffed swing', () => {
    const trace = runLegacyCombatSliceTrace(
      monster2Definition(),
      [
        { actorId: 'hero-1', sequence: 1, atTick: 2, type: 'press-left' },
        { actorId: 'hero-1', sequence: 2, atTick: 6, type: 'release-left' },
      ],
      15,
    )
    const damage = monsterDamageEvents(trace)

    expect(damage).toHaveLength(1)
    expect(damage[0].attackId).toBe(1)
    expect(trace.frames.at(-1)?.checkpoint.domain.monsters[0].attackId).toBe(1)
  })

  it('emits final-shaped snapshots, events, and deterministic checkpoints', () => {
    const trace = runLegacyCombatSliceTrace(
      createLegacyCombatSliceDefinition(),
      CANONICAL_LEGACY_COMMANDS,
      180,
    )

    expect(trace.frames).toHaveLength(180)
    expect(trace.frames[1].events).toContainEqual({
      type: 'attack-started',
      tick: 2,
      sourceId: 'hero-1',
      attackId: 1,
      action: 'hit1',
      airborne: false,
    })
    expect(trace.frames[1].snapshot.actors.map((actor) => actor.contentId)).toEqual([
      'character.zaixu.wukong',
      'monster.chapter1.monster7',
    ])
    expect(trace.frames[1].snapshot.actors[1].statuses).toContain('hurt')
    expect(trace.frames[1].checkpoint).toMatchObject({
      version: 1,
      contentVersion: 'combat-core-slice@1',
      domain: { tick: 2 },
      protocol: { protocolVersion: 'combat-session@1' },
    })
    expect(trace.finalHash).toMatch(/^[0-9a-f]{8}$/)
    expect(trace.frames.at(-1)?.checkpoint.domain.tick).toBe(180)
    expect(trace.frames.at(-1)?.snapshot.randomState)
      .toBe(trace.frames.at(-1)?.checkpoint.domain.randomState)
  })
})
