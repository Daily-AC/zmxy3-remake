# Economy Extraction Report

Source root: `tmp/re-level1/mainscripts/scripts/`.

Generated files:
- `game/src/data/original/equipment.json`
- `game/src/data/original/monster-drops.json`

Usage:
- `node tools/extract-equipment-table.mjs`
- `node tools/extract-monster-drops.mjs`

## Reconciliation

### Equipment

| Check | Expected | Actual | Status |
|---|---:|---:|---|
| total `MyEquipObj` items | 218 | 218 | ✓ |
| `normalEquipment` | 9 | 9 | ✓ |
| `otherEquipment` | 67 | 67 | ✓ |
| `wpEquipment` | 120 | 120 | ✓ |
| `sutraEquipment` | 10 | 10 | ✓ |
| `sellEquipment` | 12 | 12 | ✓ |
| `otherEquipment` type `zbwq` | 27 | 27 | ✓ |
| `otherEquipment` type `zbfj` | 24 | 24 | ✓ |
| `otherEquipment` type `zbsp` | 10 | 10 | ✓ |
| `otherEquipment` type `zbtx` | 6 | 6 | ✓ |
| `otherEquipment` user `悟空` | 12 | 12 | ✓ |
| `otherEquipment` user `唐僧` | 12 | 12 | ✓ |
| `otherEquipment` user `八戒` | 12 | 12 | ✓ |
| `otherEquipment` user `沙僧` | 15 | 15 | ✓ |
| `otherEquipment` user `""` | 16 | 16 | ✓ |
| `otherEquipment` quality `优 秀` | 12 | 12 | ✓ |
| `otherEquipment` quality `精 良` | 11 | 11 | ✓ |
| `otherEquipment` quality `史 诗` | 13 | 13 | ✓ |
| `otherEquipment` quality `传 说` | 10 | 10 | ✓ |
| `otherEquipment` quality `邪 灵` | 10 | 10 | ✓ |
| `otherEquipment` quality `魂 器` | 9 | 9 | ✓ |
| `otherEquipment` quality `神 器` | 2 | 2 | ✓ |

### Monster Drops

| Check | Expected | Actual | Status |
|---|---:|---:|---|
| scanned `Monster*.as` files | 85 | 85 | ✓ |
| files with constructor `fallList` assignment | 76 | 76 | ✓ |
| files with no constructor `fallList` assignment | 9 | 9 | ✓ |
| files with repeated effective source `fallList` assignments | 2 | 2 | ✓ |

Files with no constructor `fallList` assignment: `Monster70.as`, `Monster71.as`, `Monster72.as`, `Monster73.as`, `Monster74.as`, `Monster75.as`, `Monster76.as`, `Monster77.as`, `MonsterRole4Hit5.as`.

Repeated effective source `fallList` assignment files: `Monster3.as`, `Monster20.as`.

`stoneFallRate` is not assigned in any monster constructor; `BaseMonster.as:80` only defines the default `stoneFallRate:0`. The JSON stores this as an empty `stoneFallRate` entry array, not as a fabricated per-monster `0`.

## Open Items Resolved

### 1. Cure Values

Verified files in `export/cure/`: `BigHP.as`, `SmallHP.as`, `SmallMP.as`. There is no `BigMP.as`.

`SmallHP.as:76-77` sets `curNum = getSHHP() * 0.25` before calling `cure()`, and `SmallHP.as:89-92` applies that amount to HP. `BigHP.as:14-18` overrides `cure()` and uses `getSHHP() * 0.5`. `SmallMP.as:14-18` overrides `cure()` and uses `getSMMP() * 0.25`.

Conclusion: SmallHP heals 25% max HP, BigHP heals 50% max HP, and SmallMP restores 25% max MP.

### 2. Equipment Sale Value

`MyEquipObj.as:321-323` calls `this.transValue()` unconditionally in the constructor. `transValue()` maps quality to a fixed total via `setValue(N)`:

| Quality | Sale value |
|---|---:|
| 粗 糙 | 10 |
| 普 通 | 20 |
| 优 秀 | 40 |
| 精 良 | 80 |
| 史 诗 | 160 |
| 邪 灵 | 320 |
| 魂 器 | 640 |
| 传 说 | 1280 |
| 神 器 | 2560 |

`MyEquipObj.as:988-995` then splits the total with `value1 = Math.ceil(Math.random() * 100)` and `value2 = total - value1`; `getValue()` returns `value1 + value2`. There is no per-item override in `AllEquipment.as`. `equipment.json` therefore stores deterministic `saleValue` per item and the top-level `qualitySaleValueTable`.

### 3. `yhs` / `tss` Source

Generated `monster-drops.json` contains no `fallList` item named `yhs` or `tss` (`node` scan result: `no yhs/tss fallList entries`).

The one source found is `SelectPLace.as:465-489`, `slsorryClick()`. It is gated by `hasgetslsorry == 0 || hasgetslsorry == 1`, then sets `hasgetslsorry = 2`, so it is a one-time sorry-gift path, not a farmable drop source.

Relevant lines:

```as3
if(this.gc.hasgetslsorry == 0 || this.gc.hasgetslsorry == 1)
{
   this.gc.putQhsInBackPack(this.gc.player1,"tss");
   this.gc.putQhsInBackPack(this.gc.player1,"yhs");
   this.gc.hasgetslsorry = 2;
}
```

Source nuance: in the `player2.roleid > 0` branch, `mpyj` and the fashion item are added to player2, but the `tss`/`yhs` calls at `SelectPLace.as:483-484` still pass `player1`. The report preserves the decompiled behavior as written.

### 4. `jlgzzs` / `jljzzs`

Verified `AllEquipment.as:1656-1666`:

| Var | Ename | fillName | Instruction |
|---|---|---|---|
| `wpEquip114` | 蛟龙甲制作书 | `jljzzs` | 打造沙僧魂器防具的制作书 |
| `wpEquip115` | 蛟龙铲制作书 | `jlczzs` | 打造沙僧魂器武器的制作书 |
| `wpEquip116` | 蛟龙弓制作书 | `jlgzzs` | 打造沙僧魂器武器的制作书 |

Conclusion: there is no fillName collision. The only real oddity is that `jlczzs` and `jlgzzs` share the same generic Sha Seng soul-weapon instruction text despite crafting different weapon books. This corrects the earlier fill-collision suspicion.
