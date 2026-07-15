import { describe, expect, it } from 'vitest'
import {
  castBattleSkill,
  consumeBattleSkillHit,
  createBattleSkillState,
  finishExpiredBattleSkill,
  type BattleSkillDefinition,
} from '../../src/battle/skill'

const slz: BattleSkillDefinition = {
  id: 'slz',
  action: 'hit6',
  learnedLevel: 1,
  mpCost: 36,
  durationTicks: 20,
  cooldownTicks: 20,
  hitTick: 1,
  hitbox: { forward: 30, y: 40, width: 170, height: 150 },
  damage: 732,
  attackKind: 'physics',
}

describe('battle skills', () => {
  it('spends MP, arms the shared cooldown, and emits one deterministic hit', () => {
    const state = createBattleSkillState(50)
    const result = castBattleSkill(state, slz, 10, 7)

    expect(result).toMatchObject({ ok: true, mpBefore: 50, mpAfter: 14 })
    expect(state.cooldownUntilTick).toBe(30)
    expect(consumeBattleSkillHit(state, 10)).toBeNull()
    expect(consumeBattleSkillHit(state, 11)).toMatchObject({ skillId: 'slz', attackId: 7 })
    expect(consumeBattleSkillHit(state, 12)).toBeNull()
  })

  it('rejects unlearned, insufficient, cooldown, and active casts without extra spending', () => {
    const unlearned = { ...slz, learnedLevel: 0 }
    expect(castBattleSkill(createBattleSkillState(50), unlearned, 1, 1)).toEqual({ ok: false, reason: 'not-learned' })
    expect(castBattleSkill(createBattleSkillState(35), slz, 1, 1)).toEqual({ ok: false, reason: 'insufficient-resource' })
    const state = createBattleSkillState(100)
    expect(castBattleSkill(state, slz, 1, 1).ok).toBe(true)
    expect(castBattleSkill(state, slz, 2, 2)).toEqual({ ok: false, reason: 'busy' })
    finishExpiredBattleSkill(state, 21)
    expect(castBattleSkill(state, slz, 20, 2)).toEqual({ ok: false, reason: 'cooldown' })
    expect(state.mp).toBe(64)
  })

  it('clears the active action exactly at its deterministic end tick', () => {
    const state = createBattleSkillState(50)
    castBattleSkill(state, slz, 4, 1)

    finishExpiredBattleSkill(state, 23)
    expect(state.active).not.toBeNull()
    finishExpiredBattleSkill(state, 24)
    expect(state.active).toBeNull()
  })
})
