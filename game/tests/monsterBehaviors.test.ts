import { describe, it, expect } from 'vitest'
import {
  Monster3Spec,
  Monster7Spec,
  Monster13Spec,
  createMonsterBehaviorState,
  advanceMonsterBehavior,
  spawnedHitboxToRect,
  createSkillOverlayState,
  advanceSkillOverlay,
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

    // Monster3's real AS3 boss-branch probability is 1 (guaranteed proc) --
    // see Monster3Spec's header -- so there is no roll value that can ever
    // fail its `random() <= normalAttackRate` check; skip for that spec only.
    it.skipIf(spec.normalAttackRate >= 1)('does not attack when the decision roll fails', () => {
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
    // 7, not kagami's stale 18 -- AS3 attackBackInfoDict.hit2.power (打开我开始玩.swf,
    // export.monster.Monster3), see monsterBehaviors.ts's Monster3Spec header.
    expect(spawn!.damage).toBe(7)
    if (spawn!.kind === 'hitbox') expect(spawn!.attackKind).toBe('magic')
  })
})

// Numeric regression for 巫鹰, corrected from the official stageInfo
// export.monster.Monster3 constructor. See Monster3Spec's header for the
// field-by-field provenance.
describe('monsterBehaviors: Monster3 AS3 numeric regression (behavior-wiring pen)', () => {
  it('uses the official 160 hp', () => {
    expect(Monster3Spec.hp).toBe(160)
  })

  it('def/attackRange/speed/normalAttackRate match the official constructor and BaseMonster default', () => {
    expect(Monster3Spec.def).toBe(6)
    expect(Monster3Spec.attackRange).toBe(250)
    expect(Monster3Spec.normalAttackRate).toBe(0.5)
    expect(Monster3Spec.speed).toBeCloseTo(90, 5) // horizenSpeed=3 px/frame @ 30fps
  })

  it('hit1 power/knockback/hitMaxCount match attackBackInfoDict.hit1', () => {
    const attack = Monster3Spec.normalMove.attack
    expect(attack.damage).toBe(14)
    expect(attack.attackKind).toBe('physics')
    if (attack.kind === 'hitbox') {
      expect(attack.maxHits).toBe(99)
      expect(attack.knockbackX).toBe(6)
      expect(attack.knockbackY).toBe(-5)
    }
  })

  it('hit2 power/knockback/hitMaxCount/attackInterval match attackBackInfoDict.hit2', () => {
    const attack = Monster3Spec.skill!.move.attack
    expect(attack.damage).toBe(7)
    expect(attack.attackKind).toBe('magic')
    if (attack.kind === 'hitbox') {
      expect(attack.maxHits).toBe(99)
      expect(attack.hitIntervalFrames).toBe(4)
      expect(attack.knockbackX).toBe(-5)
      expect(attack.knockbackY).toBe(0)
    }
  })
})

describe('monsterBehaviors: Monster7 official BaseMonster defaults', () => {
  it('uses the official 0.5 normal attack rate', () => {
    expect(Monster7Spec.normalAttackRate).toBe(0.5)
  })
})

// behavior-wiring pen: the skill-overlay API BattleScene uses to layer
// Monster3's hit2 on top of its own monsterSim-driven boss state machine
// (see monsterBehaviors.ts's overlay section header for why it isn't a full
// switch to advanceMonsterBehavior).
describe('monsterBehaviors: skill overlay (BattleScene boss hit2 wiring)', () => {
  const gate = Monster3Spec.skill!
  const host = { x: 500, y: 0, facing: 1 as const }

  it('starts on its initialCooldownMs and rejects a trigger before it elapses', () => {
    const overlay = createSkillOverlayState(gate)
    expect(overlay.cooldownMs).toBe(gate.initialCooldownMs)
    const events = advanceSkillOverlay(overlay, gate, host, gate.triggerRange - 10, true, 16)
    expect(events).toEqual([])
    expect(overlay.active).toBeNull()
  })

  it('fires attack-start once off cooldown, in range, and canTrigger is true', () => {
    const overlay = createSkillOverlayState(gate)
    overlay.cooldownMs = 0
    const events = advanceSkillOverlay(overlay, gate, host, gate.triggerRange - 10, true, 16)
    expect(events).toEqual([{ type: 'attack-start' }])
    // Starts fresh at elapsedMs 0 on the trigger frame itself (mirrors
    // advanceMonsterBehavior's own startAttack -- modeElapsedMs resets to 0,
    // the same call's delta isn't folded in until the next tick).
    expect(overlay.active).toEqual({ elapsedMs: 0, hitApplied: false })
    expect(overlay.cooldownMs).toBe(gate.cooldownMs) // re-armed on its own repeat cooldown
  })

  it('does not trigger when canTrigger is false (host mid hit1 / hurt / dead)', () => {
    const overlay = createSkillOverlayState(gate)
    overlay.cooldownMs = 0
    const events = advanceSkillOverlay(overlay, gate, host, gate.triggerRange - 10, false, 16)
    expect(events).toEqual([])
    expect(overlay.active).toBeNull()
  })

  it('does not trigger when the hero is outside triggerRange', () => {
    const overlay = createSkillOverlayState(gate)
    overlay.cooldownMs = 0
    const events = advanceSkillOverlay(overlay, gate, host, gate.triggerRange + 10, true, 16)
    expect(events).toEqual([])
    expect(overlay.active).toBeNull()
  })

  it('spawns the hit2 hitbox at spawnAtMs, offset by facing, exactly once', () => {
    const overlay = createSkillOverlayState(gate)
    overlay.cooldownMs = 0
    advanceSkillOverlay(overlay, gate, host, gate.triggerRange - 10, true, 0)
    const beforeSpawn = advanceSkillOverlay(overlay, gate, host, 0, false, gate.move.spawnAtMs - 1)
    expect(beforeSpawn).toEqual([])

    const atSpawn = advanceSkillOverlay(overlay, gate, host, 0, false, 2)
    expect(atSpawn).toHaveLength(1)
    expect(atSpawn[0].type).toBe('attack-spawn')
    const spawn = atSpawn[0].spawn!
    expect(spawn.damage).toBe(7)
    expect(spawn.attackKind).toBe('magic')
    expect(spawn.x).toBe(host.x + host.facing * gate.move.attack.offsetX)

    // Only once per cast, even ticking further before it ends.
    const later = advanceSkillOverlay(overlay, gate, host, 0, false, 2)
    expect(later).toEqual([])
  })

  it('emits done at durationMs and clears active so the host can resume its own AI', () => {
    const overlay = createSkillOverlayState(gate)
    overlay.cooldownMs = 0
    advanceSkillOverlay(overlay, gate, host, gate.triggerRange - 10, true, 0)
    const events = advanceSkillOverlay(overlay, gate, host, 0, false, gate.move.durationMs)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect(overlay.active).toBeNull()
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
