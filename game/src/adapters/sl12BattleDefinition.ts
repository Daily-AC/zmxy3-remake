import { validateBattleDefinition, type BattleDefinition } from '@zaixu/game-core'
import geometryRaw from '../data/levels/level1-geometry.json'
import { LEVEL_2_TIANGONGDAO } from '../data/levels/level1'
import {
  battleTicks,
  compileChapterOneMonster,
  compileWukongBattleHero,
  type ChapterOneBattleProfile,
} from './chapterOneBattleCompiler'

interface GeometryFile {
  subStages: { id: string; walls: BattleDefinition['level']['walls'] }[]
}

export function compileSl12BattleDefinition(
  seed: number,
  profile: Partial<ChapterOneBattleProfile> = {},
): BattleDefinition {
  const source = LEVEL_2_TIANGONGDAO.subStages[0]
  const waves = source.waveLevel?.stopPoints
  if (!waves?.length) throw new Error('sl12 stop-point waves are incomplete')
  const geometry = (geometryRaw as GeometryFile).subStages.find((stage) => stage.id === source.id)
  const bounds = { ...source.bounds }

  return validateBattleDefinition({
    version: 1,
    contentVersion: 'chapter-one-sl12@1',
    tickRate: 30,
    seed,
    provenance: [
      { ruleId: 'sl12.geometry', origin: 'canonical', source: 'game/src/data/levels/level1-geometry.json' },
      { ruleId: 'sl12.stop-points', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
      { ruleId: 'role1.combat', origin: 'canonical', source: 'game/src/adapters/combatCoreDefinition.ts' },
      { ruleId: 'role1.skill.slz', origin: 'canonical', source: 'game/src/systems/skillDamageReal.ts' },
    ],
    hero: compileWukongBattleHero(source.heroStart, bounds, profile),
    monsters: {
      monster8: compileChapterOneMonster('monster8', bounds),
      monster7: compileChapterOneMonster('monster7', bounds),
      monster4: compileChapterOneMonster('monster4', bounds),
      monster2: compileChapterOneMonster('monster2', bounds),
    },
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
    },
  })
}
