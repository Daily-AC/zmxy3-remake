import { describe, expect, it } from 'vitest'
import { BattleRuntime } from '../../src/battle/runtime'
import { createBattleRecording, replayBattle } from '../../src/battle/replay'
import { stableHash } from '../../src/replay/stableHash'
import { makeBattleDefinition } from './fixtures'

function lootDefinition() {
  const definition = makeBattleDefinition()
  definition.monsters.monster30.stats.hp = 1
  definition.monsters.monster30.loot = [{
    chance: 1,
    choices: [{
      lootId: 'item.chapter1.test-ore',
      weight: 1,
      quantity: { min: 2, max: 2 },
    }],
  }]
  definition.level.lootPhysics = {
    gravityPerTick: 100,
    spawnOffsetY: -100,
    pickupRadius: 150,
    retryDelayTicks: 30,
  }
  definition.level.heroSpawn = { x: 100, y: 400 }
  definition.hero.spawn = { x: 100, y: 400 }
  const encounter = definition.level.encounters[0]
  if (encounter.kind !== 'continuous') throw new Error('expected continuous fixture')
  encounter.trigger.atOrAboveY = 400
  encounter.trigger.boss.x = 100
  encounter.trigger.boss.y = 400
  return definition
}

const attack = { type: 'press-attack', actorId: 'hero-1', sequence: 1, atTick: 1 } as const
const accept = {
  type: 'resolve-loot-pickup',
  actorId: 'battle-authority',
  sequence: 2,
  atTick: 2,
  lootEntityId: 'sl11:loot:0000',
  requestId: 'sl11:loot:0000:pickup:0001',
  acceptedQuantity: 2,
} as const

describe('BattleRuntime loot transactions', () => {
  it('rolls, lands, and requests pickup without deleting loot before confirmation', () => {
    const runtime = new BattleRuntime(lootDefinition())
    runtime.enqueue(attack)

    const events = runtime.step()

    expect(events).toContainEqual(expect.objectContaining({
      type: 'loot-spawned',
      loot: expect.objectContaining({
        id: 'sl11:loot:0000',
        lootId: 'item.chapter1.test-ore',
        quantity: 2,
      }),
    }))
    expect(events).toContainEqual(expect.objectContaining({
      type: 'loot-pickup-requested',
      requestId: 'sl11:loot:0000:pickup:0001',
      quantity: 2,
    }))
    expect(runtime.getSnapshot().loot).toEqual([
      expect.objectContaining({ state: 'pending', quantity: 2 }),
    ])
  })

  it('rejects a stale resolution, then removes only the quantity accepted by the host', () => {
    const runtime = new BattleRuntime(lootDefinition())
    runtime.enqueue(attack)
    runtime.step()
    runtime.enqueue({ ...accept, requestId: 'wrong' })
    expect(runtime.step()).toContainEqual(expect.objectContaining({
      type: 'command-rejected', reason: 'invalid-loot-resolution',
    }))
    expect(runtime.getSnapshot().loot[0].quantity).toBe(2)

    runtime.enqueue({ ...accept, sequence: 3, atTick: 3, acceptedQuantity: 1 })
    expect(runtime.step()).toContainEqual(expect.objectContaining({
      type: 'loot-pickup-resolved', acceptedQuantity: 1, remainingQuantity: 1,
    }))
    expect(runtime.getSnapshot().loot).toEqual([
      expect.objectContaining({ state: 'grounded', quantity: 1, nextRequestTick: 33 }),
    ])
  })

  it('restores a pending transaction and replays its confirmation deterministically', () => {
    const original = new BattleRuntime(lootDefinition())
    original.enqueue(attack)
    original.step()
    const restored = BattleRuntime.restore(original.createCheckpoint())
    original.enqueue(accept)
    restored.enqueue(accept)

    expect(restored.step()).toEqual(original.step())
    expect(restored.getSnapshot()).toEqual(original.getSnapshot())
    expect(stableHash(restored.getDeterministicState())).toBe(stableHash(original.getDeterministicState()))

    const recording = createBattleRecording(lootDefinition(), [attack, accept], 20)
    expect(recording.events).toContainEqual(expect.objectContaining({
      type: 'loot-pickup-resolved', acceptedQuantity: 2, remainingQuantity: 0,
    }))
    expect(replayBattle(recording).verified).toBe(true)
  })

  it('applies a host-confirmed resource restore with max-resource clamping', () => {
    const definition = lootDefinition()
    definition.hero.maxHp = 100
    definition.hero.maxMp = 50
    const runtime = new BattleRuntime(definition)
    runtime.enqueue(attack)
    runtime.step()
    runtime.enqueue({ ...accept, resourceRestore: { hp: 999, mp: 999 } })

    expect(runtime.step()).toContainEqual(expect.objectContaining({
      type: 'hero-resource-restored', hpAfter: 100, mpAfter: 50,
    }))
  })
})
