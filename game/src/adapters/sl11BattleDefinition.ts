import {
  validateBattleDefinition,
  type BattleDefinition,
} from '@zaixu/game-core'
import geometryRaw from '../data/levels/level1-geometry.json'
import { LEVEL_1_WUYING } from '../data/levels/level1'
import {
  battleTicks,
  compileChapterOneMonster,
  compileWukongBattleHero,
  type ChapterOneBattleProfile,
} from './chapterOneBattleCompiler'

interface GeometryFile {
  subStages: { id: string; walls: BattleDefinition['level']['walls'] }[]
}

export type Sl11BattleProfile = ChapterOneBattleProfile

export function compileSl11BattleDefinition(
  seed: number,
  profile: Partial<Sl11BattleProfile> = {},
): BattleDefinition {
  const source = LEVEL_1_WUYING.subStages[0]
  const continuous = source.continuousSpawner
  if (!continuous?.heightTrigger) throw new Error('sl11 continuous spawner is incomplete')
  const geometry = (geometryRaw as GeometryFile).subStages.find((stage) => stage.id === source.id)
  const bounds = { ...source.bounds }
  const hero = compileWukongBattleHero(source.heroStart, bounds, profile)

  return validateBattleDefinition({
    version: 1,
    contentVersion: 'chapter-one-sl11@1',
    tickRate: 30,
    seed,
    provenance: [
      { ruleId: 'sl11.geometry', origin: 'canonical', source: 'game/src/data/levels/level1-geometry.json' },
      { ruleId: 'sl11.encounter', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
      { ruleId: 'role1.combat', origin: 'canonical', source: 'game/src/adapters/combatCoreDefinition.ts' },
      { ruleId: 'role1.skill.slz', origin: 'canonical', source: 'game/src/systems/skillDamageReal.ts' },
      { ruleId: 'monster30.flight', origin: 'adapted', source: 'game/src/scenes/BattleScene.ts#monsterConfigFor' },
    ],
    hero,
    monsters: {
      monster30: compileChapterOneMonster('monster30', bounds),
      monster3: compileChapterOneMonster('monster3', bounds),
    },
    level: {
      id: source.id,
      bounds,
      heroSpawn: { ...source.heroStart },
      walls: geometry?.walls.map((wall) => ({ ...wall })) ?? source.fallbackWalls.map((wall) => ({ ...wall })),
      encounters: [{
        kind: 'continuous',
        id: 'continuous-0',
        initialDelayTicks: battleTicks(continuous.initialDelayMs),
        intervalTicks: battleTicks(continuous.intervalMs),
        count: continuous.count,
        roster: continuous.roster.map((entry) => entry.species),
        spawnOffset: {
          x: { ...continuous.offsetX },
          y: { ...continuous.offsetY },
        },
        trigger: {
          kind: 'hero-height',
          atOrAboveY: continuous.heightTrigger.thresholdY,
          boss: {
            speciesId: continuous.heightTrigger.boss.species,
            x: continuous.heightTrigger.boss.x,
            y: continuous.heightTrigger.boss.y,
          },
        },
      }],
      door: { ...source.door },
    },
  })
}
