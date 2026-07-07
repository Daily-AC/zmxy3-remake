# 英雄原版成长曲线恢复报告

续单 1（优先）。新增文件：`game/src/systems/heroGrowth.ts` + `game/tests/heroGrowth.test.ts`（30例）。未改 `progression.ts` 或任何其它共享文件。

## 一句话结论

**`progression.ts` 现有的 maxHp/maxMp/atk/def/经验曲线（kagami 移植）跟原版主逻辑 SWF 逐字一致，不用改。** 这跟 hero-scale 那棒发现的"普攻/技能公式 kagami 移植失真"是两回事——那两个是真的错了，这个是对的。真正卡住可赢性的是"运气值"这种次要变量不影响大局，以及原版的回血机制比想象中简单（英雄自身成长曲线不是瓶颈，装备/宝物加成才是，呼应 hero-scale-report 的结论）。

## 反编译过程：upLevel 逻辑不在 BaseHero/BaseRoleProperies，而在 Role1.as 自己的 upGrade()

先在 `base.BaseRoleProperies.as`/`base.BaseHero.as` 里找升级逻辑，只找到 `setLevel`/`getLevel` 之类的纯 setter，没有任何计算逻辑。往 `export.hero.Role1.as` 找也一开始扑空（前几次反编译带 `-selectclass` 过滤条件时漏掉了这个方法）。最后**对整个 SWF 做一次不带过滤条件的全量反编译**（446 个类，约3秒），全局搜 `setBasePower(` 的调用方，才在 `Role1.as` 自己覆写的 `upGrade()` 方法里找到真正的每级成长公式。

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
# 全量导出后 grep -rn "setBasePower(" <out>/scripts/ 定位到 export/hero/Role1.as 的 upGrade()
```

## 成长曲线对照表：kagami 值 vs 原版值 vs 现行值

`export.hero.Role1.as` 的 `upGrade()`（约第2176~2205行）：

| 字段 | 原版公式（本棒反编译） | kagami `ProgressionSystem.ts` | `progression.ts` 现行值 | 一致？ |
| --- | --- | --- | --- | --- |
| maxHp | `80 + 50*(等级-1)` | `80 + 50*levelOffset` | 同左 | ✅ 完全一致 |
| maxMp | `50 + 20*(等级-1)` | `50 + 20*levelOffset` | 同左 | ✅ 完全一致 |
| atk (basePower) | `10 + 5*(等级-1)` | `10 + 5*levelOffset` | 同左 | ✅ 完全一致 |
| def | `2 + 2*(等级-1)` | `2 + 2*levelOffset` | 同左 | ✅ 完全一致 |
| 升级所需经验（等级<7） | `135 + 10*(等级-1)` | 同左 | 同左 | ✅ 完全一致 |
| 升级所需经验（7≤等级<13） | `625 + 50*(等级-7)` | 同左 | 同左 | ✅ 完全一致 |
| 升级所需经验（13≤等级<19） | `1950 + 100*(等级-13)` | 同左 | 同左 | ✅ 完全一致 |
| 升级所需经验（等级≥19） | `5000 + 5000*(等级-19)` | 同左 | 同左 | ✅ 完全一致 |

`heroGrowth.ts` 里 `recoverRole1LevelStats()`/`recoverExpToNextLevel()` 是**独立重新实现**（不是直接 re-export `progression.ts`），单测逐等级（1/2/7/10/13/19/25/40/60/90）跟 `progression.ts` 的 `getLevelStats`/`getExpToNextLevel` 断言相等——这样"交叉验证"才是真验证，不是同一份代码验证自己。**这纠正了我在 hero-scale-report.md 里的一处过度推断**：当时看到普攻和技能公式都是 kagami 的占位/失真版本，就怀疑成长曲线可能也一样不可靠——现在直接读代码证实，kagami 这条成长曲线是忠实移植，怀疑是多余的。

## 运气值（Hurt 公式里那个随机浮动的来源）

`user/User.as` 的 `setTadayLuckValue()`（约第792~804行）——**"今日运气值"，每个自然日重新掷一次骰子**（存档日期跟当天不同才重掷，同一天沿用旧值），跟等级无关的养成、纯粹是每日随机数，分三档：

| 等级区间 | 掷骰范围 |
| --- | --- |
| ≤4 | `1 + round(random()*4)` → [1,5] |
| 5~10 | `1 + round(random()*9)` → [1,10] |
| >10 | `1 + round(random()*19)` → [1,20] |

`heroGrowth.ts` 的 `getDailyLuckRange(level)`/`rollDailyLuck(level, random?)` 精确复现。**结论：这个变量最大也就 +20 点随机浮动，相对于 hero-scale-report 里 atk 动辄几百上千的量级，纯粹是噪声，不是平衡杠杆**——`heroScale.ts` 之前把 `luck` 默认设成 0 的简化选择是合理的，现在可以选择性精确建模，但不影响可赢性结论。

## 回血机制口径

### 二郎神禁疗（ERLANGSHEN_HP_REJECT）精确门禁

`base.BaseRoleProperies.as` 的 `setHHP(newValue)`（约第745~769行），比 `tasks/level-pipeline-report.md` 之前逆向的描述更精确一层：

```
if (HHP3 != 0 && newValue > getHHP()) {
  if (curAddEffect 且带 ERLANGSHEN_HP_REJECT buff) {
    return  // 整次赋值直接不生效，不是部分打折
  }
}
// 否则正常写入，然后 clamp 到 [0, maxHp]
```

**关键点：这个门禁只挡"想让HP变大"的写入（回血/回满），伤害（想让HP变小）永远不受影响**——跟 level-pipeline-report 的描述一致，现在有精确的判断条件了。`heroGrowth.ts` 的 `applyHeroHpChange(currentHp, requestedHp, maxHp, healBlocked)` / `applyHeroHpDelta(currentHp, delta, maxHp, healBlocked)` 精确复现这条门禁——回血请求在禁疗期间**整个被丢弃**（不是打折扣），伤害请求永远正常结算，结果始终 clamp 到 `[0, maxHp]`。

### 已确认的回血来源（未穷尽，见遗留问题）

- **法宝戒指**（`export.magicWeapon/MagicRing.as:62`）：`cureHp(maxHp * 戒指等级)`。因为 `setHHP()` 无论如何都会把结果 clamp 到 maxHp，**戒指等级 ≥1 时这个公式恒等于满血**（1倍maxHp已经打满，乘更高等级也只是clamp到同一个上限）——`heroGrowth.ts` 的 `magicRingHealAmount(maxHp, ringLevel)` 记录这个事实。
- **续命丹类道具**（`export.pack/PackThings.as` 约第561~575行，物品名形如 `wpsmdN`）：**有按道具档位分级的使用次数上限**——档位 N 的丹药最多能用 `N+1` 次，超过会弹"该种丹药服用已经到上限"。`heroGrowth.ts` 的 `immortalityPillUseCap(tier)` 记录这条使用限制的形状。**这类道具具体每次回复多少血本棒未查到**（见遗留问题）。
- 没找到一个"喝了固定回X点血"的普通消耗品实现——`my/CureHpQueue.as`（一开始猜是回血逻辑）打开一看**只是飘字显示队列**（战斗中弹出的加血/扣血数字动画），不含实际回血量计算。真正的普通丹药回血量大概率是数据驱动（走某个物品表字段），本棒没有继续往下挖（团队长原话是"顺带查"，非本棒主线，详见遗留问题）。

## 验证方式

`heroGrowth.test.ts`（30例）：成长曲线交叉验证覆盖等级1/2/7/10/13/19/25/40/60/90（含每个经验分段边界），逐字段跟 `progression.ts` 断言相等；运气值范围和掷骰边界（random()=0和1两端）逐档验证；回血门禁覆盖"禁疗时完全不加血"、"禁疗时伤害正常结算"、"clamp到[0,maxHp]"、"法宝戒指恒等于满血且禁疗时同样不生效"四个场景。

`cd game && npx vitest run`：31 个文件、358 例全绿（含 skillDamageReal 那棒新增，互不冲突）。`npx tsc --noEmit`：干净。

## 遗留问题

- 普通丹药（非法宝戒指、非续命丹）的具体回血数值本棒未查到，需要追进物品数据表（`MyEquipObj` 或类似的物品配置类）才能精确复原——这是"顺带查"范围内没做完的部分，如果后续要精确复刻背包丹药回血，需要单独深挖。
- `progression.ts` 的 `ProgressionTuning.maxLevel=90` 上限本棒未在 AS3 里找到对应的硬编码"90"常量——不确定是原版真实等级上限还是 kagami 自己选的合理截断；不影响 L1~L4 相关计算（都在等级10~50区间），未继续深挖。
- 运气值的"每日重掷"语义（存档日期比对）在单机/无存档持久化的场景下如何处理（比如每次开局都算"新的一天"?)未在本棒范围内决定，留给存档系统接线时判断。
