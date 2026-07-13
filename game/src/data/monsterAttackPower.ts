import type { AttackKind } from '../systems/heroScale'
import type { MonsterStats } from '../systems/monsterSim'

export interface MonsterAttackPower {
  power: number
  kind: AttackKind
}

// Recovered AS3 hit1 attackBackInfoDict values for every species currently
// reachable by the campaign runtime. Branch-conditional L2 values use the
// same non-elite branch selected by the active level data.
export const MONSTER_HIT1_POWER: Readonly<Record<string, MonsterAttackPower>> = {
  monster30: { power: 5, kind: 'physics' },
  monster8: { power: 8, kind: 'physics' },
  monster7: { power: 14, kind: 'physics' },
  monster3: { power: 14, kind: 'physics' },
  monster2: { power: 28, kind: 'physics' },
  monster5: { power: 40, kind: 'physics' },
  monster4: { power: 50, kind: 'physics' },
  monster10: { power: 30, kind: 'physics' },
  monster9: { power: 40, kind: 'physics' },
  monster19: { power: 50, kind: 'physics' },
  monster6: { power: 100, kind: 'physics' },
  monster16: { power: 129, kind: 'physics' },
  monster15: { power: 186, kind: 'physics' },
  monster22: { power: 345, kind: 'physics' },
  monster34: { power: 829, kind: 'physics' },
}

export function monsterAttackPower(species: string, stats: MonsterStats): MonsterAttackPower {
  return MONSTER_HIT1_POWER[species] ?? {
    power: Math.min(60, 8 + stats.def * 1.5),
    kind: 'physics',
  }
}
