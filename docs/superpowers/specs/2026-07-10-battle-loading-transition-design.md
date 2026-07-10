# Battle Loading Transition Design

## Problem

`WorldMapScene` and `LobbyScene` currently call `scene.start('battle')` directly. The source scene disappears immediately, while `BattleScene.preload()` loads the full battle asset set before its first rendered frame. Players see only the canvas background and can reasonably assume the game has stalled.

## Chosen Design

Add a zero-asset `BattleLoadingScene`. Both battle entry points start this scene with the original battle payload. It draws an immediate warm-ink backdrop, the selected level name, `天庭推演中`, a rotating thinking line, and a real loader progress bar. It then launches `BattleScene` behind itself and stays above it until battle initialization is complete.

`BattleScene` emits an explicit ready event at the end of `create()`. The loading scene owns and removes its loader/ready listeners on shutdown, then stops itself after the ready event. Direct debug launches of `BattleScene` remain valid because stopping an inactive loading scene is a no-op.

## Visual Behavior

- Full-canvas warm ink backdrop using the existing `drawInkBackdrop()` helper, with no new image dependency.
- Brush-font title `天庭推演中`.
- Context line `正在推演九重天` or `正在推演天宫道`.
- Three-dot thinking animation and rotating short status text.
- A restrained gold progress track driven by Phaser loader progress, never a fake percentage.

## Data Flow

1. World map or lobby starts `battleLoading` with `{ battleData }`.
2. Loading scene subscribes to the Battle loader, launches Battle with the unmodified payload, and stays topmost.
3. Battle preloads and initializes normally.
4. Battle emits `battle-ready` after HUD, save state, input, and co-op synchronization are initialized.
5. Loading scene removes itself, revealing the ready battle frame.

## Failure Handling

Loader progress is clamped to `0..1`. Repeated scene entries replace old listeners during shutdown. Asset load errors do not remove the status layer; Phaser can continue its existing fallback behavior while the player still sees an active loading state.

## Verification

- Unit/source-wiring tests cover payload preservation, both entry paths, ready-event cleanup, and progress clamping.
- A Playwright route-delay test confirms the loading canvas is nonblank while a battle asset is delayed, then disappears after Battle is ready with no console errors.

## Deferred

Battle assets are still loaded as one large pack, including inactive L3/L4 art. Per-level asset splitting is a performance follow-up, not part of this interaction fix.
