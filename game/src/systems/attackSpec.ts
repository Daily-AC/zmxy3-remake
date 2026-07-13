import {
  fallbackMonsterAttackSpec,
  horizontalAttackReach,
  resolveAttackHitbox,
  type AttackSpec as CoreAttackSpec,
  type WorldAttackRect,
} from '@zaixu/game-core/attackSpec'
import { MONSTER_ATTACKS as CORE_MONSTER_ATTACKS } from '@zaixu/game-core/monsterAttackSpecs'
import { resolveVisualAttachment, type VisualAttachmentSpec } from './visualAttachment'

export interface AttackSpec extends CoreAttackSpec {
  effect?: VisualAttachmentSpec & { action: string }
}

export interface ResolvedAttackSpec {
  hitbox: WorldAttackRect
  effect?: ReturnType<typeof resolveVisualAttachment> & { action: string }
}

function effect(action: string, forward: number, y: number): VisualAttachmentSpec & { action: string } {
  return {
    action,
    anchor: 'world',
    offset: { forward, y },
    pivotPx: { x: 0, y: 0 },
    scale: 1,
    followAnchor: false,
  }
}

export const MONSTER_ATTACKS = {
  monster2: { hit1: CORE_MONSTER_ATTACKS.monster2.hit1 },
  monster3: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster3.hit1, effect: effect('Monster3Bullet1', 105, -60) },
    hit2: { ...CORE_MONSTER_ATTACKS.monster3.hit2, effect: effect('Monster3Bullet2', 155, -30) },
  },
  monster4: { hit1: CORE_MONSTER_ATTACKS.monster4.hit1 },
  monster5: { hit1: CORE_MONSTER_ATTACKS.monster5.hit1 },
  monster7: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster7.hit1, effect: effect('Monster7Bullet1', 80, -86) },
  },
  monster8: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster8.hit1, effect: effect('Monster8Bullet1', 97, -85) },
    hit2: { ...CORE_MONSTER_ATTACKS.monster8.hit2, effect: effect('Monster8Bullet2', 46, -30) },
  },
  monster30: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster30.hit1, effect: effect('Monster30Bullet1', 0, 0) },
  },
} as const satisfies Record<string, Record<string, AttackSpec>>

export function monsterAttackSpecFor(species: string, action: string): AttackSpec | undefined {
  const attacks = MONSTER_ATTACKS as Record<string, Record<string, AttackSpec>>
  return attacks[species]?.[action]
}

export function resolveAttackSpec(
  spec: AttackSpec,
  anchor: { x: number; y: number },
  facing: -1 | 1,
): ResolvedAttackSpec {
  const hitbox = resolveAttackHitbox(spec, anchor, facing)
  const resolved: ResolvedAttackSpec = { hitbox }
  if (spec.effect) {
    resolved.effect = {
      action: spec.effect.action,
      ...resolveVisualAttachment({
        anchor,
        facing,
        offset: spec.effect.offset,
        pivotPx: spec.effect.pivotPx,
        scale: spec.effect.scale,
      }),
    }
  }
  return resolved
}

export { fallbackMonsterAttackSpec, horizontalAttackReach }
