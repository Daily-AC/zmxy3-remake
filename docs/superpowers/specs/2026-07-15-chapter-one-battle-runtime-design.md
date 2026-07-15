# Chapter One Battle Runtime Design

**Date:** 2026-07-15

**Status:** Approved by the user

**Scope:** Turn the verified Combat Core slice into the production runtime for a complete, playable first chapter while preserving the current `BattleScene` as a fallback.

## 1. Decision

The first chapter will be built on a renderer-independent `BattleRuntime` in `packages/game-core`. It owns the complete fixed-tick battle truth: heroes, dynamic monsters, projectiles, platforms, encounters, rewards, transfer doors, and level completion.

`CombatSession` remains a supported compatibility facade for the already verified static combat slice. Its public commands, events, snapshots, checkpoints, recordings, and replay evidence remain valid. New production work is implemented below or beside that facade, not by adding more authoritative state to Phaser.

Phaser becomes a runtime host and presentation adapter. It samples input, submits typed commands, advances the fixed-tick runtime, renders snapshots, and realizes presentation cues. It does not decide damage, wave completion, drops, rewards, equipment effects, or campaign progress.

The migration is a strangler migration:

1. Build the runtime and a production Phaser host for `sl11`.
2. Add the growth and equipment transaction loop.
3. Complete `sl12` and `sl13` and switch the first chapter to the new host.
4. Keep the legacy campaign selectable until replay, browser, and parity gates pass.

## 2. Product Slice

The required vertical slice is the complete first chapter loop:

```text
world map
  -> enter sl11
  -> traverse, fight waves, defeat Owl, use transfer door
  -> complete sl12 and sl13
  -> receive experience, souls, materials, and supported equipment
  -> inspect inventory and equip Wukong weapon or armor
  -> see derived stats and weapon appearance update
  -> craft a deterministic recipe at the furnace
  -> save, reload, and replay an unlocked stage
```

The chapter includes:

- Wukong movement, jumping, platform traversal, normal attacks, hit reactions, death, and respawn.
- The currently implemented Wukong skill loadout, MP costs, cooldowns, and authoritative skill damage.
- `sl11`: vertical climb, Monster30 continuous encounters, Owl boss, transfer door.
- `sl12`: five stop-point encounters, gate progression, Clairvoyance and Clairaudience bosses.
- `sl13`: five stop-point encounters and Giant Spirit boss.
- Drops, pickup, experience, souls, materials, weapons, armor, inventory, equipment, derived stats, and weapon presentation IDs.
- Furnace input validation, atomic consumption, result creation, and persistence.
- Modern loading feedback on every asset-heavy transition.

Pets, accessories, talismans, new characters, quests, magic weapons, and production online co-op are outside this slice. Their future data and runtime contracts must remain possible without reserving placeholder UI or emitting unsupported drops.

## 3. Runtime Ownership

`BattleRuntime` is the sole owner of mutable battle state.

```text
Input adapters
  -> ordered BattleCommand queue
  -> BattleRuntime.step(fixed ticks)
       -> hero simulation
       -> platform collision
       -> encounter and spawn scheduling
       -> monster and boss simulation
       -> attacks, skills, projectiles, and damage
       -> lifecycle, drops, rewards, and level progression
  -> ordered BattleEvent list
  -> immutable BattleSnapshot / checkpoint / hash
  -> Phaser, replay runner, or future authoritative host
```

The runtime state contains:

- `tick`, seeded random state, content version, and runtime schema version.
- Command queue and last accepted sequence per controllable actor.
- Hero registry with simulation, combat resources, cooldowns, loadout, and equipment-derived combat profile.
- Dynamic actor registry keyed by stable actor IDs.
- Projectile, skill effect, and drop registries.
- Platform geometry and movement bounds.
- Encounter state: sub-stage, active stop point, pending spawns, boss arena, door, and completion.
- Reward ledger for experience, souls, items, and one-time grants.

The runtime does not contain Phaser objects, textures, audio objects, DOM state, browser storage, WebSockets, or UI panel state.

## 4. Stable Identity And Dynamic Spawning

Dynamic actors use deterministic IDs generated from content identity and spawn order:

```text
<level-id>:<encounter-id>:<spawn-index>
```

Examples:

```text
sl11:continuous-0:monster30:0003
sl12:stop-2:monster7:0001
sl13:boss:giant-spirit:0000
```

Spawn counters are checkpointed. No random UUID, wall-clock timestamp, or renderer-generated identifier enters simulation state. Registry iteration is always stable and explicit; combat resolution never depends on JavaScript insertion order accidentally.

An actor moves through `ready`, `hurt`, `dead`, and `removed`. Encounter completion counts only actors owned by that encounter and uses lifecycle state, not sprite existence.

## 5. Commands, Events, And Presentation

Commands describe player intent, not visual actions. The initial command set extends the verified combat commands with:

- movement press/release, jump, normal attack, and interact;
- cast skill by stable skill ID;
- pause/resume for the local profile;
- debug-only deterministic stepping, excluded from production input bindings.

Events describe accepted domain outcomes:

- actor spawned, attack started, skill cast, projectile spawned;
- hit confirmed, damage applied, staggered, defeated, removed, respawned;
- drop spawned, drop collected, reward granted;
- wave started, wave cleared, boss activated, door revealed, stage cleared;
- command rejected with a stable reason.

Presentation cues are derived from events and snapshots through stable animation, VFX, audio, and camera IDs. A normal attack produces its animation and sound even when it hits no target; hit-only effects require `hit-confirmed`. Presentation events never feed back into simulation.

## 6. Platforms And Level Flow

Platform collision is moved behind core-owned resolver contracts already supported by `heroSim`. Existing `platformSim` behavior is migrated into `packages/game-core` with source-compatible types and tests.

Each level compiles into a `BattleLevelDefinition` containing:

- world bounds, spawn point, platforms, camera profile, and transfer door;
- ordered encounter definitions;
- spawn rosters and deterministic spawn placement rules;
- boss definitions and completion conditions;
- reward table and next-stage reference;
- origin metadata for canonical, adapted, and invented rules.

Vertical camera movement is presentation-only. It follows snapshot coordinates and never moves platforms or actors in simulation space. Horizontal stop points freeze camera progress but allow the hero to move to the viewport edge; the stop marker is not used as an accidental air wall.

The runtime reveals a transfer door only after the level completion condition is satisfied. `interact` clears the level only when the hero hurtbox overlaps the visible door trigger.

## 7. Combat, Skills, And Equipment

Normal attacks retain the verified cadence and active-frame rules. Input rate cannot shorten an action: commands received while an attack is busy are rejected or buffered according to the explicit combo rule. Attack speed is derived from simulation ticks, never browser key-repeat frequency.

The existing Wukong skill formulas are compiled into core skill definitions. Skill casting validates learned level, cooldown, MP, target requirements, and actor life state before creating authoritative hitboxes, projectiles, or persistent effects.

Equipment is applied at a battle boundary:

1. The profile validates item ownership, Wukong eligibility, and supported slot.
2. Equipped weapon and armor produce a serializable combat profile.
3. The runtime receives that profile when the stage starts or at an explicitly supported checkpoint.
4. Damage, defense, HP, MP, critical chance, and on-hit rules derive from the profile.
5. Phaser resolves `weaponShowId` through the presentation manifest.

Unsupported hero equipment, accessories, and talismans do not enter first-chapter drop tables. A dropped equipment item must be equippable by the active supported hero.

## 8. Rewards And Persistence

Battle rewards are emitted into an append-only settlement ledger. Long-term profile mutation happens outside the tick loop through an atomic settlement transaction:

```text
stage-clear settlement
  -> validate runtime ID and reward ledger hash
  -> apply experience, souls, and items once
  -> advance campaign progress
  -> persist profile revision
```

Pickup events can update a stage-local inventory view, but permanent grants are idempotent. Replaying or reconnecting cannot duplicate rewards.

The current local save is migrated behind a profile repository interface. Browser storage remains an adapter during this milestone. Save data includes a schema version, content version, profile revision, campaign progress, inventory, equipment, skills, and completed settlement IDs. Runtime checkpoints are separate from long-term profile saves.

Furnace crafting is an atomic profile transaction. It validates a recipe, consumes the exact inputs once, rolls only through a seeded transaction random source when a recipe requires probability, creates the result, and commits the new profile revision. Failure leaves the inventory unchanged.

## 9. Determinism, Replay, And Networking Boundary

Every mutable value affecting gameplay is checkpointed. A checkpoint can reconstruct the runtime and produce the same future snapshots, events, and final hash from the same subsequent commands.

Replay records contain:

- runtime and protocol versions;
- compiled content version and level definition identity;
- initial profile-derived battle configuration;
- seed and ordered commands;
- periodic hashes and optional checkpoints.

The future authoritative server will host the same `BattleRuntime`. Clients send versioned commands and receive snapshots/events. This milestone does not implement prediction, rollback, matchmaking, or reward settlement over the network, but it forbids APIs that require a separate server combat implementation.

## 10. Phaser Production Host

The new production scene is a thin host with four responsibilities:

1. Preload the compiled level presentation manifest and expose measurable loading progress.
2. Convert action bindings into sequenced commands for future ticks.
3. Advance the runtime from a fixed-step accumulator with bounded catch-up.
4. Reconcile sprite, effect, audio, camera, and HUD views from events and snapshots.

Actor views are created and removed from actor lifecycle events. Rendering interpolates between snapshots without modifying simulation positions. Asset failures surface a recoverable error state; they do not leave a black screen.

The legacy `BattleScene` remains available behind an explicit runtime selection flag. The new runtime starts opt-in, then becomes the default for completed first-chapter levels after gates pass. The flag is removed only in a later cleanup milestone.

## 11. Migration Sequence

### Phase 1: Runtime Host and `sl11`

- Extract reusable platform, level, wave queue, and continuous spawner logic into `packages/game-core`.
- Add `BattleRuntime`, dynamic actor registry, battle definition schema, checkpoint, snapshot, replay, and hashes.
- Preserve `CombatSession` behavior through a compatibility facade or shared kernel.
- Compile `sl11` into the new definition.
- Build the production Phaser host and complete climb, waves, Owl, door, and stage clear.

### Phase 2: Growth Loop

- Move Wukong skills, equipment-derived stats, drops, pickups, reward ledger, and settlement into explicit core/profile contracts.
- Wire inventory, supported equipment, weapon appearance, furnace transactions, and saves.
- Verify save/reload and replay with changed equipment.

### Phase 3: Chapter Completion

- Compile and ship `sl12` and `sl13`.
- Wire campaign unlocks and stage replay.
- Run legacy/new dual-run checks where both models overlap.
- Make the new runtime the default for the first chapter while preserving fallback.

## 12. Verification Gates

Each phase must pass all applicable gates before it becomes the foundation for the next:

- Typecheck and production build for affected workspaces.
- Pure unit tests for every state transition and transaction.
- Deterministic replay from start, checkpoint restore, and repeated-run hash equality.
- Frame-rate independence at representative 30, 60, and 120 Hz render schedules.
- Browser playthrough using real content and assets.
- Screenshot or video evidence for platform alignment, attack presentation, drops, weapon appearance, boss flow, door placement, and loading states.
- No uncaught browser errors, missing assets, black transitions, or unsupported item drops.
- Performance evidence on the browser reference path with simulation and render work reported separately.
- Legacy fallback remains launchable until the new first chapter is accepted.

The first chapter is complete only when a fresh profile can traverse the three stages, grow through combat and equipment, craft, save, reload, and replay using the production runtime without relying on `BattleScene` for authoritative rules.

## 13. Rejected Alternatives

### Continue expanding `BattleScene`

Rejected because it preserves Phaser as the authority, duplicates state, prevents headless replay, and makes authoritative co-op a second rewrite.

### Add waves directly to the current `CombatSession`

Rejected as the primary architecture because `CombatSession` was intentionally proven around a static slice. Extending it to own levels, inventory, persistence, and presentation contracts would turn it into another monolith and destabilize verified evidence.

### Replace everything with an ECS or generic plugin engine

Rejected because the current needs are explicit and domain-shaped. A universal engine adds migration cost and abstraction risk without solving a measured bottleneck. Stable registries and typed systems provide the required extensibility.

### Rewrite the entire chapter before producing a playable stage

Rejected because it removes the playable fallback and delays real asset, camera, control, and browser evidence. The migration must remain playable after every phase.
