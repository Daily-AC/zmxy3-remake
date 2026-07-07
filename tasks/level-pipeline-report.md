# Level pipeline report

One section per ported level. Appended as levels land.

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
