// Phaser-independent axis-aligned collision helpers for melee hit detection.
//
// The original resolves hits with pixel-level `HitTest.complexHitTestObject()`
// against each attack's `colipse` box (combat-rules-index.md). This slice uses
// a simplified explicit AABB in front of the hero during a hit* swing, which the
// same doc endorses as the first-pass approach ("首个现代切片可以先用占位帧和显式碰撞盒").

/** Axis-aligned rectangle, top-left origin. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** A rectangle of size w×h centred on (cx, cy). */
export function centeredBox(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export interface AttackBoxSpec {
  /** Width of the swing box reaching out in front of the hero. */
  reach: number
  /** Height of the swing box. */
  height: number
  /** How far the box's near edge sits from the hero centre. */
  offset: number
}

export const DEFAULT_ATTACK_BOX: AttackBoxSpec = {
  reach: 130,
  height: 150,
  offset: 20,
}

/**
 * Melee hitbox in front of the hero for a hit* swing. `facing` is -1 (left) or
 * 1 (right); the box extends toward that side from the hero's centre.
 */
export function heroAttackBox(
  heroCx: number,
  heroCy: number,
  facing: -1 | 1,
  spec: AttackBoxSpec = DEFAULT_ATTACK_BOX,
): Rect {
  const nearEdge = heroCx + facing * spec.offset
  const x = facing === 1 ? nearEdge : nearEdge - spec.reach
  return { x, y: heroCy - spec.height / 2, w: spec.reach, h: spec.height }
}
