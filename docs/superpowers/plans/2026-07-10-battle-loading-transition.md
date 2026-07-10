# Battle Loading Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black battle preload window with a visible thinking-style loading transition for both solo and co-op entry.

**Architecture:** A dedicated `BattleLoadingScene` uses level-specific key art preloaded by the world map/lobby, launches `BattleScene` behind itself, observes the real Battle loader progress, and exits only after an explicit Battle ready event. Existing battle payloads are passed through unchanged.

**Tech Stack:** TypeScript, Phaser 4 scenes/events/loader, Vitest source-wiring tests, Playwright browser acceptance.

---

### Task 1: Define the loading scene contract

**Files:**
- Create: `game/src/scenes/BattleLoadingScene.ts`
- Modify: `game/src/scenes/shellShared.ts`
- Test: `game/tests/battleLoadingScene.test.ts`

- [ ] **Step 1: Write failing tests** for level-label mapping, progress clamping, and the explicit `battle-ready` event constant.
- [ ] **Step 2: Run** `npm test -- --run tests/battleLoadingScene.test.ts` and confirm the missing module fails.
- [x] **Step 3: Implement** a full-bleed, home-page-matched poster scene that renders title/context/status/progress UI, subscribes to Battle loader progress, launches Battle with the supplied payload, brings itself to top, and removes all listeners on shutdown.
- [ ] **Step 4: Run** `npm test -- --run tests/battleLoadingScene.test.ts` and confirm all tests pass.

### Task 2: Route solo and co-op entry through the transition

**Files:**
- Modify: `game/src/main.ts`
- Modify: `game/src/scenes/WorldMapScene.ts`
- Modify: `game/src/scenes/LobbyScene.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Test: `game/tests/battleLoadingWiring.test.ts`

- [ ] **Step 1: Write failing source-wiring tests** proving both entry points start `SCENE.battleLoading`, the original `campaignIndex`/`coopSession` payload is nested as `battleData`, `BattleLoadingScene` is registered before Battle, and Battle emits ready at the end of `create()`.
- [ ] **Step 2: Run** `npm test -- --run tests/battleLoadingWiring.test.ts` and confirm the direct `SCENE.battle` calls fail expectations.
- [ ] **Step 3: Implement** the two routed entry points, scene registration, and ready event emission without changing direct debug Battle boot behavior.
- [ ] **Step 4: Run** `npm test -- --run tests/battleLoadingScene.test.ts tests/battleLoadingWiring.test.ts` and `npx tsc --noEmit`.

### Task 3: Browser acceptance and delivery

**Files:**
- Create (untracked): `tmp/playtest-battle-loading.mjs`

- [ ] **Step 1: Delay one Battle-only asset request** with Playwright routing, enter L1, and capture a screenshot while `battleLoading` is active.
- [ ] **Step 2: Assert** the loading hook reports a progress value in `0..1`, the screenshot is nonblank, and the text includes `天庭推演中` plus the level name.
- [ ] **Step 3: Release the delayed request**, wait for `__worldState`, assert the loading scene is inactive, and collect console/page errors.
- [ ] **Step 4: Run** the full game tests, typecheck, production build, then commit the implementation and update the deployed static bundle.
