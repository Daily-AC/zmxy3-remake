import { describe, it, expect } from 'vitest'
import {
  createHeroIdentity,
  heroBaseStats,
  heroStats,
  heroTotalAtk,
  heroTotalDef,
  gainHeroExp,
  damageHero,
  updateHeroIdentity,
  isHeroDead,
} from '../src/systems/heroIdentity'
import { getLevelStats, getExpToNextLevel } from '../src/systems/progression'
import { HeroCombatTuning } from '../src/systems/heroCombat'
import { createEquipment } from '../src/systems/equipment'
import type { Equipment } from '../src/systems/equipment'
import type { Item } from '../src/systems/items'

const bounds = { minX: 0, maxX: 2000 }

function weapon(atk: number, def = 0): Item {
  return {
    id: 'w1',
    name: 'test',
    kind: 'equip',
    rarity: 1,
    effects: [
      { type: 'stat', stat: 'atk', value: atk },
      { type: 'stat', stat: 'def', value: def },
    ],
  }
}

function armed(atk: number, def = 0): Equipment {
  const eq = createEquipment()
  eq.weapon = weapon(atk, def)
  return eq
}

describe('heroIdentity (统一身份宿主：三系统挂靠)', () => {
  it('seeds hp/maxHp/mp from the level curve, full at creation', () => {
    const id = createHeroIdentity(1)
    const lvl1 = getLevelStats(1, 1)
    expect(id.combat.maxHp).toBe(lvl1.maxHp)
    expect(id.combat.hp).toBe(lvl1.maxHp)
    expect(id.maxMp).toBe(lvl1.maxMp)
    expect(id.mp).toBe(lvl1.maxMp)
    // The level curve overrides heroCombat's own default pool.
    expect(id.combat.maxHp).not.toBe(HeroCombatTuning.maxHp)
  })

  it('atk/def = level base + equipment stat effects', () => {
    const id = createHeroIdentity(1)
    const base = heroBaseStats(id)
    expect(heroTotalAtk(id, createEquipment())).toBe(base.atk)
    expect(heroTotalAtk(id, armed(45))).toBe(base.atk + 45)
    expect(heroTotalDef(id, armed(0, 12))).toBe(base.def + 12)
  })

  it('heroStats sums all equipped stat effects onto the level base', () => {
    const id = createHeroIdentity(1)
    const s = heroStats(id, armed(10, 5))
    const base = heroBaseStats(id)
    expect(s.atk).toBe(base.atk + 10)
    expect(s.def).toBe(base.def + 5)
  })

  it('gainExp levels up and grows the pools, healing the growth delta', () => {
    const id = createHeroIdentity(1)
    // Take a chip of damage so the level-up heal is observable.
    damageHero(id, { sourceId: 'm', attackId: 1, damage: 20, knockbackX: 0 }, 100)
    const hpAfterHit = id.combat.hp
    const before = getLevelStats(1, 1)
    const need = getExpToNextLevel(1)

    const result = gainHeroExp(id, need)
    expect(result.levelsGained).toBe(1)
    expect(id.progression.level).toBe(2)
    const after = getLevelStats(1, 2)
    expect(id.combat.maxHp).toBe(after.maxHp)
    // Healed by exactly the maxHp growth (still below the new cap here).
    expect(id.combat.hp).toBe(hpAfterHit + (after.maxHp - before.maxHp))
    expect(id.maxMp).toBe(after.maxMp)
  })

  it('level-up heal never overflows the new maxHp', () => {
    const id = createHeroIdentity(1) // full HP
    gainHeroExp(id, getExpToNextLevel(1))
    expect(id.combat.hp).toBe(id.combat.maxHp)
  })

  it('a lethal hit kills; auto-respawn refills to the current maxHp', () => {
    const id = createHeroIdentity(1)
    const lethal = id.combat.maxHp + 5
    const events = damageHero(id, { sourceId: 'm', attackId: 1, damage: lethal, knockbackX: 0 }, 1000)
    expect(events).toEqual([{ type: 'death' }])
    expect(isHeroDead(id)).toBe(true)

    const pos = { x: 500 }
    // Not yet due.
    expect(updateHeroIdentity(id, pos, bounds, 1000 + 100, 16, 480)).toEqual([])
    // Past the respawn delay.
    const respawn = updateHeroIdentity(
      id,
      pos,
      bounds,
      1000 + HeroCombatTuning.respawnDelayMs,
      16,
      480,
    )
    expect(respawn).toEqual([{ type: 'respawn' }])
    expect(isHeroDead(id)).toBe(false)
    expect(id.combat.hp).toBe(id.combat.maxHp)
    expect(pos.x).toBe(480)
  })

  it('a dead hero leveling up does not resurrect or refill mid-death', () => {
    const id = createHeroIdentity(1)
    damageHero(id, { sourceId: 'm', attackId: 1, damage: id.combat.maxHp + 1, knockbackX: 0 }, 1000)
    expect(isHeroDead(id)).toBe(true)
    gainHeroExp(id, getExpToNextLevel(1))
    // Pool grew, but the corpse's hp stays 0 until respawn.
    expect(id.combat.hp).toBe(0)
    expect(id.combat.maxHp).toBe(getLevelStats(1, 2).maxHp)
  })
})
