// 灵魂 (soul) currency + "出售白装" (sell common-quality equipment) for the S4
// 个人资料/背包 panel.
//
// Source: export.pack.BackPack.as (main SWF, see combatPower.ts's header for the
// extraction command). Two AS3 members recovered directly:
//
//   - `player.getLhValue()` / `setLhValue()` -- the 灵魂 wallet shown by
//     txt_lh (BackPack.as:157/418).
//   - `deleteWhiteEquipment()` (BackPack.as:347-365) -- the 出售白装 button
//     handler: walks `player.zblist` back-to-front, and for every item whose
//     `quality == "普通"` (common) AND `type != "zbtx"` (not a 头衔/title slot
//     item), splices it out and adds 20 to `lhValue`. Ported verbatim as the
//     +20-per-item rate and the "only the lowest quality tier" filter.
//
// Adapted (report per CLAUDE.md 移植协议 + this task's brief -- "灵魂货币没有
// →占位并 report 注明"):
//   - This project has no 灵魂 economy anywhere else (no shop, no upgrade sink
//     that spends it) -- SoulPurse is a standalone counter that only grows via
//     sellCommonEquipment. It is NOT persisted across saves (see
//     BattleScene wiring) -- a placeholder display, not a wired economy.
//   - S5 (skilltree-report.md) upgrades this from "not persisted" to a real
//     persisted wallet (save.ts's GameSaveV1.soul) once school-upgrade / skill
//     level-up (SkillControl.upGradeSkillFunc / skillupgradeFunc, both spend
//     lhValue) needed a currency that survives a scene change. trySpendSoul
//     below is new for that -- this file previously had no "spend" primitive
//     because nothing spent souls yet.
//   - AS3's quality is a 5-tier string ("普通"/"优秀"/"精良"/"史诗"/"邪灵");
//     this project's Item.rarity is a narrower 1|2|3 scale whose floor (1) is
//     already documented (rarity.ts) as standing in for the original's tiers.
//     rarity === 1 is treated as the "普通" (sellable-white) tier here.
//   - AS3's `type != "zbtx"` exclusion (don't sell 头衔/title items) has no
//     counterpart: this project's Item.kind has no title-type items, so the
//     exclusion is vacuous and dropped. Only kind === 'equip' items are
//     eligible (mirrors zblist being an equipment-only array in AS3).

import type { Inventory } from './inventory'
import type { Item } from './items'
import { removeItemInstance } from './inventory'
import originalEquipment from '../data/original/equipment.json'

/** AS3 BackPack.as:359 -- `this.player.setLhValue(this.player.getLhValue() + 20)`,
 * once per sold item. */
export const SELL_COMMON_EQUIP_SOUL_VALUE = 20

interface SaleCatalog {
  qualitySaleValueTable: Record<string, number>
  items: { fillName: string; saleValue: number }[]
}

const saleCatalog = originalEquipment as SaleCatalog
const saleValueByFillName = new Map(saleCatalog.items.map((entry) => [entry.fillName, entry.saleValue]))

export interface SoulPurse {
  value: number
}

export function createSoulPurse(initial = 0): SoulPurse {
  return { value: Math.max(0, Math.floor(initial)) }
}

export function addSoul(purse: SoulPurse, amount: number): void {
  purse.value = Math.max(0, purse.value + Math.floor(amount))
}

/** Spend `amount` souls if affordable; returns false (no-op) if not enough.
 * Mirrors every AS3 spend site's shape (SkillControl.as upGradeSkillFunc /
 * skillupgradeFunc: `if (getLhValue() >= cost) { ...; setLhValue(get - cost) }
 * else { trace/toast "not enough" }`) as one reusable guarded debit. */
export function trySpendSoul(purse: SoulPurse, amount: number): boolean {
  if (amount <= 0) return true
  if (purse.value < amount) return false
  purse.value -= amount
  return true
}

export interface SellCommonEquipResult {
  /** Total units removed from the bag (a stack of qty>1 counts every unit). */
  soldCount: number
  soulGained: number
}

/** Ports deleteWhiteEquipment: every 'equip' item at the lowest rarity tier
 * (1, standing in for AS3's "普通") is removed from `inv` and pays
 * SELL_COMMON_EQUIP_SOUL_VALUE per unit into `purse`. Non-equip items (材料/
 * 道具) are left untouched -- AS3's zblist never held them either. */
export function sellCommonEquipment(inv: Inventory, purse: SoulPurse): SellCommonEquipResult {
  let soldCount = 0
  for (let index = inv.stacks.length - 1; index >= 0; index -= 1) {
    const stack = inv.stacks[index]
    if (stack.item.kind !== 'equip' || stack.item.rarity !== 1) continue
    soldCount += stack.qty
    inv.stacks.splice(index, 1)
  }
  const soulGained = soldCount * SELL_COMMON_EQUIP_SOUL_VALUE
  if (soulGained > 0) addSoul(purse, soulGained)
  return { soldCount, soulGained }
}

/** Sell one selected bag equipment item, mirroring PackThings.as mdClick. */
export function sellEquipmentItem(
  inv: Inventory,
  purse: SoulPurse,
  item: Item,
): { sold: boolean; soulGained: number } {
  const stack = inv.stacks.find((entry) => entry.item === item)
  if (!stack || item.kind !== 'equip') return { sold: false, soulGained: 0 }
  const soulGained = Math.max(
    0,
    Math.floor(
      saleValueByFillName.get(item.id) ??
        saleValueByFillName.get(item.sourceFillName ?? '') ??
        item.sourceSaleValue ??
        (item.sourceQuality ? saleCatalog.qualitySaleValueTable[item.sourceQuality] ?? 0 : 0),
    ),
  )
  if (!removeItemInstance(inv, item)) return { sold: false, soulGained: 0 }
  addSoul(purse, soulGained)
  return { sold: true, soulGained }
}
