# Level 1 Climb Engine Report

## Changed Files

- `game/src/systems/platformSim.ts` - new AS3 wall/platform rectangle collision module.
- `game/src/systems/level1Geometry.ts` - optional loader for `level1-geometry.json`, with fallback to in-data walls when absent.
- `game/src/systems/jump.ts` - optional platform landing/head-block resolver, flat `groundY` fallback preserved.
- `game/src/systems/heroSim.ts` - optional horizontal wall resolver, min/max clamp fallback preserved.
- `game/src/systems/level.ts` - continuous spawner state, height trigger, substage-chain state, and `areStopPointsCleared`.
- `game/src/data/levels/level1.ts` - replaced the flat `LevelDef` with sl11/sl12/sl13 substage data; kept recovered stats unchanged.
- `game/src/scenes/BattleScene.ts` - L1 substage adapter, platform-backed hero movement, StageListener11 spawner, height-triggered 巫鹰, and transfer-door routing.
- `game/tests/platformSim.test.ts`
- `game/tests/platformHeroSim.test.ts`
- `game/tests/levelContinuousSpawner.test.ts`
- `game/tests/level1Substage.test.ts`
- `game/tests/level1HeadlessSmoke.test.ts`
- `game/tests/level1.test.ts`
- `tasks/level1-climb-engine-report.md`

## Coordinate Mapping

AS3 scene coordinates map to remake world coordinates by identity: no scale, no flip, no normalization. sl11 uses negative-up y exactly as StageListener11: boss trigger at `hero.y <= -1900`, 巫鹰 spawn at `(750, -2050)`, Monster30 spawns at `hero.x + [-150,150]`, `hero.y + [-300,-100]`.

The real `game/src/data/levels/level1-geometry.json` was absent during this run. I did not create or edit it. `level1Geometry.ts` loads it via `import.meta.glob` when present; otherwise BattleScene uses fallback walls embedded in `level1.ts`. Tests do not import this loader:

```text
rg -l "level1Geometry" game/tests
# no output
```

## Judged Criteria Evidence

Platform collision:

- `platformSim AS3 wall semantics > isThroughWall/isThroughUpButDownWall: falling body lands and stands on top; jumping up through its underside is unobstructed`
- `platformSim AS3 wall semantics > isThroughDownButUpWall: blocks upward motion into its underside but lets a falling body pass through its top`
- `platformSim AS3 wall semantics > isWall (solid): blocks landing, head, and both sides`
- `heroSim platform hooks (flat-ground fallback stays optional) > lands on a through platform above the flat ground through JumpConfig.platformResolver`
- `heroSim platform hooks (flat-ground fallback stays optional) > blocks horizontal movement against solid side faces through HeroConfig.platformResolver`

Spawner and height trigger:

- `continuous spawner (StageListener11 Monster30 swarm) > fires first wave at 3s, then every 6s, with 2 Monster30 at hero.x±150 and hero.y-[100,300]`
- `continuous spawner (StageListener11 Monster30 swarm) > height trigger spawns 巫鹰 at (750,-2050) exactly once`
- `continuous spawner (StageListener11 Monster30 swarm) > keeps firing Monster30 waves after the boss has been triggered and is active`

Substage chain:

- `Level 1 substages (sl11 -> sl12 -> sl13) > substage chain: sl11 clear condition (巫鹰 dead) -> door -> sl12 -> sl13 -> isLevelCleared`
- `Level 1 九重天 — AS3 three-substage structure > substage chain advances by transferDoor from sl11 to sl12 to sl13`

Headless smoke:

- `Level 1 headless smoke (systems only) > enter L1 -> climb platforms -> height boss -> door -> sl12 -> sl13 -> isLevelCleared`

Targeted run excerpt:

```text
✓ tests/platformSim.test.ts (3 tests)
✓ tests/level1Substage.test.ts (1 test)
✓ tests/level1.test.ts (5 tests)
✓ tests/levelContinuousSpawner.test.ts (3 tests)
✓ tests/platformHeroSim.test.ts (2 tests)
✓ tests/level1HeadlessSmoke.test.ts (1 test)

Test Files  6 passed (6)
Tests  15 passed (15)
```

Full regression:

```text
RUN  v3.2.7 /Users/e0_7/projects/zmxy3-remake/game

✓ tests/level2.test.ts (4 tests)
✓ tests/level3.test.ts (4 tests)
✓ tests/level4.test.ts (4 tests)
✓ tests/level.test.ts (10 tests)
...
Test Files  45 passed (45)
Tests  504 passed | 1 skipped (505)
```

TypeScript:

```text
game/node_modules/.bin/tsc --noEmit -p game/tsconfig.json
# passed with no output
```

## Implementation Notes

- `platformSim.ts` collapses `through` and `throughUpButDown` into the same one-way top-support behavior, as requested. `throughDownButUp` blocks head and sides, never landing.
- `jump.ts` and `heroSim.ts` keep old behavior when their optional platform hooks are absent. Existing `jump.test.ts` and `heroSim.test.ts` stayed green.
- `level.ts` keeps `WaveSpec`, `LevelDef`, and `updateLevelSpawn` unchanged for L2-L4. Continuous spawning and substage chaining are additive exports.
- Monster30 climb movement reuses `monsterSim.ts`'s existing independent x/y vertical-follow approximation. In BattleScene, vertical follow is enabled only for sl11 Monster30 and uses the recovered level stat `speed: 8`.
- sl11 spawner uses wall-clock milliseconds: `72 / 24fps = 3000ms`, then `144 / 24fps = 6000ms`.
- Boss height trigger is immediate. I did not implement the AS3 two-second TweenMax camera delay before `callBoss()`.

## Doubts And Risks

- Real platform geometry was not present, so fallback walls are an adaptation, not mined SWF geometry. The loader should pick up `level1-geometry.json` when the parallel task lands.
- sl12 and sl13 are modeled as horizontal `WaveSpec` stop-point substages. This is an approximation: StageListener12 is a gate-hit/stay-in-zone transfer script with no `createMonster` calls, and StageListener13 only preloads its roster. Static timeline monster placement still needs scene/geometry mining to become frame-accurate.
- Monster30 flight uses the existing independent-axis follow instead of true 2D vector homing. This keeps architecture small and stays inside the existing `monsterSim` path, but it is not a physically exact diagonal chase.
- The sl11 boss camera tween/snap-up cinematic was skipped; the gameplay trigger and spawn coordinates are implemented.

## Commit Status

No new commits could be created in this environment. Both the initial scoped add/commit and a single-file retry failed before creating an index lock:

```text
git add game/src/systems/platformSim.ts
fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted
```

There was no stale `.git/index.lock` to remove. Current pre-existing log head:

```text
9fc98af docs: dispatch L1 jiuzhongtian spatial rebuild (dual codex: geometry mining + climb engine)
25edea0 docs: session5 overnight ledger + session5->6 handover
f9c150c feat(drops): fill in L2 monster drop tables from real AS3 fallEquip() probability
```
