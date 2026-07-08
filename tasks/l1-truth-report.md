# L1 真相考古 + 素材缺口核查报告

考古棒（只读，不改代码）。授权语境：用户系造梦西游官方团队成员，素材使用无版权障碍。
反编译真源：`tmp/l4work/mscripts/scripts/`（149 行 StageListener11 全套 + Monster/base/World 类，5 份副本逐字一致）。

---

## 一句话结论

1. **用户记忆正确，且我们的代码已经实现了四个 boss**——team lead 的前提（"L1 只有 Monster30 蜂群 + 巫鹰"）是**过时判断**，基于早期只读 StageListener11 的考古，而 `game/src/data/levels/level1.ts`（`LEVEL_1_WUYING`）在那之后已把千里眼/顺风耳/巨灵神/巫鹰四个全部编排进来并接进 CAMPAIGN[0]。真正的缺口是**表现层**：三个 mini-boss 被当普通怪刷（无 boss 血条/入场演出），而非缺失。
2. **掉落物图标 100% 有库存**（19 个掉落 itemId 全部有 PNG），根因是**战斗地面渲染器 `makeDropSprite` 没用图标**，用的是星形占位图形 + 文字。背包 UI 反而用了真图标。
3. **传送门是纯占位图形**（矩形 + Phaser star + 文字"↑ 传送"），但**原生素材已提取**：`TransferWind`（传送风）10 帧 PNG 在 `vendor/extracted/OtherMat1/scene_sprites/DefineSprite_1039_.../`，未接线。

---

## 问题 1：L1 真实 roster / 结构

### 关卡编号映射（先钉死结构）

`World/PhysicsWorld.as:311`：场景类按 `"export.gameSence.sl" + gc.curStage + gc.curLevel` 动态加载 → `sl11`/`sl12`/`sl13`。
`config/Config.as:300-301`：默认 `curStage=1; curLevel=1`。

**结论：StageListener 两位数字 = curStage(章) . curLevel(关)。所以 11/12/13 是第一章（stage 1）下的三个独立关卡 1-1 / 1-2 / 1-3**，不是"第一关的三小节"。四个 boss 分布在这三关里：

| 关卡 | 场景/监听器 | 波次/怪物（来源） | boss | AS3 逐字 hp / def |
|---|---|---|---|---|
| **1-1** | sl11 / StageListener11 | Monster30 蜂群（爬塔中 `createMonster(30,...)`，单/双人 maxNums=2/4，间隔 `frameClips*6`）；登顶 `callBoss()` | **巫鹰 = Monster3** | hp **300**（`setHp(5*60)` M3:15），def **6**（M3:21） |
| **1-2** | sl12 / StageListener12 | 破障（fbCount=5，子弹打 colipse）→ 站进 `fbEnter` 副本门 → `MainGame.fbEnter()`；`waitForRegisterDataArray=[Monster8,7,**4,2**]` | **千里眼 = Monster4 / 顺风耳 = Monster2**（放在 timeline，非 createMonster） | 千里眼 hp **1500**（M4:23）def **8**；顺风耳 hp **2000**（M2:24）def **10** |
| **1-3** | sl13 / StageListener13 | 类体几乎空，`waitForRegisterDataArray=[Monster8,7,**5**,30]` | **巨灵神 = Monster5**（timeline） | hp **4000**（M5:24）def **12** |

> 用户说"第一关有四个 boss"——按**第一章（大闹天庭篇）** granularity 完全正确：1-1 巫鹰、1-2 千里眼+顺风耳、1-3 巨灵神。按严格"关卡 1-1"字面则 1-1 只有巫鹰。两种解读我都摆出，不硬凑。

### 四 boss 的 MonsterN 编号 / 触发条件 / hp 逐字

- **巫鹰 Monster3**（`export/monster/Monster3.as`）：`monsterName="巫鹰"`（:41）。isBoss 门控 **`curStage==1 && curLevel==1`**（:38）→ 只有 1-1 是 boss。`setHp(5*60)=300`（:15），def 6，hit1 物理 / hit2 魔法，boss 分支 `probability=1`（:51）。触发：StageListener11 里英雄 `y<=-1900` → `TweenMax.to(gameSence,2,{y:2370, onComplete:callBoss})` → `callBoss(): createMonster(3,750,-2050)`（:143-146）。
- **千里眼 Monster4**：`monsterName="千里眼"`（:48），def 8，probability 0.6。hp 分支：`if(curStage==3&&curLevel==3 || curStage==8) setHp(20000),isBoss=false; else setHp(1500),isBoss=true`（:15-25）→ **1-1/1-2/1-3 均为 boss，hp 1500**。
- **顺风耳 Monster2**：`monsterName="顺风耳"`（:54），def 10，probability 0.6，同款门控 → hp **2000**（else 分支 :24），isBoss=true。
- **巨灵神 Monster5**：`monsterName="巨灵神"`（:56），def 12，`normalAttackRate=0.8`，hit1/2/3 三段，同款门控 → hp **4000**（:24），isBoss=true。
- **Monster30 蜂群**：speed 8、def 0、`isFly=true`、`normalAttackRate=0.25`、`fallList=[]`（不掉落）；level1.ts 记 hp 1。

> 注意 20000-hp 分支：千里眼/顺风耳/巨灵神在 **stage3-3 与 stage8** 是 20000 血的**非 boss 杂兵**（后期"昔日 boss 沦为小怪"回调），在第一章才是 boss。level1.ts 取 else 分支数值正确。

### 我们的移植现状（关键）

`game/src/data/levels/level1.ts` 的 `LEVEL_1_WUYING` **已含全部四个**，接进 `BattleScene.ts:441 CAMPAIGN[0]`：
- 6 个 stopPoint = 3 波杂兵（Monster8/7/30 escalating）+ 千里眼 solo + 顺风耳 solo + 巨灵神 solo，boss = 巫鹰。
- 运行链路完整：`createLevelState(def)`（BattleScene:1217）→ 爬塔 intro（硬编码 Monster30 swarm `updateClimbSwarm`）→ `finishClimb` → `updateLevel` 每帧 `updateLevelSpawn` 迭代所有 stopPoint（systems/level.ts:189-242 `findNextStopIndex`/`getActiveWaveRoster`）→ 全清 `isBossZoneTriggered` → `spawnBoss` 巫鹰。逻辑上四个都会出现。

**真正缺口（表现/保真，非 roster 缺失）：**
1. 三个 mini-boss 经 `spawnActiveWave` → `spawnEntity(..., isBoss=false)`（BattleScene:1471-1476）→ 只有头顶小血条，**没有顶部 BossHpBar、没有"BOSS·XXX"入场 toast**。原版 Monster2/4/5 `isBoss=true` 应享 boss 待遇。这很可能就是用户"感觉不像四个 boss"的来源。
2. level1.ts 把原版三个独立关卡（1-1/1-2/1-3）**压缩成一关连续波次**（文件头自述 "Compressed into ... single-level LevelDef"），符合总纲"神似重制"，但与原版"分关 + 副本门 + 传送"的分段结构不同——是设计取舍，非 bug，供拍板。

**夜间修复建议**：给 monster2/4/5 加 boss 演出（血条 + toast + 可选定身入场）就能满足"四个 boss"的体感；若要更保真可考虑恢复分关。**先跑一遍真实构建确认三个 mini-boss 当前确实刷得出来**（我只读代码判定链路通，未运行验证）。

---

## 问题 2：掉落物地面图标现状

### 图标库存 vs 掉落表覆盖率：100%

`game/public/assets/extracted/icons/` 共 **21 枚**。`game/src/data/drops.json` 覆盖 7 个怪（monster30/2/3/4/5/7/8），共 **19 个不同 itemId，全部有同名 PNG**：

```
demon_soul 妖怪残魂 / silver_ore 白银矿石 / great_pill 大还丹 / bronze_plate 青铜甲片
minor_pill 小还丹 / torn_charm 残破符纸 / spirit_grass 风灵草 / cotton_robe 云纹布袍
bone_shard 白骨碎片 / iron_claw 罗刹爪 / medium_pill 回元丹 / black_iron 玄铁碎片
guard_boots 踏云靴 / beast_fang 妖兽獠牙 / moon_dew 月华露 / monkey_talisman 灵猴护符
cracked_jade 裂纹玉片 / clear_pill 清心丹 / star_blade 星纹短刃
```
另有 `crafted_equip`（炼器产物）、`fallback`（兜底）两枚不被掉落表引用。**掉落侧图标零缺口。**

### 根因：战斗地面渲染器根本没用图标

- `BattleScene.ts:2191 makeDropSprite`：`this.add.star(0,0,4,6,13, rarityColor)` + 文字标签。**地上掉落 = 按稀有度上色的星形占位图 + 名字，从不加载 icon PNG。** 这就是用户"地上掉落的物品没有资源图片"的根因。
- 反证：背包/世界地图 UI **用了**真图标——`BattleScene.ts:1584` / `WorldMapScene.ts:296` 的 `iconKeyFor: item => textures.exists('icon_'+item.id) ? 'icon_'+item.id : fallback`，`BackpackWindow.ts:507-509` 真 `this.add.image(cx,cy,iconKey)`。所以图标已按 `icon_<id>` 键加载可用，只是战斗地面这一处没接。

### 附带 bug（一并报）

`BattleScene.ts:2184 spawnDrops`：`rollDrops('monster30', ...)` **写死 monster30**，无视实际死的是哪个怪。→ 巫鹰/千里眼/巨灵神 等掉的都是蜂群掉落表（妖怪残魂/白银矿石/大还丹），drops.json 里给各怪配的专属掉落（如 monster5 的玄铁碎片/踏云靴）根本刷不出来。修图标时顺手把死者 species 传进去。

**夜间修复建议**：`makeDropSprite` 改用 `this.add.image(0,0, 'icon_'+drop.item.id)`（fallback 到 `icon_fallback`），并确保 icons 在 BattleScene preload（当前 preload 我未见显式加载 icons 目录，需一并补——待验证）。`spawnDrops` 传真实 species。

---

## 问题 3：传送门视觉现状

### 现状：纯占位图形

`BattleScene.ts:1503-1514 showPortal`：蓝色半透明 `this.add.rectangle`（glow）+ `this.add.star`（转动 swirl）+ 文字 `'↑ 传送'`。**没有任何纹理素材**，全是 Phaser 基本图元。印证用户投诉。触发时机：boss 死亡 → `revealTransferDoor` → 关卡完成横幅 → 显示传送门返回世界地图（我们自造的流程）。

### 原生素材：已提取，可直接接线

- **原生类 `TransferWind`（传送风）**：`tmp/l4work/mscripts/scripts/export/mapObject/TransferWind.as`。行为 = 横向漂移的旋风（`x±=10`/帧），hitTest 命中英雄后定身裹挟，`continuedCount` 帧后 `gotoLevel(targetLevel)`。是原版关卡间/世界地图的传送载体（`StageListener101` 调用）。
- **素材已提取（10 帧 PNG，就绪）**：`vendor/extracted/OtherMat1/scene_sprites/DefineSprite_1039_export.mapObject.TransferWind/` 内 `1.png`~`10.png`（各 ~24KB）。`vendor/extracted/OtherMat1/symbolclass/symbols.csv:` `1039;"export.mapObject.TransferWind"`。游戏侧目前**未加载**（`grep TransferWind game/src` 仅一条叙述性注释）。
- 另有 `fbEnter`（副本入口门 MovieClip，放在 sl12 timeline，`StageListener12` 用它进副本）——这是"门"型转场，与"旋风"型 TransferWind 是两种原生转场。我们 boss 后的"传送门→世界地图"是自造构造，**最贴近的原生旋涡素材就是 TransferWind（DefineSprite_1039）**。

**夜间修复建议**：把 `DefineSprite_1039` 的 10 帧做成 spritesheet/动画，`showPortal` 用它替占位图（旋风旋转本身就是原版动画）。无需生图——原件就绪。

---

## 证据文件索引

- 反编译真源：`tmp/l4work/mscripts/scripts/export/level/StageListener{11,12,13}.as`、`export/monster/Monster{2,3,4,5,30}.as`、`World/PhysicsWorld.as`、`config/Config.as`、`export/mapObject/TransferWind.as`
- 我方代码：`game/src/data/levels/level1.ts`、`game/src/scenes/BattleScene.ts`（441/1471/1503/2183-2201）、`game/src/systems/level.ts`、`game/src/data/drops.json`、`game/src/ui/hud/BackpackWindow.ts`
- 素材：`game/public/assets/extracted/icons/`（21 枚）、`vendor/extracted/OtherMat1/scene_sprites/DefineSprite_1039_export.mapObject.TransferWind/`（10 帧）
