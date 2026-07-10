# Hackathon MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and publicly deploy the approved two-player L1/L2 hackathon loop with deterministic starter equipment, beginner crafting, and host-authoritative monster damage against remote players.

**Architecture:** Keep inventory, equipment, crafting, and coop protocol logic Phaser-independent and test it directly. BattleScene only spawns deterministic world pickups and adapts host attack geometry into targeted coop events. Reuse the existing public social-server relay; no server protocol change is required because room `event` payloads are generic.

**Tech Stack:** TypeScript, Phaser 4, Vitest, Express/WebSocket social server, Vite, public Caddy deployment.

---

### Task 1: Make recovered equipment wearable and effective

**Files:**
- Modify: `game/src/systems/equipment.ts`
- Modify: `game/src/systems/furnaceRecipe.ts`
- Modify: `game/src/systems/dropRoll.ts`
- Modify: `game/tests/equipment.test.ts`
- Modify: `game/tests/dropRoll.test.ts`
- Modify: `game/tests/furnaceRecipe.test.ts`

- [ ] **Step 1: Write failing slot and stat tests**

Add cases that map original source types and verify a recovered armor item changes hero stats:

```ts
expect(slotForItem(equipmentItemByFillName('ptdxzg')!)).toBe('weapon')
expect(slotForItem(equipmentItemByFillName('ptdxzf')!)).toBe('armor')
expect(slotForItem(equipmentItemByFillName('xhz')!)).toBe('accessory')
expect(slotForItem({ ...staff, sourceType: 'zbfb' })).toBe('talisman')
expect(equipmentItemByFillName('ptdxzf')!.effects).toContainEqual({ type: 'stat', stat: 'def', value: 2 })
```

Extend the Monster3 boss drop assertion so `ptdxzg` carries its minimum `atk: 2` effect.

- [ ] **Step 2: Run RED**

```bash
cd game
npx vitest run tests/equipment.test.ts tests/dropRoll.test.ts tests/furnaceRecipe.test.ts
```

Expected: armor/accessory/talisman route to `weapon`, and recovered non-crafted equipment has no effects.

- [ ] **Step 3: Implement source-driven runtime items**

Change `slotForItem` to use original type metadata:

```ts
const SLOT_BY_SOURCE_TYPE: Partial<Record<string, EquipSlot>> = {
  zbwq: 'weapon',
  zbfj: 'armor',
  zbsp: 'accessory',
  zbfb: 'talisman',
}

export function slotForItem(item: Item): EquipSlot | null {
  if (item.kind !== 'equip') return null
  return SLOT_BY_SOURCE_TYPE[item.sourceType ?? ''] ?? 'weapon'
}
```

Make `equipmentItemByFillName(fillName, rng = () => 0)` attach `equipmentEffects` for equip items. In `dropRoll.ts`, resolve known fall-list entries through this function so dropped equipment uses deterministic minimum original stats without consuming extra drop RNG values. Preserve the existing fallback for unknown entries.

- [ ] **Step 4: Run GREEN and build**

```bash
cd game
npx vitest run tests/equipment.test.ts tests/dropRoll.test.ts tests/furnaceRecipe.test.ts tests/heroIdentity.test.ts tests/save.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add game/src/systems/equipment.ts game/src/systems/furnaceRecipe.ts game/src/systems/dropRoll.ts game/tests/equipment.test.ts game/tests/dropRoll.test.ts game/tests/furnaceRecipe.test.ts
git commit -m "feat: make recovered equipment wearable"
```

### Task 2: Guarantee the starter pickup and furnace loop

**Files:**
- Create: `game/src/systems/starterRewards.ts`
- Create: `game/tests/starterRewards.test.ts`
- Modify: `game/src/systems/furnaceRecipe.ts`
- Modify: `game/tests/furnaceRecipe.test.ts`
- Modify: `game/src/ui/hud/FurnaceRecipeView.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/tests/battleScenePickupWiring.test.ts`

- [ ] **Step 1: Write failing reward and beginner recipe tests**

Define the exact reward contract:

```ts
expect(l1StarterRewards('monster3', { stage: 1, level: 1 })).toEqual([
  { item: expect.objectContaining({ id: 'ptdxzg', sourceType: 'zbwq' }), qty: 1 },
  { item: expect.objectContaining({ id: 'ptdxzf', sourceType: 'zbfj' }), qty: 1 },
  { item: expect.objectContaining({ id: 'wptm', kind: 'material' }), qty: 3 },
])
expect(l1StarterRewards('monster7', { stage: 1, level: 1 })).toEqual([])
```

Add a beginner craft test with inventory containing `wptm x3` and soul `20`; `craft(inv, 20, 'starter_whg')` must consume all three wood and 20 soul, add one `whg`, attach `{ stat: 'atk', value: 10 }`, and require no book.

- [ ] **Step 2: Run RED**

```bash
cd game
npx vitest run tests/starterRewards.test.ts tests/furnaceRecipe.test.ts tests/battleScenePickupWiring.test.ts
```

Expected: starter reward module and recipe do not exist.

- [ ] **Step 3: Add deterministic ground rewards**

Implement `starterRewards.ts` with only the approved L1 Monster3 context. Resolve all three items through `equipmentItemByFillName` and throw during module initialization if a referenced original item is absent.

In `BattleScene.spawnDrops`, append starter rewards after ordinary drops:

```ts
const rewards = l1StarterRewards(species, this.dropRollContext())
for (const [index, reward] of rewards.entries()) {
  const drop = spawnDrop(reward.item, reward.qty, x + (index - 1) * 34, y)
  this.drops.push(drop)
  this.dropSprites.set(drop, this.makeDropSprite(drop))
}
```

These remain real world drops and flow through `stepDropsAndPickup()` and `saveToSlot()`.

- [ ] **Step 4: Add the beginner furnace recipe**

Extend `FurnaceRecipe` with `requiresBook: boolean`. Existing recipes set it to `true`. Prepend:

```ts
const BEGINNER_RECIPE: FurnaceRecipe = {
  bookFillName: 'starter_whg',
  bookName: '新手锻造：尾火棍',
  productFillName: 'whg',
  productName: '尾火棍',
  role: '悟空',
  quality: '优 秀',
  materials: [{ fillName: 'wptm', name: '檀木', qty: 3 }],
  soulCost: 20,
  requiresBook: false,
}
```

Skip the missing-book check and book removal when `requiresBook` is false. Force `rng=() => 0` for this recipe so the Tail Fire Staff gets its original minimum `atk: 10`. Update `FurnaceRecipeView.materialLine` to render `无需制作书` instead of implying a book requirement.

- [ ] **Step 5: Run GREEN, full focused flow, and build**

```bash
cd game
npx vitest run tests/starterRewards.test.ts tests/furnaceRecipe.test.ts tests/battleScenePickupWiring.test.ts tests/pickup.test.ts tests/save.test.ts tests/campaignProgress.test.ts tests/level1HeadlessSmoke.test.ts tests/level2.test.ts
npm run build
```

Expected: all pass; L1/L2 campaign tests remain green.

- [ ] **Step 6: Commit**

```bash
git add game/src/systems/starterRewards.ts game/tests/starterRewards.test.ts game/src/systems/furnaceRecipe.ts game/tests/furnaceRecipe.test.ts game/src/ui/hud/FurnaceRecipeView.ts game/src/scenes/BattleScene.ts game/tests/battleScenePickupWiring.test.ts
git commit -m "feat: add deterministic starter crafting loop"
```

### Task 3: Let host-authoritative monsters damage remote players

**Files:**
- Modify: `game/src/systems/coopSync.ts`
- Modify: `game/tests/coopSync.test.ts`
- Modify: `game/src/net/coopChannel.ts`
- Modify: `game/tests/coopChannel.test.ts`
- Modify: `game/src/scenes/BattleScene.ts`
- Modify: `game/tests/battleSceneCoopIntegration.test.ts`

- [ ] **Step 1: Write failing codec and authority tests**

Add the targeted payload:

```ts
export interface HeroHitPayload {
  targetUserId: string
  sourceId: string
  attackId: number
  power: number
  attackKind: 'physics' | 'magic'
  knockbackX: number
}
```

Test that `encodeHeroHit` round-trips; a peer accepts `hero_hit` only when `fromUserId` is the configured host and `targetUserId` is local; non-host and other-target events produce ignored effects. The accepted result emits `{ type: 'hero_hit_received', hit }`.

- [ ] **Step 2: Run RED**

```bash
cd game
npx vitest run tests/coopSync.test.ts tests/coopChannel.test.ts tests/battleSceneCoopIntegration.test.ts
```

Expected: `hero_hit` protocol and BattleScene wiring do not exist.

- [ ] **Step 3: Implement the pure protocol path**

Add `hero_hit` to `CoopEventName`, codec validation, `applyCoopMessage`, and `CoopSyncEffect`. `applyHeroHit` must not mutate monster/hero snapshots; it only authenticates sender/target and emits an effect. HeroCombat already deduplicates by `sourceId:attackId`.

Add `CoopChannel.sendHeroHit(hit)` as a typed wrapper around `send(encodeHeroHit(hit))`.

- [ ] **Step 4: Wire host geometry and peer damage**

After resolving a normal or skill hitbox on the host, test it against every alive remote hero snapshot in `coopSyncState.heroes`. Use `heroVisualCenter`'s Role1 offset convention for remote centers. Send one `hero_hit` per overlapping target with a monotonic entity attack ID and signed knockback.

On the peer, consume `hero_hit_received`, resolve incoming damage with the peer's own equipment defenses, and call existing `damageHero`. Reuse the local hurt/death feedback path. Solo/local-host damage remains unchanged. Remote projectiles remain explicitly untouched.

- [ ] **Step 5: Run GREEN and build**

```bash
cd game
npx vitest run tests/coopSync.test.ts tests/coopChannel.test.ts tests/battleSceneCoopIntegration.test.ts tests/heroCombat.test.ts tests/heroIdentity.test.ts
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add game/src/systems/coopSync.ts game/tests/coopSync.test.ts game/src/net/coopChannel.ts game/tests/coopChannel.test.ts game/src/scenes/BattleScene.ts game/tests/battleSceneCoopIntegration.test.ts
git commit -m "feat: settle monster hits against coop peers"
```

### Task 4: Verify, deploy, and rehearse the public demo

**Files:**
- Create: `tasks/hackathon-mvp-report.md`
- Modify only for defects found: files from Tasks 1-3

- [ ] **Step 1: Run repository verification**

```bash
cd game
npm test
npm run build
cd ../social-server
npm rebuild better-sqlite3
npm run test
npm run typecheck
```

Expected: all pass. Record the exact totals.

- [ ] **Step 2: Start local services**

```bash
cd social-server
JWT_SECRET=hackathon-local SOCIAL_SERVER_PORT=7100 SOCIAL_DB_PATH=:memory: npm start

cd game
npm run dev -- --host 127.0.0.1 --port 5180
```

- [ ] **Step 3: Run browser acceptance**

Using two isolated browser contexts at `http://127.0.0.1:5180/?socialServer=http://127.0.0.1:7100`, verify the six manual checks in the approved design. Capture screenshots of starter pickups, equipped armor/weapon, successful Tail Fire Staff craft, two-player lobby, synchronized monster HP/action, and a damaged remote player.

- [ ] **Step 4: Deploy the current build**

Follow the repository's `winhome-infra` procedure. Build with the existing public NPC/social endpoints, update the `zaixu.qmledmq.cn` static directory, and do not change the social-server route unless the public e2e shows protocol incompatibility.

- [ ] **Step 5: Run public two-browser smoke**

Open two isolated contexts at `https://zaixu.qmledmq.cn:8443`, register unique temporary accounts, create/join an L1 room, ready/start, and repeat the coop checks. Verify the deployed JS/assets return HTTP 200 and no blocking browser console errors occur.

- [ ] **Step 6: Write evidence and commit**

Document exact commands, URLs, screenshots, deferred items, and known projectile/loot limitations in `tasks/hackathon-mvp-report.md`.

```bash
git add tasks/hackathon-mvp-report.md
git commit -m "docs: record hackathon MVP acceptance"
```
