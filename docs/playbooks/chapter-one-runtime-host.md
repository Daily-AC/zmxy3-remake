# Chapter One Runtime Host Playbook

## Routes

- Production chapter one (`sl11`, `sl12`, `sl13`): `/`
- Explicit legacy rollback: `/?battleRuntime=legacy`
- Deterministic browser gate only: `/?runtimeDebug=gate`

Campaign indices `0..2` select `BattleRuntimeScene`. Later campaign nodes and co-op continue to use `BattleScene` until their production definitions and server-authoritative command transport are migrated.

## Runtime Boundary

`BattleRuntime` owns fixed-tick movement, platforms, actors, encounters, attacks, projectiles, damage, loot entities, pickup requests, the active weapon/armor loadout, the transfer door, and stage clear. Phaser samples input, submits commands, renders snapshots, and presents events. Browser storage is reached through shell adapters, not from core.

Loot and equipment use two-phase authority transactions. Core requests a pickup; the inventory adapter plans against a clone and confirms the accepted quantity. Equipment changes are likewise planned against a cloned save, applied through `apply-hero-loadout`, and committed to inventory/storage only after `hero-loadout-applied`. Weapon appearance, attack, defense, critical chance, skill damage, max HP, and max MP therefore change in one deterministic tick. Recipe crafting plans material, soul, and product changes against a cloned save and commits them together.

The gate-only `window.__battleRuntime` hook is installed only when `runtimeDebug=gate`:

- `getSnapshot()`, `getEvents()`, and `getHash()` observe deterministic state.
- `enqueue(command)` uses the same ordered `BattleCommand` boundary as keyboard input.
- `setManualMode(true)` disables the render-loop clock for deterministic stepping.
- `step(ticks)` advances the same runtime and presentation event path used in play.
- `equipItem(itemId)` uses the production equipment transaction from the browser gate.
- `getWeaponTexture()` exposes the rendered weapon sheet for visual-loadout assertions.

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

Completion evidence must target the public acceptance deployment, not localhost:

```bash
RUNTIME_ORIGIN=https://zaixu-dev.qmledmq.cn:8443 \
RUNTIME_NPC_SERVER=wss://zm-dev.qmledmq.cn:8443 \
RUNTIME_SOCIAL_SERVER=https://zm-dev.qmledmq.cn:8443/social \
node game/tools/verify-sl11-runtime.mjs
```

The self-hosted preview mode remains available for diagnosis, but does not count as final acceptance.

The browser gate starts isolated preview, NPC, and social servers on reserved ports. It registers through the real shell, then proves the three independent world-map/loading routes, movement, jump, original chapter-one drops, capacity-aware pickup, persisted material/soul recipe crafting, backpack rendering, weapon/armor equip, hot combat-stat and weapon-sheet changes, skill MP consumption, all eleven encounter transitions, each door interaction, campaign frontier persistence, and the immutable legacy fallback. Any console error, page exception, failed request, blank screenshot, missing event, wrong StopPoint, failed transaction, or wrong frontier fails the command.

Evidence is regenerated under `game/tmp/sl11-runtime/`:

- `world-map.png`
- `stage-cleared.png`
- `sl12-backpack-before-equip.png`
- `sl12-stage-cleared.png`
- `sl13-stage-cleared.png`
- `legacy-fallback.png`
- `result.json` with the runtime hashes and event count
- `runtime-ready-failure.*` when scene readiness fails

Latest local proof on 2026-07-16: `sl11=8df48257`, `sl12=4c95a0fe`, `sl13=48c35d36`; saved frontier is `2` (南天门). The same run persisted `8` dropped soul, `3` timber, one starter staff, two starter armors, crafted one `whg` after deducting three timber and twenty soul, then equipped a dropped weapon and armor before clearing the remaining stages.

## Failure Triage

- Stuck on loading: inspect `runtime-ready-failure.json` and the matching screenshot first.
- Failed asset request: verify the optimized `.webp` sibling exists for every loaded `.png` or `.jpg` URL.
- Visual black rectangles: confirm the scene loads `Monster30_clean`; for the `online_floor13` PNG/WebP pair, rows 7..46 of the extractor's opaque black mask must remain transparent.
- Hash drift: run the core replay/checkpoint suites before changing Phaser presentation code.
- Progress not unlocked: inspect `zmxy3-remake.slot.v1.<slot>.level` and the `activeSlot` carried in `BattleData`.
- Legacy regression: reproduce with `battleRuntime=legacy`; the route must instantiate `BattleScene` and expose no runtime hook.

## Deferred Work

The production host now covers the complete first-chapter battle slice, the necessary `slz` skill, authoritative drops and pickup, weapon/armor inventory transactions, hot loadout attributes, save restoration, selling, and the starter recipe. AI-authored free-form forge output remains a map-side validated transaction rather than deterministic combat state. Co-op remains on `BattleScene` until room commands can enter the deterministic runtime through a server-authoritative transport. `BattleScene` also stays byte-locked behind `?battleRuntime=legacy` as the rollback path while those systems migrate.
