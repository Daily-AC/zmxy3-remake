export type BossHudMonsterMode = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' | 'gone'

export interface BossHudMonster {
  id: string
  mode: BossHudMonsterMode
  hp: number
  arenaBoss: boolean
  miniBoss: boolean
}

function livingMiniBoss(monster: BossHudMonster | null | undefined): monster is BossHudMonster {
  return !!monster && monster.miniBoss && monster.hp > 0 && monster.mode !== 'dead' && monster.mode !== 'gone'
}

export function selectBossHudMonster<T extends BossHudMonster>(
  arenaBoss: T | null,
  currentMiniBoss: T | null,
  monsters: T[],
): T | null {
  if (arenaBoss && arenaBoss.mode !== 'gone') return arenaBoss
  if (livingMiniBoss(currentMiniBoss)) return currentMiniBoss
  return [...monsters].reverse().find(livingMiniBoss) ?? null
}
