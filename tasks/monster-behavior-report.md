# 怪物行为库报告（数据驱动化 + Monster3/Monster7/Monster13）

对应任务书：`tasks/monster-behavior-brief.md`。

## 搬了什么

新增文件（只加不改，未触碰 `scenes/`、`ui/`、`net/`、`agent-server/`，未改 `monsterSim.ts` 现有导出/行为）：

- `game/src/systems/monsterBehaviors.ts` — 数据驱动的怪物行为库：`MonsterBehaviorSpec`（数值全是数据）+ 一个通用 `advanceMonsterBehavior()` 步进函数，三只怪各自只是一份 spec 常量。
- `game/tests/monsterBehaviors.test.ts`（31 例）。

## 怪物清单怎么选的

`tasks/level-pipeline-report.md` 在我开工时还不存在，所以没有按任务书"看第2/3关怪物清单"的路径走。改用更直接的办法：自己跑 `-export symbolclass` 拿到 `out_res/2.swf`、`3.swf`、`4.swf` 的真实怪物注册表，再从主逻辑 SWF 里逐个反编译候选类确认攻击机制，而不是凭猜测选怪：

| SWF | 关卡 | 怪物 |
| --- | --- | --- |
| 2.swf | 第2关 | Monster6/9/10/15/16/19 |
| 3.swf | 第3关 | Monster1/11/12/13/14/20/21/22（二郎神boss）/23 |
| 4.swf | 第4关 | Monster31/32/33/34 |

三个行为最终选择：

1. **Monster3**（任务书指定必搬）：kagami 已有完整 TS 实现，直接移植。
2. **Monster7**：地面近战，kagami 自己的 `monsters-index.md` 就把它列为"地面备选"（`Monster30` 之外唯一推荐的地面怪），本棒验证其确实是全 `export.monster.*`（85 个类扫描）里最简单的近战之一：一个 `hit1`、自身位置生成的定点判定盒（`SpecialEffectBullet`，不追踪不位移）。
3. **Monster13**：第3关怪物（`3.swf` 真实注册表命中），是本次扫描 85 个怪物类里**唯一**用 `EnemyMoveBullet`（真正带初速度/加速度/距离寿命、朝目标瞄准后直线飞行的弹体）而非 `SpecialEffectBullet`（自身位置生成的静止判定特效）的怪物——满足任务书"远程怪弹道纯数据化"的字面要求，而不是给一个换皮近战怪硬贴"远程"标签。

判断依据：跑了一次 `-selectclass export.monster.*` 全量反编译（85 个类，2 秒），再 `grep -l EnemyMoveBullet` 全部结果，只有 12 个类命中，其中 `Monster13` 是第2/3/4关名单里唯一一个——其余命中的类（`Monster31/36/38/41/43/45/56/61/65/100/1003/1004`）要么是任务书"不推荐"名单里的高复杂度/后期怪，要么不在第2-4关名单里。

## 数值出处表

### Monster3（kagami verbatim 移植）

来源：`vendor/kagami-phaser/src/systems/Monster3System.ts` 全文件（`Monster3Tuning` 常量对象）。

| 数值 | 值 | 出处 |
| --- | --- | --- |
| maxHp / horizontalSpeed | 926 / 240px/s | Monster3Tuning |
| attackRange / alertRange | 150 / 1000 | Monster3Tuning |
| hit1（近战）：时长/判定窗口/位置/尺寸/伤害/击退 | 500ms，[100,380]ms，offset(105,-60)，120×90，40，物理，[6,-5] | Monster3Tuning + updateMonster3 |
| hit2（技能）：时长/判定窗口/位置/尺寸/伤害/击退 | 800ms，[200,650]ms，offset(155,-30)，140×100，18，魔法，[-5,0] | 同上 |
| hit2 触发距离/初始CD/间隔CD | 200 / 2000ms / 4000ms | Monster3Tuning.hit2TriggerDistance/hit2SkillCD1Ms/hit2SkillIntervalMs |
| 普攻决策间隔/概率 | 1000ms / 0.42 | Monster3Tuning.attackDecisionIntervalMs/normalAttackRate |
| hurt/dead 时长 | 250ms / 1000ms | Monster3Tuning |

**`def` 留空为 0**：kagami 自己的 `Monster3System.ts` 从未给这只怪建模伤害减免（`applyMonster3Hit` 直接 `hp -= damage`）。本项目实际 vendor 的 SWF 里 `Monster3.def = 6`（我自己反编译 `export.monster.Monster3` 验证的），但那是**跟 kagami 引用证据不同的 SWF 版本**（kagami AS3 证据引用的是 `[172845].swf`，我读的是本项目 `vendor/zmxy_res` 里的 `打开我开始玩.swf`——两者 `BaseMonster` 默认值也对不上，见下"版本差异发现"）。为了不把"逐字移植 kagami"这句话讲假话，`def` 保持 0（等价于 kagami 的原始行为：`max(1, damage-0)` ≈ `damage`），把 `def=6` 这个发现单独记在这里，不混进移植数值里。

### Monster7（本棒自己反编译）

来源：`export.monster.Monster7`，`打开我开始玩.swf`（命令见下）。

| 数值 | 值 | 出处 |
| --- | --- | --- |
| hp/sHp | 150 | Monster7.as 构造函数 |
| def | 4 | 同上 |
| horizenSpeed | 3px/frame → 90px/s（×30fps） | 同上，换算见 `monsterBehaviors.ts` 文件头 |
| attackRange / alertRange | 250 / 1000 | 同上 |
| hit1：power / attackKind / attackInterval / hitMaxCount / 击退 | 14 / physics / 4帧 / 99 / [6,-5] | `attackBackInfoDict["hit1"]` |
| hit1 生成位置 | 自身 x∓80，y-86（面向决定符号） | `doHi1()` |
| hit1 动画节奏 | `setFrameStopCount` 第4行 `[2,2,2,4]`（4 格）；`enterFrameFunc` 在格索引2、内部计数2时触发 `doHi1` | `initBBDC()` + `enterFrameFunc()` |
| hurt/dead 时长 | 15格×tick / (2+2+2+2+7)格×tick | 第2/3行 stopCounts |

**确认但未实现的死机制**：`Monster7.beforeSkill1Start()` 在目标距离<200 时返回 true，但 `Monster7` 从未覆写 `releSkill1()`。直接读了 `base.BaseMonster.as` 的 `hasAttackTarget()`：它每帧（不是每秒）用 `Math.ceil(Math.random()*4)` 抽 1~4 号技能槽，抽中1号且 `beforeSkill1Start()==true` 且共享的 `skillCD[0]==0` 时，会调用（继承自基类的空函数）`releSkill1()` 并把 `skillCD[0]` 重置成 `skillCD[1]`（非 boss 默认 `[100,150]` 帧，`Monster7` 自己另设的 `skillCD1` 字段其实是个从未被读取的死字段）。这是**真实存在、代码确实会跑到**的原版机制，但它没有任何可观察效果（不放技能、不改动画、不改状态），只是白白消耗/重置一个不可见的内部冷却值——实现它只会增加静默的空转记账，没有任何玩法意义，故本棒判断为"确认存在，故意不搬"。这与 kagami 自己 `monsters-index.md` 里"这可能是原版行为，也可能是反编译缺口"的存疑不同——本棒已经直接读代码确认了它是**真实原版行为**（不是反编译缺口），只是原版本身就是个无效技能槽。

反编译命令：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass export.monster.Monster7,base.BaseMonster \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
```

### Monster13（本棒自己反编译，唯一真远程弹道）

来源：`export.monster.Monster13`，`打开我开始玩.swf`。

| 数值 | 值 | 出处 |
| --- | --- | --- |
| hp/sHp | 5000 | Monster13.as 构造函数 |
| def / mDef | 14 / 0.217（mDef 未接入伤害公式，见下"简化"） | 同上 |
| horizenSpeed | 3px/frame → 90px/s | 同上 |
| attackRange / alertRange | 400 / 700 | 同上 |
| isFly / graity | true / 0（飞行怪；本棒沿用 monsterSim.ts 对 Monster30 已有的"降级为地面"惯例，未接飞行AI，见下） | 同上 |
| hit1：power / attackKind / attackInterval / hitMaxCount / 击退 | 68 / magic / 999帧(几乎不重复命中) / 1 / [6,-5] | `attackBackInfoDict["hit1"]` |
| **弹体是 `EnemyMoveBullet`，不是 `SpecialEffectBullet`** | 生成位置 x∓82,y-21；瞄准目标当前位置（`AUtils.GetNextPointByTwoObj`，施法瞬间取一次方向向量，之后不再重新瞄准/不追踪）；初速度 3px/frame；恒定加速度 1px/frame² 沿同一方向；总飞行距离 1000px 后销毁 | `doHi1()`：`setSpeed(dir.x*3,dir.y*3)` + `setAddSpeed(dir.x,dir.y)` + `setDistance(1000)`，未调用 `setMoveTarget()` 所以不追踪 |
| 单位换算 | 速度/加速度按 `×(1000/TICK_MS)=×30` 换算成 px/s / px/s²（加速度只乘一次 FPS，因为它是"每 tick 增量"，不是"每 tick² 增量"） | `monsterBehaviors.ts` 文件头有换算推导 |
| hit1 动画节奏 | `setFrameStopCount` 第4行 `[2,2,6]`（3格）；触发在格索引2、内部计数6——正好是整个摆动的最后一 tick | `initBBDC()` + `enterFrameFunc()` |

反编译命令：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass "export.monster.*" \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
# 而后 grep -l EnemyMoveBullet <out>/scripts/export/monster/*.as 筛出 12 个真远程怪，交叉第2-4关名单只剩 Monster13。

# 关卡怪物名单来自：
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -export symbolclass <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/3.swf"
```

## 通用 AI 壳出处（三只怪共用）

`monsterBehaviors.ts` 的 patrol/chase/攻击决策/受伤/死亡通用逻辑先照抄 kagami `docs/reverse-engineering/monsters-index.md` 的 `BaseMonster` 总结，再用本棒自己反编译的 `base.BaseMonster`（同一份主逻辑 SWF）逐条核对，纠正了两处 kagami 文档本身的近似值：

- `normalAttackRate` 基类默认值精确是 `0.3`（`BaseMonster.as:28`），不是 kagami 文档写的"约0.366"；Monster7/Monster13 都没有在自己构造函数里覆盖它，所以两只怪都用 0.3。
- `alertRange`（索敌）判定用完整2D距离（`AUtils.GetDisBetweenTwoObj`，`BaseMonster.as:465`），而**一旦锁定目标后**的 `attackRange`（进入攻击范围）判定只看 x 轴距离（`Math.abs(x-target.x)`，`BaseMonster.as:369`）——这点本项目已有的 `monsterSim.ts` 把两者都简化成了纯 x 轴距离；`monsterBehaviors.ts` 在索敌这一步更贴原版。
- `waitRateWhenNoTarget=0.137` 默认值、决策频率"每 `gc.frameClips`(=30) 帧一次"（即每 1000ms 一次）两条跟 kagami 文档一致，也跟本项目已有的 `TICK_MS`/`FPS=30` 约定（`systems/tick.ts`）吻合。

## 版本差异发现（诚实记录，非本棒直接问题）

kagami 的 AS3 证据引用的是 `[172845].swf`，本项目 vendor 的是 `vendor/zmxy_res/.../打开我开始玩.swf`——两者显然不是同一个游戏版本快照：Monster3 在 kagami 版本里没有 `def` 概念（TS 里没建模），但本项目实际 SWF 里 `Monster3.def=6`；`BaseMonster` 默认 `normalAttackRate` 我读到是 0.3（boss分支0.269），kagami 文档写的是"约0.366（boss约0.423）"。这不影响 Monster7/Monster13（两者数值全部来自本项目自己这份 SWF，内部一致），但说明**跨 kagami 移植 和 本棒自己反编译两个数值来源不能盲目互相校验**——同一怪物编号在不同版本可能数值不同，移植/反编译时各自标好来源就行，不用强行对齐。

## 简化 / 未实现项

- 伤害结算沿用本项目 `monsterSim.ts` 已有的简化公式 `max(1, damage - def)`（平推减法），不是原版 `getRealHurt()` 的比例公式（物理按 atk/def 比例，魔法按 `1-mDef` 比例，各自下限1上限约1.1倍，`monsters-index.md` 已述）。`mDef`（Monster13=0.217）因此暂未接入，留作后续如果要精确复刻伤害数值时的 TODO-verify。
- Monster13 原版是飞行怪（`isFly=true, graity=0`，会试图悬停在目标上方约固定像素）。沿用本项目 `monsterSim.ts` 对 Monster30 已有的公开惯例（同样是飞行怪，同样降级为地面/固定 y 处理），未接飞行AI——弹道瞄准仍用真实的 x/y 偏移量，关卡作者把它放在高处仍能打出有角度的斜线弹道。
- Monster7 的攻击判定盒尺寸（width/height）不是原版数值——`Monster7.newColipse()` 只创建了一个不带显式尺寸的 `ObjectBaseSprite`（透明碰撞体，尺寸由内部位图形状决定，FFDec 反编译看不出具体数字），暂用其精灵表格尺寸（150）加一点余量当占位，已在代码注释标 TODO-verify。
- 未实现"1-in-4 随机技能槽轮询"这个 `BaseMonster.hasAttackTarget()` 里真实存在的机制（Monster3的hit2改成了确定性触发，跟 kagami 自己的简化保持一致；Monster7/Monster13 因为没有真正的技能效果，直接不建模，见上）。

## 接线接口清单（给集成棒 / BattleScene）

- `MonsterBehaviorSpec` 三个现成实例：`Monster3Spec`、`Monster7Spec`、`Monster13Spec`，全部是纯数据常量，可以直接 `import` 使用，或者复制改数值做新怪物——加新怪物不需要写新代码，只需要一份新 spec。
- `createMonsterBehaviorState(spec, x, y)`：生成一只怪的初始运行时状态。
- `advanceMonsterBehavior(state, spec, bounds, target, incomingHit, deltaMs, random?)`：每帧调一次的通用步进函数。`bounds` 是关卡摆放决定的巡逻边界（`{patrolMin,patrolMax}`），跟 spec 分开是因为它是关卡数据不是怪物数据。`target`只需要 `{x,y,isAlive}`，`incomingHit` 是 `{attackId,damage}`（跟 `heroCombat.ts` 的 `HeroHit` 同一套攻击去重理念）。返回 `MonsterBehaviorEvent[]`（`'attack-start'|'attack-spawn'|'hurt'|'death'`）。
- **攻击产出是"一次性生成事件"，不是持续查询**：`'attack-spawn'` 事件里带一个 `SpawnedHitbox`（近战）或 `SpawnedProjectile`（远程）描述对象，生成一次后本模块不再跟踪它的后续生命周期——渲染、命中判定、弹体每帧位移全部留给接线方：
  - 近战 `SpawnedHitbox`：`x/y/width/height` 已经是世界坐标（含朝向翻转），`activeDurationMs` 是这个判定盒该存活多久。直接喂给已有的 `hitbox.ts`：`spawnedHitboxToRect(spawn)` 转成项目现成的 `Rect`，再用 `overlaps()` 做碰撞检测，复用现有代码不用重写。
  - 远程 `SpawnedProjectile`：`velocityX/velocityY`（px/s，已经是瞄准结果）、`accel`（px/s²，沿初速度方向施加，不追踪目标）、`maxDistance`（px）。接线方自己每帧做 `position += velocity*dt; velocity += unit(initialVelocity)*accel*dt; traveled += |velocity|*dt`，`traveled>=maxDistance` 时销毁——本模块不做这个模拟，只给参数（任务书原话"弹道逻辑纯数据化...渲染留给接线方"）。
- Monster3 的 hit2 技能通过 `spec.skill`（可选字段）表达：`triggerRange`+独立 `cooldownMs`/`initialCooldownMs`，在每次 tick 里比普攻判定优先检查，判定通过是确定性的（不像原版1-in-4轮询那样过一道随机数，见上"简化"）。
- 现有 `monsterSim.ts` 完全未改，它自己的 Monster30 简化实现继续独立工作；`monsterBehaviors.ts` 是平行的新系统，两者不共享运行时状态，未来接线时选一个用即可（或者两者并存，分别管各自的怪物实例）。
