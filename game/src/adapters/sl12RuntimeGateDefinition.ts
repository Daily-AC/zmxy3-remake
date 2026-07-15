import type { BattleDefinition } from '@zaixu/game-core'
import type { ChapterOneBattleProfile } from './chapterOneBattleCompiler'
import { compileSl12BattleDefinition } from './sl12BattleDefinition'

export function compileSl12RuntimeGateDefinition(
  seed: number,
  profile: Partial<ChapterOneBattleProfile> = {},
): BattleDefinition {
  const definition = compileSl12BattleDefinition(seed, profile)
  for (const monster of Object.values(definition.monsters)) {
    monster.stats.hp = 1
    monster.stats.def = 0
    monster.stats.normalAttackRate = 0
  }
  for (const encounter of definition.level.encounters) {
    if (encounter.kind !== 'stop-point') continue
    encounter.spawns.forEach((spawn) => {
      spawn.x = encounter.stopX + 40
      spawn.y = definition.level.heroSpawn.y
      spawn.delayTicks = 0
      spawn.intervalTicks = 1
      spawn.quantity = 1
    })
  }
  return definition
}
