# zmxy-prefab-compiler — 实现报告

对应任务书：`tasks/prefab-compiler-brief.md`。

## 0. 一句话结论

编译器 + 运行时已交付并通过全部回归真值；两个验收目标（第一关多平台结构、被动技能面板）均已用编译器输出落地并真机（Playwright 驱动的真实 dev server）验证；450 测试基线保持全绿（现 463，含本棒新增 13 条）；`npm run build` 过。第一关的"多平台结构"经 AS3 源码核实后，真实身份是**开放天空里的双跳攀爬**而非离散跳台——已如实按这个真源实现，未发明不存在的平台。

## 1. 编译器设计决策（`tools/prefab-compiler/`）

### 1.1 架构：泛化 `worldmap-deco-origins.py`，不重写

核心原点数学（`recursive_bounds()`）是原脚本的逐字移植：递归 PlaceObject 矩阵链到 shape/text bounds，twips÷20，button 态只并起 `buttonStateUp`（**注意**：原脚本的模块头注释和某报告的 prose 都暗示"button 态含 over/down 并集"，但实际代码只读 `buttonStateUp` ——本编译器忠于**代码**而非文档描述，因为代码产出的数值才是真值表的来源）。

### 1.2 双通道设计

- `recursive_bounds()`：union-everything 的扁平递归，只用于算 `originFrac`（symbol 本地原点分数）——不感知帧边界，这正是原脚本的方法，已用真值表验证其正确性。
- `build_display_frames()`：新增的**时间轴感知**遍历（深度索引的 display list，正确处理 PlaceObject 的 `placeFlagHasCharacter/HasMatrix/HasName` 增量语义 + RemoveObject + ShowFrame 边界），产出结构化的 `frames[]`（每帧一份真实子树，而不是拍平成一张位图）。这是编译器区别于原脚本"只能吐一个数字"的核心泛化点。

### 1.3 输出 schema

见 `tools/prefab-compiler/README.md`。每节点：`type`(container/image/text) + 自身相对父节点的 `matrix`（不预乘祖先链，直接可挂 Phaser Container）+ `originFrac` + `boundsPx` + `textureKey/textureFile`。多帧符号用 `frames[]` 取代 `children`。

### 1.4 纹理解析（四种 FFDec 导出约定，逐一识别）

`shape:png`→`<chid>.png`；`image:png`（原始位图）→`<chid>_<name>.png`；`sprite:png`→`DefineSprite_<chid>_<name>/<frame>.png`；`button:png`→`DefineButton2_<chid>/<frame>_<state>.png`。找不到对应 PNG 一律记 warning + `textureMissing:true`，**不发明光栅化**——遇到的两类真实案例：
1. PassiveSkillControl 内部有纯矢量子 shape（backpack 图标细节层）没有单独导出，已如实记录并跳过，改用 `--flatten-sprite` 把父级 sprite（768，6 帧图标位）当整体渲染纹理引用，而不是伪造子节点位图。
2. `floorBg1`（`DefineBitsJPEG2Tag`）：swf2xml 不像 `DefineBitsLossless2` 那样暴露 `bitmapWidth/bitmapHeight` 属性（JPEG 尺寸编在流内），因此 `recursive_bounds` 对它如实返回"无法推导"，未硬编数字；真实尺寸改用已导出的 PNG 直接读取（1440×690）。

### 1.5 自检（内置，不静默）

bounds vs 导出 PNG 尺寸 ±4px 容差；越界即 warning，且 CLI 默认非零退出（`--allow-warnings` 才放行）。跑过的两个真实符号（PassiveSkillControl 758/768 全closure、世界地图 4 个真值符号）在有完整纹理目录时均 0 warning。

## 2. 回归真值表（`tools/prefab-compiler/tests/`）

| 符号 | id | 真值 | 编译器输出 | 结果 |
| --- | --- | --- | --- | --- |
| s1_1 | 857 | (0.495, 0.659) | (0.495, 0.659) | ✓ 精确 |
| s1_2 | 871 | (0.460, 0.532) | (0.460, 0.532) | ✓ 精确 |
| llbt | 973 | (0.500, 0.500) | (0.500, 0.500) | ✓ 精确 |
| btnnmg | 931 | (0.668, 0.487) | (0.668, 0.487) | ✓ 精确 |

`python3 -m unittest discover -s tools/prefab-compiler/tests -v` → **14/14 通过**（4 条真值回归 + 10 条结构/自检/边界情况，跑在从真实 `OtherMat1.swf` swf2xml 剪裁出的小 fixture 上，不依赖 `vendor/`/`tmp/` 在场）。

`game/tests/prefab.test.ts`（TS 侧运行时纯逻辑，Phaser-free）另 13 条，直接吃编译器对 PassiveSkillControl(769) 和 s1_1(857) 的真实输出（不是手造 JSON）：结构（bg + 5 pskill 槽）、坐标（122~124, 144.95/221.95/304.95/381.95/460.95，逐一比对 `tasks/skilltree-report.md` §1.2 已人工核验的数值）、origin、多帧 gotoFrame 语义、重名实例报错。

## 3. 运行时 `game/src/prefab/PrefabLoader.ts`

分两层，呼应本项目既有的 systems/scenes 分层惯例：`normalizeNode`/`indexInstances`/`countFrames`/`approximateRotation` 是纯函数（vitest 直接测，不碰 Phaser——本仓库现有测试套件里没有任何一条实例化真实 `Phaser.Scene`，遵循同一惯例）；`PrefabLoader.build(scene, doc)` 是薄的 Phaser 具体化层，递归造 Container/Image/Text，多帧节点包一层 `gotoFrame(n)` 句柄。

已知简化：矩阵里的 `rotSkew0/rotSkew1` 只按"无真实斜切、纯旋转"近似换算角度（`approximateRotation`）——目前编译过的所有符号都不含真实斜切，未来遇到斜切符号会给出合理但不精确的旋转角，不会抛错，已在代码注释里点名。

## 4. 目标 C2：技能树被动面板

### 4.1 编译

`PassiveSkillControl`（Symbol 769，`export.shop.PassiveSkillControl`）→ bg shape(758, 746×429) + 5 个 `768`（`export.shop.PassiveSkill`，6 帧图标位，`--flatten-sprite` 保留其真实帧渲染）实例，位置 (124,144.95)/(122,221.95)/(122,304.95)/(122,381.95)/(122,460.95) —— 与 `tasks/skilltree-report.md` §1.2 人工读出的坐标逐位吻合。真实纹理已落 `game/public/assets/extracted/prefab/PassiveSkillControl/`（758.png + 768_1..6.png），编译产物落 `game/src/data/prefab/PassiveSkillControl.prefab.json`。

### 4.2 SkillTreeScene 接线

`buildPassivePanel()` 改用 `PrefabLoader` 挂真实场景图（替换原来的单张拍平位图 `passive_panel.png` + 手写说明文字），整体灰色调（沿用既有"无系统支撑→置灰"的处理原则）。Symbol 769 从未在 `BuySkill`(489) 的 timeline 里被静态摆放过（swf2xml 全文检索 characterId=769 的 PlaceObject 为零命中）——它和 `fbEnter` 等一样是 AS3 运行时 `new` 出来的，因此没有真源舞台坐标可取；沿用前人手放的 (97,100) 作为锚点（把编译出的 bg 左上角对齐到那里），已在代码注释标注为 Adapted，不是凭空发明。

### 4.3 顺手揪出的第二个叠印源

用户报告的截图 bug 描述"切被动页签时隐藏主动表格底图"——**这句话涵盖两层**：并发的另一路团队已经修了第一层（`tableLayer`，烘焙表格底图 `st_table1`，切 tab 时 `setVisible`）；本棒真机验证（Playwright 截图）时**发现第二层没修**：`refresh()` 里 `buildSchoolCards()`（心法一/心法二"当前等级/升级所需灵魂"文字卡片，`cardsLayer`）不分 tab 一律重绘，导致切到被动页签后主动 tab 的心法卡片文字仍浮在新渲染的 prefab 面板上方。已收进同一个 tab 分支判断内（`if (activeTab==='active') buildSchoolCards()`），不再无条件调用。真机截图验证：修复前（`06-skilltree-passive.png`）仍可见"当前等级：2""火系心塽"字样叠在"热血/升级"prefab 行上；修复后（`07-passive-fixed-v2.png`）干净，切回主动 tab（`08-back-to-active.png`）无回归。

## 5. 目标 C1：第一关多平台结构

### 5.1 关键发现：原版没有离散"平台"

`out_res/1.swf` 的 swf2xml **全文零命名 PlaceObject**（跟主 SWF 的 `StageListener12.as` 引用的 `fbEnter`/`colipse` 等运行时对象同构——关卡容器全靠 AS3 `addChild` 动态搭建，不是烘焙在 timeline 里的静态场景图）。读 `StageListener11.as`（第一关子阶段 1 的真实控制器）证实：它是纯粹的**开放天空双跳攀爬**——`gc.hero1.y <= -1900` 触发 boss，期间 `MainGame.getInstance().createMonster(30, randHero.x+rand, randHero.y-rand)` 持续在玩家周围刷 Monster30，全程**没有任何地板/平台碰撞体**。用户所说"原版多平台（爬塔/跳台）结构"，字面对应的正是这套"必须持续双跳才能净爬升"的机制，不是一排排可站立的台子。

第一关真实结构（三段，均已用真机验证的三张真实背景图核实）：
- **子阶段 11（爬塔）**：`bg11.png`（编译得 1132×3051，本地原点 (0.052,0.777) 靠底部）——垂直画面，底部暖雾起点，穿云而上到顶部南天门/彩虹summit。
- **子阶段 12（地面·法宝门）**：`bg12.png`（4890×596）——横版莲池+华表，`fbEnter` 需要用技能弹幕命中打开一道门。
- **子阶段 13（地面·boss 前场）**：`bg13.png`（4903×678）——横版南天门牌坊长廊。

### 5.2 已交付：真实双跳攀爬前置关卡

鉴于：(a) 边界明确"不动 systems/ 战斗与存档逻辑"，(b) `systems/monsterSim.ts` 完全没有纵轴（怪物只在单一 Y 线上模拟），要让 Monster30 真的在空中跟着玩家纵向刷怪需要改 monsterSim 的数据结构——这已经越出本棒边界，**没有做**（如实记为遗留缺口，见 §5.4）。

在边界内做到的、真实可玩、非装饰的部分：
- **复用而非发明的物理**：`systems/jump.ts`（`jumpPower=-20`、`jumpCount<2` 双跳、重力，均已是移植自 movement-index.md 的真实数值，且已在 `BattleScene.ts` 里接好但此前从未在纵轴上有发挥空间——因为 `cameras.main.setBounds` 的高度此前被钉死等于视口高度，纵向滚动物理上不可能发生）。C1 未改 jump.ts 一行代码，只是给它腾出了纵向空间。
- **单向棘轮**（`BattleScene.climbFloorY`）：`stepVertical()` 落地永远回到 `cfg.groundY`，纯双跳在固定地板上只能弹起~180-200px 后必然弹回原地——不棘轮就永远爬不上去。每帧把 `heroConfig.jump.groundY` 抬到玩家曾经到达过的最高点（最小 y），零碰撞体、零新物理公式，只是把已有 config 字段当运行时状态用。
- **相机纵向跟随**：`cameras.main.startFollow(hero,...)` 本来就存在，只是纵向 bounds 被钉死；`startClimb()` 临时放宽 `setBounds` 高度，`finishClimb()` 精确复原，对其余关卡零影响（已用 Playwright 验证：进二关时 hero 仍是 `grounded:true, y:400` 的纯地面态）。
- **背景**：`bg11` 平时是 `scrollFactor(0.12, 0)`（纵向钉死，只露出顶部一小截，这正是用户投诉的"横版平地"视觉成因——整关其实一直在看 bg11 的顶部裁切）；爬塔时改 `scrollFactor(0.12, 1)`，跟随相机纵向平移，玩家真的会看到云层向下退去、南天门逐渐显现。
- **走廊收窄**：`heroConfig.minX/maxX` 临时收到 `HERO_START_X±140`，贴合 bg11(1132px 原生宽，缩放后接近画布宽) 的视觉尺度；结束后精确复原。
- **不新增战斗**：怪物波次（`updateLevel`）在爬塔阶段完全不调用，爬塔结束的那一帧起才第一次生效——`LEVEL_1_WUYING.stopPoints[0]`（Monster30 + 2×Monster8）**原样**触发，未改一行 `level.ts` 波次数据。

### 5.3 真机验证（Playwright 驱动真实 dev server，非截图摆拍）

流程：主菜单 → 继续游戏 → 存档 1 → 世界地图 `__shellMapEnterLevel(0)` → BattleScene(campaignIndex=0)。

1. 进入即为爬塔态：`__heroState()` → `{x:480,y:400,grounded:true}`（走廊居中、地面态，等待第一跳）。
2. 连续双跳序列（K 键，间隔约 280ms 触发第二跳）：`y` 从 400 单调棘轮下降 → 310 → 220 → 130（多次尝试原地保持，符合"没超过棘轮线就不进"的预期），最终一次双跳突破 `CLIMB_TOP_Y=80`，`finishClimb()` 触发，`y` 瞬间复位到 400、`grounded:true`——**截图 `verify-shots/11-climb-complete.png`**：镜头已从爬塔顶部构图切回地面构图，HP 从 240 掉到 143（说明怪物已经刷出并且真实在打玩家）。
3. `__levelState()` 确认：`name:"巫鹰关"`，`aliveMonsters` 含 `monster30(hp:1)` + 2× `monster8(hp:80)`——与 `tasks/level-pipeline-report.md` 记录的 stop point 0 roster **逐字一致**，证明波次数据分毫未动。
4. 用 `__killGrunts`/`__killBoss`/`__usePortal` 打穿全部波次到 boss（`monster3, hp:300`，与 report 记录一致）到清关，`campaignIndex` 正确推进到 1（"天王关"）。
5. 二关确认无污染：`__heroState()` → `{y:400, grounded:true}`，纯地面态，`climbActive` 相关代码路径对非 L1 关卡零介入。

截图证据（`game/tmp/prefab-dev/verify-shots/`）：`10-climb-start.png`（爬塔起点，可见 bg11 顶部南天门原生构图）、`11-climb-complete.png`（登顶后回到地面态并已受击）、`13-climb-done-combat.png`（怪物已刷出正常战斗）、`14-level2-normal.png`（二关地面态无回归）。

### 5.4 遗留缺口（如实记录，不隐瞒）

1. **爬塔期间无怪物真实纵向追击** —— 原版 StageListener11 会让 Monster30 群在玩家攀爬途中持续追打；本棒的爬塔是纯位移挑战，怪物延后到登顶后才刷（同一批、同样数量，只是时序前移到地面阶段）。根因是 `systems/monsterSim.ts` 没有纵轴，要做到"怪物在空中追打"需要往 monsterSim 加 y 状态——这已越出"不动 systems/ 战斗逻辑"边界，未做，需要用户/主会话拍板是否值得为此单独开一棒扩展 monsterSim。
2. **子阶段 12（法宝门）、13（南天门长廊）未独立成程序化的横版子场景** —— 目前登顶即直接进入现有的单屏地面战斗（用的仍是 bg12/bg13 作为该单屏的背景图层，这部分其实是移植前就已存在、本棒未改的既有渲染），没有把"打开法宝门"这个 AS3 小谜题（`fbEnter`/`colipse` 碰撞开关）实现出来——同样是没有对应系统支撑（技能子弹与场景物体的碰撞钩子当前没有暴露），记录不造假。
3. **CLIMB_TOP_Y=80（净爬升 320px）是刻意压缩过的可玩性数值**，不是 bg11 真实 3051px 高度的 1:1 复刻——按原版数值爬完需要几十次精确双跳，判断为对手感不利；已在代码注释标注为 Adapted 而非发现的真值。
4. **没有找到 Online 版本的第一关截图做交叉核对**——brief 提醒的"Online 版可能有版本差"这次没有可比对的参照图源，本棒的真源链条自洽（vendor `out_res/1.swf` SWF 位图 + 主 SWF `StageListener11.as`），但未做双源交叉验证，如брief所述以 vendor 为准。

## 6. 测试与构建

- `python3 -m unittest discover -s tools/prefab-compiler/tests -v` → 14/14。
- `cd game && npx vitest run` → **463 passed**（基线 450 + 本棒新增 13 条 `tests/prefab.test.ts`），0 failed。
- `cd game && npm run build`（`tsc --noEmit && vite build`）→ 通过。
- 真机验证：见 §4.3（被动面板叠印修复前后对比截图）、§5.3（第一关爬塔→战斗→通关→二关无回归全链路）。

## 7. Commit 列表

本地 commit，未 push（遵循边界）。注意：`SkillTreeScene.ts`/`BattleScene.ts`/`systems/skillTree.ts`/`ui/hud/SkillBarHud.ts` 这几个文件在本棒开工前就已经被**同一工作区里并发跑着的另一路团队**改动过（技能中文名 `SKILL_DISPLAY`、`SkillBarHud` 图标点击、`tableLayer` 可见性修复等，与本棒任务无关但物理上在同一份文件里、无法在 git 层面拆分）——本次 commit 的这几个文件的 diff 是"他们的改动 + 本棒的改动"的合集，已在上面各节逐条标注哪部分是本棒做的。

## 8. 边界遵守情况自查

- 未修改 `game/src/systems/` 下任何既有文件（`jump.ts`/`level.ts`/`monsterSim.ts`/`heroSim.ts`/`heroIdentity.ts` 均只读引用，零编辑）。
- `level.ts` 本身零改动——第一关的"平台数据"以 BattleScene 内的爬塔状态机 + 编译出的 bg11 真实尺寸常量形式存在，未新增 `level.ts` 字段（因为真源本就没有可摆进 `LevelDef.stopPoints/arenaBounds` 里的静态平台几何，见 §5.1）；如果后续要把 climb 描述进一步数据化（比如支持其他关卡各自的攀爬段），建议届时再给 `LevelDef` 加可选字段。
- `SkillTreeScene` 本棒只改了 `buildPassivePanel()` 内部实现 + 补上 `buildSchoolCards()` 的 tab 判断（后者是本棒真机验证时发现的真 bug，按"实现违背自身意图"条款就地修复，未越权碰其他函数）。
- 测试基线 450 保持全绿；`npm run build` 过；调试产物全部落在 `game/tmp/prefab-dev/`（gitignored）。
