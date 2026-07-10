export type MonsterHit1EffectKind = 'visual' | 'hitbox-only'

export interface MonsterHit1EffectPhase {
  monsterId: 'Monster30' | 'Monster8' | 'Monster7' | 'Monster4' | 'Monster3' | 'Monster2'
  sourceSymbol: string
  symbolId: number
  kind: MonsterHit1EffectKind
  timelineFrames: number
  shippedFrames: number
  visibleFrames: number
  fps: number
  canvasPx: { width: number; height: number }
  pivotPx: { x: number; y: number }
  assetPath: string | null
}

export const MONSTER_HIT1_EFFECTS = {
  Monster30: [{
    monsterId: 'Monster30',
    sourceSymbol: 'Monster30Bullet1',
    symbolId: 21,
    kind: 'visual',
    timelineFrames: 10,
    shippedFrames: 10,
    visibleFrames: 10,
    fps: 24,
    canvasPx: { width: 254, height: 144 },
    pivotPx: { x: 185.5, y: 60.45 },
    assetPath: 'assets/extracted/level1/hit1-effects/Monster30Bullet1',
  }],
  Monster8: [{
    monsterId: 'Monster8',
    sourceSymbol: 'Monster8Bullet1',
    symbolId: 23,
    kind: 'hitbox-only',
    timelineFrames: 1,
    shippedFrames: 0,
    visibleFrames: 0,
    fps: 24,
    canvasPx: { width: 150, height: 150 },
    pivotPx: { x: 0, y: 0 },
    assetPath: null,
  }],
  Monster7: [{
    monsterId: 'Monster7',
    sourceSymbol: 'Monster7Bullet1',
    symbolId: 75,
    kind: 'hitbox-only',
    timelineFrames: 1,
    shippedFrames: 0,
    visibleFrames: 0,
    fps: 24,
    canvasPx: { width: 150, height: 150 },
    pivotPx: { x: 0, y: 0 },
    assetPath: null,
  }],
  Monster4: [{
    monsterId: 'Monster4',
    sourceSymbol: 'Monster4Bullet1',
    symbolId: 52,
    kind: 'visual',
    timelineFrames: 13,
    shippedFrames: 13,
    visibleFrames: 12,
    fps: 24,
    canvasPx: { width: 502, height: 8 },
    pivotPx: { x: 418.95, y: 0 },
    assetPath: 'assets/extracted/level1/hit1-effects/Monster4Bullet1',
  }],
  Monster3: [{
    monsterId: 'Monster3',
    sourceSymbol: 'Monster3Bullet1',
    symbolId: 70,
    kind: 'visual',
    timelineFrames: 5,
    shippedFrames: 5,
    visibleFrames: 5,
    fps: 24,
    canvasPx: { width: 127, height: 107 },
    pivotPx: { x: 0, y: 0 },
    assetPath: 'assets/extracted/level1/hit1-effects/Monster3Bullet1',
  }],
  Monster2: [
    {
      monsterId: 'Monster2',
      sourceSymbol: 'Monster2Bullet1_1',
      symbolId: 49,
      kind: 'visual',
      timelineFrames: 14,
      shippedFrames: 14,
      visibleFrames: 14,
      fps: 24,
      canvasPx: { width: 126, height: 137 },
      pivotPx: { x: 71.45, y: -8.4 },
      assetPath: 'assets/extracted/level1/hit1-effects/Monster2Bullet1_1',
    },
    {
      monsterId: 'Monster2',
      sourceSymbol: 'Monster2Bullet1_2',
      symbolId: 34,
      kind: 'visual',
      timelineFrames: 20,
      shippedFrames: 20,
      visibleFrames: 5,
      fps: 24,
      canvasPx: { width: 157, height: 68 },
      pivotPx: { x: 68.4, y: -0.2 },
      assetPath: 'assets/extracted/level1/hit1-effects/Monster2Bullet1_2',
    },
  ],
} as const satisfies Record<string, readonly MonsterHit1EffectPhase[]>

export function monsterHit1EffectFrameUrl(
  effect: MonsterHit1EffectPhase,
  frame: number,
): string | undefined {
  if (effect.assetPath === null || frame < 1 || frame > effect.shippedFrames) return undefined
  return `${effect.assetPath}/${String(frame).padStart(2, '0')}.png`
}
