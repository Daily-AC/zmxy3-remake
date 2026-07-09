# Level 1 Geometry Extraction Report

## Marker Inventory

Source checked: `tmp/re-level1/mainscripts/scripts/World/PhysicsWorld.as:addSubObj`.

Known marker names from AS3:

- `isWall`
- `isThroughWall`
- `isThroughUpButDownWall`
- `isThroughDownButUpWall`
- `noContinueGo`
- `isTransferDoor`
- `monsterDisapperaPoint`
- `isHideWall`
- `stophere`

Marker names found in extracted sl11/sl12/sl13 scene children:

| marker | count |
| --- | ---: |
| `isWall` | 9 |
| `isThroughWall` | 15 |
| `isThroughUpButDownWall` | 1 |
| `isThroughDownButUpWall` | 3 |
| `isTransferDoor` | 3 |
| `stophere` | 10 |
| `monsterDisapperaPoint` | 27 |

Known markers not found in level 1: `noContinueGo`, `isHideWall`.

New marker names beyond the known list: none.

## Wall Counts

| sub-scene | solid | through | throughUpButDown | throughDownButUp |
| --- | ---: | ---: | ---: | ---: |
| sl11 | 3 | 15 | 1 | 1 |
| sl12 | 3 | 0 | 0 | 1 |
| sl13 | 3 | 0 | 0 | 1 |

Transfer doors:

- sl11: 1
- sl12: 1
- sl13: 1

Markers array entries:

- sl11: 0 non-door marker objects in the source scene
- sl12: 18
- sl13: 19

## Boss Cross-Validation

AS3 reference:

- `StageListener11.step()` triggers the boss sequence when a hero reaches `hero.y <= -1900`.
- `StageListener11.callBoss()` spawns `createMonster(3, 750, -2050)`.

Re-derived from `game/src/data/levels/level1-geometry.json`:

- Wall/platform spanning `x=750` with the nearest top edge: `{ type: "throughUpButDown", x: -53.656, y: -1872.45, width: 1100.012, height: 20, rotation: 0 }`.
- This platform spans x `-53.656..1046.356`, so it covers `750 +/- 150`.
- No extracted wall has a top edge near exactly `y=-2050`.
- The object whose top edge is near the boss spawn y is the sl11 transfer door, not a wall: `{ x: 716.85, y: -2037.45, width: 185.8, height: 165 }`.

I checked the scene sprite IDs (`sl11=195`, `sl12=209`, `sl13=211`) and the nesting: scene children reference collision-bearing sprites; marker clips are one level inside those sprites, matching `PhysicsWorld.addSubObj`. The `y=-2050` expectation appears to line up with the transfer-door object at the summit, while the actual broad standing platform below it is at `y=-1872.45`.

## Anomalies

- Non-zero rotation walls were found and recorded with `rotation: 90`:
  - sl11 solid wall: `x=-78.894, y=-2379.442, width=49.987, height=2899.983`
  - sl11 solid wall: `x=1031.803, y=-2365.558, width=23.295, height=2900.015`
  - sl12 solid wall: `x=-195.997, y=-138.582, width=23.295, height=699.965`
  - sl13 solid wall: `x=-24.997, y=-150.582, width=23.295, height=699.965`
- No missing bounds were found.
- sl11 has no non-door marker objects; its transfer door is correctly emitted only in `transferDoors`, not duplicated into `markers`.
- Overlay PNG dimensions were verified:
  - `tmp/geometry-overlay-sl11.png`: 1132x3051
  - `tmp/geometry-overlay-sl12.png`: 4890x596
  - `tmp/geometry-overlay-sl13.png`: 4904x678
