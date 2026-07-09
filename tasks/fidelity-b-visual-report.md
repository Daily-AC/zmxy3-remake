# Fidelity B Visual Report

## Commit Status

No commits were created. `git commit -m "Align bg11 climb rendering"` failed with:

`fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted`

Per brief, I did not fight the sandbox. My uncommitted task files are:

- `game/src/scenes/BattleScene.ts`
- `game/src/scenes/SkillTreeScene.ts`
- `game/tests/battleScenePickupWiring.test.ts`
- `game/tests/battleSceneVisualMapping.test.ts`
- `game/tests/monster30Visual.test.ts`
- `game/public/assets/extracted/level1/Monster30_clean.png`
- `tools/clean-monster30-mask.py`

Unrelated untracked parallel-work files were present and ignored, including `game/src/net/coopChannel.ts`, `game/src/net/socialClient.ts`, `game/src/systems/coopSync.ts`, `game/tests/coop*.test.ts`, `game/tests/lobbyRoomState.test.ts`, `game/tests/socialClient.test.ts`, `social-server/test/ws-relay.test.ts`, and `tools/render-title-calligraphy.py`.

## 1. bg11 Alignment And Platform Geometry

Changed `game/src/scenes/BattleScene.ts`.

- Confirmed `BaseGameSence` places the background sprite at `x=-20`; bg11 XFL symbol bounds are `x=-59..1073`, `y=-2370..681`, so the cropped PNG top-left must render at `(-79, -2370)`.
- Added `computeBg11ClimbPlacement()` and used it for sl11: bg11 now uses world scroll factor `(1,1)` and direct scene-coordinate placement.
- Added F1 platform debug overlay from `currentWalls`; mid-cloud platforms get a low-opacity adapted ink-wash fill only. This is explicitly an Adapted placeholder pending art-direction sign-off.

Visual check pointers: `BattleScene.ts:360`, `BattleScene.ts:1498`, `BattleScene.ts:2788`.

Verified by `battleSceneVisualMapping.test.ts`: bg placement and cloud placeholder style.

## 2. WuKong Ground Climb Camera

Changed `game/src/scenes/BattleScene.ts`.

- Added `computeLevel1ClimbCameraBounds()` so climb camera bottom includes the scaled WuKong sprite bottom plus a 32px ground strip.
- Applied only to climb substage camera bounds; horizontal stages keep existing bounds.

Visual check pointer: `BattleScene.ts:393`, `BattleScene.ts:1502`.

Verified by `battleSceneVisualMapping.test.ts`: hero bottom stays within a 540px viewport with 32px below.

## 3. Monster30 Crow Size And Mask

Changed `game/src/scenes/BattleScene.ts`; added `game/public/assets/extracted/level1/Monster30_clean.png` and `tools/clean-monster30-mask.py`.

- AS3 copies agree: `BaseBitmapDataClip(..., 150, 150, new Point(0,0))`, `setOffsetXY(5,-2)`, frame counts `[6,1,5,1]`.
- `monster30.json` was already correct: 6x4 grid, 150x150 cells, offset `(5,-2)`.
- WuKong reference cell is 200x200, so crow cell ratio is `150/200 = 0.75` for both width and height.
- Root cause of artifact: source `Monster30.png` had many alpha-2 mask pixels. Generated `Monster30_clean.png` without modifying the original asset; script cleared 259,140 `alpha<=2` pixels.
- BattleScene now maps only `monster30` to `Monster30_clean`.

Visual check pointer: `BattleScene.ts:211`.

Verified by `monster30Visual.test.ts`: AS3 constants, 0.75 ratio, clean PNG 900x600, no alpha<=2 pixels, runtime mapping.

## 4. Drop Item Visual Style

Changed `game/src/scenes/BattleScene.ts`.

- Item drops now render as larger bare icons (`44px` max fit, up from 26px).
- Removed rarity ring/backing and any nearby-frame concept from item drop rendering.
- Item-name text keeps rarity color via existing `rarityCss()`.

Visual check pointer: `BattleScene.ts:406`, `BattleScene.ts:2615`.

Verified by `battleSceneVisualMapping.test.ts`: larger icon, transparent background, no ring, no nearby frame, rarity-colored name.

## 5. Skill Cast Pinyin Label

Changed `game/src/scenes/BattleScene.ts`.

- Removed the successful skill-cast shorthand toast (`skillId.toUpperCase()` path). Failure toasts such as MP/cooldown remain.

Visual check pointer: `BattleScene.ts:1105`.

Verified by `battleScenePickupWiring.test.ts`: no successful-cast pinyin abbreviation text path remains.

## 6. Battle Skill Button Opens Skill Tree

Changed `game/src/scenes/BattleScene.ts` and `game/src/scenes/SkillTreeScene.ts`.

- Battle dock `jineng` now launches the existing `SkillTreeScene` directly.
- Battle scene pauses via `scene.pause(SCENE.battle)`.
- SkillTreeScene accepts `{ returnScene: SCENE.battle }`; Back persists skill changes, stops skill tree, and resumes battle.
- On battle resume, bindings/learned levels/soul refresh from slot storage without resetting health, position, monsters, buffs, or other live battle state.

Visual check pointers: `BattleScene.ts:1008`, `BattleScene.ts:1832`, `SkillTreeScene.ts:227`, `SkillTreeScene.ts:362`.

Verified by `battleScenePickupWiring.test.ts`: launch/pause/resume source path and deletion of old toast stub.

## Stretch

Not attempted. WuKong skill VFX extraction remains for a later pass.

## Validation

Baseline before changes:

- `cd game && node_modules/.bin/vitest run` -> 524 passed / 1 skipped.
- `cd game && node_modules/.bin/tsc --noEmit -p tsconfig.json` -> exit 0.

After changes:

- Focused red/green tests were run for each testable item.
- `cd game && node_modules/.bin/vitest run $(git -C .. ls-files 'game/tests/*.test.ts' | sed 's#^game/##') tests/battleSceneVisualMapping.test.ts tests/monster30Visual.test.ts` -> 532 passed / 1 skipped.
- `cd game && node_modules/.bin/tsc --noEmit -p tsconfig.json` -> exit 0.

Raw `cd game && node_modules/.bin/vitest run` currently fails because unrelated untracked parallel-task tests are present and import missing/in-flight modules (`tests/lobbyRoomState.test.ts`, `tests/socialClient.test.ts`). That raw run still showed 543 tests passed / 1 skipped outside those two import-failure suites. I did not edit those files due ownership/scope.
