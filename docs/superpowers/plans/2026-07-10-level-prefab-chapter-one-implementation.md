# Level Prefab Compiler and Chapter One Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile original SWF/XML/AS3 scene data into deterministic LevelPrefab JSON and restore `sl11`, `sl12`, and `sl13` as three independent world-map levels with original waves and geometry.

**Architecture:** Add a semantic level compiler above the existing generic prefab compiler. The compiler joins timeline instance matrices from FFDec XML with AS3 component assignments and listener behavior, emits stable JSON, and fails on unresolved references. Runtime adapters consume LevelPrefab; named plugins implement only bespoke mechanics such as the sl11 climb and sl12 barrier door.

**Tech Stack:** Python 3 stdlib XML parsing, existing prefab compiler, FFDec XML, TypeScript, Vitest, Phaser 4.

---

### Task 1: Define the LevelPrefab schema and validator

**Files:**
- Create: `game/src/systems/levelPrefab.ts`
- Create: `game/tests/levelPrefab.test.ts`

- [ ] **Step 1: Write failing decoder tests**

```ts
it('accepts a complete compiled level and rejects an unresolved spawner', () => {
  expect(decodeLevelPrefab(validPrefab())).toMatchObject({ id: 'stage-1-level-2' })
  expect(() => decodeLevelPrefab({
    ...validPrefab(),
    spawners: [{ ...validPrefab().spawners[0], stopPointId: 'missing' }],
  })).toThrow(/unknown stopPointId missing/)
})
```

Add tests for duplicate spawner IDs, duplicate stop-point IDs, missing required assets, invalid intervals, and unknown mechanism plugin names.

- [ ] **Step 2: Run the test and verify failure**

```bash
cd game
npx vitest run tests/levelPrefab.test.ts
```

- [ ] **Step 3: Implement types and validation**

Define:

```ts
export interface LevelPrefab {
  id: string
  source: { stage: number; level: number; sceneClass: string; listenerClass: string; sourceSwf: string }
  bounds: Rect
  heroSpawns: Point[]
  backgrounds: SceneAssetPlacement[]
  walls: WallSpec[]
  stopPoints: StopPointSpec[]
  spawners: MonsterSpawnerSpec[]
  transferDoors: TransferDoorSpec[]
  scriptedObjects: ScriptedObjectSpec[]
  requiredSpecies: string[]
  requiredAssets: string[]
  mechanismPlugin?: 'sl11-climb' | 'sl12-barrier'
}
```

`decodeLevelPrefab` clones validated data and throws descriptive errors; it never silently drops malformed entries.

- [ ] **Step 4: Run tests**

Expected: `tests/levelPrefab.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/levelPrefab.ts game/tests/levelPrefab.test.ts
git commit -m "feat: define compiled level prefab contract"
```

### Task 2: Parse AS3 component assignments into structured spawner metadata

**Files:**
- Create: `tools/level-compiler/as3_components.py`
- Create: `tools/level-compiler/tests/test_as3_components.py`
- Create fixtures: `tools/level-compiler/tests/fixtures/sl12.as`, `tools/level-compiler/tests/fixtures/sl13.as`

- [ ] **Step 1: Write failing parser tests**

```py
def test_parse_sl12_spawner_assignments():
    values = parse_component_setters(FIXTURES / "sl12.as")
    assert values["__id51_"] == {
        "delay": 2,
        "enemyType": 4,
        "interval": 1,
        "isRandom": False,
        "stopPointIdx": 4,
        "totalNum": 1,
    }
    assert values["__id52_"]["enemyType"] == 8
    assert values["__id52_"]["totalNum"] == 4
```

Also assert StopPoint properties `idx`, `betweenRandL`, and `isBoss` are parsed.

- [ ] **Step 2: Verify failure**

```bash
python3 -m unittest discover -s tools/level-compiler/tests -p 'test_as3_components.py' -v
```

- [ ] **Step 3: Implement the constrained parser**

Parse only generated setter methods shaped as:

```as3
internal function __setProp___id51__() : *
{
   this.__id51_.delay = 2;
   this.__id51_.enemyType = 4;
}
```

Use a method-block regex plus literal assignment regex. Accept numeric, boolean, and quoted-string literals; reject executable expressions. Normalize the method name to instance name `__id51_`.

- [ ] **Step 4: Run parser tests**

Expected: exact sl12/sl13 property dictionaries PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/level-compiler/as3_components.py tools/level-compiler/tests
git commit -m "feat: parse original level component assignments"
```

### Task 3: Extract named timeline instance placements from FFDec XML

**Files:**
- Create: `tools/level-compiler/xml_scene.py`
- Create: `tools/level-compiler/tests/test_xml_scene.py`
- Create fixture: `tools/level-compiler/tests/fixtures/level1-scene.xml`

- [ ] **Step 1: Write failing placement tests**

```py
def test_extract_named_instances_with_world_matrices():
    scene = load_scene(FIXTURES / "level1-scene.xml", sprite_id=209)
    spawner = scene.instances["__id51_"]
    assert spawner.character_id > 0
    assert spawner.depth > 0
    assert round(spawner.world_matrix.tx, 3) == EXPECTED_ID51_X
    assert round(spawner.world_matrix.ty, 3) == EXPECTED_ID51_Y
```

The fixture must include one StopPoint, one MonsterAppearPoint, one transfer door, and nested marker children.

- [ ] **Step 2: Verify failure**

```bash
python3 -m unittest discover -s tools/level-compiler/tests -p 'test_xml_scene.py' -v
```

- [ ] **Step 3: Implement the scene walker**

Reuse `matrix_from_elem`, `multiply_matrix`, `character_bounds`, and marker discovery from `tools/level1-geometry/extract_scene_geometry.py`. Preserve instance names from `placeObjectName`, compose matrices through nested sprites, and expose world-space origin plus visual bounds.

- [ ] **Step 4: Run tests**

Expected: placement, marker, and nested-matrix tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/level-compiler/xml_scene.py tools/level-compiler/tests/test_xml_scene.py tools/level-compiler/tests/fixtures/level1-scene.xml
git commit -m "feat: extract named level instances from SWF XML"
```

### Task 4: Compile sl12 and sl13 wave prefabs from joined XML and AS3 data

**Files:**
- Create: `tools/level-compiler/compiler.py`
- Create: `tools/level-compiler/cli.py`
- Create: `tools/level-compiler/tests/test_compile_chapter_one.py`
- Create: `game/src/data/levels/prefabs/stage-1-level-2.json`
- Create: `game/src/data/levels/prefabs/stage-1-level-3.json`

- [ ] **Step 1: Write failing golden tests**

```py
def test_sl12_compiles_exact_original_counts():
    prefab = compile_level(SL12_INPUT)
    assert len(prefab["stopPoints"]) == 5
    assert len(prefab["spawners"]) == 13
    assert {s["monsterId"] for s in prefab["spawners"]} == {"monster2", "monster4", "monster7", "monster8"}

def test_sl13_compiles_exact_original_counts():
    prefab = compile_level(SL13_INPUT)
    assert len(prefab["stopPoints"]) == 5
    assert len(prefab["spawners"]) == 14
    assert {s["monsterId"] for s in prefab["spawners"]} == {"monster5", "monster7", "monster8", "monster30"}
```

Assert exact delay, interval, totalNum, stopPointIdx, isBoss, and position for every spawner against committed golden dictionaries.

- [ ] **Step 2: Verify failure**

```bash
python3 -m unittest discover -s tools/level-compiler/tests -p 'test_compile_chapter_one.py' -v
```

- [ ] **Step 3: Implement the compiler join**

For each named AS3 component:

```py
placement = scene.instances[instance_name]
props = assignments[instance_name]
spawner_id = f"{scene_class}:{instance_name}"
monster_id = f"monster{props['enemyType']}"
```

Emit stable sorted arrays. Convert seconds to milliseconds. Derive stable stopPoint IDs from original idx. Fail if an AS3 component has no timeline placement or a placement has no required properties.

- [ ] **Step 4: Generate and validate JSON**

```bash
python3 tools/level-compiler/cli.py --xml game/tmp/prefab-dev/level1.xml --scene-id 209 --scene-class sl12 --scene-as game/tmp/prefab-dev/all-as3-list/scripts/export/gameSence/sl12.as --listener-as game/tmp/prefab-dev/all-as3-list/scripts/export/level/StageListener12.as --out game/src/data/levels/prefabs/stage-1-level-2.json
python3 tools/level-compiler/cli.py --xml game/tmp/prefab-dev/level1.xml --scene-id 211 --scene-class sl13 --scene-as game/tmp/prefab-dev/all-as3-list/scripts/export/gameSence/sl13.as --listener-as game/tmp/prefab-dev/all-as3-list/scripts/export/level/StageListener13.as --out game/src/data/levels/prefabs/stage-1-level-3.json
python3 -m unittest discover -s tools/level-compiler/tests -v
```

Expected: generated JSON is stable across two runs and all golden tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/level-compiler game/src/data/levels/prefabs/stage-1-level-2.json game/src/data/levels/prefabs/stage-1-level-3.json
git commit -m "feat: compile original chapter one wave prefabs"
```

### Task 5: Compile sl11 and represent its bespoke climb plugin

**Files:**
- Modify: `tools/level-compiler/compiler.py`
- Modify: `tools/level-compiler/tests/test_compile_chapter_one.py`
- Create: `game/src/data/levels/prefabs/stage-1-level-1.json`
- Create: `game/src/systems/levelPlugins/sl11Climb.ts`
- Create: `game/tests/sl11Climb.test.ts`

- [ ] **Step 1: Add failing sl11 semantic tests**

```ts
it('spawns two Monster30 units every six seconds in solo and calls Monster3 at the summit', () => {
  const state = createSl11ClimbState({ players: 1 })
  expect(stepSl11Climb(state, { heroYs: [400], deltaMs: 3000 }, () => 0.5).spawns).toHaveLength(2)
  expect(stepSl11Climb(state, { heroYs: [-1901], deltaMs: 0 }, () => 0.5).bossSpawn).toMatchObject({
    species: 'monster3', x: 750, y: -2050,
  })
})
```

Add a two-player test requiring four Monster30 spawns and the original random target selection.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/sl11Climb.test.ts
```

- [ ] **Step 3: Compile and implement the plugin**

The sl11 prefab contains geometry, transfer door, required assets/species, and `mechanismPlugin: 'sl11-climb'`. The plugin implements only StageListener11 semantics: initial 72-frame delay, six-second interval, 2/4 Monster30 count, random player target, offsets `x ±150` and `y -100..-300`, summit threshold `-1900`, and Monster3 spawn `750,-2050`.

- [ ] **Step 4: Run tests and generate prefab**

```bash
python3 tools/level-compiler/cli.py --xml game/tmp/prefab-dev/level1.xml --scene-id 195 --scene-class sl11 --scene-as game/tmp/prefab-dev/all-as3-list/scripts/export/gameSence/sl11.as --listener-as game/tmp/prefab-dev/all-as3-list/scripts/export/level/StageListener11.as --out game/src/data/levels/prefabs/stage-1-level-1.json
cd game
npx vitest run tests/sl11Climb.test.ts tests/levelPrefab.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add tools/level-compiler/compiler.py tools/level-compiler/tests/test_compile_chapter_one.py game/src/data/levels/prefabs/stage-1-level-1.json game/src/systems/levelPlugins/sl11Climb.ts game/tests/sl11Climb.test.ts
git commit -m "feat: compile the original sl11 climb level"
```

### Task 6: Implement the sl12 barrier-door plugin

**Files:**
- Create: `game/src/systems/levelPlugins/sl12Barrier.ts`
- Create: `game/tests/sl12Barrier.test.ts`
- Modify: `game/src/data/levels/prefabs/stage-1-level-2.json`

- [ ] **Step 1: Write failing mechanic tests**

```ts
it('opens after five projectile hits and enters after 72 continuous frames inside', () => {
  const state = createSl12BarrierState()
  for (let i = 0; i < 5; i++) applyBarrierProjectileHit(state)
  expect(state.phase).toBe('opening')
  finishBarrierAnimation(state)
  for (let i = 0; i < 71; i++) stepBarrierOccupancy(state, true)
  expect(state.enterRequested).toBe(false)
  stepBarrierOccupancy(state, true)
  expect(state.enterRequested).toBe(true)
})
```

Add a test that leaving the door resets the 72-frame counter.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/sl12Barrier.test.ts
```

- [ ] **Step 3: Implement the plugin**

Model `closed -> opening -> open` with `remainingHits=5`, one-second hit debounce, and a 72-frame occupancy counter. The prefab references the compiled `fbEnter` object and its `colipse` bounds.

- [ ] **Step 4: Run tests**

Expected: exact five-hit and 72-frame behavior PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/levelPlugins/sl12Barrier.ts game/tests/sl12Barrier.test.ts game/src/data/levels/prefabs/stage-1-level-2.json
git commit -m "feat: restore the sl12 barrier entrance"
```

### Task 7: Add a LevelPrefab runtime adapter and stable spawn IDs

**Files:**
- Create: `game/src/systems/levelPrefabRuntime.ts`
- Create: `game/tests/levelPrefabRuntime.test.ts`
- Modify: `game/src/systems/level.ts`
- Modify: `game/src/scenes/BattleScene.ts`

- [ ] **Step 1: Write failing runtime tests**

```ts
it('activates stop points in source order and creates deterministic entity ids', () => {
  const runtime = createLevelPrefabRuntime(sl12Prefab)
  const first = triggerStopPoint(runtime, 0)
  expect(first.spawns[0].entityId).toBe('stage-1-level-2:sl12:__id52_:0')
  expect(first.spawns[3].entityId).toBe('stage-1-level-2:sl12:__id52_:3')
})
```

Add tests for delayed/interleaved spawners and clearing a stop point only after all its spawners finish and monsters die.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/levelPrefabRuntime.test.ts
```

- [ ] **Step 3: Implement the runtime**

Use compiled spawners directly; do not flatten them into hand-written WaveSpec rosters. BattleScene asks the runtime for spawn events and passes stable `entityId` into `spawnEntity`.

- [ ] **Step 4: Run runtime and smoke tests**

```bash
cd game
npx vitest run tests/levelPrefabRuntime.test.ts tests/level1HeadlessSmoke.test.ts tests/level.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/levelPrefabRuntime.ts game/tests/levelPrefabRuntime.test.ts game/src/systems/level.ts game/src/scenes/BattleScene.ts
git commit -m "refactor: run levels from compiled prefabs"
```

### Task 8: Split the campaign and migrate saved progress

**Files:**
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/src/data/worldmapNodes.ts`
- Modify: `game/src/systems/campaignProgress.ts`
- Modify: `game/tests/campaignProgress.test.ts`
- Modify: `game/tests/level1HeadlessSmoke.test.ts`
- Create: `game/src/systems/campaignCatalog.ts`

- [ ] **Step 1: Write failing catalog and migration tests**

```ts
expect(CHAPTER_ONE.map((entry) => entry.id)).toEqual([
  'stage-1-level-1',
  'stage-1-level-2',
  'stage-1-level-3',
])

expect(migrateLegacyCampaignIndex(0, { legacyLevel1Cleared: false })).toBe(0)
expect(migrateLegacyCampaignIndex(0, { legacyLevel1Cleared: true })).toBe(3)
expect(migrateLegacyCampaignIndex(1, {})).toBe(3)
```

The old combined L1 clear maps to the first post-chapter-one node so existing players do not lose progress.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/campaignProgress.test.ts tests/level1HeadlessSmoke.test.ts
```

- [ ] **Step 3: Implement catalog and node mapping**

Map `s1_1/s1_2/s1_3` to the three prefabs and move the existing second-stage gauntlet to `s2_1`. Replace numeric stage inference in `dropRollContext()` with the catalog entry's explicit `{stage, level}` source.

Persist a campaign schema version alongside the saved frontier and run migration once.

- [ ] **Step 4: Run campaign tests**

Expected: all three chapter-one nodes unlock sequentially and use stage 1 levels 1, 2, and 3 for drops and monster branches.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/campaignCatalog.ts game/src/scenes/BattleScene.ts game/src/data/worldmapNodes.ts game/src/systems/campaignProgress.ts game/tests/campaignProgress.test.ts game/tests/level1HeadlessSmoke.test.ts
git commit -m "fix: restore chapter one as three map levels"
```

### Task 9: Load required assets atomically from prefab declarations

**Files:**
- Create: `game/src/systems/levelAssets.ts`
- Create: `game/tests/levelAssets.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/src/systems/backgroundLifecycle.ts`

- [ ] **Step 1: Write failing asset-resolution tests**

```ts
it('reports missing required assets before a level can start', () => {
  expect(resolveLevelAssets(sl12Prefab, new Set(['bg12']))).toEqual({
    ready: false,
    missing: expect.arrayContaining(['floor12', 'fbEnter']),
  })
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/levelAssets.test.ts
```

- [ ] **Step 3: Implement preload and atomic start**

Resolve `requiredAssets` before destroying the previous level. If an asset is absent, keep the prior scene visible, show a diagnostic error, and abort the transition. Load original exported resources first; generated replacements must be explicitly marked in the asset manifest.

- [ ] **Step 4: Run tests**

Expected: missing assets block level start deterministically; valid prefabs start with complete backgrounds and scripted objects.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/levelAssets.ts game/tests/levelAssets.test.ts game/src/scenes/BattleScene.ts game/src/systems/backgroundLifecycle.ts
git commit -m "fix: preload complete level asset sets"
```

### Task 10: Verify the three original levels in the browser

**Files:**
- Create: `tasks/chapter-one-prefab-report.md`
- Update only on defects: files from Tasks 1-9

- [ ] **Step 1: Run compiler and unit suites**

```bash
python3 -m unittest discover -s tools/prefab-compiler/tests -v
python3 -m unittest discover -s tools/level-compiler/tests -v
cd game
npx vitest run tests/levelPrefab.test.ts tests/levelPrefabRuntime.test.ts tests/sl11Climb.test.ts tests/sl12Barrier.test.ts tests/campaignProgress.test.ts tests/level1HeadlessSmoke.test.ts
```

- [ ] **Step 2: Start the game and inspect all three nodes**

```bash
cd game
npm run dev -- --host 127.0.0.1
```

Confirm:

```text
s1_1: vertical sl11 scene, 2 solo Monster30 per interval, summit Monster3.
s1_2: five stop points at compiled coordinates, 13 spawners, barrier opens after five projectile hits.
s1_3: five stop points at compiled coordinates, 14 spawners, Monster5 finale.
Each completion returns to the map and unlocks only the next node.
Repeated entry never produces a blank background.
```

- [ ] **Step 3: Capture compiler provenance**

Record source XML, scene IDs, AS3 classes, compiled counts, prefab hashes, and screenshot filenames in `tasks/chapter-one-prefab-report.md`.

- [ ] **Step 4: Run final verification**

```bash
cd game
npm test
npm run build
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add tasks/chapter-one-prefab-report.md
git commit -m "docs: verify compiled chapter one levels"
```
