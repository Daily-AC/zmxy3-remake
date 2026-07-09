// Level 1 — 巫鹰关 (the climb to the demon bird), ported from 1.swf.
//
// This REPLACES the project's original hand-made level 1: the placeholder
// LEVEL_1 in systems/level.ts uses monster30/2/4/7/8 with INVENTED small stats
// (that port's own tuning, e.g. monster30 hp 150) because it predates the
// asset-pipeline. This pack carries the REAL recovered numbers and now models
// L1 as the original sl11 -> sl12 -> sl13 substage chain instead of one flat
// arena. sl12/sl13 still reuse level.ts's existing WaveSpec runtime internally;
// sl11 uses the new continuous-spawner mode.
//
// Provenance: 1.swf's three sub-stages (StageListener11/12/13 in 打开我开始玩.swf):
//   - Stage 11 is a vertical climb: a swarm of Monster30 (真·hp 1, speed 8 —
//     the fast/fragile flying imps) spawns in waves while the hero ascends;
//     reaching the summit fires StageListener11.callBoss() -> createMonster(3)
//     = 巫鹰 (Monster3), the level's arena boss (the only monster gated
//     `isBoss=true` on `gc.curStage==1 && gc.curLevel==1`).
//   - Stage 12 roster: grunts Monster8/7 + mini-bosses 千里眼(M4)/顺风耳(M2).
//   - Stage 13 roster: grunts Monster8/7, Monster30 swarm + 巨灵神(M5).
// sl12/sl13 combat placement is approximated as stop-point waves because the
// AS3 StageListener12 gate logic has no createMonster calls and StageListener13
// only preloads assets; static timeline placement is still pending geometry/
// scene mining. Boss-grade monsters stay separated from grunt rosters where
// the original data makes that clear.
//
// STATS ARE REAL, recovered verbatim from each export.monster.MonsterN
// constructor, branch-selected for the level-1 context (`gc.curStage==1 &&
// gc.curLevel==1`; grunts/mini-bosses take the `else` branch of their
// `curStage==3&&curLevel==3 || curStage==8` guard, i.e. their level-1 form):
//   grunts:  Monster8 hp80/def2, Monster7 hp150/def4 (hit2 is the known
//            out-of-bounds-row original bug — see monster7.json), Monster30
//            hp1/def0/speed8 (a one-shot swarm imp).
//   minibs:  千里眼 M4 hp1500/def8, 顺风耳 M2 hp2000/def10, 巨灵神 M5 hp4000/def12.
//   boss:    巫鹰 M3 hp300/def6 (5*60), attacks hit1 phys 14 / hit2 magic 7,
//            probability 1 in the boss branch.
//
// NOTE (original quirk, kept faithful): the named finale boss 巫鹰 (300 hp) is
// far squishier than the mini-bosses that precede it (巨灵神 4000 hp). In the
// original it's a gimmick bird chased to the climb summit, not a tank. The
// wave escalation (千里眼 1500 < 顺风耳 2000 < 巨灵神 4000) is monotonic; the
// arena boss is deliberately not the hp peak.
//
// BALANCE CAVEAT: same as level2/3/4 — these are original magnitudes; the hero
// damage/skill formulas are being switched to the original coord in parallel,
// which is exactly what this pack is aligning level 1 to.
//
// normalAttackRate mapping (per playbook §4): Monster5/Monster30 expose a
// literal `normalAttackRate` (0.8 / 0.25) — used directly. The others expose
// `probability` (special-skill chance), reused as the rate: 巫鹰 1.0, 顺风耳/
// 千里眼 0.6, grunts 0.15.

import type { MonsterStats } from '../../systems/monsterSim'
import type { LevelDef, MonsterSpawnSpec, SubStageChainDef, WaveSpec } from '../../systems/level'
import type { Wall } from '../../systems/platformSim'

/** Real recovered per-species stats for level 1 (see file header). */
export const LEVEL1_MONSTER_STATS: Record<string, MonsterStats> = {
  // grunts / swarm (level-1 form)
  monster8: { hp: 80, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.15, def: 2 },
  monster7: { hp: 150, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.15, def: 4 },
  monster30: { hp: 1, speed: 8, attackRange: 250, alertRange: 1000, normalAttackRate: 0.25, def: 0 },
  // mini-bosses (else-branch, isBoss=true in level 1)
  monster4: { hp: 1500, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.6, def: 8 }, // 千里眼
  monster2: { hp: 2000, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.6, def: 10 }, // 顺风耳
  monster5: { hp: 4000, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 12 }, // 巨灵神
  // arena boss
  monster3: { hp: 300, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 1, def: 6 }, // 巫鹰
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

const SL11_BOUNDS = { left: 0, right: 1132, top: -2150, bottom: 430 }
const SL_HORIZONTAL_BOUNDS = { left: 0, right: 4890, top: 0, bottom: 540 }

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

const SL12_WALLS: Wall[] = [{ type: 'solid', x: 0, y: 400, width: 4890, height: 60 }]
const SL13_WALLS: Wall[] = [{ type: 'solid', x: 0, y: 400, width: 4890, height: 60 }]

const SL_DOOR = { x: 4700, y: 300, width: 120, height: 160 }
const HORIZONTAL_ARENA_BOUNDS = {
  left: SL_HORIZONTAL_BOUNDS.left,
  right: SL_HORIZONTAL_BOUNDS.right,
  top: SL_HORIZONTAL_BOUNDS.top,
  bottom: SL_HORIZONTAL_BOUNDS.bottom,
}

const SL12_WAVES: WaveSpec[] = [
  wave('monster8', 'monster7', 'monster8'),
  wave('monster4'), // 千里眼
  wave('monster2'), // 顺风耳
]

const SL13_WAVES: WaveSpec[] = [
  wave('monster8', 'monster7', 'monster30', 'monster30'),
  wave('monster5'), // 巨灵神
]

export const LEVEL_1_SL12: LevelDef = {
  id: 'level-1-sl12',
  name: '九重天 · 天门前庭',
  spawnIntervalMs: 6000,
  stopPoints: SL12_WAVES,
  // Not used as an arena boss in the L1 substage flow; kept to reuse LevelDef's
  // existing stop-point runtime without mutating that contract.
  boss: { species: 'monster4', stats: LEVEL1_MONSTER_STATS.monster4, label: LEVEL1_MONSTER_NAMES.monster4 },
  door: SL_DOOR,
  arenaBounds: HORIZONTAL_ARENA_BOUNDS,
}

export const LEVEL_1_SL13: LevelDef = {
  id: 'level-1-sl13',
  name: '九重天 · 南天门',
  spawnIntervalMs: 6000,
  stopPoints: SL13_WAVES,
  // Not used as an arena boss in the L1 substage flow; see LEVEL_1_SL12.
  boss: { species: 'monster5', stats: LEVEL1_MONSTER_STATS.monster5, label: LEVEL1_MONSTER_NAMES.monster5 },
  door: SL_DOOR,
  arenaBounds: HORIZONTAL_ARENA_BOUNDS,
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
            y: -2050,
          },
        },
      },
    },
    {
      id: 'sl12',
      name: '九重天 · 天门前庭',
      mode: 'horizontal',
      bounds: SL_HORIZONTAL_BOUNDS,
      door: SL_DOOR,
      heroStart: { x: 180, y: 400 },
      background: { base: 'bg12', floor: 'online_floor12' },
      fallbackWalls: SL12_WALLS,
      waveLevel: LEVEL_1_SL12,
    },
    {
      id: 'sl13',
      name: '九重天 · 南天门',
      mode: 'horizontal',
      bounds: SL_HORIZONTAL_BOUNDS,
      door: SL_DOOR,
      heroStart: { x: 180, y: 400 },
      background: { base: 'bg13', floor: 'online_floor13' },
      fallbackWalls: SL13_WALLS,
      waveLevel: LEVEL_1_SL13,
    },
  ],
}
