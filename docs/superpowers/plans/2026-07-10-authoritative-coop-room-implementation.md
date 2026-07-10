# Authoritative Coop, Reconnect, Lobby, Sharing, and Minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every coop client play the same authoritative battle, allow all players to damage monsters and claim drops, distribute soul/experience by damage, support 60-second reconnect and host migration, and ship a usable room lobby, sharing flow, manual exit, and teammate minimap.

**Architecture:** A serializable Phaser-independent BattleWorldState is authoritative on the room host. Peers send input frames, predict only their own hero, and reconcile against host snapshots. The social server owns membership, presence, authority epochs, reconnect deadlines, and message routing; it does not simulate combat.

**Tech Stack:** TypeScript, Phaser 4, Vitest, Express 5, ws, Node test runner, real two-client browser E2E.

---

### Task 1: Add deterministic RNG and proportional reward allocation

**Files:**
- Create: `game/src/systems/deterministicRng.ts`
- Create: `game/tests/deterministicRng.test.ts`
- Create: `game/src/systems/rewardAllocation.ts`
- Create: `game/tests/rewardAllocation.test.ts`

- [ ] **Step 1: Write failing deterministic tests**

```ts
it('replays the same random sequence from the same state', () => {
  const a = createRng(12345)
  const b = createRng(12345)
  expect([nextFloat(a), nextFloat(a), nextFloat(a)]).toEqual([nextFloat(b), nextFloat(b), nextFloat(b)])
  expect(a.state).toBe(b.state)
})

it('uses effective damage and largest remainder allocation', () => {
  expect(allocateByDamage(10, { a: 60, b: 30, c: 10 })).toEqual({ a: 6, b: 3, c: 1 })
  expect(allocateByDamage(2, { a: 1, b: 1, c: 1 })).toEqual({ a: 1, b: 1, c: 0 })
  expect(effectiveDamage(50, 20)).toBe(20)
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/deterministicRng.test.ts tests/rewardAllocation.test.ts
```

- [ ] **Step 3: Implement pure helpers**

Use a serializable 32-bit PRNG state. `allocateByDamage` sorts equal remainders by stable userId so all clients produce identical integer grants. Ignore zero/negative damage entries and guarantee the output sum equals the total.

- [ ] **Step 4: Run tests**

Expected: deterministic and allocation suites PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/deterministicRng.ts game/tests/deterministicRng.test.ts game/src/systems/rewardAllocation.ts game/tests/rewardAllocation.test.ts
git commit -m "feat: add deterministic coop reward math"
```

### Task 2: Define and step a serializable BattleWorldState

**Files:**
- Create: `game/src/systems/battleWorld.ts`
- Create: `game/tests/battleWorld.test.ts`
- Modify: `game/src/systems/heroSim.ts`
- Modify: `game/src/systems/monsterSim.ts`
- Modify: `game/src/systems/levelPrefabRuntime.ts`

- [ ] **Step 1: Write failing world-state tests**

```ts
it('serializes and resumes without changing the next tick', () => {
  const original = createBattleWorld(fixtureOptions())
  stepBattleWorld(original, fixtureInputs(), TICK_MS)
  const resumed = decodeBattleWorld(JSON.parse(JSON.stringify(original)))
  expect(stepBattleWorld(resumed, fixtureInputs(), TICK_MS)).toEqual(
    stepBattleWorld(structuredClone(original), fixtureInputs(), TICK_MS),
  )
})

it('creates the same stable monster ids on every replay', () => {
  const a = runToFirstStopPoint(createBattleWorld(fixtureOptions()))
  const b = runToFirstStopPoint(createBattleWorld(fixtureOptions()))
  expect(Object.keys(a.monsters)).toEqual(Object.keys(b.monsters))
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/battleWorld.test.ts
```

- [ ] **Step 3: Implement the world reducer**

Define:

```ts
export interface BattleWorldState {
  protocolVersion: 2
  authorityEpoch: number
  tick: number
  rngState: number
  level: LevelRuntimeState
  heroes: Record<string, HeroRuntimeState>
  monsters: Record<string, MonsterRuntimeState>
  projectiles: Record<string, ProjectileRuntimeState>
  drops: Record<string, DropRuntimeState>
  damageLedgers: Record<string, Record<string, number>>
  pendingRewards: Record<string, RewardGrant[]>
  nextEventSeq: number
}
```

`stepBattleWorld` consumes input frames, advances all entities, resolves AttackSpec overlap, updates damage ledgers, rolls drops from deterministic RNG, and returns reliable world events. It contains no Phaser objects, Date.now, Math.random, WebSocket, or localStorage access.

- [ ] **Step 4: Run world and existing simulation tests**

```bash
cd game
npx vitest run tests/battleWorld.test.ts tests/heroSim.test.ts tests/monsterSim.test.ts tests/levelPrefabRuntime.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/battleWorld.ts game/tests/battleWorld.test.ts game/src/systems/heroSim.ts game/src/systems/monsterSim.ts game/src/systems/levelPrefabRuntime.ts
git commit -m "refactor: centralize combat in a serializable world"
```

### Task 3: Replace coopSync v1 with protocol v2 input, snapshot, and event codecs

**Files:**
- Create: `game/src/net/coopProtocol.ts`
- Create: `game/tests/coopProtocol.test.ts`
- Modify: `game/src/systems/coopSync.ts`
- Modify: `game/tests/coopSync.test.ts`
- Modify: `social-server/src/ws-protocol.ts`
- Modify: `social-server/test/ws-relay.test.ts`

- [ ] **Step 1: Write failing codec tests**

```ts
const frames: CoopMessage[] = [
  { type: 'input_frame', authorityEpoch: 3, seq: 9, clientTick: 100, held: { left: false, right: true }, pressed: { jump: false, attack: true, skills: [] } },
  { type: 'world_delta', authorityEpoch: 3, tick: 102, baseTick: 100, patch: fixturePatch() },
  { type: 'world_checkpoint', authorityEpoch: 3, tick: 120, hash: 'abc', world: fixtureWorld() },
  { type: 'world_event', authorityEpoch: 3, event: fixtureRewardEvent() },
]
for (const frame of frames) expect(decodeCoopMessage(encodeCoopMessage(frame))).toEqual(frame)
```

Add rejection tests for old protocol versions, missing epoch/tick, client-supplied damage, and non-host world state.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/coopProtocol.test.ts tests/coopSync.test.ts
```

- [ ] **Step 3: Implement protocol v2**

Client-to-host frames contain input only. Host-to-room frames contain deltas, checkpoints, and reliable events. Include `authorityEpoch` in every battle frame. Keep the social server payload generic but add runtime validation for maximum payload size and required outer fields.

- [ ] **Step 4: Run game and server codec tests**

```bash
cd game
npx vitest run tests/coopProtocol.test.ts tests/coopSync.test.ts
cd ../social-server
node --import tsx --test --test-name-pattern='relay' test/ws-relay.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add game/src/net/coopProtocol.ts game/tests/coopProtocol.test.ts game/src/systems/coopSync.ts game/tests/coopSync.test.ts social-server/src/ws-protocol.ts social-server/test/ws-relay.test.ts
git commit -m "feat: define authoritative coop protocol v2"
```

### Task 4: Separate room membership from connection presence

**Files:**
- Modify: `social-server/src/rooms.ts`
- Modify: `social-server/test/rooms.test.ts`
- Modify: `social-server/src/ws-protocol.ts`
- Modify: `game/src/net/socialClient.ts`
- Modify: `game/tests/socialClient.test.ts`

- [ ] **Step 1: Write failing presence tests**

```ts
test('unexpected disconnect reserves membership for 60 seconds', () => {
  const room = manager.create('L1', member('owner'))
  manager.markDisconnected(room.id, 'owner', 1_000)
  expect(manager.get(room.id)?.members[0]).toMatchObject({ connected: false, reconnectDeadline: 61_000 })
  manager.expireDisconnected(60_999)
  expect(manager.get(room.id)?.members).toHaveLength(1)
  manager.expireDisconnected(61_000)
  expect(manager.get(room.id)).toBeNull()
})

test('explicit leave removes membership immediately', () => {
  const room = manager.create('L1', member('owner'))
  manager.leave(room.id, 'owner')
  expect(manager.get(room.id)).toBeNull()
})
```

- [ ] **Step 2: Verify failure**

```bash
cd social-server
node --import tsx --test --test-name-pattern='disconnect|leave' test/rooms.test.ts
```

- [ ] **Step 3: Implement presence fields**

Extend members with:

```ts
connected: boolean
joinedAt: number
reconnectDeadline?: number
```

WebSocket close calls `markDisconnected`; only `leave` calls `leave`. A successful join frame from an existing reserved member calls `markConnected` and clears the deadline. Room snapshots expose presence and remaining deadline.

- [ ] **Step 4: Run room and client tests**

```bash
cd social-server
npm run test:unit
cd ../game
npx vitest run tests/socialClient.test.ts tests/lobbyRoomState.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add social-server/src/rooms.ts social-server/test/rooms.test.ts social-server/src/ws-protocol.ts game/src/net/socialClient.ts game/tests/socialClient.test.ts
git commit -m "feat: reserve coop membership during reconnect"
```

### Task 5: Implement authority pause, epoch, and host migration

**Files:**
- Create: `social-server/src/authority.ts`
- Create: `social-server/test/authority.test.ts`
- Modify: `social-server/src/rooms.ts`
- Modify: `social-server/src/ws-server.ts`
- Modify: `social-server/src/ws-protocol.ts`
- Create: `game/src/systems/authorityRecovery.ts`
- Create: `game/tests/authorityRecovery.test.ts`

- [ ] **Step 1: Write failing election tests**

```ts
test('pauses on host disconnect and elects the earliest joined online member after 60 seconds', () => {
  const state = authorityFixture({ host: 'a', online: ['b', 'c'], joinedAt: { b: 20, c: 30 } })
  expect(onHostDisconnected(state, 1_000)).toMatchObject({ paused: true, migrationAt: 61_000 })
  expect(expireAuthority(state, 61_000)).toMatchObject({ hostUserId: 'b', authorityEpoch: 2, paused: false })
})
```

Add tests for host returning at 59,999ms, old-host late return after migration, no online successor, and stale epoch rejection.

- [ ] **Step 2: Verify failure**

```bash
cd social-server
node --import tsx --test --test-name-pattern='authority' test/authority.test.ts
cd ../game
npx vitest run tests/authorityRecovery.test.ts
```

- [ ] **Step 3: Implement server authority state**

Each room stores `hostUserId`, `authorityEpoch`, `authorityPaused`, and `migrationAt`. On host disconnect, broadcast `authority_paused`. On return before expiry, broadcast `authority_resumed`. On expiry, elect the lowest `joinedAt` connected member, increment epoch, and broadcast `authority_granted`.

Clients cache the latest three checkpoints by tick/hash. The new host restores the highest valid checkpoint, broadcasts `checkpoint_offer`, and accepts a same-tick checkpoint from another peer if its local cache lacks it.

- [ ] **Step 4: Run tests**

Expected: election and epoch tests PASS; old epoch frames are ignored.

- [ ] **Step 5: Commit**

```bash
git add social-server/src/authority.ts social-server/test/authority.test.ts social-server/src/rooms.ts social-server/src/ws-server.ts social-server/src/ws-protocol.ts game/src/systems/authorityRecovery.ts game/tests/authorityRecovery.test.ts
git commit -m "feat: migrate coop authority after reconnect timeout"
```

### Task 6: Build the host world runner and peer prediction controller

**Files:**
- Create: `game/src/systems/coopWorldRunner.ts`
- Create: `game/tests/coopWorldRunner.test.ts`
- Create: `game/src/systems/localPrediction.ts`
- Create: `game/tests/localPrediction.test.ts`
- Modify: `game/src/net/coopChannel.ts`

- [ ] **Step 1: Write failing runner tests**

```ts
it('lets peer input damage a host-owned monster', () => {
  const runner = createHostRunner(fixtureWorld())
  runner.receiveInput('peer', attackInput(1))
  runner.step(TICK_MS)
  expect(runner.world.monsters['m1'].hp).toBeLessThan(runner.world.monsters['m1'].maxHp)
  expect(runner.events.some((event) => event.type === 'combat_hit' && event.attackerUserId === 'peer')).toBe(true)
})
```

Add tests for input seq dedup, 10Hz deltas, 2-second checkpoints, prediction reconciliation under small/large error, and pause during authority recovery.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/coopWorldRunner.test.ts tests/localPrediction.test.ts
```

- [ ] **Step 3: Implement host and peer controllers**

Host runner buffers latest held state plus ordered pressed edges per user, steps BattleWorldState at fixed tick, emits deltas every three ticks and checkpoints every 60 ticks. Peer prediction stores unacknowledged input frames, reapplies them after confirmed snapshots, smooths errors under 12px, and snaps larger errors.

- [ ] **Step 4: Run tests**

Expected: host runner and reconciliation suites PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/coopWorldRunner.ts game/tests/coopWorldRunner.test.ts game/src/systems/localPrediction.ts game/tests/localPrediction.test.ts game/src/net/coopChannel.ts
git commit -m "feat: run host-authoritative coop simulation"
```

### Task 7: Replace BattleScene's parallel local coop simulation

**Files:**
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/tests/battleSceneCoopIntegration.test.ts`
- Modify: `game/tests/battleVisualRegression.test.ts`

- [ ] **Step 1: Write failing integration assertions**

Update source-contract tests to require:

```ts
expect(source).toContain('createHostRunner')
expect(source).toContain('createPeerPrediction')
expect(source).not.toContain('applyRemoteMonsterSnapshots(delta)')
expect(source).not.toContain('coopNextMonsterId')
```

Add a pure scene-adapter test that applies one host snapshot containing a monster absent locally and asserts the renderer creates it by stable entity ID.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/battleSceneCoopIntegration.test.ts
```

- [ ] **Step 3: Rewire BattleScene**

Single-player constructs a local host runner without network transport. Coop host constructs the same runner plus CoopChannel. Coop peer never starts a local level or spawns local monsters; it waits for the first checkpoint, then renders entities from world state. Remove `coopMonsterIds`, `coopNextMonsterId`, hit intents containing damage, and per-client drop spawning.

- [ ] **Step 4: Run integration tests**

```bash
cd game
npx vitest run tests/battleSceneCoopIntegration.test.ts tests/battleWorld.test.ts tests/coopWorldRunner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add game/src/scenes/BattleScene.ts game/tests/battleSceneCoopIntegration.test.ts game/tests/battleVisualRegression.test.ts
git commit -m "refactor: render coop from the authoritative world"
```

### Task 8: Arbitrate shared drops and grant damage-based rewards

**Files:**
- Modify: `game/src/systems/battleWorld.ts`
- Create: `game/tests/coopRewards.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/src/systems/autosave.ts`

- [ ] **Step 1: Write failing reward tests**

```ts
it('awards one contested item to the first authoritative pickup and splits exp/soul by damage', () => {
  const world = rewardFixture({ damage: { host: 70, peer: 30 }, exp: 11, soul: 7 })
  killMonster(world, 'm1')
  expect(world.pendingRewards.host).toEqual(expect.arrayContaining([{ kind: 'exp', amount: 8 }, { kind: 'soul', amount: 5 }]))
  expect(world.pendingRewards.peer).toEqual(expect.arrayContaining([{ kind: 'exp', amount: 3 }, { kind: 'soul', amount: 2 }]))
  expect(claimDrop(world, 'drop1', 'peer', 100).claimedByUserId).toBe('peer')
  expect(claimDrop(world, 'drop1', 'host', 101).ok).toBe(false)
})
```

Add tests for overkill clipping, disconnected reserved members, manual leavers with prior damage, event replay idempotence, and no-damage spectators.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/coopRewards.test.ts
```

- [ ] **Step 3: Implement authoritative rewards**

On damage, record effective damage. On death, allocate source exp and soul once and emit `reward_granted` events. Item/material/medicine drops remain world entities; the first host tick with an eligible hero in range atomically sets `claimedByUserId`. BattleScene writes personal save data only after applying a new authoritative eventId.

- [ ] **Step 4: Run tests**

Expected: reward and autosave suites PASS; repeated events do not duplicate items or currency.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/battleWorld.ts game/tests/coopRewards.test.ts game/src/scenes/BattleScene.ts game/src/systems/autosave.ts
git commit -m "feat: arbitrate coop drops and shared rewards"
```

### Task 9: Add public room listing and room sharing

**Files:**
- Modify: `social-server/src/server.ts`
- Modify: `social-server/src/rooms.ts`
- Create: `social-server/test/room-list.test.ts`
- Modify: `game/src/net/socialClient.ts`
- Modify: `game/tests/socialClient.test.ts`
- Modify: `game/src/scenes/LobbyScene.ts`
- Modify: `game/tests/lobbyRoomState.test.ts`
- Create: `game/src/systems/roomShare.ts`
- Create: `game/tests/roomShare.test.ts`

- [ ] **Step 1: Write failing API and share tests**

```ts
test('listWaiting returns waiting rooms only', () => {
  const waiting = manager.create('L1', { userId: 'alice', username: 'alice' })
  const started = manager.create('L2', { userId: 'bob', username: 'bob', ready: true })
  manager.start(started.id)
  assert.deepEqual(manager.listWaiting().map((room) => room.id), [waiting.id])
})

it('builds a share link and falls back to clipboard', async () => {
  expect(roomShareUrl('https://zaixu.qmledmq.cn:8443/', 'abc123')).toBe('https://zaixu.qmledmq.cn:8443/?room=abc123')
})
```

- [ ] **Step 2: Verify failure**

```bash
cd social-server
node --import tsx --test --test-name-pattern='listWaiting' test/room-list.test.ts
cd ../game
npx vitest run tests/socialClient.test.ts tests/lobbyRoomState.test.ts tests/roomShare.test.ts
```

- [ ] **Step 3: Implement list, filters, and share**

Add authenticated `GET /rooms?levelId=L1` returning waiting rooms with capacity and presence. LobbyScene renders a refreshable room table and retains direct ID join. Share uses `navigator.share` when available and `navigator.clipboard.writeText` otherwise. Query parameter `room` prefills the join field but requires an explicit join click.

- [ ] **Step 4: Run tests**

Expected: room list and share tests PASS.

- [ ] **Step 5: Commit**

```bash
git add social-server/src/server.ts social-server/src/rooms.ts social-server/test/room-list.test.ts game/src/net/socialClient.ts game/tests/socialClient.test.ts game/src/scenes/LobbyScene.ts game/tests/lobbyRoomState.test.ts game/src/systems/roomShare.ts game/tests/roomShare.test.ts
git commit -m "feat: add coop room browser and sharing"
```

### Task 10: Add explicit in-game leave and reconnect UI

**Files:**
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/src/scenes/LobbyScene.ts`
- Create: `game/src/ui/hud/CoopStatusHud.ts`
- Create: `game/tests/coopStatus.test.ts`
- Modify: `game/tests/battleSceneCoopIntegration.test.ts`

- [ ] **Step 1: Write failing state-view tests**

```ts
expect(coopStatusView({ authorityPaused: true, reconnectRemainingMs: 43_100, isHost: false })).toEqual({
  title: '房主断线，战斗已暂停',
  detail: '等待重连 44 秒',
  canLeave: true,
})
```

Add tests for migrating, resumed, disconnected teammate, manual leave, and solo hidden state.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/coopStatus.test.ts tests/battleSceneCoopIntegration.test.ts
```

- [ ] **Step 3: Implement UI and leave flow**

The pause menu includes “退出队伍”. It sends explicit leave, flushes confirmed save data, disposes the socket without preservation, and opens LobbyScene in room-select mode. CoopStatusHud shows pause countdown and member presence without blocking the manual exit button.

- [ ] **Step 4: Run tests**

Expected: status and scene integration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add game/src/scenes/BattleScene.ts game/src/scenes/LobbyScene.ts game/src/ui/hud/CoopStatusHud.ts game/tests/coopStatus.test.ts game/tests/battleSceneCoopIntegration.test.ts
git commit -m "feat: support explicit coop leave and reconnect status"
```

### Task 11: Add a teammate-focused in-game minimap

**Files:**
- Create: `game/src/ui/hud/CoopMinimap.ts`
- Create: `game/tests/coopMinimap.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`

- [ ] **Step 1: Write failing projection tests**

```ts
expect(projectToMinimap({ x: 2450, y: 300 }, { left: 0, right: 4900, top: 0, bottom: 540 }, { width: 150, height: 54 })).toEqual({ x: 75, y: 30 })
```

Add vertical sl11 projection, clamp, disconnected teammate, self marker, and transfer target tests.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/coopMinimap.test.ts
```

- [ ] **Step 3: Implement the minimap**

Render a stable 170x72 top-right HUD with an inner 150x54 map. Show level bounds, self, teammates, disconnected teammate markers, and current transfer target. Do not show monsters or item drops. Use fixed dimensions so labels and marker updates cannot resize the HUD.

- [ ] **Step 4: Run tests and visual check**

Expected: projection tests PASS; the minimap does not overlap the centered Boss bar at 960x540 or mobile viewport.

- [ ] **Step 5: Commit**

```bash
git add game/src/ui/hud/CoopMinimap.ts game/tests/coopMinimap.test.ts game/src/scenes/BattleScene.ts
git commit -m "feat: add coop teammate minimap"
```

### Task 12: Run real two-client coop, reconnect, migration, and deployment verification

**Files:**
- Modify: `social-server/test/e2e-smoke.ts`
- Create: `game/tests/e2e/coop-authority.spec.ts`
- Create: `tasks/authoritative-coop-report.md`
- Modify only on defects: files from Tasks 1-11

- [ ] **Step 1: Extend real server E2E**

Add a scenario that registers two users, creates/joins a room, starts a game, relays input/checkpoint/event frames, disconnects the host, verifies paused state, reconnects inside 60 seconds, then repeats and advances fake server time to verify migration.

- [ ] **Step 2: Run unit and server E2E**

```bash
cd social-server
npm run typecheck
npm run test:unit
npm run test:e2e
```

Expected: all commands PASS against the real HTTP/WebSocket server and real SQLite response shapes.

- [ ] **Step 3: Run two browser contexts**

Use the game E2E script to verify:

```text
1. Both clients see identical level ID, tick, authority epoch, monster IDs, HP, drops, and portal state.
2. Peer attacks reduce host-owned monster HP and produce peer damage ledger entries.
3. One contested drop is granted exactly once.
4. Exp and soul totals equal original totals and match damage proportions.
5. Host disconnect pauses both views; reconnect resumes the same tick lineage.
6. Host timeout elects the peer and increments authority epoch.
7. Old host returns as peer without reviving old world state.
8. Manual leave removes the player immediately.
9. Lobby lists rooms, share link prefills ID, and minimap tracks teammates.
```

- [ ] **Step 4: Run final project verification**

```bash
cd game
npm test
npm run build
cd ../social-server
npm run typecheck
npm run test
cd ..
git diff --check
```

- [ ] **Step 5: Write evidence and commit**

Record exact commands, test counts, two-client state hashes, reconnect ticks, migration epoch, screenshots, and deployed URLs in `tasks/authoritative-coop-report.md`.

```bash
git add social-server/test/e2e-smoke.ts game/tests/e2e/coop-authority.spec.ts tasks/authoritative-coop-report.md
git commit -m "test: verify authoritative coop end to end"
```

- [ ] **Step 6: Deploy in compatible order**

Deploy social-server first with protocol v1 relay compatibility still accepted, verify `/health`, room list, and WebSocket join. Deploy the game frontend second, verify the production build hash and repeat a two-account smoke test on the public URL. Remove v1 compatibility only in a later release after all active rooms have expired.
