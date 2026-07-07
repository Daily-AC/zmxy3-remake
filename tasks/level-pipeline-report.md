# Level pipeline report

One section per ported level. Appended as levels land.

---

## Wave-ordering fix (2026-07-07, user-reported)

**Bug (user):** "出怪顺序很迷，有时候直接把 boss 出来了，相当于把 boss 当小兵" — sub-boss/boss-grade monsters were spawning inside ordinary grunt waves (screenshot: several 天王 together in a normal L2 fight).

**Root cause (mine):** the pilot + workers folded sub-bosses into grunt-wave rosters as "heavies." Worst offender was L3's 哮天犬 (hp 9,999,999) sitting in a grunt wave as an effectively-unkillable trash mob.

**Fix:** every level's `stopPoints` restructured to a clean tier split — pure escalating grunt waves first, then each sub-boss as its OWN solo stop point, then the arena boss. Enforced by a new per-level vitest invariant: (1) any wave with a boss-tier species is that species alone, (2) each sub-boss gets exactly one solo wave, (3) all grunt waves precede all sub-boss waves, (4) the arena boss never appears in a wave. All 26 level tests green.

Before → after (roster per stop point; **bold** = boss-tier monster that was mis-mixed):

| Level | Before | After |
| --- | --- | --- |
| L1 巫鹰关 | [30,30,30,8] · [7,8,**4**] · [8,7,**2**] · [7,30,**5**] → boss 3 | [8,8,30] · [30,30,30,8] · [7,7,8] · [**4**] · [**2**] · [**5**] → boss 3 |
| L2 天王关 | [9,10] · [9,19,**6**] · [10,19,9] · [19,10,**16**] · [9,10,19] → boss 15 | [9,10] · [10,19,9] · [19,10,9,19] · [**6**] · [**16**] → boss 15 |
| L3 二郎神关 | [11,12] · [13,11,**21**] · [12,13,11] · [13,12,**20**] · [14,1,**23**,11,12,13] → boss 22 | [11,12] · [13,11,12] · [14,1,13,11] · [**21**] · [**20**] → boss 22 |
| L4 邪念之境 | [32] · [33] · [31] → boss 34 (already clean) | unchanged — each disciple already solo |

L3 note: 哮天犬 (monster23) removed from waves entirely — it is 二郎神's auto-spawned companion (`Monster22.__added → createMonster(23)`), never a grunt; belongs with the boss once a companion mechanic exists. Its stats/JSON are retained.

---

## Level 1 — 巫鹰关 (climb to the demon bird)

**Ported by:** pipeline main (Opus). **Source:** `out_res/1.swf` + `打开我开始玩.swf`. Landed last (2026-07-07) but is campaign level 1: it REPLACES the project's original hand-made level 1, which was the only non-original level left — `systems/level.ts`'s placeholder `LEVEL_1` uses invented small stats (e.g. monster30 hp 150). This pack carries the real recovered numbers so level 1 matches the original once the wiring pen swaps it in as the `LEVELS` chain head.

### Assets — already extracted (reused, verified against SWF)
`game/public/assets/extracted/level1/` (bg11/12/13, floorBg1, Monster2/3/4/5/7/8/30.png) and `game/src/data/monsters/monster{2,3,4,5,7,8,30}.json` already existed from the project's setup era. Verified: grids/cells match the SWF (`sips` + `new BaseBitmapDataClip(...)`), and `monster7.json` already omits its `hit2` per the known out-of-bounds-row bug. No re-extraction needed.

### Level data (`game/src/data/levels/level1.ts`)
`LEVEL_1_WUYING: LevelDef` — 4 stop-point waves + arena boss. Mirrors 1.swf's three sub-stages (StageListener11/12/13): stage 11 is a vertical climb through a Monster30 swarm that ends in `StageListener11.callBoss() -> createMonster(3)` = 巫鹰; stages 12/13 add grunts + mini-bosses. Compressed to: a Monster30-swarm wave, then escalating mini-boss waves 千里眼→顺风耳→巨灵神, then 巫鹰 as the arena boss.

### Values / provenance
**All stats recovered VERBATIM**, branch-selected for `gc.curStage==1 && gc.curLevel==1` (grunts/mini-bosses take the `else` branch of their `curStage==3&&curLevel==3 || curStage==8` guard):
- grunts/swarm: Monster8 hp80/def2, Monster7 hp150/def4, **Monster30 hp1/def0/speed8** (a one-shot swarm imp — the headline correction vs the invented 150).
- mini-bosses (isBoss=true in level 1): 千里眼 M4 hp1500/def8, 顺风耳 M2 hp2000/def10, 巨灵神 M5 hp4000/def12.
- arena boss: 巫鹰 M3 hp300 (5*60)/def6, attacks hit1 phys 14 / hit2 magic 7, probability 1.
- `normalAttackRate`: Monster5/Monster30 have literal `normalAttackRate` (0.8/0.25) used directly; others reuse `probability` (巫鹰 1.0, 顺风耳/千里眼 0.6, grunts 0.15).

### Boss mechanics (巫鹰 / Monster3)
Simple two-attack flyer: hit1 physical (power 14, knockback [6,-5]), hit2 magic (power 7, interval 4), skillCD1 3f, drops a boss-tier fallList in the boss branch. No special gimmick (unlike level 3's 二郎神). **Original quirk kept faithful:** 巫鹰 (300 hp) is far squishier than the mini-bosses preceding it (巨灵神 4000 hp) — it's a gimmick summit boss, not a tank; the arena boss is deliberately not the hp peak. Wave escalation (1500<2000<4000) is monotonic.

### Acceptance
- `game/tests/level1.test.ts` — 4 tests green: genuine full wave-clear sim, boss spawn (300 hp) → kill → door → clear, real-magnitude assertions (Monster30 hp==1, not 150), boss-not-in-waves. `npx vitest run tests/level1.test.ts tests/level.test.ts` → 14 passed. No tsc errors in level1 files.
- Visual: `tools/level1-preview.html` (standalone) decodes all 7 sheets; screenshot `tmp/debug-shots/level1-monsters.png` — all frames align to cells cleanly; Monster7 correctly shows no hit2 row.

### Leftover / TODO
- Wiring (off-limits to this team): the wiring pen swaps `LEVEL_1_WUYING` in as the `LEVELS` head, replacing level.ts's invented `LEVEL_1`, and adds species→sprite mapping (the level-1 sheets are already in the repo and already render in the current game).
- Balance: this pack is precisely the level-1 alignment the parallel hero-damage-口径 switch is targeting.

---

## Level 2 — 天王关 (Four Heavenly Kings gauntlet) · pilot

**Ported by:** pipeline main (Opus). **Source:** `out_res/2.swf` + `打开我开始玩.swf`.

### Assets (`game/public/assets/extracted/level2/`)
- Backgrounds: `bg21.png` `bg22.png` `bg23.png` (4700×590 scroll panoramas, sprite-export), `floorBg2.png` (631×549, image-export).
- Monster body sheets (image-export, `<chid>_` prefix stripped): `Monster6.png` (2100×2800), `Monster9.png` (1200×1000), `Monster10.png` (1200×1000), `Monster15.png` (1800×2800), `Monster16.png` (1800×2400), `Monster19.png` (1200×1000).

### Action tables (`game/src/data/monsters/`)
`monster6/9/10/15/16/19.json` — grid + per-action row/frames/stopCounts/frameCount, decoded from each `export.monster.MonsterN.initBBDC()+setAction()`. Cell sizes vary per monster (200×200 grunts; 300×400 M6; 300×300 M16; 300×350 M15) — read from each `new BaseBitmapDataClip(...)`, never assumed.

### Level data (`game/src/data/levels/level2.ts`)
`LEVEL_2_TIANWANG: LevelDef` — 5 stop-point waves culminating in an arena boss. Structure mirrors 2.swf's three sub-stages (StageListener21/22/23): grunts Monster9/10/19 recurring, two Heavenly Kings (增长 M6, 广目 M16) folded into grunt waves as heavies, and 多闻天王 (M15) as the arena boss.

### Values / provenance
**All monster stats recovered VERBATIM** from the SWF constructors (hp/def/speed/attackRange/alertRange), branch-selected for the level-2 context:
- Grunts (else-branch, not the `gc.curStage==9` elite form): M9 hp1500/def10, M10 hp1800/def12, M19 hp1200/def9.
- Kings (isBoss=true branch, not the `curStage==3&&curLevel==3||curStage==8` elite form): 增长 M6 hp7874/def15, 广目 M16 hp12000/def18, 多闻 M15 hp16000/def24.
- One adaptation: `normalAttackRate`. M6 has a literal `0.8`; M15/M16 reuse their `probability` (0.4/0.45); grunts set `probability=0` (melee-on-contact, no ranged roll) → mapped to 0.35 as a "they do melee" stand-in (documented in level2.ts, not recovered).

### Boss mechanics (多闻天王 / Monster15)
Base recovered: hp 16000, def 24, attackRange 250, alertRange 1000, speed 5, exp 130. Four attacks: hit1 physical power 186; hit2/hit3/hit4 magic power 80/120/120. Skill cooldowns skillCD1=6f, skillCD2=20f, skillCD3=10f, special-skill probability 0.4. Bullets `Monster15Bullet1..4` (MovieClips in 2.swf) NOT yet extracted/wired — the sim uses the melee/attack-rate model only; projectile patterns are **TODO-verify** (marked, non-blocking). The reflect-style mechanics that exist for the level-3 二郎神 boss (HP_REJECT) are absent here — 多闻天王 is a straightforward multi-skill bruiser.

### Known original data bugs
- **Monster9 & Monster10 `hit2` point to a nonexistent sheet row.** `setAction case "hit2"` calls `setFramePointY(5)`, but both sheets are 1200×1000 = 5 rows (0–4) and `setFrameStopCount` defines only 5 rows. Row 5 does not exist. Same class of bug as Monster7's hit2 (documented in asset-pipeline-notes.md). `hit2` is omitted from both JSONs; the omission is noted in each `source` field. Do not author AI that relies on these grunts' hit2.
- Monster10 `setFrameCount` has 6 entries but stopCounts/sheet cap at 5 rows — extra entry ignored.

### Acceptance
- `game/tests/level2.test.ts` — 4 tests green: genuine full wave-clear sim (spawns each wave's real roster via monsterSim, kills them, drives the stop-point machine to boss trigger), boss spawn with recovered 16000 hp → kill → door → clear, internal difficulty escalation, boss-not-in-grunt-waves. `npx vitest run tests/level2.test.ts tests/level.test.ts` → 14 passed. `npx tsc --noEmit` → clean.
- Visual: `tools/level2-preview.html` (standalone, no BattleScene) decodes all 6 monster sheets and filmstrips every action from the recovered grids. Screenshot: `tmp/debug-shots/level2-monsters.png` — all frames align to cells cleanly (no half-cut sprites); 多闻天王 hit2 shows his signature umbrella, confirming grid + row mapping.

### Leftover / TODO
- **INTERFACE GAP (blocks in-game wiring, reported to lead):** `MonsterSpeciesId` + `MONSTER_SPECIES_STATS` in `systems/level.ts` are a closed union/Record over level-1's 7 sprites only. Level 2's species (monster6/9/10/15/16/19) require widening it. `level2.ts` casts `as MonsterSpeciesId` at a single documented helper (runtime-safe — species is an opaque label) but the pack can't be added to `LEVELS` nor rendered by `BattleScene` until (a) the union is widened / stats presets move to the data layer, and (b) BattleScene gets a species→sprite preload+mapping for the new sheets. Both files are off-limits to this team.
- **Balance:** stats are original magnitudes (boss 16000 hp); the current remake hero is tuned against level.ts's small invented numbers. Level is unwinnable in-engine until the hero's original-scale damage is ported. Separate task.
- Boss projectile patterns (Monster15Bullet1..4) not extracted — TODO-verify.

---

## Level 3 — 二郎神关 (Erlang Shen gauntlet)

**Ported by:** pipeline main (Sonnet). **Source:** `out_res/3.swf` + `打开我开始玩.swf`.

### Assets (`game/public/assets/extracted/level3/`)
- Backgrounds: `bg31.png` `bg32.png` `bg33.png` (4700×590 scroll panoramas, sprite-export), `floorBg3.png` (1040×690, image-export).
- Monster body sheets (image-export, `<chid>_` prefix stripped): `Monster1.png` (1800×1800), `Monster11.png` (1200×1000), `Monster12.png` (1200×1000), `Monster13.png` (1400×800), `Monster14.png` (1200×1200), `Monster20.png` (2100×2250), `Monster21.png` (3200×2400), `Monster22.png` (2400×3000), `Monster23.png` (1500×1200).

### Action tables (`game/src/data/monsters/`)
`monster1/11/12/13/14/20/21/22/23.json` — grid + per-action row/frames/stopCounts/frameCount, decoded from each `export.monster.MonsterN.initBBDC()+setAction()`. Cell sizes vary per monster (200×200 for most grunts; 300×300 M1; 350×250 M20; 400×300 M21/M22; 250×200 M23) — read from each `new BaseBitmapDataClip(...)`, never assumed. Confirmed via `symbolclass` re-run: body chids 9/4/3/2/1/8/7/6/5 = Monster1/11/12/13/14/20/21/22/23 respectively; `Monster22_ERLANGSHEN_HP_REJECT` (chid 205) is a marker symbol, not a body sprite.

### Level data (`game/src/data/levels/level3.ts`)
`LEVEL_3_ERLANGSHEN: LevelDef` — 5 stop-point waves culminating in an arena boss. Structure mirrors 3.swf's three sub-stages (StageListener31/32/33): grunts Monster11/12/13 recurring, two named elites (朱子真 M21, 袁洪 M20) folded into grunt waves as heavies, and 二郎神 (M22) as the arena boss. Monster1 (asset-pack extra, appears in no StageListener roster) and Monster23 (哮天犬, normally auto-spawned as 二郎神's companion, not wave-spawned at all in the original) are both folded into the final grunt wave — documented adaptation, since `LevelDef`/`BossSpec` has no "extra asset"/"companion" concept.

### Values / provenance
**All monster stats recovered VERBATIM** from the SWF constructors (hp/def/speed/attackRange/alertRange):
- Grunts (single-branch, no stage/level condition): M1 hp5200/def20, M11 hp5100/def7, M12 hp6500/def12, M13 hp5000/def14 (flying, isFly=true), M14 hp8000/def27.
- Elites (`gc.curStage==3 && gc.curLevel==3` branch — NOT the other branch's different-level tuning): 朱子真 M21 hp20000/def35 (isBoss=false in this branch — an elite, not the level's boss), 袁洪 M20 hp30000/def36 (both of M20's branches set isBoss=true; only this branch's 30000 hp applies to level 3, the other branch's 33000 is a different level).
- Arena boss (single-branch, always boss): 二郎神 M22 hp45137/def45/speed7 — nearly 3x level 2's 多闻天王 (16000 hp), consistent with being a later, harder level.
- Companion: 哮天犬 M23 hp9999999/def100 (effectively unkillable by design — a scripted companion, not a normal kill target; recorded verbatim per fidelity mandate).
- `normalAttackRate`: every species here has a literal non-zero `probability` (0.18 grunts, 0.3 M20/M22, 0.35 M21) — used directly, no stand-in needed. The one exception is M23 (哮天犬), whose `probability` is literally 0; mapped to the same 0.35 "they do melee" stand-in level2.ts established for probability=0 grunts (documented, not recovered).

### Boss mechanic — 二郎神 (Monster22) ERLANGSHEN_HP_REJECT
**Reverse-engineered fully** (Monster22.as + Monster23.as + base/BaseAddEffect.as + base/BaseRoleProperies.as — not marked TODO-verify). Despite the name, this is **not** a boss-HP-threshold mechanic — it's a **heal-block debuff applied to the hero**:

1. **Trigger**: 哮天犬 (Monster23)'s hit2 skill, on animation completion (`hit2Effect()`), scans the live monster array for Monster22 and, if found, calls `Monster22.setAtkUp()` (and its own `setAtkUp()`) — a 10s (`gc.frameClips*10`) self-buff raising both units' attack power (二郎神 hit1 279→345, hit2 999→1299, hit3 279→345, hit4 279→345; dog hit1/2/3 →456). Starting with this **first** buff cycle, 二郎神's hit4 attack definition permanently gains an `addEffect` entry `{name: ERLANGSHEN_HP_REJECT, time: gc.frameClips*30}` — present in both `setAtkUp()` and the post-buff `resetAtk()`, but absent from the original base constructor. (I.e., hit4 only starts threatening the debuff after the dog uses hit2 once — a quirk of the original template, not a copy/paste bug, since `resetAtk()` is clearly meant to restore power but not the addEffect.)
2. **Two independent application paths** once hit4 carries the addEffect:
   - **Facing check** (`checkDoHit4()`, fires mid-hit4-animation at frame 20, *before* the projectile spawns at frame 30): for each player, if 二郎神 faces them while they face **away** from him (back turned), the debuff applies directly — no hit required. Direction math: `this.x > player.x` (二郎神 to the player's right) && `二郎神.direct==0 && player.direct==1` (or the mirrored case) = player's back is to him.
   - **Generic on-hit propagation** (`base/BaseMonster.as` connect-hit handler, ~line 622): once hit4's `attackBackInfoDict.addEffect` is populated and the attack actually connects, the debuff applies through the standard addEffect pipeline too.
3. **Effect** (`base/BaseRoleProperies.as` `setHHP()`, ~line 745): while the hero carries `ERLANGSHEN_HP_REJECT`, any attempt to set current HP to a **higher** value than it currently has (heal potion, HP regen, lifesteal, etc.) is silently rejected/no-op'd; HP **decreases** (damage) are unaffected. A `Monster22_ERLANGSHEN_HP_REJECT` child symbol is attached to the hero while active (`show_erlangshen`/`hide_erlangshen`) as the visual tell.

In short: get caught with your back turned (or hit) during 二郎神's hit4 after 哮天犬 has empowered him, and healing is locked out for 30 real seconds. Thematically fits 二郎神's third-eye "sees everything" motif. Not modeled in `monsterSim` yet (no heal-block/addEffect concept exists there) — **TODO-verify/non-blocking**, but the mechanic itself is fully decoded, not a guess.

### Known original data bugs / quirks
- **Monster11 & Monster12 `hit2` point to a nonexistent sheet row** — identical bug class to level 2's Monster9/10. `setAction case "hit2"` calls `setFramePointY(5)`, but both sheets are 1200×1000 = 6 cols × 5 rows (0–4). Row 5 doesn't exist, and neither monster even defines `attackBackInfoDict["hit2"]` (dead code in the original too). Omitted from both JSONs, noted in each `source` field.
- **Monster22's row 2 is defined in the grid but never referenced by any named action** (setFrameStopCount/setFrameCount both have a row-2 entry, but no `setAction()` case points at it) — left out of the JSON rather than inventing a name for it.
- **Monster22's "dead" and "hit2_1" share the same sheet row** (row 3), and **Monster20's "dead"(boss) picks row 3 while its non-boss `fenshen()` split-body clone's "dead" reuses hit3's row 6** — both are original row-reuse designs, not bugs; recorded as-is.
- **Monster20 hit2's `setFrameCount` value (24) doesn't match its actual `setFrameStopCount` length (2)** — recorded both faithfully (`frames: 2` for the render grid, `frameCount: 24` as the source's raw value) per playbook pitfall #5.
- **Monster23 has no death animation asset** — its `setAction("dead")` case calls `dropAura()+destroy()` directly without touching a bbdc frame row (confirmed: its 6 rows exactly cover wait/walk/hurt/hit1/hit2/hit3, none left over for dead). Consistent with it being a near-unkillable companion rather than a normal kill target.
- **Monster1 and Monster23 are confirmed level-3 body monsters (via symbolclass) but appear in NO StageListener31/32/33 `waitForRegisterDataArray`.** Monster23 is explicitly auto-spawned by Monster22's `__added()` override in the original (`MainGame.getInstance().createMonster(23,...)`) rather than wave-spawned; Monster1 has no such explanation found. Both folded into the final grunt wave here (documented adaptation, see level3.ts header).

### Acceptance
- `game/tests/level3.test.ts` — 4 tests green: genuine full wave-clear sim (spawns each wave's real roster via monsterSim, kills them, drives the stop-point machine to boss trigger), boss spawn with recovered 45137 hp → kill → door → clear, internal difficulty escalation (grunts < elites < arena boss, and level 3's boss > level 2's boss), boss-not-in-grunt-waves (plus confirming the two elites and the companion ARE in grunt waves). `npx vitest run tests/level3.test.ts tests/level.test.ts` → 14 passed. `npx tsc --noEmit` → clean.
- Visual: `tools/level3-preview.html` (standalone, no BattleScene) decodes all 9 monster sheets and filmstrips every action from the recovered grids. Screenshot: `tmp/debug-shots/level3-monsters.png` (plus zoomed crops `level3-monster22-zoom.png`/`level3-monster13-zoom.png`) — all frames align to cells cleanly (no half-cut sprites), including the boss's non-square 400×300 cell and the flying grunt's 200×200 cell.

### Leftover / TODO
- **INTERFACE GAP: RESOLVED during this pass.** `MonsterSpeciesId` was widened to `string` in `systems/level.ts` (commit `6cf311e`, landed before this level-3 pass started) — the `as MonsterSpeciesId` cast in `level3.ts` is now a no-op, kept only for pattern consistency with `level2.ts`. Level 3's pack still isn't wired into `LEVELS`/`BattleScene` (species→sprite preload mapping doesn't exist there yet), but that's a wiring task, not a type-system blocker anymore.
- **Balance:** stats are original magnitudes (arena boss 45137 hp, well above level 2's 16000). Unwinnable in-engine until the hero's original-scale damage is ported — same caveat as level 2, unchanged.
- ERLANGSHEN_HP_REJECT mechanic is fully decoded (see writeup above) but not implemented in `monsterSim`/hero systems — no heal-block/addEffect concept exists there yet. TODO-verify, non-blocking.
- STUN addEffect on Monster21's hit3 (2s stun) — also recovered but not modeled in monsterSim. TODO-verify, non-blocking.
- Boss/elite projectile assets (Monster20Bullet1/3/4/5, Monster21Bullet1/2/3/4_1/4_2, Monster22Bullet1/2/3/4_1) not extracted — same scope decision as level 2's Monster15Bullet1..4, TODO-verify.

---

## Level 4 — 邪念之境 (Corrupted Disciples chain)

**Ported by:** pipeline main (Sonnet). **Source:** `out_res/4.swf` + `打开我开始玩.swf`.

### Assets (`game/public/assets/extracted/level4/`)
- Background: `bg41.png` (979×608, sprite-export). No bg42/bg43 exist for this level (confirmed via symbolclass — small level, matches recon). `floorBg4.png` (631×549, image-export, identical dims to level 2's — shared floor asset).
- Monster body sheets (image-export, `<chid>_` prefix stripped): `Monster31.png` (1200×2600), `Monster32.png` (1200×2800), `Monster33.png` (1800×2800), `Monster34.png` (1200×2800).

### Action tables (`game/src/data/monsters/`)
`monster31/32/33/34.json` — grid + per-action row/frames/stopCounts/frameCount, decoded from each `export.monster.MonsterN.initBBDC()+setAction()`. Cell sizes: 200×200 for 31/32/34, 300×200 for 33 (5*60 arithmetic, same pitfall as level 2's Role3/八戒 pattern — read from `new BaseBitmapDataClip(...)`, never assumed). Encoded actions per monster: `wait`, `walk`, `hurt`, plus 3-4 `hitN` rows for preview richness (not exhaustive of every AS3-defined attack — matches monster15.json's own precedent of scoping to the sim's needs, not a full decompile). All four monsters route several named actions (jump1/jump3/hit8/hit9/hurt, etc.) through a **shared multi-purpose "pose bank" row** (different actions start at different columns of the same row); only the single-frame `hurt` slot from each pose bank is encoded, documented per-JSON in `source`.

### Level data (`game/src/data/levels/level4.ts`)
`LEVEL_4_XIENIAN: LevelDef` — **structurally different from level 2's model.** 4.swf has only ONE sub-stage (`StageListener41` — no 42/43 exist), and it doesn't spawn a roster of grunts at all: `start()` spawns a single Monster32 after a 3s delay, and the rest of the chain is wired entirely through each monster's own `destroy()` override (`createMonster(nextId, 800, 300)`), read directly from each `Monster3N.as`:
```
Monster32.destroy() -> spawns Monster33
Monster33.destroy() -> spawns Monster31
Monster31.destroy() -> spawns Monster34
Monster34.destroy() -> if(isBoss) reveals every transferDoor  (the ONLY one of the four with this check)
```
i.e. the real game is a strictly **sequential one-boss-at-a-time chain**, not "grunt waves escalating to a boss" — every one of the four monsters is a full `isBoss=true` unit with tens of thousands of hp, and there is no grunt tier in this level at all.

**Adaptation (documented, not a bug):** `LevelDef.stopPoints` is modeled as three single-monster waves in the real spawn order (`monster32` → `monster33` → `monster31`), and the true final species (`monster34`, confirmed below) is the `boss`. This reproduces the original's sequential one-at-a-time gate using the existing wave-clear state machine verbatim — `systems/level.ts` needed no changes.

### Values / provenance
**All four monster stats recovered VERBATIM** from the SWF constructors. Unlike level 2, **none of these four monsters has a `gc.curStage`/`curLevel` branch** — each constructor is a single unconditional form, so there was no branch-selection judgment call to make here:
- 邪.沙僧 (Monster32): hp 42351, def 65
- 邪.八戒 (Monster33): hp 67612, def 100 (highest hp of the whole chain)
- 邪.唐僧 (Monster31): hp 37563, def 70
- 邪.悟空 (Monster34, BOSS): hp 54423, def 80
- `speed`(horizenSpeed)=8, `attackRange`=250, `alertRange`=1000 — identical across all four.
- `normalAttackRate` = literal **0.8** for all four (no stand-in needed): each constructor sets it to 0.25 first, then overwrites it to 0.8 later in the same constructor — same pattern as level 2's Monster6. `protectedParamsObject.probability` (0.2/0.4/0.3/0.2, differs per monster) also exists but is unused since the literal already satisfies the stats field per the playbook's branch-priority rule.

### Boss identification & mechanic (邪.悟空 / Monster34)
**Not the highest-hp monster in the chain** (Monster33/八戒 has more raw hp: 67612 vs 34's 54423) — identified as the true boss purely from AS3 control flow: `Monster34.destroy()` is the only one of the four with `if(this.isBoss){ ...transferDoorArray forEach set visible=true }`; 31/32/33's `destroy()` just chain to the next monster with no door logic. Confirmed from source, not inferred from hp. Mechanically 悟空 has the richest kit of the chain: 14 attack rows including a shadow-clone summon (`createShallow`/`shallowArray`, used by `hit8`/`hit14` when a clone exists), a leap-slam combo (`hit10_1..4`), and a chained self-immolating bomb (`hit12Boom`, 3 recursive detonations). None of these mechanics are wired into `monsterSim.ts` (out of scope — animation/stats only); flagged **TODO-verify** for whoever ports boss AI depth.

### Known original data quirks (documented, not fixed)
- **No monster in this level has a dedicated "dead" animation row.** `setAction("dead")` for all four just does a `TweenMax.to(alpha:0)` fade-out of whatever pose was last showing, then destroys — there's no bitmap row for it at all (unlike monster15's real 6-frame dead row in level 2). Noted per-JSON, `dead` omitted from all four action tables.
- **The boss-by-door-check is not the boss-by-hp.** Monster33 (八戒) has more hp than Monster34 (悟空) yet isn't the gate. Asserted explicitly in `level4.test.ts` so this doesn't get "corrected" later by someone assuming hp-monotonic chains.
- Several named actions per monster share one sheet row via different starting columns (a "pose bank"), a variant of level 2's known-quirks list but not identical to any specific numbered pitfall in the playbook — documented per-monster in each JSON's `source` field since the playbook's schema doesn't have a dedicated field for multi-slot rows.

### Acceptance
- `game/tests/level4.test.ts` — 4 tests green: genuine full chain-clear sim (spawns each single-monster wave via monsterSim in the real order 32→33→31, kills them, drives the stop-point machine to boss trigger, asserts spawn order), boss spawn with recovered 54423 hp → kill → door → clear, real (non-hp-monotonic) escalation vs level 2, boss-not-in-any-wave. `npx vitest run tests/level4.test.ts tests/level.test.ts` → 14 passed. `npx tsc --noEmit` → clean.
- Visual: `tools/level4-preview.html` (standalone, no BattleScene, copies level2-preview.html's shape) decodes all 4 monster sheets and filmstrips wait/walk/hurt/hit actions from the recovered grids. Served via `python3 -m http.server 8791` from repo root (all URLs 200), Playwright screenshot at `tmp/debug-shots/level4-monsters.png` — **visually reviewed**: all frames align to cells cleanly across all four monsters and all encoded actions, no half-cut sprites; Monster34's `hit4` frames show a dark/smoky effect (real art, not a slicing artifact — cell boundaries intact).

### Leftover / TODO
- **INTERFACE GAP (same as level 2, reported to lead):** `MonsterSpeciesId`/`MONSTER_SPECIES_STATS` in `systems/level.ts` still a closed union over level-1's 7 sprites. `level4.ts` uses the same single documented `as MonsterSpeciesId` cast point as level2.ts. Blocked from `LEVELS`/`BattleScene` until the union is widened — no new blocker introduced, same existing one.
- **Balance:** stats are original magnitudes, noticeably higher than level 2's (hp 37k-68k vs level 2's max 16000 boss) — consistent with this being a harder, later level. Hero damage porting is a separate task (unchanged caveat from level 2).
- Boss mechanics (shadow clone, leap-slam, chained bomb) not wired into monsterSim — TODO-verify, animation/stats-only scope for this pass.
- Bullet/projectile assets (Role1Bullet*/Role2Bullet*/Role3Bullet*/Role4Bullet* MovieClips) not extracted — same scope decision as level 2's Monster15Bullet1..4, TODO-verify.

---

## 场景接线 — 阶段 B 关卡链合龙（2026-07-07 集成会话）

L1→L4 关卡链已接进 `BattleScene.ts`（只动 BattleScene；level.ts / data/levels/*.ts / monster JSON 均只读）。

### 做了什么
- **CAMPAIGN 链**：`[LEVEL_1_WUYING, LEVEL_2_TIANWANG, LEVEL_3_ERLANGSHEN, LEVEL_4_XIENIAN]`（链头用真·第1关 巫鹰关，boss 巫鹰 monster3 300hp）。
  单怪硬编码场景重构成 `level.ts` 的波次/BOSS 状态机 + 多怪实体数组 `MonsterEntity[]`：每帧
  `updateLevelSpawn`→`spawnActiveWave`，全清后 `isBossZoneTriggered`→`spawnBoss`，Boss 死
  →`revealTransferDoor`→传送门；`↑/W` 站门内 `tryClearArena`→`onAdvanceLevel` 进下一关。
- **多怪渲染**：species→sheet 用 `import.meta.glob` 载全部 monster JSON（RoleData）+ 按 `SPECIES_SHEET`
  映射预加载各关 `level{N}/MonsterX.png`，逐 species 注册动画（前缀 `<species>_`，网格从各自 JSON 读）。
  非 200px cell 的怪按 `scale=(boss?2:1.5)*200/cellH` 归一；缺 `dead` 行的怪（L4）渲染时用
  `anims.exists` 守卫、保持当前姿势不崩。
- **背景换装**：`swapBackground(levelIndex)` 换 bg 基底/两层视差 tilesprite/floor 贴图（L4 只有 bg41，
  两层 detail 回退到它）。
- **Boss 血条**：顶部条 + `label` 名（多闻天王/二郎神/邪·悟空），调试 HUD 风格。
- **怪打英雄伤害**：`monsterAttackPower(species,stats,isBoss)` — boss 用真值（heroScale.BOSS_REFERENCE：
  多闻186/二郎345/邪悟空829 物理），grunt 用 `min(60, 8+def*1.5)` 启发式（TODO-verify，关包未给 grunt
  攻击力）；走阶段 A 的 `resolveIncomingHeroDamage`。
- **存档**：关卡进度 `campaignIndex` 存 BattleScene 自持的每槽侧信道 key
  `zmxy3-remake.slot.v1.<slot>.level`（save.ts 是他队文件、无 level 字段，不擅自 bump 其 schema；
  TODO：save 属主加 `campaignIndex` 字段后并入 GameSave）。continue 时读回续玩。

### 验收判据逐条
1. `npx vitest run` 全绿：**387 passed**；BattleScene 过 `tsc`（仓库唯一 tsc 报错仍在他队
   `ui/hud/RoleInfoHud.ts`，非本棒）。
2. 浏览器真机端到端（vite dev + 壳流转 + `__levelState/__killGrunts/__killBoss/__usePortal` 钩子），
   截图落 `game/tmp/debug-shots/`：
   - `16-level1-waves.png`：L1 波次多怪（monster30+monster2）+ 新 MP 条渲染。
   - `17-level2-tianwang.png`：打穿 L1→L2 **天王关**：换红殿龙柱背景 + 真怪 monster9/10 进攻 + L1 掉落进包。
   - `18-level3-erlangshen.png`：**通关 L2 天王关进 L3 二郎神关**：换背景 + 真怪 monster11/12。
   - **真实击杀多闻天王**：等级 22、`__giveMaterials`+炼一件 cap 装备（服务端静态 clamp 限到 atk+50，
     故总 atk 165 = 22 级基础 115 + 50）、连招真打——16000→0 击杀，用时约 **37s**，落在 hero-scale-report
     L2 核算区间（12.9–37.4s；其"20 级仅等级"档=37.4s）。逐波清怪→boss→传送门→下一关全链真跑。
   - **关卡存档**：L3(index2) 侧信道 key="2"；回主菜单→继续→恢复到「二郎神关」。
   - 修了两处 re-entry bug：动画重复注册告警（`anims.exists` 守卫）、continue 重进时 `swapBackground`
     踩已销毁 tilesprite 崩溃（buildBackground 重置 bgTiles 等累加器）。修后 continue 无崩、控制台 0 warning。
3. 本节即报告追加。

### 遗留 / 注意（阶段 B）
- **monsterBehaviors.ts（Monster3/7/13 + 弹体）未接**：本棒所有 species 统一走 `monsterSim` 近战默认行为
  （符合"未覆盖的种回落近战"），covered 的 3 种也回落了——同时驱动两套怪物系统 + 弹体物理超出单棒体量，
  作为后续单独一棒（接口在 monster-behavior-report，弹体 SpawnedProjectile 需场景侧跑位置模拟）。
- **二郎神 heal-block（ERLANGSHEN_HP_REJECT）未接**：monsterSim 无 addEffect/禁疗概念；语义已在 level3
  report 完整逆向，作为后续（需给 heroCombat/identity 加 heal-block 状态）。
- **grunt 攻击力为启发式**（见上），真值关包未给；boss 用了真值。
- 承伤口径致命问题仍在（hero-scale-report 已述）：真怪高攻击力 + 现有 maxHp 曲线下英雄在 L2+ 易被秒，
  验收用 `__setHeroHp` 续命跑通击杀链；根治需放大 progression maxHp/def 曲线（跨文件耦合，非本棒）。
- 调试钩子 `__levelState/__killGrunts/__killBoss/__usePortal` 及 campaignIndex 侧信道 key 量产前收敛。
