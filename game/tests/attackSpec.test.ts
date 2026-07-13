import { describe, expect, it } from 'vitest'
import { MONSTER_ATTACKS, resolveAttackSpec } from '../src/systems/attackSpec'

describe('AttackSpec presentation attachments', () => {
  it('keeps the exact L1 effect attachment offsets from the monster classes', () => {
    expect(MONSTER_ATTACKS.monster3.hit1.effect?.offset).toEqual({ forward: 105, y: -60 })
    expect(MONSTER_ATTACKS.monster3.hit2.effect?.offset).toEqual({ forward: 155, y: -30 })
    expect(MONSTER_ATTACKS.monster7.hit1.effect?.offset).toEqual({ forward: 80, y: -86 })
    expect(MONSTER_ATTACKS.monster8.hit1.effect?.offset).toEqual({ forward: 97, y: -85 })
    expect(MONSTER_ATTACKS.monster8.hit2.effect?.offset).toEqual({ forward: 46, y: -30 })
    expect(MONSTER_ATTACKS.monster30.hit1.effect?.offset).toEqual({ forward: 0, y: 0 })
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
})
