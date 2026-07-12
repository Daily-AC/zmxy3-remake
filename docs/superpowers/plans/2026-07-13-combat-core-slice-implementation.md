# Combat Core Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, renderer-independent combat session for Wukong versus Monster7, prove original attack cadence and two-way damage in a real browser, and leave the current game flow unchanged by default.

**Architecture:** Introduce `@zaixu/game-core` as a DOM-free TypeScript package and move the already-pure hero and monster rules into it behind compatibility exports. A new `CombatSession` accepts sequenced commands at a fixed 30 Hz, emits serializable combat events and snapshots, and is rendered by an opt-in Phaser scene reached only through `?combatCoreSlice=1`.

**Tech Stack:** TypeScript 5.6, Vitest 3, Zod 4.4, Phaser 4.2, Vite 6, npm workspaces, Playwright 1.61.

---

## Scope And Completion Contract

This plan implements only the first engineering milestone from the approved architecture design:

- One local Wukong actor using the current five-stage normal combo, jump, movement, hurt, death, and respawn rules.
- One real Monster7 definition using current recovered stats, animation timing, hitbox, and attack power.
- Fixed 30 Hz simulation with no Phaser, DOM, audio, texture, storage, or network imports in the core package.
- Commands in; ordered events and renderer-safe snapshots out.
- Swing events on misses, hit events only on overlap, attack-mash rejection, defense-aware damage, stagger, death, removal, and respawn.
- Seeded randomness, stable state hashes, and replay equality.
- An isolated playable Phaser proof using extracted Wukong and Monster7 assets.
- Unit, parity, performance, build, real-browser verification, and a one-action reproducible bug bundle.

The following remain outside this slice:

- Skills, mana, equipment inventory, drops, furnace, pets, stage waves, bosses, save migration, online authority, React shell, and Tauri packaging.
- Replacing `BattleScene` as the default campaign runtime.
- General ECS, plugin APIs, or a generic content editor.
- The general content compiler, registry, and cross-system dependency graph beyond this slice's Zod schema and build gate.
- The full multi-system World Inspector; this slice ships replay/debug observation and one-action bug capture, while pause/single-step/speed/network inspection lands with the runtime host milestone.

The slice is complete only when all final-gate commands in Task 10 pass and the browser proof records:

1. A Wukong swing in empty space emits `attack-started` but no `hit-confirmed`.
2. Repeated attack presses cannot start another swing before the current swing permits it.
3. A real overlap damages Monster7 by `max(1, 36 - 4) = 32` for a non-critical hit.
4. Monster7 damages a hero with defense 2 by `max(1, 14 - 2) = 12`.
5. Replaying the captured command stream from the same seed yields the same final hash.

## File And Ownership Map

### Workspace

- Create `package.json`: root npm workspace and cross-package verification commands.
- Create `tsconfig.package.json`: shared DOM-free composite package settings.
- Create `package-lock.json`: single lockfile for `game` and `packages/*`.
- Delete `game/package-lock.json`: prevent divergent workspace dependency graphs.
- Modify `game/package.json`: depend on the core/contract packages and Playwright proof tooling.

### Renderer-Independent Core

- Create `packages/content`: stable content IDs and origin metadata.
- Create `packages/protocol`: protocol version and typed envelopes.
- Create `packages/save-schema`: save-schema version and envelope.
- Create `packages/presentation-contract`: renderer-neutral presentation cue envelope.
- Create `packages/game-core/package.json`: package exports and scripts.
- Create `packages/game-core/tsconfig.json`: strict ES2022 build with no DOM library.
- Create `packages/game-core/tsconfig.test.json`: tests/tools typecheck with host diagnostics while the source config remains runtime-neutral.
- Create `packages/game-core/src/index.ts`: public API only.
- Merge the legacy `FPS` export into `packages/game-core/src/time/tick.ts` and replace `game/src/systems/tick.ts` with a compatibility export.
- Move `game/src/systems/locomotion.ts`, `jump.ts`, `combo.ts`, and `heroSim.ts` to `packages/game-core/src/hero/`.
- Move `game/src/systems/hitbox.ts`, `heroScale.ts`, and `heroCombat.ts` to `packages/game-core/src/combat/`.
- Move `game/src/systems/monsterSim.ts` to `packages/game-core/src/monster/monsterSim.ts`.
- Create `packages/game-core/src/combat/attackSpec.ts`: pure timing and hitbox contract.
- Create `packages/game-core/src/combat/monsterAttackSpecs.ts`: recovered monster timing and hitbox data without visual attachments.
- Create `packages/game-core/src/random/seededRandom.ts`: serializable xorshift32 source.
- Create `packages/game-core/src/session/types.ts`: definitions and actor snapshots.
- Create `packages/game-core/src/session/definition.ts`: runtime definition validation and ownership cloning.
- Create `packages/game-core/src/session/commands.ts`: sequenced input protocol.
- Create `packages/game-core/src/session/events.ts`: ordered domain event union.
- Create `packages/game-core/src/session/snapshot.ts`: public snapshot construction.
- Create `packages/game-core/src/session/checkpoint.ts`: complete deterministic state for hashes, replay, parity, and bug bundles.
- Create `packages/game-core/src/session/combatSession.ts`: command queue, simulation, hit resolution, and lifecycle.
- Create `packages/game-core/src/replay/stableHash.ts`: canonical state hashing.
- Create `packages/game-core/src/replay/combatReplay.ts`: recording and deterministic replay.

### Compatibility And Presentation

- Recreate each moved `game/src/systems/*.ts` path as a one-line package re-export.
- Modify `game/src/systems/attackSpec.ts`: extend the pure attack contract with visual attachments.
- Create `game/src/data/monsterAttackPower.ts`: move Monster7 and future monster power metadata out of `BattleScene`.
- Create `game/src/presentation/actorVisualMetrics.ts`: shared extracted alpha bounds, offsets, and visible top/bottom alignment.
- Create `game/src/presentation/role1AttackPresentation.ts`: Wukong swing audio and effect mapping.
- Create `game/src/presentation/registerRoleAnimations.ts`: reusable JSON-to-Phaser animation registration.
- Create `game/src/adapters/combatCoreDefinition.ts`: compile real game data into one serializable session definition.
- Create `game/src/adapters/combatCoreInput.ts`: keyboard edges to core commands.
- Create `game/src/adapters/combatCorePresentation.ts`: domain events to versioned renderer-neutral presentation cues.
- Create `game/src/adapters/legacyCombatSliceOracle.ts`: frozen headless adapter for the current BattleScene orchestration semantics.
- Create `game/src/adapters/combatCoreParity.ts`: tick-by-tick legacy/new trace comparison.
- Create `game/src/scenes/CombatCoreScene.ts`: isolated playable proof.
- Create `game/src/buildInfo.ts` and a Vite-defined game version boundary for diagnostics.
- Modify `game/src/scenes/BattleScene.ts`: consume extracted power/presentation/animation helpers without changing behavior.
- Modify `game/src/main.ts`: register and select the opt-in scene.

### Tests, Proof, And Documentation

- Move pure-system tests from `game/tests` to `packages/game-core/tests`.
- Create `packages/game-core/tests/attackSpec.test.ts`.
- Create `packages/game-core/tests/seededRandom.test.ts`.
- Create `packages/game-core/tests/checkpoint.test.ts`.
- Create `packages/game-core/tests/definition.test.ts`.
- Create `packages/game-core/tests/combatSession.test.ts`.
- Create `packages/game-core/tests/combatReplay.test.ts`.
- Create `packages/game-core/tools/bench-combat-slice.bench.ts` behind a benchmark-only Vitest config so unit runs cannot pollute timing.
- Create `game/tests/gameCoreCompatibility.test.ts`.
- Create `game/tests/combatCoreDefinition.test.ts`.
- Create `game/tests/contentBuildGate.test.ts`.
- Create `game/tests/combatCoreInput.test.ts`.
- Create `game/tests/combatCorePresentation.test.ts`.
- Create `game/tests/combatCoreLegacyParity.test.ts`.
- Create `game/tests/combatCoreDualRun.test.ts`.
- Create `game/tests/combatCoreSceneWiring.test.ts`.
- Create `game/tools/verify-combat-core-slice.mjs`.
- Create: `game/tests/baselines/combat-core-slice-initial.png`
- Create `docs/playbooks/combat-core-slice.md`.
- Create `docs/reports/combat-core-slice-parity.md`.
- Create `docs/reports/combat-core-slice-performance.md` from measured evidence.

## Implementation Invariants

- The core package may import only its own modules, Zod, and the renderer-neutral `@zaixu/content`/`@zaixu/protocol` contracts. `rg "from ['\\\"](phaser|react|@tauri|ws)" packages/game-core` must return no matches.
- The session advances only by integer ticks. Existing deterministic millisecond counters are advanced exclusively by `TICK_MS`; wall-clock deltas never enter the core.
- Runtime randomness enters through `SeededRandom.next()`. Core code must not call `Math.random()`.
- Commands are accepted only in ascending sequence order per actor and only at or after their `atTick`.
- Events are ordered by tick, actor iteration order, and event production order.
- Snapshots contain plain objects, arrays, numbers, strings, booleans, and null only.
- Rendering never changes core state.
- The query-only scene must not change the default startup route or existing campaign acceptance hooks.

### Task 1: Establish The Workspace And Core Package Boundary

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.package.json`
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `packages/content/src/index.ts`
- Create: `packages/content/tests/content.test.ts`
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/tests/protocol.test.ts`
- Create: `packages/save-schema/package.json`
- Create: `packages/save-schema/tsconfig.json`
- Create: `packages/save-schema/src/index.ts`
- Create: `packages/save-schema/tests/saveSchema.test.ts`
- Create: `packages/presentation-contract/package.json`
- Create: `packages/presentation-contract/tsconfig.json`
- Create: `packages/presentation-contract/src/index.ts`
- Create: `packages/presentation-contract/tests/presentationContract.test.ts`
- Create: `packages/game-core/package.json`
- Create: `packages/game-core/tsconfig.json`
- Create: `packages/game-core/tsconfig.test.json`
- Create: `packages/game-core/vitest.bench.config.ts`
- Create: `packages/game-core/src/index.ts`
- Create: `packages/game-core/tests/packageBoundary.test.ts`
- Modify: `game/package.json`
- Modify: `game/tsconfig.json`
- Modify: `.gitignore`
- Delete after root install: `game/package-lock.json`

- [ ] **Step 1: Confirm and preserve the hackathon baseline**

Run:

```bash
baseline_commit=$(git rev-parse 'bdf9405^{commit}')
tag_commit=$(git rev-parse 'hackathon-2026-final^{commit}')
test "$baseline_commit" = "$tag_commit"
```

Expected: the comparison exits 0 because both names peel to the same full commit hash. If resolving the tag fails, create the local annotated tag and verify its peeled commit:

```bash
git tag -a hackathon-2026-final bdf9405 -m "Hackathon 2026 final baseline"
test "$(git rev-parse 'bdf9405^{commit}')" = "$(git rev-parse 'hackathon-2026-final^{commit}')"
```

Expected: exit 0. Do not compare the abbreviated input or the annotated tag object's own hash.

- [ ] **Step 2: Write the failing package-boundary test**

Create `packages/game-core/tests/packageBoundary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TICK_MS, TICK_RATE } from '../src/index'

describe('game-core package boundary', () => {
  it('exposes the canonical fixed tick without browser globals', () => {
    expect(TICK_RATE).toBe(30)
    expect(TICK_MS).toBeCloseTo(1000 / 30)
    expect('document' in globalThis).toBe(false)
  })
})
```

- [ ] **Step 3: Create the root workspace manifest**

Create `package.json`:

```json
{
  "name": "zaixu-xiyou",
  "private": true,
  "workspaces": [
    "game",
    "packages/*"
  ],
  "scripts": {
    "typecheck:projects": "tsc -b",
    "typecheck:core": "npm run typecheck -w @zaixu/game-core",
    "test:contracts": "npm test -w @zaixu/content && npm test -w @zaixu/protocol && npm test -w @zaixu/save-schema && npm test -w @zaixu/presentation-contract",
    "test:core": "npm test -w @zaixu/game-core",
    "test:game": "npm test -w zmxy3-game",
    "build:game": "npm run build -w zmxy3-game",
    "bench:combat-core": "npm run bench -w @zaixu/game-core",
    "verify:combat-core": "npm run verify:combat-core -w zmxy3-game"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/game-core/package.json`:

```json
{
  "name": "@zaixu/game-core",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "types": "./dist-types/index.d.ts",
  "dependencies": {
    "@zaixu/content": "0.1.0",
    "@zaixu/protocol": "0.1.0",
    "zod": "^4.4.3"
  },
  "exports": {
    ".": { "types": "./dist-types/index.d.ts", "default": "./src/index.ts" },
    "./tick": { "types": "./dist-types/time/tick.d.ts", "default": "./src/time/tick.ts" },
    "./locomotion": { "types": "./dist-types/hero/locomotion.d.ts", "default": "./src/hero/locomotion.ts" },
    "./jump": { "types": "./dist-types/hero/jump.d.ts", "default": "./src/hero/jump.ts" },
    "./combo": { "types": "./dist-types/hero/combo.d.ts", "default": "./src/hero/combo.ts" },
    "./heroSim": { "types": "./dist-types/hero/heroSim.d.ts", "default": "./src/hero/heroSim.ts" },
    "./hitbox": { "types": "./dist-types/combat/hitbox.d.ts", "default": "./src/combat/hitbox.ts" },
    "./heroScale": { "types": "./dist-types/combat/heroScale.d.ts", "default": "./src/combat/heroScale.ts" },
    "./heroCombat": { "types": "./dist-types/combat/heroCombat.d.ts", "default": "./src/combat/heroCombat.ts" },
    "./attackSpec": { "types": "./dist-types/combat/attackSpec.d.ts", "default": "./src/combat/attackSpec.ts" },
    "./monsterAttackSpecs": { "types": "./dist-types/combat/monsterAttackSpecs.d.ts", "default": "./src/combat/monsterAttackSpecs.ts" },
    "./monsterSim": { "types": "./dist-types/monster/monsterSim.d.ts", "default": "./src/monster/monsterSim.ts" },
    "./session": { "types": "./dist-types/session/combatSession.d.ts", "default": "./src/session/combatSession.ts" },
    "./replay": { "types": "./dist-types/replay/combatReplay.d.ts", "default": "./src/replay/combatReplay.ts" }
  },
  "scripts": {
    "typecheck": "tsc -b && tsc --noEmit -p tsconfig.test.json",
    "test": "vitest run",
    "bench": "vitest run --config vitest.bench.config.ts --reporter=verbose"
  },
  "devDependencies": {
    "@types/node": "^26.1.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/game-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "dist-types",
    "rootDir": "src",
    "tsBuildInfoFile": "dist-types/tsconfig.tsbuildinfo",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "lib": ["ES2022"]
  },
  "include": ["src"],
  "references": [
    { "path": "../content" },
    { "path": "../protocol" }
  ]
}
```

Create `packages/game-core/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "emitDeclarationOnly": false,
    "noEmit": true,
    "incremental": true,
    "tsBuildInfoFile": "dist-types/tsconfig.test.tsbuildinfo",
    "rootDir": ".",
    "types": ["node"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["tests", "tools"]
}
```

The DOM library exists only in the secondary test/tool config so Vitest diagnostics such as `console` are typed. `npm run typecheck` always builds the DOM-free declaration project first.

Create `packages/game-core/vitest.bench.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/**/*.bench.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
```

The ordinary `vitest run` unit script must not discover `.bench.ts` files; timing assertions run only through the explicit `bench` script.

Create the root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/content" },
    { "path": "./packages/protocol" },
    { "path": "./packages/save-schema" },
    { "path": "./packages/presentation-contract" },
    { "path": "./packages/game-core" },
    { "path": "./game" }
  ]
}
```

Modify `game/tsconfig.json` by adding these compiler options and one-way references to every package it imports directly:

```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "../.tsbuild/game",
    "rootDir": "src",
    "tsBuildInfoFile": "../.tsbuild/game.tsbuildinfo"
  },
  "references": [
    { "path": "../packages/content" },
    { "path": "../packages/protocol" },
    { "path": "../packages/save-schema" },
    { "path": "../packages/presentation-contract" },
    { "path": "../packages/game-core" }
  ]
}
```

Preserve every existing game compiler option and `include` entry. Add `packages/*/dist-types/` and `.tsbuild/` to `.gitignore`.

Modify `game/package.json` by adding:

```json
{
  "scripts": {
    "build": "tsc -b && vite build",
    "verify:combat-core": "node tools/verify-combat-core-slice.mjs"
  },
  "dependencies": {
    "@zaixu/content": "0.1.0",
    "@zaixu/game-core": "0.1.0",
    "@zaixu/presentation-contract": "0.1.0",
    "@zaixu/protocol": "0.1.0",
    "@zaixu/save-schema": "0.1.0",
    "phaser": "^4.2.0"
  },
  "devDependencies": {
    "@types/pngjs": "^6.0.5",
    "pixelmatch": "^7.2.0",
    "playwright": "^1.61.1",
    "pngjs": "^7.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Preserve the existing fields not shown above; replace the current `build` script with the project-reference build shown here.

- [ ] **Step 4: Create the four minimal architecture contract packages**

Create `tsconfig.package.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "lib": ["ES2022"]
  }
}
```

Create these exact manifests. In the annotated block below, each comment labels the destination and is not part of the JSON file:

```jsonc
// packages/content/package.json
{
  "name": "@zaixu/content",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "types": "./dist-types/index.d.ts",
  "exports": { ".": { "types": "./dist-types/index.d.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc -b", "test": "vitest run" },
  "dependencies": { "zod": "^4.4.3" }
}

// packages/protocol/package.json
{
  "name": "@zaixu/protocol",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "types": "./dist-types/index.d.ts",
  "exports": { ".": { "types": "./dist-types/index.d.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc -b", "test": "vitest run" }
}

// packages/save-schema/package.json
{
  "name": "@zaixu/save-schema",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "types": "./dist-types/index.d.ts",
  "exports": { ".": { "types": "./dist-types/index.d.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc -b", "test": "vitest run" }
}

// packages/presentation-contract/package.json
{
  "name": "@zaixu/presentation-contract",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "types": "./dist-types/index.d.ts",
  "exports": { ".": { "types": "./dist-types/index.d.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc -b", "test": "vitest run" }
}
```

Create identical `tsconfig.json` content at `packages/content`, `packages/protocol`, `packages/save-schema`, and `packages/presentation-contract`. The three output paths must live here, not in the inherited root config, because relative compiler paths are resolved from the file that declares them:

```json
{
  "extends": "../../tsconfig.package.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-types",
    "tsBuildInfoFile": "dist-types/tsconfig.tsbuildinfo"
  },
  "include": ["src"]
}
```

Create `packages/content/src/index.ts`:

```ts
import { z } from 'zod'

const CONTENT_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/

export const ContentIdSchema = z.string()
  .regex(CONTENT_ID_PATTERN, 'invalid namespaced content id')
  .brand<'ContentId'>()
export type ContentId = z.infer<typeof ContentIdSchema>

export const RuleOriginSchema = z.enum(['canonical', 'adapted', 'invented'])
export type RuleOrigin = z.infer<typeof RuleOriginSchema>

export const RuleProvenanceSchema = z.strictObject({
  ruleId: z.string().min(1),
  origin: RuleOriginSchema,
  source: z.string().min(1),
})
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>

export function defineContentId(value: string): ContentId {
  return ContentIdSchema.parse(value)
}

export function assertUniqueContentIds(ids: readonly ContentId[]): void {
  if (new Set(ids).size !== ids.length) throw new Error('duplicate content id')
}
```

Create `packages/protocol/src/index.ts`:

```ts
export const PROTOCOL_VERSION = 'combat-session@1' as const

export interface ProtocolEnvelope<TPayload> {
  protocolVersion: typeof PROTOCOL_VERSION
  sequence: number
  payload: TPayload
}
```

Create `packages/save-schema/src/index.ts`:

```ts
export const SAVE_SCHEMA_VERSION = 'profile@1' as const

export interface SaveEnvelope<TData> {
  saveSchemaVersion: typeof SAVE_SCHEMA_VERSION
  data: TData
}
```

Create `packages/presentation-contract/src/index.ts`:

```ts
export const PRESENTATION_CONTRACT_VERSION = 'presentation@1' as const

export interface PresentationCue<TType extends string, TPayload> {
  presentationVersion: typeof PRESENTATION_CONTRACT_VERSION
  tick: number
  type: TType
  payload: TPayload
}
```

Write one focused Vitest file per package. Assert valid/invalid/duplicate content IDs, exact protocol/save/presentation versions, and preservation of generic envelope payloads. The content tests must include the approved architecture examples `item.zaixu.tail_fire_staff` and `stage.chapter1.nine_heavens` so the runtime validator and design document cannot silently diverge.

- [ ] **Step 5: Add the minimal game-core implementation**

Create `packages/game-core/src/time/tick.ts`:

```ts
export const TICK_RATE = 30
export const TICK_MS = 1000 / TICK_RATE
```

Create `packages/game-core/src/index.ts`:

```ts
export * from './time/tick'
```

- [ ] **Step 6: Install the root workspace and verify the first green test**

Run:

```bash
npm install
npm run typecheck:projects
npm run test:contracts
npm run typecheck:core
npm --prefix packages/game-core test -- tests/packageBoundary.test.ts
```

Before running these commands, delete `game/package-lock.json` with `apply_patch` so the root workspace owns the only game lockfile. Expected: root `package-lock.json` and core/game declaration outputs are created; project-reference and test/tool typechecks pass; one test passes.

- [ ] **Step 7: Prove the dependency boundary mechanically**

Run:

```bash
if rg "from ['\\\"](phaser|react|@tauri|ws)" packages/game-core; then exit 1; fi
```

Expected: exit 0 with no matches.

- [ ] **Step 8: Commit the workspace boundary**

```bash
git add .gitignore package.json package-lock.json tsconfig.json tsconfig.package.json game/package.json game/package-lock.json game/tsconfig.json packages
git commit -m "build: add renderer-independent game core workspace"
```

### Task 2: Move Existing Pure Hero Rules Behind Compatibility Exports

**Files:**
- Modify: `packages/game-core/src/time/tick.ts` to absorb the legacy `FPS` export
- Replace: `game/src/systems/tick.ts` with a compatibility export
- Move: `game/src/systems/locomotion.ts` to `packages/game-core/src/hero/locomotion.ts`
- Move: `game/src/systems/jump.ts` to `packages/game-core/src/hero/jump.ts`
- Move: `game/src/systems/combo.ts` to `packages/game-core/src/hero/combo.ts`
- Move: `game/src/systems/heroSim.ts` to `packages/game-core/src/hero/heroSim.ts`
- Move: `game/src/systems/hitbox.ts` to `packages/game-core/src/combat/hitbox.ts`
- Move: `game/src/systems/heroScale.ts` to `packages/game-core/src/combat/heroScale.ts`
- Move: `game/src/systems/heroCombat.ts` to `packages/game-core/src/combat/heroCombat.ts`
- Recreate: all eight old `game/src/systems` paths as compatibility exports
- Move tests: `game/tests/combo.test.ts`, `heroCombat.test.ts`, `heroScale.test.ts`, `heroSim.test.ts`, `hitbox.test.ts`, `jump.test.ts`, and `locomotion.test.ts` to `packages/game-core/tests`
- Create: `game/tests/gameCoreCompatibility.test.ts`

- [ ] **Step 1: Write the failing compatibility test**

Create `game/tests/gameCoreCompatibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TICK_MS as legacyTick } from '../src/systems/tick'
import { TICK_MS as packageTick } from '@zaixu/game-core/tick'
import { makeHeroConfig as legacyConfig } from '../src/systems/heroSim'
import { makeHeroConfig as packageConfig } from '@zaixu/game-core/heroSim'

describe('game-core compatibility exports', () => {
  it('keeps existing client imports on the package implementation', () => {
    expect(legacyTick).toBe(packageTick)
    expect(legacyConfig).toBe(packageConfig)
  })
})
```

- [ ] **Step 2: Run it and observe the missing subpath failure**

Run:

```bash
npm --prefix game test -- tests/gameCoreCompatibility.test.ts
```

Expected: FAIL because `@zaixu/game-core/heroSim` does not yet resolve.

- [ ] **Step 3: Move the seven pure source files and update only relative imports**

Use `git mv` for `locomotion.ts`, `jump.ts`, `combo.ts`, `heroSim.ts`, `hitbox.ts`, `heroScale.ts`, and `heroCombat.ts` only. `tick.ts` already exists in the destination from Task 1, so merge its legacy `FPS` name with `apply_patch` and replace the old game file with a shim instead of trying to move over an existing target. Preserve behavior and comments. Apply these import rewrites:

```text
hero/heroSim.ts: ./tick -> ../time/tick
hero/heroSim.ts: ./locomotion -> ./locomotion
hero/heroSim.ts: ./jump -> ./jump
hero/heroSim.ts: ./combo -> ./combo
combat/heroScale.ts: keep all dependencies inside combat or use ../random only when Task 4 lands
combat/heroCombat.ts: no browser imports
```

Keep `packages/game-core/src/time/tick.ts` as:

```ts
export const TICK_RATE = 30
export const FPS = TICK_RATE
export const TICK_MS = 1000 / TICK_RATE
```

- [ ] **Step 4: Recreate compatibility files**

Each old path contains exactly one export:

```ts
// game/src/systems/tick.ts
export * from '@zaixu/game-core/tick'

// game/src/systems/locomotion.ts
export * from '@zaixu/game-core/locomotion'

// game/src/systems/jump.ts
export * from '@zaixu/game-core/jump'

// game/src/systems/combo.ts
export * from '@zaixu/game-core/combo'

// game/src/systems/heroSim.ts
export * from '@zaixu/game-core/heroSim'

// game/src/systems/hitbox.ts
export * from '@zaixu/game-core/hitbox'

// game/src/systems/heroScale.ts
export * from '@zaixu/game-core/heroScale'

// game/src/systems/heroCombat.ts
export * from '@zaixu/game-core/heroCombat'
```

Update `packages/game-core/src/index.ts` to export the same modules:

```ts
export * from './time/tick'
export * from './hero/locomotion'
export * from './hero/jump'
export * from './hero/combo'
export * from './hero/heroSim'
export * from './combat/hitbox'
export * from './combat/heroScale'
export * from './combat/heroCombat'
```

- [ ] **Step 5: Move the pure tests and update their imports**

Use `git mv` for the seven listed tests. Replace imports of `../src/systems/<module>` with `../src/<new-path>`. Keep test bodies unchanged so the move proves behavioral preservation rather than rewriting expectations.

- [ ] **Step 6: Run direct package tests and client compatibility tests**

Run:

```bash
npm run typecheck:projects
npm run test:contracts
npm run typecheck:core
npm run test:core
npm --prefix game test -- tests/gameCoreCompatibility.test.ts
npm run build:game
```

Expected: all moved tests pass, the compatibility test passes, and the client builds.

- [ ] **Step 7: Commit the pure hero extraction**

```bash
git add packages/game-core game/src/systems game/tests package-lock.json
git commit -m "refactor: move pure hero rules into game core"
```

### Task 3: Separate Attack Geometry From Visual Attachments And Move Monster AI

**Files:**
- Create: `packages/game-core/src/combat/attackSpec.ts`
- Create: `packages/game-core/src/combat/monsterAttackSpecs.ts`
- Create: `game/src/adapters/legacyCombatSliceOracle.ts`
- Create: `game/tools/capture-legacy-combat-slice.ts`
- Create: `game/tests/fixtures/combat-core-slice-legacy-golden.json`
- Create: `game/tests/legacyCombatSliceGolden.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Move: `game/src/systems/monsterSim.ts` to `packages/game-core/src/monster/monsterSim.ts`
- Modify: `game/src/systems/attackSpec.ts`
- Recreate: `game/src/systems/monsterSim.ts`
- Move: `game/tests/monsterSim.test.ts` to `packages/game-core/tests/monsterSim.test.ts`
- Split: `game/tests/attackSpec.test.ts` into `packages/game-core/tests/attackSpec.test.ts` and the retained presentation assertions

- [ ] **Step 1: Write a failing pure attack-geometry test**

Create `packages/game-core/tests/attackSpec.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { centeredBox, overlaps } from '../src/combat/hitbox'
import {
  horizontalAttackReach,
  resolveAttackHitbox,
} from '../src/combat/attackSpec'
import { MONSTER_ATTACKS } from '../src/combat/monsterAttackSpecs'

describe('pure attack geometry', () => {
  it('mirrors one local box across both facings', () => {
    const right = resolveAttackHitbox(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, 1)
    const left = resolveAttackHitbox(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, -1)

    expect(right).toMatchObject({ left: 500, top: 239, right: 660, bottom: 389 })
    expect(left).toMatchObject({ left: 340, top: 239, right: 500, bottom: 389 })
    expect(overlaps(right, centeredBox(505, 335, 46, 92))).toBe(true)
    expect(horizontalAttackReach(MONSTER_ATTACKS.monster7.hit1, 90)).toBe(205)
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module**

Run:

```bash
npm --prefix packages/game-core test -- tests/attackSpec.test.ts
```

Expected: FAIL because `src/combat/attackSpec.ts` does not exist.

- [ ] **Step 3: Implement the DOM-free attack contract**

Create `packages/game-core/src/combat/attackSpec.ts`:

```ts
import { centeredBox, type Rect } from './hitbox'

export interface AttackHitboxSpec {
  forward: number
  y: number
  width: number
  height: number
}

export interface AttackSpec {
  action: string
  hitFrameFractions: readonly number[]
  hitbox: AttackHitboxSpec
}

export interface WorldAttackRect extends Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export function resolveAttackHitbox(
  spec: AttackSpec,
  anchor: { x: number; y: number },
  facing: -1 | 1,
): WorldAttackRect {
  const centerX = anchor.x + facing * spec.hitbox.forward
  const centerY = anchor.y + spec.hitbox.y
  const rect = centeredBox(centerX, centerY, spec.hitbox.width, spec.hitbox.height)
  return {
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
  }
}

export function horizontalAttackReach(spec: AttackSpec, targetHurtboxWidth: number): number {
  return spec.hitbox.forward + spec.hitbox.width / 2 + Math.max(0, targetHurtboxWidth) / 2
}

export function fallbackMonsterAttackSpec(action: string, reach: number): AttackSpec {
  return {
    action,
    hitFrameFractions: [0.5],
    hitbox: { forward: reach / 2, y: 0, width: reach, height: 150 },
  }
}
```

- [ ] **Step 4: Move recovered monster attack data into the pure package**

Create `packages/game-core/src/combat/monsterAttackSpecs.ts`:

```ts
import type { AttackSpec } from './attackSpec'

export const MONSTER_ATTACKS = {
  monster2: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [19 / 35, 1],
      hitbox: { forward: 75 / 2, y: 0, width: 75, height: 150 },
    },
  },
  monster3: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [7 / 15],
      hitbox: { forward: 105, y: -60, width: 120, height: 90 },
    },
    hit2: {
      action: 'hit2',
      hitFrameFractions: [30 / 31],
      hitbox: { forward: 155, y: -30, width: 140, height: 100 },
    },
  },
  monster4: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [14 / 21],
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster5: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [8 / 15],
      hitbox: { forward: 155 / 2, y: 0, width: 155, height: 150 },
    },
  },
  monster7: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [0.6],
      hitbox: { forward: 80, y: -86, width: 160, height: 150 },
    },
  },
  monster8: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [1],
      hitbox: { forward: 97, y: -85, width: 150, height: 150 },
    },
    hit2: {
      action: 'hit2',
      hitFrameFractions: [1 / 4],
      hitbox: { forward: 46, y: -30, width: 150, height: 150 },
    },
  },
  monster30: {
    hit1: {
      action: 'hit1',
      hitFrameFractions: [1],
      hitbox: { forward: 0, y: 0, width: 0, height: 0 },
    },
  },
} as const satisfies Record<string, Record<string, AttackSpec>>

export function monsterAttackSpecFor(species: string, action: string): AttackSpec | undefined {
  const attacks = MONSTER_ATTACKS as Record<string, Record<string, AttackSpec>>
  return attacks[species]?.[action]
}
```

Export this file from `packages/game-core/src/index.ts` and the package `exports` map.

- [ ] **Step 5: Make the client attack module a presentation extension**

In `game/src/systems/attackSpec.ts` import the pure contract and keep existing effect data client-side:

```ts
import {
  fallbackMonsterAttackSpec,
  horizontalAttackReach,
  resolveAttackHitbox,
  type AttackSpec as CoreAttackSpec,
  type WorldAttackRect,
} from '@zaixu/game-core/attackSpec'
import { MONSTER_ATTACKS as CORE_MONSTER_ATTACKS } from '@zaixu/game-core/monsterAttackSpecs'
import { resolveVisualAttachment, type VisualAttachmentSpec } from './visualAttachment'

export interface AttackSpec extends CoreAttackSpec {
  effect?: VisualAttachmentSpec & { action: string }
}

export interface ResolvedAttackSpec {
  hitbox: WorldAttackRect
  effect?: ReturnType<typeof resolveVisualAttachment> & { action: string }
}

function effect(action: string, forward: number, y: number): VisualAttachmentSpec & { action: string } {
  return {
    action,
    anchor: 'world',
    offset: { forward, y },
    pivotPx: { x: 0, y: 0 },
    scale: 1,
    followAnchor: false,
  }
}

export const MONSTER_ATTACKS = {
  monster2: { hit1: CORE_MONSTER_ATTACKS.monster2.hit1 },
  monster3: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster3.hit1, effect: effect('Monster3Bullet1', 105, -60) },
    hit2: { ...CORE_MONSTER_ATTACKS.monster3.hit2, effect: effect('Monster3Bullet2', 155, -30) },
  },
  monster4: { hit1: CORE_MONSTER_ATTACKS.monster4.hit1 },
  monster5: { hit1: CORE_MONSTER_ATTACKS.monster5.hit1 },
  monster7: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster7.hit1, effect: effect('Monster7Bullet1', 80, -86) },
  },
  monster8: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster8.hit1, effect: effect('Monster8Bullet1', 97, -85) },
    hit2: { ...CORE_MONSTER_ATTACKS.monster8.hit2, effect: effect('Monster8Bullet2', 46, -30) },
  },
  monster30: {
    hit1: { ...CORE_MONSTER_ATTACKS.monster30.hit1, effect: effect('Monster30Bullet1', 0, 0) },
  },
} as const satisfies Record<string, Record<string, AttackSpec>>

export function monsterAttackSpecFor(species: string, action: string): AttackSpec | undefined {
  const attacks = MONSTER_ATTACKS as Record<string, Record<string, AttackSpec>>
  return attacks[species]?.[action]
}

export function resolveAttackSpec(
  spec: AttackSpec,
  anchor: { x: number; y: number },
  facing: -1 | 1,
): ResolvedAttackSpec {
  const hitbox = resolveAttackHitbox(spec, anchor, facing)
  const resolved: ResolvedAttackSpec = { hitbox }
  if (spec.effect) {
    resolved.effect = {
      action: spec.effect.action,
      ...resolveVisualAttachment({
        anchor,
        facing,
        offset: spec.effect.offset,
        pivotPx: spec.effect.pivotPx,
        scale: spec.effect.scale,
      }),
    }
  }
  return resolved
}

export { fallbackMonsterAttackSpec, horizontalAttackReach }
```

All timing and hitbox values come from `CORE_MONSTER_ATTACKS`; the client table adds only attachment metadata.

- [ ] **Step 6: Move Monster AI and adapt its attack timing reads**

Move `monsterSim.ts` and its test with `git mv`. Change its imports to package-relative paths, including `MONSTER_ATTACKS` from `../src/combat/monsterAttackSpecs` and geometry helpers from `../src/combat/attackSpec`. In the moved test, replace every `resolveAttackSpec(spec, anchor, facing).hitbox` call with `resolveAttackHitbox(spec, anchor, facing)`. Replace the old timing access with:

```ts
const fractions = cfg.attackSpec?.hitFrameFractions ?? [0.5]
```

Retain the current per-frame crossing algorithm and emitted `attackFrameIndex` values. Recreate `game/src/systems/monsterSim.ts`:

```ts
export * from '@zaixu/game-core/monsterSim'
```

Export the new modules from `packages/game-core/src/index.ts`.

- [ ] **Step 7: Keep visual assertions in the client test**

Retain in `game/tests/attackSpec.test.ts` only tests that inspect `effect` offsets or compare effect centers to hitbox centers. Import pure geometry helpers from `@zaixu/game-core/attackSpec` and render-aware specs from `../src/systems/attackSpec`.

- [ ] **Step 8: Extract and freeze the legacy slice before CombatSession exists**

Before capturing the accepted legacy trace, correct one verified floating-point integration defect against the source stop-count contract. Add to `time/tick.ts`:

```ts
export const TIME_EPSILON_MS = 1e-6

export function hasReachedDuration(elapsedMs: number, durationMs: number): boolean {
  return elapsedMs + TIME_EPSILON_MS >= durationMs
}
```

Use `hasReachedDuration` for combo/air-attack completion, MonsterSim attack-frame/action/hurt/dead completion, and HeroCombat hurt/respawn deadlines. Preserve the inclusive combo-chain boundary separately as `elapsedMs <= stageDurationMs + graceMs + TIME_EPSILON_MS`; do not negate `hasReachedDuration`, because an attack pressed exactly at the grace deadline is still legal. Add focused tests proving a 16-tick action ends on the 16th accumulated tick, a 15-tick Monster7 dead animation removes on its 15th tick, and a press exactly on the combo grace boundary still chains. Update only existing assertions that encoded the accidental extra tick. This is a `canonical` correction: the original stop-count data defines integer ticks; the hackathon port's repeated floating addition previously added an accidental extra tick. Run the full existing game suite before capture and record the correction in the parity report.

Create `game/src/adapters/legacyCombatSliceOracle.ts` before Task 5 introduces `CombatSession`. Extract the current `BattleScene` slice semantics into pure helpers used by both BattleScene and the oracle:

```ts
export function legacyHeroSwingIntent(input: {
  attacking: boolean
  comboStage: number
  attackId: number
  facing: -1 | 1
  center: { x: number; y: number }
  atk: number
  critChance: number
  random: () => number
}): {
  attackId: number
  action: NormalAttackHit
  rawPower: number
  hitbox: Rect
} | null

export function legacyMonsterAttackHitbox(
  spec: AttackSpec,
  center: { x: number; y: number },
  facing: -1 | 1,
): Rect
```

`BattleScene.resolveHeroHits` must call `legacyHeroSwingIntent` and keep its current target iteration, dedup, floating text, proc, and SFX behavior. `BattleScene.resolveMonsterAttackFrame` must call `legacyMonsterAttackHitbox` and keep its current visual effect and remote-hit behavior. The oracle composes those extracted helpers with current `advanceHero`, `advanceMonster`, `applyHeroDamage`, and `updateHeroCombat` in the same update order.

The early oracle uses a local serializable `LegacySliceDefinition` and xorshift32 source because formal game-core session contracts do not exist yet. Its local schema must already be structurally identical to the final Task 4 contracts: hero and monster definitions/snapshots carry `contentId`; `attack-started` carries `airborne`; and the checkpoint has `version`, `contentVersion`, a `domain` section containing tick, RNG state, complete definition and actor simulation state, plus a `protocol` section containing queued commands and last-seen sequences. Use the same field names, array ordering, infinity encoding, and namespaced content-ID strings that Task 4 later formalizes. Task 8 may replace local type aliases with game-core imports, but it may not add, remove, rename, or re-nest golden fields.

Export `runLegacyCombatSliceTrace(definition, commands, totalTicks)` so both the capture tool and later dual-run test execute the identical oracle path.

Create `game/tools/capture-legacy-combat-slice.ts`. It runs the canonical nine-command, 180-tick scenario later listed in Task 8 and writes `game/tests/fixtures/combat-core-slice-legacy-golden.json` containing:

- Baseline commit, `git hash-object game/src/scenes/BattleScene.ts`, and oracle source hash.
- Seed, complete final-shaped legacy definition, and ordered commands.
- Every tick's final-shaped domain/protocol checkpoint, render snapshot, ordered events including `airborne`, and deterministic RNG state.
- Final state hash.

Run the capture exactly once:

```bash
npm --prefix game exec -- vite-node tools/capture-legacy-combat-slice.ts
```

Create `game/tests/legacyCombatSliceGolden.test.ts` that reruns the oracle and deep-compares every final-shaped frame to the committed fixture. Capture metadata such as source hashes is verified as immutable fixture metadata, not recomputed after the later type-import-only edit. The fixture may be regenerated only when a reviewed parity decision classifies the change as canonical fidelity or an approved adaptation; it must never be rewritten merely to make new-core parity green.

- [ ] **Step 9: Run direct, legacy-golden, and compatibility verification**

Run:

```bash
npm run typecheck:core
npm --prefix packages/game-core test -- tests/attackSpec.test.ts tests/monsterSim.test.ts
npm --prefix game test -- tests/attackSpec.test.ts tests/gameCoreCompatibility.test.ts
npm --prefix game test -- tests/legacyCombatSliceGolden.test.ts
npm run build:game
if rg "from ['\\\"](phaser|react|@tauri|ws)|from ['\\\"].*visualAttachment" packages/game-core/src; then exit 1; fi
```

Expected: pure and client tests pass, the freshly captured 180-tick legacy trace reproduces byte-for-byte, the build passes, and the dependency scan prints no matches.

- [ ] **Step 10: Commit the attack boundary and immutable legacy evidence**

```bash
git add packages/game-core game/src/systems game/src/scenes/BattleScene.ts game/src/adapters game/tools game/tests
git commit -m "refactor: freeze legacy combat slice behavior"
```

### Task 4: Define Seeded Randomness And Serializable Session Contracts

**Files:**
- Create: `packages/game-core/src/random/seededRandom.ts`
- Create: `packages/game-core/src/session/types.ts`
- Create: `packages/game-core/src/session/definition.ts`
- Create: `packages/game-core/src/session/commands.ts`
- Create: `packages/game-core/src/session/events.ts`
- Create: `packages/game-core/src/session/snapshot.ts`
- Create: `packages/game-core/src/session/checkpoint.ts`
- Create: `packages/game-core/tests/seededRandom.test.ts`
- Create: `packages/game-core/tests/definition.test.ts`
- Create: `packages/game-core/tests/checkpoint.test.ts`
- Modify: `packages/game-core/src/combat/heroScale.ts`
- Modify: `packages/game-core/tests/heroScale.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/src/systems/skillDamageReal.ts`
- Modify: `packages/game-core/src/index.ts`

- [ ] **Step 1: Write failing deterministic-random tests**

Create `packages/game-core/tests/seededRandom.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SeededRandom } from '../src/random/seededRandom'

describe('SeededRandom', () => {
  it('matches the xorshift32 reference sequence', () => {
    const random = new SeededRandom(1)
    expect(random.nextUint32()).toBe(270369)
    expect(random.nextUint32()).toBe(67634689)
    expect(random.nextUint32()).toBe(2647435461)
  })

  it('continues exactly from a serialized state', () => {
    const first = new SeededRandom(0x12345678)
    first.next()
    const resumed = SeededRandom.fromState(first.getState())
    expect(resumed.nextUint32()).toBe(first.nextUint32())
  })

  it('maps a zero seed to a non-zero deterministic state', () => {
    expect(new SeededRandom(0).getState()).toBe(0x6d2b79f5)
  })
})
```

- [ ] **Step 2: Implement xorshift32 without `Math.random`**

Create `packages/game-core/src/random/seededRandom.ts`:

```ts
const ZERO_SEED_FALLBACK = 0x6d2b79f5

export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || ZERO_SEED_FALLBACK
  }

  static fromState(state: number): SeededRandom {
    return new SeededRandom(state)
  }

  getState(): number {
    return this.state >>> 0
  }

  nextUint32(): number {
    let value = this.state >>> 0
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state
  }

  next(): number {
    return this.nextUint32() / 0x100000000
  }
}
```

- [ ] **Step 3: Define the complete serializable session types**

Create `packages/game-core/src/session/types.ts`:

```ts
import type { ContentId, RuleProvenance } from '@zaixu/content'
import type { AttackSpec } from '../combat/attackSpec'
import type { MonsterStats } from '../monster/monsterSim'

export type ActorId = string
export type Facing = -1 | 1
export type ActorLifeState = 'ready' | 'hurt' | 'dead' | 'removed'

export interface Point {
  x: number
  y: number
}

export interface BoxSize {
  width: number
  height: number
}

export interface HeroCombatDefinition {
  id: ActorId
  contentId: ContentId
  spawn: Point
  collisionOffset: Point
  groundY: number
  minX: number
  maxX: number
  maxHp: number
  atk: number
  def: number
  magicDefenseFraction: number
  critChance: number
  comboStageDurationsMs: readonly number[]
  comboGraceMs: number
  normalAttacks: Readonly<Record<'hit1' | 'hit2' | 'hit3' | 'hit4' | 'hit5', AttackSpec>>
  hurtbox: BoxSize
  hurtDurationMs: number
  respawnDelayMs: number
}

export interface MonsterCombatDefinition {
  id: ActorId
  contentId: ContentId
  spawn: Point
  collisionOffset: Point
  stats: MonsterStats
  patrolMin: number
  patrolMax: number
  hurtDurationMs: number
  attackDurationMs: number
  deadDurationMs: number
  attackCooldownMs: number
  decisionIntervalMs: number
  attack: AttackSpec
  attackPower: number
  attackKind: 'physics' | 'magic'
  hurtbox: BoxSize
  targetOffsetX: number
  selfOffsetX: number
}

export interface CombatSessionDefinition {
  version: 1
  contentVersion: string
  tickRate: 30
  seed: number
  provenance: readonly RuleProvenance[]
  hero: HeroCombatDefinition
  monsters: readonly MonsterCombatDefinition[]
}

export interface CombatActorSnapshot {
  id: ActorId
  kind: 'hero' | 'monster'
  contentId: ContentId
  x: number
  y: number
  facing: Facing
  action: string
  hp: number
  maxHp: number
  lifeState: ActorLifeState
  comboStage: number | null
  statuses: readonly string[]
  knockbackVelocityX: number
  attackId: number
  attacking: boolean
}

export interface CombatSnapshot {
  version: 1
  contentVersion: string
  tick: number
  randomState: number
  actors: readonly CombatActorSnapshot[]
}
```

Create `packages/game-core/src/session/definition.ts` with Zod 4 strict schemas for points, boxes, attack specs, hero/monster definitions, provenance, and the full `CombatSessionDefinition`. Compose `ContentIdSchema` and `RuleProvenanceSchema` from `@zaixu/content`, use `z.number().finite()`/integer/range constraints for numeric fields, and use `superRefine` for cross-field references and uniqueness. Export both `CombatSessionDefinitionSchema` and `validateCombatSessionDefinition(input)`. Run an explicit plain-data/cycle guard before Zod parsing, then return a fresh, core-owned parsed clone:

- Require `version === 1`, `tickRate === 30`, a non-empty `contentVersion`, and an unsigned 32-bit integer seed.
- Require non-empty, unique actor instance IDs and valid namespaced `contentId` values through the shared `ContentIdSchema` for the hero and every monster.
- Require exactly five positive combo durations; finite spawn, offset, bounds, health, attack, defense, timing, patrol, knockback, box, and power values; positive box dimensions and max HP; and every probability/fraction in `[0, 1]`.
- Require each normal-attack record key to match its `AttackSpec.action`, the Monster7 attack action to be non-empty, and all hit-frame fractions to be finite values in `[0, 1]`.
- Require every provenance entry to have non-empty `ruleId` and `source` fields and one of the three declared origins.
- Reject unknown object keys, duplicate actor IDs, malformed content references, missing attack references, non-finite numbers, invalid ranges, functions, non-plain objects, and cyclic input. Once validation succeeds, clone the parsed definition through `cloneSerializable`; never retain caller-owned nested arrays or objects.

Create `packages/game-core/tests/definition.test.ts` with one fully valid fixture plus table-driven invalid cases for an unknown key, malformed content ID, duplicate actor ID, mismatched attack action, missing attack record, `NaN`, infinity, negative duration, inverted bounds, probability over one, function, and cycle. Assert useful Zod issue paths and that mutating the source definition after validation cannot change the returned clone.

- [ ] **Step 4: Define commands and rejection reasons**

Create `packages/game-core/src/session/commands.ts`:

```ts
import type { ActorId } from './types'

export type CombatCommandType =
  | 'press-left'
  | 'release-left'
  | 'press-right'
  | 'release-right'
  | 'press-jump'
  | 'press-attack'

export interface CombatCommand {
  actorId: ActorId
  sequence: number
  atTick: number
  type: CombatCommandType
}

export type CommandRejectionReason =
  | 'unknown-actor'
  | 'stale-sequence'
  | 'dead'
  | 'busy'
```

- [ ] **Step 5: Define the ordered domain event union**

Create `packages/game-core/src/session/events.ts`:

```ts
import type { CommandRejectionReason, CombatCommand } from './commands'
import type { ActorId } from './types'

interface EventBase {
  tick: number
}

export type CombatEvent =
  | (EventBase & { type: 'command-rejected'; command: CombatCommand; reason: CommandRejectionReason })
  | (EventBase & {
      type: 'attack-started'
      sourceId: ActorId
      attackId: number
      action: string
      airborne: boolean
    })
  | (EventBase & { type: 'hit-confirmed'; sourceId: ActorId; targetId: ActorId; attackId: number })
  | (EventBase & {
      type: 'damage-applied'
      sourceId: ActorId
      targetId: ActorId
      attackId: number
      rawPower: number
      defense: number
      amount: number
      remainingHp: number
    })
  | (EventBase & { type: 'actor-staggered'; actorId: ActorId; untilTick: number })
  | (EventBase & { type: 'actor-defeated'; actorId: ActorId; sourceId: ActorId })
  | (EventBase & { type: 'actor-removed'; actorId: ActorId })
  | (EventBase & { type: 'actor-respawned'; actorId: ActorId; x: number; y: number })
```

- [ ] **Step 6: Add snapshot construction as a pure copy**

Create `packages/game-core/src/session/snapshot.ts`:

```ts
import type { CombatActorSnapshot, CombatSnapshot } from './types'

export function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createCombatSnapshot(
  contentVersion: string,
  tick: number,
  randomState: number,
  actors: readonly CombatActorSnapshot[],
): CombatSnapshot {
  return cloneSerializable({
    version: 1,
    contentVersion,
    tick,
    randomState,
    actors: actors.map((actor) => ({ ...actor })),
  })
}
```

Export all new contracts from `packages/game-core/src/index.ts`.

Create `packages/game-core/src/session/checkpoint.ts`:

```ts
import { PROTOCOL_VERSION } from '@zaixu/protocol'
import type { CombatCommand } from './commands'

export type DeterministicValue =
  | null
  | boolean
  | number
  | string
  | readonly DeterministicValue[]
  | { readonly [key: string]: DeterministicValue }

export interface CombatDeterministicState {
  version: 1
  contentVersion: string
  domain: {
    tick: number
    randomState: number
    definition: DeterministicValue
    heroSimulation: DeterministicValue
    heroCombat: DeterministicValue
    monsters: readonly {
      id: string
      attackId: number
      simulation: DeterministicValue
    }[]
  }
  protocol: {
    protocolVersion: typeof PROTOCOL_VERSION
    queuedCommands: readonly CombatCommand[]
    lastSeenSequences: readonly { actorId: string; sequence: number }[]
  }
}

export function toDeterministicValue(value: unknown): DeterministicValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    if (value === Number.POSITIVE_INFINITY) return 'positive-infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'negative-infinity'
    return 'nan'
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toDeterministicValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, toDeterministicValue(entry)]),
    )
  }
  throw new TypeError('deterministic state contains a non-serializable value')
}
```

Add tests proving negative infinity in `MoveState.lastPressAtMs` becomes `negative-infinity`, positive infinity in a dead hero timer becomes `positive-infinity`, object keys are stable, functions are rejected, and `protocol.protocolVersion` equals `PROTOCOL_VERSION`. The checkpoint must embed the complete validated definition under `domain.definition`; changing content data while retaining the same `contentVersion` must still change the eventual replay hash.

- [ ] **Step 7: Remove implicit randomness from the core formula boundary**

In `packages/game-core/src/combat/heroScale.ts` add:

```ts
function requireRandom(random: (() => number) | undefined): () => number {
  if (!random) throw new Error('random source required')
  return random
}
```

`calculateHurt` always calls `requireRandom(opts.random)` exactly once, even when luck is zero. `calculateNormalAttackPower` calls the same injected source once more for the crit roll unless `forceCrit` is supplied. Thus every ordinary call consumes one hurt roll and one crit roll. Task 6 deliberately preserves BattleScene's less-obvious call cadence: it computes one candidate damage value on every authoritative tick while a swing is active, before overlap and per-target deduplication. That invisible behavior affects the shared RNG stream and later monster AI decisions, so changing it belongs in a separately versioned adaptation rather than this parity slice.

Add this test to `heroScale.test.ts`:

```ts
it('requires an explicit source and preserves two-roll landed-hit ordering', () => {
  expect(() => calculateHurt(100)).toThrow('random source required')
  expect(() => calculateNormalAttackPower('hit1', 100, { critChance: 0 }))
    .toThrow('random source required')
  let calls = 0
  expect(calculateNormalAttackPower('hit1', 100, {
    critChance: 0,
    random: () => {
      calls += 1
      return 0.5
    },
  })).toBe(100)
  expect(calls).toBe(2)
})
```

Update every moved `heroScale.test.ts` call that previously relied on implicit randomness to pass an explicit fixed source. Preserve all numeric expectations.

At client runtime boundaries, preserve current non-deterministic game behavior explicitly:

```ts
// BattleScene normal attack call
calculateNormalAttackPower(hitKey, atk, { critChance: crit, random: Math.random })

// skillDamageReal.ts, before calculateHurt and the crit roll
const random = opts.random ?? Math.random
const resolvedOptions = { ...opts, random }
const hurt = calculateHurt(atk, resolvedOptions)
```

- [ ] **Step 8: Verify deterministic and serialization boundaries**

Run:

```bash
npm run typecheck:core
npm --prefix packages/game-core test -- tests/seededRandom.test.ts tests/definition.test.ts tests/checkpoint.test.ts tests/heroScale.test.ts
if rg -n "Math\\.random" packages/game-core/src | rg -v '^[^:]+:[0-9]+:[[:space:]]*(//|\\*)'; then exit 1; fi
if rg "from ['\\\"](phaser|react|@tauri|ws)" packages/game-core/src; then exit 1; fi
if rg -n "\\b(document|window)\\." packages/game-core/src | rg -v '^[^:]+:[0-9]+:[[:space:]]*(//|\\*)'; then exit 1; fi
```

Expected: seeded-random, definition-validation, checkpoint, and hero-scale tests pass and the boundary scan has no runtime matches.

- [ ] **Step 9: Commit the session protocol**

```bash
git add packages/game-core game/src/scenes/BattleScene.ts game/src/systems/skillDamageReal.ts
git commit -m "feat: define deterministic combat session contracts"
```

### Task 5: Process Commands And Enforce Original Attack Cadence

**Files:**
- Create: `packages/game-core/src/session/combatSession.ts`
- Create: `packages/game-core/tests/combatSession.test.ts`
- Modify: `packages/game-core/src/index.ts`

- [ ] **Step 1: Write the failing whiff and attack-mash tests**

Create a `makeSessionDefinition()` fixture inside `packages/game-core/tests/combatSession.test.ts` with:

```ts
import { defineContentId } from '@zaixu/content'

function makeSessionDefinition(): CombatSessionDefinition {
  return {
  version: 1,
  contentVersion: 'combat-test@1',
  tickRate: 30,
  seed: 7,
  provenance: [
    { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'existing 30 Hz simulation' },
    { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
  ],
  hero: {
    id: 'hero-1',
    contentId: defineContentId('character.zaixu.wukong'),
    spawn: { x: 100, y: 400 },
    collisionOffset: { x: 0, y: 0 },
    groundY: 400,
    minX: 0,
    maxX: 1000,
    maxHp: 120,
    atk: 36,
    def: 2,
    magicDefenseFraction: 0,
    critChance: 0,
    comboStageDurationsMs: [300, 300, 300, 1600 / 3, 1600 / 3],
    comboGraceMs: 1500,
    normalAttacks: Object.fromEntries(
      ['hit1', 'hit2', 'hit3', 'hit4', 'hit5'].map((action) => [
        action,
        {
          action,
          hitFrameFractions: [0],
          hitbox: { forward: 85, y: 0, width: 130, height: 150 },
        },
      ]),
    ) as HeroCombatDefinition['normalAttacks'],
    hurtbox: { width: 90, height: 150 },
    hurtDurationMs: 260,
    respawnDelayMs: 1500,
  },
  monsters: [
    {
      id: 'monster-1',
      contentId: defineContentId('monster.chapter1.monster7'),
      spawn: { x: 800, y: 400 },
      collisionOffset: { x: 0, y: 0 },
      stats: {
        hp: 150,
        speed: 3,
        attackRange: 250,
        alertRange: 1000,
        normalAttackRate: 0,
        def: 4,
      },
      patrolMin: 700,
      patrolMax: 900,
      hurtDurationMs: 500,
      attackDurationMs: 1000 / 3,
      deadDurationMs: 500,
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      attack: {
        action: 'hit1',
        hitFrameFractions: [0.6],
        hitbox: { forward: 80, y: -86, width: 160, height: 150 },
      },
      attackPower: 14,
      attackKind: 'physics',
      hurtbox: { width: 90, height: 150 },
      targetOffsetX: 7.5,
      selfOffsetX: 4.5,
    },
  ],
  }
}

const definition = makeSessionDefinition()
```

Add these tests:

```ts
it('emits a swing for a whiff without fabricating a hit', () => {
  const session = new CombatSession(definition)
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })

  const events = session.step()

  expect(events).toContainEqual({
    type: 'attack-started',
    tick: 1,
    sourceId: 'hero-1',
    attackId: 1,
    action: 'hit1',
    airborne: false,
  })
  expect(events.some((event) => event.type === 'hit-confirmed')).toBe(false)
})

it('rejects key mashing while the current swing is active', () => {
  const session = new CombatSession(definition)
  for (let sequence = 1; sequence <= 6; sequence += 1) {
    session.enqueue({ actorId: 'hero-1', sequence, atTick: sequence, type: 'press-attack' })
  }

  const events = session.step(6)

  expect(events.filter((event) => event.type === 'attack-started')).toHaveLength(1)
  expect(
    events.filter(
      (event) => event.type === 'command-rejected' && event.reason === 'busy',
    ),
  ).toHaveLength(5)
  expect(session.getSnapshot().actors[0].attackId).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm --prefix packages/game-core test -- tests/combatSession.test.ts
```

Expected: FAIL because `CombatSession` is not defined.

- [ ] **Step 3: Implement the session shell and command queue**

Create `packages/game-core/src/session/combatSession.ts` with this public API:

```ts
export class CombatSession {
  constructor(definition: CombatSessionDefinition)
  enqueue(command: CombatCommand): void
  step(ticks?: number): CombatEvent[]
  getSnapshot(): CombatSnapshot
  getDeterministicState(): CombatDeterministicState
}
```

The constructor assigns `this.definition = validateCombatSessionDefinition(definition)` and never retains the caller's object graph. `enqueue` validates that `sequence` and `atTick` are non-negative integers, rejects commands scheduled before the next processable tick with a boundary error, and stores `{ ...command }` rather than the caller's object. The concrete implementation owns:

```ts
private readonly definition: CombatSessionDefinition
private readonly random: SeededRandom
private readonly queuedCommands: CombatCommand[] = []
private readonly lastSeenSequenceByActor = new Map<ActorId, number>()
private readonly heroState: HeroState
private readonly heroCombat: HeroCombatModel
private readonly monsterStates: Map<ActorId, MonsterState>
private currentTick = 0
```

`enqueue` inserts owned command copies by `atTick` and then `sequence`. `step(ticks = 1)` loops exactly that many fixed ticks and returns only events produced by those ticks.
`getSnapshot()` calls `createCombatSnapshot` with `definition.contentVersion` so hashes and bug bundles cannot silently cross content revisions.
`getDeterministicState()` returns a newly allocated checkpoint. Its `domain` section contains the complete validated definition, complete hero simulation/combat models, complete MonsterSim states, monster attack counters, tick, and RNG state. Its `protocol` section contains owned queued commands and sorted last-seen sequences. Normalize both sections through `toDeterministicValue`; never expose mutable maps, arrays, definitions, commands, or model references.

- [ ] **Step 4: Translate accepted commands to one-tick hero edges**

Use this exact mapping:

```ts
const edgeForCommand: Record<CombatCommandType, Partial<HeroEdges>> = {
  'press-left': { pressLeft: true },
  'release-left': { releaseLeft: true },
  'press-right': { pressRight: true },
  'release-right': { releaseRight: true },
  'press-jump': { pressJump: true },
  'press-attack': { pressAttack: true },
}
```

Validate and consume sequence numbers in this order:

```ts
if (command.actorId !== definition.hero.id) reason = 'unknown-actor'
else if (command.sequence <= lastSeenSequence) reason = 'stale-sequence'
else {
  lastSeenSequenceByActor.set(command.actorId, command.sequence)
  if (heroCombat.state === 'dead') reason = 'dead'
  else if (command.type === 'press-attack' && heroState.attacking) reason = 'busy'
}
```

A known actor's fresh sequence is consumed even when domain validation rejects it as `dead` or `busy`. This advances only protocol bookkeeping: compared with a control session that receives no rejected command, actor/domain simulation remains identical while `protocol.lastSeenSequences` advances. Retrying that same command later must be rejected as `stale-sequence`.

Merge all accepted commands for the current tick into one `HeroEdges` value, then call:

```ts
const previousAttackId = heroState.attackId
advanceHero(heroState, edges, TICK_MS, heroConfig)
if (heroState.attackId !== previousAttackId) {
  events.push({
    type: 'attack-started',
    tick: currentTick,
    sourceId: definition.hero.id,
    attackId: heroState.attackId,
    action: heroState.action,
    airborne: heroState.airAttack !== null,
  })
}
```

Construct `heroConfig` with:

```ts
makeHeroConfig({
  groundY: definition.hero.groundY,
  minX: definition.hero.minX,
  maxX: definition.hero.maxX,
  comboStageDurationsMs: [0, ...definition.hero.comboStageDurationsMs],
  comboGraceMs: definition.hero.comboGraceMs,
})
```

The definition stores five compact values in hit1-to-hit5 order; `combo.ts` requires index 0 to remain unused.

Do not emit a hit in this task. Task 6 adds collision and damage.

- [ ] **Step 5: Add sequence and combo-continuation tests**

Add tests proving:

```ts
it('rejects a repeated or older sequence', () => {
  const session = new CombatSession(definition)
  session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 1, type: 'press-right' })
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 2, type: 'release-right' })
  const events = session.step(2)
  expect(events).toContainEqual(expect.objectContaining({
    type: 'command-rejected',
    reason: 'stale-sequence',
  }))
})

it('consumes the sequence of a busy rejection', () => {
  const subject = new CombatSession(definition)
  const control = new CombatSession(definition)
  const first = { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' } as const
  subject.enqueue(first)
  control.enqueue(first)
  subject.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
  subject.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 10, type: 'press-attack' })
  const events = subject.step(10)
  control.step(10)
  expect(events).toContainEqual(expect.objectContaining({ reason: 'busy' }))
  expect(events).toContainEqual(expect.objectContaining({ reason: 'stale-sequence' }))
  expect(subject.getDeterministicState().domain)
    .toEqual(control.getDeterministicState().domain)
  expect(subject.getDeterministicState().protocol.lastSeenSequences)
    .not.toEqual(control.getDeterministicState().protocol.lastSeenSequences)
})

it('takes ownership of definitions and queued commands', () => {
  const source = makeSessionDefinition()
  const session = new CombatSession(source)
  source.hero.atk = 999
  source.monsters[0].spawn.x = 100

  const command: CombatCommand = {
    actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack',
  }
  session.enqueue(command)
  command.type = 'press-left'

  const events = session.step()
  expect(events).toContainEqual(expect.objectContaining({ type: 'attack-started' }))
  expect(session.getDeterministicState().domain.definition)
    .toEqual(expect.objectContaining({ hero: expect.objectContaining({ atk: 36 }) }))
})

it('marks a jump attack as airborne for faithful presentation', () => {
  const session = new CombatSession(definition)
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-jump' })
  session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
  const events = session.step(2)
  expect(events).toContainEqual(expect.objectContaining({
    type: 'attack-started',
    action: 'hit1',
    airborne: true,
  }))
})

it('accepts a fresh press after hit1 ends and advances to hit2', () => {
  const session = new CombatSession(definition)
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })
  session.step(10)
  session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 11, type: 'press-attack' })
  const events = session.step()
  expect(events).toContainEqual(expect.objectContaining({
    type: 'attack-started',
    attackId: 2,
    action: 'hit2',
  }))
})

it('requires five fresh presses and emits the full combo in order', () => {
  const session = new CombatSession(definition)
  const actions: string[] = []
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    const atTick = session.getSnapshot().tick + 1
    session.enqueue({ actorId: 'hero-1', sequence, atTick, type: 'press-attack' })
    const startEvents = session.step()
    const started = startEvents.find((event) => event.type === 'attack-started')
    if (started?.type === 'attack-started') actions.push(started.action)
    if (sequence < 5) {
      while (session.getSnapshot().actors[0].attacking) session.step()
    }
  }
  expect(actions).toEqual(['hit1', 'hit2', 'hit3', 'hit4', 'hit5'])
  const hit5StartTick = session.getSnapshot().tick
  let guard = 0
  while (session.getSnapshot().actors[0].attacking && guard < 30) {
    session.step()
    guard += 1
  }
  expect(guard).toBe(16)
  expect(session.getSnapshot().tick - hit5StartTick).toBe(16)
  expect(session.getSnapshot().actors[0].attacking).toBe(false)
})
```

- [ ] **Step 6: Run the cadence tests and package gates**

Run:

```bash
npm run typecheck:core
npm --prefix packages/game-core test -- tests/combatSession.test.ts
npm run test:core
```

Expected: focused tests pass and all moved core tests remain green.

- [ ] **Step 7: Commit command processing**

```bash
git add packages/game-core
git commit -m "feat: add fixed-tick combat command processing"
```

### Task 6: Resolve Two-Way Hits, Damage, Stagger, Death, Removal, And Respawn

**Files:**
- Modify: `packages/game-core/src/session/combatSession.ts`
- Modify: `packages/game-core/src/combat/heroCombat.ts`
- Modify: `packages/game-core/tests/combatSession.test.ts`
- Modify: `packages/game-core/tests/heroCombat.test.ts`

- [ ] **Step 1: Write failing hero-to-monster damage tests**

Import `SeededRandom` from `../src/random/seededRandom` and `cloneSerializable` from `../src/session/snapshot`, then add to `packages/game-core/tests/combatSession.test.ts`:

```ts
it('applies the original physics formula once per hero swing', () => {
  const closeDefinition = cloneSerializable(definition)
  closeDefinition.monsters[0].spawn.x = 220
  const session = new CombatSession(closeDefinition)
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
  session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })

  const events = session.step(2)

  expect(events).toContainEqual({
    type: 'damage-applied',
    tick: 2,
    sourceId: 'hero-1',
    targetId: 'monster-1',
    attackId: 1,
    rawPower: 36,
    defense: 4,
    amount: 32,
    remainingHp: 118,
  })
  expect(events.filter((event) => event.type === 'hit-confirmed')).toHaveLength(1)
  session.step(8)
  expect(session.getSnapshot().actors.find((actor) => actor.id === 'monster-1')?.hp).toBe(118)
})

it('whiffs without impact while preserving the legacy RNG cadence', () => {
  const session = new CombatSession(definition)
  const expectedRandom = new SeededRandom(definition.seed)
  expectedRandom.next()
  expectedRandom.next()
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' })
  const events = session.step()
  expect(events.some((event) => event.type === 'attack-started')).toBe(true)
  expect(events.some((event) => event.type === 'damage-applied')).toBe(false)
  expect(session.getSnapshot().randomState).toBe(expectedRandom.getState())
})
```

- [ ] **Step 2: Write failing monster-to-hero and lifecycle tests**

Add:

```ts
it('applies Monster7 power 14 against hero defense 2', () => {
  const closeDefinition = cloneSerializable(definition)
  closeDefinition.hero.spawn.x = 500
  closeDefinition.monsters[0].spawn.x = 540
  closeDefinition.monsters[0].stats.normalAttackRate = 1
  closeDefinition.monsters[0].decisionIntervalMs = 1000 / 30
  const session = new CombatSession(closeDefinition)

  const events = session.step(8)

  expect(events).toContainEqual(expect.objectContaining({
    type: 'damage-applied',
    sourceId: 'monster-1',
    targetId: 'hero-1',
    rawPower: 14,
    defense: 2,
    amount: 12,
    remainingHp: 108,
  }))
  expect(session.getSnapshot().actors[0].x).toBeLessThan(500)
})

it('defeats then removes a monster after its dead animation', () => {
  const lethalDefinition = cloneSerializable(definition)
  lethalDefinition.monsters[0].spawn.x = 220
  lethalDefinition.monsters[0].stats.hp = 32
  const session = new CombatSession(lethalDefinition)
  session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
  session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })

  expect(session.step(2)).toContainEqual(expect.objectContaining({
    type: 'actor-defeated',
    actorId: 'monster-1',
  }))
  let removed: CombatEvent | undefined
  while (!removed && session.getSnapshot().tick < 30) {
    removed = session.step().find((event) => event.type === 'actor-removed')
  }
  expect(removed).toEqual({
    type: 'actor-removed',
    tick: 16,
    actorId: 'monster-1',
  })
})

it('respawns a defeated hero at the configured spawn', () => {
  const lethalDefinition = cloneSerializable(definition)
  lethalDefinition.hero.spawn.x = 500
  lethalDefinition.monsters[0].spawn.x = 500
  lethalDefinition.monsters[0].stats.normalAttackRate = 1
  lethalDefinition.monsters[0].decisionIntervalMs = 1000 / 30
  lethalDefinition.monsters[0].attackPower = 500
  const session = new CombatSession(lethalDefinition)

  expect(session.step(8)).toContainEqual(expect.objectContaining({
    type: 'actor-defeated',
    actorId: 'hero-1',
  }))
  const respawnEvents = session.step(45)
  expect(respawnEvents).toContainEqual(expect.objectContaining({
    type: 'actor-respawned',
    actorId: 'hero-1',
    x: 500,
  }))
  expect(session.getSnapshot().actors[0].hp).toBe(120)
})
```

- [ ] **Step 3: Parameterize hero combat while preserving existing defaults**

Add to `heroCombat.ts`:

```ts
export interface HeroCombatConfig {
  maxHp: number
  hurtDurationMs: number
  respawnDelayMs: number
  knockbackPixelsPerSecond: number
  knockbackDecayPerSecond: number
  hitMeterThreshold: number
  hitMeterProtectionMs: number
}

export const DEFAULT_HERO_COMBAT_CONFIG: HeroCombatConfig = {
  ...HeroCombatTuning,
}
```

Change `createHeroCombat` to accept `config: HeroCombatConfig = DEFAULT_HERO_COMBAT_CONFIG` and seed `hp/maxHp` from it. Add an optional final config argument to `applyHeroDamage` and `updateHeroCombat`. Replace direct tuning reads inside those functions with the supplied config. Existing callers and moved tests must continue passing without changes.

Add one test that creates a 40 HP model with a 300 ms respawn delay and proves those values are honored.

- [ ] **Step 4: Use one explicit collision-center function**

Inside `CombatSession` add:

```ts
function actorCenter(
  position: { x: number; y: number },
  collisionOffset: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: position.x + collisionOffset.x,
    y: position.y + collisionOffset.y,
  }
}

function hurtboxAt(
  center: { x: number; y: number },
  size: { width: number; height: number },
): Rect {
  return centeredBox(center.x, center.y, size.width, size.height)
}
```

Hero and monster attack boxes must both resolve from this center. Snapshots retain the logical AS3 registration-point `x/y`; presentation computes each sprite center as `snapshot position + definition.collisionOffset`. Never assign raw snapshot coordinates directly to extracted sprites.

- [ ] **Step 5: Resolve hero hits before advancing monster reactions**

For each live monster in definition order:

1. Resolve the current hero attack spec from `heroState.action` only while `heroState.attacking`.
2. Before testing any box, calculate one candidate raw power with `calculateNormalAttackPower` and `random.next.bind(random)`. Do this once per active-swing tick, including whiffs and ticks after a target has already resolved the attack ID, exactly matching `BattleScene.resolveHeroHits`.
3. Build the hero attack box from the hero collision center.
4. Build the monster hurtbox from its collision center.
5. If boxes overlap and this monster has not resolved this hero `attackId`, pass the already-computed `{ attackId, damage: rawPower }` as `incomingHit` to `advanceMonster`.
6. Compare HP and mode before/after to emit `hit-confirmed`, `damage-applied`, `actor-staggered`, and immediate `actor-defeated`.
7. Translate MonsterSim's completed `death` event to `actor-removed`.

Use `applyPhysicsDefense(rawPower, monster.stats.def)` to populate the event's `amount`. The monster state remains the owner of actual HP mutation and deduplication.

- [ ] **Step 6: Resolve monster attack frames against the hero**

Keep an attack counter per monster. Translate `attack-start` to a new counter value and `attack-started` event with `airborne: false` even if the later frame misses.

On each `attack-frame`:

```ts
const attackBox = resolveAttackHitbox(monsterDefinition.attack, monsterCenter, monsterState.facing)
const heroBox = hurtboxAt(heroCenter, definition.hero.hurtbox)
if (overlaps(attackBox, heroBox)) {
  const amount = monsterDefinition.attackKind === 'physics'
    ? applyPhysicsDefense(monsterDefinition.attackPower, definition.hero.def)
    : applyMagicDefense(monsterDefinition.attackPower, definition.hero.magicDefenseFraction)
  const heroEvents = applyHeroDamage(
    heroCombat,
    {
      sourceId: monsterDefinition.id,
      attackId: monsterAttackId,
      damage: amount,
      knockbackX: monsterState.facing,
    },
    currentTick * TICK_MS,
    heroCombatConfig,
  )
}
```

Emit `hit-confirmed` and `damage-applied` only when `applyHeroDamage` actually lowers HP. Translate `hurt` to `actor-staggered` and `death` to `actor-defeated`.

Call `updateHeroCombat` once per tick. Translate its `respawn` event to `actor-respawned` and reset the hero simulation position to the configured spawn.

Snapshot construction copies each actor's stable `contentId` from the validated definition and maps the hero's `combo.stage`, combat state, meter-protection state, and `knockbackVelocityX` to `comboStage`, `statuses`, and `knockbackVelocityX`. Monster snapshots use `comboStage: null`, expose the current mode plus stagger armor in `statuses`, and use zero knockback until a sourced monster-displacement rule is introduced.

- [ ] **Step 7: Run focused combat and legacy hero tests**

Run:

```bash
npm run typecheck:core
npm --prefix packages/game-core test -- tests/combatSession.test.ts tests/heroCombat.test.ts
npm run test:core
```

Expected: all two-way combat and lifecycle tests pass; all previous core tests remain green.

- [ ] **Step 8: Commit the complete combat loop**

```bash
git add packages/game-core
git commit -m "feat: resolve deterministic two-way combat"
```

### Task 7: Add Stable Hashes, Recordings, Replays, And Legacy Parity

**Files:**
- Create: `packages/game-core/src/replay/stableHash.ts`
- Create: `packages/game-core/src/replay/combatReplay.ts`
- Create: `packages/game-core/tests/fixtures/makeSessionDefinition.ts`
- Create: `packages/game-core/tests/combatReplay.test.ts`
- Modify: `packages/game-core/src/index.ts`

- [ ] **Step 1: Write a failing replay-equality test**

Create `packages/game-core/tests/combatReplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createCombatRecording, replayCombat } from '../src/replay/combatReplay'
import { stableHash } from '../src/replay/stableHash'
import { CombatSession } from '../src/session/combatSession'
import { cloneSerializable } from '../src/session/snapshot'
import { makeSessionDefinition } from './fixtures/makeSessionDefinition'

describe('combat replay', () => {
  it('reaches the recorded final hash from the same seed and commands', () => {
    const definition = makeSessionDefinition({ monsterX: 220 })
    const commands = [
      { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' as const },
      { actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' as const },
      { actorId: 'hero-1', sequence: 3, atTick: 12, type: 'press-attack' as const },
    ]
    const recording = createCombatRecording(definition, commands, 60)
    const replay = replayCombat(recording)

    expect(replay.finalHash).toBe(recording.expectedFinalHash)
    expect(replay.events).toEqual(recording.events)
  })

  it('detects a changed seed', () => {
    const definition = makeSessionDefinition({ monsterX: 220 })
    const recording = createCombatRecording(definition, [], 60)
    const changed = {
      ...recording,
      definition: { ...recording.definition, seed: recording.definition.seed + 1 },
    }
    expect(replayCombat(changed).finalHash).not.toBe(recording.expectedFinalHash)
  })

  it('detects changed content even if contentVersion is reused incorrectly', () => {
    const definition = makeSessionDefinition()
    const recording = createCombatRecording(definition, [], 1)
    const changedDefinition = cloneSerializable(recording.definition)
    changedDefinition.hero.atk += 1
    const changed = { ...recording, definition: changedDefinition }
    expect(changed.definition.contentVersion).toBe(recording.definition.contentVersion)
    expect(replayCombat(changed).finalHash).not.toBe(recording.expectedFinalHash)
  })

  it('hashes authoritative queued state, not only the render snapshot', () => {
    const left = new CombatSession(makeSessionDefinition())
    const right = new CombatSession(makeSessionDefinition())
    right.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 20, type: 'press-attack' })
    expect(right.getSnapshot()).toEqual(left.getSnapshot())
    expect(stableHash(right.getDeterministicState()))
      .not.toBe(stableHash(left.getDeterministicState()))
  })
})
```

Move the shared definition from `combatSession.test.ts` to `packages/game-core/tests/fixtures/makeSessionDefinition.ts` and import it from both test files.

- [ ] **Step 2: Implement canonical JSON and FNV-1a hashing**

Create `packages/game-core/src/replay/stableHash.ts`:

```ts
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('value is not JSON-serializable')
    return encoded
  }
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const record = value as Record<string, unknown>
  return '{' + Object.keys(record)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + stableStringify(record[key]))
    .join(',') + '}'
}

export function stableHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
```

- [ ] **Step 3: Implement recording and replay**

Create `packages/game-core/src/replay/combatReplay.ts`:

```ts
import type { CombatCommand } from '../session/commands'
import { CombatSession } from '../session/combatSession'
import type { CombatEvent } from '../session/events'
import { cloneSerializable } from '../session/snapshot'
import type { CombatSessionDefinition } from '../session/types'
import { stableHash } from './stableHash'

export interface CombatRecording {
  version: 1
  definition: CombatSessionDefinition
  commands: readonly CombatCommand[]
  totalTicks: number
  events: readonly CombatEvent[]
  expectedFinalHash: string
}

export interface CombatReplayResult {
  events: readonly CombatEvent[]
  finalHash: string
}

export function createCombatRecording(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): CombatRecording {
  const session = new CombatSession(definition)
  commands.forEach((command) => session.enqueue(command))
  const events = session.step(totalTicks)
  return {
    version: 1,
    definition: cloneSerializable(definition),
    commands: commands.map((command) => ({ ...command })),
    totalTicks,
    events,
    expectedFinalHash: stableHash(session.getDeterministicState()),
  }
}

export function replayCombat(recording: CombatRecording): CombatReplayResult {
  const session = new CombatSession(recording.definition)
  recording.commands.forEach((command) => session.enqueue(command))
  const events = session.step(recording.totalTicks)
  return {
    events,
    finalHash: stableHash(session.getDeterministicState()),
  }
}
```

- [ ] **Step 4: Export replay APIs and run deterministic stress**

Export both replay modules from `index.ts`. Add a test that creates the same recording 100 times and asserts one unique final hash and one unique stable-stringified event list.

Run:

```bash
npm run typecheck:core
npm --prefix packages/game-core test -- tests/combatReplay.test.ts
npm run test:core
```

Expected: all replay and existing core tests pass.

- [ ] **Step 5: Commit replay support**

```bash
git add packages/game-core
git commit -m "feat: add deterministic combat recordings and replay"
```

### Task 8: Compile Real Game Data And Extract Presentation Adapters

**Files:**
- Create: `game/src/data/monsterAttackPower.ts`
- Create: `game/src/presentation/actorVisualMetrics.ts`
- Create: `game/src/presentation/role1AttackPresentation.ts`
- Create: `game/src/presentation/registerRoleAnimations.ts`
- Create: `game/src/adapters/combatCoreDefinition.ts`
- Create: `game/src/adapters/combatCoreInput.ts`
- Create: `game/src/adapters/combatCorePresentation.ts`
- Modify: `game/src/adapters/legacyCombatSliceOracle.ts`
- Create: `game/src/adapters/combatCoreParity.ts`
- Create: `game/tests/combatCoreDefinition.test.ts`
- Create: `game/tests/contentBuildGate.test.ts`
- Create: `game/tests/combatCoreInput.test.ts`
- Create: `game/tests/combatCorePresentation.test.ts`
- Create: `game/tests/combatCoreLegacyParity.test.ts`
- Create: `game/tests/combatCoreDualRun.test.ts`
- Modify: `game/package.json`
- Modify: `game/src/scenes/BattleScene.ts`

- [ ] **Step 1: Write failing real-data definition tests**

Create `game/tests/combatCoreDefinition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CombatSession } from '@zaixu/game-core'
import { buildCombatCoreSliceDefinition } from '../src/adapters/combatCoreDefinition'

describe('combat core slice definition', () => {
  it('compiles current Wukong and Monster7 truth into serializable data', () => {
    const definition = buildCombatCoreSliceDefinition()
    expect(definition).toMatchObject({
      version: 1,
      contentVersion: 'combat-core-slice@1',
      tickRate: 30,
      seed: 0x5a17,
      hero: {
        id: 'hero-1',
        contentId: 'character.zaixu.wukong',
        spawn: { x: 480, y: 400 },
        collisionOffset: { x: 7.5, y: -22.5 },
        atk: 36,
        def: 2,
        magicDefenseFraction: 0,
        comboGraceMs: 1500,
        hurtbox: { width: 90, height: 150 },
      },
      monsters: [{
        id: 'monster-1',
        contentId: 'monster.chapter1.monster7',
        spawn: { x: 900, y: 400 },
        collisionOffset: { x: 4.5, y: 3 },
        attackPower: 14,
        attackKind: 'physics',
        hurtbox: { width: 90, height: 105 },
      }],
    })
    expect(definition.hero.comboStageDurationsMs).toEqual([
      300,
      300,
      300,
      1600 / 3,
      1600 / 3,
    ])
    expect(definition.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'simulation.tick-rate', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'monster7.hit1-power', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'legacy.rng-consumption', origin: 'canonical' }),
      expect.objectContaining({ ruleId: 'combat.hitbox', origin: 'adapted' }),
      expect.objectContaining({ ruleId: 'showcase.profile', origin: 'invented' }),
    ]))
    expect(new CombatSession(definition).getSnapshot().actors.map((actor) => actor.contentId)).toEqual([
      'character.zaixu.wukong',
      'monster.chapter1.monster7',
    ])
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition)
  })
})
```

- [ ] **Step 2: Extract monster power and Wukong attack presentation without behavior changes**

Move the complete `MONSTER_HIT1_POWER` table from `BattleScene.ts` to `game/src/data/monsterAttackPower.ts` and export:

```ts
export interface MonsterAttackPower {
  power: number
  kind: AttackKind
}

export function monsterAttackPower(
  species: string,
  stats: MonsterStats,
): MonsterAttackPower {
  return MONSTER_HIT1_POWER[species] ?? {
    power: Math.min(60, 8 + stats.def * 1.5),
    kind: 'physics',
  }
}
```

Move `COMBO_STAGE_HIT`, `role1AttackEffectForSwing`, and `hitSfxKey` into `game/src/presentation/role1AttackPresentation.ts`. Export:

```ts
export const ROLE1_COMBO_ACTIONS = [null, 'hit1', 'hit2', 'hit3', 'hit4', 'hit5'] as const

export function role1SwingEffectAction(action: string): Role1EffectAction | null {
  if (action === 'hit2') return 'hit1'
  if (action === 'hit1' || action === 'hit3' || action === 'hit4' || action === 'hit5') return action
  return null
}

export function role1SwingSound(action: string): 'hit12' | 'hit34' | 'hit5' {
  if (action === 'hit1' || action === 'hit2') return 'hit12'
  if (action === 'hit3' || action === 'hit4') return 'hit34'
  return 'hit5'
}
```

Retain the existing `role1AttackEffectForSwing` export as a compatibility wrapper in the new presentation module, and re-export it from `BattleScene.ts` so `battleVisualRegression.test.ts` keeps its public seam. Replace BattleScene's private table, helper, and power method with imports. Run the existing attack-effect and monster-hit tests before continuing.

Move `HERO_IDLE_CONTENT`, `MONSTER_IDLE_CONTENT`, `visibleBottomOffset`, `computeVisibleTopY`, `monsterBaselineCorrectionY`, and a new symmetric `computeVisibleBottomY` into `game/src/presentation/actorVisualMetrics.ts`. BattleScene imports them and re-exports the existing public helpers so current visual tests retain their seam. `computeVisibleBottomY` uses the same state position, source offset, scale, cell height, measured alpha-content bottom, and optional baseline correction as the current bottom-alignment math. Add focused tests proving the real Role1 and Monster7 values both resolve to visible bottom `485.5` at logical ground `400` and scale `1.5`.

- [ ] **Step 3: Extract reusable Phaser animation registration**

Create `game/src/presentation/registerRoleAnimations.ts`:

```ts
import type Phaser from 'phaser'
import { TICK_MS } from '@zaixu/game-core/tick'
import { actionFrameTimings, type ActionSpec, type RoleData } from '../systems/roleData'

export function registerRoleAnimations(
  anims: Phaser.Animations.AnimationManager,
  data: RoleData,
  texture: string,
  loopingActions: ReadonlySet<string>,
  prefix: string,
): void {
  for (const [name, spec] of Object.entries(data.actions)) {
    const key = prefix + name
    if (anims.exists(key)) continue
    const frames = actionFrameTimings(data.sheet, spec as ActionSpec, TICK_MS).map((timing) => ({
      key: texture,
      frame: timing.index,
      duration: timing.durationMs,
    }))
    anims.create({ key, frames, repeat: loopingActions.has(name) ? -1 : 0 })
  }
}
```

Replace BattleScene's private method calls with this function and delete the private method.

- [ ] **Step 4: Build the real slice definition**

Create `game/src/adapters/combatCoreDefinition.ts`. Import `defineContentId` from `@zaixu/content`. Use `role1.json`, `monster7.json`, `actionDurationMs`, `LEVEL1_MONSTER_STATS.monster7`, `monsterAttackPower('monster7', stats)`, and the pure `MONSTER_ATTACKS.monster7.hit1` imported from `@zaixu/game-core/monsterAttackSpecs`. Do not import the render-aware table from `game/src/systems/attackSpec.ts`; visual `effect` metadata must never enter the serializable definition. Use these explicit slice constants:

```ts
const HERO_SCALE = 1.5
const HERO_CONTENT_ID = defineContentId('character.zaixu.wukong')
const MONSTER7_CONTENT_ID = defineContentId('monster.chapter1.monster7')
const GROUND_Y = 400
const HERO_START_X = 480
const MONSTER_START_X = 900
const MIN_X = 90
const MAX_X = 1460
const COMBO_GRACE_MS = 1500
const HERO_HURTBOX = { width: 90, height: 150 }
const MONSTER7_HURTBOX = { width: 90, height: 105 }
const HERO_NORMAL_ATTACK_BOX = {
  forward: 85,
  y: 0,
  width: 130,
  height: 150,
}
```

Expose:

```ts
export interface CombatCoreSliceOverrides {
  monsterX?: number
  monsterHp?: number
  monsterAttackRate?: number
}

export function buildCombatCoreSliceDefinition(
  overrides: CombatCoreSliceOverrides = {},
): CombatSessionDefinition
```

The function returns a fresh definition on every call, assigns `HERO_CONTENT_ID` and `MONSTER7_CONTENT_ID` to the corresponding definitions, and applies overrides only to the returned Monster7 spawn/stats. Compile `collisionOffset` as the exact render/collision-center offset used by BattleScene: Role1 is `roleData.offset * 1.5 = { x: 7.5, y: -22.5 }`; Monster7 is `monster7Data.offset * 1.5` plus `monsterBaselineCorrectionY('monster7')`, yielding `{ x: 4.5, y: 3 }`. Set every Wukong normal attack's `hitFrameFractions` to `[0]` to preserve the current BattleScene rule that a swing becomes live when it starts. This is an explicit `adapted` rule until source active-frame data is recovered. Pass the finished object through `validateCombatSessionDefinition` before returning so the adapter itself cannot emit an invalid reference graph.

Create `game/tests/contentBuildGate.test.ts`. One test constructs the unmodified production slice and passes it through `validateCombatSessionDefinition`; a second deep-clones the result, corrupts a content ID and one attack reference, and proves validation throws. Add these scripts to `game/package.json` at this task, after the real builder exists:

```json
{
  "scripts": {
    "validate:content": "vitest run tests/contentBuildGate.test.ts",
    "build": "npm run validate:content && tsc -b && vite build"
  }
}
```

This makes stable IDs and references a deterministic production-build gate: any malformed real slice makes `validate:content` and therefore `build` exit nonzero. Preserve all unrelated scripts.

Use `atk: 36` and `maxHp: 120` as fixed showcase-profile values for the engineering slice. Do not read save state in this adapter.

Set `contentVersion` to `combat-core-slice@1` and include these provenance entries:

```ts
[
  { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'game/src/systems/tick.ts' },
  { ruleId: 'role1.combo-duration', origin: 'canonical', source: 'game/src/data/roles/role1.json' },
  { ruleId: 'monster7.stats', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
  { ruleId: 'monster7.hit1-power', origin: 'canonical', source: 'game/src/data/monsterAttackPower.ts' },
  { ruleId: 'physics-defense', origin: 'canonical', source: 'packages/game-core/src/combat/heroScale.ts' },
  { ruleId: 'legacy.rng-consumption', origin: 'canonical', source: 'game/src/scenes/BattleScene.ts#resolveHeroHits' },
  { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
  { ruleId: 'role1.normal-active-frame', origin: 'adapted', source: 'current BattleScene swing-live rule' },
  { ruleId: 'showcase.profile', origin: 'invented', source: 'Combat Core Slice acceptance profile' },
]
```

- [ ] **Step 5: Build a Phaser-independent keyboard edge adapter**

Create `game/src/adapters/combatCoreInput.ts`:

```ts
import type { CombatCommand } from '@zaixu/game-core'

export interface CombatKeyState {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

export class CombatCoreInput {
  private previous: CombatKeyState = { left: false, right: false, jump: false, attack: false }
  private sequence = 0

  sample(actorId: string, tick: number, current: CombatKeyState): CombatCommand[] {
    const commands: CombatCommand[] = []
    const push = (type: CombatCommand['type']): void => {
      this.sequence += 1
      commands.push({ actorId, sequence: this.sequence, atTick: tick, type })
    }
    if (current.left && !this.previous.left) push('press-left')
    if (!current.left && this.previous.left) push('release-left')
    if (current.right && !this.previous.right) push('press-right')
    if (!current.right && this.previous.right) push('release-right')
    if (current.jump && !this.previous.jump) push('press-jump')
    if (current.attack && !this.previous.attack) push('press-attack')
    this.previous = { ...current }
    return commands
  }
}
```

Test rising edges, releases, simultaneous direction/attack input, and monotonic sequences.

- [ ] **Step 6: Define presentation cues before wiring Phaser**

Create `game/src/adapters/combatCorePresentation.ts` with:

```ts
import {
  PRESENTATION_CONTRACT_VERSION,
  type PresentationCue,
} from '@zaixu/presentation-contract'
import type { CombatEvent } from '@zaixu/game-core'

interface CombatPresentationPayloadMap {
  swing: { actorId: string; action: string; effect: string | null; sound: string | null }
  impact: { sourceId: string; targetId: string; hitStopMs: 50 }
  'damage-number': { actorId: string; amount: number }
  animation: { actorId: string; action: string }
  defeated: { actorId: string }
  removed: { actorId: string }
  respawn: { actorId: string }
}

export type CombatPresentationCue = {
  [K in keyof CombatPresentationPayloadMap]: PresentationCue<K, CombatPresentationPayloadMap[K]>
}[keyof CombatPresentationPayloadMap]

function cue<K extends keyof CombatPresentationPayloadMap>(
  tick: number,
  type: K,
  payload: CombatPresentationPayloadMap[K],
): PresentationCue<K, CombatPresentationPayloadMap[K]> {
  return { presentationVersion: PRESENTATION_CONTRACT_VERSION, tick, type, payload }
}

export function presentationCuesFor(event: CombatEvent): CombatPresentationCue[] {
  switch (event.type) {
    case 'attack-started': {
      const effectAction = event.sourceId === 'hero-1' && event.airborne ? 'hit3' : event.action
      return [cue(event.tick, 'swing', {
        actorId: event.sourceId,
        action: event.action,
        effect: event.sourceId === 'hero-1' ? role1SwingEffectAction(effectAction) : null,
        sound: event.sourceId === 'hero-1' ? role1SwingSound(event.action) : null,
      })]
    }
    case 'hit-confirmed':
      return [cue(event.tick, 'impact', {
        sourceId: event.sourceId,
        targetId: event.targetId,
        hitStopMs: 50,
      })]
    case 'damage-applied':
      return [cue(event.tick, 'damage-number', {
        actorId: event.targetId,
        amount: event.amount,
      })]
    case 'actor-staggered':
      return [cue(event.tick, 'animation', { actorId: event.actorId, action: 'hurt' })]
    case 'actor-defeated':
      return [cue(event.tick, 'defeated', { actorId: event.actorId })]
    case 'actor-removed':
      return [cue(event.tick, 'removed', { actorId: event.actorId })]
    case 'actor-respawned':
      return [cue(event.tick, 'respawn', { actorId: event.actorId })]
    case 'command-rejected':
      return []
  }
}
```

Test that every cue carries `PRESENTATION_CONTRACT_VERSION` and the source event tick; whiff `attack-started` yields swing audio/VFX; an airborne Wukong `attack-started` keeps domain/display action `hit1`, selects the original `hit3`/`Role1Bullet3` swing effect, and preserves BattleScene's stage-zero `hit12` sound; `hit-confirmed` yields an impact with `hitStopMs: 50`; damage yields a number; defeat yields a `defeated` cue rather than assuming every actor owns a `dead` animation; and rejected mash yields no presentation cue.

- [ ] **Step 7: Lock source-data parity**

Create `game/tests/combatCoreLegacyParity.test.ts`. Build the real definition, move Monster7 to `x = 600`, enqueue `press-right` for tick 1 and `press-attack` for tick 2, then assert:

```ts
const definition = buildCombatCoreSliceDefinition({ monsterX: 600 })
const session = new CombatSession(definition)
session.enqueue({ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' })
session.enqueue({ actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' })
const events = session.step(2)
const damage = events.find((event) => event.type === 'damage-applied')
expect(damage).toMatchObject({
  rawPower: calculateNormalAttackPower('hit1', 36, {
    critChance: 0,
    forceCrit: false,
    random: () => 0.5,
  }),
  defense: LEVEL1_MONSTER_STATS.monster7.def,
  amount: 32,
})
expect(definition.hero.comboStageDurationsMs[0]).toBe(
  actionDurationMs(roleData.actions.hit1, TICK_MS),
)
expect(definition.monsters[0].attackPower).toBe(14)
```

This test proves the compiled definition still derives from the same source modules used by BattleScene; it must not duplicate expected duration tables beyond the final numeric damage assertion.

- [ ] **Step 8: Adapt the frozen legacy oracle to formal session contracts**

Before editing the oracle, run `legacyCombatSliceGolden.test.ts` and confirm it passes. Modify `game/src/adapters/legacyCombatSliceOracle.ts` to accept `CombatSessionDefinition` and return `CombatEvent`, `CombatSnapshot`, and `CombatDeterministicState` without changing its algorithm. Map the frozen local hero/monster source keys to the formal `contentId` fields, emit `airborne` on `attack-started`, and include the validated definition in `domain.definition`; these are contract-shape adaptations only and may not alter tick order, RNG calls, damage, or actor behavior. It must not import `CombatSession`. It imports the compatibility modules under `game/src/systems` and retains the captured BattleScene slice order:

```text
order commands by atTick/sequence
  -> map accepted input to HeroEdges
  -> advanceHero exactly one TICK_MS
  -> detect a new attackId and emit attack-started
  -> resolve the live heroAttackBox against Monster7
  -> calculate current normal attack power and pass one incoming hit to advanceMonster
  -> translate monster hurt/death and attack-start/attack-frame events
  -> resolve Monster7 attack geometry against the hero hurtbox
  -> apply/update hero combat, knockback, death, and respawn
  -> create the same renderer-safe snapshot
```

Freeze these behaviors from the current `BattleScene.ts` and compatibility modules:

- Hero swing is live for the entire `heroState.attacking` interval and deduped by `attackId`.
- Hero hit resolution occurs before monster AI advancement.
- Monster attack frames use committed facing and `resolveAttackSpec` geometry.
- Physics damage is flat subtraction with floor 1.
- Hero combat update runs after incoming monster hits.
- Actor iteration follows definition order.

Expose:

```ts
export class LegacyCombatSliceOracle {
  constructor(definition: CombatSessionDefinition)
  enqueue(command: CombatCommand): void
  step(): CombatEvent[]
  getSnapshot(): CombatSnapshot
  getDeterministicState(): CombatDeterministicState
}
```

Add a source-boundary assertion to `combatCoreDualRun.test.ts`:

```ts
const legacySource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/adapters/legacyCombatSliceOracle.ts'),
  'utf8',
)
expect(legacySource).not.toMatch(/\bCombatSession\b/)
```

After the type adaptation, rerun `legacyCombatSliceGolden.test.ts`. Expected: the same committed 180-tick fixture still matches byte-for-byte.

- [ ] **Step 9: Compare legacy and new traces tick by tick**

Create `game/src/adapters/combatCoreParity.ts`:

```ts
export interface CombatParityDiff {
  tick: number
  field: string
  legacy: unknown
  modern: unknown
}

export interface CombatParityReport {
  legacyFinalHash: string
  modernFinalHash: string
  diffs: readonly CombatParityDiff[]
}

export function runCombatCoreParity(
  definition: CombatSessionDefinition,
  commands: readonly CombatCommand[],
  totalTicks: number,
): CombatParityReport
```

The function creates one `LegacyCombatSliceOracle` and one `CombatSession` from independent clones of the same definition, queues identical commands, then advances each one tick at a time. For every tick compare:

- Actor `x`, `y`, `facing`, `action`, `comboStage`, `hp`, `lifeState`, `statuses`, `knockbackVelocityX`, `attackId`, and `attacking`.
- Ordered events after removing no fields.
- Complete deterministic checkpoint paths, including vertical velocity/grounding, combo elapsed time, held/pending input, hurt/respawn timers, monster cooldown/decision/stagger timers, resolved-hit IDs, queued commands, last-seen sequences, RNG state, and attack counters.
- Full stable checkpoint hash. Render snapshot hashes may be logged for diagnostics but are not authoritative replay evidence.

Record a `CombatParityDiff` for every mismatch. Do not normalize away numeric differences.

Create `game/tests/combatCoreDualRun.test.ts` with this canonical scenario:

```ts
const definition = buildCombatCoreSliceDefinition({
  monsterX: 600,
  monsterHp: 500,
  monsterAttackRate: 1,
})
const commands: CombatCommand[] = [
  { actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-right' },
  { actorId: 'hero-1', sequence: 2, atTick: 2, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 3, atTick: 3, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 4, atTick: 12, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 5, atTick: 22, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 6, atTick: 32, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 7, atTick: 50, type: 'press-attack' },
  { actorId: 'hero-1', sequence: 8, atTick: 80, type: 'release-right' },
  { actorId: 'hero-1', sequence: 9, atTick: 100, type: 'press-jump' },
]

const report = runCombatCoreParity(definition, commands, 180)
expect(runLegacyCombatSliceTrace(definition, commands, 180).frames).toEqual(legacyGolden.frames)
expect(report.diffs, JSON.stringify(report.diffs, null, 2)).toEqual([])
expect(report.modernFinalHash).toBe(report.legacyFinalHash)
console.log(JSON.stringify({
  ticks: 180,
  legacyFinalHash: report.legacyFinalHash,
  modernFinalHash: report.modernFinalHash,
  diffCount: report.diffs.length,
}))
```

Add a comparator-unit test with deliberately different HP values and assert it reports `actors.monster-1.hp` at the correct tick. This proves the parity tool fails loudly rather than always returning green.

- [ ] **Step 10: Run extraction, adapters, dual-run parity, and full client tests**

Run:

```bash
npm --prefix game test -- \
  tests/contentBuildGate.test.ts \
  tests/combatCoreDefinition.test.ts \
  tests/combatCoreInput.test.ts \
  tests/combatCorePresentation.test.ts \
  tests/combatCoreLegacyParity.test.ts \
  tests/combatCoreDualRun.test.ts \
  tests/attackSpec.test.ts \
  tests/effects.test.ts \
  tests/monsterHit1Effects.test.ts
npm run test:game
npm run validate:content -w zmxy3-game
npm run build:game
```

Expected: focused tests pass, dual-run reports zero diffs for 180 ticks, the entire client suite passes, and production build passes.

- [ ] **Step 11: Commit real-data, presentation, and parity adapters**

```bash
git add game/src game/tests
git commit -m "refactor: compile combat core from real game data"
```

### Task 9: Ship The Opt-In Playable Phaser Proof

**Files:**
- Create: `game/src/buildInfo.ts`
- Create: `game/src/vite-env.d.ts`
- Create: `game/src/scenes/CombatCoreScene.ts`
- Create: `game/tests/combatCoreSceneWiring.test.ts`
- Modify: `game/src/main.ts`
- Modify: `game/vite.config.ts`

- [ ] **Step 1: Write the failing query-route wiring test**

Create `game/tests/combatCoreSceneWiring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GAME_VERSION } from '../src/buildInfo'

describe('combat core slice scene wiring', () => {
  it('boots the slice only behind the explicit query flag', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/main.ts'),
      'utf8',
    )
    expect(source).toContain("searchParams.get('combatCoreSlice') === '1'")
    expect(source).toContain('combatCoreSlice ? [CombatCoreScene] : defaultScenes')
  })

  it('keeps the normal scene list intact', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/main.ts'),
      'utf8',
    )
    for (const scene of [
      'MainMenuScene',
      'LoginScene',
      'LobbyScene',
      'SlotSelectScene',
      'CharacterSelectScene',
      'WorldMapScene',
      'SkillTreeScene',
      'BattleLoadingScene',
      'BattleScene',
    ]) {
      expect(source).toContain(scene)
    }
  })

  it('preserves the current Wukong death fallback', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/scenes/CombatCoreScene.ts'),
      'utf8',
    )
    expect(source).toContain("lifeState === 'dead'")
    expect(source).toContain("play('hurt')")
    expect(source).toContain('setAngle')
    expect(source).toContain('weapon')
  })

  it('injects the package version through the build boundary', () => {
    const packageJson = JSON.parse(fs.readFileSync(
      path.resolve(process.cwd(), 'package.json'),
      'utf8',
    )) as { version: string }
    expect(GAME_VERSION).toBe(packageJson.version)
  })
})
```

- [ ] **Step 2: Run the wiring test and verify it fails**

Run:

```bash
npm --prefix game test -- tests/combatCoreSceneWiring.test.ts
```

Expected: FAIL because the query route and scene do not exist.

- [ ] **Step 3: Implement the opt-in boot selection**

Modify `game/vite.config.ts` to read `game/package.json` with `node:fs` in the config process and define `__GAME_VERSION__` as its JSON-encoded `version`. Create `game/src/vite-env.d.ts` with `declare const __GAME_VERSION__: string`, and create `game/src/buildInfo.ts`:

```ts
export const GAME_VERSION = __GAME_VERSION__
```

Source under `rootDir: "src"` must never import `game/package.json` directly. The wiring test above proves the injected constant and package manifest stay equal in Vitest, and the production build exercises the same Vite definition.

In `game/src/main.ts` define:

```ts
const defaultScenes = [
  MainMenuScene,
  LoginScene,
  LobbyScene,
  SlotSelectScene,
  CharacterSelectScene,
  WorldMapScene,
  SkillTreeScene,
  BattleLoadingScene,
  BattleScene,
]

const searchParams = new URLSearchParams(window.location.search)
const combatCoreSlice = searchParams.get('combatCoreSlice') === '1'
```

Import `CombatCoreScene` and set the Phaser config field to:

```ts
scene: combatCoreSlice ? [CombatCoreScene] : defaultScenes,
```

Do not change the order or contents of `defaultScenes`.

- [ ] **Step 4: Preload only the proof's real assets**

Create `game/src/scenes/CombatCoreScene.ts` with scene key `combat-core-slice`. Its `preload()` loads:

```ts
this.load.spritesheet('role1_0', 'assets/extracted/role1_0.png', {
  frameWidth: roleData.sheet.cellW,
  frameHeight: roleData.sheet.cellH,
})
this.load.spritesheet('role1_equip0', 'assets/extracted/role1_equip0.png', {
  frameWidth: roleData.sheet.cellW,
  frameHeight: roleData.sheet.cellH,
})
this.load.spritesheet('monster7', 'assets/extracted/level1/Monster7.png', {
  frameWidth: monster7Data.sheet.cellW,
  frameHeight: monster7Data.sheet.cellH,
})
this.load.image('slice_bg', 'assets/extracted/level1/bg12.png')
this.load.image('slice_floor', 'assets/extracted/level1/online_floor12.png')
this.load.audio('hit12', 'assets/audio/Role1_hit1AndHit2.mp3')
this.load.audio('hit34', 'assets/audio/Role1_hit3AndHit4.mp3')
this.load.audio('hit5', 'assets/audio/Role1_hit5.mp3')
this.load.audio('monHurt', 'assets/audio/BeattackByRole1.mp3')
```

Also load every frame for `hit1`, `hit3`, `hit4`, and `hit5` from `ROLE1_EFFECTS` through `role1EffectFrameKey` and `role1EffectFrameUrl`. No generated placeholder art is permitted in this scene.

- [ ] **Step 5: Create the session, sprites, animations, HUD, and keyboard**

In `create()`:

- Build `definition = buildCombatCoreSliceDefinition()` and `session = new CombatSession(definition)`. The explicit `proofScenario=combo` query variant uses only `{ monsterX: 600, monsterAttackRate: 0 }` so browser automation can prove all five attacks and death without an intervening AI hit; the ordinary `combatCoreSlice=1` route keeps real Monster7 data.
- Register Wukong, default-weapon, and Monster7 animations through `registerRoleAnimations`. Weapon animation keys use `weapon_` and Monster7 keys use `monster7_`.
- Draw `slice_bg` full-screen and tile `slice_floor` at the logical `GROUND_Y`.
- Create Wukong and weapon sprites at the initial rendered center `hero.spawn + hero.collisionOffset = (487.5, 377.5)` with scale `1.5` and depths `10/11`.
- Create Monster7 at `monster.spawn + monster.collisionOffset = (904.5, 403)` with scale `1.5` and depth `8`.
- Create `RoleInfoHud` and `MonsterHpBar`. The role HUD uses level 1, HP from snapshot, zero MP/EXP, attack 36, and weapon name `普通的行者棍`.
- Bind `A`, `D`, `K`, and `J` to left, right, jump, and attack, matching BattleScene.
- Display only a compact tick and state-hash diagnostic in a corner; do not add a feature description or instructional copy.
- Maintain a bounded `structuredLog` of command sampling, domain events, presentation cues, scene errors, tick, content version, and state hash. Store structured data only; do not log secrets or unrestricted user text.
- Measure Phaser `PRE_STEP` to `POST_RENDER` CPU work with `performance.now()` and also retain consecutive `POST_RENDER` timestamp intervals so throttling and dropped frames remain visible. Keep the latest 600 steady-state samples for each series and expose count/P50/P95/max plus interval dropped-frame count/rate through the browser hook.
- When `visualBaseline` is one of `initial`, `hit3`, `impact`, or `dead`, do not advance the session and render a deterministic presentation fixture with every animation/timer paused: `initial` holds both actors on wait frame 0; `hit3` holds right-facing Wukong and weapon on the same mid-hit3 frame with the real hit3 effect at frame 0; `impact` holds Wukong/weapon on the sourced hit frame, Monster7 on hurt frame 0, the real effect, and damage number 32; `dead` holds Monster7 at HP 0 on dead frame 0 before removal. Build these fixtures from the real definition, extracted animation tables, versioned presentation cues, placement helpers, and real assets. They may arrange presentation state only and may never mutate or masquerade as authoritative session output. The normal `combatCoreSlice=1` proof still uses validated commands and live simulation.

- [ ] **Step 6: Advance exactly one core tick at a time**

Use a render accumulator:

```ts
update(_time: number, deltaMs: number): void {
  this.accumulatorMs += Math.min(deltaMs, TICK_MS * 8)
  while (this.accumulatorMs >= TICK_MS) {
    const nextTick = this.session.getSnapshot().tick + 1
    const commands = this.inputAdapter.sample('hero-1', nextTick, {
      left: this.keys.a.isDown,
      right: this.keys.d.isDown,
      jump: this.keys.k.isDown,
      attack: this.keys.j.isDown,
    })
    commands.forEach((command) => {
      this.commandLog.push(command)
      this.session.enqueue(command)
    })
    const events = this.session.step()
    this.eventLog.push(...events)
    this.presentEvents(events)
    this.accumulatorMs -= TICK_MS
  }
  this.renderSnapshot(this.session.getSnapshot())
}
```

`renderSnapshot` looks up each actor definition and sets sprite position to `{ x: actor.x + collisionOffset.x, y: actor.y + collisionOffset.y }`, then updates flip state, action animation, visibility, health bars, role HUD, and the displayed stable hash. The weapon uses the identical rendered hero center. It never writes to `CombatSession` and never places a sprite at raw snapshot `x/y`.

Rendering state priority is `removed > dead > hurt > snapshot.action`. A dead Monster7 plays `monster7_dead`. Wukong has no dead row in `role1.json`, so dead Wukong must continuously hold `hurt`, rotate 90 degrees toward the facing direction, tint gray, and keep the weapon frame/angle/alpha synchronized, matching BattleScene's current fallback. This priority is evaluated every render so the normal snapshot action cannot overwrite hurt or death presentation.

While an actor is in the local `visualHitStopActors` set, `renderSnapshot` still updates position and HUD data but does not change or resume that actor's animation. Removing the actor from the set after 50 ms immediately applies the latest snapshot action.

- [ ] **Step 7: Render swing and impact as separate cues**

For hero `swing` cues:

- Play the correct `hit12`, `hit34`, or `hit5` sound immediately.
- Place the extracted Role1 effect with `resolveRole1EffectPlacement` using the hero collision center and facing; apply the returned origin and flip values exactly.
- Start the hero and weapon action animations even when no target overlaps.

For `impact` and `damage-number` cues:

- Play `monHurt` only on confirmed hero hits.
- Pause only the involved Phaser actor/weapon/VFX animations for the cue's 50 ms visual hit stop, then resume them with a scene timer. The 30 Hz `CombatSession` accumulator continues unchanged; presentation failure or a delayed timer may not alter authoritative ticks, commands, damage, or replay hashes.
- Apply a 70 ms, 0.0022 camera shake.
- Flash the target for 100 ms.
- Show the actual event amount above the target.

For Monster7 attack cues, play `monster7_hit1` without inventing an unavailable sound asset. For hurt/dead/remove/respawn cues, play the named animation or toggle visibility.

Scene presentation switches on `cue.type` and reads cue data from `cue.payload`; it never strips or rewrites `presentationVersion` or `tick` in the observation log.

- [ ] **Step 8: Add an observation-only browser hook**

Import `PROTOCOL_VERSION` from `@zaixu/protocol`, `SAVE_SCHEMA_VERSION` from `@zaixu/save-schema`, `PRESENTATION_CONTRACT_VERSION` from `@zaixu/presentation-contract`, and `GAME_VERSION` from `game/src/buildInfo.ts`. Declare and install:

```ts
window.__combatCoreSlice = {
  getSnapshot: () => structuredClone(this.session.getSnapshot()),
  getEvents: () => structuredClone(this.eventLog),
  getCommands: () => structuredClone(this.commandLog),
  getPresentationCues: () => structuredClone(this.presentationLog),
  getViewState: () => structuredClone({
    heroAnimation: this.hero.anims.currentAnim?.key ?? null,
    heroFrame: this.hero.frame.name,
    heroVisible: this.hero.visible,
    heroPosition: { x: this.hero.x, y: this.hero.y },
    heroVisibleBottomY: this.heroVisibleBottomY(),
    weaponVisible: this.weapon.visible,
    weaponFrame: this.weapon.frame.name,
    monsterAnimation: this.monster.anims.currentAnim?.key ?? null,
    monsterVisible: this.monster.visible,
    monsterPosition: { x: this.monster.x, y: this.monster.y },
    monsterVisibleBottomY: this.monsterVisibleBottomY(),
  }),
  getPerformance: () => structuredClone(summarizePerformance(
    this.renderWorkSamples,
    this.renderIntervalSamples,
  )),
  captureBugBundle: async () => {
    const screenshot = await captureRendererSnapshot(this.game.renderer)
    return structuredClone({
      schemaVersion: 1,
      gameVersion: GAME_VERSION,
      contentVersion: this.definition.contentVersion,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      presentationVersion: PRESENTATION_CONTRACT_VERSION,
      randomSeed: this.definition.seed,
      recentCommands: this.commandLog.slice(-120),
      domainEvents: this.eventLog.slice(-240),
      safeStateSnapshot: {
        render: this.session.getSnapshot(),
        deterministic: this.session.getDeterministicState(),
        stateHash: stableHash(this.session.getDeterministicState()),
      },
      structuredLogs: this.structuredLog.slice(-240),
      screenshot,
    })
  },
  getDeterminismProof: () => {
    const recording = createCombatRecording(
      this.definition,
      this.commandLog,
      this.session.getSnapshot().tick,
    )
    return {
      liveHash: stableHash(this.session.getDeterministicState()),
      replayHash: recording.expectedFinalHash,
    }
  },
  reset: () => this.scene.restart(),
}
```

Delete the hook on scene shutdown. The hook may observe state and restart the scene; it must not accept arbitrary state mutation.
`captureRendererSnapshot` wraps Phaser renderer `snapshot(callback, 'image/png')` in a Promise and resolves the callback image's data URL after the next completed render; it must work under WebGL without relying on `preserveDrawingBuffer` or synchronous canvas reads. `heroVisibleBottomY()` and `monsterVisibleBottomY()` call the extracted `computeVisibleBottomY` with the latest snapshot, source offsets, scale, measured alpha-content bounds, and Monster7 baseline correction; they are not whole-cell `getBounds()` approximations. Every getter and capture action returns a deep clone. `captureBugBundle` is one asynchronous action that exports the complete safe state and an embedded screenshot without exposing internal arrays or definitions; it contains no account, token, chat, or save data.

- [ ] **Step 9: Run scene wiring, client tests, and production build**

Run:

```bash
npm --prefix game test -- tests/combatCoreSceneWiring.test.ts
npm --prefix game test
npm --prefix game run build
```

Expected: wiring and full client tests pass; Vite production build passes with only the existing bundle-size warning.

- [ ] **Step 10: Commit the playable proof**

```bash
git add game/src game/tests
git commit -m "feat: add playable combat core slice"
```

### Task 10: Prove Performance And Real-Browser Behavior, Then Close The Slice

**Files:**
- Create: `packages/game-core/tools/bench-combat-slice.bench.ts`
- Create: `game/tools/combat-core-source-digest.mjs`
- Create: `game/tools/collect-windows-performance-evidence.mjs`
- Create: `game/tools/verify-combat-core-slice.mjs`
- Create: `game/tools/verify-windows-performance-evidence.mjs`
- Create: `game/tests/baselines/combat-core-slice-initial.png`
- Create: `game/tests/baselines/combat-core-slice-hit3.png`
- Create: `game/tests/baselines/combat-core-slice-impact.png`
- Create: `game/tests/baselines/combat-core-slice-dead.png`
- Create: `game/tests/baselines/combat-core-slice-video-timeline.json`
- Create: `docs/playbooks/combat-core-slice.md`
- Create: `docs/reports/evidence/combat-core-slice-windows-performance.json`
- Create: `docs/reports/combat-core-slice-parity.md`
- Create: `docs/reports/combat-core-slice-performance.md`
- Modify: `package.json`
- Modify only if verification exposes a defect: files owned by Tasks 1-9

- [ ] **Step 1: Add the 51-actor performance contract**

Create `packages/game-core/tools/bench-combat-slice.bench.ts`. Import `performance` from `node:perf_hooks` and `makeSessionDefinition` from the core test fixture, clone its Monster7 definition 50 times with stable actor IDs, the same stable Monster7 content ID, and spaced spawn points, run 120 unmeasured warm-up ticks, then measure 600 individual ticks with `performance.now()` and assert:

```ts
expect(snapshot.actors).toHaveLength(51)
expect(snapshot.tick).toBe(720)
expect(p95Ms).toBeLessThanOrEqual(5)
expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
expect(JSON.parse(JSON.stringify(session.getDeterministicState())))
  .toEqual(session.getDeterministicState())
```

Print exactly one summary line:

```ts
console.log(JSON.stringify({
  actors: snapshot.actors.length,
  warmupTicks: 120,
  measuredTicks: 600,
  p50Ms,
  p95Ms,
  maxMs,
}))
```

- [ ] **Step 2: Run the benchmark three times**

Run:

```bash
for run in 1 2 3; do npm --prefix packages/game-core run bench; done
```

Expected: each run reports 51 actors, 120 warm-up ticks, 600 measured ticks, and `p95Ms <= 5`.

- [ ] **Step 3: Implement the Playwright proof runner**

Create `game/tools/verify-combat-core-slice.mjs`. The script must:

1. Remove and recreate `tmp/combat-core-slice`.
2. Reserve an available loopback port with `node:net`, close the reservation, then spawn `npm run preview -- --host 127.0.0.1 --port <port> --strictPort` with `cwd` set to `game`.
3. Poll the resulting loopback origin until it returns HTTP 200.
4. Launch Playwright Chromium and a 960 by 540 video context. Record console errors and uncaught page errors for every proof page.
5. Open `?combatCoreSlice=1`, wait for `window.__combatCoreSlice`, and save `initial.png`. Assert the initial sprite centers are `(487.5, 377.5)` and `(904.5, 403)`, not the raw snapshot positions, and assert `Math.abs(heroVisibleBottomY - monsterVisibleBottomY) <= 0.5`.
6. Define `pressSampled(key)`: read the command count, call `keyboard.down(key)`, and poll until `getCommands().length === before + 1`; a bounded Playwright timeout must throw rather than being treated as success. Call `keyboard.up(key)`, record the current snapshot tick, and poll until at least two additional core ticks have executed. For `A`/`D`, also require the matching release command to appear before returning. Do not use wall-clock sleeps, `keyboard.press`, or `keyboard.tap` as evidence that an edge was sampled.
7. Use `pressSampled('J')` while actors are separated. Assert `attack-started` exists, `hit-confirmed` does not, and swing sound/effect cues exist.
8. Await `captureBugBundle()` once, save `whiff-bug-bundle.json`, and decode its renderer-snapshot data URL to `whiff-bug-bundle.png`. With `pngjs`, require exactly 960 by 540 pixels, at least 80% of pixels with alpha at or above 16, at least 5% of pixels whose RGB Manhattan distance from the top-left pixel exceeds 24, and at least 64 distinct sampled RGBA values. These thresholds make blank, transparent, or single-color WebGL readback fail. Validate every required version, seed, command, event, safe state, structured log, hash, and screenshot field.
9. Use `pressSampled('J')` once more while hit1 is active. Assert the attack ID remains unchanged and one `busy` rejection exists. The direct headless test remains the deterministic five-command pressure test; the browser proof avoids racing several edge/release cycles against a 300 ms swing.
10. Wait until `attacking` is false and the prior ground combo memory has expired to `comboStage: null`, use `pressSampled('K')`, assert Wukong leaves `y = 400`, then use `pressSampled('J')` while he is airborne. Assert the domain event has `airborne: true`, its swing cue keeps action `hit1`, uses the `hit3` effect and `hit12` sound, and then wait until Wukong lands at `400`.
11. Hold `D` until Monster7 is in attack reach, release `D`, and poll until a new `release-right` command appears and at least one additional core tick executes.
12. Capture hero HP/x, wait at most 10 seconds for Monster7's real AI attack, and assert HP decreases by 12 and x moves away from the monster. Save `monster-attack-events.json`.
13. Wait for at least 300 measured render intervals. Assert the 960 by 540 functional context has finite work/interval samples and `getPerformance().work.p95Ms <= 16.7`, then save `functional-performance.json`. Record interval P95 and dropped frames for diagnostics, but treat this as a local regression guard rather than the Windows reference claim.
14. Assert the normal scenario's live deterministic hash equals its replay hash.
15. Navigate the same recorded page to `?combatCoreSlice=1&proofScenario=combo`. Wait for a fresh hook.
16. Call `pressSampled('D')` once and assert the hero now faces right before the combo begins; the initial core facing is left, so this sampled edge is mandatory rather than an implicit test assumption.
17. For each expected action `hit1` through `hit5`: wait until the previous swing is inactive, use `pressSampled('J')`, wait for the new `attack-started` and `damage-applied`, assert action order and damage 32, assert `weaponVisible === true` and `weaponFrame === heroFrame`, and assert a swing sound/effect plus impact `hitStopMs: 50` cue.
18. After hit5, assert Monster7 emits `actor-defeated`, renders `monster7_dead`, then emits `actor-removed` and `getViewState().monsterVisible === false` after the dead animation. Save `combo-events.json` and `combo-final.png`.
19. Assert the combo scenario's live deterministic hash equals its replay hash. Save final snapshot, commands, events, presentation cues, and view state.
20. Close the recorded page, await `page.video().path()`, close the video context, and rename its video to `proof.webm`; require a non-empty file of at least 100 KiB. Normalize the two recorded scenarios into a codec-independent timeline containing scenario boundaries and ordered command/event/cue milestones for whiff, busy rejection, airborne swing, Monster7 hit, hit1-hit5 damage, defeat, dead, and removal, with volatile wall times and absolute ticks removed. Write `video-timeline-candidate.json`; candidate-only mode never reads a baseline, update mode atomically replaces `game/tests/baselines/combat-core-slice-video-timeline.json`, and normal mode requires exact timeline equality. The WebM remains human-viewable evidence while this semantic timeline provides a stable automated video-flow regression independent of codec byte nondeterminism.
21. In a no-video 960 by 540 context, visit `?combatCoreSlice=1&visualBaseline=<mode>` for `initial`, `hit3`, `impact`, and `dead`, capturing `visual-candidate-<mode>.png`. Branch explicitly: `COMBAT_CORE_VISUAL_CANDIDATE_ONLY=1` writes all four candidates and skips every baseline read/comparison; `UPDATE_COMBAT_CORE_BASELINE=1` requires all four non-empty reviewed candidates and replaces all four `game/tests/baselines/combat-core-slice-<mode>.png` files through temporary files only after every capture validates; normal mode requires every committed baseline, decodes candidates/baselines with `pngjs`, compares each with `pixelmatch` at threshold 0.2, writes `visual-diff-<mode>.png`, and requires each changed-pixel ratio <= 0.02. The three modes are mutually exclusive, and normal verification never rewrites a baseline.
22. In the same no-video context, open the origin with no query string, wait for the existing main-menu canvas, assert `window.__combatCoreSlice` is undefined, assert the canvas is non-blank, and save `default-route.png`.
23. Create a separate no-video performance context at exactly 1920 by 1080 with `deviceScaleFactor: 1`, open `?combatCoreSlice=1`, wait for 600 steady-state render intervals, and save both CPU-work and frame-interval distributions to `performance.json`. Save `performance-environment.json` containing `process.platform`, architecture, Node version, Chromium version, user agent, viewport, device scale factor, hardware concurrency, WebGL vendor/renderer when exposed, canvas backing `width/height`, and canvas CSS client bounds.
24. With `--windows-reference --perf-only`, require `process.platform === 'win32'`, the exact 1920 by 1080/DPR 1 display environment, the current 960 by 540 Phaser backing canvas, and a 1920 by 1080 fitted client box. Assert both `work.p95Ms <= 16.7` and consecutive-render `interval.p95Ms <= 16.7`, and require intervals above 25 ms to remain at or below 1% of the measured sample. The interval gate prevents a throttled 30 fps page with cheap CPU work from passing. The architecture contract currently names a 1920 by 1080 reference display, not a true 1080p backing buffer; report both sizes and do not mislabel this measurement. Without the flag, record the same result as provisional local telemetry and print that the Windows reference gate was not run; never represent a macOS/headless result as the Windows acceptance result.
25. Assert no captured console or page errors, close every context/browser, and terminate the preview child in a `finally` block.

Use Node's `assert/strict` for every acceptance condition. Print:

```text
combat-core-slice: PASS
default-route: isolated
visual-regression: within threshold
render-work-p95-functional: <= 16.7ms
render-interval-p95-windows: <= 16.7ms when reference gate runs
windows-reference: PASS or NOT-RUN (local telemetry only)
whiff: attack-started without hit-confirmed
mash: busy commands rejected
movement: jump and landing verified
monster-damage: 12
combo: hit1-hit5, 32 damage each
death: defeated-dead-removed
replay: normal and combo hashes equal
bug-bundle: complete
artifacts: tmp/combat-core-slice
```

Create `game/tools/combat-core-source-digest.mjs` to enumerate every tracked combat-slice input under root manifests/lockfiles/tsconfigs, `packages/**`, `game/src/**`, `game/tools/**`, `game/tests/**`, and `game/vite.config.ts`, excluding generated reports/evidence and `tmp`. Sort normalized repository-relative paths, compute each current working file's clean-filtered blob ID with `git hash-object --path=<path> <path>`, then SHA-256 the ordered `path + NUL + blobId` records. This sees uncommitted changes but normalizes checkout-only CRLF/LF differences exactly as Git would on commit, so evidence collected on Windows verifies on macOS/Linux without weakening source binding.

Create `game/tools/collect-windows-performance-evidence.mjs`. It refuses non-Windows hosts, requires a clean source worktree before its output file is written, runs the core benchmark three times and parses each JSON summary, invokes the browser verifier in `--windows-reference --perf-only` mode with JSON output, computes the source digest, and atomically writes `docs/reports/evidence/combat-core-slice-windows-performance.json` with schema version, source digest, tested Git commit, all three simulation runs, browser work/interval distributions, dropped-frame rate, environment, and PASS status.

Create `game/tools/verify-windows-performance-evidence.mjs`. It is cross-platform and fails unless the committed evidence exists, its source digest equals the current relevant working-tree digest, all three simulation samples have 51 actors/600 measured ticks and P95 at or below 5 ms, the environment is Windows/Chromium/1920 by 1080/DPR 1 with the expected backing/client sizes, browser work and interval samples are at least 600 with P95 at or below 16.7 ms, dropped intervals are at or below 1%, and status is PASS. Add root scripts `collect:windows-performance` and `verify:windows-performance-evidence` for these tools. This digest binding makes any later code-review fix invalidate stale Windows evidence and force a rerun; the informational Git commit is not used as a self-referential final-commit requirement.

- [ ] **Step 4: Build and run the real-browser proof**

Run:

```bash
npm --prefix game run build
npm --prefix game exec -- playwright install chromium
COMBAT_CORE_VISUAL_CANDIDATE_ONLY=1 npm --prefix game run verify:combat-core
```

Expected: all non-baseline functional acceptance checks pass, all four `visual-candidate-*.png` files and the remaining PNG/JSON/WebM/bug-bundle artifacts are non-empty, local 1920 by 1080 performance telemetry records its environment, and there are no browser console errors. Candidate-only mode succeeds even when no committed baseline exists and never tries to open one. On a non-Windows host the script must explicitly report `windows-reference: NOT-RUN`; that is not a completed performance claim.

- [ ] **Step 5: Visually inspect the proof artifacts**

Open all four `tmp/combat-core-slice/visual-candidate-*.png` files, `initial.png`, and `combo-final.png`. Confirm:

- Canvas is non-blank and framed at 960 by 540.
- Wukong carries the default staff.
- Wukong and Monster7 share the same floor line.
- The extracted background and floor render without gaps.
- HUD text does not overlap the canvas or actor art.
- The final screenshot visibly shows changed HP and a readable damage number or impact state.
- The hit3 fixture shows synchronized hero/weapon frames and the real Wukong effect; the impact fixture shows hurt feedback and damage 32; the dead fixture shows the sourced Monster7 dead pose before removal.

Open `tmp/combat-core-slice/proof.webm` and confirm the whiff still animates before the hit sequence. Confirm its audio cue through `presentation-cues.json` because Playwright's video recorder does not capture page audio.

Only after the candidate passes visual inspection, create the committed baseline and immediately prove normal comparison mode:

```bash
UPDATE_COMBAT_CORE_BASELINE=1 npm --prefix game run verify:combat-core
npm --prefix game run verify:combat-core
```

Expected: the first command writes all four PNG baselines and the normalized video timeline baseline; the second leaves every baseline unchanged, reports `visual-regression: within threshold`, and reports exact video-timeline equality.

- [ ] **Step 6: Request code review and address findings before performance capture**

Use `superpowers:requesting-code-review`. The reviewer must inspect:

- Renderer independence and absence of hidden browser globals.
- Zod content schema completeness and production-build validation.
- Command ordering, ingress ownership, and rejection semantics.
- Hit deduplication, RNG cadence, damage parity, and event ordering.
- Replay equality, checkpoint completeness, and golden/dual-run evidence.
- Presentation offsets, dynamic visual fixtures, default-route isolation, and browser assertions versus visible artifacts.
- Performance sampling methodology, Windows evidence collection, and source-digest binding.

Fix every correctness finding, rerun the affected focused test first, then rerun Steps 2, 4, and 5 as applicable. No source fix may land after the Windows capture without invalidating and regenerating its evidence.

- [ ] **Step 7: Commit the reviewed implementation checkpoint**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.package.json packages/game-core game docs/superpowers/plans/2026-07-13-combat-core-slice-implementation.md
git commit -m "test: add combat core verification gates"
git status --short
```

Expected: implementation, verification tools, and reviewed baselines are committed; generated `tmp` artifacts remain ignored; status is clean. This commit is the clean source state measured on Windows.

- [ ] **Step 8: Capture and verify the hard Windows performance evidence**

On the designated Windows reference runner checked out at the reviewed implementation checkpoint, run:

```bash
npm ci
npm --prefix game exec -- playwright install chromium
npm --prefix game run build
npm run collect:windows-performance
npm run verify:windows-performance-evidence
```

Expected: all three 51-actor simulation runs report tick `p95Ms <= 5`; the browser runner proves Windows, Chromium, a 1920 by 1080 display, DPR 1, the recorded 960 by 540 backing canvas fitted to that display, at least 600 measured intervals, CPU-work and interval P95 at or below 16.7 ms, and no more than 1% dropped intervals. The collector writes machine-readable evidence whose source digest matches the reviewed checkpoint and the verifier prints PASS. Copy that evidence back to the shared worktree. Until these commands pass, the slice is not complete.

- [ ] **Step 9: Write the operator playbook and parity report**

Create `docs/playbooks/combat-core-slice.md` with:

- The package ownership boundary.
- `npm run dev -w zmxy3-game -- --host 127.0.0.1` and the `?combatCoreSlice=1` URL.
- Controls `A/D/K/J` for left/right/jump/attack.
- Command, event, snapshot, replay, and hash contracts.
- The collision-center rule and why registration-point coordinates remain in snapshots.
- Origin notes: canonical 30 Hz cadence, Wukong animation durations, Monster7 stats/power, physics-defense formula; adapted AABB and hero active frame; invented isolated proof scene and showcase stats.
- Unit, benchmark, browser-proof, and full-regression commands.
- Artifact paths and the observation-only browser hook.

Create `docs/reports/combat-core-slice-parity.md` with a table containing these exact comparison rows:

| Rule | Reference | New core proof | Classification |
| --- | --- | --- | --- |
| Fixed cadence | Existing `TICK_MS = 1000 / 30` | Package boundary and replay tests | canonical |
| Wukong combo durations | `role1.json` stop counts | five-stage session test and adapter test | canonical |
| Attack mash | Existing `heroSim/combo` rejection | busy rejection and unchanged attack ID | canonical |
| Active-swing RNG cadence | `BattleScene.resolveHeroHits` computes before overlap/dedup | golden RNG state and full checkpoint parity | canonical |
| Air attack presentation | BattleScene stage 0 uses hit3 effect and hit12 sound | airborne event and cue/browser tests | canonical |
| Monster7 stats | `level1.ts` | compiled definition test | canonical |
| Monster7 power | recovered `MONSTER_HIT1_POWER` | 14 raw, 12 after defense | canonical |
| Physics defense | `heroScale.ts` recovered formula | 36 raw, 32 after defense | canonical |
| Sprite offsets | `role1.json`, `monster7.json`, current baseline correction | definition and browser alignment | canonical |
| Stable content IDs | approved architecture namespacing | build-time content validator and snapshot test | canonical |
| Hit volume | current explicit AABB | pure geometry tests | adapted |
| Wukong active frame | current swing-live behavior | `hitFrameFractions: [0]` | adapted |
| Showcase profile | slice-only 120 HP / 36 attack | isolated definition | invented |
| Hit stop | 50 ms presentation cue | browser video and cue log | invented |

Create `docs/reports/combat-core-slice-performance.md` from real outputs only. Link the committed machine-readable evidence and its verifier, record the three 51-actor simulation runs executed on the designated Windows reference machine, local functional/render telemetry, the Windows machine/browser/GPU/viewport/DPR, canvas backing and fitted CSS sizes, 600-frame CPU-work and frame-interval P50/P95/max, dropped-interval count/rate, source digest, tested commit, exact commands, and a PASS/FAIL conclusion. State explicitly that the initial contract measures the current 960 by 540 backing canvas on a 1920 by 1080 reference display. Do not enter placeholder numbers or copy results from another environment.

For every row, link the exact source file and test. End with the switch-over result: the slice is accepted as an isolated proof only; `BattleScene` remains the production campaign runtime until a later full dual-run plan covers movement, platforms, skills, encounters, drops, and progression.

Add a `Canonical Dual-Run Evidence` section containing the exact nine-command, 180-tick scenario from `game/tests/combatCoreDualRun.test.ts`, the compared actor/event/checkpoint fields, `legacyFinalHash`, `modernFinalHash`, and `diffCount: 0` copied from a real test run. State that the Combat Core Slice boundary has passed dual-run parity; BattleScene remains only because systems outside this slice have not yet been migrated.

- [ ] **Step 10: Run every final gate from a clean shell**

Run:

```bash
npm run typecheck:projects
npm run test:contracts
npm run typecheck:core
npm run test:core
npm run bench:combat-core
npm run test:game
npm run build:game
npm run verify:combat-core
npm run verify:windows-performance-evidence
npm --prefix social-server run typecheck
npm --prefix social-server test
npm --prefix agent-server run typecheck
npm --prefix agent-server test
git diff -- agent-server/test/transcript.json > /tmp/combat-core-agent-transcript.patch
if test -s /tmp/combat-core-agent-transcript.patch; then
  git apply -R /tmp/combat-core-agent-transcript.patch
fi
git diff --check
```

Expected:

- Core typecheck, tests, and benchmark pass.
- Every architecture contract package typechecks through project references and passes its focused tests.
- All client tests and production build pass.
- Browser proof prints `combat-core-slice: PASS`.
- The committed Windows evidence passes its source-digest, three-run simulation, environment, render-work, render-interval, dropped-frame, and threshold checks; local telemetry or a stale report cannot satisfy this gate.
- Social server typecheck, unit tests, and real HTTP/WebSocket smoke pass.
- Agent server typecheck, unit, forge-mock, and mock-game flows pass.
- `git diff --check` prints nothing.

The agent integration flow currently rewrites `agent-server/test/transcript.json` as generated output. The commands above capture and reverse only that test-produced diff before the final whitespace check. If any final gate exposes a source defect, fix and commit it, rerun Step 8 to regenerate source-bound Windows evidence, update the report, and then rerun this entire step.

- [ ] **Step 11: Commit the verified evidence and reports**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.package.json packages game docs/playbooks docs/reports docs/superpowers/plans/2026-07-13-combat-core-slice-implementation.md
git commit -m "test: verify combat core slice end to end"
git status --short
```

Expected: commit succeeds and `git status --short` prints nothing.

## Execution Handoff

The architecture design is approved and this plan deliberately stops at the Combat Core Slice. Chapter One, persistence, content compilation, pets, networking authority, React App Shell, and Tauri packaging each require their own implementation plan after this slice supplies the stable combat contract.

Execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh implementation agent per task, run specification and code-quality review between tasks, and keep commits aligned with the plan.
2. **Inline Execution:** execute the plan in the current task with `superpowers:executing-plans` and checkpoint after each committed task.
