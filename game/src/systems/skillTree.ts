// S5 技能树/学习技能: school (心法) leveling, skill learning/upgrading, and the
// YUIOL dock binding, ported from the main SWF's real AS3 (骨), not kagami --
// kagami's SkillUISystem.ts got the school-upgrade cost table and the auto-bind
// key order right (cross-checked below) but invented a materially different
// learn-limit/level-cap/cost model. Extraction: `game/tmp/s5-as3/scripts/`
// (`export.shop.{BuySkill,SkillControl,SkillSetControl,PassiveSkillControl}`,
// `user.User`, `config.Config`, extracted from the main SWF via
// tools/ffdec/ffdec-cli.jar -selectclass, per docs/playbooks/ui-port-dual-source.md).
// Skin/coordinates: `OtherMat1.swf` Symbol 736/489/193/769 (xfl export), used
// by SkillTreeScene, not here.
//
// ============================================================
// AS3 ground truth (all citations against game/tmp/s5-as3/scripts/)
// ============================================================
//
// Two schools (心法) per hero, each a fixed 5-skill list --
// config/Config.as:263 `allSklName`, roleid=1 (悟空) is index 0/1:
//   allSklName[0] = ["slz","zz","sx","qsez","hmz"]   (斩系心法, school index 0)
//   allSklName[1] = ["lys","hytj","lyfb","jdy","hyjj"] (火系心法, school index 1)
// Note `sx` (kagami's "passive") is a completely normal *slot* in this list --
// export.shop.PassiveSkillControl (pskill1-5, a separate fixed 5-icon panel
// toggled by BuySkill's `passivebtn`) is an unrelated, unconnected UI with no
// system backing here (see SkillTreeScene header) -- sx's own learn/upgrade
// path is entirely through this same 心法-tree machinery, matching AS3.
//
// School level -> unlocked skill slot count: SkillControl.as:151-165
// (`initStudySkill` loops `1..this.player.isstudyskill[xf].xflevel`, i.e. the
// stored level IS the unlocked-slot count, capped by the list length 5;
// `upGradebtn.visible = xflevel<5`).
//
// School upgrade cost: SkillControl.as:358-379 `findNextNeedLHValue(level+1)`,
// switch on `level`: 0->100, 1->200, 2->500, 3->1000, 4->2000. Matches kagami's
// SkillUISystem.ts:16 TREE_UPGRADE_COSTS verbatim (kagami got this one right).
// Charged in upGradeSkillFunc:215-234 (SkillControl.as), which also re-renders
// the row list (initStudySkill) after paying.
//
// Learning a skill (User.as:96-116 ctor + SkillControl.as:418-451 `buy`):
//   - Total learned cap across BOTH schools = `player.getSkillLimt()` = 5
//     (User.as:114 ctor `this.setSkillLimit(5)`) -- this is the real number
//     behind spec's "每个角色只能学习5个技能" text, and it directly
//     contradicts kagami's SkillUISystem.ts:17 `SKILL_LEARN_LIMIT = 10`.
//   - Learning has NO soul cost (`buy()` never touches lhValue) -- only the
//     *school* unlock and the *per-skill level-up* cost souls.
//   - A slot is learnable once its school has unlocked it (`skillN` MC at
//     `currentFrame==2`) and the skill isn't already learned.
//   - On learn, User.as:1109-1147 `findWhichSkillBtnNoneSet()` auto-assigns
//     the first free dock key in fixed order `["Y","U","I","O","L"]` for
//     controlPlayer 0 (P1) -- matches kagami's SkillUISystem.ts:276
//     `P1_BINDING_ORDER` exactly. Since the learn cap (5) equals the key
//     count (5), every learned skill is always dock-bound; there is no
//     "learned but unbound" state in the real game.
//
// Per-skill level-up (SkillControl.as:282-328 `skillupgradeFunc` + the
// `mOver` tooltip at :96-114, same formula):
//   - cost = `150 * slev * slev * Math.sqrt(slev)` (== 150 * slev^2.5),
//     where `slev` is the skill's CURRENT level before the upgrade.
//     Not kagami's `Math.ceil(200 * Math.pow(2560, Math.pow((L-1)/base,0.8)))`
//     (SkillUISystem.ts:193-196) -- wildly different curve.
//   - Max level = 9 for EVERY school skill (`if(slev<9){...} else {"技能等级
//     已达上限"}`, :302/:322) -- flat, no per-skill exception. kagami invented
//     a SPECIAL_SKILLS/UNUPGRADEABLE_SKILLS split (SkillUISystem.ts:14-19)
//     that sends "special" skills (incl. sx) to a 9-level cap but everything
//     else to 18 -- the AS3 has no such split; ALL Role1 school skills cap at 9.
//   - Hero-level gate: `player.getCurLevel()/5 >= slev` i.e. heroLevel >=
//     slev*5 (:304) -- this part kagami DID get right (SkillUISystem.ts:198-203
//     `getSkillLevelRequirement`), just uniformly (no special-skill x10).
//
// Dock rebinding (export.shop.SkillSetControl.as, opened per-skill via
// SkillControl's `skillsetFunc`): drag a learned skill's icon onto a Y/U/I/O/L
// slot. `replaceSkillButton` (:286-299) removes whatever occupied the TARGET
// key and pushes the dragged skill at the new key, but never removes the
// dragged skill's OWN prior-key entry -- reproducibly leaves a stale duplicate
// `skillbykey` entry at the old key (traced through `up()`/`back()`/
// `replaceSkillButton`, not exercised in a live client to double-confirm, but
// unambiguous from the code: `newObj` is a fresh object separate from whatever
// entry already exists at the skill's old key, and nothing ever splices that
// old entry out unless another skill happens to land on it later). Recorded
// per 移植协议 as a genuine implementation bug (this "duplicate/dangling
// binding" plainly isn't the intended behavior of a drag-to-rebind control) --
// `rebindSkill` below implements a clean swap instead: the two skills simply
// trade keys. Adapted, not ported verbatim; see skilltree-report.md.

import type { SoulPurse } from './soulPurse'
import { trySpendSoul } from './soulPurse'

// ---------- skill identity ----------

/** The 9 active Role1SkillId values (heroSkill.ts) plus the school-tree-only
 * passive `sx`. AS3's allSklName has no other entries for roleid 1. */
export type Role1TreeSkillId =
  | 'slz' | 'lys' | 'hytj' | 'lyfb' | 'jdy' | 'qsez' | 'zz' | 'hmz' | 'hyjj' | 'sx'

export interface SchoolConfig {
  readonly name: string
  readonly skills: readonly [Role1TreeSkillId, Role1TreeSkillId, Role1TreeSkillId, Role1TreeSkillId, Role1TreeSkillId]
}

/** Config.as:263 `allSklName[0]`/`allSklName[1]` (roleid 1, 2*(1-1)=0 and
 * 2*1-1=1). Only Role1 (悟空) is implemented -- the only selectable hero
 * (S2 selectrole-saveslots-report). */
export const ROLE1_SCHOOLS: readonly [SchoolConfig, SchoolConfig] = [
  { name: '斩系心法', skills: ['slz', 'zz', 'sx', 'qsez', 'hmz'] },
  { name: '火系心法', skills: ['lys', 'hytj', 'lyfb', 'jdy', 'hyjj'] },
]

/** Official display names + descriptions. 斩系 strings from the baked vendor
 * table art (OtherMat1 table_school1); 火系 from the official Online client's
 * fire-school screen supplied by the user (2026-07-08 screenshot) -- these
 * strings are runtime-served in the original and exist in no extractable
 * asset (negative-result hunt: tasks/skilltree-report.md 终审返修 §3). The
 * pinyin ids match 1:1: lys=烈焰闪, hytj=火焰突击, lyfb=烈焰风暴, jdy=筋斗云,
 * hyjj=火眼金睛. */
export const SKILL_DISPLAY: Record<Role1TreeSkillId, { name: string; desc: string }> = {
  slz: { name: '升龙斩', desc: '近身后用力将怪物挑到空中' },
  zz: { name: '重斩', desc: '蓄气后用力斩杀前方怪物' },
  sx: { name: '嗜血', desc: '被动增加5%吸血和5%暴击效果' },
  qsez: { name: '七十二斩', desc: '迅速向前冲去，对怪物施展多次攻击，并有概率留下残影' },
  hmz: { name: '火魔斩', desc: '冲向空中施放火魔九连斩，落地后为最后一斩，造成极高的伤害' },
  lys: { name: '烈焰闪', desc: '向前冲刺对碰到的怪物造成伤害，冲刺过程处于无敌状态' },
  hytj: { name: '火焰突击', desc: '打退前方怪物并造成多次伤害' },
  lyfb: { name: '烈焰风暴', desc: '快速旋转震开周围怪物并造成多次伤害' },
  jdy: { name: '筋斗云', desc: '召唤筋斗云可以冲向云霄' },
  hyjj: { name: '火眼金睛', desc: '眼睛变红对最近的怪物造成较大伤害' },
}

export function skillDisplayName(id: Role1TreeSkillId): string {
  return SKILL_DISPLAY[id]?.name ?? id
}

export const MAX_SCHOOL_LEVEL = 5
/** SkillControl.as:358-379 `findNextNeedLHValue`, index = current school level. */
export const SCHOOL_UPGRADE_COST: readonly number[] = [100, 200, 500, 1000, 2000]
/** User.as:114 `setSkillLimit(5)`. Total learned skills across BOTH schools. */
export const SKILL_LEARN_LIMIT = 5
/** SkillControl.as:302 `slev<9`, flat for every school skill. */
export const MAX_SKILL_LEVEL = 9

export const BIND_KEYS = ['Y', 'U', 'I', 'O', 'L'] as const
export type BindKey = (typeof BIND_KEYS)[number]
/** User.as:1109-1121 `findWhichSkillBtnNoneSet`, controlPlayer 0 branch. */
const AUTO_BIND_ORDER: readonly BindKey[] = ['Y', 'U', 'I', 'O', 'L']

// ---------- state ----------

export interface LearnedSkillEntry {
  skillName: Role1TreeSkillId
  level: number
}

export interface SchoolState {
  level: number
  learned: LearnedSkillEntry[]
}

export interface SkillTreeState {
  schools: [SchoolState, SchoolState]
  bindings: Record<BindKey, Role1TreeSkillId | null>
}

export function createEmptySkillTreeState(): SkillTreeState {
  return {
    schools: [
      { level: 0, learned: [] },
      { level: 0, learned: [] },
    ],
    bindings: { Y: null, U: null, I: null, O: null, L: null },
  }
}

/** Bootstrap default for a brand-new character: only the first school slot is
 * unlocked/learned and bound to Y. The AS3 User constructor starts fully empty
 * (`isstudyskill` xflevel 0, `skillbykey=[]`), but this project keeps one
 * starter active skill so a new save can use the skill system immediately
 * without resurrecting the old five-skill demo loadout. */
export function createDefaultSkillTreeState(): SkillTreeState {
  const state = createEmptySkillTreeState()
  state.schools[0].level = 1 // unlocks allSklName[0][0] = slz
  state.schools[0].learned.push({ skillName: 'slz', level: 1 })
  state.bindings = { Y: 'slz', U: null, I: null, O: null, L: null }
  return state
}

/** Pre-S5 demo loadout (all 4 fire-school skills pre-learned). Originally the
 * migration fallback for saves written before `skills` existed
 * (`skills:null`) -- superseded 2026-07-09 (tasks/skilltree-redo-brief.md
 * point 3): `save.ts`'s `decodeSkillTree` now falls back to
 * `createDefaultSkillTreeState()` instead, because the demo loadout was
 * silently showing every tester "four skills already active" on a save that
 * should have started with just 升龙斩. Kept here, unused by the migration
 * path, as an inert archival record of the old demo state and for tests
 * that exercise this function directly. */
export function createLegacySkillTreeState(): SkillTreeState {
  const state = createEmptySkillTreeState()
  state.schools[0].level = 1 // unlocks allSklName[0][0] = slz
  state.schools[1].level = 4 // unlocks allSklName[1][0..3] = lys/hytj/lyfb/jdy
  state.schools[0].learned.push({ skillName: 'slz', level: 1 })
  state.schools[1].learned.push(
    { skillName: 'lys', level: 1 },
    { skillName: 'hytj', level: 1 },
    { skillName: 'lyfb', level: 1 },
    { skillName: 'jdy', level: 1 },
  )
  state.bindings = { Y: 'slz', U: 'lys', I: 'hytj', O: 'lyfb', L: 'jdy' }
  return state
}

// ---------- schools ----------

/** SkillControl.as `initStudySkill`'s loop bound: the stored level IS the
 * unlocked count, capped at the school's 5 slots. */
export function getUnlockedSlotCount(schoolLevel: number): number {
  return Math.min(Math.max(0, schoolLevel), MAX_SCHOOL_LEVEL)
}

/** undefined once already at MAX_SCHOOL_LEVEL (no further upgrade exists). */
export function getSchoolUpgradeCost(schoolLevel: number): number | undefined {
  return SCHOOL_UPGRADE_COST[schoolLevel]
}

export function canUpgradeSchool(state: SkillTreeState, schoolIndex: 0 | 1, soul: number): string | true {
  const school = state.schools[schoolIndex]
  const cost = getSchoolUpgradeCost(school.level)
  if (cost === undefined) return '心法等级已达上限'
  if (soul < cost) return `需要${cost}灵魂`
  return true
}

export function upgradeSchool(state: SkillTreeState, schoolIndex: 0 | 1, purse: SoulPurse): boolean {
  const school = state.schools[schoolIndex]
  const cost = getSchoolUpgradeCost(school.level)
  if (cost === undefined) return false
  if (!trySpendSoul(purse, cost)) return false
  school.level += 1
  return true
}

// ---------- learning ----------

export function totalLearnedCount(state: SkillTreeState): number {
  return state.schools[0].learned.length + state.schools[1].learned.length
}

export function findLearnedEntry(
  state: SkillTreeState,
  skillName: Role1TreeSkillId,
): { schoolIndex: 0 | 1; entry: LearnedSkillEntry } | undefined {
  for (const schoolIndex of [0, 1] as const) {
    const entry = state.schools[schoolIndex].learned.find((s) => s.skillName === skillName)
    if (entry) return { schoolIndex, entry }
  }
  return undefined
}

export function isSkillLearned(state: SkillTreeState, skillName: Role1TreeSkillId): boolean {
  return findLearnedEntry(state, skillName) !== undefined
}

/** SkillControl.as:418-451 `buy()`'s three guards, in order. */
export function canLearnSkill(state: SkillTreeState, schoolIndex: 0 | 1, slotIndex: number): string | true {
  const school = state.schools[schoolIndex]
  if (slotIndex < 0 || slotIndex >= ROLE1_SCHOOLS[schoolIndex].skills.length) return '无效技能位'
  if (slotIndex >= getUnlockedSlotCount(school.level)) return '心法等级不足，未解锁'
  const skillName = ROLE1_SCHOOLS[schoolIndex].skills[slotIndex]
  if (isSkillLearned(state, skillName)) return `${skillName}已学习`
  if (totalLearnedCount(state) >= SKILL_LEARN_LIMIT) return `您当前只能学习${SKILL_LEARN_LIMIT}个技能!`
  return true
}

function firstEmptyBindKey(state: SkillTreeState): BindKey | undefined {
  return AUTO_BIND_ORDER.find((k) => state.bindings[k] === null)
}

/** SkillControl.as `buy()`: no soul cost, pushes {skillName, level:1}, and
 * auto-binds via findWhichSkillBtnNoneSet (always succeeds while learn cap ==
 * key count, both 5). Returns the learned skill name, or undefined if
 * `canLearnSkill` rejects. */
export function learnSkill(
  state: SkillTreeState,
  schoolIndex: 0 | 1,
  slotIndex: number,
): Role1TreeSkillId | undefined {
  if (canLearnSkill(state, schoolIndex, slotIndex) !== true) return undefined
  const skillName = ROLE1_SCHOOLS[schoolIndex].skills[slotIndex]
  state.schools[schoolIndex].learned.push({ skillName, level: 1 })
  const key = firstEmptyBindKey(state)
  if (key) state.bindings[key] = skillName
  return skillName
}

// ---------- per-skill level-up ----------
//
// DORMANT (2026-07-09 user ruling, tasks/skilltree-redo-brief.md point 2):
// this trio is a real AS3 feature (SkillControl.as `skillupgradeFunc`), but
// spending it requires a 技能书 (skill-book) item this project hasn't built
// yet -- "如果没做技能书，先不要留这个口子". SkillTreeScene no longer
// imports or calls any of the three functions below; they're kept intact,
// unit-tested, and ready to wire back up once a real skill-book system
// exists. Do not delete.

/** SkillControl.as:295 `150 * sl * sl * Math.sqrt(sl)`, sl = currentLevel. */
export function getSkillUpgradeCost(currentLevel: number): number {
  return Math.floor(150 * currentLevel * currentLevel * Math.sqrt(currentLevel))
}

/** SkillControl.as:304 `getCurLevel()/5 >= slev`, i.e. heroLevel >= slev*5. */
export function getSkillLevelRequirement(currentLevel: number): number {
  return currentLevel * 5
}

export function canUpgradeSkillLevel(
  state: SkillTreeState,
  skillName: Role1TreeSkillId,
  heroLevel: number,
  soul: number,
): string | true {
  const found = findLearnedEntry(state, skillName)
  if (!found) return `${skillName}未学习`
  if (found.entry.level >= MAX_SKILL_LEVEL) return '技能等级已达上限'
  const required = getSkillLevelRequirement(found.entry.level)
  if (heroLevel < required) return `需要${required}级才能升级`
  const cost = getSkillUpgradeCost(found.entry.level)
  if (soul < cost) return '灵魂不足'
  return true
}

export function upgradeSkillLevel(
  state: SkillTreeState,
  skillName: Role1TreeSkillId,
  heroLevel: number,
  purse: SoulPurse,
): boolean {
  const found = findLearnedEntry(state, skillName)
  if (!found) return false
  if (canUpgradeSkillLevel(state, skillName, heroLevel, purse.value) !== true) return false
  const cost = getSkillUpgradeCost(found.entry.level)
  if (!trySpendSoul(purse, cost)) return false
  found.entry.level += 1
  return true
}

// ---------- binding ----------

export function getBindings(state: SkillTreeState): Readonly<Record<BindKey, Role1TreeSkillId | null>> {
  return state.bindings
}

export function keyForSkill(state: SkillTreeState, skillName: Role1TreeSkillId): BindKey | undefined {
  return BIND_KEYS.find((k) => state.bindings[k] === skillName)
}

/**
 * Move a learned+bound skill to `targetKey`, swapping with whatever already
 * occupies it (if anything). This is a deliberate cleanup of the AS3
 * duplicate-entry bug documented in the file header (Adapted, not ported
 * verbatim) -- drag-to-rebind's obvious intent is "move", so this implements
 * a clean bijective swap. Returns false if `skillName` isn't currently bound.
 */
export function rebindSkill(state: SkillTreeState, skillName: Role1TreeSkillId, targetKey: BindKey): boolean {
  const fromKey = keyForSkill(state, skillName)
  if (!fromKey) return false
  if (fromKey === targetKey) return true
  const displaced = state.bindings[targetKey]
  state.bindings[targetKey] = skillName
  state.bindings[fromKey] = displaced
  return true
}

/** Feeds heroSkill.ts's `syncRole1SkillLevels` (0 = unlearned, matching its
 * own default). `sx` is included for callers that track its level separately
 * (school-tree progress) even though it isn't a `tryCastRole1Skill` id. */
export function getLearnedLevel(state: SkillTreeState, skillName: Role1TreeSkillId): number {
  return findLearnedEntry(state, skillName)?.entry.level ?? 0
}
