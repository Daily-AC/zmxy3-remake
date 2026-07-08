# Red-team review: player-facing correctness (2026-07-09)

Scope: game/src/ (scenes/systems/ui/net/data), traced along "主菜单玩到 L2 通关" path.
The three already-known-and-being-fixed issues (背包命中区 / 双向命中错位 / 无限眩晕) are
excluded per brief; findings below are new or are same-family siblings of those.

## [major] All monster kills award monster30's loot table, not their own

- **File**: `game/src/scenes/BattleScene.ts:2183-2188` (`spawnDrops`)
- **Defect**: `spawnDrops(x, y)` calls `rollDrops('monster30', Math.random)` unconditionally.
  It is never passed the dying monster's actual species, unlike its sibling call one line
  above it (`awardKillExp(ev.x, ev.y, e.species)`, `BattleScene.ts:2049`), which correctly
  forwards `e.species`. `data/drops.json` has distinct, curated tables for `monster2/3/4/5/7/8`
  (e.g. `monster3` — 巫鹰, the L1 boss — is supposed to drop `torn_charm/spirit_grass/cotton_robe`)
  but `dropRoll.rollDrops` is called from exactly one call site in the whole codebase, always
  with the literal string `'monster30'`. Six of the seven authored drop tables are dead data.
- **Trigger**: Kill anything other than a monster30 swarm imp — a grunt on the L1 ground wave,
  or either L1/L2 boss (巫鹰, 多闻天王) — and inspect what drops. It will always be from
  `{demon_soul, silver_ore, great_pill}` (monster30's table) instead of the species' own table.
  Most visible on a boss kill: the two boss-tier tables were clearly authored to feel like a
  reward (see `monster8`'s `star_blade`), but a boss kill currently can't produce them.
- **Fix**: pass `e.species` into `rollDrops` at the `spawnDrops` call site, same as
  `awardKillExp` already does.

## [major] ResultBanner's 继续/重新挑战 buttons use the same broken hit-test pattern BackpackWindow's own comment documents as fixed elsewhere, but was never applied here

- **Files**: `game/src/ui/hud/ResultBanner.ts:38` (dim backdrop), `:101` (retry image),
  `game/src/ui/menu/MenuButton.ts:64-66` (`this.hit` — backs the "继续"/"重新挑战" `MenuButton`s
  ResultBanner constructs at `ResultBanner.ts:106-126`)
- **Defect**: All of these call Phaser's `setInteractive()` directly on a GameObject that lives
  inside a `container(...).setScrollFactor(0)` (`ResultBanner.ts:39,129`; `MenuButton.ts:91-93`).
  `ui/hud/BackpackWindow.ts:128-142` documents, from a real user report, exactly why this is
  broken: Phaser hit-tests an interactive object by converting the pointer to world space via
  the *camera's current scroll*, which does not account for `scrollFactor(0)` — so once
  BattleScene's camera has scrolled even slightly, every such hit zone drifts away from where
  the button is actually drawn on screen. `BackpackWindow` and `SkillBarHud` were both moved off
  this pattern onto manual screen-space hit-testing after that report; `ResultBanner` (and the
  shared `MenuButton` component it uses) was not. `MenuButton.ts:8`'s own comment even asserts
  the opposite ("works uniformly across Phaser 4's input system"), which is only true in scenes
  whose camera never scrolls (menus/worldmap) — not in `BattleScene`, which calls
  `this.cameras.main.startFollow(this.hero, true, 0.1, 0.1)` (`BattleScene.ts:698`) over a
  1560-wide world with a 960-wide viewport, so scroll is the normal state, not an edge case.
- **Trigger**: fight through to a boss (guaranteed camera scroll away from x=0 by then — bosses
  spawn at `MON_START_X=900`, `HERO_START_X=480`), kill it, and click "继续" on the 挑战成功
  banner. The click will miss.
- **Severity note**: currently *masked*, not blocking, on the one reachable path — 
  `showResultBanner` also arms a 6s `delayedCall` (`BattleScene.ts:1976`) that calls
  `dismissResultBanner()` regardless of the button, so the player isn't stuck, just stuck
  watching a dead button for up to 6s before the game moves on by itself. `showFail()` is never
  invoked anywhere yet (no fail state wired), so the "重新挑战" button's version of this bug is
  currently inert rather than blocking a retry. Filed as major rather than blocker for that
  reason, but it's the same root cause as the already-fixed 背包窗 bug and will surface as a
  hard block the moment a fail state or a shorter timeout is added.
- **Fix**: same screen-space hit-testing swap already applied to `BackpackWindow`/`SkillBarHud`,
  or stop parenting these under a `scrollFactor(0)` container inside a scrolling-camera scene.

## [minor] Monster render offset isn't applied to the monster's own hit-test/HP-bar coordinates

- **File**: `game/src/scenes/BattleScene.ts:2307` (sprite placement) vs. `:1917`
  (`resolveHeroHits`'s `centeredBox(e.state.x, e.state.y, 120, 140)`), `:2062-2063`
  (`resolveEnemySkillHit`'s AoE spawn uses `state.y + attack.offsetY` via `buildSpawn`/
  `buildOverlayHitboxSpawn` in `monsterBehaviors.ts`), and `:2309` (`e.hpBar?.update(...,
  e.state.x, e.state.y - 110)`)
- **Defect**: `renderEntity` draws every monster's sprite at
  `e.state.y + MON_RENDER_OFFSET_Y + off.y * e.scale` — an unconditional +30px applied only at
  render time. Every piece of combat math that uses the monster's y (the hero's melee overlap
  box, Monster3's hit2 AoE spawn point, and the HP-bar anchor) still reads the raw, un-shifted
  `e.state.y`. So the game computes hits and anchors the HP bar 30px above where the monster is
  actually drawn. The hero's swing box (150px tall) and the monster's hit box (140px tall) are
  tall enough that most swings still connect near their shared centre, so this doesn't read as
  outright whiffing, but it's a real, unconditional, global coordinate disagreement squarely in
  the "logic y vs. render origin" family the other fixed bugs (背包窗/双向命中错位) are also in.
- **Trigger**: most visible on the grunt HP bar — watch any grunt during a fight; the bar sits
  detectably higher above its head than a "just above the sprite" anchor would put it, because
  it's positioned relative to a y that's 30px above where the sprite is actually drawn.
- **Fix**: fold `MON_RENDER_OFFSET_Y` into `e.state.y` at spawn/tick time (so sim and render
  agree), or apply the same +30 wherever `e.state.y` is read for hit-testing/HP-bar placement.

---

## Summary

3 findings: 0 blocker, 2 major, 1 minor. Kept deliberately short — several other candidates
(grunt attack-power heuristic at `BattleScene.ts:1423`, the L1-climb drop/pickup y-reference,
L2-species melee-timing fallback) were investigated and are self-documented TODO-verify
placeholders or turned out to cancel out on inspection, not real defects, so they're omitted.

**Top finding to fix first**: the drops bug (#1) — one-line fix (`e.species` instead of the
literal `'monster30'`), silently defeats 6 of 7 authored loot tables including both current
bosses', and is the kind of thing a player will notice immediately ("I killed the boss and got
the same junk I get from every grunt").

---

## 对蓝队 blocker/major 的对抗验证 (2026-07-09)

Read every cited line myself before ruling. Verdicts: 2 blockers CONFIRMED (one of them,
arguably, should outrank my own #1 as the single worst bug in the game), 1 blocker CONFIRMED
but with a real sub-claim refuted and the headline impact overstated, and both majors CONFIRMED
at the code level with one nuance each.

### [blocker] camera-scroll setInteractive bug, 4 sites — CONFIRMED for 2, REFUTED for 1 sub-claim, impact overstated

Verified directly:
- `FurnacePanel.ts:103,127,168,240` — real, `.setInteractive()` on the dim/craftBtn/closeBtn/
  chip rects, all children of the `.setScrollFactor(0)` container at `:173`. Confirms my own
  independent read of this file earlier in this review.
- `ResultBanner.ts:38,101` + `MenuButton.ts:64-66` — real, same pattern, and this one **is**
  player-reachable (see my finding #2 above, which is the same bug from the other direction).

**Refuted sub-claim**: `BackpackWindow.ts:560-566` (`redrawEquip`) and `:612-620` (`buildCell`)
do **not** call `.setInteractive()` at all. `grep -n "setInteractive" ui/hud/BackpackWindow.ts`
returns zero matches outside comments — every hit is either the header note (`:128-142`)
explaining why the file avoids the pattern, or an inline comment ("Click/hover hotspot: see
resolveHit(), not a GameObject any more", `:561`,`:609`) on the exact lines blue cites. Those
two functions push plain data (`{slot,item,rect}` / `{stack,rect}`) into `equipHits`/`gridHits`
arrays that `resolveHit()` walks by hand — this *is* the fixed pattern, not a violation of it.
Blue's claim that BackpackWindow "violates its own fix... within itself" doesn't hold; whoever
wrote that sub-claim likely pattern-matched on "adds a rect to a scrollFactor(0) layer" without
checking whether `.setInteractive()` was actually called on it.

**Impact overstated**: blue's headline says this "makes crafting... effectively unclickable
mid-level." That's not true of the game as it currently plays. The forge's real, current entry
point is `WorldMapScene`'s 炼丹炉 button (`WorldMapScene.ts:288-298` builds its own
`FurnacePanel`; `DialogueBox.ts:130-133` and `BattleScene.ts:1645-1648` both confirm in comments
that BattleScene stopped wiring a craft-entry button after S1). `grep -n
"scrollX|scrollY|startFollow|cameras.main" scenes/WorldMapScene.ts` returns **nothing** — that
scene never moves its camera, so `scrollFactor(0)` is a no-op there and `FurnacePanel`'s bug
never fires for an actual player today. `BattleScene` still owns a `FurnacePanel` instance too
(where the camera *does* scroll), but `openCraftMode()` — the only thing that calls
`this.furnacePanel.open(...)` there — is called from exactly one place,
`w.__openCraft` (`BattleScene.ts:2706-2710`), a debug/acceptance hook, not any button a player
can click. So of the 4 sites: `ResultBanner` is genuinely live and broken today; `FurnacePanel`
and `DialogueBox`'s 炼宝 button are real code defects but currently inert from a *player's*
seat (correctly fix them anyway — worth doing in the same pass, since WorldMapScene growing a
scrolling camera or BattleScene's forge getting rewired are both plausible near-term changes).

### [blocker] save slots 3-5 silently never persist — CONFIRMED, and I'd rank this above my own #1/#2

Verified: `BattleScene.ts:792` — `this.activeSlot = slot === 0 || slot === 1 || slot === 2 ?
(slot as SlotId) : null`. `saveSlots.ts:26-28` — `SLOT_COUNT = 6`, `SlotId = 0|1|2|3|4|5`,
`SLOT_IDS = [0,1,2,3,4,5]`. `SlotSelectScene.ts` imports and iterates `SLOT_IDS` (all 6) to
render every slot card and drives `startNewGame`/`continueGame` off any of them
(`SlotSelectScene.ts:232-251`). `WorldMapScene.ts:117` and `SkillTreeScene.ts:182` each define
their own (correct) `asSlotId(v)` accepting the full `0|1|2|3|4|5` range — so BattleScene is
provably the one outlier, not an intentional 3-slot design. `saveToSlot()` no-ops on
`activeSlot === null` and is the sole write path for exp/level (`:2115`), equip/unequip
(`:2485`,`:2495` in my read of the file — line numbers shift slightly from blue's citation but
the call sites and the guard are exactly as described), crafted-item pickup, and campaign
frontier advance.
**Trigger, in player terms**: on the slot-select screen, pick any of the 3 rightmost/bottom
save slots (as rendered — nothing in the UI marks them as different from the first 3), play a
session — kill things, level up, equip gear, clear a level — then back out to the menu.
Every bit of that session is gone: not "some progress," literally 100% of it, silently, with no
error toast, because `saveToSlot()` returned instantly every single time it was called.
**This is worse than a UI drift bug or a wrong-loot-table bug — it's the save system lying about
how many save slots it has.** I'd put it ahead of my own findings and blue's drops-table finding
as the single most damaging item in both reports combined.

### [major] `equipment.equip()` can delete the previously-worn item — CONFIRMED, with one nuance that sharpens (doesn't shrink) the trigger

Verified `equipment.ts:37-45`: `eq[slot] = item` at line 42 happens unconditionally, then
`addItem(inv, prev, 1)` at line 43 is called for its side effect only — the `{ok, overflow}`
result is discarded. `unequip()` three lines below (`:48-54`) checks `addItem(...).ok` *first*
and bails before mutating `eq[slot]`, so the asymmetry is real and looks like an oversight, not
a deliberate design choice. `BattleScene.doEquip` (`:2481-2488` in my read) calls `equip(...)`
and unconditionally toasts a success message — no capacity check anywhere in the call chain.

One thing worth adding to blue's writeup: `inventory.removeItem` (`inventory.ts:65-68`) splices
out any stack that reaches qty 0, so the *common* swap case — equipping the only copy (qty=1)
of a distinct item — actually frees one `inv.stacks` slot right before `addItem(inv, prev, 1)`
runs, which often coincidentally makes room for `prev` even at "full" capacity. That narrows
the reachable window but doesn't remove it: it still reproduces whenever the item being
equipped comes from a stack with qty ≥ 2 (realistic — e.g. picking up two drops of the same
equip-kind item before opening the bag) while the bag is otherwise full and `prev`'s item type
has no existing stack to merge into. Net: confirmed real, and since Stage A funnels every
equip-kind item into the single `weapon` slot (`equipment.ts:24-26`), gear-swapping happens on
essentially every equip action, so the window is reachable, just not on-every-swap the way
blue's writeup could be read to imply.

### [major] Toast vs FurnacePanel same-depth collision — CONFIRMED, and the reachable trigger is actually in a different file than cited

Verified the literal collision: `Toast.ts:109` and `FurnacePanel.ts:173` both hard-code
`.setDepth(210)`. Blue's cited trigger — `BattleScene.submitCraft`'s validation-failure
branches (`:1682,1686,1690,1710`) calling `showToast` without `furnacePanel.close()` first — is
real code, but per the previous finding above, `BattleScene`'s `FurnacePanel` path is only
reachable via the `__openCraft`/`__submitCraft` debug hooks today, not real player UI. I checked
whether the *actual* player-facing forge (`WorldMapScene`) has the same gap, since it also
shares the `Toast` class: it does — `WorldMapScene.submitCraft` (`:327-358`) calls
`this.toastUi.show(...)` on every one of its own validation failures (empty selection, empty
wish, NPC offline, insufficient materials) with no matching `furnacePanel.close()`/hide call
anywhere in that branch. So the depth collision **is** live in real play, just via
`WorldMapScene.ts:327-358` rather than the `BattleScene.ts` lines blue cited — the finding
should cite both files, and if anything undersells how reachable it is (a player mistyping an
empty wish while the forge is open is a completely ordinary interaction, not an edge case).
