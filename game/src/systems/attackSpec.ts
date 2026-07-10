import { centeredBox, type Rect } from './hitbox'
import { resolveVisualAttachment, type VisualAttachmentSpec } from './visualAttachment'

export interface AttackSpec {
  action: string
  hitFrameFraction: number
  hitbox: { forward: number; y: number; width: number; height: number }
  effect?: VisualAttachmentSpec & { action: string }
}

export interface WorldAttackRect extends Rect {
  left: number
  top: number
  right: number
  bottom: number
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

/**
 * L1 attack timing and attachment data with adapted AABB collision geometry.
 *
 * Source boundaries:
 * - Monster2/4/5 hit1 fractions and old reach values come from their AS3
 *   animation triggers/spawn offsets. Their boxes preserve that reach as a
 *   front-facing `forward=reach/2,width=reach` fallback with the project's
 *   standard 150px height; those boxes are not recovered effect geometry.
 * - Monster3 effect offsets are AS3. Its 120x90 and 140x100 boxes are the
 *   existing monsterBehaviors/kagami placeholders and remain TODO-verify.
 *   hit2's 30/31 fraction follows the existing overlay's one-tick-early spawn
 *   convention rather than claiming the source effect fires before its last
 *   AS3 tick.
 * - Monster7's effect offset is AS3. Its 160x150 box is adapted from the Task4
 *   crossing acceptance case and the monster's 150px sheet cell.
 * - Monster8 effect offsets are AS3. Its 150x150 boxes use the sheet cell as
 *   adapted geometry; they are not recovered SpecialEffectBullet bounds.
 * - Monster30's origin offset and hit1 timing are AS3. Its zero-area box is a
 *   non-colliding sentinel because Monster30Bullet1 owns collision in flight.
 *
 * Effect pivots remain zero until normalized assets supply source bounds in
 * Task 6.
 */
export const MONSTER_ATTACKS = {
  monster2: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 19 / 35,
      hitbox: { forward: 75 / 2, y: 0, width: 75, height: 150 },
    },
  },
  monster3: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 7 / 15,
      hitbox: { forward: 105, y: -60, width: 120, height: 90 },
      effect: effect('Monster3Bullet1', 105, -60),
    },
    hit2: {
      action: 'hit2',
      hitFrameFraction: 30 / 31,
      hitbox: { forward: 155, y: -30, width: 140, height: 100 },
      effect: effect('Monster3Bullet2', 155, -30),
    },
  },
  monster4: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 14 / 21,
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster5: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 8 / 15,
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster7: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 0.6,
      hitbox: { forward: 80, y: -86, width: 160, height: 150 },
      effect: effect('Monster7Bullet1', 80, -86),
    },
  },
  monster8: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 1,
      hitbox: { forward: 97, y: -85, width: 150, height: 150 },
      effect: effect('Monster8Bullet1', 97, -85),
    },
    hit2: {
      action: 'hit2',
      hitFrameFraction: 1 / 4,
      hitbox: { forward: 46, y: -30, width: 150, height: 150 },
      effect: effect('Monster8Bullet2', 46, -30),
    },
  },
  monster30: {
    hit1: {
      action: 'hit1',
      hitFrameFraction: 1,
      hitbox: { forward: 0, y: 0, width: 0, height: 0 },
      effect: effect('Monster30Bullet1', 0, 0),
    },
  },
} as const satisfies Record<string, Record<string, AttackSpec>>

export function monsterAttackSpecFor(species: string, action: string): AttackSpec | undefined {
  const attacks = MONSTER_ATTACKS as Record<string, Record<string, AttackSpec>>
  return attacks[species]?.[action]
}

/** Preserve undecompiled L2+ behavior with an explicit front-facing box. */
export function fallbackMonsterAttackSpec(action: string, reach: number): AttackSpec {
  return {
    action,
    hitFrameFraction: 0.5,
    hitbox: { forward: reach / 2, y: 0, width: reach, height: 150 },
  }
}

export function resolveAttackSpec(
  spec: AttackSpec,
  anchor: { x: number; y: number },
  facing: -1 | 1,
): ResolvedAttackSpec {
  const centerX = anchor.x + facing * spec.hitbox.forward
  const centerY = anchor.y + spec.hitbox.y
  const rect = centeredBox(centerX, centerY, spec.hitbox.width, spec.hitbox.height)
  const hitbox: WorldAttackRect = {
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
  }
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
