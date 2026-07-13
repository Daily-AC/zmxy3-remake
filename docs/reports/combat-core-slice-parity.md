# Combat Core Slice Parity Report

| Rule | Reference | New core proof | Classification |
| --- | --- | --- | --- |
| Fixed cadence | Existing `TICK_MS = 1000 / 30` | Package boundary and replay tests | canonical |
| Wukong combo durations | `role1.json` stop counts | five-stage session test and adapter test | canonical |
| Attack mash | Existing `heroSim/combo` rejection | busy rejection and unchanged attack ID | canonical |
| Active-swing RNG cadence | `BattleScene.resolveHeroHits` computes before overlap/dedup | golden RNG state and full checkpoint parity | canonical |
| Air attack presentation | BattleScene stage 0 uses hit3 effect and hit12 sound | airborne event and cue/browser tests | canonical |
| Monster7 stats | `level1.ts` | compiled definition test | canonical |
| Monster7 power | recovered `MONSTER_HIT1_POWER` | 14 raw, 12 after defense | canonical |
| Physics defense | `heroScale.ts` recovered formula | 36 raw, 32 after defense | canonical |
| Sprite offsets | `role1.json`, `monster7.json`, current baseline correction | definition and browser alignment | canonical |
| Stable content IDs | approved architecture namespacing | build-time content validator and snapshot test | canonical |
| Hit volume | current explicit AABB | pure geometry tests | adapted |
| Wukong active frame | current swing-live behavior | `hitFrameFractions: [0]` | adapted |
| Showcase profile | slice-only 120 HP / 36 attack | isolated definition | invented |
| Hit stop | 50 ms presentation cue | browser video and cue log | invented |

Source and acceptance links: [`tick.ts`](../../packages/game-core/src/time/tick.ts), [`role1.json`](../../game/src/data/roles/role1.json), [`BattleScene.ts`](../../game/src/scenes/BattleScene.ts), [`level1.ts`](../../game/src/data/levels/level1.ts), [`monsterAttackPower.ts`](../../game/src/data/monsterAttackPower.ts), [`heroScale.ts`](../../packages/game-core/src/combat/heroScale.ts), [`combatCoreDefinition.ts`](../../game/src/adapters/combatCoreDefinition.ts), [`combatSession.test.ts`](../../packages/game-core/tests/combatSession.test.ts), [`combatCoreDefinition.test.ts`](../../game/tests/combatCoreDefinition.test.ts), [`combatCorePresentation.test.ts`](../../game/tests/combatCorePresentation.test.ts), and [`verify-combat-core-slice.mjs`](../../game/tools/verify-combat-core-slice.mjs).

## Canonical Dual-Run Evidence

[`combatCoreDualRun.test.ts`](../../game/tests/combatCoreDualRun.test.ts) executes this exact nine-command, 180-tick trace:

1. tick 1 `press-right`
2. tick 2 `press-attack`
3. tick 3 `press-attack`
4. tick 12 `press-attack`
5. tick 22 `press-attack`
6. tick 32 `press-attack`
7. tick 50 `press-attack`
8. tick 80 `release-right`
9. tick 100 `press-jump`

The dual run compares actor ordering and every actor snapshot field, ordered domain events, RNG state, queued commands, last-seen sequences, hero simulation/combat state, and Monster7 simulation, attack ID, and swing-event ID in the complete checkpoint.

```json
{
  "legacyFinalHash": "3da79905",
  "modernFinalHash": "3da79905",
  "diffCount": 0
}
```

The frozen legacy-oracle fixture independently finishes at `e99f9023`. The Combat Core Slice boundary has passed dual-run parity. It is accepted only as an isolated proof; `BattleScene` remains the production campaign runtime until a later dual-run plan covers movement, platforms, skills, encounters, drops, and progression.
