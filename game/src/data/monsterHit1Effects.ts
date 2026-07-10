import type { VisualAttachmentSpec } from '../systems/visualAttachment'

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

const MONSTER_HIT1_PHASES_BY_SPECIES = {
  monster30: MONSTER_HIT1_EFFECTS.Monster30,
  monster8: MONSTER_HIT1_EFFECTS.Monster8,
  monster7: MONSTER_HIT1_EFFECTS.Monster7,
  monster4: MONSTER_HIT1_EFFECTS.Monster4,
  monster3: MONSTER_HIT1_EFFECTS.Monster3,
  monster2: MONSTER_HIT1_EFFECTS.Monster2,
} as const satisfies Record<string, readonly MonsterHit1EffectPhase[]>

const MONSTER_HIT1_OFFSETS: Record<string, { forward: number; y: number }> = {
  Monster30Bullet1: { forward: 0, y: 0 },
  Monster8Bullet1: { forward: 97, y: -85 },
  Monster7Bullet1: { forward: 80, y: -86 },
  Monster4Bullet1: { forward: 155, y: 0 },
  Monster3Bullet1: { forward: 105, y: -60 },
  // Monster2's first swirl is deliberately spawned behind its current facing;
  // its second orb is in front. These signs are the literal doHi1_1/doHi1_2
  // branches from export.monster.Monster2.
  Monster2Bullet1_1: { forward: -75, y: -100 },
  Monster2Bullet1_2: { forward: 90, y: -35 },
}

export interface MonsterHit1Visual {
  phase: MonsterHit1EffectPhase
  effect: VisualAttachmentSpec & { action: string }
}

export function monsterHit1EffectPhases(): MonsterHit1EffectPhase[] {
  return Object.values(MONSTER_HIT1_EFFECTS).flat() as MonsterHit1EffectPhase[]
}

export function monsterHit1PhaseForAttackFrame(
  species: string,
  attackFrameIndex: number,
): MonsterHit1EffectPhase | undefined {
  const phases = MONSTER_HIT1_PHASES_BY_SPECIES as Record<string, readonly MonsterHit1EffectPhase[]>
  return phases[species]?.[attackFrameIndex]
}

export function monsterHit1VisualForAttackFrame(
  species: string,
  attackFrameIndex: number,
): MonsterHit1Visual | undefined {
  const phase = monsterHit1PhaseForAttackFrame(species, attackFrameIndex)
  if (!phase || phase.kind === 'hitbox-only') return undefined
  const offset = MONSTER_HIT1_OFFSETS[phase.sourceSymbol]
  if (!offset) return undefined
  return {
    phase,
    effect: {
      action: phase.sourceSymbol,
      anchor: 'world',
      offset,
      pivotPx: phase.pivotPx,
      scale: 1,
      followAnchor: false,
    },
  }
}

export function monsterHit1EffectFrameKey(phase: MonsterHit1EffectPhase, frame: number): string {
  return `monster_hit1_fx_${phase.sourceSymbol}_${String(frame).padStart(2, '0')}`
}

export function monsterHit1EffectAnimationKey(phase: MonsterHit1EffectPhase): string {
  return `monster_hit1_fx_${phase.sourceSymbol}`
}

export function monsterHit1EffectFrameUrl(
  effect: MonsterHit1EffectPhase,
  frame: number,
): string | undefined {
  if (effect.assetPath === null || frame < 1 || frame > effect.shippedFrames) return undefined
  return `${effect.assetPath}/${String(frame).padStart(2, '0')}.png`
}
