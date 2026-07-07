// Level 2 — 天王关 (Four Heavenly Kings gauntlet), ported from 2.swf.
//
// Provenance: 2.swf's three sub-stages (StageListener21/22/23 in the main
// logic SWF 打开我开始玩.swf) chain grunts (Monster9/10/19) across three
// scenes, escalating through three of the Four Heavenly Kings as bosses:
//   scene 1 (StageListener21) -> 增长天王  Monster6  (sub-boss)
//   scene 2 (StageListener22) -> 广目天王  Monster16 (sub-boss)
//   scene 3 (StageListener23) -> 多闻天王  Monster15 (final boss, fb/dungeon gate)
// Compressed here into level.ts's single-level LevelDef model: the two
// sub-bosses appear as heavy members of grunt waves, and 多闻天王 is the
// arena boss.
//
// STATS ARE REAL, recovered verbatim from each export.monster.MonsterN
// constructor in 打开我开始玩.swf (hp/def/speed/attackRange/alertRange) — unlike
// level.ts's LEVEL_1/LEVEL_2, whose numbers are that port's own tuning
// because no stats had been recovered for those sprites. Branch selection:
//   - grunts (9/10/19): the `else` branch (the non-`gc.curStage==9` path) —
//     their level-2 grunt form (hp 1200-1800, def 9-12), NOT the stage-9
//     elite form (hp 25000-33000).
//   - kings (6/16/15): the `else`/isBoss=true branch — their level-2 boss
//     form, NOT the `gc.curStage==3&&curLevel==3 || curStage==8` elite form.
// The one adaptation: `normalAttackRate`. Monster6 sets a literal
// `normalAttackRate = 0.8`; Monster15/16 expose only `probability` (special-
// skill chance) which we reuse as the rate (0.4 / 0.45). The grunts set
// `probability = 0` (they melee on contact, no ranged-skill roll) — mapping
// that to a 0 attack rate would make them inert in monsterSim, so grunts use
// 0.35 as a faithful "they do melee" stand-in (documented, not recovered).
//
// BALANCE CAVEAT: these are the original game's absolute magnitudes (boss hp
// up to 16000). The current remake hero (BattleScene) is tuned against
// level.ts's small invented numbers (monster3 boss = 400 hp). Dropping real
// values in makes the level unwinnable until the hero's original-scale damage
// is ported too. That is a separate task; kept real here because fidelity is
// the mandate and the wave-clear sim does not depend on absolute hp. The
// difficulty ordering that matters (grunt < 增长 7874 < 广目 12000 < 多闻 16000)
// is preserved regardless.
//
// Species outside level 1's roster (monster6/9/10/15/16/19) are plain string
// ids: `MonsterSpeciesId` is now `string` in systems/level.ts (the closed
// union was reopened by the lead so data-layer level packs can carry their own
// species; level.ts keeps a private `BuiltinSpeciesId` union only for level
// 1's own preset table). No casts needed.

import type { MonsterStats } from '../../systems/monsterSim'
import type { LevelDef, MonsterSpawnSpec, WaveSpec } from '../../systems/level'

/** Real recovered per-species stats for level 2 (see file header). */
export const LEVEL2_MONSTER_STATS: Record<string, MonsterStats> = {
  // grunts (else-branch)
  monster9: { hp: 1500, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.35, def: 10 },
  monster10: { hp: 1800, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.35, def: 12 },
  monster19: { hp: 1200, speed: 4, attackRange: 300, alertRange: 250, normalAttackRate: 0.35, def: 9 },
  // Heavenly Kings (level-2 boss branch)
  monster6: { hp: 7874, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 15 },
  monster16: { hp: 12000, speed: 5, attackRange: 150, alertRange: 1000, normalAttackRate: 0.45, def: 18 },
  monster15: { hp: 16000, speed: 5, attackRange: 250, alertRange: 1000, normalAttackRate: 0.4, def: 24 },
}

// Human-readable boss names, for HP-bar labels (recovered `monsterName`).
export const LEVEL2_MONSTER_NAMES: Record<string, string> = {
  monster6: '增长天王',
  monster16: '广目天王',
  monster15: '多闻天王',
}

function unit(species: string): MonsterSpawnSpec {
  return { species, stats: LEVEL2_MONSTER_STATS[species] }
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

export const LEVEL_2_TIANWANG: LevelDef = {
  id: 'level-2',
  name: '天王关',
  spawnIntervalMs: 6000,
  stopPoints: [
    // scene 1 — opening grunts, then 增长天王 joins a grunt wave
    wave('monster9', 'monster10'),
    wave('monster9', 'monster19', 'monster6'),
    // scene 2 — grunts, then 广目天王
    wave('monster10', 'monster19', 'monster9'),
    wave('monster19', 'monster10', 'monster16'),
    // scene 3 — final grunt wave before the boss arena
    wave('monster9', 'monster10', 'monster19'),
  ],
  boss: {
    species: 'monster15',
    stats: LEVEL2_MONSTER_STATS.monster15,
    label: LEVEL2_MONSTER_NAMES.monster15, // 多闻天王
  },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}
