// Per-monster kill-exp, recovered verbatim from the original client's AS3 so
// the campaign's leveling economy stops running on a flat placeholder.
//
// ## Source of truth (源优先级纪律: 原版主逻辑 SWF 反编译 > kagami/占位值)
//
// Decompiled from `打开我开始玩.swf` via ffdec:
//   java -jar tools/ffdec/ffdec-cli.jar \
//     -selectclass export.monster.Monster1,...,Monster34,base.BaseMonster \
//     -export script <out> "vendor/.../打开我开始玩.swf"
//
// `base.BaseMonster.as` awards `protectedParamsObject.exp` to the hero (and,
// with an active pet, to the pet too — a double-award, see progression.ts
// PET_SHARED_EXP_RATIO; we have no pet, so single-award) on death. Each
// `export.monster.MonsterN` constructor sets its own base `exp`. Values below
// are the NORMAL-difficulty base; `gc.difficulity == 1` (hard) multiplies exp
// by 1.842 in BaseMonster (not applied here — this project has no difficulty
// select yet).
//
// Branch-selected monsters (one `exp` per spawn context) are resolved to the
// level this campaign actually spawns them in, matching how level{1..4}.ts
// resolved the same monsters' hp/def branches:
//   - Monster9/10/19: the `else` branch (level-2 grunt form) exp 6/6/28, NOT
//     the `gc.curStage==9` elite form (60/70/80).
//   - Monster20 (袁洪): 380 in both hp branches (the line-484 exp=0 is a
//     never-reached fsCount==99999999 self-destruct edge).
//   - Monster30 (swarm imp): base 4, but BaseMonster zeroes it once the hero
//     is level >= 10 (an anti-farm gate on the hp-1 imp). We store the base 4;
//     honoring the level-10 cutoff is a wiring-layer choice (see report).
//
// See tasks/hero-survivability-report.md §exp for the recovered-value table and
// the natural-playthrough level trajectory this produces.

/** Real (normal-difficulty) base kill-exp per monster species. */
export const MONSTER_BASE_EXP: Record<string, number> = {
  // L1 巫鹰关
  monster8: 5,
  monster7: 6,
  monster30: 4,
  monster4: 20, // 千里眼
  monster2: 20, // 顺风耳
  monster5: 35, // 巨灵神
  monster3: 7, // 巫鹰 (boss)
  // L2 天王关
  monster9: 6,
  monster10: 6,
  monster19: 28,
  monster6: 70, // 增长天王
  monster16: 100, // 广目天王
  monster15: 130, // 多闻天王 (boss)
  // L3
  monster11: 88,
  monster12: 96,
  monster13: 104,
  monster14: 112,
  monster1: 80,
  monster21: 280, // 朱子真
  monster20: 380, // 袁洪
  monster22: 430, // 二郎神 (boss)
  // L4 邪念之境
  monster32: 500, // 邪.沙僧
  monster33: 500, // 邪.八戒
  monster31: 500, // 邪.唐僧
  monster34: 500, // 邪.悟空 (boss)
}

/** Fallback for any species not in the table (e.g. a future level pack that
 * hasn't had its exp recovered yet). Small so an unmapped monster can't
 * accidentally inflate leveling. */
export const DEFAULT_MONSTER_EXP = 10

/**
 * Campaign-wide exp multiplier. NOT a fudge on the original per-monster exp —
 * those (MONSTER_BASE_EXP) are the faithful recovered values, kept as-is. This
 * is a named, reversible compensation for a STRUCTURAL choice this project made:
 * it compresses each of the original's multi-stage tower climbs into 4-6 waves
 * (L4 is 4 kills), so the original's swarm+replay kill count — which its exp
 * curve (progression.ts, untouched) is calibrated for — never happens. Same
 * nature as heroSurvivability's growth-substitute scale: an explicit stand-in
 * for a missing layer, to be lowered when the campaign gets real wave density
 * post-hackathon.
 *
 * Set to 6 (team-lead sign-off 2026-07-07). Rationale/derivation: a natural
 * single playthrough at 1 reaches only ~lv3 / lv8 / lv11 by the L2 / L3 / L4
 * boss — short of the survivability model's winnable 到关等级 (L3 ~lv15,
 * L4 ~lv21). The steep curve makes no single multiplier hit both milestones
 * exactly, but 6 lands L3≈16 / L4≈20, inside the lv15±1 / lv21±2 target band.
 * See tasks/hero-survivability-report.md 续单二.
 */
export const CAMPAIGN_EXP_MULTIPLIER = 6

/** Kill-exp awarded for a monster species, after the campaign multiplier. */
export function monsterExp(species: string): number {
  const base = MONSTER_BASE_EXP[species] ?? DEFAULT_MONSTER_EXP
  return Math.round(base * CAMPAIGN_EXP_MULTIPLIER)
}
