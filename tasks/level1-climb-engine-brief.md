# 任务书：L1 爬塔引擎重建（平台碰撞 + 卷轴相机 + 持续刷怪 + 飞行怪 + 子场景串联）

派发：2026-07-09 主会话 → codex。产出 report 写 `tasks/level1-climb-engine-report.md`。

## 背景与目标

用户实玩反馈：第一关背景、出怪、地图空间全不对。原版九重天是三段式：

1. **sl11 纵向爬塔**（bg11.png 1132×3051）：横向阶梯平台一路往上跳；乌鸦怪（Monster30）持续在英雄附近上方刷出追着打；爬到顶部平台触发镜头上摇 → 巫鹰（Monster3）登场，**Boss 战期间乌鸦照刷不停**。
2. **sl12 / sl13 横向卷轴**（bg12/13 约 4890×600，配 online_floor12/13.png 地板条）：常规横版推进，杂兵 + 小 Boss（千里眼/顺风耳/巨灵神），细节读 StageListener12/13.as。
3. 子场景之间靠 transferDoor 切换。

当前引擎是"固定单屏 + 一条 groundY + 停点波次"，全部要补课。**机制、数值、手感对 AS3 真源**（项目总纲），观感层用已提取素材。

## AS3 真源（已导出在 `tmp/re-level1/mainscripts/scripts/`，只读）

- `export/level/StageListener11.as`（已逐行核实，直接引用）：
  - 刷怪：初始延迟 72 帧，之后每 `frameClips*6 = 144` 帧一轮（`config/Config.as` 里 `frameClips=24`，即 **3 秒后开始、每 6 秒一轮**，换算到 remake 的 33.3ms tick 自己按墙钟秒数折算并注释出处）；单人每轮 2 只 Monster30，位置 `hero.x + (random-0.5)*300`（即 x±150）、`hero.y - (100 + random*200)`（头顶上方 100~300px）。
  - 顶部触发：`hero.y <= -1900` → 把 y≥-1862 的玩家/宠物搬到 -1950 → 镜头 tween 2 秒 → `createMonster(3, 750, -2050)` 刷巫鹰。**刷怪计时器不因 Boss 出场停止。**
  - 云层装饰 CloudSprite 跟随镜头（观感项，可后置）。
- `export/level/StageListener12.as / StageListener13.as`：横向段的波次/停点逻辑，自己通读移植。
- `World/PhysicsWorld.as`：墙/单向平台碰撞语义真源（`isWall` 实心、`isThroughWall`/`isThroughUpButDownWall`/`isThroughDownButUpWall` 三种单向变体），移植语义前先通读碰撞分支。
- 怪物数值：`game/src/data/levels/level1.ts` 里 LEVEL1_MONSTER_STATS 已是逐字恢复值（Monster30 hp1/speed8、巫鹰 hp300），**沿用不改**；动作表 `game/src/data/monsters/monster30.json / monster3.json` 已就位。

## 场景几何数据契约（并行任务产出）

`game/src/data/levels/level1-geometry.json`，schema 见 `tasks/level1-geometry-brief.md`（字段名冻结）。坐标是原版场景坐标（爬塔段 y 负向上）。**该文件可能晚于你开工落地**：先按 schema 造一份小 fixture 开发+测试，加载层写成读真文件，落地后换线即通。坐标系到 remake 世界坐标的映射由你设计（建议原样平移，不缩放），映射规则必须写进 report。

## 工程要求

- 架构原则不破：规则逻辑写 Phaser 无关纯模块（`game/src/systems/`，vitest 可测）；BattleScene 只做渲染/输入/接线。Phaser 是 v4，渲染 API 与 v3 有差异，动渲染层前查迁移差异。
- 新能力建议落点（可自行调整，report 说明理由）：
  - `systems/platformSim.ts`（新）：矩形平台集 + 单向/实心碰撞判定，供 heroSim/monsterSim 消费；改 `jump.ts`/`heroSim.ts` 把单一 groundY 泛化为"脚下支撑面查询"。
  - `systems/level.ts`：在停点波次模型之外增加"持续刷怪器"模式（间隔/数量/相对英雄偏移/高度触发），不破坏 L2 现用的 WaveSpec 路径（L2 回归必须绿）。
  - `systems/monsterBehaviors.ts` 或新文件：Monster30 飞行追击（无重力、朝英雄飞、碰撞掉血），语义对 `export/monster/Monster30.as`。
  - BattleScene：相机 follow + world bounds 按子场景配置（爬塔纵向 / 横向卷轴）；子场景切换（transferDoor 触达 → 卸载重建下一段）；bg11 纵图与 bg12/13 长图 + online_floor 地板条渲染。
- 存档/世界地图接线不动：入口仍是 CAMPAIGN[0]，通关判定仍走现有 campaignProgress 路径。

## 判据（全部满足才算完）

vitest（新增测试文件，纯逻辑层）：
- [ ] 平台碰撞：下落穿过上方→落在 through 平台上；从平台下方上跳→穿过不挡；solid 墙横向阻挡；throughUpButDown/throughDownButUp 语义与 PhysicsWorld 分支一致（测试名点名对应 AS3 分支）。
- [ ] 刷怪器：3s 首轮、6s 周期、每轮 2 只、落点分布在 hero.x±150 / hero.y-100~300；Boss 出场后计时器继续走。
- [ ] 高度触发：模拟英雄爬到阈值 → Boss 以正确坐标刷出，且只触发一次。
- [ ] 子场景链：sl11 清版条件（巫鹰死）→ door → sl12 → sl13 → isLevelCleared。
- [ ] 全量回归：`npx vitest run` 全绿（含既有 L2 等全部旧测试）。
- [ ] 浏览器冒烟自证：**不要起 dev server**（沙箱无网络权限），把"进入 L1 → 爬塔 → 顶部 Boss → 通关"的关键路径写成可 headless 跑的模拟测试自证；真机浏览器验收由主会话做。

## 边界与纪律

- 只准写：`game/src/systems/`、`game/src/scenes/BattleScene.ts`、`game/src/data/levels/level1.ts`、`game/tests/`、`tasks/level1-climb-engine-report.md`、`tmp/`。
- **禁止**：npm install / 任何网络访问（node_modules 已装好，`game/node_modules/.bin/vitest` 直接用）；起 vite dev server；动 `game/src/data/levels/level1-geometry.json`（那是并行任务的产权）；动 net/ ui/ agent-server/ 及其他 scenes。
- 疑点协议：发现原版"设计奇怪"→ report 记疑点，代码保持原样；只许修真 bug 和平台适配（带 Adapted 注释）。
- commit 只 add 自己的文件（显式路径），不 push。遇 index.lock 重试。
- report 必须含：坐标映射规则、每条判据的证据（测试名/输出摘录）、L2 回归结果、遗留风险清单。
