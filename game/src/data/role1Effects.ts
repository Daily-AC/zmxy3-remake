import type { VisualAttachmentSpec } from '../systems/visualAttachment'

export interface Role1EffectSpec extends VisualAttachmentSpec {
  sourceSymbol: string
  frames: number
  fps: number
}

// Task 2 replaces these numeric placeholders with pivots measured from generated fixtures.
const PENDING_SOURCE_PIVOT_PX = { x: 0, y: 0 } as const

export const ROLE1_EFFECTS = {
  hit1: { sourceSymbol: 'Role1Bullet1', frames: 4, fps: 24, anchor: 'hero', offset: { forward: 120, y: 5 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit3: { sourceSymbol: 'Role1Bullet3', frames: 5, fps: 24, anchor: 'hero', offset: { forward: 30, y: -110 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit4: { sourceSymbol: 'Role1Bullet4', frames: 4, fps: 24, anchor: 'hero', offset: { forward: 160, y: -10 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit5: { sourceSymbol: 'Role1Bullet5', frames: 4, fps: 24, anchor: 'hero', offset: { forward: 165, y: -20 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit6: { sourceSymbol: 'Role1Bullet6', frames: 6, fps: 24, anchor: 'hero', offset: { forward: 30, y: 40 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit7: { sourceSymbol: 'Role1Bullet7', frames: 15, fps: 30, anchor: 'hero', offset: { forward: 175, y: -30 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit8: { sourceSymbol: 'Role1Bullet8', frames: 10, fps: 24, anchor: 'hero', offset: { forward: -20, y: 30 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit9: { sourceSymbol: 'Role1Bullet9', frames: 10, fps: 30, anchor: 'hero', offset: { forward: 120, y: -50 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit10: { sourceSymbol: 'Role1Bullet10_2', frames: 44, fps: 30, anchor: 'hero', offset: { forward: 150, y: -35 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: false },
  hit11_1: { sourceSymbol: 'Role1Bullet11_1', frames: 35, fps: 30, anchor: 'hero', offset: { forward: 50, y: -50 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit11_2: { sourceSymbol: 'Role1Bullet11_2', frames: 35, fps: 30, anchor: 'hero', offset: { forward: 0, y: -50 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: true },
  hit12: { sourceSymbol: 'Role1Bullet12', frames: 15, fps: 24, anchor: 'target', offset: { forward: 0, y: 0 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: false },
  hit13: { sourceSymbol: 'Role1Bullet13', frames: 30, fps: 30, anchor: 'target', offset: { forward: 0, y: 0 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: false },
  hit14: { sourceSymbol: 'Role1Bullet14_1', frames: 15, fps: 24, anchor: 'hero', offset: { forward: -15, y: -85 }, pivotPx: PENDING_SOURCE_PIVOT_PX, scale: 1, followAnchor: false },
} as const satisfies Record<string, Role1EffectSpec>

export type Role1EffectAction = keyof typeof ROLE1_EFFECTS

export function role1EffectForAction(action: string): Role1EffectSpec | undefined {
  return ROLE1_EFFECTS[action as Role1EffectAction]
}

export function role1EffectFrameKey(action: Role1EffectAction, frame: number): string {
  return `role1_fx_${action}_${String(frame).padStart(2, '0')}`
}

export function role1EffectFrameUrl(action: Role1EffectAction, frame: number): string {
  return `assets/extracted/role1-effects/${action}/${String(frame).padStart(2, '0')}.png`
}
