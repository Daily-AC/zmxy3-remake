import { describe, it, expect } from 'vitest'
import { computeCombatPower } from '../src/systems/combatPower'

describe('computeCombatPower (战斗力, ported terms of export.pack.BackPack.as getFightingForce)', () => {
  it('level-only term matches AS3 uint(level * 15)', () => {
    expect(computeCombatPower(1, 0)).toBe(15)
    expect(computeCombatPower(31, 0)).toBe(465)
  })

  it('adds the equipped-atk bonus term on top of the level term', () => {
    expect(computeCombatPower(31, 200)).toBe(31 * 15 + 200)
  })

  it('floors fractional inputs and never goes negative', () => {
    expect(computeCombatPower(10.9, 5.9)).toBe(10 * 15 + 5)
    expect(computeCombatPower(-3, -10)).toBe(0)
  })
})
