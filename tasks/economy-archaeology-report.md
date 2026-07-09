# 经济系统 AS3 考古报告（炼丹炉 / 灵魂经济 / 装备全表）

> 真源：主逻辑 SWF 反编译 AS3，导出在 `tmp/re-level1/mainscripts/scripts/`。本报告所有类名/行号/代码摘录均指该目录（下文路径省略此前缀）。
> 结论先行，逐节给证据。挖不到的明说挖不到。

---

## 全局结论（三句话）

1. **「炼丹炉」= `export/strength/StrengthEquipment.as` 这一个多标签窗口**，内含四个功能页：强化(Strength) / 熔炼(Fusion) / 打造(Making) / 分解(Resolution)。所有配方与数值全部**硬编码写死在 `my/AllEquipment.as`**（switch 表 + 常量表），不走任何外部数据文件。"经文/镶嵌"不是独立炉子，是熔炼页里对法宝(zbfb)输入的特例分支。
2. **原版没有"击杀直接掉魂"机制**。灵魂(lhValue)的进项全部来自**卖掉怪物掉落的装备**（按装备 `getValue` 卖价）+ 一键卖白装(+20/件) + 任务奖励 + 几个固定道具/事件。怪物死亡只掉**装备**和**1 级强化石**，不掉灵魂。经济闭环是「杀怪 → 掉装备 → 卖装备换灵魂 / 分解换材料 → 灵魂+材料喂炼丹炉」。
3. **装备全表在 `my/AllEquipment.as`（2822 行）**，是纯代码常量：5 个数组共约 **218 个 `MyEquipObj` 实例**（67 件真装备 + 120 件物品/材料/宝石/制作书 + 10 件法宝经文 + 12 件时装 + 9 件白装模板）。schema 是 22 个位置参数的构造函数，机械提取成整表 JSON **难度低**（一条正则即可）。

---

## Q1 — 原版炼丹炉

### ①-③ 结论：炉子结构与配方数据结构

**入口**：`GMain.as:437 showStrengthEquip()` 响应事件实例化 `export.strength.StrengthEquipment`。事件由世界地图/游戏内菜单派发，携带 `state`（`"maping"` 世界地图态 / `"gameing"` 关卡内态）。`StrengthEquipment.back()` 据此决定返回地图还是继续游戏。**炉子在世界地图和关卡内都能开**。

**容器 `StrengthEquipment.as`**：顶部四个角色头像选人（`SelectWK/SelectTS/SelectBJ/SelectSS`），四个功能按钮切换子页，右侧挂一个 `BackPackElement` 背包，顶部 `txtlh` 显示当前灵魂。四个按钮 → 四个子类：

| 按钮 | 方法 | 子类 | 功能 |
|---|---|---|---|
| strengthbtn | strMethod | `Strength.as` | 强化装备 |
| mixturebtn | mixMethod | `Fusion.as` | 熔炼/合成 |
| makingbtn | makeMethod | `Making.as` | 打造装备 |
| resolutionbtn | resMethod | `Resolution.as` | 分解装备 |

**配方数据结构**：全部**写死在类里**，不是外部表。核心在 `my/AllEquipment.as`：
- 打造配方：`findNeedMaterialByName(fillName)` — 一个 38 分支的 switch，返回 `[{equip, count}, ...]` 需求材料表（AllEquipment.as:2402–2725）。
- 熔炼配方：`mixProduce(threeObj)` — 一串 `transName(三材料, [a,b,c])==123` 判等，命中即返回产物 `[fillName, 中文名]`（AllEquipment.as:1913–2298 区段）。
- 分解产物：`findResolution(equip)` — 按品质随机产出材料+宝石（AllEquipment.as:2299–2382）。
- 强化成功率/灵魂消耗：`getStrengthNumber` + `transLevelTNeedlh` + `transLevelToProbability`（AllEquipment.as:1823–1912）。

---

### 炉页 1：打造（Making.as）— 这是狭义"炼丹炉"

**流程**（`Making.as`）：
1. 放一本**制作书**（`type=zbwp`，`findUsedByShowId()=="zzs"`，ename 以"制作书"结尾）进 `makingbook` 槽 → `findNeedMaterialByName` 查出需求材料表，显示在 needmaterial1/2 槽。
2. 可选：放最多 3 颗**宝石**（`findUsedByShowId()=="bs"`）进 material1/2/3 槽，给产物附加随机属性。
3. 点打造(dzbtn)，校验：`灵魂 ≥ needLHValueByQuality(产物品质)` 且各材料数量足够 → 扣灵魂、扣材料、产出装备。

**灵魂消耗表**（`Making.as:284 needLHValueByQuality`，按**产物品质**）：

| 品质 | 灵魂 |
|---|---|
| 粗 糙 | 50 |
| 普 通 | 100 |
| 优 秀 | 200 |
| 精 良 | 400 |
| 史 诗 | 800 |
| 传 说 | 1600 |

（无随机失败，材料够+灵魂够即 100% 成功；`+Math.random()` 只是防篡改扰动，取整后无实义。）

**产物计算**（`Making.as:383 achieveWhichProduce`）：产物 fillName = 制作书 fillName **去掉末尾 3 字符"zzs"**，再 `findByName` 取基础装备。例：`whgzzs`(尾火棍制作书) → `whg`(尾火棍)。然后遍历 3 个宝石槽，按宝石类型给产物属性做**加法**：

**宝石→属性加值表**（`Making.as:441 randomGemAttributeByGemName`）：

| 宝石 fillName | 加的属性 | 数值范围 |
|---|---|---|
| sms1 / sms2/scsms2 / sms3/scsms3 | 生命(ehp) | 1~20 / 40~110 / 85~200 |
| mfs1 / mfs2/scmfs2 / mfs3/scmfs3 | 魔法(emp) | 1~20 / 40~110 / 85~200 |
| gjs1 / gjs2/scgjs2 / gjs3/scgjs3 | 攻击(eatt) | 1~10 / 7~20 / 15~40 |
| fys1 / fys2/scfys2 / fys3/scfys3 | 防御(edef) | 1~2 / 2~6 / 5~12 |
| wptlz(土灵珠) | 魔防(magicdef) | 0.01~0.02 |
| wpllz(裂灵珠) | 暴击(ecrit) | 0.01~0.02 |
| wphlz(护灵珠) | 额外生命(eahp) | 1~3 |
| wpflz(飞灵珠) | 闪避(emiss) | 0.01~0.02 |
| wpslz(速灵珠) | 额外魔法(eamp) | 1~2 |

宝石归类判定见 `MyEquipObj.isSms()/isMfs()/isGjs()/isFys()/isTlz()/isLlz()/isHlz()/isFlz()/isSlz()`。

**完整打造配方表逐字（38 条，AllEquipment.as:2402–2725）**
材料图例：`wpEquip18=丝绸(wpsc)` `wpEquip19=玄铁(wpxt)` `wpEquip20=檀木(wptm)` `wpEquip71=玉衡石(yhs)` `wpEquip72=天枢石(tss)`。
表内"制作书 → 产物"由去尾"zzs"得到（产物中文名见 Q3/AllEquipment 制作书定义）。

| 制作书 fill | 产物(角色/品质，见注) | 需求材料 |
|---|---|---|
| whgzzs | 尾火棍(悟空/优秀) | 檀木×20 |
| jmczzs | 角木铲(沙僧/优秀) | 檀木×10 + 玄铁×10 |
| bspzzs | 壁水袍(唐僧/优秀) | 丝绸×20 |
| dtkzzs | 氐土铠(八戒/优秀) | 玄铁×20 |
| wtpzzs | 胃土耙(八戒/精良) | 檀木×20 + 玄铁×20 |
| yhjzzs | 翼火甲(悟空/精良) | 丝绸×20 + 玄铁×20 |
| jmyzzs | 井木衣(沙僧/精良) | 丝绸×40 |
| tfljzzs | 通风灵戒(饰品/精良) | 丝绸×20 + 玄铁×20 |
| mgzhzzs | 马官指环(饰品/精良) | 檀木×20 + 玄铁×40 |
| hljhzzs | 红莲教皇(唐僧/史诗) | 丝绸×80 |
| wsjgzzs | 顽石金刚(八戒/史诗) | 玄铁×80 |
| ydjgzzs | 银弹金弓(沙僧/史诗) | 檀木×40 + 玄铁×40 |
| tdlzjzzs | 提多罗吒戒(饰品/史诗) | 檀木×40 + 玄铁×80 |
| xleyzzs | 厄夜(悟空/邪灵防) | 丝绸×80 + 玄铁×80 |
| xlczzzs | 残昼(唐僧/邪灵防) | 丝绸×160 |
| xlryzzs | 如狱(八戒/邪灵防) | 玄铁×160 |
| xlyjzzs | 犹绝(沙僧/邪灵防) | 丝绸×160 |
| xlthzzs | 天荒(悟空/邪灵武) | 檀木×80 + 玄铁×80 |
| xltczzs | 天残(唐僧/邪灵武) | 檀木×160 |
| xltzzzs | 天罪(八戒/邪灵武) | 玄铁×160 |
| xltszzs | 天殇(沙僧/邪灵武) | 檀木×80 + 玄铁×80 |
| llyzzs | 玲珑玉(饰品/邪灵) | 玉衡石×3 + 天枢石×3 |
| qlgzzs | 虬龙棍(悟空/魂器武) | 玉衡石×3 + 玄铁×300 |
| plzzzs | 蟠龙杖(唐僧/魂器武) | 玉衡石×3 + 玄铁×300 |
| ylfzzs | 应龙斧(八戒/魂器武) | 玉衡石×3 + 玄铁×300 |
| jlczzs | 蛟龙铲(沙僧/魂器武) | 玉衡石×3 + 玄铁×300 |
| jlgzzs | (悟空魂器，见注) | 玉衡石×3 + 玄铁×300 |
| qljzzs | 虬龙甲(悟空/魂器防) | 天枢石×3 + 丝绸×300 |
| plpzzs | 蟠龙袍(唐僧/魂器防) | 天枢石×3 + 丝绸×300 |
| ylkzzs | 应龙铠(八戒/魂器防) | 天枢石×3 + 丝绸×300 |
| jljzzs | 蛟龙甲(沙僧/魂器防) | 天枢石×3 + 丝绸×300 |
| ryjgbzzs | 如意金箍棒(悟空/传说武) | 玉衡石×7 + 玄铁×999 |
| lhzzzs | 轮回杖(唐僧/传说武) | 玉衡石×7 + 玄铁×999 |
| jcdpzzs | 九齿钉耙(八戒/传说武) | 玉衡石×7 + 玄铁×999 |
| mdflczzs | 摩多分浪铲(沙僧/传说武) | 玉衡石×7 + 玄铁×999 |
| dszkzzs | 大圣战铠(悟空/传说防) | 天枢石×7 + 丝绸×999 |
| jljszzs | 锦襕袈裟(唐僧/传说防) | 天枢石×7 + 丝绸×999 |
| tpzyzzs | 天蓬战衣(八戒/传说防) | 天枢石×7 + 丝绸×999 |
| mdyszzs | 摩多月衫(沙僧/传说防) | 天枢石×7 + 丝绸×999 |

> 注：产物角色/品质来自各制作书 `MyEquipObj` 定义处的 instruction 文案（AllEquipment.as:1191–1661）。`jlgzzs` 在制作书列表里名为"蛟龙铲制作书"但 fill 与 `jlczzs` 冲突需实现时核对（AllEquipment.as:1661/1656 两行 fill 均写 `jljzzs`/`jlgzzs`，有疑点，见下方"待对照"）。

### ④ 材料从哪来

三种基础材料 **丝绸/玄铁/檀木**（`wpEquip18/19/20`，品质普通），instruction 原文即"**在炼丹炉内打造装备所需的材料**"。产出渠道：
- **分解装备**（Resolution 页）：任意武器/防具/饰品投入，付 100 灵魂，按品质拆出丝绸/玄铁/檀木 + 1 级宝石（详见下方分解表）。这是材料主渠道。
- 高级材料 **玉衡石(yhs)/天枢石(tss)**（`wpEquip71/72`）：魂器/传说级配方专用，本表未见其产出渠道（疑为 Boss 掉落或商城，**待对照**）。
- 宝石（sms/mfs/gjs/fys 生命/魔法/攻击/防御石）：怪物 `fallStone` 掉 1 级强化石；分解也产 1 级宝石；商城卖 2/3 级(sc 前缀)。

---

### 炉页 2：强化（Strength.as）— 用户说的"批量强化"走这里

**流程**：装备放 zbmc 槽，最多 3 颗**强化石**(`type=wpqhs`)放 qhmc1/2/3，可选**幸运符**(`wpxyf`)和**保底符**(`wpbdf`)。点强化(qhbtn)：扣灵魂 → `Math.random() < 成功率` 判定。

**约束**（`Strength.as:92-108`）：`zbtx`(头衔)不能强化；强化值 ≥7 已达上限；`cs_sp_hy/_dzj/dzjj` 暂不能强化。

**成功率**（`AllEquipment.as:1823 getStrengthNumber` + `transLevelToProbability`）：每颗强化石按**石头等级(getELevel 1~5)**和**装备当前强化值(0~6)**查表得一个概率，3 颗**相加**（`Strength.as:changeLuck`，上限 100%）。幸运符再 **×1.25**（`allpro += allpro*0.25`）。

单颗强化石成功率表（行=石头等级，列=装备当前强化值 +0~+6）：

| 石等级\装备强化值 | +0 | +1 | +2 | +3 | +4 | +5 | +6 |
|---|---|---|---|---|---|---|---|
| 1 级 | 0.375 | 0.0937 | 0.0234 | 0.0058 | 0 | 0 | 0 |
| 2 级 | 1 | 0.375 | 0.0937 | 0.0234 | 0.0058 | 0 | 0 |
| 3 级 | 1 | 1 | 0.375 | 0.0937 | 0.0234 | 0.0058 | 0 |
| 4 级 | 1 | 1 | 1 | 0.375 | 0.1 | 0.04 | 0.01 |
| 5 级 | 1 | 1 | 1 | 1 | 0.375 | 0.15 | 0.05 |

**灵魂消耗**（`AllEquipment.as:1880 transLevelTNeedlh`，按**装备当前强化值**）：
+0→+1:200 / +1→+2:500 / +2→+3:1000 / +3→+4:4000 / +4→+5:8000 / +5→+6:13000 / +6→+7:20000。

**结算**（`Strength.as:454 afterReadStore`）：成功 `upStrengthValue(+1)`；失败且当前强化值 ≥3 且**无保底符**则 `upStrengthValue(-1)` 降级（<3 不降级）。上限 +7。

> "批量打造/批量强化"在原版 UI 是**单件循环操作**（一次一件），没有原生批量按钮。用户要的"agent 批量"是在此规则上加的代理循环层，不改单次数值。

---

### 炉页 3：熔炼/合成（Fusion.as）— 含"经文/镶嵌"

**流程**：3 个材料槽 → `mixProduce(三材料)` 查配方 → 预览产物。点熔炼(rlbtn)：**固定扣 1000 灵魂，100% 成功**（`Fusion.as:389 doFusion`）。

**熔炼配方表逐字**（`AllEquipment.as:1913 mixProduce`，`transName(三材料fill, [a,b,c])==123` 即三材料任意顺序匹配）：

| 三材料(fill) | 产物 |
|---|---|
| kyg + kyz + kys | kyl 枯叶灵 |
| xhz + xhc + xhp | xhhl 宣花葫芦 |
| qybd + qyfp + qysz | qyj 青云剑 |
| hylk + hylc + hylz | hyzzs 混元珍珠伞 |
| zjksf + zjqj + zjbtg | zjld 紫金铃铛 |
| kyl + wplvdyl + gjrls | syl 神叶灵 |
| qyj + wplvdyl + gjyhs | lxj 戮仙剑 |
| hyzzs + wplvdyl + gjtss | hywjs 混元无极伞 |
| wpqhs1 ×3 | wpqhs2（2级强化石） |
| wpqhs2 ×3（含 scwpqhs2 混搭） | wpqhs3 |
| wpqhs3 ×3（含 sc 混搭） | wpqhs4 |
| wpqhs4 ×3 | wpqhs5 |
| sms1 ×3 | sms2；sms2×3 → sms3（含 sc 混搭） |
| mfs1 ×3 | mfs2；mfs2×3 → mfs3 |
| gjs1 ×3 | gjs2；gjs2×3 → gjs3 |
| fys1 ×3 | fys2；fys2×3 → fys3 |

**"经文/镶嵌"就在这里**：产物是法宝(`type=zbfb`，如青云剑/混元珍珠伞/枯叶灵)时，`doFusion` 走 `getSutraValue(产物, 三材料)` / `getSunSutraValueEquip`（悟空专属 `_dzj/dzjj/cs_sp_hy`），把三材料的属性"镶"进法宝。没有独立的"镶嵌炉"。`SutraInterface.as`（经文界面，249 行）是法宝详情/说明面板，非合成入口。

---

### 炉页 4：分解（Resolution.as）

**流程**：投一件武器/防具/饰品，付 **100 灵魂**（固定，`Resolution.as:109`），`findResolution(装备)` 产出材料/宝石，最多 6 格。

**分解产出表**（`AllEquipment.as:2299 findResolution`，`_loc5_`=基础材料件数，`_loc6_`=宝石掷数）：

| 装备品质 | 基础材料件数 | 宝石掷数 |
|---|---|---|
| 普 通 | 1 | 0 |
| 优 秀 | 2 | 1 |
| 精 良 | 3 | 2 |
| 史 诗 | 4 | 2 |
| 邪 灵 | 4 | 2 |
| 传 说 | 0 | 6 |

- 基础材料种类：武器/饰品(zbwq/zbsp) → 玄铁或檀木各半；悟空防具 → 玄铁或丝绸；唐僧/沙僧防具 → 丝绸；八戒防具 → 玄铁。
- 宝石：每掷以 `Math.random() < 0.3*剩余掷数` 概率产 1 颗随机 1 级宝石（sms1/mfs1/gjs1/fys1，`randomOneLevelOneGem`）。

---

## Q2 — 击杀掉魂（灵魂经济进项）

### 结论：原版无"击杀直接掉魂"，灵魂靠卖装备/任务/道具

**关键否证**：全库 grep `lhValue/setLhValue/fallSoul/lh` — **没有任何怪物类、掉落类、关卡结算类给灵魂加值**。`base/BaseMonster.as` 死亡链路 `dropAura()→fallEquip()`（BaseMonster.as:875/1009）只掉**装备**，`fallStone()`（:1073）只掉**1 级强化石**，无灵魂。灵魂钱包 `lhValue` 存在 `user/User.as`，`getLhValue/setLhValue`。

**怪物掉落机制**（`BaseMonster.as:1009 fallEquip`）：
- 掉率 = `protectedParamsObject.probability`（每怪自带），Boss `×1.5`，再 `×(1+时装掉落加成)`。
- `Math.random() > 掉率` 则不掉；否则从该怪 `fallList`（掉落表）随机取一项生成 `FallEquipObj` 落地。
- 另有 `fallStone`：按 `stoneFallRate` 独立掷，掉 `wpqhs1`（1 级强化石）。
- 死亡还调 `gc.allTask.killMonster(类名)` 记任务进度。

### 灵魂全部进项（逐字出处）

| 进项 | 数值 | 出处 |
|---|---|---|
| **卖单件装备** | +`getValue()` = `value1+value2`（装备卖价，同时加 myScore） | `export/pack/PackThings.as:410 mdClick` |
| **一键卖白装** | +20 / 每件普通(普 通)品质装备 | `export/pack/BackPack.as:359 deleteWhiteEquipment` |
| **灵魂玉道具(lhys)** | +3800 | `export/pack/PackThings.as:616` |
| **任务奖励** | +`task.rwaward.value` | `export/taskInterface/TaskInterface.as:355/359` |
| **洗技能返还** | +`Σ 150·n²·√n`（按已学技能等级） | `export/pack/PackThings.as:88-96` |
| RoleInfo 奖励 | +`param1[3]` | `export/RoleInfo.as:520` |
| 存档载入 | =存档 lhValue | `user/User.as:552` |
| 里程碑/事件 | +`(n+1)·5000` | `user/User.as:598`（上下文待核） |
| SelectPLace | +10000（×2 角色） | `export/SelectPLace.as:526/540`（疑调试/首通） |

**装备卖价 `getValue`** = `value1 + value2`（`MyEquipObj.as:994`）。`value1/value2` 在各 `MyEquipObj` 定义或 setValue 处赋值 — 需实现时对每件装备查其 value（多数装备定义未显式传 value，疑由品质/属性推导，**待细查 setValue 调用点**）。

### 灵魂全部消耗口

| 消耗 | 数值 | 出处 |
|---|---|---|
| 强化 | 200~20000（按强化值，见 Q1 表） | `Strength.as:442` + `transLevelTNeedlh` |
| 打造 | 50~1600（按产物品质，见 Q1 表） | `Making.as:344` + `needLHValueByQuality` |
| 熔炼 | 1000（固定） | `Fusion.as:405` |
| 分解 | 100（固定） | `Resolution.as:200` |
| 学技能 | 技能价 | `export/shop/SkillControl.as:310`、`BuySkill` |

> 无"复活吃灵魂"、无"商店用灵魂买装备"（商店 Micropayment 是**充值微支付**，不吃灵魂）。灵魂是纯粹的养成货币（强化/打造/熔炼/分解/学技能）。

---

## Q3 — 装备全表

### ① 总量与 schema

装备表全部在 `my/AllEquipment.as`，5 个数组：

| 数组 | 数量 | 内容 | 变量名 |
|---|---|---|---|
| normalEquipment | 9 | 白装模板（每角色武器+防具 + 秘银手镯饰品） | normalClothes/normalStick/... |
| **otherEquipment** | **67** | **真装备**（武器/防具/饰品/头衔，绿~神器） | otherEquip1~67 |
| wpEquipment | 120 | 物品：强化石/宝石/制作书/材料/符/传送石/药材 | wpEquip1~120 |
| sutraEquipment | 10 | 法宝/经文（zbfb） | sutra1~9, sutra1000 |
| sellEquipment | 12 | 时装（zbsz，商城） | fashionEquip1~12 |

`MyEquipObj` 构造函数 22 个位置参数（`MyEquipObj.as:226`）：

```
(showid:uint,       // 1 皮肤帧号/图标 id
 ename:String,      // 2 中文名
 fillName:String,   // 3 英文码(存档/查找主键)
 type:String,       // 4 类型: zbwq武器 zbfj防具 zbsp饰品 zbtx头衔 zbfb法宝 zbsz时装 zbwp物品 wpqhs强化石
 user:String,       // 5 归属角色: 悟空/唐僧/八戒/沙僧/""(通用)
 quality:String,    // 6 品质: 粗糙/普通/优秀/精良/史诗/传说/邪灵/魂器/神器
 color:*,           // 7 品质色(hex字符串)
 ehp,emp,eatt,edef, // 8-11 生命/魔法/攻击/防御(int)
 ecrit,emiss,       // 12-13 暴击/闪避(Number)
 eahp,eamp,         // 14-15 额外生命/额外魔法(int)
 eatblood,          // 16 吸血(Number)
 magicdef,          // 17 魔防(Number)
 deephit,           // 18 深击/致命(Number)
 aStrengthen:Object,// 19 套装/强化加成键值(如 {"att":6})
 instruction:String,// 20 描述文案
 param21:Object,    // 21 {elevel 需求等级, eupdata, num 数量}
 param22:Object)    // 22 附加(多为 {})
```

**品质→颜色对照**（从数据实测）：普通 白 `0xFFFFFF` / 优秀 绿 `0x00FF00` / 精良 蓝 `0x0000FF` / 史诗 紫 `0x660099` / 传说 橙 `0xFF9933` / 邪灵 灰 `0x666666` / 魂器 青 `0x66ffff` / 神器 红 `0xFF0000`。养成价值序（Making 灵魂表）：粗糙<普通<优秀<精良<史诗<传说；邪灵/魂器/神器为后期加的更高档。

### ② 分布统计（otherEquipment 67 件真装备）

- **按类型**：武器 zbwq×27 / 防具 zbfj×24 / 饰品 zbsp×10 / 头衔 zbtx×6。
- **按角色**：悟空×12 / 唐僧×12 / 八戒×12 / 沙僧×15 / 通用(饰品头衔)×16。
- **按品质**：优秀×12 / 精良×11 / 史诗×13 / 传说×10 / 邪灵×10 / 魂器×9 / 神器×2。

（其余数组：wpEquipment 120 件里含 9 件 `type=wpqhs` 强化石 + 111 件 `type=zbwp`；zbwp 内含制作书≈38、生命/魔法/攻击/防御石各 3 级、传送石、幸运符/保底符、材料丝绸/玄铁/檀木/仙茅/宣花/守宫/人参/水灵珠/土灵珠、狗粮等。）

### ③ 10 件代表性装备逐字数值（AllEquipment.as，格式：showid,名,fill,类型,角色,品质,色,ehp,emp,eatt,edef,ecrit,emiss,eahp,eamp,eatblood,magicdef,deephit,套装,描述,{等级}）

```
:529 otherEquip1  枯叶弓 kyg  zbwq 沙僧 优秀 0x00FF00  0,0,16+rand(4),0,...,{"att":6}  "一落红，一枯叶…"
:577 otherEquip10 氐土铠 dtk  zbfj 八戒 优秀 0x00FF00  100+rand(70),35+rand(15),0,4+rand(1),...
:652 otherEquip20 紫金开山斧 zjksf zbwq 八戒 史诗 0x660099  0,0,80+rand(12),0,0,0,3(eahp),0,...
:729 otherEquip30 马官指环 mgzh zbsp 通用 精良 0x0000FF  245+rand(43),169+rand(26),0,0,...
:752 otherEquip33 残昼 xlcz  zbfj 唐僧 邪灵 0x666666  -100(ehp),740+rand(40),140+rand(8),0,...
:801 otherEquip40 玲珑玉 lly  zbsp 通用 邪灵 0x666666  1000,1000,100,50,0.1,0.05,0,0,0,0.05,...
:830 otherEquip45 含羞狗 hxg  zbtx 通用 精良 0x0000FF  111,111,11,1,0.01,0.01,1,1,0,0.01  "最适合单身狗的头衔了！"
:850 otherEquip50 虬龙甲 qlj  zbfj 悟空 魂器 0x66ffff  1200+rand,560+rand,0,37+rand,0,0,5+rand,...
:934 otherEquip60 大圣战铠 dszk zbfj 悟空 传说 0xFF9933  1800+rand,750+rand,0,38+rand,0,0.03,5+rand,...
:995 otherEquip67 苍生挂饰 ywyd zbsp 通用 邪灵 0x666666  0,0,-625,-143,-0.48,-0.28,-57,-19,0,-0.26  (全负，诅咒饰品)
```

法宝样例（sutraEquipment，全 type=zbfb，纯效果无面板属性除烛时金轮/血海魔童）：
```
:1019 枯叶灵 kyl 优秀 "缓慢回复少许生命"        :1035 紫金铃铛 zjld 史诗 "无敌时间+回血"
:1027 青云剑 qyj 精良 "御剑飞行"                :1051 烛时金轮 zsTimer 传说 750,750,100,40,0.05,0.02,15,7 "时光倒流"
:1047 混元无极伞 hywjs 魂器 "抵挡大量伤害+反弹"   :1055 血海魔童 xhmt 史诗 500,200,70,25 "魔童连击"
```

### ④ 机械提取成整表 JSON 的难度与建议 — 难度低

数据是**扁平的构造函数调用序列**，无继承无外部引用，一条正则即可解析：
- 每件装备一行 `this.XXX = new MyEquipObj(...)`（前 20 个参数在同一行，param21/22 换行但可选忽略）。
- 建议命令思路：`grep 'new MyEquipObj'` → 按 `MyEquipObj\((.*)\)` 抓参数串 → 用支持嵌套的解析器（AS3 参数含 `{}` 对象、`a+Math.random()*b` 表达式）按逗号分割顶层。
- **坑 1**：属性字段大量是 `base + Math.round(Math.random()*range)` 区间表达式，提取时要保留为 `{base, rand}` 两值（游戏运行时才 roll），不能求单值。
- **坑 2**：中文品质串含全角空格"优 秀"，`sort/uniq` 有 locale collation 问题（本次考古踩到），聚合统计要写文件后 `grep -Fc` 或指定 `LC_ALL=C`，别直接管道 `sort|uniq`。
- **坑 3**：showid 不带引号，正则用"引号 token 序列"取字段时要记得 showid 是第 0 个数字参数、ename 才是第 0 个引号 token。
- 建议产物结构：`{fillName, ename, type, user, quality, color, stats:{ehp,emp,...(区间保留base/rand)}, aStrengthen, elevel, instruction}`。67 真装备 + 10 法宝 + 12 时装 + 9 白装模板一次跑完；wpEquipment 120 件同法但多数属性为 0（物品/材料）。

### 药品/材料类 item 全集所在

- **材料**（丝绸/玄铁/檀木/玉衡石/天枢石/仙茅/宣花/守宫/人参/水灵珠/土灵珠 等）：在 `my/AllEquipment.as` 的 **wpEquipment 数组**（wpEquip 前缀），`type=zbwp`。
- **药品（HP/MP 药水）**：**不在** AllEquipment，独立在 **`export/cure/`** 包：`BigHP.as`、`SmallHP.as`、`SmallMP.as`（`package export.cure`）。`base/BaseMonster.as:6 import export.cure.*` — 怪物也会掉这些即时回复药。战斗内回血队列逻辑在 `my/CureHpQueue.as`。
- **强化石/宝石**：wpEquipment 内，强化石 `type=wpqhs`（wpqhs1~5 + sc 商城版），宝石 sms/mfs/gjs/fys(生命/魔法/攻击/防御石) `type=zbwp`。

---

## 可恢复数据清单

| 数据项 | 真源位置 | 完整度 | 提取方式建议 |
|---|---|---|---|
| 炉子结构(4 页) | StrengthEquipment.as + 各子类 | 完整 | 直接照抄类结构 |
| 打造配方表(38 条) | AllEquipment.as:2402–2725 `findNeedMaterialByName` | 完整(本报告已逐字) | switch→map 直译 |
| 打造灵魂消耗(按品质) | Making.as:284 | 完整 | 常量表 |
| 宝石→属性加值表 | Making.as:441 | 完整 | 常量表 |
| 打造产物映射 | Making.as:389(去尾zzs)+findByName | 完整 | 逻辑直译 |
| 熔炼配方表 | AllEquipment.as:1913 `mixProduce` | 完整(本报告已逐字) | if 链→map |
| 熔炼灵魂/成功率 | Fusion.as:405 | 完整(1000/100%) | 常量 |
| 强化成功率表 | AllEquipment.as:1823 + transLevelToProbability | 完整(本报告已逐字) | 二维常量表 |
| 强化灵魂消耗表 | AllEquipment.as:1880 | 完整(本报告已逐字) | 常量表 |
| 强化降级/上限规则 | Strength.as:454 | 完整 | 逻辑直译 |
| 分解产出表 | AllEquipment.as:2299 `findResolution` | 完整(本报告已逐字) | 逻辑直译 |
| 分解灵魂消耗 | Resolution.as:200 | 完整(100) | 常量 |
| 灵魂全部进项/消耗口 | 本报告 Q2 两表 | 完整 | 逐点接线 |
| 怪物掉落机制 | BaseMonster.as:1009/1073 | 完整(公式) | 逻辑直译 |
| 每怪 fallList/掉率数值 | 各具体 Monster 子类的 protectedParamsObject | **未逐怪抄录** | 需遍历 export/monster/*，另开考古 |
| 装备全表(67+120+10+12+9) | AllEquipment.as 全文 | schema/分布完整，逐件数值待跑脚本 | 一条正则批量提取(见 Q3④) |
| 装备卖价 value1/value2 | MyEquipObj setValue 调用点 | **未定位赋值来源** | 需查 setValue 调用/是否由品质推导 |
| 药品(HP/MP) | export/cure/{BigHP,SmallHP,SmallMP}.as | 类已定位，数值未抄 | 读 3 个类即可 |
| 玉衡石/天枢石产出渠道 | 未在本次范围内找到 | **挖不到** | 疑 Boss 掉落/商城，待查 monster fallList + Micropayment |

### 明说挖不到 / 待对照

1. **每种怪的具体掉魂数值**：不存在（原版无此机制，已否证）。若指"每怪掉率/掉落表"，则在各 `export/monster/*.as` 子类的 `protectedParamsObject.probability` 与 `fallList`，本次未逐怪抄录（搜过 `base/BaseMonster.as` 拿到机制，未展开 57 个怪子类）。
2. **玉衡石(yhs)/天枢石(tss) 产出渠道**：搜 `AllEquipment.as`/掉落/商城均未见明确产出，挖不到，标待查。
3. **装备 value（卖价）来源**：`getValue=value1+value2`，但多数 `MyEquipObj` 定义未显式传 value，`setValue` 赋值点未定位，挖了 MyEquipObj.as 未见品质→value 公式，待查。
4. **jlgzzs/jljzzs fill 疑似冲突**：AllEquipment.as:1656/1661 两本魂器制作书 fill 值需实现时逐字复核。
5. 已搜关键词：`liandan/炼丹/smelt/furnace/hecheng/alchemy/合成/强化/qianghua/lhValue/setLhValue/fallSoul/lh/recipe/配方/丹方/药引/ldl` — 覆盖 export/、my/、base/、World/、config/、manager/ 全树。
6. 未联网、未 clone XinTianyu-Sky/ZMXY，其装备表 JSON 作为**交叉对照项待办**（本地无副本，不尝试联网，符合约束）。
