import { describe, expect, it } from 'vitest'
import { stableHash } from '../../src/replay/stableHash'
import { BattleRuntime } from '../../src/battle/runtime'
import { makeBattleDefinition } from './fixtures'

describe('BattleRuntime checkpoint', () => {
  it('restores dynamic actors, queued commands, RNG, and spawn ordinals', () => {
    const original = new BattleRuntime(makeBattleDefinition())
    original.step(90)
    original.enqueue({ type: 'press-right', actorId: 'hero-1', sequence: 1, atTick: 100 })
    const checkpoint = original.createCheckpoint()
    const restored = BattleRuntime.restore(checkpoint)

    expect(restored.getSnapshot()).toEqual(original.getSnapshot())
    expect(stableHash(restored.getDeterministicState())).toBe(stableHash(original.getDeterministicState()))

    const originalEvents = original.step(200)
    const restoredEvents = restored.step(200)
    expect(restoredEvents).toEqual(originalEvents)
    expect(restored.getSnapshot()).toEqual(original.getSnapshot())
    expect(stableHash(restored.getDeterministicState())).toBe(stableHash(original.getDeterministicState()))
    expect(restored.getSnapshot().actors.some((actor) => actor.id.endsWith(':0002'))).toBe(true)
  })

  it('owns checkpoint data and rejects corruption', () => {
    const runtime = new BattleRuntime(makeBattleDefinition())
    const checkpoint = runtime.createCheckpoint()
    const restored = BattleRuntime.restore(checkpoint)
    checkpoint.hash = '00000000'

    expect(restored.getSnapshot()).toEqual(runtime.getSnapshot())
    expect(() => BattleRuntime.restore(checkpoint)).toThrow(/hash/)
  })

  it('restores MP, shared cooldown, and an in-flight skill action', () => {
    const definition = makeBattleDefinition()
    definition.hero.skills.slz = {
      id: 'slz', action: 'hit6', learnedLevel: 1, mpCost: 36,
      durationTicks: 20, cooldownTicks: 20, hitTick: 4,
      hitbox: { forward: 30, y: 0, width: 170, height: 150 },
      damage: 200, attackKind: 'physics',
    }
    const original = new BattleRuntime(definition)
    original.enqueue({ type: 'press-skill', skillId: 'slz', actorId: 'hero-1', sequence: 1, atTick: 1 })
    original.step(2)
    const restored = BattleRuntime.restore(original.createCheckpoint())

    expect(restored.getSnapshot().heroSkill).toEqual(original.getSnapshot().heroSkill)
    expect(restored.getSnapshot().heroSkill).toMatchObject({ mp: 14, activeSkillId: 'slz' })
    expect(restored.step(25)).toEqual(original.step(25))
    expect(stableHash(restored.getDeterministicState())).toBe(stableHash(original.getDeterministicState()))
  })
})
