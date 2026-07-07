# 原版丹药/消耗品表恢复报告

新增文件：`game/src/systems/consumables.ts` + `game/tests/consumables.test.ts`（25例）。未改 `items.ts`/`inventory.ts`/`drops.json`/`heroGrowth.ts`。

## 一句话结论

**原版根本没有"背包丹药，右键使用回血"这种东西**——翻遍了物品数据库（800+条）和背包使用分发器（30+分支）都找不到一个简单的"喝了回X点血"消耗品。真正的回血机制是**世界拾取球**（打死怪后小概率原地掉落一个会飘着走向你、10秒不捡就消失的"回血球"/"回蓝球"），代码在另一个资源包（`backpack1.swf`）里，不在一直在用的主逻辑 SWF 里——这也是为什么之前找不到的原因。

## 反编译过程：两次扑空，第三次换资源包才找到

1. 先查 `my/AllEquipment.as`（背包/装备总数据库，800多条 `MyEquipObj` 定义）：所有带"丹"字的条目全部是炼丹炉强化材料（生命石/魔法石/攻击石/防御石，都是装备强化用，不能直接吃）、宠物专用道具（长生丹/还魂丹）、或被动回蓝佩饰（"缓慢回复少许生命"类符宝，装备后持续生效，不是一次性消耗品）——没有一个是"吃了瞬间回血"的东西。
2. 再查 `export/pack/PackThings.as`（背包物品右键使用的分发函数，逐条读了全部约30个 `if/else if` 分支）：技能遗忘道具、宠物复活/续命道具、传送符、经验加成符、技能升级道具……同样没有回血/回蓝道具。
3. 想起 `asset-pipeline-notes.md` 记过 `backpack1.swf` 单独打了一个包含 `export.strength.*`（炼丹炉强化）的资源包，之前没反编译过——试了一下，果然在 `export.cure.*` 包下找到 `SmallHP.as`/`SmallMP.as`/`BigHP.as`（同一批类在主逻辑 SWF 里也能反编译到，两处一致，互相印证）。

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass "export.cure.*" \
  -export script <out> \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/backpack1.swf"
```

## 品级表（回复量/回复方式）

`export.cure.SmallHP.as`（基类）+ `SmallMP.as`/`BigHP.as`（继承自 SmallHP，只覆写 `cure()`）：

| 品级 | AS3 内部名 | 回复类型 | 回复量 | 触发方式 |
| --- | --- | --- | --- | --- |
| 小还血球 | `SHp` | HP | 固定 +100 | 碰到瞬间回复 |
| 大还血球 | `BHp` | HP | **当前最大HP的50%** | 碰到瞬间回复 |
| 小还魔球 | `SMp` | MP | 固定 +100 | 碰到瞬间回复 |

**没有"大还魔球"**——`-selectclass export.cure.*` 精确导出确认只有这3个类，不是漏查。

回复方式都是"瞬间"（不是持续/HoT），触碰到判定盒立即结算然后这个球飘走消失（`TweenMax`飘走+alpha渐隐）。两个HP品级都走 `roleProperies.setHHP(getHHP()+回复量)`——跟 `heroGrowth.ts` 之前恢复的二郎神禁疗门禁是**同一个函数**，所以HP球天然受禁疗影响；MP球走 `setMMP()`，这个函数**没有**禁疗检查，永远不受影响。

## 使用限制：没有背包库存限制，但有拾取窗口和碰撞范围

这些球不是背包物品，是**战斗中飘在场景里的世界对象**，没有"背包库存上限"这个概念（不占背包格）。真正的"限制"是：

- **10秒不捡就消失**（`gc.frameClips*10`，全部3种品级一样，`SmallHP.step()` 里硬编码，`BigHP`/`SmallMP` 各自的 `allcount`(192/72) 字段实测是继承自 `BaseObject` 的动画帧计数字段，跟消失计时无关，别搞混）。
- **碰撞判定**：先粗筛 `|水平距离|<=700` 且 `|垂直距离|<200`，再做一次精确像素碰撞（`HitTest.complexHitTestObject`）。`consumables.ts` 的 `isWithinPickupRange()` 只做了粗筛这一层——跟本项目 `hitbox.ts` 早就定下的"先用显式AABB代替像素级碰撞"的简化原则一致，不是新发明的简化。

之前 `heroGrowth.ts` 那棒查到的"续命丹（复活丹）按品级有使用次数上限"是**另一类道具**（wpsmdN），跟这里的回血球是两回事——那类是背包道具，这类是场景拾取物。两者都已在 `consumables.ts` 里能查到（复活丹的 `immortalityPillUseCap()`/法宝戒指的 `magicRingHealAmount()` 是从 `heroGrowth.ts` re-export 过来的，没有重复实现，单文件就能查全部"回血手段"）。

## 掉落/获取途径：精确复现原版三层随机嵌套

`base.BaseMonster.as` 的 `addMedicine()`（约第1114~1152行），**每次杀怪结算 `dropAura()` 时调用一次**——这是 `monsters-index.md` 早先总结的"先调用 addMedicine()"具体展开：

```
roll1 = random()
若 roll1 >= 0.5:                          // 50%
  roll2 = random()
  若 roll2 <= 0.15:                       // 这50%里的15%
    若 roll2 <= 0.05:                     // 这15%里的5%（稀有分支）
      roll3 = random()
      掉落 = roll3>=0.5 ? 小还血球 : 大还血球   // 50/50
    否则（roll2在0.05~0.15之间）:
      掉落 = 小还血球
  否则: 不掉落
否则（roll1<0.5的另外50%）:
  roll2b = random()
  若 roll2b <= 0.15: 掉落 = 小还魔球
  否则: 不掉落
```

`consumables.ts` 的 `rollMedicineDrop(random?)` **原样复现这套嵌套结构**（不是拍脑袋压成一个扁平百分比常量）——单测里既验证了嵌套本身的确定性分支（用固定 random 序列走到每一条分叉），也用20万次蒙特卡洛验证了折算后的总体概率跟推导一致：

| 结果 | 折算后总体概率（每次杀怪） |
| --- | --- |
| 小还血球 | 6.25% |
| 大还血球 | 1.25% |
| 小还魔球 | 7.5% |
| 不掉落 | 85% |

原版数据里没有"物品id"（这些是场景对象不是背包物品，没有 fallList/物品id这层概念），所以"掉落表物品id"这块没有可记的东西——`monster*.json`/`drops.json`那套背包掉落体系跟这套完全独立平行，互不干扰。

## 跟本项目现有 items.ts/drops.json 的对齐方式

`items.ts` 的 `Effect` DSL（`{type:'stat',...}`/`{type:'onHit',...}`）本来就没有"使用回血"这个变体，本棒没有改 `items.ts` 加新变体（只加新文件的纪律），`consumables.ts` 自己定义了独立的 `ConsumableSpec`/`ConsumableUseResult` 形状，风格上呼应但不强行塞进现有 `Effect` 联合类型。

`drops.json` 里已经有本项目自己发明的占位消耗品 `minor_pill`("小还丹")/`great_pill`("大还丹")，没有任何效果数据——**建议但不强制**的对应关系：`minor_pill`≈小还血球(+100固定)，`great_pill`≈大还血球(+50%最大值)，命名和"小/大"的语感也天然匹配。是否采纳这个映射、要不要给 `drops.json` 补效果数据，留给接线方决定。

## 验证方式

25个单测：三个品级的回复量/资源类型/禁疗可及性逐字段断言；拾取范围的边界值（700/200 恰好在/恰好不在）；HP两个品级在禁疗时"整笔丢弃不打折"、MP永不受禁疗影响；世界拾取(`collectWorldPickup`)和背包手动使用(`useInventoryConsumable`)两个入口在同样输入下产出完全一致的效果（同一份底层函数）；背包用法额外验证"没有该道具时返回undefined不报错"、"消耗恰好1个"、"即使被禁疗挡掉效果，道具依然被消耗"（这条是刻意还原原版行为：碰到回血球时球本身照样飘走消失，不会因为禁疗就把球留在原地）；掉落嵌套随机的确定性分支+20万次蒙特卡洛概率验证（用固定种子的 mulberry32，不依赖 `Math.random`，测试不会偶发抖动）。

`cd game && npx vitest run`：32 个文件、383 例全绿（含并行团队的新增用例）。`npx tsc --noEmit`：干净。

## 接线接口清单

- `CONSUMABLE_SPECS`：三个品级的数据表（`smallHp`/`bigHp`/`smallMp`），直接查阅或复制改数值都行。
- `applyConsumableEffect(id, hp, mp, healBlocked)`：核心效果结算函数，`hp`/`mp` 都是 `{current,max}` 的裸对象，不依赖 `heroIdentity.ts`/`heroCombat.ts` 的具体类型，接线方自己取值传进来、拿返回的 `hpAfter`/`mpAfter` 写回去即可。
- `collectWorldPickup(...)`：世界拾取入口（原版真实机制），跟 `applyConsumableEffect` 是同一个函数的别名，命名上区分"这是一次场景拾取事件"。
- `useInventoryConsumable(inv, itemId, consumableId, hp, mp, healBlocked)`：背包"使用"入口（本项目自己的现代化设计，原版没有），会先从 `inventory.ts` 的 `Inventory` 扣1个 `itemId`，没有就直接返回 `undefined` 不报错。`itemId`（背包物品id）和 `consumableId`（效果规格）分开传，两者的对应关系是接线方决定的事，本文件不写死。
- `rollMedicineDrop(random?)`：杀怪掉落判定，接线方在怪物死亡结算处调用一次，拿到结果就在死亡点生成对应的世界拾取对象（渲染/位移交给接线方，本函数只判定"这次掉不掉、掉哪个"）。
- `isWithinPickupRange`/`PICKUP_RANGE`/`PICKUP_DESPAWN_MS`：拾取判定和消失计时的现成参数，接线方跑自己的 tick 循环时直接用。
- `immortalityPillUseCap`/`magicRingHealAmount`：从 `heroGrowth.ts` re-export，本文件是"查全部回血手段"的单一入口，不用去两个文件里分别找。

## 遗留问题

- 场景拾取球的具体视觉资源（`SmallHP`/`BigHP`/`SmallMP` 各自贴图，图标名 `bunum`/`bulnum` 等飘字资源）未提取，超出本棒"纯逻辑"范围。
- `SmallHP`/`SmallMP`/`BigHP` 的 `allcount` 字段（192/72，继承自 `BaseObject`）本棒判断是动画帧计数、非消失计时，但未逐行验证 `BaseObject` 基类对这个字段的确切用法——如果以后要精确复刻拾取物的动画表现，需要单独确认。
- `minor_pill`/`great_pill` 到 `smallHp`/`bigHp` 的映射只是建议，`drops.json`/`items.ts` 本身未改，接线时需要显式决定是否采纳。
