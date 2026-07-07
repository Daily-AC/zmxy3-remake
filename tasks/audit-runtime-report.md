# Runtime audit — independent re-verification of Opus 4.8's session claims

Audited on a detached git worktree at `origin/master` HEAD `64f9334` (separate from
the main checkout, which had an agent actively editing `game/src/scenes/BattleScene.ts`
during this audit). Ran the real Vite dev server (not the Electron packaging path)
and drove the live game through its `window.__*` debug hooks (`BattleScene.ts` /
`MainMenuScene.ts` / `SlotSelectScene.ts` / `CharacterSelectScene.exposeDebugHooks`),
the same mechanism `tools/acceptance/` uses. Screenshots in
`tmp/debug-shots/audit-runtime-*.png`.

## Verdict summary

| # | Claim | Verdict |
|---|-------|---------|
| 1 | Wave-tier fix (a0a41f3): no boss/sub-boss mixed into grunt waves | **PASS** |
| 2 | Scene-residue fix (2d72596): dialogue/backpack closed on level transition + scene shutdown | **PASS** (backpack + reconnect-timer verified live; dialogue verified by code inspection only, see caveat) |
| 3 | Login flow (b2f37fe): Online-style main menu + 6-slot select | **PASS** |
| 4 | UI swap (015602d): real HUD components, no scaffold text | **PASS** |
| 5 | Save chain: slot save/continue restores level/inventory/equipment | **PASS** |
| 6 | Side findings | see below — one unexplained equip anomaly, expected NPC-WS noise, environment instability notes |

## 1. Wave composition (a0a41f3) — PASS

Read `game/src/systems/level.ts` (generic per-level wave engine, one `activeStopIndex`
active at a time) plus `game/src/data/levels/level1.ts` and `level2.ts`. Both level
packs implement "escalating grunt waves → each mini-boss/King as its own solo stop
point → arena boss" with a written invariant ("no sub-boss shares a roster with
grunts"). This is enforced structurally by the data (no `WaveSpec.roster` mixes a
grunt species with a boss-tier species), not just by convention.

Live-drove level 1 (巫鹰关) end-to-end via `__killGrunts()` + `__levelState()`,
capturing every wave's actual roster:

```
wave0: monster30, monster30, monster30, monster8   (grunt)
wave1: monster7, monster7, monster8                (grunt)
wave2: monster4                                     (mini-boss, solo)
wave3: monster2                                     (mini-boss, solo)
wave4: monster5                                     (mini-boss, solo)
→ boss: monster3 (巫鹰), hp 300/300, isBoss flagged correctly
```

Zero tier-mixing observed across all 5 stop points + boss. Also drove through
into level 2 (天王关, first wave `monster9`/`monster10`, both plain grunts, no
boss) and into level 3 (二郎神关) via the portal chain — consistent with the same
pattern in `level2.ts`'s header comment. `docs/reference` not needed here; this
was verified by both static data inspection and live runtime state.

## 2. Scene-residue fix (2d72596) — PASS, with one caveat

Read the commit diff directly: `startLevel()` now calls `this.dialogue?.close()`
and `this.backpack?.close()` plus hides the boss bar before swapping level content;
a `SHUTDOWN` handler disposes `npcClient` and closes the dialogue on return to menu.

Live-verified:
- **Backpack across level transition**: opened backpack (`__toggleBackpack()`,
  confirmed `window.__scene.backpack.isOpen === true`), pushed through the rest of
  level 2's waves + boss, used the portal into level 3. `backpack.isOpen` was
  `false` immediately after — the window did not bleed into the next level.
- **Reconnect-timer leak on menu return**: called `__returnToMenu()` mid-battle,
  then polled `browser_console_messages` over a 12-second window. The WS-reconnect
  error count froze at 31 and never incremented again — the reconnect timer
  genuinely stops, it isn't just visually hidden. Also checked
  `document.querySelectorAll('input, textarea').length === 0` after the return —
  no orphaned dialogue DOM input leaked into the shell.

**Caveat**: could not runtime-trigger the NPC dialogue box itself, because
`agent-server` (the WS backend the dialogue depends on) isn't running in this
audit environment — `__npcOpen()` returned `dialogueOpen: false` (client stuck in
`reconnecting`) rather than actually opening a dialogue to then test its residue.
The dialogue-close call sites exist in the same `startLevel()`/`SHUTDOWN` code path
already verified for the backpack, so I'm calling this a pass on code-reading
confidence, not a live repro — flagging this gap rather than papering over it.

## 3. Login flow / 6-slot select (b2f37fe) — PASS

Side-by-side screenshot comparison against `docs/reference/zmxy-online-screens/`:

- `audit-runtime-01-boot-menu.png` vs `title-menu.png`: same background art,
  same title lockup, same right-rail menu list order and styling (missing only
  "造梦论坛"/"返回首页" extra items and the CADPA age-rating badge — cosmetic
  omissions, not a different layout).
- `audit-runtime-02-slot-select.png` vs `save-slots.png`: same 2×3 numbered-slot
  grid, same gold-on-black card styling, same modal chrome with a close button.
  Confirmed via `__shellSlots()` that all 6 slots are real, independently
  addressable save slots (not decorative) — created saves in slot 0 and slot 1
  and both persisted independently with distinct level/playtime/timestamp.

## 4. UI swap (015602d) structural check — PASS

`audit-runtime-03-battle-hud.png` / `-04-boss-hud.png`: left-top `RoleInfoHud`
(portrait + level badge, HP/MP/EXP bars, atk/weapon text row) and left-bottom
9-slot skill dock (numbered, per-skill mana cost, level badge) are real rendered
components with live data, not placeholder text — values changed correctly
across level-ups (Lv.1→Lv.7, atk 10→85, HP 80→380). Boss engagement showed a
dedicated top boss name-plate + full-width HP bar (`巫鹰 300/300`), distinct from
the small per-monster head bars grunts get — matches
`docs/reference/zmxy-online-screens/battle-hud.png`'s split between the player's
own bars and the target's. `audit-runtime-05-backpack.png` shows a fully-built
backpack window: equip slots (武器/饰品/时装/头衔/防具/法宝), stat rows (HP/MP/攻击/防御/幸运/魔抗/暴击/闪避/回血/回蓝/EXP),
tabbed item grid with pagination, sell button — not a stub. No raw/unstyled debug
text blocks were visible anywhere in these captures (the on-screen key-hint text
at the very bottom, e.g. "A走 K跳 J攻击...", reads as an intentional dev-build
control legend, not scaffold leftover — worth a call on whether that ships to the
final build, but that's a product decision, not a residue bug).

## 5. Save chain — PASS

Played slot 1 to Lv.7 (equipped weapon, 20 demon_soul / 12 silver_ore / 1 great_pill
in bag, campaignIndex 1/天王关), let autosave fire, then the browser tab was lost
(see environment notes below) and had to be reopened fresh — this incidentally
became a real "did the save survive a full page reload" test rather than a same-session
memory check. `__shellSlots()` showed slot 1 correctly persisted (level 7, playtime
110s). `__shellContinue(1)` restored: level 7, exp 160/625, atk 85, def 14, weapon
"赤炎噬血杖" equipped and visible, and the exact inventory stack quantities —
full fidelity round-trip across a real reload, not just an in-memory state carry-over.

## 6. Side findings

- **Unexplained equip state (low confidence, not confirmed as a bug)**: at one
  point `__worldState().weapon` reported the debug-crafted "赤炎噬血杖" as equipped
  without an explicit `__equip()` call ever being made. I tried to isolate this
  with a clean slot and repeating the same `__giveMaterials()` / `__giveCraftedWeapon()`
  / `__toggleBackpack()` sequence in several orders and could **not** reproduce
  the auto-equip in isolation — `doEquip`/`equip()` call sites in the source are
  all behind explicit `E` keydown or `__equip()`, nothing wired to `addItem`.
  Flagging this as an open question for whoever touches equip/backpack next,
  not as a confirmed defect.
- **Expected noise**: continuous `WebSocket connection to 'ws://localhost:5181/'
  failed` errors throughout — `agent-server` isn't running in this audit
  environment, so NPC dialogue/craft can't come online. Not a regression signal.
- **Environment instability worth flagging to whoever reads this next**: the
  scratchpad directory this audit's git worktree lived in was wiped mid-task
  (replaced by unrelated files from what looked like a different task entirely),
  requiring the worktree to be recreated from scratch at a new path. Separately,
  the Playwright browser tool is a **shared, real Chrome instance** (connected via
  a `chrome-extension://...connect.html` relay) driven concurrently by multiple
  agents/sessions on this machine, not an isolated context per task — tab indices
  are not stable (another agent's activity silently changed "current tab" at least
  twice, and one of my tabs was closed outright mid-audit by something outside my
  control). Every `evaluate`/`screenshot` call in this audit was preceded by an
  explicit tab re-select and an inline `location.port` guard specifically to catch
  this; two attempts were caught and discarded before they could contaminate
  results. Worth surfacing to the user: any other agent doing browser-driven
  verification on this machine concurrently should assume the same risk.

## What wasn't covered

Did not test the NPC dialogue content itself, the craft (炼丹炉) request/response
flow, or the packaged Electron/exe path — all require `agent-server` running
and/or the full packaging pipeline, out of scope for a dev-server runtime audit
focused on the five claims above.
