# Chapter One Runtime Host Playbook

## Routes

- Production chapter-one opt-in (`sl11`, `sl12`, `sl13`): `/?battleRuntime=1`
- Legacy fallback: `/` (or any URL without `battleRuntime=1`)
- Deterministic browser gate only: `/?battleRuntime=1&runtimeDebug=gate`

Campaign indices `0..2` select `BattleRuntimeScene`. Later campaign nodes and co-op continue to use `BattleScene` until their production definitions and server-authoritative command transport are migrated.

## Runtime Boundary

`BattleRuntime` owns fixed-tick movement, platforms, actors, encounters, attacks, projectiles, damage, the transfer door, and stage clear. Phaser samples input, submits commands, renders snapshots, and presents events. Browser storage is reached through the shell adapter, not from core.

The gate-only `window.__battleRuntime` hook is installed only when `runtimeDebug=gate`:

- `getSnapshot()`, `getEvents()`, and `getHash()` observe deterministic state.
- `enqueue(command)` uses the same ordered `BattleCommand` boundary as keyboard input.
- `setManualMode(true)` disables the render-loop clock for deterministic stepping.
- `step(ticks)` advances the same runtime and presentation event path used in play.

The gate fixture shortens only encounter timing and monster health. Production content remains unchanged: `sl11` keeps its vertical geometry and Owl trigger; `sl12` keeps five source StopPoints and thirteen MonsterAppearPoints; `sl13` keeps five source StopPoints, fourteen MonsterAppearPoints, Giant Spirit finale, and both Monster30 streams. Equipped weapon/armor attributes and the bound `slz` skill are compiled into the same deterministic definition.

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

The browser gate starts isolated preview, NPC, and social servers on reserved ports. It registers through the real shell, then proves the three independent world-map/loading routes, movement, jump, equipped weapon rendering, skill MP consumption, all eleven encounter transitions, each door interaction, campaign frontier persistence, and the legacy fallback. Any console error, page exception, failed request, blank screenshot, missing event, wrong StopPoint, or wrong frontier fails the command.

Evidence is regenerated under `game/tmp/sl11-runtime/`:

- `world-map.png`
- `stage-cleared.png`
- `sl12-stage-cleared.png`
- `sl13-stage-cleared.png`
- `legacy-fallback.png`
- `result.json` with the runtime hashes and event count
- `runtime-ready-failure.*` when scene readiness fails

Latest local proof on 2026-07-15: `sl11=6929b390`, `sl12=a1f87e5a`, `sl13=a245c05a`; saved frontier is `2` (南天门).

## Failure Triage

- Stuck on loading: inspect `runtime-ready-failure.json` and the matching screenshot first.
- Failed asset request: verify the optimized `.webp` sibling exists for every loaded `.png` or `.jpg` URL.
- Visual black rectangles: confirm the scene loads `Monster30_clean`; for the `online_floor13` PNG/WebP pair, rows 7..46 of the extractor's opaque black mask must remain transparent.
- Hash drift: run the core replay/checkpoint suites before changing Phaser presentation code.
- Progress not unlocked: inspect `zmxy3-remake.slot.v1.<slot>.level` and the `activeSlot` carried in `BattleData`.
- Legacy regression: reproduce without `battleRuntime=1`; the route must instantiate `BattleScene` and expose no runtime hook.

## Deferred Work

The production host now covers the complete first-chapter battle slice, the necessary `slz` skill, and weapon/armor-derived attributes. Item drops and inventory transactions remain on the legacy host. Co-op remains on `BattleScene` until room commands can enter the deterministic runtime through a server-authoritative transport. `BattleScene` also stays available as the query-free rollback path while those systems migrate.
