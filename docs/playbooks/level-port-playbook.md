# Level-port playbook

How to turn one 4399-original level (`<N>.swf`) into a remake level pack: extracted assets + action-table JSONs + a `LevelDef` + a vitest wave-clear sim + a visual decode screenshot. Written from the Level 2 pilot (commit `fc44497`); **use `game/src/data/levels/level2.ts`, `game/src/data/monsters/monster15.json`, and `game/tests/level2.test.ts` as the reference implementation** — copy their shape.

Worked companion reading: `docs/research/asset-pipeline-notes.md` (FFDec command family, first-principles findings) and `tasks/level-pipeline-report.md` (per-level provenance log — **append a section when you finish**).

## 0. Boundaries (multi-team checkout — non-negotiable)

You may create/edit ONLY: `game/public/assets/extracted/level<N>/`, `game/src/data/monsters/*.json`, `game/src/data/levels/*.ts`, `game/tests/level<N>.test.ts`, `tools/*` (new files), `tmp/`.
**Never touch** `game/src/scenes/`, `game/src/systems/`, `game/src/net/`, `game/src/ui/`, `agent-server/`. If `systems/level.ts`'s interface isn't enough (it won't be — see §7 interface gap), **report to the team lead, do not edit it.**
Commit only your own paths (`git add <explicit paths>`, never `git add -A` / `.`). Retry on `index.lock`. Don't push.

## 1. Locate the level pack

Sources (read-only): scene SWFs in `vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/<N>.swf`; the single AS3-truth SWF `vendor/.../造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf` (all game logic). FFDec: `/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar`.

`<N>.swf` → level `<N>` (0.swf = tutorial; 1–10.swf = levels 1–10; see asset-pipeline-notes §34-SWF-inventory for the odd packs like `zmⅣMonsterInfo.swf`). List the pack's contents (chid ↔ class):

```bash
J="/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar"
SWF="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/<N>.swf"
$J -export symbolclass /tmp/sym$N "$SWF"
grep -iE "monster|bg|floor|files" /tmp/sym$N/symbols.csv
```

You'll see `bg<N>1/2/3` (background layers), `floorBg<N>`, `files<N>` (scene container), `Monster<M>` (body bitmaps — low chids) and `Monster<M>Bullet*` (projectile MovieClips). The **body** monsters (no "Bullet") are your roster.

## 2. Export assets → `game/public/assets/extracted/level<N>/`

Two exporters, by tag type (see notes §core-finding). Monster bodies + `floorBg` are **bitmap tags** → image export. Backgrounds `bg<N>x` are **MovieClips** → sprite export.

```bash
# bitmaps (monster bodies + floorBg) — produces <chid>_<Class>.png
$J -format image:png -export image /tmp/l${N}img "$SWF"
# backgrounds (MovieClips) — produces DefineSprite_<chid>_bg<N>x/1.png
$J -format sprite:png -export sprite /tmp/l${N}spr "$SWF"
```

Copy into the repo **stripping the `<chid>_` prefix** (follow the level1/level2 pattern — filename = symbol class):

```bash
DEST=game/public/assets/extracted/level$N; mkdir -p $DEST
cp /tmp/l${N}img/<chid>_Monster<M>.png  $DEST/Monster<M>.png   # per monster
cp /tmp/l${N}img/<chid>_floorBg$N.png   $DEST/floorBg$N.png
cp /tmp/l${N}spr/DefineSprite_<chid>_bg${N}1/1.png $DEST/bg${N}1.png  # per bg layer
```

Record every sheet's real pixel size (needed for the grid in §3): `sips -g pixelWidth -g pixelHeight $DEST/Monster<M>.png`.

## 3. Reverse the action tables (grid + rows)

Resource SWFs have **no frame labels** — the grid and action→row map live in the main SWF. Export the monster classes once:

```bash
$J -export script /tmp/mscripts "$MAIN"   # MAIN = 打开我开始玩.swf; ~5s, dumps all classes
# per monster: read scripts/export/monster/Monster<M>.as
```

In each `Monster<M>.as` read two methods:
- **`initBBDC()`**: `new BaseBitmapDataClip([...], cellW, cellH, ...)` gives **cell size** (watch `5*60`=300 arithmetic; cell size differs per monster — never assume 200×200). `setOffsetXY(x,y)` = render offset. `setFrameStopCount([[...],[...],...])` = one array per **sheet row**, each value = ticks that frame holds. `setFrameCount([...])` = per-row keyframe count for the frame-over callback.
- **`setAction()`**: `case "<action>": ... setFramePointY(<row>)` maps each action name to its **row index**.

Derive the grid: `cols = sheetWidth / cellW`, `rows = sheetHeight / cellH`. For each action, `frames = len(stopCounts[row])`, `col` is the start column (almost always 0).

## 4. Recover stats (verbatim — do NOT invent)

Level 1's `MONSTER_SPECIES_STATS` was invented tuning because nobody had recovered numbers. **You can recover them.** In each `Monster<M>.as` constructor:

| level.ts `MonsterStats` | AS3 source |
| --- | --- |
| `hp` | `this.setHp(...)` |
| `def` | `this.protectedParamsObject.def = ...` |
| `speed` | `this.horizenSpeed = ...` |
| `attackRange` | `this.attackRange = ...` |
| `alertRange` | `this.alertRange = ...` |
| `normalAttackRate` | `this.normalAttackRate` if literal; else `this.protectedParamsObject.probability` (special-skill chance). If `probability == 0` (grunt melees on contact), use ~0.35 and **document it as a stand-in, not recovered**. |

**Branch selection is critical.** Most monsters have `if (gc.curStage==X && gc.curLevel==Y || gc.curStage==Z) { elite form } else { normal form }`. Read the condition and pick the branch matching **your** level. Grunts' elite branch (hp 25000+, def 120) is for a *later* level; their `else` branch (hp ~1500) is the early-game form. Kings often use `isBoss=true` in the branch that applies to your level. Record `monsterName` (Chinese boss name) for the HP-bar label. Also grab attack `power`/`attackKind` from `attackBackInfoDict["hitN"]` for boss RE notes.

## 5. Identify the boss & its mechanic

- **Boss signal**: a dual `isBoss=true`/`false` constructor, many attack rows (hit1–hit4), many `Monster<M>Bullet*` symbols, and appearance in the last `StageListener<N>3` (see below). `monsterName` confirms it.
- **Wave composition** is positional data inside the `files<N>` MovieClip, NOT in AS3 — you won't get exact original spawn coords from scripts. Instead read `scripts/export/level/StageListener<N>1/2/3.as`: each sub-stage's `waitForRegisterDataArray` lists which monsters that scene preloads (its roster). Compose reasonable stop-point waves from those rosters, escalating to the boss (mirror level2.ts's mapping of 3 sub-stages → 5 waves + arena boss).
- **Special mechanics** live in the boss class + a marker symbol (e.g. level 3's `Monster22_ERLANGSHEN_HP_REJECT`). Reverse the relevant methods; if you can't finish, **mark `TODO-verify` in the JSON `source` + report section and move on — don't block.** Record what you found either way.

## 6. Write the monster JSONs (`game/src/data/monsters/monster<M>.json`)

Schema (copy `monster15.json`): `source` (which class + sheet + branch + any bug note — **required**), `sheet {cols,rows,cellW,cellH,facing:"left"}`, `offset {x,y}`, `actions { <name>: {col,row,frames,stopCounts,frameCount} }`. JSONs are **animation-only** — stats go in the level file (§7).

## 7. Write the level pack (`game/src/data/levels/level<N>.ts`)

Copy `level2.ts`. Export a `LevelDef` (import the interface from `../../systems/level`): `stopPoints: WaveSpec[]` (each `{roster: MonsterSpawnSpec[]}`), a `boss: BossSpec`, and `door`/`arenaBounds` (reuse the WORLD_MIN_X=90/MAX_X=1460/GROUND_Y=400 constants level2.ts copies). Put recovered stats in a local `LEVEL<N>_MONSTER_STATS: Record<string, MonsterStats>`.

**INTERFACE GAP (you WILL hit this):** `MonsterSpeciesId` and `MONSTER_SPECIES_STATS` in `systems/level.ts` are a **closed union/Record over level-1's 7 sprites only**. Your new species (`monster<M>`) aren't in it and you can't edit that file. Workaround (from level2.ts, runtime-safe because level.ts treats `species` as an opaque label and only reads `stats`): funnel construction through one helper that does `species: name as MonsterSpeciesId`, with a comment pointing at this gap. **Also send the lead a one-line reminder** that until they widen the union (proposed: make it `string`, move stats presets to the data layer) your pack can't join `LEVELS` or render in BattleScene. Don't let it block the rest.

**Balance note:** recovered magnitudes are original-scale (bosses ~10k–16k hp) and the current hero is tuned against level.ts's small invented numbers, so the level is unwinnable in-engine until hero damage is ported. Keep the real values (fidelity mandate); note the caveat in your report.

## 8. vitest wave-clear sim (`game/tests/level<N>.test.ts`)

Copy `level2.test.ts`. Assert, at minimum: (a) a **genuine** full clear — spawn each wave's roster via `initMonster`, feed the real alive-count into `updateLevelSpawn`, kill them, confirm every stop point clears and `isBossZoneTriggered` flips; (b) boss spawns with the recovered hp, dies, door reveals, `tryClearArena` in-bounds+interact → `isLevelCleared`; (c) internal difficulty escalation on the recovered stats; (d) boss species not present in grunt waves. Green bar:

```bash
cd game && npx vitest run tests/level<N>.test.ts tests/level.test.ts && npx tsc --noEmit
```

## 9. Visual decode + screenshot (`tools/level<N>-preview.html` → `tmp/debug-shots/`)

Do **not** touch BattleScene. Copy `tools/level2-preview.html` (standalone: `fetch`es each JSON, slices the sheet by grid, filmstrips every action onto a canvas, sets `RENDER_DONE`). Serve the repo root and screenshot with Playwright:

```bash
cd <repo>; python3 -m http.server 8791 & sleep 1
# playwright: navigate http://localhost:8791/tools/level<N>-preview.html,
#   wait_for text "RENDER_DONE", screenshot fullPage -> tmp/debug-shots/level<N>-monsters.png
pkill -f "http.server 8791"
```

**Read the screenshot yourself** — frames must align to cells with no half-cut sprites (misalignment = wrong cellW/cellH). This is the real acceptance, not the RENDER_DONE flag.

## 10. Acceptance checklist (all must hold before you report done)

- [ ] All body monster sheets + `floorBg<N>` + `bg<N>x` layers in `game/public/assets/extracted/level<N>/`, prefix-stripped, not gitignored (`git check-ignore` returns empty).
- [ ] One JSON per body monster, each with a `source` line; per-monster cell size verified against `new BaseBitmapDataClip(...)` (not assumed).
- [ ] `level<N>.ts` exports a `LevelDef` with recovered stats; interface-gap cast documented + reported.
- [ ] `npx vitest run tests/level<N>.test.ts tests/level.test.ts` green; `npx tsc --noEmit` clean.
- [ ] `tmp/debug-shots/level<N>-monsters.png` exists and **you looked at it** — frames align cleanly.
- [ ] Section appended to `tasks/level-pipeline-report.md` (level no., asset list, value provenance, boss mechanic status, known bugs, leftovers).
- [ ] Committed with `git add <explicit paths>` only.

## 11. Known pitfalls (learned the hard way)

1. **`hitN` pointing at a nonexistent row = original data bug.** Monster7/9/10 `setAction case "hit2"` calls `setFramePointY(5)` but their sheets are only 5 rows (0–4) and `setFrameStopCount` defines only 5 rows — row 5 doesn't exist. **Omit the action, note it in `source`.** Cross-check every action's `row` against `rows` from the grid.
2. **Cell size differs per monster** (200×200, 300×300, 300×350, 300×400, and Role3/八戒 is 300×200). Always read `new BaseBitmapDataClip(..., w, h, ...)`. Wrong size → half-body slices.
3. **`-selectclass` does NOT filter `-export sprite`/`-export image`** (only `-export script`). Sprite/image export dumps the whole SWF; pick your dirs by name afterward.
4. **Backgrounds are MovieClips, not bitmap tags** — image export silently skips them (you'll get stray internal chunk PNGs like `100.png`). Use sprite export for `bg<N>x`.
5. **`setFrameCount` length can exceed the sheet's row count** (e.g. Monster10 has 6 entries, 5 rows). `setFrameStopCount` + sheet dims are authoritative for row count; record the extra `frameCount` value faithfully but don't invent a row.
6. **`probability` ≠ `normalAttackRate`.** Grunts set `probability=0` (they melee on contact); mapping that literally makes them inert in the sim. Use a documented stand-in.
7. **Pick the right stat branch** (§4) — the elite `gc.curStage==9` numbers are for a later level, not yours.
