# Chapter One Runtime Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic production `BattleRuntime` and Phaser host that can play `sl11` from entry through platform climb, continuous Monster30 encounters, Owl boss, transfer door, and stage clear while the legacy `BattleScene` remains available.

**Architecture:** `packages/game-core` owns fixed-tick battle state and exposes commands, events, snapshots, checkpoints, and replay. Existing combat primitives are reused; dynamic actors and encounters are added as focused battle modules. The game package compiles recovered `sl11` data into the core definition and renders it through a query-gated Phaser scene selected by the existing loading transition.

**Tech Stack:** TypeScript, Zod, Vitest, Phaser 4, Vite, Playwright

---

## File Map

### Core files

- Create `packages/game-core/src/battle/types.ts`: stable public battle contracts.
- Create `packages/game-core/src/battle/definition.ts`: Zod validation and serializable cloning.
- Create `packages/game-core/src/battle/platform.ts`: renderer-independent wall collision migrated from the game package.
- Create `packages/game-core/src/battle/actorRegistry.ts`: deterministic dynamic actor storage and IDs.
- Create `packages/game-core/src/battle/encounter.ts`: continuous spawn, boss activation, door, and clear state machine.
- Create `packages/game-core/src/battle/runtime.ts`: fixed-tick command processing and system orchestration.
- Create `packages/game-core/src/battle/checkpoint.ts`: complete runtime state capture/restore/hash input.
- Create `packages/game-core/src/battle/replay.ts`: recording and deterministic playback.
- Modify `packages/game-core/src/index.ts`: export the production battle API.
- Modify `packages/game-core/package.json`: add `./battle` export.

### Game files

- Create `game/src/adapters/sl11BattleDefinition.ts`: compile recovered `sl11` data and combat presentation IDs.
- Create `game/src/adapters/battleRuntimeInput.ts`: map Phaser action edges to sequenced future-tick commands.
- Create `game/src/adapters/battleRuntimePresentation.ts`: actor view reconciliation and presentation cue routing.
- Create `game/src/scenes/BattleRuntimeScene.ts`: thin production runtime host.
- Modify `game/src/scenes/shellShared.ts`: add a stable scene key.
- Modify `game/src/scenes/BattleLoadingScene.ts`: launch the selected battle target and observe its ready event.
- Modify `game/src/scenes/WorldMapScene.ts`: opt into the runtime for `sl11` when `?battleRuntime=1`.
- Modify `game/src/main.ts`: register the new scene without changing the legacy default.

### Tests and evidence

- Create focused tests under `packages/game-core/tests/battle/` for each core module.
- Create `game/tests/sl11BattleDefinition.test.ts` and `game/tests/battleRuntimeSceneShell.test.ts`.
- Create `game/tools/verify-sl11-runtime.mjs`: build, serve, exercise, screenshot, and collect browser errors.
- Create `docs/playbooks/chapter-one-runtime-host.md`: launch, fallback, evidence, and failure triage.

## Task 1: Core Platform Resolver

**Files:**
- Create: `packages/game-core/src/battle/platform.ts`
- Create: `packages/game-core/tests/battle/platform.test.ts`
- Modify: `packages/game-core/src/index.ts`

- [ ] **Step 1: Write failing platform tests**

Cover landing on `through`, head collision with `solid`, falling through `throughDownButUp`, and horizontal blocking. Import the future API from `../../src/battle/platform` so failure proves the module is absent.

```ts
import { describe, expect, it } from 'vitest'
import { resolveHorizontalMotion, resolveVerticalMotion, type BattleWall } from '../../src/battle/platform'

const walls: BattleWall[] = [
  { type: 'solid', x: 0, y: 100, width: 200, height: 20 },
  { type: 'through', x: 250, y: 40, width: 100, height: 10 },
]

it('lands on the top face while falling', () => {
  expect(resolveVerticalMotion(walls, { x: 50, fromY: 70, toY: 110, vy: 40 }))
    .toEqual({ y: 100, wallIndex: 0, surface: 'top' })
})

it('blocks a hero at a solid side', () => {
  expect(resolveHorizontalMotion(walls, { fromX: -20, toX: 10, y: 110 }).x).toBe(0)
})
```

- [ ] **Step 2: Run the focused test and verify module resolution fails**

Run: `npm test -w @zaixu/game-core -- tests/battle/platform.test.ts`

Expected: FAIL because `src/battle/platform.ts` does not exist.

- [ ] **Step 3: Migrate the resolver with core-owned names**

Copy the tested algorithm from `game/src/systems/platformSim.ts`, rename `Wall` to `BattleWall`, preserve the four wall types and pure query/result contracts, and add no Phaser imports.

```ts
export type BattleWallType = 'solid' | 'through' | 'throughUpButDown' | 'throughDownButUp'

export interface BattleWall {
  type: BattleWallType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}
```

- [ ] **Step 4: Run platform and existing hero simulation tests**

Run: `npm test -w @zaixu/game-core -- tests/battle/platform.test.ts tests/heroSim.test.ts tests/jump.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/battle/platform.ts packages/game-core/tests/battle/platform.test.ts packages/game-core/src/index.ts
git commit -m "feat(core): add battle platform resolver"
```

## Task 2: Battle Definition Contract

**Files:**
- Create: `packages/game-core/src/battle/types.ts`
- Create: `packages/game-core/src/battle/definition.ts`
- Create: `packages/game-core/tests/battle/definition.test.ts`
- Create: `packages/game-core/tests/battle/fixtures.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/package.json`

- [ ] **Step 1: Write failing definition tests**

The fixture must include one hero, one continuous encounter, one boss, walls, bounds, and a door. Assert serializable cloning, duplicate encounter rejection, invalid bounds rejection, and unsupported monster references.

```ts
const parsed = validateBattleDefinition(makeBattleDefinition())
expect(parsed).not.toBe(input)
expect(parsed.level.encounters[0].id).toBe('continuous-0')
expect(() => validateBattleDefinition({ ...input, level: { ...input.level, bounds: { left: 10, right: 0, top: 0, bottom: 10 } } }))
  .toThrow(/bounds/)
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @zaixu/game-core -- tests/battle/definition.test.ts`

Expected: FAIL because battle definition exports do not exist.

- [ ] **Step 3: Add explicit serializable contracts**

Define the public shape without generic plugins:

```ts
export interface BattleDefinition {
  runtimeVersion: 1
  contentVersion: string
  seed: number
  hero: BattleHeroDefinition
  monsters: Record<string, MonsterCombatDefinition>
  level: BattleLevelDefinition
}

export interface BattleLevelDefinition {
  id: string
  bounds: { left: number; right: number; top: number; bottom: number }
  heroSpawn: { x: number; y: number }
  walls: BattleWall[]
  encounters: BattleEncounterDefinition[]
  door: { x: number; y: number; width: number; height: number }
}

export type BattleEncounterDefinition =
  | { kind: 'continuous'; id: string; initialDelayTicks: number; intervalTicks: number; count: number; roster: string[]; spawnOffset: { x: { min: number; max: number }; y: { min: number; max: number } }; trigger: { kind: 'hero-height'; atOrAboveY: number; boss: { speciesId: string; x: number; y: number } } }
  | { kind: 'stop-point'; id: string; stopX: number; spawns: TimedSpawnDefinition[] }

export interface TimedSpawnDefinition {
  speciesId: string
  x: number
  y: number
  delayTicks: number
  intervalTicks: number
  quantity: number
}

export type BattleCommandType =
  | 'press-left' | 'release-left' | 'press-right' | 'release-right'
  | 'press-jump' | 'press-attack' | 'press-interact'

export interface BattleCommand {
  type: BattleCommandType
  actorId: ActorId
  sequence: number
  atTick: number
}

export type BattleEvent = CombatEvent
  | { type: 'actor-spawned'; tick: number; actorId: ActorId; encounterId: string; contentId: string }
  | { type: 'door-revealed'; tick: number; levelId: string }
  | { type: 'stage-cleared'; tick: number; levelId: string }

export interface BattleSnapshot {
  runtimeVersion: 1
  contentVersion: string
  tick: number
  randomState: number
  level: { id: string; doorVisible: boolean; cleared: boolean }
  actors: CombatActorSnapshot[]
}
```

Reuse `MonsterCombatDefinition` and the verified hero attack contracts rather than copying combat data into a second shape.

- [ ] **Step 4: Validate invariants with Zod plus refinements**

Reject non-finite numbers, inverted bounds, walls outside schema, duplicate IDs, unknown roster species, non-positive intervals/counts, and a door outside level bounds. Return an owned serializable clone.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w @zaixu/game-core -- tests/battle/definition.test.ts && npm run typecheck -w @zaixu/game-core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/game-core/src/battle packages/game-core/tests/battle packages/game-core/src/index.ts packages/game-core/package.json
git commit -m "feat(core): define production battle contract"
```

## Task 3: Deterministic Dynamic Actor Registry

**Files:**
- Create: `packages/game-core/src/battle/actorRegistry.ts`
- Create: `packages/game-core/tests/battle/actorRegistry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Assert stable IDs, stable sorted iteration, encounter-scoped living counts, terminal removal, and state export/import preserving the next spawn ordinal.

```ts
const registry = new BattleActorRegistry()
const first = registry.spawnMonster('sl11', 'continuous-0', 'monster30', state)
expect(first).toBe('sl11:continuous-0:monster30:0000')
expect(registry.exportState().spawnOrdinals['continuous-0']).toBe(1)
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @zaixu/game-core -- tests/battle/actorRegistry.test.ts`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement the registry**

Use `Map<ActorId, BattleMonsterRecord>` internally but return arrays sorted with `localeCompare`. Track spawn ordinals by encounter ID. Reject duplicate restoration and invalid lifecycle transitions.

```ts
export interface BattleMonsterRecord {
  id: ActorId
  encounterId: string
  speciesId: string
  simulation: MonsterState
  attackId: number
  swingEventId: number
}
```

- [ ] **Step 4: Run the test twice to prove order stability**

Run: `npm test -w @zaixu/game-core -- tests/battle/actorRegistry.test.ts && npm test -w @zaixu/game-core -- tests/battle/actorRegistry.test.ts`

Expected: both runs PASS with identical snapshots.

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/battle/actorRegistry.ts packages/game-core/tests/battle/actorRegistry.test.ts
git commit -m "feat(core): add deterministic actor registry"
```

## Task 4: `sl11` Encounter State Machine

**Files:**
- Create: `packages/game-core/src/battle/encounter.ts`
- Create: `packages/game-core/tests/battle/encounter.test.ts`

- [ ] **Step 1: Write failing timeline tests**

Cover initial delay, repeated two-unit spawns, spawn offsets driven by injected RNG, height trigger firing once, boss defeat revealing the door, and interact-overlap clearing the stage.

```ts
const state = createEncounterState(definition.level)
expect(advanceEncounter(state, { tick: 89, hero: { x: 480, y: 0 }, livingByEncounter: () => 0, random: () => 0.5 })).toEqual([])
expect(advanceEncounter(state, { tick: 90, hero: { x: 480, y: 0 }, livingByEncounter: () => 0, random: () => 0.5 }))
  .toHaveLength(2)
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @zaixu/game-core -- tests/battle/encounter.test.ts`

Expected: FAIL because encounter functions do not exist.

- [ ] **Step 3: Implement a pure transition function**

`advanceEncounter` returns declarative effects and mutates only its serializable state. Effects are `spawn-monster`, `activate-boss`, `reveal-door`, and `stage-cleared`; the runtime applies them to registries.

```ts
export type EncounterEffect =
  | { type: 'spawn-monster'; encounterId: string; speciesId: string; x: number; y: number; boss: false }
  | { type: 'activate-boss'; encounterId: string; speciesId: string; x: number; y: number; boss: true }
  | { type: 'reveal-door' }
  | { type: 'stage-cleared' }
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -w @zaixu/game-core -- tests/battle/encounter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/battle/encounter.ts packages/game-core/tests/battle/encounter.test.ts
git commit -m "feat(core): add sl11 encounter flow"
```

## Task 5: Production `BattleRuntime`

**Files:**
- Create: `packages/game-core/src/battle/runtime.ts`
- Create: `packages/game-core/tests/battle/runtime.test.ts`
- Modify: `packages/game-core/src/battle/types.ts`
- Modify: `packages/game-core/src/index.ts`

- [ ] **Step 1: Write failing runtime acceptance tests**

Drive commands by tick and assert platform landing, attack cadence independent of command spam, dynamic Monster30 damage/death/removal, boss activation, normal attack events on whiff, door interaction, and complete snapshot contents.

```ts
runtime.enqueue({ type: 'press-attack', actorId: 'hero:wukong', sequence: 1, atTick: 1 })
runtime.enqueue({ type: 'press-attack', actorId: 'hero:wukong', sequence: 2, atTick: 2 })
const events = runtime.step(2)
expect(events.filter((event) => event.type === 'attack-started')).toHaveLength(1)
expect(events).toContainEqual(expect.objectContaining({ type: 'command-rejected', reason: 'busy' }))
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @zaixu/game-core -- tests/battle/runtime.test.ts`

Expected: FAIL because `BattleRuntime` does not exist.

- [ ] **Step 3: Implement fixed-tick orchestration**

Implement `enqueue`, `step`, `getSnapshot`, and `getDeterministicState`. Reuse `advanceHero`, `advanceMonster`, `heroCombat`, attack hitboxes, and defense formulas from the verified slice. Inject core platform resolvers into hero movement. Apply encounter effects before actor simulation in a documented order.

```ts
export class BattleRuntime {
  constructor(definition: BattleDefinition)
  enqueue(command: BattleCommand): void
  step(ticks?: number): BattleEvent[]
  getSnapshot(): BattleSnapshot
  getDeterministicState(): BattleDeterministicState
}
```

- [ ] **Step 4: Preserve `CombatSession` regression evidence**

Run: `npm test -w @zaixu/game-core -- tests/combatSession.test.ts tests/combatReplay.test.ts tests/battle/runtime.test.ts`

Expected: PASS; no existing snapshots change.

- [ ] **Step 5: Run full core suite and typecheck**

Run: `npm test -w @zaixu/game-core && npm run typecheck -w @zaixu/game-core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/game-core/src/battle packages/game-core/tests/battle packages/game-core/src/index.ts
git commit -m "feat(core): add production battle runtime"
```

## Task 6: Checkpoint, Hash, And Replay

**Files:**
- Create: `packages/game-core/src/battle/checkpoint.ts`
- Create: `packages/game-core/src/battle/replay.ts`
- Create: `packages/game-core/tests/battle/checkpoint.test.ts`
- Create: `packages/game-core/tests/battle/replay.test.ts`

- [ ] **Step 1: Write failing restore/replay tests**

Run through at least one dynamic spawn, checkpoint, restore, submit identical future commands, and compare ordered events, snapshots, RNG state, spawn ordinals, and final hash. Repeat playback under 30/60/120 Hz render schedules using the same fixed-step accumulator.

```ts
expect(restored.getSnapshot()).toEqual(original.getSnapshot())
expect(hashBattleState(restored.getDeterministicState())).toBe(hashBattleState(original.getDeterministicState()))
expect(playBattleRecording(record, { renderHz: 30 }).finalHash)
  .toBe(playBattleRecording(record, { renderHz: 120 }).finalHash)
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w @zaixu/game-core -- tests/battle/checkpoint.test.ts tests/battle/replay.test.ts`

Expected: FAIL because checkpoint/replay exports do not exist.

- [ ] **Step 3: Implement versioned checkpoint and record schemas**

Include every mutable runtime field, validate on restore, and hash through the existing canonical stable hash helper. Record definitions and commands as owned serializable values. Add `BattleRuntime.restore(checkpoint)` in this task after the checkpoint type exists.

- [ ] **Step 4: Run deterministic tests repeatedly**

Run: `for i in 1 2 3; do npm test -w @zaixu/game-core -- tests/battle/checkpoint.test.ts tests/battle/replay.test.ts || exit 1; done`

Expected: all three runs PASS with the same expected hashes.

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/battle packages/game-core/tests/battle
git commit -m "feat(core): record and replay battle runtime"
```

## Task 7: Compile Recovered `sl11` Content

**Files:**
- Create: `game/src/adapters/sl11BattleDefinition.ts`
- Create: `game/tests/sl11BattleDefinition.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Assert bounds, hero spawn, all recovered walls, 90-tick initial delay, 180-tick interval, count two, Monster30 roster, `y <= -1900` Owl trigger, Owl position, and door coordinates. Assert `validateBattleDefinition` accepts the output.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w zmxy3-game -- tests/sl11BattleDefinition.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the content compiler**

Build from `LEVEL_1_WUYING` and the existing real combat definition adapter. Convert milliseconds to integer ticks with `msToTicks`, map walls to core contracts, and keep provenance metadata. Do not duplicate literal level geometry in the adapter.

```ts
export function compileSl11BattleDefinition(seed: number, profile: Sl11BattleProfile): BattleDefinition
```

- [ ] **Step 4: Run compiler, content gate, and typecheck**

Run: `npm test -w zmxy3-game -- tests/sl11BattleDefinition.test.ts tests/contentBuildGate.test.ts && npm run typecheck:projects`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/adapters/sl11BattleDefinition.ts game/tests/sl11BattleDefinition.test.ts
git commit -m "feat(game): compile sl11 for battle runtime"
```

## Task 8: Phaser Runtime Host And Loading Selection

**Files:**
- Create: `game/src/adapters/battleRuntimeInput.ts`
- Create: `game/src/adapters/battleRuntimePresentation.ts`
- Create: `game/src/scenes/BattleRuntimeScene.ts`
- Create: `game/tests/battleRuntimeSceneShell.test.ts`
- Modify: `game/src/scenes/shellShared.ts`
- Modify: `game/src/scenes/BattleLoadingScene.ts`
- Modify: `game/src/scenes/WorldMapScene.ts`
- Modify: `game/src/main.ts`

- [ ] **Step 1: Write failing shell tests**

Statically assert the scene contains no damage, reward, or encounter formulas; dynamically assert `BattleLoadingScene` targets `battle-runtime` only for campaign index zero plus the opt-in flag and otherwise launches `battle`.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -w zmxy3-game -- tests/battleRuntimeSceneShell.test.ts`

Expected: FAIL because the scene and selection contracts do not exist.

- [ ] **Step 3: Generalize loading target without changing its visual design**

Extend `BattleData` with `runtime?: 'legacy' | 'production'`. Resolve scene key and ready event through a pure helper. Keep progress subscriptions, status rotation, and black-screen protection unchanged.

```ts
export function battleTarget(data: BattleData): { sceneKey: string; readyEvent: string } {
  return data.runtime === 'production'
    ? { sceneKey: SCENE.battleRuntime, readyEvent: BATTLE_RUNTIME_READY_EVENT }
    : { sceneKey: SCENE.battle, readyEvent: BATTLE_READY_EVENT }
}
```

- [ ] **Step 4: Implement the thin scene**

Preload the existing `sl11` presentation manifest, construct `BattleRuntime`, run a bounded fixed-step accumulator, enqueue input edges for `snapshot.tick + 1`, and reconcile views. Emit `battle-runtime-ready` only after required textures, runtime construction, and the first rendered snapshot succeed.

- [ ] **Step 5: Add opt-in routing and fallback**

For campaign index zero, `?battleRuntime=1` passes `runtime: 'production'`; all other routes remain legacy. Register both scenes in the normal Phaser configuration.

- [ ] **Step 6: Run shell tests, full game tests, typecheck, and build**

Run: `npm test -w zmxy3-game -- tests/battleRuntimeSceneShell.test.ts && npm test -w zmxy3-game && npm run typecheck:projects && npm run build -w zmxy3-game`

Expected: PASS; Vite build emits both scenes and no missing asset errors.

- [ ] **Step 7: Commit**

```bash
git add game/src/adapters/battleRuntimeInput.ts game/src/adapters/battleRuntimePresentation.ts game/src/scenes/BattleRuntimeScene.ts game/src/scenes/shellShared.ts game/src/scenes/BattleLoadingScene.ts game/src/scenes/WorldMapScene.ts game/src/main.ts game/tests/battleRuntimeSceneShell.test.ts
git commit -m "feat(game): host sl11 battle runtime"
```

## Task 9: Real Browser Gate And Operational Playbook

**Files:**
- Create: `game/tools/verify-sl11-runtime.mjs`
- Create: `docs/playbooks/chapter-one-runtime-host.md`
- Create: `game/tests/browser/sl11-runtime.spec.ts` if the repository's Playwright layout uses test files rather than a standalone script.

- [ ] **Step 1: Add a failing browser gate**

Launch the built game with `?battleRuntime=1`, enter `sl11`, wait for loading progress and ready state, move/jump/attack, climb via a deterministic debug command hook, defeat the Owl through the same command boundary, interact with the door, and assert stage clear. Capture console errors, failed requests, snapshots, runtime hash, and screenshots.

- [ ] **Step 2: Run it against the production build**

Run: `npm run build -w zmxy3-game && node game/tools/verify-sl11-runtime.mjs`

Expected before final wiring: FAIL at the first incomplete runtime-host behavior with an evidence directory path.

- [ ] **Step 3: Fix only observed host integration failures**

Use the evidence bundle to correct asset keys, render origins, camera following, view lifecycle, input binding, or loading readiness. Do not move authority back into Phaser.

- [ ] **Step 4: Run all required gates**

Run:

```bash
npm run typecheck:projects
npm test -w @zaixu/game-core
npm test -w zmxy3-game
npm run build -w zmxy3-game
node game/tools/verify-sl11-runtime.mjs
npm run verify:combat-core
```

Expected: all commands PASS. Browser evidence contains no uncaught errors, missing assets, black transition, or runtime hash mismatch. The legacy route without `battleRuntime=1` still reaches `BattleScene`.

- [ ] **Step 5: Write the playbook with actual evidence paths and commands**

Document opt-in/fallback URLs, expected first-chapter state, debug hook contract, evidence artifacts, known deferred Phase 2/3 behavior, and failure triage.

- [ ] **Step 6: Commit the verified phase**

```bash
git add game/tools/verify-sl11-runtime.mjs game/tests/browser docs/playbooks/chapter-one-runtime-host.md
git commit -m "test: verify sl11 runtime host end to end"
```

## Phase Completion Criteria

Phase 1 is complete only when:

- `sl11` is playable from the world map through the existing loading transition.
- Platforms, continuous Monster30 spawns, Owl activation/defeat, door reveal, interaction, and stage clear are authoritative in `BattleRuntime`.
- Whiff attacks still animate and sound; key repeat cannot accelerate attacks.
- Checkpoint restore and replay produce identical events, snapshots, and final hash.
- The production browser build passes the real browser gate with no failed asset request or uncaught error.
- The original Combat Core suite and the legacy `BattleScene` fallback still pass their gates.
