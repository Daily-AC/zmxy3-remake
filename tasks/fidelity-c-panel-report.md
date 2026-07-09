# Fidelity C Panel Report

Date: 2026-07-09

Scope respected: edited only `game/src/ui/hud/BackpackWindow.ts`, `game/tests/backpackWindowLayout.test.ts`, and this report. No edits under `game/src/scenes/` or `game/src/systems/`.

## Verification Environment

- Browser plugin path: unavailable in this sandbox. Browser runtime initialized, but `agent.browsers.list()` returned `[]` and `getForUrl('http://localhost:5310/')` returned `No browser is available`.
- Local dev server: blocked by sandbox. Both `npm run dev -- --host 127.0.0.1 --port 5311` and `npm run dev -- --host ::1 --port 5311` failed with `listen EPERM`.
- Standalone Playwright: not vendored under `game/node_modules/.bin`.
- Result: no live Phaser/Playwright screenshot could be produced in this sandbox. I verified the changed coordinates with asset pixel scans, pixel-composited evidence from the same extracted UI PNGs, unit tests, full game Vitest, and `tsc`.

Evidence files written under `tmp/panel-c-evidence/`:

- `c-panel-fixed-exp-composite.png`
- `c-panel-fixed-pagination-annotated.png`
- `c-panel-fixed-full-composite.png`
- `c-panel-left-static-check.png`
- `c-panel-right-static-check.png`

## Bug #2: Floating Yellow EXP Bar

Status: fixed in `game/src/ui/hud/BackpackWindow.ts`.

Root cause: `EXP_FILL` was placed at `{ x: 215, y: 450, w: 214, h: 20 }`, far below and to the right of the baked EXP track. The fill rect spanned `x=215..429`, `y=450..469`, while the real track is on the `EXP_VALUE` row around `y=426..445`.

Pixel scan source:

- `game/public/assets/extracted/ui/backpack_bg.png`: `755x497`
- `game/public/assets/extracted/ui/backpack_exp_fill.png`: `214x20`
- Scanned ROI around the EXP row (`x=70..340`, `y=390..475`).
- Baked black rounded EXP track outer bbox: `x=95..308`, `y=426..445`.
- Inner trough: about `x=98..304`, `y=430..442`.
- Fill PNG has alpha over its full `214x20` box with rounded alpha corners, so placing it at `x=95`, `y=426` matches the track's outer bbox.

Change:

- Before: `EXP_FILL = { x: 215, y: 450, w: 214, h: 20 }`
- After: `EXP_FILL = { x: 95, y: 426, w: 214, h: 20 }`
- Also changed render order so `expFill` is added before `expText`; the EXP value remains visible above the yellow fill.

Evidence:

- `tmp/panel-c-evidence/c-panel-fixed-exp-composite.png` shows the yellow fill fully inside the baked black EXP track.
- Regression test: `tests/backpackWindowLayout.test.ts` asserts the fill rect matches `{ x: 95, y: 426, w: 214, h: 20 }` and that crop height stays `20`.

## Bug #3: Prev/Page/Next Overlap

Status: fixed in `game/src/ui/hud/BackpackWindow.ts`.

Root cause: `NOWPAGE` was wider than the actual gap between the baked prev/next buttons.

Geometry:

- `PREV_BTN` right edge: `498.7 + 86 = 584.7`
- `NEXT_BTN` left edge: `616.9`
- Available gap: `32.2px`
- Old `NOWPAGE`: `{ x: 590.3, y: 425.6, w: 70 }`, span `555.3..625.3`
- Old overlap: `29.4px` into prev button area and `8.4px` into next button area.

I inspected the baked background crop (`x=470..725`, `y=380..465`); there is no dedicated page-number groove, only the two button images and a small empty gap. The safe fix is to center the text in that actual gap.

Change:

- Before: `NOWPAGE = { x: 590.3, y: 425.6, w: 70 }`, font size `13`
- After: `NOWPAGE = { x: 600.8, y: 425.6, w: 30 }`, font size `12`
- New span: `585.8..615.8`, leaving about `1.1px` clear of each button edge.

Evidence:

- `tmp/panel-c-evidence/c-panel-fixed-pagination-annotated.png`: red vertical lines mark prev/right and next/left button edges; green box is the fixed page-number text box inside the gap.
- Regression test: `tests/backpackWindowLayout.test.ts` asserts the page text box does not overlap `PREV_BTN` or `NEXT_BTN`.

**Follow-up (main-session verdict, 2026-07-09, commit `688a860`)**: at the fixed 30px box width, `"${page} / ${total}"` (with spaces) word-wraps onto two lines ("1 /" + "1") — no longer overlapping the buttons (the actual bug criterion) but visually cramped. Dropped the spaces around the slash (`"${page}/${total}"`); at 12px font this renders as a single line ("1/1") fully inside the gap. Verified live via `window.__toggleBackpack()` + screenshot (`tmp/panel-c-evidence/crop-page-singleline.png`); no coordinate changes needed, no button overlap reintroduced.

## Bug #1: Left Stat Column Crowding

Status: not reproduced in the states I could verify from code/assets in this sandbox.

What I checked:

- Current stat rows in `BackpackWindow.ts`:
  - Left column y values: `260.3`, `293.7`, `327.7`, `360.8`, `394.2`
  - Right column y values: `260.3`, `293.7`, `327.7`, `361.3`, `393.8`
  - Row gaps are about `32.5..34.0px`, with 14px text, so the stat table itself is not vertically overlapping.
- Level 10+ badge:
  - Name field right edge: `179.4 + 109/2 = 233.9`
  - Combat-power field right edge: `176.4 + 109/2 = 230.9`
  - Multi-digit badge starts at `LEVEL_BADGE.x + 5.8 = 274.4`, leaving over `40px` from those fields.
- Equipment slots:
  - Equipment icons occupy `y=113.4..238.4`; stat table starts at `y=260.3`, so equipped items do not overlap the stat table.
- Current runtime data path in `BattleScene.refreshBackpackData()` uses `heroName(this.identity.heroId)`, so the live name is the fixed hero name, not an arbitrary nickname.

Limitations:

- I could not execute `window.__gainExp` / `window.__equip` live because the sandbox blocked a dev server and no browser backend was available.
- I could not live-test an arbitrary long nickname because the current wiring/debug hooks do not expose a way to set one. Testing or supporting that edge would require a wiring-layer/debug-hook change; hand back to main session for serial handling if that edge is required.

Recommendation: not reproduced; suspect this was from a pre-S4-rebuild screenshot or a state not currently reachable through the panel wiring. Ask for a fresh screenshot if the user still sees it.

## Bug #4: Right-Side Contentless Gray Rectangle

Status: not reproduced from code/assets in this sandbox.

What I checked:

- `buildPlaceholderSlot()` placeholders are left-side only:
  - Title placeholder: `x=54.1..104.1`
  - Fashion placeholder: `x=57.7..107.7`
  - Fashion toggle placeholder: `x=57.7..106.7`
- Disabled tab overlays are small top-tab masks only:
  - `fashion`: `x=553.9..626.9`, `y=61.1..88.1`
  - `script`: `x=627.9..700.9`, `y=61.1..88.1`
  - They sit over baked tab labels, not a blank large right-side rectangle.
- The right panel baked background crop (`tmp/panel-c-evidence/c-panel-right-static-check.png`) has labeled tabs and the empty inventory area; I did not find a standalone blank gray rectangle in `BackpackWindow.ts`.
- The area outside the centered `755x497` panel is intentionally the dimmed battle backdrop; it is not a panel-owned gray rectangle.

Limitations:

- Could not live-switch tabs in Phaser because browser/dev-server verification was blocked as above.

Recommendation: not reproduced. Ask for a fresh screenshot if the gray block still appears; if it is outside `BackpackWindow.ts`, it likely belongs to the wiring/rendering layer and should be handled serially outside C-panel ownership.

**Attribution update (main-session verdict, 2026-07-09)**: main session cross-referenced the user's screenshot against the known monster30 (crow) sprite-sheet mis-crop artifact already tracked under fidelity-b (out-of-bounds frame crop on the crow's action sheet produces the same flat gray rectangle texture, see `tasks/fidelity-r3-backlog.md` item 9). The backpack window renders over the live battle scene rather than replacing it, so a crow standing behind the player when the panel opens would show through in the same screen region the user flagged. This matches "not reproducible in BackpackWindow.ts" (there is no panel-owned gray rectangle) without contradicting the user's screenshot — the artifact belongs to the crow's rendering (fidelity-b ownership), not to this panel. No panel code should be changed to chase this; closed as a cross-branch attribution, not a C-panel defect.

## Tests

TDD red check:

- `game/node_modules/.bin/vitest run game/tests/backpackWindowLayout.test.ts` initially failed on the old constants:
  - Expected EXP fill `{ x: 95, y: 426, w: 214, h: 20 }`, received `{ x: 215, y: 450, w: 214, h: 20 }`.
  - Expected page left edge `>= 584.7`, received `555.3`.

Final checks:

- From repo root, `game/node_modules/.bin/vitest run` picked up unrelated `agent-server` / `social-server` Node test files and reported 8 "No test suite found" failures; all game tests in that run passed.
- From `game/`, `node_modules/.bin/vitest run`: `56 passed (56)` test files, `575 passed | 1 skipped (576)` tests.
- From `game/`, `node_modules/.bin/tsc --noEmit`: passed.
- Final focused rerun from `game/`, `node_modules/.bin/vitest run tests/backpackWindowLayout.test.ts`: `1 passed (1)` test file, `2 passed (2)` tests.

## Git Commit

Requested commit could not be created in this sandbox. `git add game/src/ui/hud/BackpackWindow.ts game/tests/backpackWindowLayout.test.ts tasks/fidelity-c-panel-report.md` failed with:

```text
fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted
```

There is no stale `.git/index.lock`; `.git` is read-only to this session. The worktree changes are ready, but staging/committing requires a session with `.git` write permission.
