export interface Role1EffectSpec {
  sourceSymbol: string
  frames: number
  fps: number
  scale: number
}

export const ROLE1_EFFECTS = {
  hit1: { sourceSymbol: 'Role1Bullet1', frames: 4, fps: 24, scale: 0.62 },
  hit3: { sourceSymbol: 'Role1Bullet3', frames: 5, fps: 24, scale: 0.58 },
  hit4: { sourceSymbol: 'Role1Bullet4', frames: 4, fps: 24, scale: 0.58 },
  hit5: { sourceSymbol: 'Role1Bullet5', frames: 4, fps: 24, scale: 0.58 },
  hit6: { sourceSymbol: 'Role1Bullet6', frames: 6, fps: 24, scale: 0.58 },
  hit7: { sourceSymbol: 'Role1Bullet7', frames: 15, fps: 30, scale: 0.52 },
  hit8: { sourceSymbol: 'Role1Bullet8', frames: 10, fps: 24, scale: 0.55 },
  hit9: { sourceSymbol: 'Role1Bullet9', frames: 10, fps: 30, scale: 0.58 },
  hit10: { sourceSymbol: 'Role1Bullet10_2', frames: 44, fps: 30, scale: 0.5 },
  hit11_1: { sourceSymbol: 'Role1Bullet11_1', frames: 35, fps: 30, scale: 0.55 },
  hit11_2: { sourceSymbol: 'Role1Bullet11_2', frames: 35, fps: 30, scale: 0.55 },
  hit12: { sourceSymbol: 'Role1Bullet12', frames: 15, fps: 24, scale: 0.55 },
  hit13: { sourceSymbol: 'Role1Bullet13', frames: 30, fps: 30, scale: 0.55 },
  hit14: { sourceSymbol: 'Role1Bullet14_1', frames: 15, fps: 24, scale: 0.55 },
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
