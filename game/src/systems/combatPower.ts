// 战斗力 (combat power) shown on the S4 个人资料/背包 panel's 战斗力 stat.
//
// Source: export.pack.BackPack.as's getFightingForce(param1:User):uint
// (main SWF 打开我开始玩.swf, decompiled to game/tmp/s4-as3/scripts/export/pack/
// BackPack.as by this task -- see tasks/profile-backpack-report.md for the full
// extraction command). The original formula sums FOUR terms:
//
//   1. level * 15                                              (line 230)
//   2. passive-skill score (param1.ispassiveskill, 4 slots,
//      each with its own per-tier multiplier)                  (lines 232-263)
//   3. sum of every equipped item's raw atk stat (geteatt())    (lines 265-283)
//   4. a roleid-specific bonus mixing per-item crit/hp/mp/
//      magicdef/miss raw stats + (for roleid==1) a check for
//      the "sx" skill                                          (lines 284-311)
//
// Adapted: this project ports terms 1 and 3 VERBATIM (both operate on data this
// project's Item/Equipment model actually carries: hero level, and equipped
// items' atk bonus). Terms 2 and 4 are DROPPED -- there is no passive-skill
// roster (ispassiveskill) or per-item crit/hp/mp/magicDef/miss raw fields
// (geteahp/geteamp/getmagicdef/getemiss) anywhere in this project's data model
// (items.ts's Effect only carries atk/def/hp/mp/crit as aggregate stat bonuses,
// not the AS3 MyEquipObj's per-stat raw getters), so those terms have no input
// to port. This is a faithful PARTIAL port of a real formula, not an invented
// one -- see the brief's allowance for "战斗力如有原版公式抄原版" once no
// further terms are portable.
export function computeCombatPower(level: number, equipAtkBonus: number): number {
  const lvl = Math.max(0, Math.floor(level))
  const bonus = Math.max(0, Math.floor(equipAtkBonus))
  return lvl * 15 + bonus
}
