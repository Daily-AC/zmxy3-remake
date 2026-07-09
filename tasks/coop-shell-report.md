# Coop Shell Report

## Built

- Added `game/src/net/socialClient.ts` with:
  - REST auth/session/room calls using injectable `fetch`.
  - In-memory session mirrored to `localStorage` key `zmxy.social.session`.
  - Pure `encodeClient` / `decodeServer` lobby WS codec with runtime shape validation.
  - `SocialRoomConnection` with injectable socket factory and no auto-reconnect.
  - URL helpers for social REST/WS derivation.
- Added `LoginScene`:
  - Register/login modes.
  - Phaser DOM username/password inputs.
  - Stored-session skip straight to the lobby.
  - Toast-only error reporting.
- Added `LobbyScene`:
  - Room select mode: L1/L2 create, room-id paste/join.
  - In-room mode: member list, local ready toggle, owner-only start gating.
  - Pure reducer/selectors for room-state tests.
  - `game_start` starts `BattleScene` with `{ campaignIndex, coopSession }`.
- Wired `SCENE.coopLogin`, `SCENE.coopLobby`, `main.ts` scene registration, and a main-menu `联机共斗` entry.
- Added the BattleScene COOP-SEAM only: it accepts and stores `coopSession`; no combat behavior branches on it.

## CoopSession Shape

```ts
export interface CoopSession {
  roomId: string
  levelId: 'L1' | 'L2'
  myUserId: string
  hostUserId: string
  isHost: boolean
  peers: Array<{ userId: string; username: string }>
}
```

`BattleScene` stores this on `protected coopSession: CoopSession | null = null`. I used `protected` instead of `private` because this repo has `noUnusedLocals: true`; a private store-only field fails `tsc` unless it is read somewhere, and the brief explicitly says not to read/use it yet.

## URL Resolution

`resolveSocialServerBaseUrl(search, env)` returns one base URL:

1. `?socialServer=<base>` query param.
2. `VITE_SOCIAL_SERVER_URL` passed by the scene through `import.meta.env`.
3. Default `https://zm-dev.qmledmq.cn:8443/social`.

From that base:

- REST: `socialRestUrl(base, path)` appends the path to the base as-is.
- WS: `socialWsUrl(base)` converts `http -> ws` / `https -> wss` and appends `/ws`.

Examples covered by tests:

- `http://localhost:7100` -> `http://localhost:7100/auth/register`, `ws://localhost:7100/ws`
- `https://zm-dev.qmledmq.cn:8443/social` -> `https://zm-dev.qmledmq.cn:8443/social/auth/register`, `wss://zm-dev.qmledmq.cn:8443/social/ws`

## Verification

Commands run:

```sh
cd game && npx vitest run
```

Result:

```text
Test Files  56 passed (56)
Tests  575 passed | 1 skipped (576)
```

```sh
cd game && npx tsc --noEmit
```

Result: clean, no output.

```sh
cd game && npm run build
```

Result:

```text
104 modules transformed.
dist/index.html                    0.52 kB
dist/assets/index-BZwFyrFS.js  2,057.57 kB
built in 1.77s
```

Vite emitted the pre-existing large chunk warning.

## Screen-flow change (2026-07-09, dispatched mid-task by 主会话)

After the section above landed, the user re-pinned the screen flow: **启动 →
LoginScene（通关文牒）→ 选人 → 直进世界地图**, cutting the old main-menu item
list and SlotSelectScene entirely for the hackathon, and moving the lobby's
entry point from the main menu to a button on the world map. The wrapper
(this pass, done directly rather than re-dispatched to Codex since it's
routing/wiring, not new logic) implemented that on top of the socialClient/
LoginScene/LobbyScene work above, which stayed functionally intact:

- `MainMenuScene.ts` rewritten to a minimal shell: keeps the key-art
  backdrop, drops every menu item (including the `联机共斗` entry this task
  originally added there), and auto-forwards to `SCENE.coopLogin` (600ms
  timer, or immediately on click/Enter). Every existing "return to main
  menu" call site elsewhere (WorldMapScene save-and-quit, SkillTreeScene
  back button, CharacterSelectScene 返回主菜单) needed zero changes -- they
  all already land here and now get bounced straight back through the login
  gate, which is the correct behavior for a login-gated flow.
- `LoginScene.enterGame()` (new): replaces the old "always go to
  `SCENE.coopLobby`" post-login/already-logged-in behavior. Replicates
  `SlotSelectScene`'s per-slot decision for the fixed slot 0 (read slot 0;
  occupied -> set the same registry keys `SlotSelectScene.continueGame`
  would and go straight to `SCENE.worldMap`; empty -> `SCENE.characterSelect`
  with `{slot: 0}`, same as `SlotSelectScene.startNewGame`). SlotSelectScene's
  own code is untouched and still registered in `main.ts` -- just bypassed.
- `CharacterSelectScene.ts`: its ESC handler pointed at
  `SCENE.slotSelect`, now dead since that scene is bypassed -- changed to
  `SCENE.mainMenu` to match the existing "返回主菜单" button right below it.
- `WorldMapScene.ts`: added a `联机共斗` button (plain `MenuButton`, no vendor
  texture/coordinate exists for this since it's a hackathon-only feature;
  placed top-right, clear of the vendor bottom bar and campaign nodes) that
  calls a new `goToLobby()` (disposes the NPC client, `scene.start(SCENE.
  coopLobby)`, same pattern as the existing `goToMainMenu()`).
- `LobbyScene.ts`: added a `返回地图` button next to `退出登录` in room-select
  mode (`backToMap()` -> `scene.start(SCENE.worldMap)`, no session change --
  WorldMapScene reads its slot from the registry, which is still set).
- Acceptance-test hooks added to `WorldMapScene` (`__shellGoToLobby`) and
  `LobbyScene` (`__shellLobbyState/CreateRoom/JoinRoom/ToggleReady/Start/
  BackToMap/Logout`), matching the `window.__shell*` convention every other
  shell scene already uses -- this is what made the real two-tab browser
  verification below possible without fighting canvas pixel coordinates.

## Real backend/CORS bug found and fixed during verification

Local browser verification (below) initially failed at the very first
`POST /auth/register` call with a **CORS** error: `social-server` sets zero
`Access-Control-Allow-*` headers, so no browser page can complete
register/login against it from a different origin. This isn't a local-only
artifact -- it's exactly how the real deployment is shaped (game frontend on
`zaixu.qmledmq.cn`, this API on `zm-dev.qmledmq.cn:8443/social`, different
origins), so **the deployed social-server currently cannot serve any real
browser client at all**, not just this local test. The social-deploy e2e/
loadtest scripts never caught this because they're Node scripts, and CORS is
a browser-only enforcement.

Fixed with a small middleware in `social-server/src/server.ts` (right after
`express.json()`): sets `Access-Control-Allow-Origin: *` (safe here -- auth
is a bearer token in the `Authorization` header, not a cookie, so there's no
credentialed-CORS/CSRF concern that would call for echoing a specific
origin instead) plus `Allow-Methods`/`Allow-Headers`, and short-circuits
`OPTIONS` preflight with 204. Verified: `social-server`'s own `npm run
test:unit` (41/41) and `npm run test:e2e` still pass after the change, and
the browser flow below only started working once this landed.

**This needs to be redeployed to the live `zm-dev.qmledmq.cn` social-server**
(WSL systemd unit `zmxy-social`) for the feature to work for real players --
flagging for 主会话/用户 since redeploying a shared production service is a
甲方-level call, not something to do unilaterally from here.

## Full local two-tab browser verification (real, not blocked)

The earlier "blocked manual verification" was Codex's own execution
sandbox (no listening sockets, no `.git` writes) -- expected for that
runtime, not a real blocker. Redone here directly (outside that sandbox):

1. `cd social-server && JWT_SECRET=dev-local-secret SOCIAL_SERVER_PORT=7100 SOCIAL_DB_PATH=:memory: npx tsx src/server.ts`
2. `cd game && npx vite --port 5180`
3. Two independent, verified-isolated browser tabs (Playwright; confirmed
   isolation with a `window.__marker` probe after this shared browser
   environment showed a stray unrelated tab and one contaminated "new tab"
   reuse -- closed and retried clean) against
   `http://localhost:5180/?socialServer=http://localhost:7100`:
   - Tab A: registered `coopA` -> auto-landed on CharacterSelectScene (slot 0
     empty) -> `开始游戏` -> WorldMapScene -> `联机共斗` -> created an L1 room
     (`3a8013af`).
   - Tab B: registered `coopB` -> same auto-route to CharacterSelectScene ->
     WorldMapScene -> `联机共斗` -> joined room `3a8013af` by ID.
   - Tab A's room view updated in real time (WS `member_joined`) to show
     `coopB` without any reload.
   - Both readied up (`准备`), each tab's UI reflected the other's ready
     state in real time (`ready_changed`).
   - Tab A (host) clicked `开始`; both tabs received `game_start` and landed
     in `BattleScene` (L1) independently -- confirmed by screenshot, not
     just scene-key state.
4. `cd game && npx vitest run` -> 56 files, 575 passed / 1 skipped (green,
   same as before the flow-change edits).
5. `cd game && npx tsc --noEmit` -> clean.

Screenshots (`tmp/coop-shell-evidence/`): `01-tabA-mainmenu.png` through
`11-tabB-battle-L1.png`, in flow order, including the CORS-fixed
registration, the real-time room-state sync in both directions, and both
tabs' independent `BattleScene` L1 entry.

## Git / Commit Status

Committed directly (outside Codex's execution sandbox, which cannot write
`.git` or open listening sockets -- see above). One commit per logical
file/group, not squashed, not pushed:

```
dcbb2ae feat(coop-shell): social REST+WS client (login/register/rooms)
813a61a feat(coop-shell): add LoginScene (register/login gate)
3ecf9f9 feat(coop-shell): add LobbyScene (create/join/ready/start)
519f51f feat(coop-shell): register coop scene keys and Phaser scenes
359a436 feat(coop-shell): login-first screen flow (2026-07-09 用户拍板)
f37aaf0 feat(coop-shell): BattleScene COOP-SEAM (accept coopSession, store only)
aefb532 fix(social-server): add CORS headers, blocking every browser client
4d962d5 feat(coop-shell): add 联机共斗 lobby entry point to world map
```

Note on commit order: `4d962d5` (the WorldMapScene lobby button) was
committed earlier in the sequence, via a hand-built patch, because
`WorldMapScene.ts` had another workstream's (furnace-recipe) uncommitted
changes mixed into the same working-tree file. Used a HEAD-based copy +
my known 4 edits + `git apply --cached` to stage and commit *only* my
hunks, leaving furnace-recipe's own changes untouched and unstaged in the
working tree for their own commit -- verified before and after that the
staged diff was exactly mine and the remaining unstaged diff was exactly
theirs. `BattleScene.ts` needed no such surgery: its only diff was this
task's COOP-SEAM, cleanly isolated already.

## Backend Protocol Notes

- `social-server/README.md` says auth returns `{token, user}` and the task summary included `createdAt`, but `social-server/src/auth.ts` currently returns `PublicUser = {id, username}`. The client accepts `createdAt` as optional.
- `ws-server.ts` treats socket close as room leave. This is fine for this lobby-only milestone, but the future combat-sync milestone will need an explicit socket/room lifetime decision if battle networking must remain attached after leaving `LobbyScene`.

## Files Touched By This Task

- `game/src/net/socialClient.ts`
- `game/src/scenes/LoginScene.ts` (+ `enterGame()` slot-0 auto-routing, 2026-07-09 flow change)
- `game/src/scenes/LobbyScene.ts` (+ `返回地图` button, acceptance hooks, 2026-07-09 flow change)
- `game/src/scenes/MainMenuScene.ts` (rewritten to a login-forwarding shell, 2026-07-09 flow change)
- `game/src/scenes/CharacterSelectScene.ts` (ESC target fix, 2026-07-09 flow change)
- `game/src/scenes/WorldMapScene.ts` (+ `联机共斗` entry button/hook, 2026-07-09 flow change -- only this task's addition; unrelated furnace-recipe changes in this file are a parallel workstream's, not mine)
- `game/src/scenes/shellShared.ts`
- `game/src/main.ts`
- `game/src/scenes/BattleScene.ts` (COOP-SEAM only, ≤10 lines)
- `social-server/src/server.ts` (CORS fix, see above -- outside this task's original client-only boundary, but essential/blocking; flagged rather than silently done)
- `game/tests/socialClient.test.ts`
- `game/tests/lobbyRoomState.test.ts`
- `tasks/coop-shell-report.md`

The worktree also contains unrelated pre-existing/parallel dirty files (coop-sync's `coopSync.ts`/`coopChannel.ts`, furnace-recipe's files, fidelity-b visual assets, agent-server changes, etc.) under other tasks' ownership. Those are not part of this task's commits below.
