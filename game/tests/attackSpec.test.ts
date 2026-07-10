import { describe, expect, it } from 'vitest'
import { MONSTER_ATTACKS, monsterAttackSpecFor, resolveAttackSpec } from '../src/systems/attackSpec'
import { centeredBox, overlaps } from '../src/systems/hitbox'

describe('AttackSpec world resolution', () => {
  it('uses the same facing transform for the effect and damage box', () => {
    const resolved = resolveAttackSpec(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, -1)

    expect(resolved.effect?.x).toBe(420)
    expect(resolved.hitbox.right).toBeLessThanOrEqual(500)
    expect(overlaps(resolved.hitbox, centeredBox(445, 330, 40, 80))).toBe(true)
  })

  it('can hit an overlapping hero even after the hero crosses the registration point', () => {
    const resolved = resolveAttackSpec(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, 1)

    expect(overlaps(resolved.hitbox, centeredBox(505, 335, 46, 92))).toBe(true)
  })

  it('keeps the exact L1 effect attachment offsets from the monster classes', () => {
    expect(MONSTER_ATTACKS.monster3.hit1.effect?.offset).toEqual({ forward: 105, y: -60 })
    expect(MONSTER_ATTACKS.monster3.hit2.effect?.offset).toEqual({ forward: 155, y: -30 })
    expect(MONSTER_ATTACKS.monster7.hit1.effect?.offset).toEqual({ forward: 80, y: -86 })
    expect(MONSTER_ATTACKS.monster8.hit1.effect?.offset).toEqual({ forward: 97, y: -85 })
    expect(MONSTER_ATTACKS.monster8.hit2.effect?.offset).toEqual({ forward: 46, y: -30 })
    expect(MONSTER_ATTACKS.monster30.hit1.effect?.offset).toEqual({ forward: 0, y: 0 })
  })

  it.each([
    ['monster2', { left: 500, top: 325, right: 575, bottom: 475 }, { left: 425, top: 325, right: 500, bottom: 475 }],
    ['monster3', { left: 545, top: 295, right: 665, bottom: 385 }, { left: 335, top: 295, right: 455, bottom: 385 }],
    ['monster4', { left: 500, top: 325, right: 655, bottom: 475 }, { left: 345, top: 325, right: 500, bottom: 475 }],
    ['monster5', { left: 500, top: 325, right: 655, bottom: 475 }, { left: 345, top: 325, right: 500, bottom: 475 }],
    ['monster7', { left: 500, top: 239, right: 660, bottom: 389 }, { left: 340, top: 239, right: 500, bottom: 389 }],
    ['monster8', { left: 522, top: 240, right: 672, bottom: 390 }, { left: 328, top: 240, right: 478, bottom: 390 }],
    ['monster30', { left: 500, top: 400, right: 500, bottom: 400 }, { left: 500, top: 400, right: 500, bottom: 400 }],
  ])('locks %s hit1 world bounds for both facings', (species, right, left) => {
    const spec = monsterAttackSpecFor(species, 'hit1')
    expect(spec).toBeDefined()
    expect(resolveAttackSpec(spec!, { x: 500, y: 400 }, 1).hitbox).toMatchObject(right)
    expect(resolveAttackSpec(spec!, { x: 500, y: 400 }, -1).hitbox).toMatchObject(left)
  })

  it.each([
    MONSTER_ATTACKS.monster3.hit1,
    MONSTER_ATTACKS.monster3.hit2,
    MONSTER_ATTACKS.monster7.hit1,
    MONSTER_ATTACKS.monster8.hit1,
    MONSTER_ATTACKS.monster8.hit2,
    MONSTER_ATTACKS.monster30.hit1,
  ])('uses one local transform for $effect.action effect and hitbox centers', (spec) => {
    for (const facing of [-1, 1] as const) {
      const resolved = resolveAttackSpec(spec, { x: 500, y: 400 }, facing)
      expect(resolved.effect?.x).toBe(resolved.hitbox.x + resolved.hitbox.w / 2)
      expect(resolved.effect?.y).toBe(resolved.hitbox.y + resolved.hitbox.h / 2)
    }
  })

  it('matches Monster3 hit2 timing to the overlay spawn at 30 of 31 ticks', () => {
    expect(MONSTER_ATTACKS.monster3.hit2.hitFrameFraction).toBe(30 / 31)
  })
})
