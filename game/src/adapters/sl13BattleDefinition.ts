import { validateBattleDefinition, type BattleDefinition } from '@zaixu/game-core'
import geometryRaw from '../data/levels/level1-geometry.json'
import { LEVEL_3_NANTIANMEN } from '../data/levels/level1'
import {
  battleTicks,
  compileChapterOneMonster,
  compileWukongBattleHero,
  type ChapterOneBattleProfile,
  type ChapterOneMonsterId,
} from './chapterOneBattleCompiler'
import { CHAPTER_ONE_LOOT_PHYSICS } from './battleRuntimeLoot'

interface GeometryFile {
  subStages: { id: string; walls: BattleDefinition['level']['walls'] }[]
}

const SL13_MONSTERS: readonly ChapterOneMonsterId[] = [
  'monster3', 'monster5', 'monster7', 'monster8', 'monster30',
]

export function compileSl13BattleDefinition(
  seed: number,
  profile: Partial<ChapterOneBattleProfile> = {},
): BattleDefinition {
  const source = LEVEL_3_NANTIANMEN.subStages[0]
  const waves = source.waveLevel?.stopPoints
  if (!waves?.length) throw new Error('sl13 stop-point waves are incomplete')
  const geometry = (geometryRaw as GeometryFile).subStages.find((stage) => stage.id === source.id)
  const bounds = { ...source.bounds }

  return validateBattleDefinition({
    version: 1,
    contentVersion: 'chapter-one-sl13@1',
    tickRate: 30,
    seed,
    provenance: [
      { ruleId: 'sl13.geometry', origin: 'canonical', source: 'game/src/data/levels/level1-geometry.json' },
      { ruleId: 'sl13.stop-points', origin: 'canonical', source: 'export.gameSence.sl13.as symbol211' },
      { ruleId: 'sl13.enemy-type-3', origin: 'canonical', source: 'sl13.as fields override StageListener13 registration mismatch' },
      { ruleId: 'role1.combat', origin: 'canonical', source: 'game/src/adapters/combatCoreDefinition.ts' },
      { ruleId: 'role1.skill.slz', origin: 'canonical', source: 'game/src/systems/skillDamageReal.ts' },
      { ruleId: 'chapter1.loot', origin: 'canonical', source: 'game/src/data/original/monster-drops.json' },
    ],
    hero: compileWukongBattleHero(source.heroStart, bounds, profile),
    monsters: Object.fromEntries(SL13_MONSTERS.map((species) => [
      species,
      compileChapterOneMonster(species, bounds, { stage: 1, level: 3 }),
    ])),
    level: {
      id: source.id,
      bounds,
      heroSpawn: { ...source.heroStart },
      walls: geometry?.walls.map((wall) => ({ ...wall })) ?? source.fallbackWalls.map((wall) => ({ ...wall })),
      encounters: waves.map((wave, waveIndex) => ({
        kind: 'stop-point' as const,
        id: `stop-${waveIndex}`,
        stopX: wave.stopX ?? bounds.right,
        boss: wave.isBoss ?? false,
        spawns: wave.roster.map((spawn) => ({
          speciesId: spawn.species,
          x: spawn.x ?? wave.stopX ?? source.heroStart.x,
          y: spawn.y ?? source.heroStart.y,
          delayTicks: battleTicks(spawn.delayMs ?? 0),
          intervalTicks: Math.max(1, battleTicks(spawn.intervalMs ?? 1000)),
          quantity: Math.max(1, spawn.quantity ?? 1),
        })),
      })),
      door: { ...source.door },
      lootPhysics: { ...CHAPTER_ONE_LOOT_PHYSICS },
    },
  })
}
