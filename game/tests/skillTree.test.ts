import { describe, it, expect } from 'vitest'
import {
  ROLE1_SCHOOLS,
  SCHOOL_UPGRADE_COST,
  SKILL_LEARN_LIMIT,
  MAX_SCHOOL_LEVEL,
  MAX_SKILL_LEVEL,
  BIND_KEYS,
  createEmptySkillTreeState,
  createDefaultSkillTreeState,
  getUnlockedSlotCount,
  getSchoolUpgradeCost,
  canUpgradeSchool,
  upgradeSchool,
  totalLearnedCount,
  isSkillLearned,
  canLearnSkill,
  learnSkill,
  getSkillUpgradeCost,
  getSkillLevelRequirement,
  canUpgradeSkillLevel,
  upgradeSkillLevel,
  getBindings,
  keyForSkill,
  rebindSkill,
  getLearnedLevel,
} from '../src/systems/skillTree'
import { createSoulPurse } from '../src/systems/soulPurse'

describe('skillTree config (Config.as:263 allSklName[0..1], roleid 1)', () => {
  it('has the two Role1 schools with 5 skills each, matching AS3 order', () => {
    expect(ROLE1_SCHOOLS[0]).toEqual({ name: '斩系心法', skills: ['slz', 'zz', 'sx', 'qsez', 'hmz'] })
    expect(ROLE1_SCHOOLS[1]).toEqual({ name: '火系心法', skills: ['lys', 'hytj', 'lyfb', 'jdy', 'hyjj'] })
  })

  it('school upgrade costs match SkillControl.as findNextNeedLHValue', () => {
    expect(SCHOOL_UPGRADE_COST).toEqual([100, 200, 500, 1000, 2000])
  })

  it('learn limit is 5 (User.as setSkillLimit(5)), not kagami\'s 10', () => {
    expect(SKILL_LEARN_LIMIT).toBe(5)
  })

  it('max skill level is 9 for every skill (SkillControl.as slev<9), not kagami\'s 18/9 split', () => {
    expect(MAX_SKILL_LEVEL).toBe(9)
  })

  it('bind key order is Y U I O L (User.as findWhichSkillBtnNoneSet, controlPlayer 0)', () => {
    expect(BIND_KEYS).toEqual(['Y', 'U', 'I', 'O', 'L'])
  })
})

describe('createDefaultSkillTreeState (legacy-save / fresh-character fallback)', () => {
  it('has slz/lys/hytj/lyfb/jdy learned at level 1 and bound to Y/U/I/O/L', () => {
    const state = createDefaultSkillTreeState()
    expect(getBindings(state)).toEqual({ Y: 'slz', U: 'lys', I: 'hytj', O: 'lyfb', L: 'jdy' })
    expect(getLearnedLevel(state, 'slz')).toBe(1)
    expect(getLearnedLevel(state, 'lys')).toBe(1)
    expect(getLearnedLevel(state, 'hytj')).toBe(1)
    expect(getLearnedLevel(state, 'lyfb')).toBe(1)
    expect(getLearnedLevel(state, 'jdy')).toBe(1)
    expect(getLearnedLevel(state, 'qsez')).toBe(0)
    expect(getLearnedLevel(state, 'sx')).toBe(0)
    expect(totalLearnedCount(state)).toBe(5)
  })

  it('school levels are exactly enough to have unlocked those 5 slots', () => {
    const state = createDefaultSkillTreeState()
    expect(state.schools[0].level).toBe(1) // unlocks slz only
    expect(state.schools[1].level).toBe(4) // unlocks lys/hytj/lyfb/jdy
    expect(getUnlockedSlotCount(state.schools[0].level)).toBe(1)
    expect(getUnlockedSlotCount(state.schools[1].level)).toBe(4)
  })
})

describe('school unlock/upgrade', () => {
  it('getUnlockedSlotCount is the level itself, clamped to [0,5]', () => {
    expect(getUnlockedSlotCount(0)).toBe(0)
    expect(getUnlockedSlotCount(3)).toBe(3)
    expect(getUnlockedSlotCount(5)).toBe(5)
    expect(getUnlockedSlotCount(9)).toBe(5)
    expect(getUnlockedSlotCount(-1)).toBe(0)
  })

  it('getSchoolUpgradeCost follows the AS3 table and is undefined at max level', () => {
    expect(getSchoolUpgradeCost(0)).toBe(100)
    expect(getSchoolUpgradeCost(4)).toBe(2000)
    expect(getSchoolUpgradeCost(5)).toBeUndefined()
  })

  it('canUpgradeSchool/upgradeSchool spend souls and bump level', () => {
    const state = createEmptySkillTreeState()
    const purse = createSoulPurse(150)
    expect(canUpgradeSchool(state, 0, purse.value)).toBe(true)
    expect(upgradeSchool(state, 0, purse)).toBe(true)
    expect(state.schools[0].level).toBe(1)
    expect(purse.value).toBe(50)
    // Next upgrade costs 200, can't afford with 50 left.
    expect(canUpgradeSchool(state, 0, purse.value)).toMatch(/需要200灵魂/)
    expect(upgradeSchool(state, 0, purse)).toBe(false)
    expect(state.schools[0].level).toBe(1) // unchanged
    expect(purse.value).toBe(50) // unchanged (no partial spend)
  })

  it('refuses to upgrade past MAX_SCHOOL_LEVEL', () => {
    const state = createEmptySkillTreeState()
    const purse = createSoulPurse(1_000_000)
    for (let i = 0; i < MAX_SCHOOL_LEVEL; i++) expect(upgradeSchool(state, 1, purse)).toBe(true)
    expect(state.schools[1].level).toBe(MAX_SCHOOL_LEVEL)
    expect(canUpgradeSchool(state, 1, purse.value)).toBe('心法等级已达上限')
    expect(upgradeSchool(state, 1, purse)).toBe(false)
  })
})

describe('learning (SkillControl.as buy())', () => {
  it('cannot learn a skill in a locked slot', () => {
    const state = createEmptySkillTreeState()
    expect(canLearnSkill(state, 0, 0)).toMatch(/未解锁/)
    expect(learnSkill(state, 0, 0)).toBeUndefined()
  })

  it('learning costs no souls and auto-binds to the first free Y/U/I/O/L key', () => {
    const state = createEmptySkillTreeState()
    const purse = createSoulPurse(100)
    state.schools[0].level = 1 // unlocks slz
    const learned = learnSkill(state, 0, 0)
    expect(learned).toBe('slz')
    expect(purse.value).toBe(100) // untouched -- learning is free
    expect(isSkillLearned(state, 'slz')).toBe(true)
    expect(keyForSkill(state, 'slz')).toBe('Y') // first in AUTO_BIND_ORDER
    expect(getLearnedLevel(state, 'slz')).toBe(1)
  })

  it('auto-binds subsequent learns to the next free key in Y U I O L order', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 5
    state.schools[1].level = 5
    learnSkill(state, 0, 0) // slz -> Y
    learnSkill(state, 0, 1) // zz -> U
    learnSkill(state, 0, 2) // sx -> I
    learnSkill(state, 0, 3) // qsez -> O
    learnSkill(state, 0, 4) // hmz -> L
    expect(getBindings(state)).toEqual({ Y: 'slz', U: 'zz', I: 'sx', O: 'qsez', L: 'hmz' })
    // 6th learn hits the total cap before it hits an unlock gate.
    expect(canLearnSkill(state, 1, 0)).toMatch(/只能学习5个技能/)
    expect(learnSkill(state, 1, 0)).toBeUndefined()
  })

  it('cannot learn the same skill twice', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 1
    learnSkill(state, 0, 0)
    expect(canLearnSkill(state, 0, 0)).toMatch(/已学习/)
  })

  it('sx is a completely normal learnable school-tree skill (not special-cased)', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 3 // unlocks slz/zz/sx
    expect(canLearnSkill(state, 0, 2)).toBe(true)
    expect(learnSkill(state, 0, 2)).toBe('sx')
  })
})

describe('per-skill level-up (SkillControl.as skillupgradeFunc/mOver)', () => {
  it('getSkillUpgradeCost follows 150*L^2*sqrt(L), not kagami\'s exponential curve', () => {
    expect(getSkillUpgradeCost(1)).toBe(150) // 150*1*1*1
    expect(getSkillUpgradeCost(2)).toBe(Math.floor(150 * 4 * Math.SQRT2))
    expect(getSkillUpgradeCost(8)).toBe(Math.floor(150 * 64 * Math.sqrt(8)))
  })

  it('getSkillLevelRequirement is currentLevel*5 uniformly (no special x10)', () => {
    expect(getSkillLevelRequirement(1)).toBe(5)
    expect(getSkillLevelRequirement(4)).toBe(20)
  })

  it('rejects upgrading an unlearned skill', () => {
    const state = createEmptySkillTreeState()
    expect(canUpgradeSkillLevel(state, 'slz', 99, 999999)).toMatch(/未学习/)
  })

  it('gates on hero level and soul cost, then spends and bumps level', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 1
    learnSkill(state, 0, 0) // slz level 1
    const purse = createSoulPurse(1000)
    // level 1 -> 2 needs heroLevel >= 5.
    expect(canUpgradeSkillLevel(state, 'slz', 4, purse.value)).toMatch(/需要5级/)
    expect(upgradeSkillLevel(state, 'slz', 4, purse)).toBe(false)
    expect(canUpgradeSkillLevel(state, 'slz', 5, purse.value)).toBe(true)
    expect(upgradeSkillLevel(state, 'slz', 5, purse)).toBe(true)
    expect(getLearnedLevel(state, 'slz')).toBe(2)
    expect(purse.value).toBe(1000 - 150)
  })

  it('refuses to upgrade past MAX_SKILL_LEVEL (9)', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 1
    learnSkill(state, 0, 0)
    const purse = createSoulPurse(10_000_000)
    for (let lvl = 1; lvl < MAX_SKILL_LEVEL; lvl++) {
      expect(upgradeSkillLevel(state, 'slz', 999, purse)).toBe(true)
    }
    expect(getLearnedLevel(state, 'slz')).toBe(MAX_SKILL_LEVEL)
    expect(canUpgradeSkillLevel(state, 'slz', 999, purse.value)).toBe('技能等级已达上限')
    expect(upgradeSkillLevel(state, 'slz', 999, purse)).toBe(false)
  })

  it('rejects on insufficient souls without partial spend', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 1
    learnSkill(state, 0, 0)
    const purse = createSoulPurse(10) // cost is 150 at level 1
    expect(canUpgradeSkillLevel(state, 'slz', 99, purse.value)).toBe('灵魂不足')
    expect(upgradeSkillLevel(state, 'slz', 99, purse)).toBe(false)
    expect(purse.value).toBe(10)
  })
})

describe('rebindSkill (Adapted clean swap, see file header re: AS3 duplicate-entry bug)', () => {
  it('swaps two bound skills\' keys', () => {
    const state = createDefaultSkillTreeState() // Y:slz U:lys I:hytj O:lyfb L:jdy
    expect(rebindSkill(state, 'slz', 'L')).toBe(true)
    expect(getBindings(state)).toEqual({ Y: 'jdy', U: 'lys', I: 'hytj', O: 'lyfb', L: 'slz' })
  })

  it('moving onto an empty key just relocates, leaving the old key empty', () => {
    const state = createEmptySkillTreeState()
    state.schools[0].level = 1
    learnSkill(state, 0, 0) // slz -> Y
    expect(rebindSkill(state, 'slz', 'L')).toBe(true)
    expect(getBindings(state)).toEqual({ Y: null, U: null, I: null, O: null, L: 'slz' })
  })

  it('no-ops (returns true) when the skill is already at targetKey', () => {
    const state = createDefaultSkillTreeState()
    expect(rebindSkill(state, 'slz', 'Y')).toBe(true)
    expect(getBindings(state).Y).toBe('slz')
  })

  it('fails for an unbound (unlearned) skill', () => {
    const state = createEmptySkillTreeState()
    expect(rebindSkill(state, 'slz', 'Y')).toBe(false)
  })

  it('keyForSkill finds the current key, or undefined if unbound', () => {
    const state = createDefaultSkillTreeState()
    expect(keyForSkill(state, 'jdy')).toBe('L')
    expect(keyForSkill(state, 'sx')).toBeUndefined()
  })
})
