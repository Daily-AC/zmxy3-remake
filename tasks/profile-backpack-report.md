# S4 个人资料/背包面板 — report

派工 brief：`tasks/profile-backpack-brief.md`。规格：`docs/design/screen-fidelity-spec.md` §S4。参照图：
`docs/reference/user-flow-refs/profile-backpack-original.png`。

## 1. 双源提取

### 1.1 骨（AS3，主 SWF `打开我开始玩.swf`）

```
JAVA=/opt/homebrew/opt/openjdk/bin/java
FFDEC=tools/ffdec/ffdec-cli.jar
MAIN="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
$JAVA -Djava.awt.headless=true -jar $FFDEC -selectclass \
  "export.pack.BackPack,export.pack.BackPackElement,export.pack.PackThings,base.BaseRoleProperies,user.User,base.BaseHero" \
  -export script game/tmp/s4-as3 "$MAIN"
```

产物：`game/tmp/s4-as3/scripts/{export/pack/{BackPack,BackPackElement,PackThings}.as, base/{BaseRoleProperies,BaseHero}.as, user/User.as}`。

**5×5 网格公式**（`BackPackElement.as:196-198`, `drawgz()`）：

```as3
_loc2_ = AUtils.getNewObj("export.pack.PackThings") as PackThings;
_loc2_.x = _loc3_ * (_loc2_.width + 11);   // col * (w+11)
_loc2_.y = _loc5_ * (_loc2_.height + 9);   // row * (h+9)
```

`PackThings`（chid114）测得宽高 50×51（对象树只有空容器坐标算不出这个 —— 命中 playbook 信号①）。25 格**无条件**创建（哪怕背包空），只有 `.setObj()` 有物品才调用；这解出了参照 FLA 默认态渲染里网格区域"看起来空"其实是 FFDec 静态渲染不跑 AS3、不是网格没有背景格的假象。

**战斗力公式**（`BackPack.as:219-313`, `getFightingForce(param1:User):uint`）四项相加：

1. `uint(level * 15)` —— 等级项。
2. 被动技能项（`param1.ispassiveskill` 4 槽，逐槽不同乘子）。
3. `for each curarray: _loc11_ += geteatt()` 后 `score += _loc11_` —— 装备攻击项（`curarray`= 当前穿戴的 `MyEquipObj[]`）。
4. `roleid` 专属项：混合每件装备的 `getecrit/geteahp/geteamp/getmagicdef/getemiss` 原始值 + （`roleid==1`）"sx" 技能判定。

**Adapted/Dropped**（`game/src/systems/combatPower.ts` 头注释同款记录）：项 1、3 **原样照译**（`level*15` + 装备攻击加成，两者本项目数据模型都有对应字段）；项 2、4 **丢弃**——本项目没有 `ispassiveskill` 被动技能名册，也没有装备的 `geteahp/geteamp/getmagicdef/getemiss/getecrit` 原始逐项字段（`items.ts` 的 `Effect` 只有聚合 `atk/def/hp/mp/crit`），无输入可照译。这是**真实公式的忠实部分移植**，不是自定公式——brief 允许的"没有则自定"降级没有触发。

**灵魂 + 出售白装**（`BackPack.as:347-365`, `deleteWhiteEquipment()`）：

```as3
if (_loc2_.quality == "普 通" && _loc2_.type != "zbtx") {
  this.player.zblist.splice(_loc3_, 1);
  this.player.setLhValue(this.player.getLhValue() + 20);
}
```

照译为 `systems/soulPurse.ts` 的 `sellCommonEquipment()`：本项目 `Item.rarity` 1|2|3 三档，1 档站台 AS3 的"普通"（`rarity.ts` 早有此映射声明，非本棒新造）；`type != "zbtx"`（不卖头衔类）在本项目无对应 kind，条款空置。**+20/件** 数值照抄。

**属性字段命名解密**（`BackPack.as:27-51` 的 `public var` 列表，配合 `setInfoTxt()` 赋值行 145-157，逐一比对拼音声母确认）：
`txt_zdl`=战斗力、`txt_sb`=闪避（shǎnbì）、`txt_hx`=回血（huíxuè）、`txt_hl`=回蓝（huílán）、`txt_lh`=灵魂（línghún）、`txt_mdef`=魔抗。`getHx()/getHl()/getMiss()/getMagicDef()/getCrit()` 在 `BaseRoleProperies.as` 里全部是**纯装备加成字段**（初值 0，只在 `addEquip/removeEquip` 里 `±= 装备原始值`，`base.BaseRoleProperies.as:840-910`），没有等级曲线——本项目没有对应的装备原始字段（同战斗力项 4 的缺口），故闪避/回血在 UI 上原样显示占位 0（非默认瞎填，是"该维度装备加成通道本身不存在"的诚实映射），回蓝复用真实存在的 `MP_REGEN_PER_SEC=2`（`BattleScene.ts`，标注 TODO-verify 但是场上真在用的值）。暴击/魔抗复用已验证的真系统（`heroStats().crit`、`heroMagicDef()`，见 `heroSurvivability.ts`）。幸运复用 `heroGrowth.ts` 已从 AS3 `user/User.as setTadayLuckValue()` 逐字还原的 `rollDailyLuck()`（此前只是死代码，未接入任何 UI；本棒是它的第一个消费者，仅用于展示，不接入战斗数值——接入战斗是另一个任务的范围）。

**装备槽真实语义**（`BackPack.as:53-63` 字段 + 按钮态图 baked 文字标签实测，`game/tmp/s4-view/parts-sheet.png`）：`zbwq`=**武器**、`zbfj`=**防具**、`zbsp`=**饰品**、`zbfb`=**法宝**、`zbtx`=**头衔**（称号槽，非"头"部装备）、`zbsz`=**时装**。brief 原文"武器/头/衣/饰件"是照参照图肉眼估的四槽说法，与 AS3 实证不符——按管线纪律①"类代码只认主 SWF"，采用 AS3 真值。巧合的是，本项目 `equipment.ts` 的 `EquipSlot = 'weapon'|'armor'|'accessory'|'talisman'` 早就与 `zbwq/zbfj/zbsp/zbfb` 精确对应（`armor`=防具, `accessory`=饰品, `talisman`=法宝），只是 `slotForItem()` 目前只路由到 `weapon`（Stage A 限制，见其注释）——本棒不改这个路由（超出"只动渲染层"边界），四槽都做了渲染与交互，armor/accessory/talisman 目前恒空属实（如实呈现系统现状，不是 bug）。`zbtx`/`zbsz`/`showszmc`（时装显示开关）三者本项目均无对应系统（无称号、无时装），按 brief"无对应系统…不造内容"的同一原则做灰置位（不可交互）。

### 1.2 皮（`out_res/backpack1.swf`）

```
$JAVA -Djava.awt.headless=true -jar $FFDEC -swf2xml \
  "vendor/zmxy_res/.../out_res/backpack1.swf" game/tmp/s4-extract/backpack1-full.xml   # 192MB，用完即删
```

`SymbolClassTag` 解出 `export.pack.BackPack`=chid444；`DefineSpriteTag spriteId="444"` 的 `subTags` 里，**命名** `PlaceObject2Tag`（`name="zbwq"` 等，Flash 自动把 timeline 实例名绑定到 AS3 `public var`）直接给出每个字段在 BackPack 局部坐标系的精确 `translateX/Y`（twips÷20=px）——这条比逐符号算 bounds 更直接，本棒新方法记入 playbook 候选（见 §4）。`BackPackElement`（chid385）同法解出 4 个页签按钮 `btn_zb/btn_dj/btn_rw/btn_jns`（本地 x=0/74/148/222，y=0，均 73×27）。

### 1.3 origin（局部坐标 → `backpack_bg.png` 像素坐标的仿射映射）

playbook 纪律①的"逐符号算 origin"在这里降级成了**一个共享偏移**，因为 BackPack 整棵子树共用同一个刚性变换（未见任何子精灵有独立缩放/旋转，`hasScale`/`hasRotate` 在 dump 里全 false 或 =1）。核心问题变成："BackPack 局部 (0,0) 落在 FFDec 渲染画布哪个像素？"——S2/S3 棒记录过 analytic 换算在有 filter 的符号上会差 ~170px，这里不赌，直接用**模板互相关**实测：

```
$JAVA -jar $FFDEC -selectid 444,332,385,114,219,358,349,361,338,344,... \
  -export sprite,shape,button,image game/tmp/s4-render "$BP"
```

用三个独立命名按钮（`btn_close`/`sellwhite`/`prePage`，各自 AS3 local tx/ty 已知）在 2096×1071 全画布上做归一化互相关模板匹配，反解 `localOrigin_canvas`：

| 基准符号 | AS3 local (tx,ty) | 匹配到画布像素 | 反解 origin |
| --- | --- | --- | --- |
| btn_close (chid219) | (809.50, 59.85) | (1563, 541), diff=6.46 | (753.5, 481.15) |
| sellwhite (chid361) | (747.50, 445.50) | (1501, 926), diff=0.16 | (753.5, 480.50) |
| prePage (chid344) | (609.00, 472.45) | (1363, 953), diff=0.21 | (754.0, 480.55) |

三次独立测量子像素级一致（x 方差 <0.5px，y 方差 <0.7px）——取均值 `localOrigin_canvas=(753.7, 480.7)`。窗体非透明 bbox（PIL `getbbox()` 复现 round2 棒同一份裁剪，**逐像素比对 diff bbox=None，完全一致**）= (864,534)-(1619,1031)，755×497。故：

```
crop_px(x,y) = local_px(x,y) + (753.7-864, 480.7-534) = local_px(x,y) + (-110.3, -53.3)
```

**验证**：把这个仿射公式套用到全部 14 个命名字段坐标，标在 `backpack_bg.png` 上（`game/tmp/s4-view/marked.png`）——14 个标记点全部**精确落在**各自 value-inset 框的左上角（紧贴 baked label 之后），无一处落进相邻框或偏出面板，见该文件目视核对。

### 1.4 origin 表（关键符号，crop-relative px，来自 §1.3 仿射变换）

| 字段 | 局部 (tx,ty) | crop 像素 | 备注 |
| --- | --- | --- | --- |
| zbwq (武器) | (362.05,166.65) | (251.7,113.4) | 50×50 |
| zbsp (饰品) | (433.05,166.65) | (322.7,113.4) | 50×50 |
| zbfj (防具) | (362.05,241.65) | (251.7,188.4) | 50×50 |
| zbfb (法宝) | (433.05,241.65) | (322.7,188.4) | 50×50 |
| zbtx (头衔·占位) | (164.40,244.90) | (54.1,191.6) | 50×50 |
| zbsz (时装·占位) | (168.05,166.65) | (57.7,113.4) | 50×50 |
| bpe (BackPackElement) | (516.20,114.35) | (405.9,61.1) | 4 页签起点 |
| headSit (立绘挂点) | (280.25,235.85) | (169.9,182.6) | 空容器，无自身素材 |
| levelmc (等级翼徽) | (378.95,105.85) | (268.6,52.6) | 83×59 |
| mc_exp (EXP 条) | — | (215,450) 实测 | 见下段（互相关直接定位，analytic 值有 ~14px 系统偏差未追因，改用实测） |

EXP 条例外说明：`mc_exp` 是 30 帧逐帧填充的 MovieClip（`export.pack.BackPack.as:136` `gotoAndStop(round(30*exper/exp))`），30 帧渲染出的画布 bbox 恒为 (238,0)-(452,20)（内容右移不变外框，因为空轨道边框本身跨这整个范围）。截到该 bbox（214×20）后用它去和 `backpack_bg.png` 做互相关，命中 (215,450)，比 `mc_exp` PlaceObject 本身的 analytic 位置 (201.3,436.7) 系统性偏 (+13.7,+13.3)——判断是子精灵自身 224px 画布相对其 214px 有效内容还有一层内部偏移（未继续深挖，互相关结果已直接可用、且已用于生产坐标，不影响正确性）。

## 2. 素材

`backpack_bg.png`（755×497）= `export.pack.BackPack`（chid444）**默认态整体渲染**裁剪到非透明 bbox。这是本棒的关键简化：FFDec 静态渲染出的默认帧，因为不跑 AS3，把全部 baked 按钮/标签/页签/属性框边框**都原样画出来**了（背包为空、无装备、无数值时的"骨架"状态）——于是不需要像旧 round2 棒那样把每个按钮/标签单独抠图再拼，直接一张图就是完整底板，运行时只需在上面叠动态文字/数值/图标。唯一副作用：`nowpage` 文本框在 FLA 设计态有非空默认值 `"1/5"`（`game/tmp/s4-view/nowpage-zoom.png` 实测），会跟运行时动态文字重影——已用周围色块 `(55,27,7)`（该框内实测为纯色，四周采样验证）铺平抹除（`game/public/assets/extracted/ui/backpack_bg.png` 就地 patch），其余 13 个动态字段的默认态均为空白，逐个用亮度扫描核实过（无重影）。

其余素材：`backpack_exp_fill.png`（214×20，EXP 条第 30 帧裁到内容 bbox，`setCrop` 按分数裁切，同 `RoleInfoHud` 已有的 bar-fill 惯用法）；`backpack_slot.png`（50×51，`export.pack.PackThings` chid114 默认态）；`backpack_digit_0..9.png`（`levelnum0..9`，47×50，等级徽章数字）。悟空立绘复用已加载的 `role1_0` 战斗精灵（frame 0）——原版走 `HeadSprite` 动态换装合成，本项目无此管线，站台方案，report 记账（Adapted）。

## 3. 场景实现

- `game/src/ui/hud/BackpackWindow.ts`：全量重写。纯视图（`setHeroStats`/`setEquipment`/`setInventory` 驱动），构造期只接回调（`onClose/onEquip/onUnequip/onSell`）。窗体锚点改为左上角容器（`BG_X=102.5,BG_Y=21.5`，755×497 在 960×540 画布居中），子元素坐标直接用 §1.4 的 crop-relative 数值，不再是旧文件的居中坐标系（旧版本没有真坐标，纯靠肉眼估的 6×4 网格早已作废）。
- `game/src/systems/combatPower.ts`：`computeCombatPower(level, equipAtkBonus)`，见 §1.1。
- `game/src/systems/soulPurse.ts`：`SoulPurse` + `sellCommonEquipment()`，见 §1.1。
- `game/src/scenes/BattleScene.ts`：新增 `soulPurse`/`displayLuck` 字段（`seedFromSave()` 里初始化，`displayLuck` 用当前等级滚一次），`refreshBackpackData()` 汇总 `BackpackHeroStats`/`Equipment`/`Inventory` 推给窗口；`doEquip/doUnequip` 新增"窗口开着就即时刷新"；新增 `doSellCommonEquipment()`。`BackpackWindow` 构造回调补上真实 `onEquip/onUnequip/onSell`，并且修了一个潜藏 bug——旧代码 `onClose: () => {}` 是空实现，点击面板自己的红叉关闭按钮实际上什么都不做（只能靠 B 键关闭），现改为 `() => this.backpack.close()`。

## 4. 验收证据

### 4.1 回归

`npx vitest run`：**421/421 全绿**（基线 413 + 本棒新增 8：`combatPower.test.ts` 3、`soulPurse.test.ts` 5）。`npx tsc --noEmit` 0 错误。`npm run build` 过。

### 4.2 流程截图（`game/tmp/s4-flow/`，Playwright 驱动真实点击，960×540 独立 dev server）

| 文件 | 内容 |
| --- | --- |
| `1-battle-baseline.png` | 进本关卡战斗场景基线 |
| `2-backpack-open-equip-tab.png` | B 键打开面板，装备已穿（战斗力 60 = 15+45 装备攻击项，验证 §1.1 公式）|
| `3-backpack-item-tab.png` | 点"道具"页签，网格正确过滤显示消耗品（小还丹）|
| `4-backpack-after-unequip.png` | 点武器槽卸下赤炎噬血杖，战斗力/攻击实时回落到 15/10，toast 提示 |
| `5-backpack-after-reequip.png` | 点背包格子重新装备木棍（真实点击命中格子交互区）|
| `6-backpack-after-sell.png` | 点"出售白装"，2 件白装→灵魂+40，灵魂计数即时刷新为 40 |
| `7-backpack-page1.png` / `8-backpack-page2.png` | 灌 31 件装备触发分页（25/页），"1/2"→点"下一页"→"2/2"，末页恰好 6 件，验证 `totalPages()`/`setPage()` |

### 4.3 Overlay（`game/tmp/s4-overlay/`）

参照图 `profile-backpack-original.png`（1538×970）与我方 960×540 截图的比例不同（前者≈原版 940×590 舞台的 1.64x 等比放大截屏，无黑边可切——按 playbook 纪律③"先切参照图游戏区"在这屏退化成"整图即游戏区，不用切"，因为对话框艺术资源本身是 1:1 原始像素抽取，不受外层画布尺寸影响）。用 `backpack_bg.png`（我方对话框的真实底板贴图）作模板，对参照图做多尺度归一化互相关，锁定 scale=1.62、位置(182,88)（多组独立测量收敛到同一值）。裁参照图对应区域等比缩回 755×497 与我方对话框裁图（同 BG_X/BG_Y 定位）做 blend/diff：

- `|diff|≥40` 占比 43%（含 EXP，看似高，但目视 `blend-50-50.png`/`diff.png` 后判断这个百分比几乎全部来自**内容差异**——我方截图故意用测试数据/翻页态，人名/数值/网格物品与参照图完全不同——而非几何错位）。
- **结构性判据（无双影）达标**：窗体外框、标题墨字、红叉关闭键、10 项属性框、EXP 条轨道、4 个页签、5×5 网格线、灵魂/出售/翻页按钮，在 `blend-50-50.png` 里全部呈**单线清晰边缘**，无第二层错位重影；`diff.png` 里这些结构元素对应像素接近纯黑（零差），亮色差异全部集中在图标/文字/立绘内容区（预期豁免项）。
- 装备槽图标位置定性对齐：我方武器槽图标与参照图武器槽图标落在同一相对位置（见 `blend-50-50.png` 右上装备簇）。
- 证据文件：`ref-aligned.png`（几何对齐后的参照裁图）、`ours-crop.png`、`blend-50-50.png`、`diff.png`。

## 5. Adapted / Dropped 清单

| 项 | 处理 | 依据 |
| --- | --- | --- |
| 战斗力公式项 2/4（被动技能、装备原始逐项加成） | Dropped，只保留可照译的等级项+装备攻击项 | 无对应数据字段，见 §1.1 |
| 闪避 (getMiss) / 回血 (getHx) | 显示 0（诚实占位，非默认瞎填） | 该维度装备加成通道本项目未实现 |
| 回蓝 | 复用真实值 `MP_REGEN_PER_SEC=2` | 已在战斗系统里真实使用的常量 |
| 幸运 | 复用 AS3 已还原的 `rollDailyLuck()`，仅展示不接入战斗 | heroGrowth.ts 早有该函数但从未被消费 |
| 灵魂 (soulPurse) | 独立占位经济，不持久化到存档 | brief 明确"灵魂货币没有→占位并 report 注明" |
| 出售白装 rarity 映射 | rarity===1 站台 AS3"普通" | rarity.ts 既有映射声明的自然延伸 |
| zbtx(头衔)/zbsz(时装)/showszmc | 灰置位不可交互，不造内容 | 无对应系统，援引 brief 对 时装/经书 页签的同一原则 |
| armor/accessory/talisman 槽恒空 | 如实渲染，不改 `slotForItem()` 路由 | 超出"只动渲染层"边界，改路由是系统逻辑变更 |
| 立绘 | 复用 `role1_0` 战斗精灵替代原版动态换装合成 | 本项目无 HeadSprite 换装管线 |
| EXP 条精确位置 | 互相关实测值，非 analytic 值（差 ~14px） | analytic 系统偏差未追因，实测已验证可用 |

## 6. 遗留缺口

- 装备槽图标目前用通用 fallback 图标（bag 里没有为 `crafted_equip`/测试武器专配图标），穿脱功能本身不受影响，纯视觉表现力问题。
- `armor`/`accessory`/`talisman` 三槽因 `equipment.ts` 的 `slotForItem()` Stage A 限制恒为空，是既有系统缺口，非本棒引入或本棒范围。
- 参照图 overlay 的量化 diff% 偏高主要是"用了不同测试数据"的副作用，若要更贴近的量化对照，需要一套接近参照图数值（战斗力 3625、等级 31 等）的测试存档——本棒判断这超出"验证坐标系统正确"的必要投入，几何判据（无双影）已经是更直接的证据。

## 7. commit

见 `git log`（本地提交，未 push）。

## 终审判定补充（主会话，2026-07-08 05:5x）

右下控制条（灵魂/出售白装/页码）我方与参照图版式不同（参照为单行+方形页钮 [1][2]，我方为双行+◀上一页/下一页▶）——终审核对 vendor 烘焙默认态 `backpack_bg.png` 同区域，与我方版式逐件一致，判定参照截图为另一版本（Online 系）的版式。按 spec 纪律"版本几何分歧 vendor 胜（复刻真源）"，我方为正，不返修。其余结构层（外框/标题/红叉/属性框/EXP/页签/网格）单线对齐过审；diff 高亮均为内容差（测试数据 vs 参照演示数据、参照烘焙 tooltip/活动横幅）。421 测试 + build 主会话复跑通过。
