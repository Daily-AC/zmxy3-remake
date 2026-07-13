import { describe, expect, it } from 'vitest'
import { centeredBox, overlaps } from '../src/combat/hitbox'
import { horizontalAttackReach, resolveAttackHitbox } from '../src/combat/attackSpec'
import { MONSTER_ATTACKS, monsterAttackSpecFor } from '../src/combat/monsterAttackSpecs'

describe('pure attack geometry', () => {
  it('mirrors one local box across both facings', () => {
    const right = resolveAttackHitbox(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, 1)
    const left = resolveAttackHitbox(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, -1)

    expect(right).toMatchObject({ left: 500, top: 239, right: 660, bottom: 389 })
    expect(left).toMatchObject({ left: 340, top: 239, right: 500, bottom: 389 })
    expect(overlaps(right, centeredBox(505, 335, 46, 92))).toBe(true)
    expect(horizontalAttackReach(MONSTER_ATTACKS.monster7.hit1, 90)).toBe(205)
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
    expect(resolveAttackHitbox(spec!, { x: 500, y: 400 }, 1)).toMatchObject(right)
    expect(resolveAttackHitbox(spec!, { x: 500, y: 400 }, -1)).toMatchObject(left)
  })

  it.each([
    ['monster2', 120],
    ['monster3', 210],
    ['monster4', 200],
    ['monster7', 205],
    ['monster8', 217],
  ])('derives %s engagement reach from its real hit1 box', (species, reach) => {
    const spec = monsterAttackSpecFor(species, 'hit1')
    expect(spec).toBeDefined()
    expect(horizontalAttackReach(spec!, 90)).toBe(reach)
  })

  it('keeps recovered multi-frame timing', () => {
    expect(MONSTER_ATTACKS.monster2.hit1.hitFrameFractions).toEqual([19 / 35, 1])
    expect(MONSTER_ATTACKS.monster3.hit2.hitFrameFractions).toEqual([30 / 31])
  })
})
