# Review Blue — 工程一致性与隐性契约

Scope: `game/src/` in full. No code changes made. Every finding below was independently
verified by reading the cited lines (not taken on an agent's word) unless marked
`[unverified, single-source]`.

Distribution: **3 blocker, 4 major, 6 minor** = 13 findings, plus a 5-item test-gap list.

---

## Top 5 (by impact if left unfixed)

1. **[blocker]** `spawnDrops`/`equip` bugs mean loot and gear-swap can silently vanish or be
   wrong (findings #2, #4).
2. **[blocker]** Camera-scroll hit-testing bug — fixed once, reintroduced/never-applied in 4
   places — makes crafting and post-battle UI effectively unclickable mid-level (finding #1).
3. **[blocker]** Save slots 3–5 are selectable in the UI but BattleScene never persists
   progress to them (finding #3).
4. **[major]** Every monster in the game drops monster30's loot table, not its own — 6 of 7
   species' unique items are unreachable in actual play (finding #4, same as #2 above but
   restated since it's the single highest-blast-radius item bug).
5. **[major]** No central canvas-size/depth-layer constants — canvas 960×540 hand-typed in
   13+ places, and a concrete same-depth collision already exists (Toast vs FurnacePanel,
   finding #6).

---

## Blocker

**[blocker] game/src/ui/hud/FurnacePanel.ts:103,127,168,240; game/src/ui/hud/ResultBanner.ts:38,101; game/src/ui/hud/BackpackWindow.ts:560-566,612-620; game/src/ui/DialogueBox.ts:140 — camera-scroll hit-testing bug fixed once, silently reintroduced/never-applied in 4 places.**
`BackpackWindow.ts:128-142` documents, in detail, a real production bug: any GameObject with
native `.setInteractive()` nested inside a `.setScrollFactor(0)` container drifts out from
under its own rendered position once the camera scrolls, because Phaser hit-tests
interactives in world space and ignores the parent container's scrollFactor. The fix
(manual screen-space hit-testing via `resolveHit()`) is applied to `BackpackWindow`'s
close/tab/sell/prev/next/equip-select buttons and to `SkillBarHud.ts:89-109` (which has the
same fix with an even more explicit comment: "NOT setInteractive on objects inside this
scrollFactor(0) container... verified live 2026-07-08: geometrically-correct clicks did
nothing mid-level").

That fix was never propagated to sibling components, and is even violated **within
`BackpackWindow` itself**:
- `FurnacePanel.ts` (`this.container...setScrollFactor(0)` at line 173): the craft button
  (127), the two chip-selection rects rebuilt per-open (240), and the close button (168) all
  use raw `.setInteractive()`.
- `ResultBanner.ts` (`.setScrollFactor(0)` at line 39): the dim backdrop (38) and the
  retry/continue buttons (101, and the `result_retry`-texture branch) use raw
  `.setInteractive()`.
- `BackpackWindow.ts` itself: `redrawEquip()` (560-566, the unequip-click hotspot on a worn
  item) and `buildCell()` (612-620, the inventory grid's click/hover hotspot) both add a
  rectangle to `equipLayer`/`gridLayer` (children of the scrollFactor(0) container) and call
  `.setInteractive()` on it — exactly the pattern the file's own header comment says is
  broken.
- `DialogueBox.ts:137-141` (root container `.setScrollFactor(0)` at line 126): the 炼宝 entry
  button uses raw `.setInteractive()`. Currently dead in practice (comment at
  `BattleScene.ts:1645` says BattleScene doesn't pass `onCraftEnter` anymore), but the same
  latent bug the moment it's rewired.

Impact: `BattleScene.ts:697-698` does `cameras.main.setBounds(...)` +
`cameras.main.startFollow(this.hero, true, 0.1, 0.1)` — the camera follows the hero
continuously, so `scrollX` is nonzero almost immediately after a level starts. Both
`FurnacePanel` (`BattleScene.ts:1592`) and `ResultBanner` (`BattleScene.ts:1598`) are
instantiated and shown from BattleScene, i.e. exactly the scrolling scene. In practice: the
炼丹炉 crafting panel (a core game loop per project CLAUDE.md — "掉料→找老君用料现场炼独一无二装
备→穿上变强") and the 挑战成功/失败 retry/continue banner are likely unclickable for most of
actual play; unequipping items and clicking bag items from the backpack window likely fail
the same way.

Fix: apply the same manual-hit-test pattern (`toLocal` + rect list + one
`scene.input.on('pointerdown'/'pointermove')`) used in `BackpackWindow`'s own close/tab/sell
buttons and in `SkillBarHud` to every interactive rect listed above; delete the
`.setInteractive()` calls.

**[blocker] game/src/scenes/BattleScene.ts:768 vs game/src/systems/saveSlots.ts:26-28 — save-slot gate silently drops all progress for slots 3–5.**
`this.activeSlot = slot === 0 || slot === 1 || slot === 2 ? (slot as SlotId) : null` only
accepts slot ids 0/1/2, but `saveSlots.ts` defines `SLOT_COUNT = 6` /
`SlotId = 0|1|2|3|4|5` / `SLOT_IDS = [0,1,2,3,4,5]`, and `SlotSelectScene.ts` renders and
lets the player pick all 6 slots. `WorldMapScene.ts:117` and `SkillTreeScene.ts:182` each
independently define a correct `asSlotId(v)` accepting the full 0–5 range — BattleScene is
the one file that got it wrong. `saveToSlot()` (`BattleScene.ts:838-839`) no-ops whenever
`activeSlot === null`, and it's the single write path called after every exp/level-up
(2115), equip/unequip (2421, 2431), crafted-item pickup (1740), and boss-clear frontier
advance (1554). Net effect: a player using save slot 4, 5, or 6 (as numbered/displayed in
the slot-select UI) never has any in-battle progress persisted — loot, levels, gear, and
campaign advancement are silently lost the moment they leave BattleScene.
Fix: replace the inline ternary with the same `asSlotId`-style 0–5 check already written
twice elsewhere (`WorldMapScene.ts:117`, `SkillTreeScene.ts:182`) — ideally hoist it to
`saveSlots.ts` as a shared export so there's one definition instead of three.

---

## Major

**[major] game/src/scenes/BattleScene.ts:2047,2183-2184 vs game/src/data/drops.json — every monster drop uses monster30's loot table, not its own.**
`spawnDrops(x, y)` (2183) calls `rollDrops('monster30', Math.random)` unconditionally, and
takes no species parameter at all. Its only call site, `BattleScene.ts:2047`
(`this.spawnDrops(ev.x, ev.y)`, inside the generic per-species death handler), has `e`
(the dying `MonsterEntity`, with `e.species`) in scope and even uses `e.species` two lines
later for `awardKillExp(ev.x, ev.y, e.species)` — but never threads it into `spawnDrops`.
`drops.json` defines 7 distinct, non-overlapping tables (monster2/3/4/5/7/8/30), and L1/L2
rosters mix these species. Result: 6 of 7 species' unique crafting materials/equipment are
unreachable in real play; every kill anywhere in the game yields monster30's items
(demon_soul/silver_ore/great_pill) regardless of what was actually killed.
Fix: `private spawnDrops(species: string, x: number, y: number)`, pass `e.species` from the
call site, forward it to `rollDrops`.

**[major] game/src/systems/equipment.ts:37-45 — `equip()` can permanently delete the previously-worn item when the bag is full.**
`equip()` does `eq[slot] = item; if (prev) addItem(inv, prev, 1)` without checking
`addItem`'s return value. `addItem` (`inventory.ts:41-47`) returns `{ok:false, overflow:n}`
and drops the excess silently once `inv.stacks.length >= inv.capacity` and no existing stack
can absorb the returned unit. Contrast with `unequip()` three lines below
(`equipment.ts:48-54`): `if (!addItem(inv, cur, 1).ok) return false` — correctly aborts
*before* mutating `eq[slot]`. `equip()` mutates `eq[slot] = item` unconditionally first, then
tries (and may fail) to return `prev` to the bag, with no rollback. `BattleScene.doEquip`
(2417-2424) has no capacity guard on top of this either. Reachable scenario: bag at
capacity, swap gear via the backpack UI while any stack can't absorb the returned item — the
previously-equipped item is gone: not in inventory, not equipped.
Fix: mirror `unequip`'s pattern — check `addItem(...).ok` first (or reserve the slot before
committing the swap) and reject/roll back the swap if the bag can't take `prev`.

**[major] game/src/main.ts, 13+ files — canvas size 960×540 has no single source of truth.**
`main.ts:26-27` sets `width: 960, height: 540` for the Phaser config, but this value is
independently re-declared as local constants in `scenes/MainMenuScene.ts:36-37`,
`scenes/SlotSelectScene.ts:45-46`, `ui/hud/ResultBanner.ts:26-27`, `ui/menu/inkBackdrop.ts:8-9`,
and hand-typed as bare literals (no named constant at all) in `scenes/BattleScene.ts:854,1051`,
`scenes/CharacterSelectScene.ts:156,158-159`, `scenes/WorldMapScene.ts:192`,
`scenes/SkillTreeScene.ts:264-265`, `ui/hud/BackpackWindow.ts:93-94,264`,
`ui/hud/FurnacePanel.ts:103`. No `CANVAS_W`/`CANVAS_H` (or similar) exported constant exists
anywhere in `game/src`. All copies happen to agree today, but nothing would catch one drifting
(e.g. a future aspect-ratio change) except manual grep.
Fix: one `systems/layout.ts` (or similar) exporting `CANVAS_W = 960` / `CANVAS_H = 540`,
imported everywhere instead of retyped.

**[major] game/src/ui/hud/Toast.ts:109, game/src/ui/hud/FurnacePanel.ts:173, and 15+ other files — no shared depth/z-layer table; a real same-depth collision already exists.**
`Toast.ts:109` (`.setDepth(210)`) and `FurnacePanel.ts:173` (`.setDepth(210)`) use the
identical literal depth for two independently-authored UI layers. This isn't just
theoretical: `BattleScene.submitCraft()` calls `this.showToast(...)` on validation failures
(1682 no materials, 1686 empty wish, 1690/1710 NPC offline) **without** closing the furnace
panel first — `furnacePanel.close()` only runs on the success path (1720). So a failed craft
attempt renders a Toast at the exact same depth as the still-open FurnacePanel, with visual
stacking order resting on incidental Phaser child-insertion order, not an explicit rule.
More broadly, no shared depth-layer constant exists anywhere: `BattleScene.ts` alone uses
-40,-30,-10,-8,7,8,9,10,11,20,100,130,300 ad hoc; `CharacterSelectScene.ts` uses
10,20,50,51,52; `ui/menu/inkBackdrop.ts` uses -101,-100,-99.
Fix: a `ui/hud/depths.ts` enum/table (world < HUD < modal-panel < toast < pause), all
containers reference it; toast placed strictly above modal panels by construction, not by
accident.

---

## Minor

**[minor] game/src/scenes/BattleScene.ts:2482-2490,753-756 — battle BGM is never stopped on scene shutdown.**
`this.sound.add('bgm', { loop: true, ... }).play()` — Phaser's `SoundManager` is a
game-global plugin (not scene-owned), so it isn't auto-cleaned by the scene's own
`SHUTDOWN`-triggered GameObject/timer/tween teardown. BattleScene's `SHUTDOWN` closure
(753-756) only disposes `npcClient` and closes `dialogue` — it never calls
`this.sound.stopByKey('bgm')`. Leaving battle for the main menu or world map leaves the
battle music playing underneath the next scene's own audio.
Fix: stop/destroy the bgm sound in the same shutdown closure.

**[minor] game/src/scenes/BattleScene.ts:815-817 — entry campaignIndex clamp ignores the L1+L2 scope cut, a missing second line of defense.**
`Math.min(Math.max(0, this.entryCampaignIndex), CAMPAIGN.length - 1)` clamps against the
full 4-level `CAMPAIGN.length` (level3/4.ts intentionally "stay in repo" per project
CLAUDE.md's scope-cut note), not the 2-level active scope. The actual scope cut is enforced
only at `WorldMapScene.tryEnterLevel()` via `isCampaignLevelUnlocked` before
`scene.start(SCENE.battle, {campaignIndex})` — `campaignProgress.ts`'s own
`ACTIVE_CAMPAIGN_LENGTH = 2` is correctly wired there. BattleScene itself has no independent
enforcement; not reachable through the shipped UI today (single, correctly-gated call site),
but any future debug hook, stale deep-link, or WorldMapScene regression would let L3/L4 load
with no BattleScene-side guard.
Fix: clamp against `ACTIVE_CAMPAIGN_LENGTH` (import from `campaignProgress.ts`) instead of
`CAMPAIGN.length`.

**[minor] game/src/systems/monsterBehaviors.ts:672 vs game/src/systems/tick.ts:4 — FPS constant re-derived instead of imported.**
`tick.ts:4` exports `FPS = 30`; `monsterBehaviors.ts` already imports `TICK_MS` from `./tick`
(line 81) but then does `const FPS = 1000 / TICK_MS` locally at line 672 instead of importing
the existing named constant. Harmless today only because `TICK_MS = 1000/FPS` round-trips
exactly.
Fix: `import { FPS } from './tick'`, drop the local redefinition.

**[minor] game/src/ui/hud/hudTheme.ts:78,83 — `icon_crafted_equip` manifest entry is unreachable dead weight.**
`HUD_ICON_IDS` lists `'crafted_equip'` → texture key `icon_crafted_equip`, but every icon
lookup builds the key as `icon_${item.id}` (`BackpackWindow.ts:248`, `FurnacePanel.ts:95`,
`BattleScene.ts:1584,1593`), and forged items get their `id` from the NPC-server response or
`` `forged-${Date.now()}` `` (`furnace.ts:220`) — never the literal string `"crafted_equip"`.
Every forged item's icon lookup therefore misses this dedicated art and falls back to
`ICON_FALLBACK_KEY`.
Fix: either route craft-flow equip items to `icon_crafted_equip` explicitly, or delete the
unused manifest entry.

**[minor] game/src/net/npcClient.ts:314-338 — `connect()`/`handleDrop()` have no reentrancy guard or socket-identity check.** `[latent, not currently reachable]`
`connect()` never checks whether `this.socket` already exists/is connecting before creating
a new one; `handleDrop()` (the `onclose` handler) unconditionally nulls `this.socket` and
schedules a reconnect without verifying the closing socket is still the live one. Not
reachable today — both `BattleScene.connectNpc()` and `WorldMapScene.connectNpc()` call
`connect()` exactly once per fresh `NpcClient` per scene `create()` — but the project's own
CLAUDE.md names a planned multiplayer/lobby feature, which is exactly the kind of code path
(reconnect buttons, session resume) that would call `connect()` more than once on a live
instance.
Fix: guard `connect()` against an already-open/connecting socket; in `handleDrop`, compare
the closing socket against `this.socket` before nulling/reconnecting.

**[minor] game/src/ui/DialogueBox.ts:137-141 — 炼宝 entry button shares the camera-scroll setInteractive bug, currently dormant only because it's unwired.**
Same root cause as the blocker finding above (rect nested in a `.setScrollFactor(0)`
container using raw `.setInteractive()`), scoped down to minor only because
`BattleScene.ts:1645`'s own comment confirms `onCraftEnter` isn't passed there today. Fix it
in the same pass as the blocker item so it isn't waiting to regress the moment someone
rewires the 炼宝 entry point back into a scrolling scene.

---

## Test blind spots — 5 highest-value extraction candidates

`game/tests/` has ~36 files covering `game/src/systems/*.ts` thoroughly; zero test files
exist for `game/src/scenes/*.ts` or `game/src/ui/**/*.ts`. These are the 5 most valuable
pieces of currently-inline BattleScene logic worth pulling into standalone pure functions
(following the existing pattern in e.g. `game/tests/combatPower.test.ts`):

1. **Damage finalization clamp/round** (`BattleScene.ts:1004,1914,2135-2145`, same
   `Math.max(1, Math.round(...))` pattern copy-pasted 3×). Extract
   `finalizeDamage(raw: number): number`; test 0/negative/fractional inputs so the three call
   sites can't silently diverge.
2. **Drop-species resolution** (`BattleScene.ts:2047`, the exact bug in finding #4 above).
   Once fixed to pass `e.species` through, add a test asserting `spawnDrops` receives the
   dying entity's actual species rather than a literal — this is the seam that would have
   caught the bug before it shipped.
3. **Campaign-index entry clamp** (`BattleScene.ts:817` and `:1215`, duplicated inline
   twice, and inconsistent with `campaignProgress.ts`'s own clamp per the minor finding
   above). Extract `clampCampaignIndex(index, activeLength)`; test it rejects indices ≥
   `ACTIVE_CAMPAIGN_LENGTH` even though `CAMPAIGN` itself still has 4 entries.
4. **Combo-stage duration derivation** (`BattleScene.ts:1205-1208`,
   `actionDurationMs(roleData.actions[a], TICK_MS)` feeding `comboStageDurationsMs`, which
   directly drives hand-tuned combat feel). Extract
   `deriveComboStageDurations(actions, tickMs): number[]`; test the index-0-is-idle
   convention and that all 5 hit stages resolve positive.
5. **Knockback direction sign** (`BattleScene.ts:2146`,
   `this.heroState.x < e.state.x ? -1 : 1`). A flipped comparison would push the hero into
   the monster instead of away, and nothing but manual playtesting would catch it. Extract
   `knockbackDirection(heroX, sourceX): 1 | -1`; test both orderings and the tie case.

---

## 对红队 findings 的对抗验证

Verified against the current working tree (`git log -1` head `4166706`, plus uncommitted
changes to `game/src/scenes/BattleScene.ts` from an in-flight "hitstun-triad pen" fix — noted
inline where it changes the verdict). All three red-team findings checked; line numbers below
are current-tree, not the red-team doc's original numbers where they've since shifted.

### [major] All monster kills award monster30's loot table — **CONFIRMED, unchanged**

Re-read `BattleScene.ts:2105` (call site, now `this.spawnDrops(ev.x, ev.y)`) and `:2242-2244`
(`spawnDrops` still does `rollDrops('monster30', Math.random)` unconditionally, no species
param on the method signature at all). This is the exact same defect I independently found
and filed as major finding #4 in this document before red/blue diverged — both reviews landed
on the identical root cause (species dropped between `e.species` being available at the call
site and never threaded through), same fix. No disagreement, no rot since either doc was
written. Engineering-consistency angle to add: this is the same *shape* of bug as this
document's blocker #1 (BackpackWindow's own hit-testing regression) and major #4 — a fix
pattern gets established at one call site (`awardKillExp(ev.x, ev.y, e.species)` sits one line
above the broken call and does the "pass species through" step correctly) and the sibling call
right next to it doesn't get the same treatment. Worth a project-wide grep for
`rollDrops(` / any other place a hardcoded id sits next to a live `e.species` in scope, not
just a one-line patch at this call site.

### [major] ResultBanner's 继续/重新挑战 buttons use the broken scrollFactor(0)+setInteractive hit-test pattern — **CONFIRMED, unchanged**

Re-read `ResultBanner.ts:38` (dim, `setInteractive()`), `:39` (container `.setScrollFactor(0)`),
`:96-104` (retry image branch, `setInteractive()` at 101), `:106-127` (both `MenuButton`
instances, 重新挑战/继续), and `MenuButton.ts:64-66` (`this.hit = scene.add.rectangle(...).
setInteractive(...)`) + `:91-93` (`container(...).setScrollFactor(0)`) + `:8` (the comment
claiming setInteractive "works uniformly across Phaser 4's input system"). Confirmed
`git show 40e2919` (the backpack hit-testing fix landed 01:49) touched only
`BackpackWindow.ts` — `ResultBanner.ts` and `MenuButton.ts` are untouched, so this bug is
exactly as red-team described, present right now.

This is the same root cause as this document's own blocker #1, and `ResultBanner` is one of
the exact components I'd already named there (I'd cited `ResultBanner.ts:38,101` myself) — so
this is a second independent derivation of the same defect, not new territory. What red-team
adds that sharpens the picture: `MenuButton` itself (`MenuButton.ts:64-66`) is the shared
component, not just a ResultBanner-local mistake — grep shows `MenuButton` is also used by
`MainMenuScene`, `SlotSelectScene`, `CharacterSelectScene`, `SkillTreeScene`, none of which
scroll their camera, so those call sites are fine; `ResultBanner` is the only *currently wired*
scrolling-camera consumer of `MenuButton`. That makes `MenuButton`'s own doc comment
("works uniformly...") an active landmine for the next scene that (a) scrolls its camera and
(b) reaches for `MenuButton` for convenience — worth fixing the comment even before fixing the
behavior, so the next author doesn't trust it.

I independently re-verified their severity call rather than taking it on faith:
`BattleScene.ts:2033-2034` (`this.bannerTimer = this.time.delayedCall(6000, () =>
this.dismissResultBanner())`) confirms the 6s auto-dismiss is real, and a full-file grep for
`showFail` confirms it is never called anywhere in `BattleScene.ts` (only `showSuccess`, line
2025) — so red-team's "masked, not blocking, on the one reachable path" downgrade from
blocker to major is accurate as of current code, not stale.

### [minor] Monster render offset not applied to hit-test/HP-bar coordinates — **PARTIALLY OVERTAKEN BY AN IN-FLIGHT UNCOMMITTED FIX; one residual gap found**

The working tree has an *uncommitted* diff to `BattleScene.ts` (self-labeled "hitstun-triad
pen" in its comments) that removes `MON_RENDER_OFFSET_Y` entirely and introduces
`heroVisualCenter()` / `monsterVisualCenter()` / `monsterHitbox()` helpers, then re-points:
the hero's skill hitbox, the monster hit-test box used by both hero melee (`resolveHeroHits`)
and hero skills, `resolveEnemySkillHit`'s hero-side hurtbox, and the HP-bar anchor — all off
these new visual-center helpers instead of raw `state.x/y`, `GROUND_Y`, or the old flat
`-110`/`+30` fudges. This is exactly the fix class red-team's finding calls for, already in
progress (not yet committed).

One gap survives even after this fix: `resolveEnemySkillHit`'s AoE spawn point — sourced from
`monsterBehaviors.ts:317` (`buildSpawn`: `const spawnY = state.y + attack.offsetY`) and
`:757` (`buildOverlayHitboxSpawn`: `y: host.y + attack.offsetY`) — still anchors on the
monster's raw `state.y`, never touched by the in-flight patch. Meanwhile the *hero*-side box
it's tested against (`resolveEnemySkillHit`'s `heroBox`) was just moved onto
`heroVisualCenter()`, i.e. `heroState.vertical.y + roleData.offset.y * HERO_SCALE`. Per the
patch's own comment, `roleData.offset.y = -15` and `HERO_SCALE = 1.5`, so the hero hurtbox
being tested just shifted ~22.5px relative to where the AS3-derived `attack.offsetY` constants
(-60/-30/-86/-21, per-move) were presumably tuned against. I can't fully certify this is a
*new* net regression without knowing what baseline those AS3 offsets assumed on the hero side
originally (may be a wash if the hero's hurtbox was already off by the same amount before this
patch) — flagging as a residual coordinate-consistency gap for whoever finishes this fix to
check explicitly (compare a Monster3 hit2 AoE hit-or-miss before/after this patch at the same
hero position), not re-asserting red-team's original finding as still fully open. Not
independently re-scored; leaving severity to whoever closes out the in-flight fix.
