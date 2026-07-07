// Level 1 — 巫鹰关 (the climb to the demon bird), ported from 1.swf.
//
// This REPLACES the project's original hand-made level 1: the placeholder
// LEVEL_1 in systems/level.ts uses monster30/2/4/7/8 with INVENTED small stats
// (that port's own tuning, e.g. monster30 hp 150) because it predates the
// asset-pipeline. This pack carries the REAL recovered numbers so level 1 stops
// being the campaign's only non-original level once the wiring pen swaps it in
// as the LEVELS chain head. Same data-layer shape as level2/3/4.ts; level.ts is
// not touched.
//
// Provenance: 1.swf's three sub-stages (StageListener11/12/13 in 打开我开始玩.swf):
//   - Stage 11 is a vertical climb: a swarm of Monster30 (真·hp 1, speed 8 —
//     the fast/fragile flying imps) spawns in waves while the hero ascends;
//     reaching the summit fires StageListener11.callBoss() -> createMonster(3)
//     = 巫鹰 (Monster3), the level's arena boss (the only monster gated
//     `isBoss=true` on `gc.curStage==1 && gc.curLevel==1`).
//   - Stage 12 roster: grunts Monster8/7 + mini-bosses 千里眼(M4)/顺风耳(M2).
//   - Stage 13 roster: grunts Monster8/7, Monster30 swarm + 巨灵神(M5).
// Compressed into level.ts's single-level LevelDef: the Monster30 climb-swarm
// and the three mini-bosses become escalating stop-point waves, and 巫鹰 is the
// arena boss.
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
import type { LevelDef, MonsterSpawnSpec, WaveSpec } from '../../systems/level'

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

// Layout constants mirror BattleScene's single-screen world (same values
// level.ts hard-codes as SHARED_DOOR / SHARED_ARENA_BOUNDS placeholders).
const WORLD_MIN_X = 90
const WORLD_MAX_X = 1460
const WORLD_GROUND_Y = 400
const SHARED_DOOR = { x: WORLD_MAX_X - 100, y: WORLD_GROUND_Y - 140, width: 100, height: 140 }
const SHARED_ARENA_BOUNDS = {
  left: WORLD_MIN_X,
  right: WORLD_MAX_X,
  top: WORLD_GROUND_Y - 360,
  bottom: WORLD_GROUND_Y + 40,
}

export const LEVEL_1_WUYING: LevelDef = {
  id: 'level-1',
  name: '巫鹰关',
  spawnIntervalMs: 6000,
  stopPoints: [
    // the climb — Monster30 swarm (hp 1 imps) with a grunt mixed in
    wave('monster30', 'monster30', 'monster30', 'monster8'),
    // mini-boss 千里眼
    wave('monster7', 'monster8', 'monster4'),
    // mini-boss 顺风耳
    wave('monster8', 'monster7', 'monster2'),
    // mini-boss 巨灵神 (heaviest wave)
    wave('monster7', 'monster30', 'monster5'),
  ],
  boss: {
    species: 'monster3',
    stats: LEVEL1_MONSTER_STATS.monster3,
    label: LEVEL1_MONSTER_NAMES.monster3, // 巫鹰
  },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}
