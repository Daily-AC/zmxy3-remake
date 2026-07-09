# Furnace Recipe Report

## Built

- `game/src/systems/furnaceRecipe.ts`
  - Added pure deterministic recipe crafting logic.
  - Derives 39 制作书/product records from `equipment.json`.
  - Hardcodes only the recovered material table.
  - Implements `listRecipes`, `findRecipe`, `canCraft`, transactional `craft`, and `equipmentItemByFillName`.
  - `craft()` consumes 1 制作书 + materials, spends soul, adds the produced item to the same inventory, and rolls back on failure/bag-full.

- `game/src/ui/hud/FurnaceRecipeView.ts`
  - Added a new Phaser modal for recipe rows, live craft affordances, 老君 chat input, chat log, row debug coordinates, and lock state.
  - Reuses `FurnacePanel.ts` frame constants.

- `game/src/ui/hud/FurnacePanel.ts`
  - Only exported `WIN`, `FRAME_TEX`, and `FRAME_SCALE`.
  - Commit was attempted immediately, but the sandbox has read-only `.git` access and failed with: `fatal: Unable to create .../.git/index.lock: Operation not permitted`.

- `game/src/net/npcClient.ts`
  - Added optional `materials` and `soul` to `player_say`.
  - Added `craft_recipe` server message decoding.

- `game/src/scenes/WorldMapScene.ts`
  - Repointed the world-map 炼丹炉 button to `FurnaceRecipeView`.
  - Manual recipe craft and NPC recipe craft both call the same local `furnaceRecipe.craft()` path.
  - Added `__giveMaterials`, `__giveSoul`, and `__shellMapRecipeState` hooks.
  - Included `skillTree` and `soul` in this scene's save payload so craft soul spending persists.

- `agent-server/src/furnace-recipes.ts`
  - Added hand-mirrored 39-row recipe summary table and advisory `checkMaterials`.

- `agent-server/src/types.ts`, `brain.ts`, `server.ts`, `npc-registry.ts`
  - Added material/soul context to `player_say`.
  - Added `craft_recipe` outbound intent.
  - Added recipe list/check context for opencode prompts.
  - Added Claude MCP tools: `list_recipes`, `check_materials`, `craft_recipe`.
  - Kept the old free-form `craft_item` path unchanged; the new recipe tool is named `craft_recipe` to avoid collision.

## Notes

- The brief prose says 38 recipes, but `equipment.json` has 39 制作书 rows and the supplied material table also has 39 keys. I used all 39.
- Assumption: each 制作书 is consumed once per successful craft.
- Archaeology gap: 邪灵/魂器 soul cost is not recovered from AS3, so those qualities fall back to 传说's 1600.
- Known DSL gap: `emiss/eahp/eamp/eatblood/magicdef/deephit` are skipped because `Item.effects` only supports `atk/def/hp/mp/crit`.
- Real browser + real LLM verification was not run here. The agent-server test only proves deterministic data/checks and callback pass-through.

## Tests Added

- `game/tests/furnaceRecipe.test.ts`
  - 39-row catalog and material-table sync guard.
  - `whgzzs` shape.
  - `canCraft` missing book/material/soul/success states.
  - `craft()` success, rng min/max, unknown recipe no-mutate, insufficient materials no-deduct, bag-full rollback.
  - 邪灵/魂器 1600 fallback.

- `game/tests/npcClient.test.ts`
  - Added `player_say` material/soul snapshot coverage.
  - Added `craft_recipe` decode and malformed-frame rejection.

- `agent-server/test/furnace-recipes.test.ts`
  - Recipe catalog count and `checkMaterials` missing/soul/all-present cases.

- `agent-server/test/craft-recipe-callback.test.ts`
  - Bogus recipe id passes through `onCraftRecipe` without crashing.

## Test Output Tails

`cd game && npx vitest run`

```text
Test Files  56 passed (56)
     Tests  575 passed | 1 skipped (576)
  Start at  15:29:32
  Duration  980ms
```

`cd game && npm run build`

```text
✓ 106 modules transformed.
dist/index.html                    0.52 kB │ gzip:   0.36 kB
dist/assets/index-DZznw4b6.js  2,070.14 kB │ gzip: 472.66 kB
✓ built in 1.62s
```

`cd agent-server && npm run test:unit`

```text
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 260.827208
```

`cd agent-server && npm run typecheck`

```text
> zmxy3-agent-server@0.1.0 typecheck
> tsc --noEmit
```

## Browser Verification (actually run, 2026-07-09, by the wrapper session — real browser + real LLM, no mocks)

Both paths were driven end-to-end in a real Chromium tab against a real running `agent-server` + `game` Vite dev server, with the outcome confirmed against the **persisted save in localStorage** (not just UI appearance — the row status text and toast are cosmetic, the save file is ground truth).

**Bug found in the opencode/DeepSeek provider**: `NPC_BRAIN_PROVIDER=opencode` (the default) crashed on the very first `player_say` in this environment — `agent-server` log: `Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.` followed by `ServeError: Unexpected error` from `@opencode-ai/sdk`'s spawned `opencode serve` subprocess, which killed message handling entirely (the client never got a reply). This is pre-existing infra, not something introduced by this feature, but it means **the opencode path could not be verified live in this environment**; verification below used `NPC_BRAIN_PROVIDER=claude` instead, which worked correctly. Whoever owns the opencode/DeepSeek path should investigate the `OPENCODE_SERVER_PASSWORD`/subprocess boot failure separately.

**Playwright input quirk for future testers**: this game's Phaser 4 input plugin reacts to legacy `mousedown`/`mouseup` DOM events on the canvas, **not** `PointerEvent`. Synthetic `PointerEvent` dispatch (the more "modern" choice) silently does nothing — no error, just no click. Use `new MouseEvent('mousedown'/'mouseup', {clientX, clientY, button:0, buttons:1/0, bubbles:true})` dispatched directly on the canvas element.

Start local services:

```bash
cd agent-server
NPC_BRAIN_PROVIDER=claude npm run start   # opencode path currently crashes in this env, see bug note above
cd game
npm run dev -- --port <free-port> --strictPort
```

Login gate note: this milestone's coop-shell login-first flow sits in front of the world map. To reach it without a live social-server, seed a fake session before loading the page: `localStorage.setItem('zmxy.social.session', JSON.stringify({token:'debug-token', user:{id:'debug-user', username:'tester'}}))`, then navigate/reload. `LoginScene.enterGame()` reads slot 0; a first-time boot goes to `CharacterSelectScene` (call `window.__shellConfirm()` or click "开始游戏" to land on the world map with 悟空).

**Path 1 — manual recipe craft** (screenshots in `tmp/furnace-evidence/`):
```js
window.__giveMaterials('whgzzs', 1)
window.__giveMaterials('wptm', 20)
window.__giveSoul(200)
window.__shellMapAction('furnace')
window.__shellMapRecipeState()   // read row.screenX/screenY for the whgzzs row, canCraftNow: true
```
Dispatch a real mousedown/mouseup at the row's `screenX/screenY` (canvas-local, add the canvas's `getBoundingClientRect()` offset). Result, verified against `localStorage['zmxy3-remake.slot.v1.0']`: soul 200→0, one new `whg` (尾火棍) stack, `effects: [{type:'stat', stat:'atk', value:14}]` — inside equipment.json's `eatt:{base:10,rand:5}` range (10–15) as required. Screenshots: `01-manual-before-craft.png` (row shows 可打造/200 soul), `02-manual-after-craft.png` (row flips to 缺制作书 — book+material consumed).

**Path 2 — chat-driven craft via 老君** (screenshots in `tmp/furnace-evidence/`):
Same bootstrap (`__giveMaterials`/`__giveSoul`/open furnace), then typed into the chat `<input placeholder="和老君说句话">`:
1. `老君，帮我炼把尾火棍` → 老君 (real Claude LLM) replied in character acknowledging the book/材料/灵魂 snapshot were present but did not craft yet (two-round quote-then-confirm guidance) — `03-chat-first-reply.png`.
2. `材料都在这了，快帮我炼吧` → this turn triggered the `craft_recipe` tool call for `whgzzs`. Confirmed via `localStorage`: soul 200→0 again, `whg` stack qty went 1→2 (stacked with path 1's item), same `atk:14` effect. `04-chat-craft-success.png` shows 老君's (slightly grumbling, in-character) reply alongside the mechanical proof in devtools/localStorage that the craft executed correctly regardless of the LLM's own wording — exactly the "server signals intent only, game re-validates and is authoritative" property this feature is supposed to have.

Both paths independently produced a real, equipment.json-backed 尾火棍 with the correct stat range and correct soul/material bookkeeping. No mocks were used for the chat path — this was a genuine round trip through the Claude Agent SDK.
