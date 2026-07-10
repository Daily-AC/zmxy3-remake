# Battle Loading Transition Design

## Problem

`WorldMapScene` and `LobbyScene` currently call `scene.start('battle')` directly. The source scene disappears immediately, while `BattleScene.preload()` loads the full battle asset set before its first rendered frame. Players see only the canvas background and can reasonably assume the game has stalled.

## Chosen Design

Add a `BattleLoadingScene`. Both battle entry points start this scene with the original battle payload. The world map and lobby preload one level-specific loading key art, so the transition can render immediately while `BattleScene` loads behind it. It shows the selected level name, `天庭推演中`, a rotating thinking line, and a real loader progress indicator, then stays above Battle until initialization is complete.

`BattleScene` emits an explicit ready event at the end of `create()`. The loading scene owns and removes its loader/ready listeners on shutdown, then stops itself after the ready event. Direct debug launches of `BattleScene` remain valid because stopping an inactive loading scene is a no-op.

## Visual Behavior

- Full-canvas cinematic key art generated in the same handcrafted plush-doll, fiery orange-gold visual language as the home page.
- L1 and L2 use distinct 九重天 / 天宫道 compositions while preserving the home page's fabric texture, character proportions, ember palette, and celestial architecture.
- Design DNA takes Lamborghini's full-bleed cinematic hierarchy and thin horizon progress line, but translates its black/gold restraint into the existing game's warm charcoal/fire-orange palette.
- Left-aligned brush-font title `天庭推演中`, with dark negative space reserved in the artwork rather than a floating panel.
- Context line `正在推演九重天` or `正在推演天宫道`.
- Three-dot thinking animation and rotating short status text.
- A sharp, two-pixel horizon track with an orange-gold fill and angular marker, driven by Phaser loader progress, never a fake percentage.
- No rounded cards, rounded progress bars, gradient UI surfaces, or centered text stack.

## Data Flow

1. World map or lobby starts `battleLoading` with `{ battleData }`.
2. Loading scene subscribes to the Battle loader, launches Battle with the unmodified payload, and stays topmost.
3. Battle preloads and initializes normally.
4. Battle emits `battle-ready` after HUD, save state, input, and co-op synchronization are initialized.
5. Loading scene removes itself, revealing the ready battle frame.

## Failure Handling

Loader progress is clamped to `0..1`. Repeated scene entries replace old listeners during shutdown. If the preloaded key art is unavailable, the scene falls back to a warm charcoal canvas and preserves all status/progress behavior.

## Verification

- Unit/source-wiring tests cover payload preservation, both entry paths, ready-event cleanup, and progress clamping.
- A Playwright route-delay test confirms the loading canvas is nonblank while a battle asset is delayed, then disappears after Battle is ready with no console errors.

## Deferred

Battle assets are still loaded as one large pack, including inactive L3/L4 art. Per-level asset splitting is a performance follow-up, not part of this interaction fix.
