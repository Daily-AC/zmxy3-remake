# hitstun-triad 棒 — 交付报告

团队 lead 三条追加消息合并处理："手感三件套"（坐标/命中对账+脚底基线、怪物攻击力真实化、无限眩晕）置顶，弹道/verticalFollow/巫鹰hit2（behavior-wiring 棒已交付，见 `tasks/behavior-wiring-report.md`）顺延不变。范围内文件：`game/src/scenes/BattleScene.ts`、`game/src/systems/combo.ts`、`game/src/systems/heroSim.ts`、`game/tests/combo.test.ts`。未碰 `heroSkill.ts`/`skillTree`/其他 scene/`ui/`（工作树里同时有其他棒在改 `SkillTreeScene.ts`/`WorldMapScene.ts`/`BackpackWindow.ts` 等文件，`git status` 里能看到，本棒 commit 只 add 自己这四个文件，不碰它们）。

## 1. 双向命中错位 + 脚底基线（同根因，一起修）

### 根因

反编译 `base.BaseBitmapDataClip.as`（角色/怪物位图渲染的共同基类）的 `setXYByDirect()`：

```as3
x = -bmWidth/2 ∓ offsetX
y = -bmHeight/2 + offsetY
```

即：角色自身的位图格（`bmWidth×bmHeight`，每个角色/怪物各自不同）以**自身注册点为中心**渲染，`offset.x/y`（本项目已从各自 `initBBDC()`/`setOffsetXY()` 逐字抠出）只是这个居中位置上的微调——这正是本项目 `renderEntity()`/`applyHeroRender()` 现有 `state.x/y + offset*scale`（Phaser 默认 origin 0.5,0.5）的写法，翻译是对的。

真正的 bug 有两处，都是"逻辑锚点(state.x/y)"与"渲染视觉中心/尺寸"脱节：

1. **`MON_RENDER_OFFSET_Y = 30`**：一个写在 milestone-2 阶段（真实 per-species offset 还没抠出来之前）的占位补丁，注释原文"monster cell is shorter; nudge feet to the floor"。等到后来的怪物行为/关卡棒们把每只怪的真实 AS3 offset 抠出来后，这个+30 变成了**叠加在正确数值上的第二次、无协调的修正**，而且只加在怪物侧，英雄侧 `applyHeroRender` 从来没有对应项——所以英雄和任何怪物的脚必然差 30px 左右，且每只怪偏差幅度还因各自 offset/cellH 不同而各异。手算验证：悟空（cellH200,offset.y=-15,scale1.5）脚部 = GROUND_Y+127.5；去掉+30 后 Monster3（cellH180,offset.y=-5）算出来**恰好也是** GROUND_Y+127.5——完全对齐。**删除**了这个常量。
2. **怪物命中盒固定 120×140，锚在裸 `state.x/GROUND_Y`**：不管怪物是90px的小虫还是350px的巨灵神/多闻天王，命中盒尺寸和位置从不跟随怪物真实渲染中心/尺寸变化——大怪的可见身体大部分落在判定盒之外，"棒子打到怪物身体中心了，判定是没打到"对大中型怪几乎必现（巨灵神验证：命中盒 h=140 vs 视觉体高 350*1.5=525，判定盒只覆盖视觉身体的一小截，且中心还偏离 122px）。

### 修法

- 新增 `heroVisualCenter()`/`monsterVisualCenter()`：与 `renderEntity()`/`applyHeroRender()` **完全同一套公式**算出的真实渲染中心。
- 新增 `monsterHitbox(e)`：120×140 基准按该怪 `cellW/cellH` 相对英雄 200×200 参考格的比例缩放，居中在 `monsterVisualCenter()`。
- `resolveHeroHits()`（英雄连击命中怪物）、`scheduleSkillHit()`（技能命中怪物+英雄技能盒自身定位）、`resolveEnemySkillHit()`（巫鹰hit2判定英雄躲避/命中）、怪物头顶血条位置——全部从裸 `state.x/GROUND_Y` 改成上述真实中心/真实尺寸。
- 移除 `MON_RENDER_OFFSET_Y`。

### 实测证据（`game/tmp/hitstun-triad-flow/`）

- `1-foot-baseline-grunt.png`：悟空与两只小怪（乌龟机甲 Monster8、飞鸟 Monster30）并排站在同一块地面上，肉眼可见三者脚部落在同一水平线。
- `2-foot-baseline-bigmonster.png`：悟空与巨灵神（Monster5，cellW/H=350，本项目目前最大的 L1 怪之一）并排，巨灵神视觉体型远超英雄但脚部仍落在同一地面线——同时验证了旧 120×140 固定盒（y跨度330-470）会完全漏掉巨灵神视觉身体的上半部分（真实视觉跨度55-580），新盒（y跨度195-440）居中且按比例放大到 210×245，覆盖巨灵神身体核心区域。
- 命中回归：教程小怪 Monster8，英雄面向正确后普攻，`resolvedAttackIds` 从0变1、hp 80→75——命中判定确实随渲染修正同步生效，不是"改了坐标反而更打不中"。

### 遗留

- `heroAttackBox`/怪物命中盒仍是项目自选的矩形 AABB（120×140/130×150 一类基准值），不是原版 `HitTest.complexHitTestObject()` 的逐像素 `colipse` 判定——`hitbox.ts` 文件头本就承认这是"首个现代切片"的简化方案，本棒只修**位置/尺寸跟随渲染**，没有重新逆向每个攻击的真实像素碰撞形状（工作量级完全不同，需要另开一棒）。
- `castSkill`/`scheduleSkillHit` 里英雄自己的技能盒 offset 计算（`hb.offsetX/offsetY`）沿用 `heroSkill.ts` 原有值，未重新核对——本棒边界不含 `heroSkill.ts`。
- `monsterSim.ts` 里怪物打英雄的 `meleeReach`（x轴距离判定）仍是纯x轴，没有把 `offset.x` 的朝向翻转语义也做进去（`renderEntity` 的 `off.x` 本身就不跟随朝向镜像，是全项目一致的既有约定，见代码注释）——量级很小（几到几十px），不是本次症状的主因，未动。

## 2. 怪物攻击力真实化

### 根因

`monsterAttackPower()` 原实现：boss 用 `BOSS_ATTACK_POWER`（真实值，只覆盖4个关底boss monster3/15/22/34），**杂兵/中boss全部走一条从 def 反推的启发式**（`min(60, 8+def*1.5)`），代码自己承认"TODO-verify...tuning heuristic, not a recovered value"。

### 修法

反编译 L1 全部杂兵/中boss（Monster2/4/5/8/30，已有Monster3/7）+ L2 全部（Monster6/9/10/16/19，已有Monster15），逐个读 `attackBackInfoDict["hit1"].power/attackKind`（在构造函数里对所有 `curStage/curLevel` 分支**无条件**赋值，只有 hp/isBoss 随分支变化，故一个值可覆盖 L1/L2 两条分支）：

| 怪 | 旧启发式值 | 真实AS3值 | 差异 |
| --- | --- | --- | --- |
| monster30（攀爬蜂群） | 8 | **5** physics | 略降 |
| monster8（L1杂兵） | 11 | **8** physics | 略降 |
| monster7（L1杂兵） | 已是14（monster-behavior棒查过） | 14 physics | 不变 |
| monster3（巫鹰,boss） | 已是14（behavior-wiring棒查过） | 14 physics | 不变 |
| monster2（顺风耳,miniboss） | 23 | **28** physics | +22% |
| monster5（巨灵神,miniboss） | 26 | **40** physics | +54% |
| monster4（千里眼,miniboss） | 20 | **50** physics | +150% |
| monster10（L2杂兵） | 26 | **30** physics | +15% |
| monster9（L2杂兵） | 23 | **40** physics | +74% |
| monster19（L2杂兵） | 21.5 | **50** physics | +133% |
| monster6（增长天王,king） | 30.5（被min(60,...)封顶前更高也封顶） | **100** physics | +228% |
| monster16（广目天王,king） | 35 | **129** physics | +269% |
| monster15（多闻天王,L2boss） | 已是186（原有BOSS_ATTACK_POWER） | 186 physics | 不变 |

统计口径：`min(60,...)` 封顶本身就是一个致命缺陷——所有 def≥35 的怪（几乎全部 miniboss/king）都被压到 58-60 附近，**天王/中boss和杂兵打出来的伤害区分度被完全抹平**，这正是"怪物打人只-1"体感成因之一（配合英雄防御的双向减伤公式，一个被腰斩两次的原始攻击力，减伤后很容易被 `max(1,...)` 兜底吃成1点）。

数值验证（`resolveIncomingHeroDamage`，英雄 def=4）：monster8 老启发式11→减伤后7点，真实值8→减伤后4点（杂兵变得更"温和"，符合杂兵应有的体感）；monster16 老启发式35→减伤后31点，真实值129→减伤后**125点**（天王级真正打疼人，不再是杂兵平砍的错觉）。

### 遗留

- `attackBackInfoDict` 里还有 hit2/hit3 等多段攻击（如 Monster6 有 hit2_1/hit2_2 双阶段魔法斩、Monster16 有 hit2/hit3/hit4）——本棒只接了每只怪的 **hit1**（普攻，唯一在 monsterSim 里建模的攻击）。这些怪的技能段攻击（如天王的魔法技能）monsterSim 现在还没有对应的行为库接线（同 behavior-wiring 棒报告里"Monster7/13不接"的判断逻辑一致：没有消费方就不建模），如实记录，不是漏做。
- L3/L4（monster22/34）表项保留但未重新核实（超出当前范围，代码留库不删）。

## 3. 无限眩晕（最高优先级）

### 排查过程 + 关键发现

先反编译 `base.BaseMonster.as`/`base.BaseObject.as` 确认怪物受击机制：`reduceHp()` 命中时，若 `curAction` 已经是 `"hurt"`，只调用 `bbdc.setFramePointX(0)`（重置当前受击动画的帧计数器），**不会跳过重置**——即原版自身的机制就是"连续命中会不断重置硬直动画的倒计时"，且怪物的真实受击硬直时长（`hurt` 行 `stopCounts`，本项目 L1/L2 全部抠过：monster3/7/8/9/15/30 无一例外都是 `[15]` 一格=15tick=**500ms**，B系boss（Monster15/22）也用 `!isBeAttacking()` 同款判定、Monster34 唯一见到的"霸体"（`isGXP` 时 `reduceHp` 的 `param2` 强制 false，完全跳过进入hurt）是 L4 专属机制，**L1/L2 的巫鹰/多闻天王都没有**这个豁免——所以"怪物受击硬直会被连续命中无限重置"是原版真实存在的机制，不是我们移植错了。

真正的分歧点在英雄这一侧：反编译 `export.hero.Role1.as` 的 `myKeyDown()`：

```as3
case "0100": // 攻击键
   if (isAttacking() || isBeAttacking()) { return; }  // 硬摆手中/受击中，直接拒绝，不入队
   this.normalHit();
   cannextaction = false;
```

**原版按键期间按攻击键会被直接丢弃，完全没有"缓冲"概念**——必须等当前挥招动画真正播完（`isAttacking()`变false）后，**再按一次**才会触发下一段连击（`Role1.normalHit()`：`hitNum++` 若 `curtime-lasttime<=1500ms`，否则重置回1）。

本项目 `combo.ts` 的旧实现恰恰相反：挥招过程中按下攻击键会被"缓冲"（`buffered=true`），一旦当前招式动画时长（300-370ms，也是真实AS3值）耗尽就**立即自动**顶上下一段——玩家只要按住/连点攻击键就能几乎零间隔地打满整套五连击。由于每段连击间隔（300-370ms）明显短于任意 L1/L2 怪物的真实硬直时长（统一500ms），"只要一直打，小怪就永久眩晕出不了手"正是这个人为引入的"缓冲自动衔接"设计（这条本来就在 `combo.ts` 自己的旧文件头里被标注为"chosen feel value, TODO-verify"）造成的，不是原版就有的问题。

### 修法

- `combo.ts`：删除 buffer/queue 概念。挥招期间的按键**直接丢失**（不生效），只有招式动画播完后落在 `[stageDur, stageDur+graceMs]` 窗口内的**新**按键才会衔接下一段——逐字对应 `myKeyDown()` 的拒绝逻辑。
- `graceMs`：`220ms`（旧占位值）→ **`1500ms`**（`Role1.normalHit()` 的 `curtime-lasttime>25*60` 真实值）。
- `ComboResult.attacking` 语义收紧为"当前正在挥招"（对应 `isAttacking()`），挥招一结束立刻变 false——不再像旧实现那样在整个1500ms衔接窗口里都锁着角色播放"挥招完成后的最后一帧"（如果不这样改，把 graceMs 从220直接拉到1500ms 会让角色在每次挥招后僵在原地长达1.5秒动不了，是另一个新引入的体验回归）。`heroSim.ts` 里跳跃的门禁同步从"stage>0"改成"comboRes.attacking"（原版 `myKeyDown` 的跳跃分支同样只在 `isAttacking()||isBeAttacking()` 时拒绝，不因为"衔接窗口还开着"就多禁一段）。

### 实测证据

- 单测：`combo.test.ts`（改3条+新增2条）、`heroSim.test.ts`（7条全部原样通过，跳跃/移动的既有断言零回归）。
- 浏览器：模拟真实"只按一次"（等价于原版"按住"，因为 `JustDown` 边沿只触发一次）——Monster8 挨了1下（hp 80→75）后，`monsterMode` 在 t≈500ms 从 `hurt` 恢复成 `chase`（不再永久卡死），`combo.stage` 在 t≈1650ms（300ms挥招+1500ms窗口后）自动回0。模拟"高频连点脚本"（每33ms注入一次按键，人类实际按键频率通常达不到）：由于挥招结束后极短窗口内确实立刻有新按键落地，仍能不间断打满连击——这与原版机制**一致**（原版同样的 300-370ms挥招 vs 500ms硬直数学关系，遇到帧完美连点也一样会被打穿），本棒判断为"不再当场发明一个原版没有的反连招惩罚机制去掩盖这个数学关系"，如实记录：**本修复消灭的是"按住/普通连点即可无脑锁死"这个人为放大的漏洞，不是把原版数学上就存在的极限操作可能性也一并堵死**——后者如果要做，需要用户/主会话明确拍板"允许偏离AS3引入原创防连招设计"，不在移植协议默认授权范围内。

## 4. L1 通关节奏（真机实测 + 结构推算）

- 真实基准：教程杂兵 Monster8（hp80，L1最弱杂兵）用**真实按键节奏**（不用 `__killGrunts` 等秒杀钩子）打死耗时 **14次按键、约4.8秒**。
- L1 结构总血量（`level1.ts` 波次表）：3波杂兵合计约624hp + 3个独立小boss合计7500hp（千里眼1500/顺风耳2000/巨灵神4000）+ 巫鹰300hp = **约8424点血量**需要清空才能通关。
- 按上述基准粗算（8424/80×4.8s ≈ 505秒 ≈ **8.4分钟**纯战斗时间，未计入英雄升级后输出增强、走位寻怪、巫鹰hit2/miniboss真实攻击力带来的受创/回避耗时），L1 现在是一个以**分钟**为单位的关卡，不再是"跳两下就通关"。
- 未做：完整脚本化"零秒杀钩子"的端到端真人式通关录像（涉及大量寻路/走位脚本，超出本轮时间预算）——上面的单位benchmark + 结构总量推算是本棒交付的证据形式，如实标注为"实测基准+结构推算"而非"完整实录"。

## 验收

- `npx vitest run`：40 files / **485 passed, 1 skipped**（较 behavior-wiring 棒交付时的483净增2，combo.test.ts 净增1条替换1条为3条）。
- `npx tsc --noEmit`：0错误。`npm run build`：过。
- 截图：`game/tmp/hitstun-triad-flow/{1-foot-baseline-grunt,2-foot-baseline-bigmonster}.png`。

## Commit

只 `git add`：`game/src/scenes/BattleScene.ts`、`game/src/systems/combo.ts`、`game/src/systems/heroSim.ts`、`game/tests/combo.test.ts`（+本报告）。工作树里同时存在其他棒正在改的文件（`SkillTreeScene.ts`/`WorldMapScene.ts`/`BackpackWindow.ts`/`FurnacePanel.ts`/`ResultBanner.ts`/`MenuButton.ts`/`DialogueBox.ts`/`saveSlots.ts`/新文件 `screenHit.ts`）——本棒确认过这些改动都不是自己做的，**一概不 add，不 push**。
