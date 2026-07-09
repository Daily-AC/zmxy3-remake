# Fidelity A Mechanics Report

日期：2026-07-09

范围：保真修复棒 A（机制与数值）。未联网、未 `npm install`、未启动 dev server。未触碰禁止目录 `game/src/ui/`、`net/`、`agent-server/`。

## Git / Commit 状态

按任务要求尝试在第 1 项完成后提交，但沙箱拒绝写 `.git/index.lock`：

```text
fatal: Unable to create '/Users/e0_7/projects/zmxy3-remake/.git/index.lock': Operation not permitted
```

因此本轮没有 commit hash。下面每项列出对应文件，外层可据此代提交。工作树里还有既有无关未跟踪文件 `tools/render-title-calligraphy.py`，本轮未修改、未纳入清单。

## 1. 击杀掉魂接线

AS3 真源：
- `base/BaseMonster.as:875-903`：`dropAura()` 调 `addMedicine()`、`fallEquip()` 后生成 `auraRed`，`setPower(this.protectedParamsObject.gxp * 2)`。
- `export/monster/Monster30.as:24-36`：乌鸦 `exp=4`、等级门、`gxp=1`。

改动：
- `tools/extract-monster-drops.mjs`：扩展提取 `protectedParamsObject.gxp`，重新生成 85 怪 gxp。
- `game/src/data/original/monster-drops.json`：补齐 85 怪 `gxp` 条件字段。
- `game/src/systems/dropRoll.ts`：新增 `monsterSoulDropAmount(monsterId, context)`，按 `gxp * 2` 算灵魂球数值。
- `game/src/systems/pickup.ts`：掉落实体扩展为 item / soul / consumable 三类，新增 `spawnSoulDrop`。
- `game/src/scenes/BattleScene.ts`：怪物死亡生成可拾取灵魂球，拾取后 `addSoul(this.soulPurse, amount)`，不是直接入账。
- `game/tests/originalMonsterDrops.test.ts`、`game/tests/pickup.test.ts`、`game/tests/battleScenePickupWiring.test.ts`：覆盖 Monster30=2 魂、Monster4=20、Monster5=30，以及灵魂球拾取实体链路。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/pickup.test.ts tests/originalMonsterDrops.test.ts tests/battleScenePickupWiring.test.ts` 通过。
- 完成当时全量：`cd game && node_modules/.bin/vitest run` 通过；`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 2. 掉落改原版单掷模型

AS3 真源：
- `base/BaseMonster.as:1009-1071`：`fallEquip()` 先用总 `probability` 掷一次，`isBoss` 时 `* 1.5`；命中后 `Math.round(Math.random() * (fallList.length - 1))` 只取一件。

改动：
- `game/src/systems/dropRoll.ts`：废除旧 `drops.json` 多条独立掷，运行时改读 `original/monster-drops.json` + `original/equipment.json`；支持已抽取的 stage/level 条件、`isBoss` 条件和 AS3 round 选项语义。
- `game/src/scenes/BattleScene.ts`：`rollDrops(species, Math.random, this.dropRollContext())`，按当前关卡上下文消费原版表。
- `game/tests/dropRoll.test.ts`：覆盖乌鸦 prob=0 不掉、一次总掷、Boss *1.5、100 次确定性 15% 杂兵掉落、巫鹰 s1l1 新手装分支。
- `game/tests/battleScenePickupWiring.test.ts`：静态断言 BattleScene 传入 stage/level context。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/dropRoll.test.ts tests/battleScenePickupWiring.test.ts` 通过。
- 完成当时全量：`cd game && node_modules/.bin/vitest run` 通过；`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 3. L1 物品表按真源重写 + 桃子/回血回蓝拾取

AS3 真源：
- `base/BaseMonster.as:1115-1157`：`addMedicine()` 是击杀时的嵌套随机掉 cure 实体。
- `export/cure/SmallHP.as:63-92`：接触后 `curNum = getSHHP() * 0.25`，调用 `setHHP`。
- `export/cure/SmallMP.as:14-18`：`curNum = getSMMP() * 0.25`，调用 `setMMP`。
- `export/cure/BigHP.as:14-18`：`curNum = getSHHP() * 0.5`，调用 `setHHP`。

改动：
- `game/src/data/drops.json`：置空 `{}`，运行时击杀掉落不再承载妖怪残魂/白银矿石/大还丹等自建表。
- `game/src/systems/dropRoll.ts`：`fallList` 的 `fillName` 全部解析到 `original/equipment.json`，产出真实 `name/kind/rarity`，并附 `sourceFillName/sourceType/sourceQuality/sourceArray` 供核对。
- `game/src/systems/items.ts`、`game/src/systems/save.ts`：允许保存/恢复这些原始来源字段。
- `game/src/systems/consumables.ts`：修正小回血/小回蓝为 25% 最大值，大回血为 50% 最大值。
- `game/src/systems/pickup.ts`、`game/src/scenes/BattleScene.ts`：死亡时调用 `rollMedicineDrop(Math.random)`，生成可拾取 cure 实体；拾取后通过 `collectWorldPickup` 即时恢复 HP/MP。
- `BattleScene.__giveMaterials`：调试材料由自建 `demon_soul/silver_ore` 改为 equipment 真源材料 `wptm/檀木`、`wpxt/玄铁`。
- 测试：`dropRoll.test.ts` 断言新手装/宣花坠来源字段；`originalMonsterDrops.test.ts` 扫描 L1 fallList 都能解析到 equipment；`pickup.test.ts` 覆盖 cure orb；`consumables.test.ts` 修正 25%/50% 数值；`battleScenePickupWiring.test.ts` 覆盖死亡生成和拾取应用链路。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/dropRoll.test.ts tests/originalMonsterDrops.test.ts tests/pickup.test.ts tests/consumables.test.ts tests/battleScenePickupWiring.test.ts`：5 文件，45 通过。
- 全量：`cd game && node_modules/.bin/vitest run`：47 文件，516 通过，1 跳过。
- 类型：`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 4. Monster30 反刷经验门

AS3 真源：
- `export/monster/Monster30.as:24-34`：基础 `exp=4`，任一英雄 `getLevel() >= 10` 时改为 `0`。本次按 SWF 的 10，不按攻略口径 8。

改动：
- `game/src/data/monsterExp.ts`：`monsterExp(species, { heroLevel })`，Monster30 且 `heroLevel >= 10` 返回 0；默认兼容旧调用。
- `game/src/scenes/BattleScene.ts`：击杀结算传 `this.identity.progression.level`。
- `game/tests/monsterExp.test.ts`：断言 9 级仍给 `4*6=24`，10/11 级为 0。
- `game/tests/battleScenePickupWiring.test.ts`：静态断言 BattleScene 传当前英雄等级。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/monsterExp.test.ts tests/battleScenePickupWiring.test.ts`：2 文件，10 通过。
- 全量：`cd game && node_modules/.bin/vitest run`：47 文件，518 通过，1 跳过。
- 类型：`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 5. 乌鸦近战 vs 弹道结论与修复

AS3 真源与结论：
- `export/monster/Monster30.as:112-118`：`setAction("hit1")` 切到第 3 行攻击动作。
- `export/monster/Monster30.as:154-166`：`enterFrameFunc` 在 `hit1` 且 `curFrameCount == 10` 时调用 `doHi1`。
- `export/monster/Monster30.as:171-180`：`doHi1` 创建 `new SpecialEffectBullet("Monster30Bullet1")`，设置 role/direct/action，并推入 `magicBulletArray`。
- `base/BaseBullet.as:209-280`：bullet `checkAttack()` 负责对玩家数组做命中检查。

结论：乌鸦不是地面近战贴脸怪；`hit1` 是发 `Monster30Bullet1` 的远程/特效弹道命中链。此前项目把乌鸦作为 meleeReach 直接命中，是“聚而不啄”的根因之一。

改动：
- `game/src/systems/monsterSim.ts`：新增 `rangedAttack` 配置；有该配置时 hit frame 输出 `projectile-spawn`，不输出 `attack-hit`。
- `game/src/systems/enemyProjectiles.ts`：新增 Phaser-independent 敌方投射物飞行、TTL、线段扫掠命中。
- `game/src/scenes/BattleScene.ts`：Monster30 配置 `MONSTER30_BULLET`；收到 `projectile-spawn` 后生成实体，后续投射物命中再调用 `damageHero`。
- `game/tests/monsterSim.test.ts`：固定 RNG 下乌鸦在射程内发 `Monster30Bullet1` projectile-spawn，且不直接 melee `attack-hit`。
- `game/tests/enemyProjectiles.test.ts`：固定轨迹下投射物对英雄产生真实 hit 事件。
- `game/tests/battleScenePickupWiring.test.ts`：静态断言 projectile-spawn -> projectile entity -> damageHero 链路。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/monsterSim.test.ts tests/enemyProjectiles.test.ts tests/battleScenePickupWiring.test.ts`：3 文件，26 通过。
- 全量：`cd game && node_modules/.bin/vitest run`：48 文件，522 通过，1 跳过。
- 类型：`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 6. 技能激活经济 / 老档迁移

AS3 真源：
- `user/User.as:96-104`：新 User `isstudyskill` 两项 `xflevel:0, skillName:""`，`skillbykey=[]`。
- `user/User.as:114`：`setSkillLimit(5)`。
- `user/User.as:1109-1138`：P1 自动绑定顺序 `Y/U/I/O/L`。
- `export/shop/SkillControl.as:105`、`:295`：升级消耗 `150 * sl * sl * Math.sqrt(sl)`。
- `export/shop/SkillControl.as:302-304`：技能等级上限 9，英雄等级门 `getCurLevel()/5 >= slev`。

改动：
- `game/src/systems/skillTree.ts`：
  - `createDefaultSkillTreeState()` 改为新档首技态：只解锁/学习 `slz`，绑定 `Y`。
  - 新增 `createLegacySkillTreeState()`：保留旧五技 `slz/lys/hytj/lyfb/jdy` + `Y/U/I/O/L`，仅用于老档迁移。
  - 既有学习上限 5、键位 5、升级公式 150·sl²·√sl 保持并测试。
- `game/src/systems/save.ts`：
  - `createGameSave()` 默认使用新 `createDefaultSkillTreeState()`，所以新档不再白送 5 技。
  - `restoreGameState()` 的 `decodeSkillTree(null/invalid)` 使用 `createLegacySkillTreeState()`，所以 pre-S5 老档或损坏/缺失技能字段不会被打回零，也不会失去旧五技。
  - 已经有合法 `skills` 字段的老档按原数据保留；不会重置。
- `game/tests/skillTree.test.ts`：新档首技态、legacy 五技态、学习上限、公式、键位。
- `game/tests/save.test.ts`：新保存默认首技；`skills:null` 迁移五技；合法五技存档保持不变。

老档迁移机制：
- 新档：`createGameSave({ ..., skillTree: undefined })` -> `skills = createDefaultSkillTreeState()` -> `Y: slz`，其余槽为空。
- pre-S5 老档：`skills: null` 或不可读 -> `decodeSkillTree` 返回 `createLegacySkillTreeState()` -> 旧五技仍可用。
- 已保存过技能树的老档：只要 shape 合法，`decodeSkillTree` 按保存内容解码，过滤非法/重复绑定，但不降级到新默认。

验证：
- 相关测试：`cd game && node_modules/.bin/vitest run tests/skillTree.test.ts tests/save.test.ts tests/battleScenePickupWiring.test.ts`：3 文件，48 通过。
- 全量：`cd game && node_modules/.bin/vitest run`：48 文件，524 通过，1 跳过。
- 类型：`cd game && ./node_modules/.bin/tsc --noEmit` 无输出。

## 7. 逐怪 stage 分支记档

本项按任务书为纯文档，未改码。

AS3 分支：
- `Monster2.as:16-27` 顺风耳：`gc.curStage == 3 && gc.curLevel == 3 || gc.curStage == 8` 时 `hp=20000`、`isBoss=false`；否则 L1 mini-boss `hp=2000`、`isBoss=true`。
- `Monster4.as:15-26` 千里眼：同条件 `hp=20000`、`isBoss=false`；否则 `hp=1500`、`isBoss=true`。
- `Monster5.as:16-27` 巨灵神：同条件 `hp=20000`、`isBoss=false`；否则 `hp=4000`、`isBoss=true`。

当前 `game/src/data/original/monster-drops.json` 已记录三者 `isBoss` 的 s3l3/s8 条件分支；HP 分支不在该 JSON 结构内。L2+ 处理时需要把这三只在 s3l3/s8 作为 20000 血杂兵复用分支，而不是 L1 mini-boss。

## 最终验证

最后一次源码全量验证（写 report 前）：

```text
cd game && node_modules/.bin/vitest run
48 test files passed
524 passed | 1 skipped

cd game && ./node_modules/.bin/tsc --noEmit
无输出
```

新增/修改的产权范围内文件：
- `tools/extract-monster-drops.mjs`
- `game/src/data/drops.json`
- `game/src/data/monsterExp.ts`
- `game/src/data/original/monster-drops.json`
- `game/src/scenes/BattleScene.ts`
- `game/src/systems/consumables.ts`
- `game/src/systems/dropRoll.ts`
- `game/src/systems/enemyProjectiles.ts`
- `game/src/systems/items.ts`
- `game/src/systems/monsterSim.ts`
- `game/src/systems/pickup.ts`
- `game/src/systems/save.ts`
- `game/src/systems/skillTree.ts`
- `game/tests/battleScenePickupWiring.test.ts`
- `game/tests/consumables.test.ts`
- `game/tests/dropRoll.test.ts`
- `game/tests/enemyProjectiles.test.ts`
- `game/tests/monsterExp.test.ts`
- `game/tests/monsterSim.test.ts`
- `game/tests/originalMonsterDrops.test.ts`
- `game/tests/pickup.test.ts`
- `game/tests/save.test.ts`
- `game/tests/skillTree.test.ts`
- `tasks/fidelity-a-mechanics-report.md`
