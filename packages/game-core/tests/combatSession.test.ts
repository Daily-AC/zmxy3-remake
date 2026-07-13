import { defineContentId } from '@zaixu/content'
import { describe, expect, it } from 'vitest'
import { CombatSession } from '../src/session/combatSession'
import { SeededRandom } from '../src/random/seededRandom'
import type { CombatCommand } from '../src/session/commands'
import type { CombatEvent } from '../src/session/events'
import { cloneSerializable } from '../src/session/snapshot'
import type { CombatSessionDefinition, HeroCombatDefinition } from '../src/session/types'

function makeSessionDefinition(): CombatSessionDefinition {
  return {
    version: 1,
    contentVersion: 'combat-test@1',
    tickRate: 30,
    seed: 7,
    provenance: [
      { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'existing 30 Hz simulation' },
      { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
    ],
    hero: {
      id: 'hero-1',
      contentId: defineContentId('character.zaixu.wukong'),
      spawn: { x: 100, y: 400 },
      collisionOffset: { x: 0, y: 0 },
      groundY: 400,
      minX: 0,
      maxX: 1000,
      maxHp: 120,
      atk: 36,
      def: 2,
      magicDefenseFraction: 0,
      critChance: 0,
      comboStageDurationsMs: [300, 300, 300, 1600 / 3, 1600 / 3],
      comboGraceMs: 1500,
      normalAttacks: Object.fromEntries(
        ['hit1', 'hit2', 'hit3', 'hit4', 'hit5'].map((action) => [
          action,
          { action, hitFrameFractions: [0], hitbox: { forward: 85, y: 0, width: 130, height: 150 } },
        ]),
      ) as unknown as HeroCombatDefinition['normalAttacks'],
      hurtbox: { width: 90, height: 150 },
      hurtDurationMs: 260,
      respawnDelayMs: 1500,
    },
    monsters: [{
      id: 'monster-1',
      contentId: defineContentId('monster.chapter1.monster7'),
      spawn: { x: 800, y: 400 },
      collisionOffset: { x: 0, y: 0 },
      stats: { hp: 150, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0, def: 4 },
      patrolMin: 700,
      patrolMax: 900,
      hurtDurationMs: 500,
      attackDurationMs: 1000 / 3,
      deadDurationMs: 500,
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      attack: {
        action: 'hit1',
        hitFrameFractions: [0.6],
        hitbox: { forward: 80, y: -86, width: 160, height: 150 },
      },
      attackPower: 14,
      attackKind: 'physics',
      hurtbox: { width: 90, height: 150 },
      targetOffsetX: 7.5,
      selfOffsetX: 4.5,
    }],
  }
}

const definition = makeSessionDefinition()

describe('CombatSession', () => {
  it('emits a swing for a whiff without fabricating a hit', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })

    const events = session.step()

    expect(events).toContainEqual({
      type: 'attack-started', tick: 1, sourceId: 'hero-1', attackId: 1, action: 'hit1', airborne: false,
    })
    expect(events.some((event) => event.type === 'hit-confirmed')).toBe(false)
  })

  it('rejects key mashing while the current swing is active', () => {
    const session = new CombatSession(definition)
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      session.enqueue({ actorId: 'hero-1', sequence, atTick: sequence, type: 'press-attack' })
    }
    const events = session.step(6)
    expect(events.filter((event) => event.type === 'attack-started')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'command-rejected' && event.reason === 'busy')).toHaveLength(5)
    expect(session.getSnapshot().actors[0].attackId).toBe(1)
  })

  it('rejects a repeated or older sequence', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 1, type: 'press-right' })
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 2, type: 'release-right' })
    expect(session.step(2)).toContainEqual(expect.objectContaining({ type: 'command-rejected', reason: 'stale-sequence' }))
  })

  it('consumes the sequence of a busy rejection without changing domain state', () => {
    const subject = new CombatSession(definition)
    const control = new CombatSession(definition)
    const first = { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' } as const
    subject.enqueue(first)
    control.enqueue(first)
    subject.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
    subject.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 10, type: 'press-attack' })
    const events = subject.step(10)
    control.step(10)
    expect(events).toContainEqual(expect.objectContaining({ reason: 'busy' }))
    expect(events).toContainEqual(expect.objectContaining({ reason: 'stale-sequence' }))
    expect(subject.getDeterministicState().domain).toEqual(control.getDeterministicState().domain)
    expect(subject.getDeterministicState().protocol.lastSeenSequences)
      .not.toEqual(control.getDeterministicState().protocol.lastSeenSequences)
  })

  it('takes ownership of definitions and queued commands', () => {
    const source = makeSessionDefinition()
    const session = new CombatSession(source)
    source.hero.atk = 999
    source.monsters[0].spawn.x = 100
    const command: CombatCommand = { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' }
    session.enqueue(command)
    command.type = 'press-left'
    expect(session.step()).toContainEqual(expect.objectContaining({ type: 'attack-started' }))
    expect(session.getDeterministicState().domain.definition)
      .toEqual(expect.objectContaining({ hero: expect.objectContaining({ atk: 36 }) }))
  })

  it('marks a jump attack as airborne for faithful presentation', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-jump' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
    expect(session.step(2)).toContainEqual(expect.objectContaining({
      type: 'attack-started', action: 'hit1', airborne: true,
    }))
  })

  it('accepts a fresh press after hit1 ends and advances to hit2', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })
    session.step(10)
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 11, type: 'press-attack' })
    expect(session.step()).toContainEqual(expect.objectContaining({
      type: 'attack-started', attackId: 2, action: 'hit2',
    }))
  })

  it('requires five fresh presses and emits the full combo in order', () => {
    const session = new CombatSession(definition)
    const actions: string[] = []
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      const atTick = session.getSnapshot().tick + 1
      session.enqueue({ actorId: 'hero-1', sequence, atTick, type: 'press-attack' })
      const started = session.step().find((event) => event.type === 'attack-started')
      if (started?.type === 'attack-started') actions.push(started.action)
      if (sequence < 5) while (session.getSnapshot().actors[0].attacking) session.step()
    }
    expect(actions).toEqual(['hit1', 'hit2', 'hit3', 'hit4', 'hit5'])
    const hit5StartTick = session.getSnapshot().tick
    let guard = 0
    while (session.getSnapshot().actors[0].attacking && guard < 30) {
      session.step()
      guard += 1
    }
    expect(guard).toBe(16)
    expect(session.getSnapshot().tick - hit5StartTick).toBe(16)
    expect(session.getSnapshot().actors[0].attacking).toBe(false)
  })

  it('orders queued commands by tick then sequence and returns owned checkpoints', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 3, atTick: 3, type: 'press-left' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-right' })
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 2, type: 'press-jump' })
    const checkpoint = session.getDeterministicState()
    expect(checkpoint.protocol.queuedCommands.map(({ atTick, sequence }) => [atTick, sequence]))
      .toEqual([[2, 1], [2, 2], [3, 3]])
    ;(checkpoint.protocol.queuedCommands as CombatCommand[])[0].type = 'press-attack'
    ;(checkpoint.domain.definition as any).hero.atk = 999
    expect(session.getDeterministicState().protocol.queuedCommands[0].type).toBe('press-jump')
    expect((session.getDeterministicState().domain.definition as any).hero.atk).toBe(36)
  })

  it('returns snapshots without leaking actor state', () => {
    const session = new CombatSession(definition)
    const snapshot = session.getSnapshot()
    ;(snapshot.actors[0].statuses as string[]).push('changed')
    ;(snapshot.actors as any[])[0].x = -1
    expect(session.getSnapshot().actors[0].statuses).toEqual([])
    expect(session.getSnapshot().actors[0].x).toBe(100)
  })

  it('rejects invalid or already-processable command boundaries', () => {
    const session = new CombatSession(definition)
    const command = { actorId: 'hero-1', type: 'press-left' } as const
    for (const sequence of [-1, 1.5, Number.NaN]) {
      expect(() => session.enqueue({ ...command, sequence, atTick: 1 })).toThrow(RangeError)
    }
    for (const atTick of [-1, 1.5, Number.NaN]) {
      expect(() => session.enqueue({ ...command, sequence: 1, atTick })).toThrow(RangeError)
    }
    session.step()
    expect(() => session.enqueue({ ...command, sequence: 1, atTick: 1 })).toThrow(RangeError)
  })

  it('rejects unknown actors before applying sequence bookkeeping', () => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'missing', sequence: 4, atTick: 1, type: 'press-left' })
    expect(session.step()).toContainEqual(expect.objectContaining({ reason: 'unknown-actor' }))
    expect(session.getDeterministicState().protocol.lastSeenSequences).toEqual([])
  })

  it.each([
    ['right', 'release-right', 'press-right', 112],
    ['left', 'release-left', 'press-left', 88],
  ] as const)('uses the last same-tick %s command when release precedes press', (_side, release, press, expectedX) => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: release })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 1, type: press })

    session.step(2)

    expect(session.getSnapshot().actors[0].x).toBe(expectedX)
  })

  it.each([
    ['right', 'press-right', 'release-right'],
    ['left', 'press-left', 'release-left'],
  ] as const)('uses the last same-tick %s command when press precedes release', (_side, press, release) => {
    const session = new CombatSession(definition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: press })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 1, type: release })

    session.step(2)

    expect(session.getSnapshot().actors[0].x).toBe(100)
  })

  it('applies the original physics formula once per hero swing', () => {
    const closeDefinition = cloneSerializable(definition)
    closeDefinition.monsters[0].spawn.x = 220
    const session = new CombatSession(closeDefinition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })

    const events = session.step(2)

    expect(events).toContainEqual({
      type: 'damage-applied',
      tick: 2,
      sourceId: 'hero-1',
      targetId: 'monster-1',
      attackId: 1,
      rawPower: 36,
      defense: 4,
      amount: 32,
      remainingHp: 118,
    })
    expect(events.filter((event) => event.type === 'hit-confirmed')).toHaveLength(1)
    expect(events.map((event) => event.type)).toEqual([
      'attack-started',
      'hit-confirmed',
      'damage-applied',
      'actor-staggered',
    ])
    session.step(8)
    expect(session.getSnapshot().actors.find((actor) => actor.id === 'monster-1')?.hp).toBe(118)
  })

  it('whiffs without impact while preserving the legacy RNG cadence', () => {
    const session = new CombatSession(definition)
    const expectedRandom = new SeededRandom(definition.seed)
    expectedRandom.next()
    expectedRandom.next()
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })

    const events = session.step()

    expect(events.some((event) => event.type === 'attack-started')).toBe(true)
    expect(events.some((event) => event.type === 'damage-applied')).toBe(false)
    expect(session.getSnapshot().randomState).toBe(expectedRandom.getState())
  })

  it('keeps consuming one two-roll candidate per active tick after hit dedup', () => {
    const closeDefinition = cloneSerializable(definition)
    closeDefinition.monsters[0].spawn.x = 120
    const session = new CombatSession(closeDefinition)
    const expectedRandom = new SeededRandom(definition.seed)
    for (let tick = 0; tick < 3; tick += 1) {
      expectedRandom.next()
      expectedRandom.next()
    }
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })

    const events = session.step(3)

    expect(events.filter((event) => event.type === 'damage-applied')).toHaveLength(1)
    expect(session.getSnapshot().randomState).toBe(expectedRandom.getState())
  })

  it('applies Monster7 power 14 against hero defense 2 and knocks left', () => {
    const closeDefinition = cloneSerializable(definition)
    closeDefinition.hero.spawn.x = 500
    closeDefinition.monsters[0].spawn.x = 540
    closeDefinition.monsters[0].stats.normalAttackRate = 1
    closeDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    const session = new CombatSession(closeDefinition)

    const events = session.step(8)

    expect(events).toContainEqual(expect.objectContaining({
      type: 'damage-applied',
      sourceId: 'monster-1',
      targetId: 'hero-1',
      rawPower: 14,
      defense: 2,
      amount: 12,
      remainingHp: 108,
    }))
    expect(session.getSnapshot().actors[0].x).toBeLessThan(500)
  })

  it('rounds final magic damage with the legacy one-point floor', () => {
    const magicDefinition = cloneSerializable(definition)
    magicDefinition.hero.spawn.x = 500
    magicDefinition.hero.magicDefenseFraction = 0.1
    magicDefinition.monsters[0].spawn.x = 540
    magicDefinition.monsters[0].stats.normalAttackRate = 1
    magicDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    magicDefinition.monsters[0].attackPower = 7
    magicDefinition.monsters[0].attackKind = 'magic'
    const session = new CombatSession(magicDefinition)

    expect(session.step(8)).toContainEqual(expect.objectContaining({
      type: 'damage-applied',
      sourceId: 'monster-1',
      targetId: 'hero-1',
      rawPower: 7,
      defense: 0.1,
      amount: 6,
      remainingHp: 114,
    }))
  })

  it('defeats then removes a monster after its dead animation', () => {
    const lethalDefinition = cloneSerializable(definition)
    lethalDefinition.monsters[0].spawn.x = 220
    lethalDefinition.monsters[0].stats.hp = 32
    const session = new CombatSession(lethalDefinition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })

    expect(session.step(2)).toContainEqual(expect.objectContaining({
      type: 'actor-defeated',
      actorId: 'monster-1',
    }))
    let removed: CombatEvent | undefined
    while (!removed && session.getSnapshot().tick < 30) {
      removed = session.step().find((event) => event.type === 'actor-removed')
    }
    expect(removed).toEqual({ type: 'actor-removed', tick: 16, actorId: 'monster-1' })
  })

  it('respawns a defeated hero at the configured spawn', () => {
    const lethalDefinition = cloneSerializable(definition)
    lethalDefinition.hero.spawn.x = 500
    lethalDefinition.monsters[0].spawn.x = 500
    lethalDefinition.monsters[0].stats.normalAttackRate = 1
    lethalDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    lethalDefinition.monsters[0].attackPower = 500
    const session = new CombatSession(lethalDefinition)

    expect(session.step(8)).toContainEqual(expect.objectContaining({
      type: 'actor-defeated',
      actorId: 'hero-1',
    }))
    const respawnEvents = session.step(45)
    expect(respawnEvents).toContainEqual(expect.objectContaining({
      type: 'actor-respawned',
      actorId: 'hero-1',
      x: 500,
    }))
    expect(session.getSnapshot().actors[0].hp).toBe(120)
  })

  it('freezes a defeated hero without consuming active-swing RNG', () => {
    const lethalDefinition = cloneSerializable(definition)
    lethalDefinition.hero.spawn.x = 500
    lethalDefinition.monsters[0].spawn.x = 540
    lethalDefinition.monsters[0].stats.normalAttackRate = 1
    lethalDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    lethalDefinition.monsters[0].attackPower = 500
    const session = new CombatSession(lethalDefinition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-left' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })

    const deathEvents = session.step(8)
    expect(deathEvents).toContainEqual(expect.objectContaining({ type: 'actor-defeated', actorId: 'hero-1' }))
    const atDeath = session.getSnapshot()
    expect(atDeath.actors[0].attacking).toBe(false)
    const randomAtDeath = atDeath.randomState
    const xAtDeath = atDeath.actors[0].x

    session.enqueue({ actorId: 'hero-1', sequence: 3, atTick: 9, type: 'press-attack' })
    expect(session.step(2)).toContainEqual(expect.objectContaining({
      type: 'command-rejected',
      reason: 'dead',
    }))
    expect(session.getSnapshot().actors[0].x).toBe(xAtDeath)
    expect(session.getSnapshot().actors[0].attacking).toBe(false)
    expect(session.getSnapshot().randomState).toBe(randomAtDeath)
  })

  it('respawns with all transient hero simulation state cleared', () => {
    const lethalDefinition = cloneSerializable(definition)
    lethalDefinition.hero.spawn.x = 500
    lethalDefinition.monsters[0].spawn.x = 540
    lethalDefinition.monsters[0].stats.normalAttackRate = 1
    lethalDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    lethalDefinition.monsters[0].attackPower = 500
    const session = new CombatSession(lethalDefinition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-left' })
    session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 1, type: 'press-jump' })
    session.enqueue({ actorId: 'hero-1', sequence: 3, atTick: 2, type: 'press-attack' })
    session.step(8)
    const attackIdAtDeath = session.getSnapshot().actors[0].attackId

    const respawnEvents = session.step(45)

    expect(respawnEvents).toContainEqual(expect.objectContaining({ type: 'actor-respawned', actorId: 'hero-1' }))
    const hero = session.getSnapshot().actors[0]
    expect(hero).toMatchObject({
      x: 500,
      y: 400,
      action: 'wait',
      comboStage: null,
      attacking: false,
      knockbackVelocityX: 0,
    })
    expect(hero.attackId).toBe(attackIdAtDeath)
    session.step(3)
    expect(session.getSnapshot().actors[0].x).toBe(500)
    expect(session.getSnapshot().actors[0].action).toBe('wait')
  })

  it('starts a monster attack at the maximum AABB-overlap center distance', () => {
    const edgeDefinition = cloneSerializable(definition)
    edgeDefinition.hero.spawn.x = 701
    edgeDefinition.monsters[0].spawn.x = 500
    edgeDefinition.monsters[0].stats.normalAttackRate = 1
    edgeDefinition.monsters[0].decisionIntervalMs = 1000 / 30
    edgeDefinition.monsters[0].targetOffsetX = 7.5
    edgeDefinition.monsters[0].selfOffsetX = 4.5
    edgeDefinition.hero.collisionOffset.x = 7.5
    edgeDefinition.monsters[0].collisionOffset.x = 4.5
    const session = new CombatSession(edgeDefinition)

    expect(session.step()).toContainEqual(expect.objectContaining({
      type: 'attack-started',
      sourceId: 'monster-1',
    }))
    expect(session.getSnapshot().actors[1].x).toBe(500)
  })

  it('uses collision offsets for attack and hurt boxes while snapshots stay logical', () => {
    const offsetDefinition = cloneSerializable(definition)
    offsetDefinition.hero.spawn.x = 100
    offsetDefinition.hero.collisionOffset.x = 100
    offsetDefinition.monsters[0].spawn.x = 275
    offsetDefinition.monsters[0].collisionOffset.x = -100
    const session = new CombatSession(offsetDefinition)
    session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })

    expect(session.step()).toContainEqual(expect.objectContaining({
      type: 'damage-applied',
      targetId: 'monster-1',
    }))
    expect(session.getSnapshot().actors.map(({ x }) => x)).toEqual([100, 275])
  })
})
