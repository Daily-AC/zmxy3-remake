import { describe, it, expect } from 'vitest'
import {
  Monster3Spec,
  Monster7Spec,
  Monster13Spec,
  createMonsterBehaviorState,
  advanceMonsterBehavior,
  spawnedHitboxToRect,
  type MonsterBehaviorSpec,
  type MonsterBehaviorState,
  type MonsterBehaviorTarget,
} from '../src/systems/monsterBehaviors'

const bounds = { patrolMin: 0, patrolMax: 2000 }
const noTarget: MonsterBehaviorTarget = { x: 0, y: 0, isAlive: false }

function alive(x: number, y = 0): MonsterBehaviorTarget {
  return { x, y, isAlive: true }
}

/** Force the once-per-decisionInterval attack roll to succeed. */
const alwaysAttack = () => 0
/** Force it to fail (never below normalAttackRate) and never trigger the "wait" patrol roll. */
const neverAttack = () => 0.999

function tickUntilAttacking(
  state: MonsterBehaviorState,
  spec: MonsterBehaviorSpec,
  target: MonsterBehaviorTarget,
  random: () => number = alwaysAttack,
) {
  // One decisionIntervalMs tick is enough to acquire target + roll the attack.
  return advanceMonsterBehavior(state, spec, bounds, target, null, spec.decisionIntervalMs, random)
}

describe('monsterBehaviors: generic shell', () => {
  it('starts in patrol at full HP', () => {
    const state = createMonsterBehaviorState(Monster3Spec, 500, 0)
    expect(state.mode).toBe('patrol')
    expect(state.hp).toBe(Monster3Spec.hp)
  })

  it('patrols back and forth, turning at the bounds', () => {
    const state = createMonsterBehaviorState(Monster7Spec, bounds.patrolMin, 0)
    state.patrolDir = -1
    advanceMonsterBehavior(state, Monster7Spec, bounds, noTarget, null, 16, neverAttack)
    expect(state.patrolDir).toBe(1) // turned at patrolMin
    expect(state.x).toBeGreaterThan(bounds.patrolMin) // now moving right
  })
})

for (const spec of [Monster3Spec, Monster7Spec, Monster13Spec]) {
  describe(`monsterBehaviors: ${spec.id} (${spec.normalMove.attack.kind})`, () => {
    it('acquires a target within alertRange and enters chase', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.alertRange - 10)
      advanceMonsterBehavior(state, spec, bounds, target, null, 16, neverAttack)
      expect(state.mode).toBe('chase')
    })

    it('ignores a target beyond alertRange', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.alertRange + 50)
      advanceMonsterBehavior(state, spec, bounds, target, null, 16, neverAttack)
      expect(state.mode).toBe('patrol')
    })

    it('enters attack mode once in attackRange and the decision roll succeeds', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.attackRange - 5)
      const events = tickUntilAttacking(state, spec, target)
      expect(state.mode).toBe('attack')
      expect(state.activeMove).toBe('normal')
      expect(events).toContainEqual({ type: 'attack-start', x: 500, y: 0 })
    })

    it('does not attack when the decision roll fails', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.attackRange - 5)
      advanceMonsterBehavior(state, spec, bounds, target, null, spec.decisionIntervalMs, neverAttack)
      expect(state.mode).toBe('chase')
    })

    it('spawns the attack (hitbox or projectile) at spawnAtMs, exactly once', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.attackRange - 5)
      tickUntilAttacking(state, spec, target)
      expect(state.mode).toBe('attack')

      const beforeSpawn = advanceMonsterBehavior(
        state, spec, bounds, target, null, spec.normalMove.spawnAtMs - 1, neverAttack,
      )
      expect(beforeSpawn.some((e) => e.type === 'attack-spawn')).toBe(false)

      const atSpawn = advanceMonsterBehavior(state, spec, bounds, target, null, 2, neverAttack)
      const spawnEvent = atSpawn.find((e) => e.type === 'attack-spawn')
      expect(spawnEvent).toBeDefined()
      expect(spawnEvent!.spawn!.kind).toBe(spec.normalMove.attack.kind)
      expect(spawnEvent!.spawn!.damage).toBe(spec.normalMove.attack.damage)

      // Only fires once per action, even if we keep ticking through it.
      const later = advanceMonsterBehavior(state, spec, bounds, target, null, 5, neverAttack)
      expect(later.some((e) => e.type === 'attack-spawn')).toBe(false)
    })

    it('returns to chase once the attack action finishes', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const target = alive(500 + spec.attackRange - 5)
      tickUntilAttacking(state, spec, target)
      advanceMonsterBehavior(state, spec, bounds, target, null, spec.normalMove.durationMs + 1, neverAttack)
      expect(state.mode).toBe('chase')
    })

    it('reacts to a hit: HP drops (respecting def), enters hurt, dedups the same attackId', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      const rawDamage = spec.def + 50
      const events = advanceMonsterBehavior(
        state, spec, bounds, noTarget, { attackId: 'hero-swing-1', damage: rawDamage }, 16, neverAttack,
      )
      expect(events).toContainEqual({ type: 'hurt', x: state.x, y: state.y })
      expect(state.hp).toBe(spec.hp - (rawDamage - spec.def))
      expect(state.mode).toBe('hurt')

      const hpAfterFirst = state.hp
      const dupEvents = advanceMonsterBehavior(
        state, spec, bounds, noTarget, { attackId: 'hero-swing-1', damage: rawDamage }, 16, neverAttack,
      )
      expect(dupEvents.some((e) => e.type === 'hurt')).toBe(false)
      expect(state.hp).toBe(hpAfterFirst)
    })

    it('recovers from hurt back to patrol, and dies + goes "gone" once HP is depleted', () => {
      const state = createMonsterBehaviorState(spec, 500, 0)
      advanceMonsterBehavior(state, spec, bounds, noTarget, { attackId: 'a', damage: spec.def + 1 }, 16, neverAttack)
      expect(state.mode).toBe('hurt')
      advanceMonsterBehavior(state, spec, bounds, noTarget, null, spec.hurtDurationMs + 1, neverAttack)
      expect(state.mode).toBe('patrol')

      const lethal = advanceMonsterBehavior(
        state, spec, bounds, noTarget, { attackId: 'b', damage: spec.hp + 999 }, 16, neverAttack,
      )
      expect(lethal).toEqual([])
      expect(state.mode).toBe('dead')
      expect(state.hp).toBe(0)

      const deathEvents = advanceMonsterBehavior(state, spec, bounds, noTarget, null, spec.deadDurationMs + 1, neverAttack)
      expect(deathEvents).toContainEqual({ type: 'death', x: state.x, y: state.y })
      expect(state.mode).toBe('gone')

      // A gone monster is inert.
      const inert = advanceMonsterBehavior(state, spec, bounds, alive(state.x), { attackId: 'c', damage: 999 }, 16, neverAttack)
      expect(inert).toEqual([])
      expect(state.mode).toBe('gone')
    })
  })
}

describe('monsterBehaviors: Monster3 hit2 skill gate (deterministic, no roll)', () => {
  it('fires hit2 once within triggerRange and off cooldown, ahead of the normal-attack decision', () => {
    const state = createMonsterBehaviorState(Monster3Spec, 500, 0)
    state.skillCooldownMs = 0 // past the initial 2000ms cooldown
    const target = alive(500 + Monster3Spec.skill!.triggerRange - 10)
    // Even a single 16ms tick (nowhere near decisionIntervalMs) triggers the
    // skill — it's gated by its own cooldown + range, not the decision timer.
    const events = advanceMonsterBehavior(state, Monster3Spec, bounds, target, null, 16, neverAttack)
    expect(state.mode).toBe('attack')
    expect(state.activeMove).toBe('skill')
    expect(events).toContainEqual({ type: 'attack-start', x: 500, y: 0 })
    expect(state.skillCooldownMs).toBe(Monster3Spec.skill!.cooldownMs)
  })

  it('rejects hit2 while its own cooldown is still active', () => {
    const state = createMonsterBehaviorState(Monster3Spec, 500, 0)
    expect(state.skillCooldownMs).toBe(Monster3Spec.skill!.initialCooldownMs) // starts on cooldown
    const target = alive(500 + Monster3Spec.skill!.triggerRange - 10)
    advanceMonsterBehavior(state, Monster3Spec, bounds, target, null, 16, neverAttack)
    expect(state.mode).not.toBe('attack')
  })

  it('spawns hit2 as a magic hitbox with the ported damage/offset at its own spawnAtMs', () => {
    const state = createMonsterBehaviorState(Monster3Spec, 500, 0)
    state.skillCooldownMs = 0
    const target = alive(500 + Monster3Spec.skill!.triggerRange - 10)
    advanceMonsterBehavior(state, Monster3Spec, bounds, target, null, 16, neverAttack)
    const events = advanceMonsterBehavior(
      state, Monster3Spec, bounds, target, null, Monster3Spec.skill!.move.spawnAtMs, neverAttack,
    )
    const spawn = events.find((e) => e.type === 'attack-spawn')?.spawn
    expect(spawn).toBeDefined()
    expect(spawn!.kind).toBe('hitbox')
    expect(spawn!.damage).toBe(18)
    if (spawn!.kind === 'hitbox') expect(spawn!.attackKind).toBe('magic')
  })
})

describe('monsterBehaviors: Monster13 projectile aiming', () => {
  it('aims the spawned projectile at the target position sampled at spawn time', () => {
    const state = createMonsterBehaviorState(Monster13Spec, 500, 0)
    const target = alive(500 + Monster13Spec.attackRange - 5, 200) // above and ahead
    tickUntilAttacking(state, Monster13Spec, target)
    const events = advanceMonsterBehavior(
      state, Monster13Spec, bounds, target, null, Monster13Spec.normalMove.spawnAtMs + 1, neverAttack,
    )
    const spawn = events.find((e) => e.type === 'attack-spawn')?.spawn
    expect(spawn).toBeDefined()
    if (spawn?.kind !== 'projectile') throw new Error('expected a projectile spawn')
    // Direction should point toward +x (target further right) and +y (target below in this coord space).
    expect(spawn.velocityX).toBeGreaterThan(0)
    expect(spawn.velocityY).toBeGreaterThan(0)
    const speedMagnitude = Math.hypot(spawn.velocityX, spawn.velocityY)
    expect(speedMagnitude).toBeCloseTo(Monster13Spec.normalMove.attack.kind === 'projectile' ? Monster13Spec.normalMove.attack.speed : 0, 5)
    expect(spawn.accel).toBe((Monster13Spec.normalMove.attack as { accel: number }).accel)
    expect(spawn.maxDistance).toBe(1000)
  })
})

describe('spawnedHitboxToRect', () => {
  it('converts a spawned melee hitbox into the project\'s Rect shape for overlaps()', () => {
    const state = createMonsterBehaviorState(Monster7Spec, 500, 0)
    const target = alive(500 + Monster7Spec.attackRange - 5)
    tickUntilAttacking(state, Monster7Spec, target)
    const events = advanceMonsterBehavior(
      state, Monster7Spec, bounds, target, null, Monster7Spec.normalMove.spawnAtMs + 1, neverAttack,
    )
    const spawn = events.find((e) => e.type === 'attack-spawn')?.spawn
    if (spawn?.kind !== 'hitbox') throw new Error('expected a hitbox spawn')
    const rect = spawnedHitboxToRect(spawn)
    expect(rect.w).toBe(spawn.width)
    expect(rect.h).toBe(spawn.height)
    expect(rect.x).toBeCloseTo(spawn.x - spawn.width / 2, 5)
    expect(rect.y).toBeCloseTo(spawn.y - spawn.height / 2, 5)
  })
})
