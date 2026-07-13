import { defineContentId } from '@zaixu/content'
import { describe, expect, it } from 'vitest'
import { CombatSession } from '../src/session/combatSession'
import type { CombatCommand } from '../src/session/commands'
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
})
