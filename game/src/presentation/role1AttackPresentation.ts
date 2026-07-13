import type { NormalAttackHit } from '../systems/heroScale'
import type { Role1EffectAction } from '../data/role1Effects'

export const ROLE1_COMBO_ACTIONS: readonly (NormalAttackHit | null)[] = [null, 'hit1', 'hit2', 'hit3', 'hit4', 'hit5']

export function role1SwingEffectAction(action: string): Role1EffectAction | null {
  if (action === 'hit2') return 'hit1'
  if (action === 'hit1' || action === 'hit3' || action === 'hit4' || action === 'hit5') return action
  return null
}

export function role1SwingSound(action: string): 'hit12' | 'hit34' | 'hit5' {
  if (action === 'hit1' || action === 'hit2') return 'hit12'
  if (action === 'hit3' || action === 'hit4') return 'hit34'
  return 'hit5'
}

export function role1ComboStageSound(stage: number): 'hit12' | 'hit34' | 'hit5' {
  if (stage <= 2) return 'hit12'
  if (stage <= 4) return 'hit34'
  return 'hit5'
}

export function role1AttackEffectForSwing(previousAttackId: number, currentAttackId: number, comboStage: number): Role1EffectAction | null {
  if (currentAttackId === previousAttackId) return null
  if (comboStage === 0) return 'hit3'
  const action = ROLE1_COMBO_ACTIONS[comboStage]
  return action ? role1SwingEffectAction(action) : null
}
