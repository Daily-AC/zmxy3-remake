# behavior-wiring 棒 — 交付报告

对应任务书：`tasks/behavior-wiring-brief.md`。范围内文件：`game/src/scenes/BattleScene.ts`、`game/src/systems/monsterBehaviors.ts`、`game/tests/monsterBehaviors.test.ts`。未碰 `monsterSim.ts`（verticalFollow/heroY 支持 `ba09134` 已经落地，接线不需要新增代码）、`heroSim`/`combo`/`heroSkill`/其他 scenes/`ui/`。

## 1. 巫鹰（Monster3）数值改回原版

真源：本棒自己反编译 `export.monster.Monster3`（`vendor/zmxy_res/.../打开我开始玩.swf`，与 Monster7/13 同一份主逻辑 SWF），读 `gc.curStage==1 && gc.curLevel==1` 的 boss 分支，逐字与 `tasks/audit-numbers-report.md` §6 交叉核对一致。改的是 `game/src/systems/monsterBehaviors.ts` 的 `Monster3Spec`（`data/levels/level1.ts` 里 monsterSim 用的 `monster3` 数值本来就是对的，audit 已确认，没动）。

| 字段 | 改前（kagami） | 改后（AS3） | 出处 |
| --- | --- | --- | --- |
| hp | 926 | **300** | `setHp(5*60)` |
| def | 0 | **6** | `protectedParamsObject.def` |
| speed | 240 | **90**（3px/frame×30fps） | `horizenSpeed=3` |
| attackRange | 150 | **250** | `this.attackRange=250` |
| alertRange | 1000 | 1000（不动） | 已匹配 |
| normalAttackRate | 0.42 | **1** | boss 分支 `probability=1`（与 level1.ts 既有 monster3 一致） |
| hurtDurationMs | 250 | **500**（15 tick） | hurt bank `[15]` |
| deadDurationMs | 1000 | **500**（15 tick） | dead bank `[2,2,2,2,2,5]` |
| hit1 durationMs/spawnAtMs | 500/100 | **500/233**（15/7 tick） | hit1 bank `[2,2,2,1,1,7]`，触发在累计 7 tick |
| hit1 damage | 40 | **14** | `attackBackInfoDict.hit1.power` |
| hit1 maxHits | 1 | **99** | `hitMaxCount` |
| hit2 durationMs/spawnAtMs | 800/200 | **1033/1000**（31/30 tick） | hit2 bank `[2,2,1,26]`，触发在最后一 tick（31），提前1 tick 出事件 |
| hit2 damage | 18 | **7** | `attackBackInfoDict.hit2.power` |
| hit2 hitIntervalFrames | 999 | **4** | `attackInterval` |
| hit2 maxHits | 1 | **99** | `hitMaxCount` |

不动的字段（无分歧或无 AS3 证据推翻现值）：`alertRange`、hit1/hit2 的 `offsetX/offsetY`（105,-60 / 155,-30，恰好与 kagami 数值一致）、`knockbackX/Y`（AS3 `attackBackSpeed` 恰好也与 kagami 一致）、hit1/hit2 的 `width/height/activeDurationMs`（AS3 构造函数/`doHi*()` 没有这几个数，子弹自身的碰撞尺寸/存活时间在另一个未反编译的类里，保留 kagami 占位值，标 TODO-verify，和 Monster7 碰撞盒尺寸同一处理方式）、`skill.triggerRange/cooldownMs`（kagami 自己的确定性简化，`monster-behavior-report.md` 已承认是有意偏离 AS3 的随机轮询机制，本棒只修数值不重新设计该机制）。

对照注释、AS3 引用全部写进 `monsterBehaviors.ts` 的 `Monster3Spec` 头部注释和逐字段行内注释（"was X (kagami) -- AS3 ..."格式）。

## 2. 行为库接线

先核了 L1/L2 真实 roster（`data/levels/level1.ts`/`level2.ts`）：

- **L1**：monster8/7/30（杂兵）、monster4/2/5（三个独立小boss波）、**monster3（巫鹰,boss）**。
- **L2**：monster9/10/19（杂兵）、monster6/16（两个天王波）、**monster15（多闻天王,boss）**。

`monsterBehaviors.ts` 现有三个行为定义：Monster3、Monster7、Monster13。逐个核对：

| 怪 | 在 L1/L2 表内？ | 接了没 | 为什么 |
| --- | --- | --- | --- |
| **Monster3** | L1 boss | **接了**（hit2 技能） | 巫鹰目前只会走 monsterSim 的单一近战 hit1（数值已经对，`MONSTER_ATTACK_TIMING.monster3` fraction=7/15、reach=105，正好和本棒重新反编译出的 hit1 时序精确对上，交叉验证了两次独立反编译一致）——但 hit2（真实的第二招）monsterSim 完全没有这个概念，这就是任务书点名"巫鹰没有专属行为"的根因。 |
| **Monster7** | L1 杂兵 | **没接**（评估后判定冗余，非遗漏） | brief 原文猜测"Monster7 若只在 L3+"——核实后它其实在 L1，但把 `monsterBehaviors.ts` 的 `Monster7Spec` 与现有 `monsterSim`+`MONSTER_ATTACK_TIMING.monster7` 逐项比对：hp150/def4/attackRange250/alertRange1000/speed 90px/s 完全一致；`Monster7Spec` 算出的命中时序 `spawnAtMs/durationMs = 200/333ms = fraction 0.6`、`offsetX=80` 与 `MONSTER_ATTACK_TIMING.monster7` 的 `{fraction:0.6, reach:80}`（battle-fidelity 棒的 d098e5d 独立反编译）**逐字相同**。两套系统对这只怪算出来的是同一个真实 AS3 数值，接线库版本对玩家体验零增量、只多一套要维护的并行状态机，故不接。已在此报告写清对照，不是漏做。 |
| **Monster13** | 只在 L3 表内（`level-pipeline`/`monster-behavior-report.md` 已证，L3/L4 现已按 CLAUDE.md 总纲摘除入口） | **没接** | 任务书明确"roster外不接"；本棒也确认 L2 六只怪（9/10/19/6/16/15）里没有任何一个是弹道怪。这直接导致验收判据②的截图（弹道怪吐真实弹体）**没有对应素材可拍**——L1/L2 范围内目前唯一的行为库弹道定义（Monster13）不在这两关，如实记录，未强行找别的怪凑一张图。 |

### 巫鹰 hit2 的接线方式（工程决策，非简单"整体切换"）

**没有**把巫鹰整只怪切换成 `monsterBehaviors.ts` 的通用状态机（`advanceMonsterBehavior`/`MonsterBehaviorState`）。原因：`MonsterState`（monsterSim.ts）和 `MonsterBehaviorState`（monsterBehaviors.ts）结构不兼容（必需字段不同、`resolvedAttackIds` 一个是 `number[]` 一个是 `string[]`），而 `level.ts` 的 `isBossDead`、boss 血条、好几个 `__shell*`/`__level*` 调试钩子全部依赖 `MonsterState` 这个具体类型——整体切换意味着要把这些全部重新推导一遍，风险和收益不成比例（本棒边界也不许碰 `level.ts`）。

改用**叠加层**方案：巫鹰继续 100% 跑现有 `monsterSim` 状态机（血量/索敌/走位/hit1/受伤/死亡——一行没动，`isBossDead`/血条/所有 `__shell` 钩子零改动），新增 `monsterBehaviors.ts` 里的 `SkillOverlayState`/`advanceSkillOverlay`/`buildOverlayHitboxSpawn`（纯函数，独立于 `advanceMonsterBehavior`）作为一个并行的、位置感知的小步进器：

- `BattleScene.advanceEntity()` 每帧对有 `skillGate` 的怪（目前只有 monster3，见 `MONSTER_SKILL_GATES` 表，未来加新 boss 技能只需要往这个表加一行）调用一次 `advanceSkillOverlay`，`canTrigger` 只在 `mode==='chase'`（已索敌、没有正在打 hit1/受伤/死亡）时为真——对应巫鹰真实的 `beforeSkill1Start()` 要求 `curAttackTarget` 存在。
- 施法期间（`skillOverlay.active` 为真）**跳过这一帧的 `advanceMonster` 调用**（等价于 monsterSim 自己 `attack` 模式下也不挪位置的既有约定），强制 `state.action='hit2'` 驱动渲染（`monster3.json` 本来就有 `hit2` 这一行帧数据和已注册的 Phaser 动画，直接能播）。
- 命中判定：hit2 落地时（`spawnAtMs`）用真实 2D 矩形（`spawnedHitboxToRect` + 一个新的 `HERO_HURTBOX_W/H` 英雄受击盒）测是否真的碰到英雄，碰到才经 `monsterHitsHero`（新增 `overridePower/overrideKind` 可选参数）走原有的减伤/无敌帧/击退管线，用 hit2 自己的数值（7 magic），不是巫鹰 hit1 的（14 physics）——这条直接对应任务书条款4"弹道/技能命中语义别硬套近战 attack-hit 帧逻辑"：hit2 不查 `attackHitFraction/meleeReach`（那是给 hit1 用的近战语义），而是用行为库给出的真实偏移盒做碰撞。
- 已验证"躲开不掉血"：站在 hit2 生成盒外或处于受伤无敌帧内，`resolveEnemySkillHit` 直接 return，不掉血（浏览器实测复现过一次，见下）；"命中掉血"：站在盒内时英雄 HP 真实减少（实测 226→225，1点是英雄自身魔抗把 7点魔法伤害打到下限 1 的正常结果，公式路径没有绕过）。

这个设计的代价：施法窗口内英雄打进来的连击会被推迟到读条结束才结算（`hitQueue` 照常入队，只是当帧 `advanceMonster` 没跑去消费它），是个轻微的时序偏差，不影响最终是否命中/掉血，已在 `advanceEntity` 的注释里写清。

### 攻击命中语义澄清（任务书条款4）

- **近战（hit1，所有怪共用）**：继续用 monsterSim 已有的 `attackHitFraction + meleeReach` 机制（d098e5d，本棒未改一行）——在真实挥击帧检查距离+朝向。
- **巫鹰 hit2（技能）**：本棒新增，用行为库给出的真实偏移盒（`offsetX/offsetY/width/height`，AS3 `doHi2()` 坐标）在真实触发帧做一次 2D 矩形碰撞，不复用 hit1 的 fraction/reach 概念。
- **弹道（Monster13 的 `EnemyMoveBullet`）**：库里已经有纯数据的速度/加速度/最大距离描述，接线方式在 `monster-behavior-report.md` 已写清（`velocity += 초기方向*accel*dt`，`traveled>=maxDistance` 销毁）；本棒因为 L1/L2 用不到 Monster13 而没有实际编写这段渲染/位移代码，留给未来真的需要弹道怪时的棒去做，不在此棒里空转实现。

## 3. verticalFollow 接线（L1 攀爬段 Monster30）

背景（`tasks/prefab-compiler-report.md` §5.4 的遗留缺口，如实复核确认属实）：原版 `StageListener11.as` 在攀爬全程持续 `createMonster(30, randHero.x+rand, randHero.y-rand)` 刷 Monster30 追打玩家；这份重制版之前的实现是"纯位移挑战"——`climbActive` 期间 `updateLevel()`（含它自己的 `advanceEntity` 逐怪步进）整个跳过，攀爬段一只怪都没有，直到登顶才补刷同一批怪到地面。

接线内容（`BattleScene.ts`，未碰 `monsterSim.ts`——`VerticalFollowConfig`/`heroY` 字段 `ba09134` 已经就绪，纯消费）：

- 新增 `updateClimbSwarm()`：`climbActive` 期间每帧调用，按 `CLIMB_SWARM_INTERVAL_MS`（1500ms，项目自定，AS3 真实刷新率没有反编译出来，TODO-verify）、上限 `CLIMB_SWARM_MAX_ALIVE`（4 只，同样项目自定，怕原版那种"全程持续刷"直接搬进来会刷屏）在英雄当前位置上方生成 monster30（`heroX±100, heroY-(100~200)`，对应原版 `randHero.x+rand, randHero.y-rand`），复用现有的 `spawnEntity`/`advanceEntity`/`reapMonsters`，不是另开一套怪物系统。
- `spawnEntity` 加了可选 `y` 参数（默认 `GROUND_Y`，其余调用点零改动，字节级不变）。
- `monsterConfigFor` 里 `species==='monster30' && this.climbActive` 时给 `verticalFollow` 开 `{enabled:true, speed:7, arriveThreshold:20}`——speed=7 是浏览器里粗校的结果（见下"实测"），标 `CLIMB_VERTICAL_FOLLOW_SPEED` 常量 + TODO-verify 注释，供用户手感轮终校。
- `advanceEntity` 里把 `heroY: this.heroState.vertical.y` 一起传进 `advanceMonster`——这一个改动对其余所有怪都是 no-op（`stepVertical` 在 `verticalFollow` 未开启时直接忽略 `heroY`），只有攀爬段的 monster30 真正用到。
- `finishClimb()` 里补了清场：把攀爬期间刷出的残余 monster30 全部销毁，让地面阶段的 `LEVEL_1_WUYING.stopPoints[0]`（自己的一份 monster30+2×monster8）干净起步，不与攀爬段的刷怪重复计数。

**顺手修的一个真 bug（移植协议允许当场改）**：`resolveHeroHits()`（英雄连击命中判定）和怪物头顶血条一直硬编码 `GROUND_Y` 而不是英雄/怪物各自的真实 y——攀爬段之前从来没有怪物离开过 `GROUND_Y`，这个偏差从未被触发过；现在攀爬段怪物真的会在英雄头顶附近的高空 y 上，如果不修，英雄的连击永远打不中攀爬段的怪（两边判定盒都锚在 y=400，而两者的真实 y 可能是 100~300）。改成 `s.vertical.y`/`e.state.y`——这个改动在攀爬段之外**逐位不变**（其余关卡英雄的 `vertical.y` 和每只怪的 `state.y`本来就恒等于 `GROUND_Y`），只在攀爬段才产生实际差异。同样顺手把怪物受击浮空字、血条纵坐标从 `GROUND_Y` 换成 `e.state.y`，否则攀爬段的伤害数字/血条会飘在地面高度而不是怪物实际所在的天上。

## 4. 单测

`game/tests/monsterBehaviors.test.ts` 新增/改动：

- 修正 1 处过期断言（`spawn.damage` 18→7，配合数值修正）。
- 修正 1 处结构性失效断言："does not attack when the decision roll fails" 对 `normalAttackRate>=1` 的怪（巫鹰新值=1）在数学上不可能失败，加 `it.skipIf` 并注释原因，不是简单删掉。
- 新增 `Monster3 AS3 numeric regression`：4 条，锁死 hp=300（含出处注释）、def/attackRange/speed/normalAttackRate、hit1 power/knockback/maxHits、hit2 power/knockback/maxHits/hitIntervalFrames——对应验收判据"monster3 数值回归断言（300+出处）"。
- 新增 `skill overlay (BattleScene boss hit2 wiring)`：6 条，覆盖初始冷却拒绝触发、off冷却触发（attack-start 事件）、`canTrigger=false` 不触发、超出 `triggerRange` 不触发、`spawnAtMs` 精确生成一次 hitbox（含伤害/朝向偏移）、`durationMs` 到期发 `done` 并复位——这是 BattleScene 消费的接线接口本身的事件流测试（纯函数，不依赖 Phaser），对应验收判据"行为库接线的事件流断言"。

`monsterSim.test.ts` 的 5 条 verticalFollow 分支测试（`ba09134` 已有，本棒未新增/未改）继续覆盖"开启分支"这条判据——`monsterSim.ts` 本身零改动。

**结果**：`npx vitest run` → 40 files / **483 passed, 1 skipped**（较基线 470 净增 13 条新测试 + 1 条合理跳过；跳过的那条附理由注释，不是消音）。`npx tsc --noEmit` 0 错误。`npm run build` 通过。

## 5. 浏览器实测（Playwright，独立 tab，`localhost:5205`）

工作树是共享的（另一个并行棒同时在用 Playwright，浏览器实例本身也共享，"current tab"会被对方的操作打断），过程中经历了两次串台（一次读到对方 tab 的存档状态、一次遇到对方编辑触发的 HMR 整页重载），每次都靠 `browser_tabs list` 核对 URL 后重新在正确的 tab（`http://localhost:5205/`）上把流程走完，未污染截图。截图目录：`game/tmp/behavior-wiring-flow/`。

1. **`1-climb-start-swarm.png`**：L1 攀爬段起点，可见 HP 从 240 掉到 164——巫鹰关攀爬段第一次真的有威胁（此前是"threat-free"，见上文§5.4背景）。
2. **`2-boss-hit2.png`**：巫鹰 boss 战，血条 300/300（数值修正生效的直接证据），实测数据同步确认 `bossEntity.state.action==='hit2'`、`skillOverlay.active===true`——巫鹰在打专属技能，不是普通近战回落。另外用 `__scene` 直接读状态验证了两件事（未截图，日志见上）：站在 hit2 生成盒外/无敌帧内不掉血（躲开不掉血），站在盒内英雄 HP 226→225 真实减少（命中掉血，magic 7 点被自身魔抗打到下限1，公式路径正常）。
3. **`3-climb-swarm-follow.png`**：英雄爬到 y≈100（近顶），4 只 monster30 聚在 y≈114~118——纵向几乎贴身跟随，`verticalFollow` 生效的直接数值证据（同帧 `__scene.monsters` dump 见上文过程记录）。

**②弹道怪吐真实弹体的截图没有** —— 如第2节所述，Monster13（唯一有弹道行为定义的怪）不在 L1/L2 roster 内，L1/L2 六只非boss怪里也没有任何一个是弹道怪，没有素材可拍，不是漏做。

## 6. L1/L2 全通关回归（`__shell` 钩子驱动）

- L1：`__killGrunts()` 循环清完 3 波杂兵 + 3 个独立小boss波 → boss 巫鹰刷出（hp 300/300，验证数值修正）→ `__killBoss()` 秒杀 → `portalOpen:true` → `__usePortal()` 成功 → `onAdvanceLevel()` 走 world-map-hub 流程（S1 既定设计：清关回地图，不直接串关）→ `__shellMapState()` 确认 `s1_1:unlocked, s1_2:current`。
- L2：从地图 `__shellMapEnterLevel(1)` 正式进入（不是残留状态）→ `__killGrunts()` 清完 3 波杂兵 + 2 个天王波 → boss 多闻天王刷出（hp 16000/16000，与 `level2.ts`/`audit-numbers-report.md` 一致）→ `__killBoss()` → `portalOpen:true`，清场干净（`aliveMonsters:[]`）。

两关均无报错、无卡死，怪物数值与关卡数据表一致。

## Commit

- `game/src/systems/monsterBehaviors.ts`：Monster3Spec 数值修正 + SkillOverlay 接线 API。
- `game/tests/monsterBehaviors.test.ts`：对应单测。
- `game/src/scenes/BattleScene.ts`：巫鹰 hit2 叠加层接线、L1 攀爬段 Monster30 verticalFollow 接线、`resolveHeroHits`/血条/浮空字的 GROUND_Y→真实y 修正。

只 `git add` 这三个文件，未 push。

## 遗留 / 交给下一棒或用户手感轮

1. **`CLIMB_VERTICAL_FOLLOW_SPEED=7`、`CLIMB_SWARM_INTERVAL_MS=1500`、`CLIMB_SWARM_MAX_ALIVE=4`**：均为浏览器粗校/项目自定占位值（AS3 真实刷新率/飞行速度常量未反编译出来），标了 TODO-verify，留用户手感轮终校，改一个常量即可调。
2. **Monster3 hit1/hit2 的碰撞盒 width/height/activeDurationMs**：AS3 构造函数/`doHi*()` 没给这几个数（子弹自身尺寸/存活时间在另一个未反编译的类里），继续用 kagami 占位值，同 Monster7 碰撞盒尺寸一样的 TODO-verify 状态，未来要精确复刻手感时需要再挖一次。
3. **Monster13 弹道渲染/接线**：本棒未做（L1/L2 不需要），如果未来 L3 重新开放或某关引入远程怪，`monster-behavior-report.md` 已经写好接线方案，直接抄即可。
4. **技能盒（`castSkill`/`scheduleSkillHit`）同样有 `GROUND_Y` 硬编码的潜在偏差**——本棒只修了连击（`resolveHeroHits`）用到的那处，因为这次验证的是连击命中攀爬段怪物；技能盒目前没有在攀爬段被验证过，如实记录，未处理。
