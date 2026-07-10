import { describe, expect, it } from 'vitest'
import { MONSTER_ATTACKS, resolveAttackSpec } from '../src/systems/attackSpec'
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
})
