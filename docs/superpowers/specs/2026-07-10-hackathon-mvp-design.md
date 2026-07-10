# Hackathon MVP Design

## Goal

Ship one public, two-player gameplay loop within four hours:

1. Clear the first two campaign levels.
2. Pick up Wukong-compatible basic equipment and wear it from the backpack.
3. Use guaranteed Level 1 rewards to craft one simple item in the world-map furnace.
4. Create or join a public room and fight synchronized monsters with friends.

## Delivery Boundary

This MVP reuses the existing game, save, furnace, lobby, social-server, and coop synchronization code. It does not continue the three large implementation plans task by task.

In scope:

- Campaign entries L1 and L2 only.
- Deterministic starter loot that makes the pickup and furnace demo reliable.
- Correct weapon, armor, accessory, and talisman slot routing from original `sourceType` metadata.
- Original equipment stats converted into runtime effects so worn drops affect combat.
- One beginner furnace recipe that needs no recipe book and consumes guaranteed L1 materials plus soul.
- Host-authoritative monster position, action, HP, death, and melee/skill damage against every room member.
- Public deployment and a real two-browser smoke test.

Deferred until after the hackathon:

- L3/L4 entry and original prefab compilation.
- Full original recipe-book progression and economy balance.
- Authoritative server-side damage recomputation and anti-cheat.
- Remote projectile collision, shared loot arbitration, trading, reconnect, host migration, and checkpoint recovery.
- Remaining combat, HUD, effect, and save polish from the earlier plans.

## Gameplay Flow

### Solo progression

The player enters L1 from the world map. Normal drops still use the recovered tables, but the L1 boss completion path also drops one `ptdxzg` (普通的行者棍), one `ptdxzf` (普通的行者服), and three `wptm` (檀木). These are ground pickups, not inventory injection. Pickups enter the existing inventory and autosave immediately.

`Item.sourceType` maps original item categories to equipment slots:

| Source type | Slot |
| --- | --- |
| `zbwq` | weapon |
| `zbfj` | armor |
| `zbsp` | accessory |
| `zbfb` | talisman |

Items for another hero are not offered as starter rewards. Runtime stat effects are derived from the existing original equipment records, using deterministic minimum values for dropped starter gear and the existing furnace roll for crafted gear.

After L1, the player returns to the world map, opens the furnace, and sees `新手锻造：尾火棍` first. This adapted recipe needs no recipe book, consumes three `wptm` plus 20 soul, and creates the existing `whg` (尾火棍) item with its original minimum attack roll. Crafting persists the result and refreshes the furnace and backpack state. L2 remains the existing second campaign entry.

### Coop combat

The existing social server remains the room and relay service. The host runs monster simulation and broadcasts monster snapshots at roughly 10 Hz. Peers do not simulate monsters; they render host position, facing, action, HP, and alive state. Peer attacks remain hit intents applied by the host.

For melee and spawned skill hitboxes, the host tests the authoritative attack geometry against every alive hero snapshot, including remote members. A targeted `hero_hit` event carries source, attack ID, damage, and knockback to the affected peer. The peer applies that event through the existing hero damage model; its next hero snapshot exposes HP/death to the room. Duplicate attack IDs are ignored.

Monster projectiles continue to affect only the host in this MVP. This limitation is explicit because synchronizing projectile lifetime and collision is separate from the melee/skill settlement path.

## Reliability Rules

- Starter rewards are deterministic; the demo cannot depend on random drops.
- Pickup, craft, and equip each autosave through the current slot.
- Craft failure never partially consumes inventory or soul.
- A disconnected coop client receives an existing visible error and may return to the lobby; reconnect is not attempted.
- The public frontend uses the existing deployed social-server URL.

## Verification

Automated checks:

- Equipment source types route to all four supported slots and modify hero stats.
- Starter rewards contain usable Wukong equipment and exactly the beginner recipe inputs.
- Beginner crafting is transactional and its item can be equipped.
- L1 completion unlocks L2; L3/L4 remain locked.
- Host melee/skill attacks emit one targeted remote hero hit, duplicates are ignored, and peers apply damage/death.
- Existing coop monster snapshot and peer hit-intent tests remain green.
- Full game tests, social-server tests, typecheck, and production build pass.

Manual public smoke:

1. New player clears L1 and picks up starter rewards.
2. Player equips a drop and confirms stats change.
3. Player crafts and equips the beginner item from the world map.
4. Two isolated browser sessions register, create/join an L1 room, ready, and start.
5. Both see the same monster position/action/HP; both can damage monsters; a remote member can be damaged by a monster melee/skill hit.
6. The host defeat event reveals the result and exit for both players.
