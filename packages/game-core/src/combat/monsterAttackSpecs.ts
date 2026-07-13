import type { AttackSpec } from './attackSpec'

export const MONSTER_ATTACKS = {
  monster2: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [19 / 35, 1],
      hitbox: { forward: 75 / 2, y: 0, width: 75, height: 150 },
    },
  },
  monster3: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [7 / 15],
      hitbox: { forward: 105, y: -60, width: 120, height: 90 },
    },
    hit2: {
      action: 'hit2',
      hitFrameFractions: [30 / 31],
      hitbox: { forward: 155, y: -30, width: 140, height: 100 },
    },
  },
  monster4: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [14 / 21],
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster5: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [8 / 15],
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster7: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [0.6],
      hitbox: { forward: 80, y: -86, width: 160, height: 150 },
    },
  },
  monster8: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [1],
      hitbox: { forward: 97, y: -85, width: 150, height: 150 },
    },
    hit2: {
      action: 'hit2',
      hitFrameFractions: [1 / 4],
      hitbox: { forward: 46, y: -30, width: 150, height: 150 },
    },
  },
  monster30: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [1],
      hitbox: { forward: 0, y: 0, width: 0, height: 0 },
    },
  },
} as const satisfies Record<string, Record<string, AttackSpec>>

export function monsterAttackSpecFor(species: string, action: string): AttackSpec | undefined {
  const attacks = MONSTER_ATTACKS as Record<string, Record<string, AttackSpec>>
  return attacks[species]?.[action]
}
