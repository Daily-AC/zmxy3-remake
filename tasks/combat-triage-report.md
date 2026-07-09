# 战斗三连修 — 根因排查报告 (combat-triage pen, 2026-07-10)

用户实测报的三个战斗问题，逐一给出根因、证据、修法、验证方式。全部改动落在 `game/src/systems/*.ts` 纯模块 + `game/src/scenes/BattleScene.ts` 的最小接线（不涉及视觉/HUD 渲染代码），无 git commit。

## 问题 1（第 4 次报告，最高优先级）：怪物无限眩晕不反击

**根因**：`monsterSim.ts`（BattleScene 里驱动全部怪物战斗的唯一状态机，`monsterBehaviors.ts` 的 `advanceMonsterBehavior` 目前未接入 BattleScene，见下方"已知遗留"）的 `applyHit()` 每次命中都无条件 `state.mode = 'hurt'; state.modeElapsedMs = 0`。若玩家命中间隔小于 `hurtDurationMs`（原版统一 500ms 附近），怪物的 hurt 计时永远被刷新到 0，它自己的 `case 'hurt'` 分支永远走不到"计时超过 hurtDurationMs -> 回 patrol/chase"那一步；而怪物 AI 的 `hasAttackTarget()`（AS3 等价逻辑）本身在 curAction=='hurt' 时直接 return，不会进攻——所以只要 hurt 能被无限续，怪物永远无法反击。

真源不是"补丁式加个硬顶"，是本项目自己反编译出的 AS3 原始机制：`tmp/re-level1/mainscripts/scripts/base/BaseMonster.as` 的 `beMagicAttack()`（606-770 行）：

- 函数第一行就检查 `gc.protectedPerproty.getProperty(this,"isYourFather")`，为真直接 `return false`——命中被整个拒绝（不扣血、不重置 hurt）。
- 每次命中落地会把攻击动作自己的 `attackBackInfoDict[action].addprotection`（缺省 `2`）累加进 `this.beattackedtimes`；超过阈值（`isBoss` 时 `>49`，普通怪 `>59`，`BaseMonster.as:743/750`）就调用 `setYourFather(gc.frameClips * 3, true)`——约 3000ms（frameClips=30 @ 30fps）的完全无敌，同时把计数器清零。
- `export/hero/Role1.as:33-67`（悟空，本次报告的测试角色）里 `hit1`~`hit5`——玩家实际连招用的整条 5 段普攻链——的 `addprotection` 全部是统一值 `2.5`。

**修法**（`game/src/systems/monsterSim.ts`）：
- `MonsterState` 新增 `beattackedTimes`/`protectionMs` 两个字段；`MonsterConfig` 新增可选 `isBoss`（决定阈值 49/59，缺省走 59）。
- `applyHit()`：命中时先检查 `protectionMs > 0`，是则整段跳过（复刻 `isYourFather` 早退）；命中生效后按固定值 `2.5`（Role1 整条普攻链的真实统一值——`MonsterHit` 目前没有携带技能级 `addprotection` 字段，Adapted 简化，但用的是玩家实际打出的那条连招的真实数值，不是拍脑袋）累加 `beattackedTimes`，超阈值即授予 `protectionMs = 3000` 并清零计数。
- `tickMonster()`：每帧对 `protectionMs` 做 `Math.max(0, protectionMs - tickMs)` 衰减，衰减与当前 mode 无关（cooldownMs 同款写法）。
- `game/src/scenes/BattleScene.ts` 最小接线：`monsterConfigFor(species, stats, isBoss)` 新增第三参并把 `isBoss` 塞进返回的 config；唯一调用点 `spawnEntity()` 里把已有的 `isBoss` 参数原样透传进去（`spawnEntity` 本来就持有这个值，纯参数转发，无新逻辑）。

**验证**：`game/tests/monsterSim.test.ts` 新增 `hit-stun protection` describe 块，4 个测试：
1. 阈值前（23 次命中，23*2.5=57.5≤59）复现原 bug——怪物确实还锁在 `hurt`。
2. 越过阈值（24 次命中）后 `protectionMs===3000`、后续命中被完全忽略（血量不变），且 hurt 动画能自然播完并离开 `hurt`（反击能力恢复）。
3. `isBoss:true` 走 49 阈值（比普通怪更早触发）。
4. `protectionMs` 随真实时间衰减回 0，衰减后命中重新生效。

`npx vitest run` 全绿（612 passed | 1 skipped）。

## 问题 2：monster30（爬塔飞乌鸦）还没打就死

**根因**：不是碰撞盒尺寸/坐标系问题（`monsterHitbox()`/`monsterVisualCenter()` 已经是同一套 render-visual-center 坐标，与 `heroAttackBox()` 对齐，`hitstun-triad` pen 早前就统一过）。真正问题在 `BattleScene.ts` 的 `resolveHeroHits()`：门控条件是 `if (s.combo.stage === 0) return`，但 `combo.ts` 自己的文档已经写明——一次挥击结束后，`combo.stage` 会作为"连招记忆"继续保持非零，一直到 `graceMs`（1500ms）过期或下一击落地为止，这段时间里角色早已不在挥剑（`attacking:false`，`heroSim.ts` 的 `selectAction` 也已经把 `action` 换回 `wait`/`walk`）。`resolveHeroHits()` 每帧都会用**角色当前位置**重新计算攻击框并测试重叠——这意味着挥剑结束后最长 1.5 秒内，一个跟随角色移动的隐形判定框仍然存活，任何飘进来的目标都会被用同一个已耗尽的 `attackId` 命中一次。monster30 是 `game/src/data/levels/level1.ts:61` 里写死的 `hp:1`（真源确认值，巫鹰关爬塔段的一次性脆皮群怪，本身不是 bug）——hp=1 让这个"幽灵判定框"的任何一次误触都直接表现成"秒杀"，正是用户报的"还没打就死了"。

同一类"stage!=0 当作 attacking”的误判，`heroSim.ts` 在 2026-07-09 那次 hitstun-triad pen 里已经为跳跃判定修过一次（`heroSim.ts:123-131` 有明确的历史记录注释），但当时漏了 BattleScene 自己这条命中判定路径，这次一并补上。

**修法**：
- `game/src/systems/heroSim.ts`：`HeroState` 新增 `attacking: boolean` 字段，`tick()` 里用 `comboRes.attacking`（真正"仍在挥剑"）赋值，与 `combo.stage`（连招记忆，可能已经不在挥剑）解耦暴露给调用方。
- `game/src/scenes/BattleScene.ts`（最小接线）：`resolveHeroHits()` 门控从 `s.combo.stage === 0` 改成 `!s.attacking`——只有真正挥剑中的那几帧才测试命中框，宽限窗口内角色即使 `combo.stage` 仍非零也不再重新拿当前坐标试探重叠。

**验证**：`resolveHeroHits` 是 `BattleScene` 私有方法（依赖 Phaser 场景实例化，现有测试套件里同类方法都不直接单测），所以在 `game/src/systems/heroSim.ts` 的纯模块层面钉死根因数据：`game/tests/heroSim.test.ts` 新增一条测试，逐 tick 推进验证 `s.attacking` 在挥剑中为 `true`、挥剑结束但 `combo.stage` 仍非零的宽限窗口内为 `false`、宽限窗口彻底过期后仍为 `false`——BattleScene 侧的改动只是把这个已验证信号接到已有的过滤位置上，是纯转发，不引入新分支逻辑。`npx tsc --noEmit` 通过（无类型错误），`npx vitest run` 全绿。

## 问题 3：跳跃抛体太快、高度不够

**根因/来源**：`game/src/systems/jump.ts` 的 `DEFAULT_JUMP_CONFIG.gravity` 此前是 `2`，文件头注释自己标注"TODO-verify: gravity magnitude is NOT in the reverse-engineering docs"——即从未真正对过 AS3 真源，是移植时的占位值。这次直接读 `tmp/re-level1/mainscripts/scripts/base/BaseObject.as:55`：`protected var graity:Number = 1.5;`，且 `BaseHero.as`（Role1 继承的基类）从未在静息状态覆盖这个字段（`BaseHero.as:1657/1792` 的 `graity=3.75`/`graity=1.5` 只在 `turnToGXP()`/`turnToNormal()`——一个战斗增益切换里出现，与常规跳跃无关）。`jumpPower=-20` 本来就已经和 AS3 完全一致，不用改。

**修法**：`gravity: 2` → `gravity: 1.5`（真源值，不是启发式"降15~20%"）。`jumpPower` 不变。文件头注释同步补上出处引用。

**效果（半隐式欧拉重新计算）**：`groundY=400, jumpPower=-20`：
- 改前（gravity=2）：顶点掉落 90px，滞空 19 tick（~0.63s）。
- 改后（gravity=1.5）：顶点掉落 124px，滞空 26 tick（~0.87s）。

跳跃更高（+38%）、抛体更缓（滞空时间 +37%），与用户描述的"跳跃抛体太快，高度不够，适当放缓"方向一致，且是真源数值而非拍脑袋调参。

**验证**：`game/tests/jump.test.ts`（`jump physics` 套件）和 `game/tests/heroSim.test.ts`（`jumps into the air and lands back` 用例）两处硬编码的顶点/tick 数断言，按上面重算的 124px/26 tick 同步更新（原先锁的是 90px/19 tick）。`npx vitest run` 全绿。

## 已知遗留（未在本次范围内修复，供追踪）

`game/src/systems/monsterBehaviors.ts` 的 `advanceMonsterBehavior`/`applyHit` 有跟 `monsterSim.ts` 完全一样的"命中即无条件重置 hurt"写法，同样会有理论上的无限眩晕问题——但这个函数目前**没有接入 `BattleScene.ts`**（只有它导出的 `Monster3Spec.skill` 数据和独立的 `advanceSkillOverlay` 覆盖层被使用，见该文件"Skill overlay"一节的头注释），不影响任何已上线的战斗路径，所以没有跟着改。若之后真的切换某个怪物走这条状态机，需要照 `monsterSim.ts` 这次的修法同步移植一遍 `beattackedtimes`/`isYourFather` 机制。

## 改动文件清单

- `game/src/systems/monsterSim.ts` — 问题1：hit-stun protection 机制
- `game/src/systems/heroSim.ts` — 问题2：`HeroState.attacking` 字段
- `game/src/systems/jump.ts` — 问题3：`gravity` 1.5
- `game/src/scenes/BattleScene.ts` — 问题1/2 的最小接线（`monsterConfigFor` 传 `isBoss`；`resolveHeroHits` 改用 `s.attacking`），未触碰任何渲染/HUD 代码
- `game/tests/monsterSim.test.ts` — 问题1 新增 4 个测试
- `game/tests/heroSim.test.ts` — 问题2 新增 1 个测试 + 问题3 更新 1 处断言
- `game/tests/jump.test.ts` — 问题3 更新 1 处断言

## 完成判据

`cd game && npx vitest run`：**59 files / 612 passed | 1 skipped**（原 607 + 本次新增 5 个测试，无既有测试被破坏）。`npx tsc --noEmit -p tsconfig.json` 无报错。
