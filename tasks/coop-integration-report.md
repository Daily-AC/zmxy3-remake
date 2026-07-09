# Coop Integration Report

## 1. socialClient / Channel Adapter

- Widened `ClientMessage` and `ServerMessage` in `game/src/net/socialClient.ts` with the deployed room relay shapes:
  - client `state`: `{ type: 'state'; seq; payload; sentAt }`
  - client `event`: `{ type: 'event'; name; payload }`
  - server versions include `fromUserId`.
- `decodeServer()` now accepts `state` / `event` and passes `payload: unknown` through without validating coop payload internals.
- Added a `SocialRoomConnection` handoff in `socialClient.ts`: after `game_start`, lobby disposal preserves the live socket once instead of closing it. `BattleScene` claims that preserved connection, so the server does not remove the user from room membership between lobby and battle.
- Added `createSocialRoomTransport(connection)` in `game/src/net/coopChannel.ts`. It adapts the single assignable `connection.onMessage` callback into per-type multi-subscriber `state` / `event` handlers and sends via `connection.send(message)`.

## 2. Remote Heroes / Hero State

- `BattleScene` creates a `CoopChannel` and `CoopSyncState` only when `coopSession` exists.
- Local hero snapshots are sent through `sendHeroState()` every ~100ms using one local monotonic `coopSeq`.
- Snapshot fields include x/y, facing/action, HP/maxHP, alive, local `userId`, and `heroId`.
- Remote heroes are render-only puppets: `HERO_TEX` sprite plus a floating username label. They use `interpolatePosition(view.positionSamples, Date.now())` for x/y and copy facing/action from the latest accepted snapshot.

## 3. Host / Peer Monster Simulation

- Solo mode remains on the original path: if `coopSession` is null, `updateLevel()` and `updateLevel1()` still call `advanceEntity()` directly.
- Coop host mode also runs the existing monster simulation and broadcasts monster snapshots at ~10Hz.
- Coop peer mode skips local `advanceEntity()` entirely. Peers still run local level spawn scaffolding so entities exist, then drive each monster's `state.x/y/facing/hp/action/mode` from host snapshots.
- Monster IDs are local deterministic spawn-order IDs (`species-n`). This matches the demo contract where clients run the same level/spawn roster and the host snapshots override peer presentation.

## 4. Hit Intent / Settlement

- Extended `HitIntentPayload` with `damage: number`, matching the integration brief.
- Solo and host attacks still push `{ attackId, damage }` into `e.hitQueue`, preserving the existing `advanceMonster()` HP-reduction path.
- Non-host local hits do not mutate monster HP. They send `hit_intent` with `{ attackerUserId, targetMonsterId, attackId, damage, clientTimeMs }`.
- The host receives peer hit intents and pushes the peer-reported damage into the matching monster's `hitQueue` using a host-local numeric attack ID map.
- Client-trusted damage is acceptable for this demo because anti-cheat and server-side recomputation are explicitly out of scope.

## 5. Boss / Door / Stage Clear Sync

- Added `level_event` to `coopSync.ts` with payload `{ kind: 'boss_defeated' }`.
- `applyCoopMessage()` accepts `level_event` only from the configured host and emits `level_event_received`.
- When the host shows the result banner, it sends `encodeLevelEvent({ kind: 'boss_defeated' })`.
- Peers receiving that event reveal the local door/substage door and call the same `showResultBanner()` path.

## 6. Test Evidence

### `cd game && npx vitest run`

```text
 RUN  v3.2.7 /Users/e0_7/projects/zmxy3-remake/game

 ✓ tests/heroCombat.test.ts (13 tests) 4ms
 ✓ tests/socialClient.test.ts (13 tests) 7ms
 ✓ tests/level.test.ts (10 tests) 3ms
 ✓ tests/consumables.test.ts (25 tests) 10ms
 ✓ tests/equipment.test.ts (9 tests) 7ms
 ✓ tests/monsterBehaviors.test.ts (41 tests | 1 skipped) 8ms
 ✓ tests/furnaceRecipe.test.ts (12 tests) 11ms
 ✓ tests/levelContinuousSpawner.test.ts (3 tests) 3ms
 ✓ tests/backpackWindowLayout.test.ts (2 tests) 128ms
 ✓ tests/lobbyRoomState.test.ts (6 tests) 4ms
 ✓ tests/save.test.ts (14 tests) 8ms
 ✓ tests/progression.test.ts (12 tests) 6ms
 ✓ tests/heroSkill.test.ts (28 tests) 6ms
 ✓ tests/effects.test.ts (10 tests) 4ms
 ✓ tests/skillDamageReal.test.ts (49 tests) 4ms
 ✓ tests/campaignProgress.test.ts (14 tests) 5ms
 ✓ tests/soundMap.test.ts (5 tests) 3ms
 ✓ tests/npcClient.test.ts (13 tests) 5ms
 ✓ tests/skillTree.test.ts (28 tests) 6ms
 ✓ tests/prefab.test.ts (13 tests) 5ms
 ✓ tests/platformSim.test.ts (3 tests) 3ms
 ✓ tests/saveSlots.test.ts (13 tests) 6ms
 ✓ tests/battleScenePickupWiring.test.ts (8 tests) 5ms
 ✓ tests/monsterSim.test.ts (18 tests) 4ms
 ✓ tests/soulPurse.test.ts (5 tests) 2ms
 ✓ tests/furnace.test.ts (14 tests) 4ms
 ✓ tests/pickup.test.ts (7 tests) 3ms
 ✓ tests/heroScale.test.ts (31 tests) 11ms
 ✓ tests/heroGrowth.test.ts (30 tests) 6ms
 ✓ tests/level3.test.ts (4 tests) 4ms
 ✓ tests/level1.test.ts (7 tests) 3ms
 ✓ tests/heroSurvivability.test.ts (8 tests) 3ms
 ✓ tests/level2.test.ts (5 tests) 5ms
 ✓ tests/heroSim.test.ts (7 tests) 3ms
 ✓ tests/mp.test.ts (7 tests) 2ms
 ✓ tests/coopSync.test.ts (10 tests) 4ms
 ✓ tests/battleSceneCoopIntegration.test.ts (4 tests) 3ms
 ✓ tests/locomotion.test.ts (6 tests) 2ms
 ✓ tests/roleData.test.ts (5 tests) 3ms
 ✓ tests/level4.test.ts (4 tests) 4ms
 ✓ tests/dropRoll.test.ts (6 tests) 5ms
 ✓ tests/heroIdentity.test.ts (9 tests) 6ms
 ✓ tests/coopChannel.test.ts (3 tests) 3ms
 ✓ tests/level1HeadlessSmoke.test.ts (1 test) 7ms
 ✓ tests/inventory.test.ts (4 tests) 2ms
 ✓ tests/combo.test.ts (9 tests) 5ms
 ✓ tests/combatPower.test.ts (3 tests) 3ms
 ✓ tests/monsterExp.test.ts (5 tests) 4ms
 ✓ tests/jump.test.ts (6 tests) 2ms
 ✓ tests/monster30Visual.test.ts (2 tests) 894ms
   ✓ Monster30 visual data > uses a cleaned Monster30 sheet with transparent mask pixels removed  892ms
 ✓ tests/battleSceneVisualMapping.test.ts (4 tests) 987ms
   ✓ BattleScene visual fidelity helpers > places bg11 in original scene coordinates including BaseGameSence x=-20  985ms
 ✓ tests/enemyProjectiles.test.ts (2 tests) 4ms
 ✓ tests/originalMonsterDrops.test.ts (3 tests) 2ms
 ✓ tests/hudRarity.test.ts (5 tests) 2ms
 ✓ tests/platformHeroSim.test.ts (2 tests) 3ms
 ✓ tests/hitbox.test.ts (4 tests) 4ms
 ✓ tests/level1Substage.test.ts (1 test) 2ms

 Test Files  57 passed (57)
      Tests  584 passed | 1 skipped (585)
   Start at  17:01:07
   Duration  1.35s (transform 1.88s, setup 0ms, collect 3.58s, tests 2.26s, environment 8ms, prepare 3.03s)
```

### `cd game && npx tsc --noEmit`

Exit code 0; no stdout/stderr.

```text
```

### `git diff --check`

Exit code 0; no stdout/stderr.

```text
```

## 7. Manual Two-Tab Test Recipe

1. Start the local social server:

```bash
cd social-server
JWT_SECRET=dev-local-secret SOCIAL_SERVER_PORT=7100 SOCIAL_DB_PATH=:memory: npx tsx src/server.ts
```

2. Start the game:

```bash
cd game
npx vite --port 5180
```

3. Open two isolated browser tabs to:

```text
http://localhost:5180/?socialServer=http://localhost:7100
```

4. In tab A, register/login, enter the world map, open `联机共斗`, create an L1 room.
5. In tab B, register/login, enter the world map, open `联机共斗`, join tab A's room ID.
6. Ready both players; host starts.
7. Expected in BattleScene:
   - Both tabs enter combat.
   - Each tab sees the other player as a Wukong puppet with username label.
   - Moving in one tab updates smoothly in the other.
   - Host monsters animate normally; peer monsters follow host positions/HP.
   - Peer attacks show immediate local float text, then monster HP follows the host's next snapshot.
   - Killing the boss on host shows the result banner/portal on both tabs.

## 8. Files Created / Touched

Created:

- `game/tests/battleSceneCoopIntegration.test.ts`
- `tasks/coop-integration-report.md`

Touched:

- `game/src/scenes/BattleScene.ts`
- `game/src/net/socialClient.ts`
- `game/src/net/coopChannel.ts`
- `game/src/systems/coopSync.ts`
- `game/tests/socialClient.test.ts`
- `game/tests/coopChannel.test.ts`
- `game/tests/coopSync.test.ts`

Unrelated dirty files from other workstreams remain in the worktree and were not edited for this task.

## 9. Commit Checklist

Git commit failed in this sandbox:

```text
fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted
```

Run these outside the sandbox, in order:

```bash
git add game/src/net/socialClient.ts game/src/net/coopChannel.ts game/tests/socialClient.test.ts game/tests/coopChannel.test.ts
git commit -m "Wire social room transport for coop sync"

git add game/src/systems/coopSync.ts game/tests/coopSync.test.ts
git commit -m "Extend coop sync protocol for combat events"

git add game/src/scenes/BattleScene.ts game/tests/battleSceneCoopIntegration.test.ts
git commit -m "Integrate coop combat sync in BattleScene"

git add tasks/coop-integration-report.md
git commit -m "Document coop combat integration"
```
