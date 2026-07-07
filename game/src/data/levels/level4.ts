// Level 4 — 邪念之境 (Corrupted Disciples gauntlet), ported from 4.swf.
//
// Provenance: 4.swf has only ONE sub-stage (StageListener41 — no 42/43 exist
// in 打开我开始玩.swf, unlike level 2's three-scene structure), matching the
// recon's "small level" call. Its roster is Monster31/32/33/34 (bg41 only,
// floorBg4, files4 — no bg42/43). Read directly from
// scripts/export/level/StageListener41.as:
//   waitForRegisterDataArray = ["Monster31","Monster32","Monster33","Monster34"]
//   start() { TweenMax.delayedCall(3, () => MainGame.getInstance().createMonster(32, 800, 300)) }
// i.e. the level does NOT spawn all four at once — it spawns Monster32 after
// a 3s delay, and the REST of the chain is wired through each monster's own
// destroy() override, read directly from each Monster3N.as:
//   Monster32.destroy() -> createMonster(33, 800, 300)
//   Monster33.destroy() -> createMonster(31, 800, 300)
//   Monster31.destroy() -> createMonster(34, 800, 300)
//   Monster34.destroy() -> if(isBoss) reveal every transferDoor (the ONLY one
//     of the four with this check, even though all four set isBoss=true in
//     their constructors) — confirmed from AS3, not guessed from hp.
// So the real game is a strictly SEQUENTIAL one-at-a-time boss chain:
// 邪.沙僧(Monster32) -> 邪.八戒(Monster33) -> 邪.唐僧(Monster31) -> 邪.悟空(Monster34, final).
//
// STRUCTURAL ADAPTATION (documented per project convention — platform-shape
// mismatch, not a bug): level.ts's LevelDef models "grunt waves that escalate
// to one boss", built for level 2's shape. Level 4 has NO grunts at all —
// every one of its four monsters is a full isBoss=true unit with tens of
// thousands of hp and an 8-14 row attack table, fought one at a time. The
// closest-fitting adaptation: each non-final monster becomes its own
// single-member "wave" (stop point), in the exact real spawn order
// (32 -> 33 -> 31), and the true final species (34, confirmed above) is the
// LevelDef's `boss`. This reproduces the real sequential gate (stop point N+1
// cannot spawn until N's sole monster is dead, exactly like the original
// destroy()-chained createMonster calls) using the existing wave-clear state
// machine verbatim — no changes to systems/level.ts were needed or made.
//
// STATS ARE REAL, recovered verbatim from each export.monster.Monster3N
// constructor in 打开我开始玩.swf. Unlike level 2's monsters, NONE of these
// four have a gc.curStage/curLevel branch — each constructor is a single
// unconditional form, so there is no branch-selection question here.
// normalAttackRate is a literal 0.8 for all four (each constructor sets it
// to 0.25 first, then overwrites it to 0.8 later in the same constructor —
// the later literal assignment wins; same pattern as level 2's Monster6).
// `protectedParamsObject.probability` (0.2/0.4/0.3/0.2) also exists per
// monster but is unused here since a literal normalAttackRate already covers
// the MonsterStats field per the playbook's branch-priority rule.
//
// BALANCE CAVEAT: as with level 2, these are the original game's absolute
// magnitudes (hp 37k-68k — noticeably higher than level 2's kings, consistent
// with this being a later, harder level) and the remake hero is tuned against
// level.ts's small invented numbers. Kept real for fidelity; the internal
// escalation that matters (every one of these four out-tanks every level-2
// unit, and 八戒 > 悟空 > 沙僧 > 唐僧 in raw hp even though 悟空 is the true
// gate) is preserved and asserted in the test.
//
// INTERFACE GAP (reported to team-lead, same as level 2): `MonsterSpeciesId`
// and `MONSTER_SPECIES_STATS` in systems/level.ts are a closed union/Record
// over level-1's seven sprites only. Level 4 introduces monster31/32/33/34,
// none of which are in that union. Cast to MonsterSpeciesId at the single
// documented `unit()` helper below (runtime-safe, species is an opaque
// label) — still blocked from joining `LEVELS`/BattleScene until the union
// is widened or stats presets move to the data layer. Both files remain
// off-limits to this team.

import type { MonsterStats } from '../../systems/monsterSim'
import type { LevelDef, MonsterSpawnSpec, MonsterSpeciesId, WaveSpec } from '../../systems/level'

/** Real recovered per-species stats for level 4 (see file header). Every
 * species here is a full isBoss=true unit — there is no grunt tier in this
 * level, unlike level 2. */
export const LEVEL4_MONSTER_STATS: Record<string, MonsterStats> = {
  monster31: { hp: 37563, speed: 8, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 70 },
  monster32: { hp: 42351, speed: 8, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 65 },
  monster33: { hp: 67612, speed: 8, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 100 },
  monster34: { hp: 54423, speed: 8, attackRange: 250, alertRange: 1000, normalAttackRate: 0.8, def: 80 },
}

// Human-readable names, for HP-bar labels (recovered `monsterName`).
export const LEVEL4_MONSTER_NAMES: Record<string, string> = {
  monster31: '邪.唐僧',
  monster32: '邪.沙僧',
  monster33: '邪.八戒',
  monster34: '邪.悟空',
}

// See INTERFACE GAP note: `as MonsterSpeciesId` is the single documented cast
// point until level.ts's union is widened.
function unit(species: string): MonsterSpawnSpec {
  return { species: species as MonsterSpeciesId, stats: LEVEL4_MONSTER_STATS[species] }
}

function wave(...species: string[]): WaveSpec {
  return { roster: species.map(unit) }
}

// Layout constants mirror BattleScene's single-screen world (same values
// level.ts/level2.ts hard-code as SHARED_DOOR / SHARED_ARENA_BOUNDS
// placeholders).
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

export const LEVEL_4_XIENIAN: LevelDef = {
  id: 'level-4',
  name: '邪念之境',
  spawnIntervalMs: 6000,
  stopPoints: [
    // Real spawn order per the destroy()-chain: 32 -> 33 -> 31, each a
    // single-member "wave" reproducing the original one-at-a-time gate.
    wave('monster32'), // 邪.沙僧, first
    wave('monster33'), // 邪.八戒, second (highest hp of the chain)
    wave('monster31'), // 邪.唐僧, third
  ],
  boss: {
    species: 'monster34' as MonsterSpeciesId,
    stats: LEVEL4_MONSTER_STATS.monster34,
    label: LEVEL4_MONSTER_NAMES.monster34, // 邪.悟空
  },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}
