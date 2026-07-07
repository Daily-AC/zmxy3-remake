// Phaser-independent MP (法力) resource model, ported from kagami's
// HeroSkillSystem.ts (mp/maxMp fields + full-refill reset) and
// ProgressionSystem.ts (per-level max-MP growth for Role1/悟空).
//
// Sources:
//   vendor/kagami-phaser/src/systems/HeroSkillSystem.ts:106-109,226-248
//   vendor/kagami-phaser/src/systems/ProgressionSystem.ts:124-134 (getHeroBaseStats, case 1)
//
// Ported as-is:
//  - mp/maxMp pair that fully refills on create/reset
//    (HeroSkillSystem.ts:230-248's createHeroSkillModel/resetHeroSkill).
//  - Role1 max-MP-by-level formula `50 + 20 * (level - 1)`
//    (ProgressionSystem.ts:130-131, the `case 1` branch of getHeroBaseStats).
//
// Left as an injection point (HeroIdentityState — level/equipment — is being
// built by another agent in parallel; this module never imports it):
//  - getRole1MaxMp(level) takes a bare level number, not a hero identity object.
//  - tickMpRegen()'s regenPerSecond is caller-supplied (see below) rather than
//    read from an equipment/attribute model this module doesn't know about.
//
// Added, not a literal kagami behaviour (TODO-verify if kagami's client is
// inspected further):
//  - kagami's EquipmentSystem.ts defines an `mpRegen` equipment stat
//    (EquipmentSystem.ts:28,134,748,852) but no shipped system in
//    vendor/kagami-phaser/src/systems ever reads it on a per-tick basis — it
//    is a displayed stat with no wired consumer. tickMpRegen() below is this
//    port's own generic passive-regen tick, added so the equipment stat has
//    somewhere to plug in; the regen rule/rate itself is not a recovered
//    original value.

export interface MpModel {
  mp: number
  maxMp: number
}

export function createMp(maxMp: number): MpModel {
  return { mp: maxMp, maxMp }
}

/** Full refill, optionally against a new maxMp. Mirrors HeroSkillSystem.ts's resetHeroSkill. */
export function resetMp(model: MpModel, maxMp?: number): void {
  if (maxMp !== undefined) model.maxMp = maxMp
  model.mp = model.maxMp
}

/** Role1 (悟空) max MP at a given hero level. Source: ProgressionSystem.ts:130-131. */
export function getRole1MaxMp(level: number): number {
  const levelOffset = Math.max(1, Math.floor(level)) - 1
  return 50 + 20 * levelOffset
}

export function hasEnoughMp(model: MpModel, cost: number): boolean {
  return model.mp >= cost
}

/** Spend `cost` MP if affordable. Returns false (no mutation) if insufficient. */
export function spendMp(model: MpModel, cost: number): boolean {
  if (model.mp < cost) return false
  model.mp -= cost
  return true
}

/** Restore MP, clamped to maxMp. Returns the amount actually restored. */
export function restoreMp(model: MpModel, amount: number): number {
  const before = model.mp
  model.mp = Math.min(model.maxMp, model.mp + Math.max(0, amount))
  return model.mp - before
}

/**
 * Generic passive MP regen tick; regenPerSecond is caller-supplied (e.g. from
 * an equipment `mpRegen` stat) since kagami itself never wires up a fixed
 * regen rate for that stat (see file header). Returns the amount restored.
 */
export function tickMpRegen(model: MpModel, regenPerSecond: number, deltaMs: number): number {
  if (regenPerSecond <= 0 || deltaMs <= 0) return 0
  return restoreMp(model, regenPerSecond * (deltaMs / 1000))
}

/**
 * Change maxMp (e.g. on level-up) and clamp current mp down if it now exceeds
 * the new cap. Does not auto-refill — callers that want a level-up full-heal
 * should call resetMp instead.
 */
export function setMaxMp(model: MpModel, maxMp: number): void {
  model.maxMp = maxMp
  model.mp = Math.min(model.mp, model.maxMp)
}
