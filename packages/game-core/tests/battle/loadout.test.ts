import { describe, expect, it } from 'vitest'
import { stableHash } from '../../src/replay/stableHash'
import { BATTLE_AUTHORITY_ID } from '../../src/battle/loot'
import { BattleRuntime } from '../../src/battle/runtime'
import type { BattleHeroLoadout } from '../../src/battle/types'
import { makeBattleDefinition } from './fixtures'

function upgradedLoadout(runtime: BattleRuntime): BattleHeroLoadout {
  const current = runtime.getSnapshot().heroLoadout
  return {
    ...current,
    maxHp: current.maxHp + 40,
    maxMp: current.maxMp + 20,
    atk: current.atk + 70,
    def: current.def + 11,
    equipment: {
      weaponItemId: 'whg',
      armorItemId: 'ptdxzf',
      weaponShowId: 2,
    },
    skills: Object.fromEntries(Object.entries(current.skills).map(([id, skill]) => [
      id,
      { ...skill, damage: skill.damage + 70 },
    ])),
  }
}

describe('BattleRuntime authoritative hero loadout', () => {
  it('atomically applies combat stats, equipment, skills, and pool deltas', () => {
    const runtime = new BattleRuntime(makeBattleDefinition())
    const before = runtime.getSnapshot()
    const loadout = upgradedLoadout(runtime)
    runtime.enqueue({
      type: 'apply-hero-loadout', transactionId: 'equip-1', actorId: BATTLE_AUTHORITY_ID, sequence: 1, atTick: 1, loadout,
    })

    const events = runtime.step()
    const after = runtime.getSnapshot()
    expect(events).toContainEqual({
      type: 'hero-loadout-applied', tick: 1,
      transactionId: 'equip-1',
      equipment: loadout.equipment,
      hpBefore: before.actors[0].hp,
      hpAfter: before.actors[0].hp + 40,
      maxHpBefore: before.actors[0].maxHp,
      maxHpAfter: loadout.maxHp,
      mpBefore: before.heroSkill.mp,
      mpAfter: before.heroSkill.mp + 20,
      maxMpBefore: before.heroSkill.maxMp,
      maxMpAfter: loadout.maxMp,
    })
    expect(after.heroLoadout).toEqual(loadout)
    expect(after.heroEquipment).toEqual(loadout.equipment)
    expect(after.actors[0]).toMatchObject({ hp: loadout.maxHp, maxHp: loadout.maxHp })
    expect(after.heroSkill).toMatchObject({ mp: loadout.maxMp, maxMp: loadout.maxMp })
  })

  it('rejects player-authored and malformed loadout changes', () => {
    const runtime = new BattleRuntime(makeBattleDefinition())
    const loadout = upgradedLoadout(runtime)
    runtime.enqueue({ type: 'apply-hero-loadout', transactionId: 'equip-1', actorId: 'hero-1', sequence: 1, atTick: 1, loadout })
    runtime.enqueue({
      type: 'apply-hero-loadout', transactionId: 'equip-2', actorId: BATTLE_AUTHORITY_ID, sequence: 1, atTick: 2,
      loadout: { ...loadout, maxHp: -1 },
    })

    expect(runtime.step(2).map((event) => event.type === 'command-rejected' ? event.reason : event.type))
      .toEqual(['unknown-actor', 'invalid-hero-loadout'])
    expect(runtime.getSnapshot().heroEquipment.weaponItemId).toBeNull()
  })

  it('preserves a queued hot loadout through checkpoint restore', () => {
    const original = new BattleRuntime(makeBattleDefinition())
    original.enqueue({
      type: 'apply-hero-loadout', transactionId: 'equip-1', actorId: BATTLE_AUTHORITY_ID, sequence: 1, atTick: 4,
      loadout: upgradedLoadout(original),
    })
    original.step(2)
    const restored = BattleRuntime.restore(original.createCheckpoint())

    expect(restored.step(3)).toEqual(original.step(3))
    expect(restored.getSnapshot()).toEqual(original.getSnapshot())
    expect(stableHash(restored.getDeterministicState())).toBe(stableHash(original.getDeterministicState()))
  })
})
