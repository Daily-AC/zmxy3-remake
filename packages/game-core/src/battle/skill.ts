export interface BattleSkillHitbox {
  forward: number
  y: number
  width: number
  height: number
}

export interface BattleSkillDefinition {
  id: string
  action: string
  learnedLevel: number
  mpCost: number
  durationTicks: number
  cooldownTicks: number
  hitTick: number
  hitbox: BattleSkillHitbox
  damage: number
  attackKind: 'physics' | 'magic'
}

export interface ActiveBattleSkill {
  skillId: string
  action: string
  attackId: number
  startedTick: number
  endsAtTick: number
  hitAtTick: number
  hitResolved: boolean
}

export interface BattleSkillState {
  mp: number
  maxMp: number
  cooldownUntilTick: number
  active: ActiveBattleSkill | null
}

export type BattleSkillCastFailure = 'not-learned' | 'insufficient-resource' | 'cooldown' | 'busy'

export type BattleSkillCastResult =
  | { ok: false; reason: BattleSkillCastFailure }
  | { ok: true; mpBefore: number; mpAfter: number; active: ActiveBattleSkill }

export function createBattleSkillState(maxMp: number): BattleSkillState {
  if (!Number.isFinite(maxMp) || maxMp < 0) throw new RangeError('max MP must be a non-negative number')
  return { mp: maxMp, maxMp, cooldownUntilTick: 0, active: null }
}

export function castBattleSkill(
  state: BattleSkillState,
  definition: BattleSkillDefinition,
  tick: number,
  attackId: number,
): BattleSkillCastResult {
  if (definition.learnedLevel <= 0) return { ok: false, reason: 'not-learned' }
  if (state.active) return { ok: false, reason: 'busy' }
  if (tick < state.cooldownUntilTick) return { ok: false, reason: 'cooldown' }
  if (state.mp < definition.mpCost) return { ok: false, reason: 'insufficient-resource' }
  const mpBefore = state.mp
  state.mp -= definition.mpCost
  state.cooldownUntilTick = tick + definition.cooldownTicks
  state.active = {
    skillId: definition.id,
    action: definition.action,
    attackId,
    startedTick: tick,
    endsAtTick: tick + definition.durationTicks,
    hitAtTick: tick + definition.hitTick,
    hitResolved: false,
  }
  return { ok: true, mpBefore, mpAfter: state.mp, active: state.active }
}

export function finishExpiredBattleSkill(state: BattleSkillState, tick: number): void {
  if (state.active && tick >= state.active.endsAtTick) state.active = null
}

export function consumeBattleSkillHit(state: BattleSkillState, tick: number): ActiveBattleSkill | null {
  const active = state.active
  if (!active || active.hitResolved || tick < active.hitAtTick || tick >= active.endsAtTick) return null
  active.hitResolved = true
  return active
}
