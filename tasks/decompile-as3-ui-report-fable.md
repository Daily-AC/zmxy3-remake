# 反编译 AS3 UI 源码评估报告（fable 独立评估）

评估员：Fable 独立会话（三源交叉验证之一），2026-07-08。全部证据来自本会话自己跑的 FFDec headless CLI 反编译，产物在 session scratchpad（`main-as/` = 主 SWF 446 类，`othermat-as/` = out_res/OtherMat1.swf 559 类，`othermat.xml` = OtherMat1 全量对象树 45MB）。未改 game/ 任何代码。

## 三选一结论

**② 为骨、① 为魂的组合；若必须单选，选 ①「翻译 AS3 布局源码」，但必须带一条硬前提：AS3 源码不含大多数 UI 的基础坐标，静态坐标仍要从对象树取。③ 重编译改原版 no-go。**

理由一句话：实测 7 个 UI 类，除 GameMenu 外基础坐标全在 timeline（只能抠对象树），但对象树完全看不见的东西——双人镜像、网格数学、条件摆放、帧语义、事件守卫——全部只在 AS3 里，而这些恰恰是"照截图摆坐标"复刻法必然做错的部分。两个源不是竞争关系，是同一符号的皮（timeline）和骨（AS3），管线必须两个都读。

## 关键结构性发现（先于逐类结论）

1. **UI 逻辑类不在子 SWF——在主 SWF 和 OtherMat1 里各有一份，且版本分歧。** `打开我开始玩.swf` 反编译出 446 类，`out_res/OtherMat1.swf` 出 559 类，`export.RoleInfo` 两边都有但 diff 不同：主 SWF 版多 `herobeattacktimes`、`lastaddws` 防作弊节流、`isStopGame` 开关逻辑——主 SWF 是魔改版更新过的代码，OtherMat1 里的是旧副本。而 OtherMat1 版类头带 `[Embed(source="/_assets/assets.swf", symbol="symbol341")]`，直接印证 RoleInfo 皮 = OtherMat1 chid341。**管线纪律：类代码以主 SWF 反编译为准，OtherMat1 只取符号/对象树。**
2. **客户端 `assets/` 目录下的子 SWF 是加密的**（magic 非 FWS/CWS），FFDec 对它们静默输出 0 类、exit 0 不报错。必须用 `out_res/` 解密版。这是个容易白跑的坑。
3. 任务书里的 "RoleSkillInterface" 类不存在；技能购买/升级 UI 实际是 `export.shop.BuySkill / SkillControl / SkillSetControl / PassiveSkillControl`。

## 逐类结论（全部实际反编译验证）

| 类 | 行数 | 布局判定 | 转译 TS/Phaser 估计 |
| --- | --- | --- | --- |
| export.RoleInfo（战斗 HUD） | 584 | 混合：基础坐标 100% timeline；动态偏移/技能图标/帧语义在 AS3 | 0.5~1 天 |
| export.SelectRole（选人） | 153 | 纯 timeline + AS3 只挂事件 | 2~3 小时 |
| export.SelectPLace（世界地图 hub） | 734 | 纯 timeline 摆放；解锁 gating 全在 AS3 | ~1 天 |
| export.GameMenu(主菜单) | 287 | **例外：坐标写死在 AS3**（双按钮组滑入滑出） | 2~4 小时 |
| export.pack.BackPack + BackPackElement | 579+~350 | 面板 timeline；**格子网格代码生成** | 1.5~2 天 |
| export.saveInterface.SaveInter（存档） | 228 | 纯 timeline（0 处坐标赋值） | 半天 |
| export.shop.BuySkill/SkillControl 等 | ~4 类 | 混合（SkillControl 有条件坐标 191.35/391.35 两态） | 1~2 天 |

源码可读性：**极高**。类名/方法名/成员名全保留，无混淆（`txthp`、`btn_study`、`setSkillIcon` 直读），仅局部变量匿名化为 `_loc N_`。整包 7 屏转译约 1 周 subagent 工作量。

### 证据片段 1 — RoleInfo：基础坐标不在 AS3，动态偏移只在 AS3

```actionscript
// RoleInfo.as:105-133 setPos()——2P HUD 是 1P 的镜像+偏移，对象树里根本没有 2P 版
private function setPos() : void {
   this.Yskill.x += 159;  this.Uskill.x += 80;
   this.Oskill.x -= 80;   this.Lskill.x -= 159;
   AUtils.flipHorizontal(this.btn_bb,-1);
   ...
   this.txtexp.x = 3 * 60;  this.bg.x -= 20;  this.wsmc.x -= 8;
}
```

```actionscript
// RoleInfo.as:264 —— 血条是 101 帧 MovieClip 的 gotoAndStop，不是 scaleX！
this.hpline.gotoAndStop(Math.round(100 * (1 - getHHP()/getSHHP())) + 1);
```

不读这行，照截图复刻血条几乎必然做成 scaleX 缩放，而原版是逐帧美术（帧 1=满血）。这类"语义"是抠坐标法系统性丢失的。

同一符号的皮（本会话从 othermat.xml DefineSprite 341 提取的 PlaceObject 坐标，即现行方法的产物）：

```
head   chid=273  x=53.75  y=35.9      hpline chid=298  x=85.45  y=16.3
Yskill chid=278  x=130.5  y=518.15    Uskill chid=278  x=170.5  y=518.15  (40px 等距 ×5)
btn_bb chid=322  x=32.9   y=540.5    txthp  chid=305  x=116.35 y=16.6   …共 23 个命名实例
```

这些坐标 AS3 里一个都没有——这就是"① 单独不够"的实证。

### 证据片段 2 — BackPackElement：网格是代码生成，对象树里不存在

```actionscript
// BackPackElement.as:191-198 —— 5×5 背包格，间距 11px/9px，运行时 addChild
while(_loc5_ < 5) {
   while(_loc3_ < 5) {
      _loc2_.x = _loc3_ * (_loc2_.width + 11);
      _loc2_.y = _loc5_ * (_loc2_.height + 9);
      ...
```

PlaceObject 只放了容器，25 个格子是运行时生成的——抠对象树的人只能看到空容器，格子间距只能靠量截图猜。

### 证据片段 3 — GameMenu：反例，坐标全在 AS3

```actionscript
// GameMenu.as:217-236 showMenu() —— 主菜单按钮列，x=751.15、y 步进 157.65→445.15
this.newGame.x = 751.15;      this.newGame.y = 157.65;
this.continueGame.x = 751.15; this.continueGame.y = 205;
this.gameHelp.x = 751.15;     this.gameHelp.y = 252.7;
...  // 隐藏 = 挪到 x=1110 屏幕外，两套按钮组互换
```

主菜单这类"两态互换"界面，timeline 里按钮摆在屏幕外，抠对象树会得到 x=1110 的假坐标。

### 证据片段 4 — SelectPLace（世界地图）：解锁 gating 只在 AS3

```actionscript
// SelectPLace.as:136-157 —— 哪些关卡格子可点由 curBigStage/curBigLevel 循环决定
while(_loc4_ < this.gc.curBigStage) {
   ...
   this["s" + (_loc4_+1) + "_" + (_loc3_+1)].addEventListener(MouseEvent.CLICK, this.onSelected);
   ...
this["s" + this.gc.curBigStage + "_" + this.gc.curBigLevel].gotoAndStop(2);  // 当前关高亮=帧2
```

外加 `sorrybag.visible` 按存档 flag 条件显隐——进度门控、高亮语义、条件摆放，对象树全不可见。这正是任务书说的"最高价值缺口"，SelectPLace.as 734 行就是世界地图的完整行为规格。

## 对象树 vs 源码信息量对比（RoleInfo 量化）

抠对象树能拿到：23 个命名实例的静态坐标/深度/chid——**且只有这个**。丢失清单：

1. 2P 镜像布局（setPos 的 12 处偏移 + 7 处 flipHorizontal）——对象树里 2P HUD 不存在。
2. 技能图标：运行时按 `skillbykey` 动态 addChild 到 Y/U/I/O/L 槽位、键位 8/4/5/6/3→YUIOL 的映射（setSkillIcon 90 行）——对象树完全不可见。
3. 帧语义：hpline/mpline/expline = 101 帧进度、wsmc = 100 帧怒气、shows 帧 2 = 怒气满特效、head.gotoAndStop(roleName) 按角色切头像。
4. 5 个按钮的事件绑定 + 守卫条件（死亡禁开背包、curStage==0&&curLevel==2 禁用、isStopGame 互斥开关）。
5. 怒气数值逻辑（addWs 的 0.778 系数、99ms 节流、防作弊三变量编码——复刻时该丢弃防作弊但保留系数）。

结论：现行抠坐标法丢的不是"少数边角"，是**全部交互行为和全部动态布局**；反过来 AS3 丢的是全部静态坐标。各占一半，缺谁 UI 都不对。

## 重编译改原版：NO-GO（附一个反直觉小实验）

实验：用 FFDec CLI `-replace` 把自己反编译出的 RoleInfo.as（584 行）identity 重编译回主 SWF——**成功**产出 5.2MB 合法 SWF，重新反编译 diff 仅丢 3 处显式类型强转（`int(...)`/`uint(...)` 包裹，字段本身有类型标注、语义应等价）。比预期能打。但这不改变 no-go：

1. **单类补丁 ≠ 工程重编译。** FFDec 的 AS3 直编是自标 EXPERIMENTAL 的单方法/单类工具；把 446 类反编译产物喂给 Apache Royale/AIR SDK 重建整工程，要先手工修复反编译伪码（`_loc N_`、无名 catch、强转丢失），timeline 资产还得走 XFL 导出再对回，对等性风险叠加，工作量是"第二个 remake"量级。
2. **运行时是死平台。** 产出物仍是 Flash SWF，要 projector/AIR 跑——与本项目"Phaser/TS + Tauri 桌面包"的既定交付方向完全相反，投入全部沉没。
3. **AS3 无原生 WebSocket。** agent NPC 挂 WS 只能用 flash.net.Socket 裸 TCP 手写握手 + policy-file 服务，或包 AIR 用 ANE——在弃用技术栈上做全项目的核心增量，没有产品意义。
4. 主 SWF 与 OtherMat1 的类版本分歧（本报告发现 1）说明魔改作者自己就是靠补丁式改法维护的——重编译整工程连原作者都没走这条路。

**反直觉的可用侧产物**：identity recompile 成功意味着 FFDec 单类补丁可以给原版**插 trace 做行为考古**（比如在 setSkillIcon 里打日志确认槽位坐标计算），这是复刻期的侦查工具，不是交付路径。（本实验只验证了 SWF 结构合法 + 反编译往返，未在 Flash 运行时实跑——macOS 无 projector，如需可在 home 的 Windows 上验。）

## 可复用流程（翻译路线的操作规程）

对每个 UI 屏：

1. **定符号**：在 out_res 子 SWF 反编译产物里找类的 `[Embed(... symbol="symbolN")]` 注解，得到皮的 SWF+chid（如 RoleInfo→OtherMat1 symbol341）。
2. **取皮**：`ffdec-cli.jar -swf2xml out_res/<sub>.swf out.xml`，提取 DefineSprite N 下 PlaceObject2 的 name/depth/matrix（translateX/Y ÷20 = px），再按 chid 导出各部件位图。这一步就是现行方法，保留。
3. **取骨**：以**主 SWF** 的反编译类为行为真源（不是 OtherMat1 的旧副本），逐段转译：`public var` 声明对应 timeline 实例（回填第 2 步坐标）；`added/removed` 对应组件挂载/卸载与事件绑定；`step()` 对应 update；`gotoAndStop` 语义逐个查符号帧数确定是进度条/状态切换/角色切换。
4. **写死取舍**：防作弊编码（setWsValue 三变量）、4399 网络调用、FileReference 存档 IO 按平台适配替换，带 Adapted/Dropped 注释（同现行移植协议）。

命令备忘（本会话实测可用，java 用 `/opt/homebrew/opt/openjdk/bin/java`，PATH 里没有 java）：

```bash
java -jar tools/ffdec/ffdec-cli.jar -export script <outdir> <主SWF或out_res子SWF>
java -jar tools/ffdec/ffdec-cli.jar -swf2xml <swf> <out.xml>
java -jar tools/ffdec/ffdec-cli.jar -selectclass export.RoleInfo -export script <outdir> <swf>
```

坑：别碰客户端 `assets/` 目录的加密子 SWF（FFDec 静默出 0 类不报错），一律用 `out_res/`。
