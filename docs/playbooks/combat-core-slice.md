# Combat Core Slice Operator Playbook

## Ownership

`packages/game-core` owns deterministic combat rules, commands, snapshots, checkpoints, replay, and hashes. `game/src/adapters` compiles existing game data into that boundary. `game/src/scenes/CombatCoreScene.ts` is an opt-in Phaser presentation shell; it must not mutate authoritative state outside validated commands.

Run the proof locally:

```bash
npm run dev -w zmxy3-game -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/?combatCoreSlice=1`. Controls are `A`/`D` to move, `K` to jump, and `J` to attack. The ordinary route without `combatCoreSlice=1` remains the production campaign shell.

## Contracts

- Input edges become versioned commands with actor ID, sequence, and target tick.
- `CombatSession.step()` is the only authority for domain events and snapshots.
- Snapshots preserve registration-point coordinates. Phaser sprites render at snapshot position plus the actor definition's collision offset, so collision centers and extracted art remain aligned.
- Replays consume the recorded commands and tick count; acceptance requires the replay final hash to equal the live deterministic-state hash.
- Presentation cues are versioned and may fail without changing ticks, commands, damage, RNG, or replay state.

The canonical cadence is 30 Hz. Wukong action durations come from [`role1.json`](../../game/src/data/roles/role1.json), Monster7 stats come from [`level1.ts`](../../game/src/data/levels/level1.ts), Monster7 attack power comes from [`monsterAttackPower.ts`](../../game/src/data/monsterAttackPower.ts), and physical defense comes from [`heroScale.ts`](../../packages/game-core/src/combat/heroScale.ts). The explicit AABB and Wukong active-frame mapping are adapted. The isolated scene and 120 HP / 36 attack showcase profile are invented proof scaffolding.

## Verification

```bash
npm run typecheck:core
npm run test:core
npm run bench:combat-core
npm run test:game
npm run build:game
COMBAT_CORE_VISUAL_CANDIDATE_ONLY=1 npm run verify:combat-core
UPDATE_COMBAT_CORE_BASELINE=1 npm run verify:combat-core
npm run verify:combat-core
npm run verify:windows-performance-evidence
```

Generated evidence is under `game/tmp/combat-core-slice/` and is ignored. Reviewed visual and semantic baselines are under `game/tests/baselines/`. The observation-only `window.__combatCoreSlice` hook exposes cloned snapshots, commands, events, presentation cues, performance distributions, deterministic proof, reset, and an asynchronous bug bundle. It accepts no arbitrary state or command injection.

Windows reference evidence is collected only with `npm run collect:windows-performance` on the designated clean Windows runner. Local headless Chromium telemetry is provisional and cannot satisfy that gate.
