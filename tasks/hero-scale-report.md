# 英雄原版数值口径移植报告

对应任务书：`tasks/hero-scale-brief.md`。新增文件：`game/src/systems/heroScale.ts` + `game/tests/heroScale.test.ts`（31 例）。未改 `combo.ts`/`heroIdentity.ts`/`furnace.ts`/`level.ts`/`scenes/`。

## 一句话结论

普攻伤害公式已经从主逻辑 SWF 直接反编译恢复（不是"约等于"，是精确系数）；防御减免公式反而发现**现有代码本来就是对的**（`monsterSim.ts`/`heroCombat.ts` 的 `max(1,dmg-def)` 就是原版公式，不用改）；真正卡住 L2~L4 可赢性的不是伤害系数，而是**英雄自身 maxHp/防御成长曲线**——二郎神/邪·悟空的单次攻击力（279~1658）在现有小数值口径下能 0~1 击秒英雄，这个问题不是靠调 furnace 的 atk 上限能解决的，报告末尾单独列出。

## 任务书指向有误：hit1~hit5 不在 Role1BasicSkillSystem.ts 里

任务书写"kagami Role1BasicSkillSystem/相关源码里 hit1~hit5 连击的原版伤害公式"——查过之后，`Role1BasicSkillSystem.ts` 里根本没有 hit1~hit5（那是普攻，不是技能），真正管普攻的是 kagami 的 `HeroNormalAttackSystem.ts`。打开一看：这个文件对 Role1 hit1~hit5 的伤害是**写死的字面量**（30, 30, 31, 32, 34），整个函数没有一处引用 `atk`/`level`/`power`——这明显是没做完的占位实现，不是真实公式的移植。kagami 自己的逆向文档 `combat-rules-index.md:95` 也只敢写"约 `2.0875 * Hurt`"（用"约"字，没有给出精确系数）。

所以本棒没有照抄 kagami 的 TS 代码，也没有直接采信 kagami 文档里的"约"值，而是像 `monsterBehaviors.ts` 那次任务一样，**直接反编译本项目自己 vendor 的主逻辑 SWF**，拿到精确系数。

## 反编译命令

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass export.hero.Role1,base.BaseHero,base.BaseRoleProperies,base.BaseBullet,base.BaseMonster \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
```

## 公式出处表

### 普攻伤害（核心）

`export.hero.Role1.as` 的 `getRealPower2(action, canCrit=true)`（约第 2209~2240 行）：

| 动作 | 系数 | 公式 |
| --- | --- | --- |
| hit1 | 0.707 | `power = 0.707 * Hurt * critMult * gxpMult` |
| hit2 | 0.707 | 同上 |
| hit3 | 0.707 | 同上 |
| hit4 | 1.183 | `power = 1.183 * Hurt * critMult * gxpMult` |
| hit5 | 1.304 | `power = 1.304 * Hurt * critMult * gxpMult` |

- `critMult`：命中判定 `Math.random() <= getCrit()/100` 成立则 2，否则 1（`getRealPower2` 自带 `canCrit` 参数可关闭暴击判定，本次未用到）。
- `gxpMult`：`isGXP` 状态下 1.5，否则 1（本项目暂无 GXP 状态，恒为 1）。
- `Hurt`：来自 `base.BaseRoleProperies.as` 的 `getHurt()`（约第 641~644 行）：`getHurt() = getPower() + Math.random()*luckData`，`getPower() = getBasePower()`——就是英雄总攻击力（本项目里对应 `heroIdentity.ts` 的 `heroTotalAtk(id, eq)`）。`luckData` 是原版一个饰品类隐藏属性，本项目没有对应字段，`heroScale.ts` 里默认按 0 处理（**这是本次的简化，不是原版恰好是 0**，已在代码注释标注）。
- `base.BaseBullet.as` 的 `refreshSourceRoleAttackInfoObject()`（约第 414 行）确认：`_hurt = getRealPower2(action)[0]` 是直接拿来当最终伤害用的，之后没有任何再乘的系数——**普攻没有技能公式那个末尾 `* 1.27`**（那个 1.27 只属于技能路径，SkillTuning.ts 自己说的）。

全部普攻动作（Role1 hit1~5）在 `attackBackInfoDict` 里都是 `"attackKind":"physics"`（约第 33~65 行），没有魔法普攻。

### 承伤口径（双向，同一套公式）

反编译前，`combat-rules-index.md:146` 写怪物受击是"按 `(atk-def)/atk` 修正"的比例公式——**直接读代码发现这个描述是错的**。真实代码：

`base.BaseMonster.as` 的 `getRealHurt(power, attackInfo)`（约第 773~805 行，怪物受到英雄攻击）：
```
physics: power > def ? power - def : 1
magic:   mDef ? power * (1 - mDef) : power
```

`base.BaseHero.as` 的 `countHurt(power, attackInfo)`（约第 1110~1140 行，英雄受到怪物攻击）：
```
physics: power > totalDefense ? power - totalDefense : 1
magic:   power * (1 - magicDef/100)
```

两个方向的物理减伤公式**完全一样**：平推减法、下限 1，不是比例公式。这正好就是 `monsterSim.ts`/`heroCombat.ts` 现在已经在用的 `Math.max(1, damage - def)`——**这两个文件不用改，现有简化已经是原版精确公式，不是简化**。

### 意外发现：kagami 自己的技能伤害公式跟真实 AS3 对不上

交叉验证"量级一致性"时（任务书要求），顺手核对了 `getRealPower2()` 里技能分支（hit6=slz、hit7=hytj、hit8=lyfb、hit9=lys、hit10_2/10_4=hmz、hit11_1/11_2=jdy、hit12=hyjj、hit13=qsez、hit14=zz）的真实公式，发现跟 `heroSkill.ts`（上一棒逐字搬自 kagami `Role1BasicSkillSystem.ts` 的技能伤害）对不上：

- 真实 AS3：`power = A * e^(B*技能等级) + C * e^(D*技能等级) * Hurt`，每个技能自己的 A/B/C/D 四个系数都不同（例：hit6/slz 是 `28.334*e^(0.308*lv) + 0.618*e^(0.148*lv)*Hurt`）。
- kagami 移植版：`(hmzLianZhan[lv]*8+hmzZaDi[lv])*SkillFixedDamageCount[lv]` 这套跨技能共享的查表+多项式公式，末尾统一乘 1.27。

抽样验证：等级1、Hurt=100 时，真实公式 hit6 ≈ `38.56+71.66=110.2`；kagami 移植版 `calculateRole1SlzDamage(1,100)=731.52`——差了约 6.6 倍，不是四舍五入误差。

**这个发现不在本棒任务范围内**（`heroSkill.ts` 是上一棒已验收合入、有自己完整测试的交付物，任务书当时的要求是"kagami 原值逐字搬"，那一棒执行得没错——错的是 kagami 自己的移植跟真实游戏不符）。这里只如实记录，不动 `heroSkill.ts`，留给后续做技能伤害重新校准的人。

## 承伤口径兼容性检查（任务书第2项）

`heroCombat.ts` 现在的 `applyHeroDamage()` 对传进来的 `hit.damage` **不做任何防御减免**（文件自己的头部注释也写了"Dropped ... per-role defense"）——即直接扣血。这跟原版 `countHurt()` 会先减防御/魔防不一样，但**不需要改 `heroCombat.ts` 本身**：只要接线方在构造 `HeroHit` 之前，用 `heroScale.ts` 新增的 `resolveIncomingHeroDamage(rawPower, attackKind, heroDef, heroMagicDefFraction)` 把原始怪物攻击力预先做完减免，再把结果塞进 `HeroHit.damage`，`heroCombat.ts` 完全不用动。

## 可赢性核算表

Boss 数据（`heroScale.ts` 的 `BOSS_REFERENCE`，本棒反编译 `export.monster.Monster15/Monster22/Monster34` 交叉核对 `tasks/level-pipeline-report.md`）：

| 关卡 | Boss | HP | def | 代表性攻击力（原始值，未减防） |
| --- | --- | --- | --- | --- |
| L2 | 多闻天王 (Monster15) | 16000 | 24 | hit1 186物理 / hit2 80魔法 / hit3 120魔法 / hit4 120魔法 |
| L3 | 二郎神 (Monster22，哮天犬 buff 后) | 45137 | 45 | hit1 345物理 / hit2 1299魔法 / hit3 345魔法 / hit4 345魔法 |
| L4 | 邪.悟空 (Monster34) | 54423 | 80 | hit1 829物理 / hit6 1658物理 / hit9 1000魔法（固定值） |

DPS 模型（`heroScale.ts` 的 `simulateComboDps`）：五段普攻 hit1~5 连续打满一轮耗时 `170ms*5=850ms`（系数来自 kagami `HeroNormalAttackSystem.ts` 的 `durationMs=170`，五段一致），暴击按期望值折算（不掷骰子，保证数字可复算），每一击各自单独走上面的物理减伤公式再求和。下表 atk 来自 `progression.ts` 现有等级曲线（未改）+ 假设的 furnace 装备 atk 加成（数字全部由 `heroScale.ts` 导出函数现算，未手工拼凑，可用同样调用重新跑出）：

| 关卡 Boss | 等级20 (仅等级) | 等级20 (+50装备,现furnace上限) | 等级30 (仅等级) | 等级30 (+50) | 等级40 (仅等级) | 等级40 (+50) |
| --- | --- | --- | --- | --- | --- | --- |
| L2 多闻天王 16000hp | 428dps/37.4s | 699dps/22.9s | 699dps/22.9s | 970dps/16.5s | 970dps/16.5s | 1241dps/12.9s |
| L3 二郎神 45137hp | 304dps/148.2s | 576dps/78.4s | 576dps/78.4s | 847dps/53.3s | 847dps/53.3s | 1118dps/40.4s |
| L4 邪.悟空 54423hp | 123dps/444.2s | 370dps/147.2s | 370dps/147.2s | 641dps/84.9s | 641dps/84.9s | 912dps/59.7s |

**当前 furnace atk 上限(50) 下，L2 尚可（13~37秒），L3/L4 在低等级完全打不动**（L4 等级20 要打 444 秒，等级30 也要 85 秒）。加大 furnace atk 上限能直接压缩击杀时间（见下节"furnace 缩放建议"），但——

## 二郎神 heal-block（30秒禁回血）对可赢性的影响：不是主要矛盾

先说结论：ERLANGSHEN_HP_REJECT（`tasks/level-pipeline-report.md` 已完整逆向）这个机制在**当前数值口径下几乎不影响可赢性判断**——因为在能触发它之前，英雄大概率已经被打死了。用 `heroScale.ts` 的 `estimateHitsToKillHero` 核算英雄能扛几下二郎神的攻击（`progression.ts` 现有 maxHp 曲线，未改）：

| 等级 | maxHp | 二郎神 hit2(1299魔法) 能扛几下 | 二郎神 hit1(345物理，已减防) 能扛几下 |
| --- | --- | --- | --- |
| 10 | 530 | **0（直接秒杀）** | 1 |
| 20 | 1030 | **0（直接秒杀）** | 3 |
| 30 | 1530 | 1 | 5 |
| 40 | 2030 | 1 | 7 |

邪·悟空更极端——等级10时**任何一次攻击都能秒英雄**（829物理/1658物理/1000魔法全部 0 击必杀），等级40时最强攻击(1658物理)也只能扛1下。

**这说明真正卡住可赢性的不只是伤害口径（打不动），承伤口径（扛不住）同样致命，而且后者更紧迫**——heal-block 这种"30秒不能回血"的机制，在英雄一两下就被打死的前提下根本没有意义（没机会活到需要靠回血续命的地步）。等英雄的 maxHp/防御曲线也跟着放大之后，heal-block 才会变成一个真正需要战术应对的机制（比如"二郎神放技能时躲背后/正面接一下就要撤退，等 30 秒冷却"）。**这不是本棒能改的**——`progression.ts`（maxHp/def 曲线）任务书没让动，只如实报告：**furnace 只调 atk 上限不够，英雄的 maxHp/def 成长曲线也需要同等级放大，否则 L3/L4 在设计上就是"一戳就死"，heal-block 判定无从谈起**。

## furnace atk 缩放建议（只给建议，不动 furnace.ts）

现状：`furnace.ts` 的 `ENGINE_MAX.atk = 50`（单件装备 atk 加成上限）。用 `heroScale.ts` 现算了 furnace atk 上限 150/300 两档做对比：

| 关卡 Boss | +50(现状) | +150 | +300 |
| --- | --- | --- | --- |
| L2 多闻天王，等级20 | 22.9s | 12.9s | 7.8s |
| L3 二郎神，等级20 | 78.4s | 40.4s | 23.4s |
| L4 邪.悟空，等级20 | 147.2s | 59.7s | 31.5s |

也试了 800/2000（更早一版核算，见 heroScale.ts 里 `simulateComboDps` 的引用值）：击杀时间掉到 1.3~13 秒——**明显过快，会让 boss 战失去存在感**。

**建议**：`ENGINE_MAX.atk` 从 50 调到 **150~200 区间**（约 3~4 倍），能把 L3/L4 在等级20~30 的击杀时间压到 30~60 秒这个"有存在感但不磨"的区间，同时不会让 L2 秒杀。**但这只解决"打不动"，"扛不住"的问题（见上节）furnace 的 atk/def 上限也得同步抬，且抬多少取决于 `progression.ts` 的 maxHp 曲线要不要一起调——这是个耦合决策，不是 furnace 一个文件能单独定的，需要主会话/你来拍板具体档位，本棒只给方向和现算数据。**

## 接线接口清单

- `NORMAL_ATTACK_COEFFICIENT`（`Record<'hit1'|...|'hit5', number>`）+ `calculateHurt(atk, {luck?, random?})` + `calculateNormalAttackPower(hit, atk, {critChance?, isGxp?, forceCrit?, luck?, random?})`：普攻伤害计算三件套，`atk` 直接传 `heroIdentity.ts` 的 `heroTotalAtk(id, eq)` 即可。
- `applyPhysicsDefense(rawPower, def)` / `applyMagicDefense(rawPower, mDefFraction)` / `applyDefense(rawPower, attackKind, def)`：双向都能用的减伤函数。
- `resolveIncomingHeroDamage(rawPower, attackKind, heroDef, heroMagicDefFraction)`：接线层在调用 `heroCombat.ts` 的 `applyHeroDamage` 之前，先用这个把怪物攻击力做完减伤，`heroCombat.ts` 本身不用改。
- `simulateComboDps(atk, def, {critChance?, luck?})` → `{damagePerCombo, comboDurationMs, dps}`，`estimateKillSeconds(hp, dps)`，`estimateHitsToKillHero(heroMaxHp, mitigatedIncomingPower)`：可复算的可赢性核算工具，report 里所有数字都是直接调这几个函数现算的。
- `BOSS_REFERENCE`：L2~L4 三个 boss 的 hp/def/代表性攻击力，独立于 `game/src/data/levels/`，不依赖 level-pipeline 的文件。

## 验证方式

`calculateNormalAttackPower` 对 3 个代表性 atk 值（10/155/455，覆盖低/中/高等级）× hit1~hit5 共 18 个点，逐点断言等于反编译系数直接相乘（不经过本模块内部再算一遍验证自己）。防御公式覆盖了 floor(1) 边界（def 大于等于原始伤害时）和魔法比例两种情况。DPS/击杀秒数模型专门测了"自洽可复算"（同一函数调用两次结果一致，`dps` 恰好等于 `damagePerCombo / comboDurationSeconds`）。

`cd game && npx vitest run`：29 个文件、279 例全绿（含其余并行 team 新增用例，均未受影响）。`npx tsc --noEmit`：只有 `src/ui/hud/RoleInfoHud.ts` 一处与本任务无关的既有报错（属于其他团队在途工作）。

## 遗留问题

- `luckData`（原版一个隐藏饰品属性，普攻伤害里的随机浮动来源）本项目无对应字段，`heroScale.ts` 默认按 0 处理——是简化，不是"原版恰好是0"。
- kagami 技能伤害公式（`heroSkill.ts`）与真实 AS3 指数公式不符（见上），本棒未修，留给后续技能伤害重新校准任务。
- 英雄 maxHp/防御成长曲线本身也需要放大（不只是 atk/furnace），这是个跨文件耦合决策，需要拍板具体倍率，本棒只给出定量证据，不擅自决定。
- 本报告只反编译验证了 Role1 的普攻公式；Role2~5 未涉及（本项目目前只有悟空一个可玩角色）。

## 场景接线 — 阶段 A 口径统一（2026-07-07 合龙棒）

heroScale.ts + skillDamageReal.ts 已接进 `BattleScene.ts`（只动 BattleScene；两个 systems 模块未改）：

1. **普攻**：`resolveHeroHit` 的连击伤害从旧的 `STAGE_DAMAGE[stage]+atk` 换成
   `calculateNormalAttackPower(COMBO_STAGE_HIT[stage], heroTotalAtk, {critChance})`——即
   `系数(hit1~5: .707/.707/.707/1.183/1.304) × Hurt`，暴击率取装备 crit 词条（`heroStats().crit`）。
   删掉了 `STAGE_DAMAGE` 常量。
2. **怪打英雄**：`monsterHitsHero` 从 `max(1, dmg-def)` 换成 `resolveIncomingHeroDamage(rawPower,
   'physics', heroTotalDef, 0)`（heroCombat 仍不自减防，桥在接线层）。L1 怪 rawPower 仍是现有小值
   `MONSTER_ATTACK_DMG=14`（L1 小数值怪暂保留）；hero 暂无魔防字段故魔防分数传 0。
3. **技能**：`scheduleSkillHit` 删掉临时的 `SKILL_DAMAGE_SCALE=0.06`，改用
   `calculateRealSkillDamage(REAL_SKILL_BY_ACTION[hb.actionName], skillLevel, atk)`——按 hitbox 的
   `actionName`（hit6→slz、hit10_2→hmzLianZhan、hit10_4→hmzZaDi、hit8_2→lyfb 等）映射到真·AS3 指数
   公式；`hit12_1` 等 visualOnly 无伤害。这样技能伤害是原版口径，不再有 6.6x 偏差或人工缩放。

**验收**：`tsc` 干净（BattleScene；仓库唯一报错仍在他人 `ui/hud/RoleInfoHud.ts`），`vitest` 387 全绿。
浏览器真机（atk 10、L1 怪）：连击真扣血（150→119，约 4/击 = hit1 系数 .707×10−3def）；`slz` 一击 43
（真公式 38.56+0.717×10=45.7，减 3 def ≈ 43），MP 50→14。普攻/技能都走原版口径且真实生效。
