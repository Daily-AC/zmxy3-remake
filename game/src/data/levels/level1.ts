// Stage 1 levels recovered from 1.swf/stageInfo.
//
// The AS3 digits are stage + level coordinates: sl11 is 九重天, sl12 is
// 天宫道 and sl13 is 南天门. They are separate world-map levels, not one chain.
// Each stays represented as a one-substage chain so the recovered climb/wall/
// transfer-door runtime can be shared without flattening its geometry.
//
// Provenance: 1.swf's three stage-one levels (StageListener11/12/13):
//   - Stage 11 is a vertical climb: a swarm of Monster30 (真·hp 1, speed 8 —
//     the fast/fragile flying imps) spawns in waves while the hero ascends;
//     reaching the summit fires StageListener11.callBoss() -> createMonster(3)
//     = 巫鹰 (Monster3), the level's arena boss (the only monster gated
//     `isBoss=true` on `gc.curStage==1 && gc.curLevel==1`).
//   - Stage 12: 5 StopPoints and 13 MonsterAppearPoints recovered from the
//     official stageInfo scene. The final stop contains 千里眼(M4)+顺风耳(M2).
//   - Stage 13 roster: grunts Monster8/7, Monster30 swarm + 巨灵神(M5).
// sl13 remains available as deferred 南天门 data; it is not fused into L1/L2.
//
// Active L1/L2 stats are recovered verbatim from the official stageInfo
// export.monster.MonsterN constructors:
//   grunts:  Monster8 hp80/def2, Monster7 hp150/def4 (hit2 is the known
//            out-of-bounds-row original bug — see monster7.json), Monster30
//            hp1/def0/mDef0.5/speed8 (a one-shot swarm imp).
//   minibs:  千里眼 M4 hp1000/def8, 顺风耳 M2 hp1800/def10.
//   boss:    巫鹰 M3 hp160/def6, attacks hit1 phys 14 / hit2 magic 7.
// Monster5 belongs only to the deferred sl13 data and keeps its separately
// recovered tuning; it is not part of the active two-level campaign.
//
// BALANCE CAVEAT: same as level2/3/4 — these are original magnitudes; the hero
// damage/skill formulas are being switched to the original coord in parallel,
// which is exactly what this pack is aligning level 1 to.
//
// normalAttackRate mapping: official BaseMonster defaults to 0.5. A species uses
// a different value only when its own constructor assigns a literal
// `this.normalAttackRate = X`: Monster5.as:14 -> 0.8, Monster30.as:17 -> 0.25.
// Monster2/3/4/7/8 do not override it; their `_anti.probability`
// is a separate special-skill chance, not the base hit1 roll.

import type { MonsterStats } from '../../systems/monsterSim'
import type { LevelDef, MonsterSpawnSpec, SubStageChainDef, WaveSpec } from '../../systems/level'
import type { Wall } from '../../systems/platformSim'

/** Real recovered per-species stats for level 1 (see file header). */
export const LEVEL1_MONSTER_STATS: Record<string, MonsterStats> = {
  // grunts / swarm (level-1 form)
  monster8: { hp: 80, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.5, def: 2 },
  monster7: { hp: 150, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.5, def: 4 },
  monster30: {
    hp: 1,
    speed: 8,
    attackRange: 250,
    alertRange: 1000,
    normalAttackRate: 0.25,
    def: 0,
    mDef: 0.5,
  },
  // 天宫道双将
  monster4: { hp: 1000, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.5, def: 8 }, // 千里眼
  monster2: { hp: 1800, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.5, def: 10 }, // 顺风耳
  monster5: { hp: 4000, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 12 }, // 巨灵神
  // arena boss
  monster3: { hp: 160, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.5, def: 6 }, // 巫鹰
}

// Human-readable names, for HP-bar labels (recovered `monsterName`).
export const LEVEL1_MONSTER_NAMES: Record<string, string> = {
  monster4: '千里眼',
  monster2: '顺风耳',
  monster5: '巨灵神',
  monster3: '巫鹰',
}

function unit(species: string): MonsterSpawnSpec {
  return { species, stats: LEVEL1_MONSTER_STATS[species] }
}

function wave(...species: string[]): WaveSpec {
  return { roster: species.map(unit) }
}

function appearPoint(
  species: string,
  x: number,
  delaySeconds: number,
  intervalSeconds: number,
  quantity: number,
): MonsterSpawnSpec {
  return {
    ...unit(species),
    x,
    delayMs: delaySeconds * 1000,
    intervalMs: intervalSeconds * 1000,
    quantity,
  }
}

const SL11_BOUNDS = { left: 0, right: 1132, top: -2150, bottom: 430 }
const SL12_BOUNDS = { left: -195.997, right: 5019.33, top: -138.582, bottom: 540 }
const SL13_BOUNDS = { left: -24.997, right: 4996.35, top: -150.582, bottom: 540 }

// Adapted fallback geometry used only when game/src/data/levels/level1-geometry.json
// has not landed from the parallel mining task yet. Coordinates stay in the
// same identity AS3 scene-coordinate space as the real contract.
const SL11_FALLBACK_WALLS: Wall[] = [
  { type: 'solid', x: 360, y: 400, width: 360, height: 40 },
  { type: 'through', x: 640, y: 250, width: 180, height: 18 },
  { type: 'through', x: 420, y: 80, width: 180, height: 18 },
  { type: 'throughUpButDown', x: 650, y: -120, width: 180, height: 18 },
  { type: 'through', x: 400, y: -340, width: 190, height: 18 },
  { type: 'through', x: 660, y: -590, width: 190, height: 18 },
  { type: 'throughUpButDown', x: 390, y: -850, width: 210, height: 18 },
  { type: 'through', x: 650, y: -1120, width: 210, height: 18 },
  { type: 'through', x: 370, y: -1400, width: 230, height: 18 },
  { type: 'through', x: 650, y: -1680, width: 230, height: 18 },
  { type: 'through', x: 440, y: -1950, width: 320, height: 24 },
]

const SL12_WALLS: Wall[] = [{ type: 'solid', x: -180.629, y: 501.05, width: 5199.959, height: 20 }]
const SL13_WALLS: Wall[] = [{ type: 'solid', x: -3.65, y: 501, width: 5000, height: 39.999 }]

const SL12_DOOR = { x: 4520.9, y: 341.65, width: 185.8, height: 165 }
const SL13_DOOR = { x: 4059.3, y: 342.45, width: 185.8, height: 165 }

const SL12_WAVES: WaveSpec[] = [
  {
    stopX: 1147.4,
    roster: [appearPoint('monster8', 347.6, 2, 1, 4), appearPoint('monster8', 967.55, 2, 1, 4)],
  },
  {
    stopX: 1809.7,
    roster: [
      appearPoint('monster7', 1266.7, 6, 1, 3),
      appearPoint('monster8', 1521.4, 2, 1, 5),
      appearPoint('monster7', 1783.5, 6, 1, 3),
    ],
  },
  {
    stopX: 2813.95,
    roster: [appearPoint('monster7', 1948.8, 2, 1, 6), appearPoint('monster7', 2661.45, 2, 1, 6)],
  },
  {
    stopX: 3790.2,
    roster: [
      appearPoint('monster7', 2945.25, 2, 1, 3),
      appearPoint('monster8', 2888.95, 6, 1, 3),
      appearPoint('monster7', 3559.3, 2, 1, 4),
      appearPoint('monster8', 3635.4, 6, 1, 3),
    ],
  },
  {
    stopX: 4661.55,
    roster: [appearPoint('monster4', 4009.8, 2, 1, 1), appearPoint('monster2', 4606.85, 2, 1, 1)],
  },
]

const SL13_WAVES: WaveSpec[] = [
  wave('monster8', 'monster7', 'monster30', 'monster30'),
  wave('monster5'), // 巨灵神
]

export const LEVEL_1_SL12: LevelDef = {
  id: 'level-1-sl12',
  name: '天宫道',
  spawnIntervalMs: 6000,
  stopPoints: SL12_WAVES,
  // Not used as an arena boss in the L1 substage flow; kept to reuse LevelDef's
  // existing stop-point runtime without mutating that contract.
  boss: { species: 'monster4', stats: LEVEL1_MONSTER_STATS.monster4, label: LEVEL1_MONSTER_NAMES.monster4 },
  door: SL12_DOOR,
  arenaBounds: SL12_BOUNDS,
}

export const LEVEL_1_SL13: LevelDef = {
  id: 'level-1-sl13',
  name: '南天门',
  spawnIntervalMs: 6000,
  stopPoints: SL13_WAVES,
  // Not used as an arena boss in the L1 substage flow; see LEVEL_1_SL12.
  boss: { species: 'monster5', stats: LEVEL1_MONSTER_STATS.monster5, label: LEVEL1_MONSTER_NAMES.monster5 },
  door: SL13_DOOR,
  arenaBounds: SL13_BOUNDS,
}

export const LEVEL_1_WUYING: SubStageChainDef = {
  id: 'level-1',
  name: '九重天',
  subStages: [
    {
      id: 'sl11',
      name: '九重天 · 爬塔',
      mode: 'climb',
      bounds: SL11_BOUNDS,
      door: { x: 1000, y: -2110, width: 90, height: 180 },
      heroStart: { x: 480, y: 400 },
      background: { base: 'bg11' },
      fallbackWalls: SL11_FALLBACK_WALLS,
      continuousSpawner: {
        initialDelayMs: 3000, // StageListener11: 72 frames / Config.frameClips(24)
        intervalMs: 6000, // StageListener11: frameClips * 6 = 144 frames / 24fps
        count: 2,
        roster: [unit('monster30')],
        offsetX: { min: -150, max: 150 },
        offsetY: { min: -300, max: -100 },
        heightTrigger: {
          thresholdY: -1900,
          boss: {
            species: 'monster3',
            stats: LEVEL1_MONSTER_STATS.monster3,
            label: LEVEL1_MONSTER_NAMES.monster3,
            x: 750,
            // Align the boss registration point with the top platform. The
            // old -2050 marker left its visible feet far above WuKong and the
            // carved beam, so jumping through it revealed no physical body.
            y: -1872.45,
          },
        },
      },
    },
  ],
}

export const LEVEL_2_TIANGONGDAO: SubStageChainDef = {
  id: 'level-2',
  name: '天宫道',
  subStages: [
    {
      id: 'sl12',
      name: '天宫道',
      mode: 'horizontal',
      bounds: SL12_BOUNDS,
      door: SL12_DOOR,
      heroStart: { x: 180, y: 400 },
      background: {
        base: 'floorBg1',
        foreground: 'bg12',
        floor: 'online_floor12_full',
        floorX: -200,
        scrollFactorX: 0.112,
      },
      fallbackWalls: SL12_WALLS,
      waveLevel: LEVEL_1_SL12,
    },
  ],
}

/** Deferred stage-one level 3 data; kept out of the active two-level campaign. */
export const LEVEL_3_NANTIANMEN: SubStageChainDef = {
  id: 'level-3-nantianmen',
  name: '南天门',
  subStages: [
    {
      id: 'sl13',
      name: '南天门',
      mode: 'horizontal',
      bounds: SL13_BOUNDS,
      door: SL13_DOOR,
      heroStart: { x: 180, y: 400 },
      background: { base: 'floorBg1', foreground: 'bg13', floor: 'online_floor13', scrollFactorX: 0.112 },
      fallbackWalls: SL13_WALLS,
      waveLevel: LEVEL_1_SL13,
    },
  ],
}
