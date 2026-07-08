# L2 掉落表补齐 — 交付报告

对应团队 lead 开的窄口子权限："给你开窄口子，就地补齐后收棒。授权范围：drops.json + 掉落相关测试文件"。范围内文件：`game/src/data/drops.json`、`game/tests/dropRoll.test.ts`（唯二改动）。

## 一个前置发现，直接改变了任务的字面解读

反编译 L2 六怪（Monster6/9/10/15/16/19）的 `fallList` 之前，先查了这个项目已有的 `tasks/consumables-report.md`（第76行）：**`drops.json` 现有的 19 个 itemId（demon_soul/silver_ore/…/star_blade）是本项目自己发明的一套平行掉落系统，不是原版 AS3 `fallList` 字符串代码（如"ptdxzg"/"wptm"）的逐字翻译**——原文："原版数据里没有物品id（这些是场景对象不是背包物品）...drops.json那套背包掉落体系跟这套完全独立平行，互不干扰"。

这意味着"反编译L2六怪的fallList，物品名→我们的itemId映射"字面做不到——AS3 的 fallList 代码（qybd/qyfp/hylc/hylz/qysz/hylk/wpqhs1/gjs1/fys1/mfs1/sms1）没有对应的显示名/图标可查（不是本项目 21 个已有图标里的任何一个，且没找到公开的原版物品代码字典）。真正能且应该照 AS3 的是**掉率数值背后的概率机制**，物品本体延续 L1 已经确立的"用本项目自己的 19 个既有 itemId 做主题合理的分配"这套惯例（这也是团队 lead 授权文字里"如实记report选最近似替代"暗示的路径——没有硬造新 item，全部复用已有图标）。

## 反编译结果：AS3 真实掉落机制（`base.BaseMonster.as::fallEquip()`）

```as3
_loc3_ = protectedParamsObject.probability
if (isBoss) _loc3_ *= 1.5
_loc3_ *= 1 + (时装掉落加成，本项目无时装系统，恒为0)
if (Math.random() > _loc3_) return  // 本次击杀不掉任何东西
// 否则从 fallList 里等概率随机抽一件
```

即：**每次击杀最多掉一件**，先掷一个"这次到底掉不掉"的总闸概率（`probability` 字段，isBoss 再 ×1.5），闸门通过后从 `fallList` 里均匀抽一件。这跟本项目 `drops.json`/`rollDrops()` 现有的模型（**每件物品各自独立掷概率，一次可能同时掉好几件**）是不同的机制——但这个"各自独立"模型是 L1 部分**早就定好的既有约定**（非本棒发明），为了两套关卡数据结构统一、`rollDrops()` 引擎不用改，本棒延续这个既有约定，只是让**填进去的概率数字**有真实 AS3 出处：`每件物品chance = probability × (isBoss?1.5:1) / fallList.length`。

逐怪反编译结果：

| 怪 | AS3 `probability` | AS3 `isBoss` | fallList 长度 | 每件物品换算 chance |
| --- | --- | --- | --- | --- |
| Monster6（增长天王） | 0.5（M6.as:65） | true（L1/L2分支，先前hitstun-triad棒已核实） | 2（"zb"装备类：qybd/qyfp） | 0.5×1.5/2 = **0.375** |
| Monster16（广目天王） | 0.45（M16.as:67） | true | 2（"zb"：qysz/hylk） | 0.45×1.5/2 = **0.3375** |
| Monster15（多闻天王） | 0.4（M15.as:68） | true | 2（"zb"：hylc/hylz） | 0.4×1.5/2 = **0.3** |
| Monster9/10/19（L2杂兵） | **0（else 分支从未覆盖，只有 curStage==9 精英分支才是0.05）** | false | 5（"dj"道具类） | **0（这三只在L2语境下原版就是零掉落，不是缺口）** |

Monster9/10/19 逐字确认（以 Monster9 为例）：`this.protectedParamsObject.probability = 0;` 在构造函数最外层无条件执行；`if(gc.curStage==9){ probability=0.05; ...精英分支... } else { ...L2杂兵分支（hp1500/def10，与level2.ts一致）... }`——**else 分支里没有任何一行改过 probability**，所以三只 L2 杂兵在我们实际用到的语境下，`probability` 值就是 0，`fallEquip()` 的 `Math.random() > 0` 恒真，函数直接 return。**这三只怪在原版里就是不掉东西的杂兵，不是本棒漏做。**

## 物品分配

Monster6/15/16 的 AS3 fallList `bigtype` 都是 `"zb"`（装备），对应本项目现有 `kind:"equip"` 的 4 件既有物品（cotton_robe云纹布袍/guard_boots踏云靴/monkey_talisman灵猴护符/star_blade星纹短刃，全部已在 L1 怪物身上用过，图标已加载，未新造）。按三个天王的强度梯次（7874 < 12000 < 16000）粗分：

- **monster6**（最弱天王）：cotton_robe（品质2，四件里最低）+ star_blade
- **monster16**（中间天王）：guard_boots + monkey_talisman（两件品质3）
- **monster15**（关底boss，最强）：monkey_talisman + star_blade（品质3组合，跟16关重叠是刻意的——这四件装备本来就是通用道具，不是某个特定怪的专属叙事，L1的 guard_boots/monkey_talisman/star_blade 本来也各自只在一只怪身上出现过一次，跨天王重复使用符合"通用装备池"的直觉）

`weight`/`qtyMin`/`qtyMax` 字段延续 L1 装备类条目的既有惯例（`weight:1, qtyMin:1, qtyMax:1`，非堆叠单件）。

## 测试

`dropRoll.test.ts` 新增 4 条：monster6/16/15 各一条（用 `sequenceRng` 精确对上上表的 chance 数值和命中/不命中分支），monster9/10/19 参数化一条（`it.each`，confirmed 恒返回空数组）。

## 验收

- `npx vitest run`：40 files / **493 passed, 1 skipped**（较上一棒的487净增6：dropRoll.test.ts净增4条+其余2条来自并发工作树其他棒，不影响本棒范围）。
- `npx tsc --noEmit`：0错误。`npm run build`：过。
- 浏览器实测（`localhost:5205`）：清完 L2 全部杂兵/天王波次，多闻天王（16000hp）刷出，`__killBoss()` 秒杀后（用强制 rng 复核，避免真实 30% 概率单次抽样运气导致空表现）确认 `rollDrops('monster15', ()=>0.1)` 返回 `[monkey_talisman, star_blade]`；随后一次真实通关流程里，`__worldState().inventory` 直接显示英雄背包里进了 `monkey_talisman`/`star_blade` 各1件——端到端验证了"击杀→掉落→拾取→入包"整条链路用的是多闻天王自己的表，不是 monster30 的蜂群战利品。截图 `game/tmp/l1-truth-flow/4-l2-boss-real-drops-inventory.png`。

## Commit

`git add`：`game/src/data/drops.json`、`game/tests/dropRoll.test.ts`（+本报告）。未碰 `dropRoll.ts`（引擎逻辑不需要改，L1/L2 用同一套独立概率模型）。
