# Combat, HUD, Effects, Equipment, and Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix combat timing, airborne attacks, hit geometry, stagger recovery, visual anchors, HUD placement, background lifecycle, equipment drops, and autosave without introducing per-image scene constants.

**Architecture:** Keep simulation logic Phaser-independent. Input edges are latched until a real fixed tick; attacks use shared data specs for collision and visuals; effect manifests preserve SWF origins and AS3 spawn rules. BattleScene remains an adapter that renders pure state, owns HUD objects, and persists confirmed personal state.

**Tech Stack:** TypeScript, Phaser 4, Vitest, Python 3, Pillow, FFDec XML, localStorage save slots.

---

### Task 1: Replace the invalid effect scale patch with a source-driven manifest contract

**Files:**
- Modify: `game/src/data/role1Effects.ts`
- Modify: `game/tests/role1Effects.test.ts`
- Modify: `game/tests/battleVisualRegression.test.ts`
- Create: `game/src/systems/visualAttachment.ts`
- Create: `game/tests/visualAttachment.test.ts`

- [ ] **Step 1: Write failing manifest and transform tests**

Add tests that require a pivot, anchor kind, facing offsets, and a single transform function:

```ts
import { describe, expect, it } from 'vitest'
import { resolveVisualAttachment } from '../src/systems/visualAttachment'
import { ROLE1_EFFECTS } from '../src/data/role1Effects'

describe('visual attachment', () => {
  it('mirrors a hero-local AS3 offset without changing the symbol pivot', () => {
    expect(resolveVisualAttachment({
      anchor: { x: 400, y: 300 },
      facing: -1,
      offset: { forward: 120, y: 5 },
      pivotPx: { x: 37, y: 44 },
      scale: 1,
    })).toEqual({ x: 280, y: 305, originX: 37, originY: 44, flipX: false })
  })

  it('ships source pivots and spawn rules instead of arbitrary readability scales', () => {
    expect(ROLE1_EFFECTS.hit1).toMatchObject({
      sourceSymbol: 'Role1Bullet1',
      anchor: 'hero',
      offset: { forward: 120, y: 5 },
    })
    expect(ROLE1_EFFECTS.hit1.pivotPx.x).toBeTypeOf('number')
    expect(ROLE1_EFFECTS.hit1.scale).toBe(1)
  })
})
```

Delete the current assertion that every effect scale must be at least `0.82`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
cd game
npx vitest run tests/role1Effects.test.ts tests/visualAttachment.test.ts tests/battleVisualRegression.test.ts
```

Expected: FAIL because `resolveVisualAttachment`, pivot fields, and source spawn rules do not exist.

- [ ] **Step 3: Add the manifest types and transform**

Implement:

```ts
export type VisualAnchor = 'hero' | 'target' | 'world'

export interface VisualAttachmentSpec {
  anchor: VisualAnchor
  offset: { forward: number; y: number }
  pivotPx: { x: number; y: number }
  scale: number
  followAnchor: boolean
}

export function resolveVisualAttachment(input: {
  anchor: { x: number; y: number }
  facing: -1 | 1
  offset: { forward: number; y: number }
  pivotPx: { x: number; y: number }
  scale: number
}): { x: number; y: number; originX: number; originY: number; flipX: boolean } {
  return {
    x: input.anchor.x + input.facing * input.offset.forward,
    y: input.anchor.y + input.offset.y,
    originX: input.pivotPx.x,
    originY: input.pivotPx.y,
    flipX: input.facing === 1,
  }
}
```

Change `ROLE1_EFFECTS` to include the exact Role1.as normal-combo offsets: hit1/hit2 `120,+5`, hit3 `30,-110`, hit4 `160,-10`, hit5 `165,-20`, hit6 `30,+40`, hit7 `175,-30`, hit8 `forward=-20,y=+30` because it spawns behind the facing direction, and hit9 `120,-50`. Use `scale: 1`; pivot values land in Task 2.

- [ ] **Step 4: Run focused tests**

Expected: manifest shape tests PASS; pivot-value tests remain pending until Task 2 only if guarded by generated fixture data.

- [ ] **Step 5: Commit**

```bash
git add game/src/data/role1Effects.ts game/src/systems/visualAttachment.ts game/tests/role1Effects.test.ts game/tests/visualAttachment.test.ts game/tests/battleVisualRegression.test.ts
git commit -m "refactor: define source-driven combat effect attachments"
```

### Task 2: Preserve SWF symbol origins while normalizing effect frames

**Files:**
- Modify: `tools/normalize-role1-effects.py`
- Create: `tools/test_normalize_role1_effects.py`
- Create: `game/public/assets/extracted/role1-effects/manifest.json`
- Modify: `game/src/data/role1Effects.ts`

- [ ] **Step 1: Write a failing origin regression test**

Create a synthetic sprite with bounds `xmin=-40`, `ymin=-20`, crop box `(10, 5, 90, 65)` and assert the cropped PNG pivot remains relative to the original symbol origin:

```py
def test_cropped_pivot_preserves_symbol_origin():
    pivot = cropped_pivot(
        symbol_origin_px=(40, 20),
        crop_left=10,
        crop_top=5,
    )
    assert pivot == (30, 15)
```

- [ ] **Step 2: Run the Python test and verify failure**

```bash
python3 -m unittest tools/test_normalize_role1_effects.py -v
```

Expected: FAIL because `cropped_pivot` and XML-derived symbol bounds are absent.

- [ ] **Step 3: Extend the normalizer**

Add `--xml game/tmp/role1v690.xml`. Reuse the recursive bounds math from `tools/prefab-compiler/compiler.py` through `importlib.util.spec_from_file_location`. For each source symbol:

```py
symbol_origin_x = -bounds_px["xmin"]
symbol_origin_y = -bounds_px["ymin"]
pivot_x = symbol_origin_x - crop_box[0]
pivot_y = symbol_origin_y - crop_box[1]
```

Write one manifest entry per action with `sourceSymbol`, `frames`, `fps`, `scale`, `pivotPx`, `sourceBoundsPx`, `cropBox`, and the AS3 attachment rule.

- [ ] **Step 4: Regenerate assets and run tests**

```bash
python3 tools/normalize-role1-effects.py --xml game/tmp/role1v690.xml
python3 -m unittest tools/test_normalize_role1_effects.py -v
cd game
npx vitest run tests/role1Effects.test.ts tests/visualAttachment.test.ts
```

Expected: all commands PASS; manifest contains 14 actions and every frame exists.

- [ ] **Step 5: Commit**

```bash
git add tools/normalize-role1-effects.py tools/test_normalize_role1_effects.py game/public/assets/extracted/role1-effects game/src/data/role1Effects.ts
git commit -m "fix: preserve official effect pivots during normalization"
```

### Task 3: Make fixed-timestep input immune to key-repeat speedups and allow air attacks

**Files:**
- Modify: `game/src/systems/heroSim.ts`
- Modify: `game/src/systems/combo.ts`
- Modify: `game/tests/heroSim.test.ts`
- Modify: `game/tests/combo.test.ts`

- [ ] **Step 1: Add failing timing and airborne tests**

Replace the existing “cannot start a combo while airborne” test with:

```ts
it('does not advance simulation time when rapid edges arrive before a fixed tick', () => {
  const s = initHeroState(cfg, 480)
  for (let i = 0; i < 20; i++) advanceHero(s, edges({ pressAttack: true }), 1, cfg)
  expect(s.simClockMs).toBe(0)
  expect(s.attackId).toBe(0)
  advanceHero(s, NO_EDGES, TICK_MS - 20, cfg)
  expect(s.simClockMs).toBe(TICK_MS)
  expect(s.attackId).toBe(1)
})

it('attacks while airborne without changing the jump trajectory', () => {
  const attacked = initHeroState(cfg, 480)
  const control = initHeroState(cfg, 480)
  advanceHero(attacked, edges({ pressJump: true }), TICK_MS, cfg)
  advanceHero(control, edges({ pressJump: true }), TICK_MS, cfg)
  advanceHero(attacked, edges({ pressAttack: true }), TICK_MS, cfg)
  advanceHero(control, NO_EDGES, TICK_MS, cfg)
  expect(attacked.action).toBe('hit1')
  expect(attacked.vertical.y).toBe(control.vertical.y)
  expect(attacked.vertical.vy).toBe(control.vertical.vy)
})
```

- [ ] **Step 2: Run tests and verify failure**

```bash
cd game
npx vitest run tests/heroSim.test.ts tests/combo.test.ts
```

Expected: the first test shows `simClockMs` advanced by rapid edges; the second shows no air attack.

- [ ] **Step 3: Implement input latching and air attack state**

Add to `HeroState`:

```ts
pendingEdges: HeroEdges
airAttack: { elapsedMs: number; durationMs: number } | null
```

Merge incoming edges into `pendingEdges`, drain fixed ticks only while `accMs >= tickMs`, and consume pending edges on the first real tick. Remove the zero-time catch-up tick.

When airborne and idle from another attack, `pressAttack` starts `airAttack` with the hit1 duration and increments `attackId`. During air attack, continue movement physics and return action `hit1`; presses during the active duration are discarded. Ground combos continue to use `stepCombo` unchanged.

- [ ] **Step 4: Run focused tests**

Expected: both suites PASS at 30fps and with 1ms input bursts.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/heroSim.ts game/src/systems/combo.ts game/tests/heroSim.test.ts game/tests/combo.test.ts
git commit -m "fix: decouple attack speed from input frequency"
```

### Task 4: Unify attack visuals and collision under AttackSpec

**Files:**
- Create: `game/src/systems/attackSpec.ts`
- Create: `game/tests/attackSpec.test.ts`
- Modify: `game/src/systems/monsterSim.ts`
- Modify: `game/tests/monsterSim.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`

- [ ] **Step 1: Write failing world-hitbox tests**

```ts
it('uses the same facing transform for the effect and damage box', () => {
  const resolved = resolveAttackSpec(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, -1)
  expect(resolved.effect?.x).toBe(420)
  expect(resolved.hitbox.right).toBeLessThanOrEqual(500)
  expect(overlaps(resolved.hitbox, centeredBox(445, 330, 40, 80))).toBe(true)
})

it('can hit an overlapping hero even after the hero crosses the registration point', () => {
  const resolved = resolveAttackSpec(MONSTER_ATTACKS.monster7.hit1, { x: 500, y: 400 }, 1)
  expect(overlaps(resolved.hitbox, centeredBox(505, 335, 46, 92))).toBe(true)
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/attackSpec.test.ts tests/monsterSim.test.ts
```

Expected: FAIL because `AttackSpec` and `attack-frame` do not exist.

- [ ] **Step 3: Implement AttackSpec and change monster events**

Define:

```ts
export interface AttackSpec {
  action: string
  hitFrameFraction: number
  hitbox: { forward: number; y: number; width: number; height: number }
  effect?: VisualAttachmentSpec & { action: string }
}
```

`monsterSim` emits `attack-frame` once when the animation crosses the hit fraction. It no longer decides a melee hit from `meleeReach` and facing-side equality. BattleScene resolves the AttackSpec against `currentHeroBounds()` and applies damage only on overlap.

Add exact L1 monster effect offsets from AS3: Monster3 `105,-60` and `155,-30`; Monster7 `80,-86`; Monster8 `97,-85` and `46,-30`; Monster30 effect at the monster origin.

- [ ] **Step 4: Run focused tests**

Expected: collision tests PASS; the old “wrong facing side always misses” test is removed because geometry now decides.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/attackSpec.ts game/tests/attackSpec.test.ts game/src/systems/monsterSim.ts game/tests/monsterSim.test.ts game/src/scenes/BattleScene.ts
git commit -m "refactor: drive attack effects and hitboxes from shared specs"
```

### Task 5: Replace 24-hit immunity with short stagger armor

**Files:**
- Modify: `game/src/systems/monsterSim.ts`
- Modify: `game/tests/monsterSim.test.ts`

- [ ] **Step 1: Write failing stagger-counter tests**

```ts
it('lets a grunt take damage but stops re-entering hurt after four consecutive staggers', () => {
  const cfg = makeCfg()
  const m = initMonster(cfg, 500, 400)
  for (let id = 1; id <= 4; id++) {
    advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: id, damage: 8 } }, TICK_MS, cfg)
  }
  const hp = m.hp
  advanceMonster(m, { heroX: 500, heroAlive: true, incomingHit: { attackId: 5, damage: 8 } }, TICK_MS, cfg)
  expect(m.hp).toBeLessThan(hp)
  expect(m.staggerArmorMs).toBeGreaterThan(0)
  expect(m.mode).not.toBe('hurt')
})
```

Add a boss test with threshold six and a reset test after 2000ms without hits.

- [ ] **Step 2: Run test and verify failure**

Expected: current code stays in hurt until the 24th hit and then rejects damage entirely.

- [ ] **Step 3: Implement stagger armor**

Replace `beattackedTimes/protectionMs` with:

```ts
staggerHits: number
staggerArmorMs: number
staggerResetMs: number
```

On each new nonlethal hit, apply damage first. If armor is active, keep the current non-hurt mode. Otherwise increment staggerHits; at 4 for grunts or 6 for bosses set armor to 1200ms and transition to chase so AI may attack. Reset the counter after 2000ms without a new hit.

- [ ] **Step 4: Run monster tests**

Expected: damage continues during armor, hurt no longer refreshes indefinitely, and old AS3 full-immunity tests are removed.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/monsterSim.ts game/tests/monsterSim.test.ts
git commit -m "fix: let monsters counter after repeated staggers"
```

### Task 6: Wire official hero and monster attack effects with correct pivots

**Files:**
- Create: `tools/normalize-monster-effects.py`
- Create: `tools/test_normalize_monster_effects.py`
- Create: `game/src/data/monsterEffects.ts`
- Create: `game/tests/monsterEffects.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/tests/battleVisualRegression.test.ts`
- Add generated exports under: `game/public/assets/extracted/monster-effects/`

- [ ] **Step 1: Add failing asset and mapping tests**

Assert the six known L1 effects exist and preserve pivots:

```ts
expect(MONSTER_EFFECTS).toMatchObject({
  Monster30Bullet1: { frames: 10 },
  Monster8Bullet1: { frames: 1 },
  Monster8Bullet2: { frames: 4 },
  Monster3Bullet1: { frames: 5 },
  Monster3Bullet2: { frames: 10 },
  Monster7Bullet1: { frames: 1 },
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/monsterEffects.test.ts tests/battleVisualRegression.test.ts
```

- [ ] **Step 3: Normalize existing vendor exports**

Read the six `vendor/extracted/level1/bg_sprites/DefineSprite_*` directories, derive pivots from `game/tmp/prefab-dev/level1.xml`, and emit a manifest plus normalized frames. Do not generate new art because all six source symbols exist.

In BattleScene, replace hand-authored `forward` constants with `resolveVisualAttachment`. Keep the already-added behavior that normal attack effects start on swing even when the attack misses.

- [ ] **Step 4: Run tests and browser smoke**

```bash
python3 -m unittest tools/test_normalize_monster_effects.py -v
cd game
npx vitest run tests/monsterEffects.test.ts tests/role1Effects.test.ts tests/battleVisualRegression.test.ts
```

Expected: all effects map to existing PNGs; browser screenshots show effect origins aligned with staffs, hands, mouths, and hitboxes.

- [ ] **Step 5: Commit**

```bash
git add tools/normalize-monster-effects.py tools/test_normalize_monster_effects.py game/src/data/monsterEffects.ts game/tests/monsterEffects.test.ts game/public/assets/extracted/monster-effects game/src/scenes/BattleScene.ts game/tests/battleVisualRegression.test.ts
git commit -m "feat: restore official monster attack effects"
```

### Task 7: Implement HUD A anchors and robust background lifecycle

**Files:**
- Modify: `game/src/ui/hud/MonsterHpBar.ts`
- Modify: `game/src/ui/hud/RoleInfoHud.ts`
- Create: `game/src/systems/hudLayout.ts`
- Create: `game/tests/hudLayout.test.ts`
- Create: `game/src/systems/backgroundLifecycle.ts`
- Create: `game/tests/backgroundLifecycle.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`

- [ ] **Step 1: Write failing layout and lifecycle tests**

```ts
expect(bossHudPosition({ canvasWidth: 960, roleHudBottom: 96, gap: 12 })).toEqual({ x: 480, y: 108 })
expect(remotePlateY({ visibleTopY: 210, gap: 10 })).toBe(200)
```

Add a background test that creates level A, switches to B, then rebuilds B after context restore and asserts B owns a fresh container while shared texture frame data is unchanged.

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/hudLayout.test.ts tests/backgroundLifecycle.test.ts
```

- [ ] **Step 3: Implement layout and background ownership**

Expose `RoleInfoHud.bounds()` and use its bottom edge to position BossHpBar at screen center. Use the existing visible-content helper for remote heroes rather than `py - 118`.

Create one background container per active level. Build the new container completely, then swap visibility and destroy the old container. Never call `setCrop` or mutate frame data on shared textures; apply crop/scale to the image instance. Rebuild from current level state on Phaser context restore.

- [ ] **Step 4: Run tests and visual regression**

```bash
cd game
npx vitest run tests/hudLayout.test.ts tests/backgroundLifecycle.test.ts tests/battleVisualRegression.test.ts
```

Expected: PASS; screenshots show the centered Boss bar below RoleInfo and a 10px remote-nameplate gap in wait/run/jump/hit actions.

- [ ] **Step 5: Commit**

```bash
git add game/src/ui/hud/MonsterHpBar.ts game/src/ui/hud/RoleInfoHud.ts game/src/systems/hudLayout.ts game/tests/hudLayout.test.ts game/src/systems/backgroundLifecycle.ts game/tests/backgroundLifecycle.test.ts game/src/scenes/BattleScene.ts
git commit -m "fix: anchor combat HUD and rebuild backgrounds safely"
```

### Task 8: Make dropped original equipment carry real stats

**Files:**
- Create: `game/src/systems/originalEquipment.ts`
- Create: `game/tests/originalEquipment.test.ts`
- Modify: `game/src/systems/dropRoll.ts`
- Modify: `game/src/systems/furnaceRecipe.ts`
- Modify: `game/tests/dropRoll.test.ts`
- Modify: `game/tests/furnaceRecipe.test.ts`

- [ ] **Step 1: Write failing shared-conversion tests**

```ts
it('produces the same runtime item from a monster drop and a furnace lookup', () => {
  const dropped = originalEquipmentToRuntimeItem('ptdxzg', () => 0)
  const crafted = runtimeItemForEquipmentFillName('ptdxzg', () => 0)
  expect(dropped).toEqual(crafted)
  expect(dropped.kind).toBe('equip')
  expect(dropped.effects?.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Verify failure**

Expected: drop conversion returns source metadata without stat effects.

- [ ] **Step 3: Extract the shared converter**

Move the original equipment field mapping from `furnaceRecipe.ts` into `originalEquipment.ts`. Convert `ehp`, `emp`, `eatt`, `edef`, `ecrit`, `emiss`, `eatblood`, and `magicdef` to runtime effects. Have both dropRoll and furnaceRecipe call the same function.

- [ ] **Step 4: Run tests**

```bash
cd game
npx vitest run tests/originalEquipment.test.ts tests/dropRoll.test.ts tests/furnaceRecipe.test.ts tests/equipment.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/originalEquipment.ts game/tests/originalEquipment.test.ts game/src/systems/dropRoll.ts game/src/systems/furnaceRecipe.ts game/tests/dropRoll.test.ts game/tests/furnaceRecipe.test.ts
git commit -m "fix: preserve original stats on equipment drops"
```

### Task 9: Add periodic and lifecycle autosave

**Files:**
- Create: `game/src/systems/autosave.ts`
- Create: `game/tests/autosave.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/tests/saveSlots.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

```ts
it('coalesces frequent dirty events and still saves every 30 seconds', () => {
  const saves: number[] = []
  const autosave = createAutosaveController({ save: () => saves.push(now), debounceMs: 500, intervalMs: 30_000 })
  autosave.markDirty(100)
  autosave.markDirty(200)
  autosave.tick(699)
  expect(saves).toEqual([])
  autosave.tick(700)
  expect(saves).toEqual([700])
  autosave.tick(30_700)
  expect(saves).toEqual([700, 30_700])
})
```

- [ ] **Step 2: Verify failure**

```bash
cd game
npx vitest run tests/autosave.test.ts tests/saveSlots.test.ts
```

- [ ] **Step 3: Implement and wire autosave**

Create a controller with `markDirty(now)`, `tick(now)`, and `flush()`. BattleScene calls `markDirty` for confirmed reward, inventory, equipment, skill, level, and soul changes; calls `tick` from update; and calls `flush` on `visibilitychange=hidden`, `pagehide`, scene shutdown, level completion, and manual exit. Do not persist predicted coop state.

- [ ] **Step 4: Run focused and full game tests**

```bash
cd game
npx vitest run tests/autosave.test.ts tests/save.test.ts tests/saveSlots.test.ts
npm test
npm run build
```

Expected: 66 or more test files pass, TypeScript build succeeds, and no save is duplicated within the debounce window.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/autosave.ts game/tests/autosave.test.ts game/src/scenes/BattleScene.ts game/tests/saveSlots.test.ts
git commit -m "feat: autosave confirmed player progress"
```

### Task 10: Browser acceptance for the combat/UI delivery

**Files:**
- Create: `tasks/combat-ui-save-report.md`
- Update only if defects are found: files from Tasks 1-9

- [ ] **Step 1: Start the game server**

```bash
cd game
npm run dev -- --host 127.0.0.1
```

- [ ] **Step 2: Run scripted browser checks**

Verify at 960x540 and a mobile viewport:

```text
1. Rapid J input cannot shorten hit1 or complete a combo faster than animation durations.
2. Jump, press J, and confirm hit1 plays while the arc and landing time match the control jump.
3. Trigger all Role1 effects and L1 monster effects; pivots remain attached through facing changes.
4. Hit a grunt five times; damage continues while the monster leaves hurt and counters.
5. Stand inside Monster7/8 attack geometry; matching visual overlap causes one hero hit.
6. Boss bar remains centered below RoleInfo; MP stays unobstructed.
7. Remote nameplate stays 10px above wait/run/jump/hit visible bounds.
8. Switch levels repeatedly, resize, and force a context restore; backgrounds remain visible.
9. Kill a dropping monster, equip the item, and confirm stats change.
10. Wait 30 seconds, hide/show the page, reload, and confirm progress persisted.
```

- [ ] **Step 3: Capture evidence**

Save desktop/mobile screenshots and a short JSON result from debug hooks under ignored `tmp/verification/`. Record exact filenames and observed values in `tasks/combat-ui-save-report.md`.

- [ ] **Step 4: Run final verification**

```bash
cd game
npm test
npm run build
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add tasks/combat-ui-save-report.md
git commit -m "docs: verify combat UI and autosave delivery"
```
