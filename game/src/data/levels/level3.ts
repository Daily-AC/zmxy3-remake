// Level 3 — 二郎神关 (Erlang Shen gauntlet), ported from 3.swf.
//
// Provenance: 3.swf's three sub-stages (StageListener31/32/33 in the main
// logic SWF 打开我开始玩.swf) chain grunts (Monster11/12/13, plus Monster1/14
// as extras — see below) across three scenes, escalating through two named
// elites and a final boss:
//   scene 1 (StageListener31, roster Monster11/12/13/21) -> 朱子真 Monster21
//     appears as a heavy inside the roster (curStage==3&&curLevel==3 branch:
//     isBoss=false, hp 20000 — an elite, not "the" boss)
//   scene 2 (StageListener32, roster Monster11/12/13/20) -> 袁洪 Monster20
//     appears as a heavy inside the roster (hp 30000; both of Monster20's
//     stat branches set isBoss=true, but only the curStage==3&&curLevel==3
//     branch's 30000 hp is used here — the 33000-hp branch is a different
//     level's tuning)
//   scene 3 (StageListener33, roster includes Monster11/12/13/14/20/21/22
//     plus several OTHER levels' species (Monster2/4/5/6/15/16) that are not
//     part of this level's asset pack and are excluded) -> Monster22 二郎神
//     is the arena boss.
// Monster1 and Monster23 are confirmed level-3 body monsters via symbolclass
// (3.swf chid9 and chid5) but do not appear in ANY StageListener's
// waitForRegisterDataArray. Monster1 is folded into the final grunt wave for
// asset completeness. Monster23 (哮天犬, Erlang Shen's companion dog) is, in
// the original, auto-spawned by Monster22's __added() override
// (`MainGame.getInstance().createMonster(23,...)`) rather than wave-spawned
// at all — folded into the final grunt wave here since LevelDef/BossSpec has
// no "companion" concept (see INTERFACE NOTE below). Its hp (9999999) is
// recorded verbatim — it's a scripted, effectively-unkillable companion in
// the original, not a normal kill target.
//
// STATS ARE REAL, recovered verbatim from each export.monster.MonsterN
// constructor in 打开我开始玩.swf (hp/def/speed/attackRange/alertRange),
// branch-selected for `gc.curStage==3 && gc.curLevel==3` where a monster has
// a stage/level-conditional branch (Monster20/21); Monster1/11/12/13/14/22/23
// have only a single unconditional branch.
// `normalAttackRate`: every grunt/elite here has a literal non-zero
// `protectedParamsObject.probability` (0.18 grunts, 0.3 Monster20/22, 0.35
// Monster21) — used directly, no stand-in needed. The ONE exception is
// Monster23 (哮天犬), whose `probability` is literally 0 (melee-on-contact,
// no ranged-skill roll); mapping that literally would make it inert in
// monsterSim, so it uses the same 0.35 "they do melee" stand-in level2.ts
// established for probability=0 grunts (documented, not recovered).
//
// BOSS MECHANIC — 二郎神 (Monster22) ERLANGSHEN_HP_REJECT (reverse-engineered
// from Monster22.as + Monster23.as + base/BaseAddEffect.as +
// base/BaseRoleProperies.as; NOT a "low-hp boss enrage" despite the name —
// it's a heal-block debuff applied to the HERO):
//   1. Trigger: 哮天犬 (Monster23)'s hit2 skill, on animation completion
//      (hit2Effect()), scans gc.pWorld.monsterArray for a live Monster22 and,
//      if found, calls Monster22.setAtkUp() (and its own setAtkUp()) — a
//      10s (`gc.frameClips*10`) self-buff that raises both units' attack
//      power (Monster22 hit1 279->345, hit2 999->1299, hit3 279->345, hit4
//      279->345; dog hit1/2/3 ->456) AND, starting with this first buff
//      cycle, permanently attaches an `addEffect` entry
//      `{name: ERLANGSHEN_HP_REJECT, time: gc.frameClips*30}` to Monster22's
//      hit4 attack definition (present in both setAtkUp() and resetAtk(),
//      absent from the original base constructor — i.e. hit4 only starts
//      threatening the debuff after the dog uses hit2 for the first time).
//   2. Two independent application paths once hit4 carries the addEffect:
//      a. Positional/facing check (checkDoHit4(), fires mid-animation at
//         frame 20, BEFORE the projectile spawns at frame 30): for each
//         player, if Erlang Shen faces them while they face AWAY from him
//         (back turned), the debuff is applied directly — no hit required.
//      b. Generic on-hit propagation (BaseMonster's connect-hit handler):
//         if hit4's attackBackInfoDict.addEffect is populated and the attack
//         actually connects, the debuff applies through the standard
//         addEffect pipeline too (base/BaseMonster.as ~line 622).
//   3. Effect (base/BaseRoleProperies.as `setHHP()`, ~line 745): while the
//      hero has the ERLANGSHEN_HP_REJECT buff, ANY attempt to set current HP
//      to a HIGHER value than it currently is (heal potion, HP regen,
//      lifesteal, etc.) is silently rejected/no-op'd; HP *decreases* (damage)
//      are unaffected. A `Monster22_ERLANGSHEN_HP_REJECT` child symbol is
//      attached to the hero while the buff is active (show_erlangshen /
//      hide_erlangshen in BaseAddEffect.as) as the visual tell.
//   In short: get caught with your back turned (or hit) during Erlang Shen's
//   hit4 while the dog has empowered him, and healing is locked out for 30s.
//   Thematically fits 二郎神's third-eye "sees everything" motif. NOT modeled
//   in monsterSim yet (monsterSim has no heal-block/addEffect concept) —
//   TODO-verify/non-blocking; recorded precisely here and in
//   tasks/level-pipeline-report.md for whoever wires hero healing next.
//
// BALANCE CAVEAT: same as level 2 — these are the original game's absolute
// magnitudes (arena boss hp 45137, nearly 3x level 2's 多闻天王). Unwinnable
// in-engine until the hero's original-scale damage is ported; kept real here
// because fidelity is the mandate.
//
// Species are plain string ids: MonsterSpeciesId is `string` in
// systems/level.ts (widened in commit 6cf311e so data-layer level packs carry
// their own species). No casts needed.

import type { MonsterStats } from '../../systems/monsterSim'
import type { LevelDef, MonsterSpawnSpec, WaveSpec } from '../../systems/level'

/** Real recovered per-species stats for level 3 (see file header). */
export const LEVEL3_MONSTER_STATS: Record<string, MonsterStats> = {
  // grunts (single-branch, no stage/level condition)
  monster1: { hp: 5200, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.18, def: 20 },
  monster11: { hp: 5100, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.18, def: 7 },
  monster12: { hp: 6500, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.18, def: 12 },
  monster13: { hp: 5000, speed: 3, attackRange: 400, alertRange: 700, normalAttackRate: 0.18, def: 14 },
  monster14: { hp: 8000, speed: 3, attackRange: 250, alertRange: 1000, normalAttackRate: 0.18, def: 27 },
  // elites (curStage==3 && curLevel==3 branch)
  monster21: { hp: 20000, speed: 6, attackRange: 250, alertRange: 1000, normalAttackRate: 0.35, def: 35 }, // 朱子真
  monster20: { hp: 30000, speed: 6, attackRange: 250, alertRange: 1000, normalAttackRate: 0.3, def: 36 }, // 袁洪
  // arena boss (single-branch)
  monster22: { hp: 45137, speed: 7, attackRange: 250, alertRange: 1000, normalAttackRate: 0.3, def: 45 }, // 二郎神
  // companion (probability=0 in source -> 0.35 melee stand-in, see file header)
  monster23: { hp: 9999999, speed: 5, attackRange: 200, alertRange: 1000, normalAttackRate: 0.35, def: 100 }, // 哮天犬
}

// Human-readable names, for HP-bar labels (recovered `monsterName`; grunts
// have none set in source).
export const LEVEL3_MONSTER_NAMES: Record<string, string> = {
  monster21: '朱子真',
  monster20: '袁洪',
  monster22: '二郎神',
  monster23: '哮天犬',
}

function unit(species: string): MonsterSpawnSpec {
  return { species, stats: LEVEL3_MONSTER_STATS[species] }
}

function wave(...species: string[]): WaveSpec {
  return { roster: species.map(unit) }
}

// Layout constants mirror BattleScene's single-screen world (same values
// level2.ts copies as SHARED_DOOR / SHARED_ARENA_BOUNDS placeholders).
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

export const LEVEL_3_ERLANGSHEN: LevelDef = {
  id: 'level-3',
  name: '二郎神关',
  spawnIntervalMs: 6000,
  stopPoints: [
    // scene 1 (StageListener31: 11/12/13/21) — opening grunts, then 朱子真 joins
    wave('monster11', 'monster12'),
    wave('monster13', 'monster11', 'monster21'),
    // scene 2 (StageListener32: 11/12/13/20) — grunts, then 袁洪 joins
    wave('monster12', 'monster13', 'monster11'),
    wave('monster13', 'monster12', 'monster20'),
    // scene 3 (StageListener33 approach) — final grunt wave before the arena;
    // folds in monster1 (asset-pack extra, no scene roster) and monster23
    // (哮天犬, normally boss-spawned, folded in here — see file header)
    wave('monster14', 'monster1', 'monster23', 'monster11', 'monster12', 'monster13'),
  ],
  boss: {
    species: 'monster22',
    stats: LEVEL3_MONSTER_STATS.monster22,
    label: LEVEL3_MONSTER_NAMES.monster22, // 二郎神
  },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}
