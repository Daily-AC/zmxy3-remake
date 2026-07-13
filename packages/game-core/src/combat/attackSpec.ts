import { centeredBox, type Rect } from './hitbox'

export interface AttackHitboxSpec {
  forward: number
  y: number
  width: number
  height: number
}

export interface AttackSpec {
  action: string
  hitFrameFractions: readonly number[]
  hitbox: AttackHitboxSpec
}

export interface WorldAttackRect extends Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export function resolveAttackHitbox(
  spec: AttackSpec,
  anchor: { x: number; y: number },
  facing: -1 | 1,
): WorldAttackRect {
  const centerX = anchor.x + facing * spec.hitbox.forward
  const centerY = anchor.y + spec.hitbox.y
  const rect = centeredBox(centerX, centerY, spec.hitbox.width, spec.hitbox.height)
  return {
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
  }
}

export function horizontalAttackReach(spec: AttackSpec, targetHurtboxWidth: number): number {
  return spec.hitbox.forward + spec.hitbox.width / 2 + Math.max(0, targetHurtboxWidth) / 2
}

export function fallbackMonsterAttackSpec(action: string, reach: number): AttackSpec {
  return {
    action,
    hitFrameFractions: [0.5],
    hitbox: { forward: reach / 2, y: 0, width: reach, height: 150 },
  }
}
