# Coop Sync Report

## 1. Protocol Summary

All coop combat sync rides the existing social-server room WebSocket messages:

- `state` for high-frequency snapshots. A single monotonic `seq` stream is used per sender across coop state payloads. Receivers discard an incoming state if `seq <= lastAcceptedSeq` for that sender.
- `event` for hit intent and hit settlement. Events are not sequence-dropped because every event matters and WebSocket ordering is enough for demo scope.

Hero state payload:

```ts
{
  coopType: 'hero_state',
  hero: {
    userId: string,
    heroId: string,
    x: number,
    y: number,
    facing: -1 | 1,
    action: string,
    animState: string,
    hp: number,
    maxHp: number,
    alive: boolean,
  },
}
```

Monster state payload:

```ts
{
  coopType: 'monster_state',
  monsters: Array<{
    monsterId: string,
    x: number,
    y: number,
    facing: -1 | 1,
    action: string,
    hp: number,
    maxHp: number,
    alive: boolean,
  }>,
}
```

Hit intent event:

```ts
{
  type: 'event',
  name: 'hit_intent',
  payload: {
    attackerUserId: string,
    targetMonsterId: string,
    attackId: string,
    skillId?: string,
    clientTimeMs: number,
  },
}
```

Hit settlement event:

```ts
{
  type: 'event',
  name: 'hit_settlement',
  payload: {
    attackerUserId: string,
    targetMonsterId: string,
    attackId: string,
    damageDealt: number,
    monsterHp: number,
    monsterMaxHp: number,
    monsterAlive: boolean,
    killed: boolean,
  },
}
```

Interpolation uses `DEFAULT_RENDER_DELAY_MS = 120`. This is slightly more than one 10Hz snapshot interval, so the renderer usually has two bracketing samples while keeping remote movement responsive. The helper clamps without extrapolation when the target render time is older than the buffer, newer than the latest sample, or only one sample exists.

Host-authoritative reducer rules:

- Peers apply host monster snapshots; monster snapshots from non-host senders are ignored locally.
- Peers and host can apply hero snapshots after seq acceptance.
- Host resolves `hit_intent` through an injected pure `resolveHitIntent` callback and emits a `hit_settlement` event.
- Peers apply `hit_settlement` only from the configured host.
- Loot/pickup ownership arbitration is intentionally absent.

## 2. socialClient Contract Assumed

`game/src/net/coopChannel.ts` defines this local interface:

```ts
export interface CoopRoomTransport {
  sendRoomMessage(message: CoopOutboundMessage): boolean
  onRoomMessage(type: 'state' | 'event', handler: (message: unknown) => void): () => void
}
```

For coopChannel to plug in unchanged, coop-shell's real room connection needs to satisfy that shape, either directly or via a tiny adapter:

1. `sendRoomMessage(message)` sends parsed social-server room WS messages of type `state` or `event`.
2. `onRoomMessage('state', handler)` subscribes to incoming raw or parsed state frames, including `fromUserId` injected by the server.
3. `onRoomMessage('event', handler)` subscribes to incoming raw or parsed event frames, including `fromUserId`.
4. The unsubscribe function returned from `onRoomMessage` removes only that handler.

At the time `coopChannel.ts` was written, `find game/src -iname '*social*'` returned no files. Later in the worktree an untracked `game/src/net/socialClient.ts` appeared from the parallel coop-shell stream. I did not modify it. The version I inspected currently exposes lobby-only `ClientMessage`/`ServerMessage` and `SocialRoomConnection.send(msg: ClientMessage)`, so it will need to widen its room WS surface for generic `state`/`event` frames or provide an adapter matching `CoopRoomTransport`.

## 3. Server Source Decision

I did not touch `social-server/src/`.

Existing protocol types are already generic enough: `social-server/src/ws-protocol.ts:42-53` defines `StateMessage` and `EventMessage` with `payload: unknown`, and `social-server/src/ws-protocol.ts:56-75` includes them in both client-to-server and server-to-client unions.

Existing relay code is already verbatim and role-agnostic: `social-server/src/ws-server.ts:142-163` documents and implements generic `handleState`/`handleEvent` broadcast, injecting only `fromUserId`.

I added `social-server/test/ws-relay.test.ts` because the existing tests did not cover the state/event relay path. It uses an in-memory fake WebSocket server/socket pair, so it exercises `attachRoomWebSocketServer` without depending on local port binding or sqlite.

## 4. Test Evidence

### `cd game && npx vitest run`

Exit code: 1. The new coop tests passed; the suite failed on an unrelated parallel coop-shell test importing missing `src/scenes/LobbyScene`, which is outside this task's no-scenes boundary.

```text

 RUN  v3.2.7 /Users/e0_7/projects/zmxy3-remake/game

 ✓ tests/battleScenePickupWiring.test.ts (8 tests) 4ms
 ✓ tests/progression.test.ts (12 tests) 3ms
 ✓ tests/heroSkill.test.ts (28 tests) 5ms
 ✓ tests/socialClient.test.ts (10 tests) 5ms
 ✓ tests/coopChannel.test.ts (2 tests) 2ms
 ✓ tests/monsterBehaviors.test.ts (41 tests | 1 skipped) 5ms
 ✓ tests/consumables.test.ts (25 tests) 8ms
 ✓ tests/save.test.ts (14 tests) 4ms
 ✓ tests/saveSlots.test.ts (13 tests) 5ms
 ✓ tests/level1HeadlessSmoke.test.ts (1 test) 3ms
 ✓ tests/level.test.ts (10 tests) 2ms
 ✓ tests/level1.test.ts (7 tests) 3ms
 ✓ tests/platformSim.test.ts (3 tests) 2ms
 ✓ tests/skillTree.test.ts (28 tests) 3ms
 ✓ tests/dropRoll.test.ts (6 tests) 6ms
 ✓ tests/equipment.test.ts (9 tests) 3ms
 ✓ tests/monsterSim.test.ts (18 tests) 4ms
 ✓ tests/prefab.test.ts (13 tests) 3ms
 ✓ tests/soundMap.test.ts (5 tests) 2ms
 ✓ tests/skillDamageReal.test.ts (49 tests) 4ms
 ✓ tests/furnace.test.ts (14 tests) 3ms
 ✓ tests/heroScale.test.ts (31 tests) 3ms
 ✓ tests/heroCombat.test.ts (13 tests) 3ms
 ✓ tests/npcClient.test.ts (11 tests) 3ms
 ✓ tests/pickup.test.ts (7 tests) 3ms
 ✓ tests/coopSync.test.ts (9 tests) 3ms
 ✓ tests/level2.test.ts (5 tests) 3ms
 ✓ tests/level3.test.ts (4 tests) 4ms
 ✓ tests/mp.test.ts (7 tests) 2ms
 ✓ tests/level4.test.ts (4 tests) 3ms
 ✓ tests/heroGrowth.test.ts (30 tests) 3ms
 ✓ tests/monster30Visual.test.ts (2 tests) 488ms
   ✓ Monster30 visual data > uses a cleaned Monster30 sheet with transparent mask pixels removed  486ms
 ✓ tests/battleSceneVisualMapping.test.ts (4 tests) 496ms
   ✓ BattleScene visual fidelity helpers > places bg11 in original scene coordinates including BaseGameSence x=-20  495ms
 ✓ tests/levelContinuousSpawner.test.ts (3 tests) 2ms
 ✓ tests/effects.test.ts (10 tests) 3ms
 ✓ tests/heroIdentity.test.ts (9 tests) 4ms
 ✓ tests/campaignProgress.test.ts (14 tests) 4ms
 ✓ tests/heroSurvivability.test.ts (8 tests) 9ms
 ✓ tests/heroSim.test.ts (7 tests) 3ms
 ✓ tests/locomotion.test.ts (6 tests) 3ms
 ✓ tests/roleData.test.ts (5 tests) 2ms
 ✓ tests/originalMonsterDrops.test.ts (3 tests) 3ms
 ✓ tests/soulPurse.test.ts (5 tests) 2ms
 ✓ tests/inventory.test.ts (4 tests) 2ms
 ✓ tests/combo.test.ts (9 tests) 3ms
 ✓ tests/hitbox.test.ts (4 tests) 3ms
 ✓ tests/jump.test.ts (6 tests) 7ms
 ✓ tests/platformHeroSim.test.ts (2 tests) 2ms
 ✓ tests/monsterExp.test.ts (5 tests) 2ms
 ✓ tests/enemyProjectiles.test.ts (2 tests) 2ms
 ✓ tests/hudRarity.test.ts (5 tests) 2ms
 ✓ tests/combatPower.test.ts (3 tests) 1ms
 ✓ tests/level1Substage.test.ts (1 test) 1ms

 Failed Suites 1 

 FAIL  tests/lobbyRoomState.test.ts [ tests/lobbyRoomState.test.ts ]
Error: Cannot find module '../src/scenes/LobbyScene' imported from '/Users/e0_7/projects/zmxy3-remake/game/tests/lobbyRoomState.test.ts'
 ❯ tests/lobbyRoomState.test.ts:2:1
      1| import { describe, expect, it } from 'vitest'
      2| import {
       | ^
      3|   canStartRoom,
      4|   isOwner,

Caused by: Error: Failed to load url ../src/scenes/LobbyScene (resolved id: ../src/scenes/LobbyScene) in /Users/e0_7/projects/zmxy3-remake/game/tests/lobbyRoomState.test.ts. Does the file exist?
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:35835:17

 Test Files  1 failed | 53 passed (54)
      Tests  553 passed | 1 skipped (554)
   Start at  15:10:24
   Duration  1.13s (transform 1.18s, setup 0ms, collect 2.00s, tests 1.15s, environment 4ms, prepare 1.99s)
```

### `cd game && npx tsc --noEmit`

Exit code: 0. The command produced no stdout/stderr.

```text
```

### `cd social-server && npm run test`

Exit code: 1. The new relay test passed; the suite failed on three pre-existing auth tests because the installed `better-sqlite3` native addon targets Node module version 127 while this Node requires 141. Because `npm run test` is `test:unit && test:e2e`, e2e did not run after unit failure.

```text

> zmxy3-social-server@0.1.0 test
> npm run test:unit && npm run test:e2e


> zmxy3-social-server@0.1.0 test:unit
> node --import tsx --test test/*.test.ts

✔ splitAmongPresent divides evenly when there is no remainder (1.322583ms)
✔ splitAmongPresent assigns the remainder to the killer for two, three, and four present users (0.097ms)
✔ splitAmongPresent gives a single present member everything (0.053708ms)
✔ splitAmongPresent throws when the killer is not present (0.187667ms)
✔ rollDropsForPresent gives chance-1 drops to everyone and chance-0 drops to nobody (0.080125ms)
✔ rollDropsForPresent rolls independently per player instead of sharing one contested result (1.873041ms)
✔ lockTransfer deducts immediately under a pending transaction (0.155166ms)
✔ lockTransfer refuses when balance is insufficient and leaves the ledger untouched (0.051292ms)
✔ commitTransfer finalizes a successful transfer and credits the receiver (0.072292ms)
✔ refundTransfer restores the sender after a failed transfer (0.096125ms)
✔ commit and refund are idempotent and mutually exclusive on a settled tx (0.058958ms)
✔ refund and commit are idempotent and mutually exclusive on a refunded tx (0.0465ms)
✔ transferItem moves balance exactly once between friends (0.061625ms)
✔ transferItem rejects non-friends before touching the ledger (0.040834ms)
✔ transferItem rejects insufficient balance and leaves the ledger untouched (0.036833ms)
✔ transferItem prevents double-spend across back-to-back calls (0.055375ms)
✖ registerUser creates a DB-backed user and token that verifyToken can resolve (2.975292ms)
✖ registerUser rejects empty credentials and duplicate usernames (1.388292ms)
✖ loginUser returns the same public user shape and hides which credential was wrong (1.089542ms)
✔ assertJwtSecret throws a clear startup error when JWT_SECRET is missing (0.224959ms)
✔ canSendFriendRequest rejects self requests (1.283875ms)
✔ canSendFriendRequest rejects users that are already friends (0.065458ms)
✔ canSendFriendRequest rejects duplicate pending requests in either direction (0.070542ms)
✔ canSendFriendRequest allows a new request when only settled old requests exist (0.053375ms)
✔ acceptFriendRequest only works on pending requests by the recipient (0.083375ms)
✔ rejectFriendRequest only works on pending requests by the recipient (0.05725ms)
✔ accepting or rejecting an already-settled request is rejected as not_pending (0.06ms)
✔ friendshipPair documents the stable pair-removal contract (0.060709ms)
✔ createRoom creates a waiting room owned by the first member (1.602458ms)
✔ joinRoom adds a new member when the room is waiting and has capacity (0.162041ms)
✔ joinRoom rejects a full room (0.069709ms)
✔ joinRoom rejects rooms already in game (0.05025ms)
✔ joinRoom rejects duplicate members (0.050125ms)
✔ leaveRoom removes a non-owner while keeping the owner (0.083417ms)
✔ leaveRoom transfers ownership to the earliest remaining member when owner leaves (0.051709ms)
✔ leaveRoom returns null when the last member leaves (0.059584ms)
✔ setReady toggles one member without mutating the original room (0.061875ms)
✔ canStart is false until every member is ready and the room is waiting (0.090375ms)
✔ solo room can start once the owner is ready (0.048625ms)
✔ startGame sets status to in_game and throws when canStart is false (0.179792ms)
✔ room websocket relays generic state and event frames with injected sender id (3.250625ms)
ℹ tests 41
ℹ suites 0
ℹ pass 38
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 140.785167

✖ failing tests:

test at test/auth.test.ts:1:228
✖ registerUser creates a DB-backed user and token that verifyToken can resolve (2.975292ms)
  Error: The module '/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  was compiled against a different Node.js version using
  NODE_MODULE_VERSION 127. This version of Node.js requires
  NODE_MODULE_VERSION 141. Please try re-compiling or re-installing
  the module (for instance, using `npm rebuild` or `npm install`).
      at Module._extensions..node (node:internal/modules/cjs/loader:1969:18)
      at Module.load (node:internal/modules/cjs/loader:1532:32)
      at Module._load (node:internal/modules/cjs/loader:1334:12)
      at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
      at Module.require (node:internal/modules/cjs/loader:1555:12)
      at require (node:internal/modules/helpers:152:16)
      at bindings (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/bindings/bindings.js:112:48)
      at new Database (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/lib/database.js:48:64)
      at openSocialDb (/Users/e0_7/projects/zmxy3-remake/social-server/src/db.ts:76:14)
      at TestContext.<anonymous> (/Users/e0_7/projects/zmxy3-remake/social-server/test/auth.test.ts:9:14) {
    code: 'ERR_DLOPEN_FAILED'
  }

test at test/auth.test.ts:1:671
✖ registerUser rejects empty credentials and duplicate usernames (1.388292ms)
  Error: The module '/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  was compiled against a different Node.js version using
  NODE_MODULE_VERSION 127. This version of Node.js requires
  NODE_MODULE_VERSION 141. Please try re-compiling or re-installing
  the module (for instance, using `npm rebuild` or `npm install`).
      at Module._extensions..node (node:internal/modules/cjs/loader:1969:18)
      at Module.load (node:internal/modules/cjs/loader:1532:32)
      at Module._load (node:internal/modules/cjs/loader:1334:12)
      at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
      at Module.require (node:internal/modules/cjs/loader:1555:12)
      at require (node:internal/modules/helpers:152:16)
      at bindings (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/bindings/bindings.js:112:48)
      at new Database (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/lib/database.js:48:64)
      at openSocialDb (/Users/e0_7/projects/zmxy3-remake/social-server/src/db.ts:76:14)
      at TestContext.<anonymous> (/Users/e0_7/projects/zmxy3-remake/social-server/test/auth.test.ts:26:14) {
    code: 'ERR_DLOPEN_FAILED'
  }

test at test/auth.test.ts:1:1111
✖ loginUser returns the same public user shape and hides which credential was wrong (1.089542ms)
  Error: The module '/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  was compiled against a different Node.js version using
  NODE_MODULE_VERSION 127. This version of Node.js requires
  NODE_MODULE_VERSION 141. Please try re-compiling or re-installing
  the module (for instance, using `npm rebuild` or `npm install`).
      at Module._extensions..node (node:internal/modules/cjs/loader:1969:18)
      at Module.load (node:internal/modules/cjs/loader:1532:32)
      at Module._load (node:internal/modules/cjs/loader:1334:12)
      at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
      at Module.require (node:internal/modules/cjs/loader:1555:12)
      at require (node:internal/modules/helpers:152:16)
      at bindings (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/bindings/bindings.js:112:48)
      at new Database (/Users/e0_7/projects/zmxy3-remake/social-server/node_modules/better-sqlite3/lib/database.js:48:64)
      at openSocialDb (/Users/e0_7/projects/zmxy3-remake/social-server/src/db.ts:76:14)
      at TestContext.<anonymous> (/Users/e0_7/projects/zmxy3-remake/social-server/test/auth.test.ts:42:14) {
    code: 'ERR_DLOPEN_FAILED'
  }
```

Additional focused checks:

```text
$ cd game && npx vitest run tests/coopSync.test.ts tests/coopChannel.test.ts

 RUN  v3.2.7 /Users/e0_7/projects/zmxy3-remake/game

 ✓ tests/coopChannel.test.ts (2 tests) 2ms
 ✓ tests/coopSync.test.ts (9 tests) 3ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  15:06:03
   Duration  228ms (transform 38ms, setup 0ms, collect 47ms, tests 5ms, environment 0ms, prepare 57ms)
```

```text
$ cd social-server && node --import tsx --test test/ws-relay.test.ts
✔ room websocket relays generic state and event frames with injected sender id (2.696791ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 166.553042
```

```text
$ cd social-server && npm run typecheck

> zmxy3-social-server@0.1.0 typecheck
> tsc --noEmit
```

## 5. BattleScene Integration Checklist

1. Create a `CoopSyncState` when entering combat from a room: `createCoopSyncState({ localUserId, hostUserId })`.
2. Wrap the real social room connection in `CoopRoomTransport`, then construct `new CoopChannel(transport)`.
3. Keep one local state `seq` counter per connected user. Every 100ms nominally, send `coopChannel.sendHeroState(snapshot, seq++, Date.now())`.
4. On every inbound coop message from `coopChannel.subscribe`, call `applyCoopMessage(currentState, message, hostOptions)` and replace the current state with the returned state.
5. For remote heroes, render from `state.heroes[userId].positionSamples` using `interpolatePosition(samples, Date.now())`; use the latest snapshot fields for facing/action/animation/hp.
6. If `isHost`, run the existing monster simulation locally and broadcast `coopChannel.sendMonsterState(monsterSnapshots, seq++, Date.now())` every 100ms nominally.
7. If not host, do not run authoritative monster AI/damage locally; render monsters from host snapshots and settlements.
8. On local attack landing in coop mode, peers send `coopChannel.sendHitIntent({ attackerUserId, targetMonsterId, attackId, skillId, clientTimeMs: Date.now() })` instead of applying monster damage locally.
9. On host receipt of `hit_intent`, provide `resolveHitIntent` to `applyCoopMessage` so host computes damage from authoritative combat stats, applies HP/death, and sends returned `outgoing` settlement events through `coopChannel.send(...)`.
10. On `monster_died` effects, trigger the existing death animation/reward hooks locally. Keep loot/pickup per-player independent; do not add ownership arbitration.
11. Drop stale state effects silently in normal gameplay; optionally log them behind a debug flag.
12. Do not support reconnect, lag compensation, spectating, anti-cheat, or mid-session join in this demo pass.

## 6. Files Created or Touched

Created:

- `game/src/systems/coopSync.ts`
- `game/src/net/coopChannel.ts`
- `game/tests/coopSync.test.ts`
- `game/tests/coopChannel.test.ts`
- `social-server/test/ws-relay.test.ts`
- `tasks/coop-sync-report.md`

Not touched:

- `social-server/src/`
- `game/src/scenes/`
- BattleScene files

## Commit Checklist

Git staging failed in this sandbox:

```text
fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted
```

Run these commands outside the sandbox, in order:

```bash
git add game/src/systems/coopSync.ts game/tests/coopSync.test.ts
git commit -m "Add coop combat sync logic"

git add game/src/net/coopChannel.ts game/tests/coopChannel.test.ts
git commit -m "Add coop transport channel adapter"

git add social-server/test/ws-relay.test.ts
git commit -m "Cover social websocket state event relay"

git add tasks/coop-sync-report.md
git commit -m "Document coop sync protocol and verification"
```
