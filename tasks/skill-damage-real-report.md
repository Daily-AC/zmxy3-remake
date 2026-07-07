# 真技能伤害公式恢复报告

续单 2。新增文件：`game/src/systems/skillDamageReal.ts` + `game/tests/skillDamageReal.test.ts`（49例）。**未改 `heroSkill.ts`**——那份 kagami 移植版原样保留做对照存档。

## 一句话结论

真实公式已从 `export.hero.Role1.as` 的 `getRealPower2()` 逐字恢复：**每个技能是 `固定项(随等级指数增长) + 变动项(随等级指数增长)×Hurt`，9个技能各自四个独立系数，跟等级的关系是指数不是查表多项式**。跟 kagami 那版一对比，偏差不是一个固定倍数——从 1.4x 到 663x 都有，说明这不是"kagami抄错了系数"，是公式的形状本身就不一样。

## 反编译

同一个 `getRealPower2()` 函数——hero-scale 那棒已经用它恢复了普攻 hit1~5，这棒接着看同一函数里 hit6 及以后的 case 分支（技能部分）：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass export.hero.Role1 \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
```

## 公式形状（AS3 运算符优先级要注意）

```
power = fixedBase * e^(fixedExponent * 技能等级)
      + powerBase * e^(powerExponent * 技能等级) * Hurt * critMult * gxpMult
```

**AS3 里 `*` 优先级高于 `+`**，所以 `critMult`/`gxpMult` 只乘在"变动项×Hurt"这一段，**不乘固定项**——跟普攻公式（hit1-5，crit/gxp 乘整个结果）形状不一样，`skillDamageReal.ts` 的 `splitRealSkillDamage()` 特意拆开两部分方便看清楚，单测里专门断言了"暴击只翻倍变动项，固定项不变"。

## 逐技能系数出处表

全部来自 `export.hero.Role1.as` 的 `getRealPower2()`（约第2209~2283行），逐字转录：

| 本项目技能名 | AS3 action | fixedBase | fixedExponent | powerBase | powerExponent |
| --- | --- | --- | --- | --- | --- |
| slz | hit6 | 28.334 | 0.308 | 0.618 | 0.148 |
| hytj | hit7 | 8.854 | 0.308 | 0.193 | 0.141 |
| lyfb | hit8 | 12.879 | 0.308 | 0.281 | 0.145 |
| lys | hit9 | 5.666 | 0.308 | 0.123 | 0.149 |
| hmz（连斩段） | hit10_2 | 14.94 | 0.368 | 0.169 | 0.143 |
| hmz（砸地段） | hit10_4 | 59.787 | 0.368 | 0.676 | 0.143 |
| jdy（一段） | hit11_1 | 6.296 | 0.308 | 0.137 | 0.142 |
| jdy（二段） | hit11_2 | 6.296 | 0.308 | 0.137 | 0.145 |
| hyjj | hit12 | 12.592 | 0.308 | 0.274 | 0.144 |
| qsez | hit13 | 0.629 | 0.308 | 0.0137 | 0.141 |
| zz | hit14 | 70.835 | 0.308 | 1.545 | 0.149 |

`hit10_3` 是空分支（`case "hit10_3": break;`，没有任何赋值），跟 kagami 自己文档写的"仅有网络回放helper"一致——**真实客户端里这个动作不造成伤害**，本文件没有为它导出任何函数。

`Hurt` 复用 `heroScale.ts` 的 `calculateHurt()`（import，不重复实现），跟普攻是同一个函数、同一个来源（`roleProperies.getHurt()`）。

## kagami 移植版 vs 真实值——分歧不是固定倍数

在 atk=100、不触发暴击的条件下，逐等级、逐技能对比 `kagami/真实` 的比值：

| 技能 | 等级1 | 等级5 | 等级10 | 等级18 |
| --- | --- | --- | --- | --- |
| slz | 6.64x | 29.48x | 34.60x | 15.26x |
| hytj | 5.78x | 26.00x | 30.63x | 13.40x |
| lyfb | 1.42x | 6.34x | 7.47x | 3.28x |
| lys | 27.73x | 122.83x | 143.97x | 63.50x |
| hmz连斩 | 2.43x | 8.56x | 6.65x | 1.56x |
| hmz砸地 | 3.63x | 12.28x | 9.52x | 2.23x |
| hyjj | 1.50x | 6.71x | 7.89x | 3.46x |
| qsez | 125.26x | 563.26x | 663.45x | 290.22x |
| zz | 3.72x | 16.47x | 19.32x | 8.53x |

数字全部由 `calculateRealSkillDamage()` 和 `heroSkill.ts` 现成函数直接调用现算（`Math.abs(kagami-real)/real` 断言在测试里逐技能验证"至少相差20%以上"，实际大多数远超）。**这张表本身就是证据：如果只是 kagami 的系数抄错了，倍数应该在各技能/各等级间大致稳定；实际倍数从 1.4x 摆到 663x，且同一技能在不同等级下比值还会先涨后跌（如 slz 从 6.64x→34.60x→15.26x），说明两套公式的数学结构（多项式查表 vs 指数）根本不同，不是同一个公式的参数误差。**

`qsez` 的分歧最夸张（500~660倍），因为真实公式给 qsez 的系数（`powerBase=0.0137`）本来就设计成一个"廉价定位技能"（伤害低、主要为分身/位移服务），kagami 版却套用了跟其它主力技能同量级的查表公式，直接把它算成了主力输出技能——这类"技能定位被误判"的问题不是数值误差能解释的，是设计意图层面的偏差。

## 验证方式

49 个单测：11 个技能系数 × 4 个等级（1/5/10/18）共 44 个点，逐点断言等于**独立**用 node 脚本重新算出的参考值（不是让 `skillDamageReal.ts` 验证自己）；额外覆盖暴击/GXP 只乘变动项这条运算符优先级细节；`hit10_3` 空技能确认未导出；kagami-vs-真实的发散性专门用测试断言（不只是报告里的表格好看，代码层面也锁死了"这两套公式确实不一样"这个事实，回归时如果谁不小心把两者对齐了会挂测试提醒）。

`cd game && npx vitest run`：31 个文件、358 例全绿。`npx tsc --noEmit`：干净。

## 接线接口清单

- `REAL_SKILL_COEFFICIENTS`：11 个技能（hit10_3 除外）的四系数表，可直接查阅或做进一步分析。
- `calculateRealSkillDamage(skillId, skillLevel, atk, {critChance?, isGxp?, forceCrit?, luck?, random?})`：单个技能伤害，可直接替换 `heroSkill.ts` 对应技能的调用点（但本棒不动 `heroSkill.ts` 本身，是否切换、何时切换由你决定）。
- `splitRealSkillDamage(...)`：拆出 `{fixedPart, powerPart, total}`，方便做"这个技能主要吃等级还是吃装备"的分析或者UI显示。
- `skillLevel` 输入口径提醒：真实 AS3 用 `user/User.as` 的 `returnSkillLevelBySkillName()` 取值，这个函数其实读的是"当前装配的技能槽等级"而非单纯"技能树已学等级"，而且对特定技能列表有个"等级超过10就重置回1"的怪癖（本棒未查清楚触发条件，`skillDamageReal.ts` 的纯函数不会替你做这个clamp，接线时自己决定要不要复现）。

## 遗留问题

- `skillLevel>10` 重置为1 这个 AS3 怪癖没有查清楚触发场景（是否真的会在正常游戏流程里遇到），`skillDamageReal.ts` 里只作为文档记录，未在代码里实现该clamp。
- 未检查 Role2~5 的技能公式（本项目目前只有悟空一个可玩角色，跟 hero-scale-report 的遗留问题一致）。
- 本次未评估切换到真实公式对 heroSkill.ts 现有单测/接线的影响——那份代码本棒完全没碰，切不切、怎么切留给你拍板。
