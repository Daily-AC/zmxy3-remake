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
