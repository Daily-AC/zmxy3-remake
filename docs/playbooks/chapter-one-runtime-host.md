# Chapter One Runtime Host Playbook

## Routes

- Production `sl11` opt-in: `/?battleRuntime=1`
- Legacy fallback: `/` (or any URL without `battleRuntime=1`)
- Deterministic browser gate only: `/?battleRuntime=1&runtimeDebug=gate`

Only campaign index `0` selects `BattleRuntimeScene`. Later campaign nodes and co-op continue to use `BattleScene` until their production definitions are migrated.

## Runtime Boundary

`BattleRuntime` owns fixed-tick movement, platforms, actors, encounters, attacks, projectiles, damage, the transfer door, and stage clear. Phaser samples input, submits commands, renders snapshots, and presents events. Browser storage is reached through the shell adapter, not from core.

The gate-only `window.__battleRuntime` hook is installed only when `runtimeDebug=gate`:

- `getSnapshot()`, `getEvents()`, and `getHash()` observe deterministic state.
- `enqueue(command)` uses the same ordered `BattleCommand` boundary as keyboard input.
- `setManualMode(true)` disables the render-loop clock for deterministic stepping.
- `step(ticks)` advances the same runtime and presentation event path used in play.

The gate fixture shortens only encounter timing and boss health. The production `sl11` geometry, continuous Monster30 spawning, height trigger, Owl definition, and door placement remain covered by definition and runtime tests.

## Verification

From the repository root:

```bash
npm ci --prefix agent-server
npm ci --prefix social-server
npm run typecheck:projects
npm test -w @zaixu/game-core
npm test -w zmxy3-game
npm run build -w zmxy3-game
node game/tools/verify-sl11-runtime.mjs
npm run verify:combat-core
```

The browser gate starts isolated preview and NPC servers on reserved ports. It proves the world-map/loading route, movement, jump, whiff-capable attack command, Owl defeat, door reveal, transfer interaction, campaign frontier persistence, and the legacy fallback. Any console error, page exception, failed request, blank screenshot, missing event, or wrong frontier fails the command.

Evidence is regenerated under `game/tmp/sl11-runtime/`:

- `world-map.png`
- `stage-cleared.png`
- `legacy-fallback.png`
- `result.json` with the runtime hashes and event count
- `runtime-ready-failure.*` when scene readiness fails

Latest local proof on 2026-07-15: `hashBeforeClear=acda03f5`, `finalHash=7b4578de`, `eventCount=8`.

## Failure Triage

- Stuck on loading: inspect `runtime-ready-failure.json` and the matching screenshot first.
- Failed asset request: verify the optimized `.webp` sibling exists for every loaded `.png` or `.jpg` URL.
- Visual black rectangles: confirm the scene loads `Monster30_clean`, not the raw extracted sheet.
- Hash drift: run the core replay/checkpoint suites before changing Phaser presentation code.
- Progress not unlocked: inspect `zmxy3-remake.slot.v1.<slot>.level` and the `activeSlot` carried in `BattleData`.
- Legacy regression: reproduce without `battleRuntime=1`; the route must instantiate `BattleScene` and expose no runtime hook.

## Deferred Work

Phase 1 does not yet migrate skills, drops, equipment-derived attributes, inventory transactions, or `sl12`/`sl13`. Those remain Phase 2 and Phase 3 work. `BattleScene` stays available as the fallback until each system crosses the same deterministic and browser gates.
