import { describe, expect, it } from 'vitest'
import { initMonster } from '../../src/monster/monsterSim'
import { BattleActorRegistry } from '../../src/battle/actorRegistry'
import { makeBattleDefinition } from './fixtures'

function monsterState(x: number) {
  const definition = makeBattleDefinition().monsters.monster30
  return initMonster({
    ...definition,
    tickMs: 1000 / 30,
    rng: () => 0,
  }, x, 400)
}

describe('BattleActorRegistry', () => {
  it('assigns deterministic encounter-scoped spawn IDs', () => {
    const registry = new BattleActorRegistry()

    expect(registry.spawnMonster('sl11', 'continuous-0', 'monster30', monsterState(100)))
      .toBe('sl11:continuous-0:monster30:0000')
    expect(registry.spawnMonster('sl11', 'continuous-0', 'monster30', monsterState(200)))
      .toBe('sl11:continuous-0:monster30:0001')
    expect(registry.spawnMonster('sl11', 'boss', 'owl', monsterState(300)))
      .toBe('sl11:boss:owl:0000')
  })

  it('iterates records in stable actor ID order', () => {
    const registry = new BattleActorRegistry()
    registry.spawnMonster('sl11', 'z-wave', 'monster30', monsterState(300))
    registry.spawnMonster('sl11', 'a-wave', 'monster30', monsterState(100))

    expect(registry.records().map((record) => record.encounterId)).toEqual(['a-wave', 'z-wave'])
  })

  it('counts only living actors owned by an encounter', () => {
    const registry = new BattleActorRegistry()
    const living = registry.spawnMonster('sl11', 'wave', 'monster30', monsterState(100))
    const dead = registry.spawnMonster('sl11', 'wave', 'monster30', monsterState(200))
    registry.spawnMonster('sl11', 'other', 'monster30', monsterState(300))
    registry.get(dead)!.simulation.mode = 'dead'

    expect(registry.livingCount('wave')).toBe(1)
    expect(registry.get(living)?.simulation.x).toBe(100)
  })

  it('removes gone actors in stable order', () => {
    const registry = new BattleActorRegistry()
    const second = registry.spawnMonster('sl11', 'z-wave', 'monster30', monsterState(200))
    const first = registry.spawnMonster('sl11', 'a-wave', 'monster30', monsterState(100))
    registry.get(first)!.simulation.mode = 'gone'
    registry.get(second)!.simulation.mode = 'gone'

    expect(registry.removeGone()).toEqual([first, second])
    expect(registry.records()).toEqual([])
  })

  it('restores records and the next spawn ordinal from plain state', () => {
    const original = new BattleActorRegistry()
    original.spawnMonster('sl11', 'continuous-0', 'monster30', monsterState(100))
    const exported = original.exportState()
    const restored = BattleActorRegistry.restore(exported)

    exported.monsters[0].simulation.x = 999
    expect(restored.records()[0].simulation.x).toBe(100)
    expect(restored.spawnMonster('sl11', 'continuous-0', 'monster30', monsterState(200)))
      .toBe('sl11:continuous-0:monster30:0001')
  })

  it('rejects malformed identity parts and duplicate restored IDs', () => {
    const registry = new BattleActorRegistry()
    expect(() => registry.spawnMonster('sl:11', 'wave', 'monster30', monsterState(100))).toThrow(/levelId/)

    const id = registry.spawnMonster('sl11', 'wave', 'monster30', monsterState(100))
    const state = registry.exportState()
    state.monsters.push({ ...state.monsters[0], id })
    expect(() => BattleActorRegistry.restore(state)).toThrow(/duplicate/)
  })
})
