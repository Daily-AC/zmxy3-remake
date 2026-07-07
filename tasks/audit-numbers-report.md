# 数值保真独立审计报告

审计员：独立复核会话（只读代码，唯一写入=本报告）。真源：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`，FFDec headless CLI 全量反编译（1600+ 个 .as）到 scratchpad。所有引用行号指向本次独立反编译产物，与上个会话的产物无共享。

## 总体结论

**上个会话（4.8）声称"逐字从原版 SWF 反编译移植"的数值，抽查项里凡是它明确标注 SWF 来源的，全部逐字属实——没有编造。** 7 项抽查：5 项完全 match，1 项 match 但需补注（monster3 行为数值），1 项部分 mismatch（英雄成长曲线：悟空本人精确匹配，但 Role3/Role4/Role5 的"kagami=原版"表述不成立）。

关键的一条——承伤调平所依赖的**悟空（Role1）成长曲线**——不仅 match，而且是直接对原版 AS3 `Role1.upGrade()` 精确对上（maxHp/maxMp/atk/def/exp 五条曲线逐字相同），比"kagami=原版"这个二手说法更硬。**建立在悟空数值上的承伤调平地基是可信的。**

必须修的：无一项阻断当前工作。唯一需要纠正的是**认知层面**——不能把 progression.ts 当成"全体英雄 = 原版"，因为 Role3/Role4 的攻击成长 kagami 改过、Role5 原版根本不存在。当前只有悟空可玩，所以不影响，但若未来放开多角色需重新对 AS3。

## 逐项结论

### 1. 普攻系数 hit1~5 — MATCH（精确）

- 真源：`Role1.as:2228-2238`（getRealPower2）。hit1/2/3 = `0.707`，hit4 = `1.183`，hit5 = `1.304`，全部 `* getHurt() * critMult * gxpMult`。
- 代码：`heroScale.ts:112-118` NORMAL_ATTACK_COEFFICIENT = {hit1:0.707, hit2:0.707, hit3:0.707, hit4:1.183, hit5:1.304}。
- 逐字一致。critMult（`Math.random()<=getCrit()/100 ? 2 : 1`，Role1.as:2222-2225）、gxpMult（isGXP?1.5:1，Role1.as:2217-2220）也都精确复现在 `calculateNormalAttackPower`（heroScale.ts:163-170）。

### 2. 技能真公式 A·e^(B·lv)+C·e^(D·lv)·Hurt — MATCH（精确，抽查 11/11 全对）

- 真源：`Role1.as:2239-2284`（getRealPower2 的 hit6~hit14 分支）。
- 抽查 slz(hit6)：真源 `28.334*e^(0.308*lv) + 0.618*e^(0.148*lv)*Hurt`。代码 `skillDamageReal.ts:88` slz = {28.334, 0.308, 0.618, 0.148}。MATCH。
- 抽查 hytj(hit7)：真源 `8.854/0.308/0.193/0.141`；代码 skillDamageReal.ts:89 一致。
- 抽查 hmzZaDi(hit10_4)：真源 `59.787/0.368/0.676/0.143`；代码 skillDamageReal.ts:93 一致。
- 顺带核完全部 11 条（lyfb/lys/hmzLianZhan/jdyStage1/jdyStage2/hyjj/qsez/zz），逐字与 Role1.as:2247-2283 对上，无一偏差。
- 运算符优先级（crit/gxp 只乘 Hurt 项、不乘固定指数项）在 AS3 里确实如此（`A*pow(...) + C*pow(...)*getHurt()*_loc9_*_loc5_`），代码 `skillDamageReal.ts:127-129` 把 fixedPart 与 powerPart 拆开、仅 powerPart 带 critMult*gxpMult，忠实。

### 3. 双向减伤公式 — MATCH（精确）

- 怪受击 `BaseMonster.getRealHurt`（BaseMonster.as:773-806）：physics `power>def ? power-def : 1`；magic `mDef ? power*(1-mDef) : power`。
- 英雄受击 `BaseHero.countHurt`（BaseHero.as:1110-1161）：physics `power>def ? power-def : 1`（def 来自 `getDefense()`）；magic `power*(1-magicDef/100)`。
- 代码：`heroScale.ts:180-194` applyPhysicsDefense = `max(1, rawPower-def)`，applyMagicDefense = `rawPower*(1-mDefFraction)`。两向物理都是平推减法下限1，与 AS3 完全一致。报告说"monsterSim.ts/heroCombat.ts 现有 max(1,dmg-def) 本就是原版公式、不用改"——属实。
- 补注（非阻断）：`countHurt` 魔法分支有一个边界 `if magicDef/100 > 1 then param1=99999`（BaseHero.as:1128-1131，魔防超 100% 反而吃 99999 固定伤——原版反作弊陷阱），代码未复现。当前英雄无魔防字段、恒传 0，够不到该分支，非材料性缺失，留注即可。

### 4. Boss 三件套 — MATCH（含对报告"1299 陷阱"的复核）

- 多闻天王 Monster15（`Monster15.as:24,32,35-62`，boss 分支）：hp 16000、def 24、hit1 **186 物理**、hit2 80 魔法、hit3/4 120 魔法。**hit2 是 80 不是 1299**——brief 提示的"1299 属于二郎神"是对的，上个会话没有踩这个坑：heroScale.ts:286-298 的 L2 boss 就写的 186/80/120/120，归因正确。
- 二郎神 Monster22（`Monster22.as:21-56` 基础、`:75-90` setAtkUp）：hp 45137、def 45。基础 hit1 279 物理 / hit2 **999** 魔法；被哮天犬 hit2 触发 `setAtkUp()` 后 hit1→345、hit2→**1299**。heroScale.ts:299-310 用的是 buff 后值（345 物理 + 1299 魔法），并明确标 "post-setAtkUp"，正确。（基础值 279/999 未列，但 report 交代了 buff 语境，不算错。）
- 邪·悟空 Monster34（`Monster34.as:25,33,36,74-100`）：hp 54423、def 80、mDef 0.4。hit1 = `_loc1_`=829 物理；hit6 = `_loc1_*2`=**1658** 物理；hit9 = 固定 **1000** 魔法。heroScale.ts:311-321 三个值逐字对上。
- 关卡数据落盘复核：level2.ts:58 monster15 hp16000/def24 ✓；level3.ts:106 monster22 hp45137/def45 ✓；level4.ts:68 monster34 hp54423/def80 ✓。反编译值与写进关卡数据的值一致。

### 5. L1 巫鹰关 — MATCH

- Monster30（`Monster30.as:14-15,23`）：hp **1**、speed **8**（horizenSpeed=8）、def 0、isFly、power5——就是报告说的"真身 1 血速 8 蜂群"。level1.ts:58 monster30 hp1/speed8/def0 ✓。
- 巫鹰 = Monster3（`Monster3.as:15,21,28,35,41`，`gc.curStage==1&&curLevel==1` 分支）：hp = `5*60` = **300**、def 6、hit1 14 物理、hit2 7 魔法、probability 1。level1.ts:64 monster3 hp300/def6 ✓。"巫鹰 300 血"属实。

### 6. monsterBehaviors.ts Monster3/7/13 — MATCH 但 monster3 需补注

- **monster7**：spec（monsterBehaviors.ts:569-601）hp150/def4/dmg14/attackRange250/alertRange1000，对 `Monster7.as:15,21,28`（hp150/def4/power14/range250/alert1000）——逐字 MATCH。文件自标 "this port's own ffdec decompile"，属实。
- **monster13**：spec（monsterBehaviors.ts:636-663）hp5000/def14/dmg68/attackRange400/alertRange700/attackKind magic，对 `Monster13.as:15,22,29`（hp5000/def14/power68/range400/alert700）——逐字 MATCH。
- **monster3**：spec（monsterBehaviors.ts:487-538）hp**926**/def0/speed240/attackRange150/normalAttackRate0.42。这**不是** AS3 巫鹰（Monster3.as 是 hp300/def6/speed3）。**但文件诚实标注了来源**："straight port of kagami's Monster3System.ts, Numbers verbatim from Monster3Tuning"（monsterBehaviors.ts:45-46）——即 monster3 明确声明是 kagami 来源、不是 AS3。所以这不是"谎称 SWF 来源却造假"，而是 kagami 与原版本身有出入（hp 926 vs 300）。归类为 match（对得上它自己声明的来源），但**补注**：monster3 行为数值偏离真源 SWF，未来若要与原版巫鹰手感对齐需改回 AS3 值。
- 另外 BaseMonster 默认值也复核了：`normalAttackRate` 默认 0.3（BaseMonster.as:28）、`waitRateWhenNoTarget` 0.137（BaseMonster.as:32）——与文件注释一致。

### 7. 英雄成长曲线 progression.ts — 部分 MISMATCH（悟空精确，其余分歧）

**重要发现**：原版 AS3 的英雄成长曲线不是服务器下发，而是客户端 `RoleN.upGrade()` 里硬编码的公式（`Role1.as:2184-2205` 等），所以可以直接对原版验证，不必依赖"kagami=原版"的转述。

| 英雄 | 项 | 原版 AS3 | progression.ts | 结论 |
| --- | --- | --- | --- | --- |
| Role1 悟空 | maxHp | 80+50·(lv-1) | 80+50·off (case 1) | MATCH |
| | maxMp | 50+20·(lv-1) | 50+20·off | MATCH |
| | atk | 10+5·(lv-1) | 10+5·off | MATCH |
| | def | 2+2·(lv-1) | 2+2·off | MATCH |
| | exp 曲线 | 135+10 / 625+50 / 1950+100 / 5000+5000 分段 | getExpToNextLevel 同 | MATCH |
| Role2 | 全部 | 50+20 / 100+40 / 12+8 / def=lv-1 | case 2 同 | MATCH |
| Role3 | atk | **20+6·(lv-1)** | **15+8·off** | **MISMATCH** |
| Role4 | atk | **16+4·(lv-1)** | **9+4·off** | **MISMATCH** |
| Role5 | 全部 | 原版无 Role5（AS3 只有 Role1-4） | case 5 存在 | **无法验证/kagami 造** |

- 依据：`Role1.as:2184-2189`、`Role2.as:1826-1831`、`Role3.as:1660-1665`、`Role4.as:2644-2649`。反编译目录里英雄类只有 Role1-4（+Role1/2Shadow 影分身），**没有 Role5**。
- **悟空（Role1）——本项目唯一可玩角色——五条曲线逐字精确等于原版 AS3**（progression.ts:144-150），承伤调平地基可信。
- Role3 攻击：原版 lv1=20、每级+6；kagami/progression lv1=15、每级+8。lv10 时原版 74 vs 87，量级偏差。Role4 攻击：原版基底 16、progression 9，恒偏 7。这与上个会话自己发现的"kagami 技能公式偏离原版 6.6x"是同一性质——**kagami 是二手源，逐字搬 kagami 不等于逐字搬原版**。
- progression.ts 文件头写 "kagami's per-hero curves, verbatim"（忠实搬 kagami，这点没错），但 CLAUDE.md/brief 层面把它当成"kagami 忠实=原版"是**过度断言**：只有 Role1/Role2 成立，Role3/Role4 kagami 改过，Role5 原版不存在。
- 影响与处置：**当前不阻断**（只有悟空可玩且精确）。建议在 progression.ts 或项目 CLAUDE.md 记一条"Role3/4/5 成长曲线尚未对 AS3 校验、放开多角色前需重验"，避免未来误以为已保真。

## mismatch 清单（供主会话决策）

1. **progression.ts Role3 atk**：原版 `20+6·(lv-1)`，代码 `15+8·(lv-1)`。仅当放开 Role3 可玩时才需修。
2. **progression.ts Role4 atk**：原版 `16+4·(lv-1)`，代码 `9+4·(lv-1)`。同上。
3. **progression.ts Role5 全曲线**：原版无此角色，属 kagami 原创/臆造，无真源可校。
4. **monsterBehaviors.ts monster3 数值**（hp926 等）：来自 kagami 而非 AS3 巫鹰（hp300），文件已诚实标注；未来对齐原版手感时需改回。
5. **补注（非 mismatch）**：countHurt 魔法分支的 magicDef>100→99999 边界未复现（当前够不到，可忽略）。

以上 1-3 均非阻断当前承伤调平（地基是悟空、精确匹配）；4 已被文件透明标注；5 无实际触发路径。
