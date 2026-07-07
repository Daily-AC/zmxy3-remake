# 反编译 AS3 UI 源码可行性评估（独立交叉验证）

审计员：独立评估会话，只读代码/反编译产物，唯一写入=本报告。反编译产物落
`/private/tmp/claude-501/-Users-e0-7-projects/26c986b7-5f6a-4a4b-8f59-2d464177bf21/scratchpad/decompile-codex/`（不进仓库）。FFDec 全程走 headless CLI（`tools/ffdec/ffdec-cli.jar`，Java 走 `/opt/homebrew/opt/openjdk`，没裸跑过 GUI）。`game/` 未做任何改动。

## 三选一结论

**②「抠对象树坐标」仍是主路线，① 只在窄而具体的场景里作为补充，③ 不做（no-go）。不是三选一互斥，是"以②为底、①按信号打补丁、③排除"的分层结论。**

依据：

1. 对 13 个反编译到手的 UI 类逐个检查后，**绝大多数屏幕（RoleInfo 基础布局、SelectRole、SelectPLace/世界地图、SaveInter、SetMenu、BackPack 基础布局、SkillControl/PassiveSkillControl 基础布局）的坐标 100% 来自 timeline，AS3 代码里一行都没有**——读源码对这些屏幕的布局信息增量是零，抠对象树是唯一路径，别无选择。
2. 但确实存在几类**只存在于 AS3 代码、对象树完全看不到**的布局信息（因为对应的显示对象根本不在 SWF timeline 里，是运行时 `new` 出来的）：背包 25 格网格、SkillBarHud/RoleInfo 的镜像换算、菜单滑入/滑出的多状态坐标。这部分必须读源码，抠对象树无论怎么抠都拿不到。
3. 用一个真实数字实验验证了"抠对象树"这条路本身是可靠的、精度足够——**只要抠得对**（细节见下文"对象树 vs 源码"一节），当前项目里 RoleInfo 的手工像素对比校准法（"min-diff calibrated"）其实是绕了远路：`-export xfl` 能直接吐出精确到小数点的 PlaceObject 矩阵，跟手工校准结果几乎完全吻合。这是一个和三选一并列的、独立可执行的流程改进建议。
4. 重编译回 SWF/AIR：**no-go**，理由见下文，其中最决定性的一条不是技术可行性，而是它是对已经完成并部署验证的 Phaser+TS+Tauri+Node/WebSocket 技术栈的战略性倒退，没有对应收益。

## 作业 1：13 个 UI 类的反编译质量结论

用 `-selectclass` 一次性从主 SWF `打开我开始玩.swf` 精确导出（不用全量导出 1600+ 类）：`export.RoleInfo`、`export.SelectRole`、`export.SelectPLace`（世界地图，注意大写 L 是原始拼写）、`export.pack.BackPack`、`export.pack.BackPackElement`、`export.saveInterface.SaveInter`、`export.GameMenu`、`export.LineChoose`、`export.setmenu.SetMenu`、`export.shop.SkillControl`、`export.shop.PassiveSkillControl`、`export.shop.SkillSetControl`、`export.shop.BuySkill`。全部 13/13 成功、无报错。

先说清楚一个关键背景事实：主 SWF `打开我开始玩.swf` 是明文 CWS（未加密），可以直接反编译；但 `assets/` 子目录下的 UI 资源 SWF（`OtherMat1.swf`/`backpack1.swf`/`Common1.swf` 等）**文件头不是合法 SWF 签名**（不是 FWS/CWS/ZWS），是仍处于加密态的原始分发文件——真正可反编译的解密版在 `vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/`（CLAUDE.md 提到的"out_res/ 已解密全套 SWF"，之前没注意到 `assets/` 目录下同名文件不是同一份东西）。所有 UI 类的 AS3 逻辑代码本身都在主 SWF 里（`export.*` 包），子 SWF 只放 timeline/位图资源，`SymbolClass` 把两者绑在一起。

### RoleInfo（战斗 HUD，OtherMat1.swf chid341）

**结论：99% timeline 静态摆放，1% 代码驱动（仅玩家2镜像 + 动态技能图标居中）。**

`RoleInfo` 类的字段（`txthp`/`hpline`/`head`/`Yskill`...）全部是 `public var`，构造函数（`RoleInfo.as:84-98`）里除了 `setHead()`/`setWsValue(0)` 没有任何坐标赋值——布局 100% 来自 timeline 上已放置好的同名子实例。唯一的坐标代码在 `setPos()`（`RoleInfo.as:105-134`，双人模式给玩家2用）：

```actionscript
private function setPos() : void
{
   this.Yskill.x += 159;
   this.Uskill.x += 80;
   this.Oskill.x -= 80;
   this.Lskill.x -= 159;
   AUtils.flipHorizontal(this.btn_bb,-1);
   ...
   this.txtexp.x = 3 * 60;
   ...
}
```

以及 `setSkillIcon()`（`RoleInfo.as:136-226`）里动态技能图标的居中公式：

```actionscript
_loc4_.x = this[_loc9_ + "skill"].x - this[_loc9_ + "skill"].width / 2;
_loc4_.y = this[_loc9_ + "skill"].y - this[_loc9_ + "skill"].height / 2;
```

工作量估计：转译这两段（镜像偏移表 + 居中公式）大约 20 行 TS，半小时内的活。但注意：`this[_loc9_+"skill"].x` 引用的还是 timeline 上 `Yskill`/`Uskill` 等具名实例的坐标——这段公式本身不含数字，数字仍要从对象树拿。**读源码在这里买到的是"公式"，买不到"数字"。**

### SelectRole（选人五格，主 SWF）

**结论：100% timeline 静态摆放，代码只有交互逻辑，无布局坐标。**

`btn1`~`btn4`、`username` 全是 timeline 摆好的 `public var`。仅有的一处几何计算是 hover 高亮箭头的相对定位（`SelectRole.as:67-74`）：`_loc2_.x = param1.currentTarget.x - 50; _loc2_.y = 40;`——这是"相对当前按钮偏移"的通用规则，不是具体坐标，转译成本可忽略（几行）。

### SelectPLace / WorldMap（世界地图，最高价值缺口，主 SWF）

**结论：734 行代码里，坐标赋值代码为零。** 全部 12 个关卡节点（`s1_1`..`s4_3`）、`dsgbtn`/`sgzz`/`kls`/`llbt`/`sssl`/`btnnmg` 等按钮全部是 timeline 上的 `public var`，`added()`（`SelectPLace.as:131-201`）只做事件监听绑定和显隐判断，从头到尾没有一行 `.x =` / `.y =`（唯一的例外是运行时弹窗 `getawardts` 固定放在 `x=271.25,y=514.3`，`SelectPLace.as:282-283`，这是新弹窗不是节点布局）。

但这个类里有**大量不属于布局、却对复刻价值很高的门控逻辑**（这是"对象树"这条路径完全拿不到、也不是本 spike 主题布局但值得记一笔的发现）：

```actionscript
private function dsgClick(param1:MouseEvent) : void
{
   ...
   else if(this.gc.player1.getCurLevel() < 40)
   {
      this.gc.ts.setTxt("玩家的等级必须都大于40级才可以进入");
      ...
   }
```
（大圣坟场入口要求等级40，`SelectPLace.as:707-731`）
```actionscript
private function inToLingLongTower(param1:MouseEvent) : void
{
   if(this.gc.curBigStage < 4)
   {
      this.gc.ts.setTxt("请先通过凌霄宝殿的考验！");
      ...
```
（玲珑宝塔要求 curBigStage>=4，`SelectPLace.as:661-671`）

结论：世界地图的**布局**必须、也只能靠抠对象树；但它的**解锁/进入条件**（等级40门槛、大关卡序号门槛、灵魂值消耗 5000/20000 二选一模式）在对象树里根本不存在，这是源码读取唯一能补上的东西——但这属于"玩法逻辑"范畴，不是本 spike 的"布局"范畴，标注给主会话决定是否要单独立项复核。

### BackPack / 个人资料面板（backpack1.swf chid444，逻辑在主 SWF `export.pack.BackPack`）

**结论：基础布局 timeline 静态，等级数字渲染是代码驱动的小型逐位排版。**

装备槽（`zbwq`/`zbsp`/`zbfj`/`zbfb`/`zbsz`/`zbtx`）、属性文本框全部 timeline 摆放。仅有的坐标代码是等级数字逐位拼接（`BackPack.as:398-429`）：

```actionscript
_loc5_ = 0;
while(_loc5_ < String(param2).length)
{
   _loc6_ = uint(int(String(param2).charAt(_loc5_)));
   _loc4_ = AUtils.getImageObj(param1 + _loc6_);
   _loc4_.x = 5.8 + _loc5_ * param3;
   _loc4_.y = 13;
   this.le.addChild(_loc4_);
   _loc5_++;
}
```
两位数等级时每位数字宽度 `param3`（调用处传 26）逐位平铺，这是标准数码管式渲染，转译成本约10行。

### BackPackElement（背包物品网格分页，主 SWF）—— **本次最关键的反例**

**结论：25 格网格是纯运行时代码计算，对象树里完全不存在这些子对象，只有读源码才能拿到。**

```actionscript
private function drawgz(param1:Array) : void
{
   ...
   while(_loc5_ < 5)
   {
      _loc3_ = 0;
      while(_loc3_ < 5)
      {
         _loc2_ = AUtils.getNewObj("export.pack.PackThings") as PackThings;
         _loc2_.x = _loc3_ * (_loc2_.width + 11);
         _loc2_.y = _loc5_ * (_loc2_.height + 9);
         this.gzSprite.addChildAt(_loc2_,0);
         ...
```
（`BackPackElement.as:185-209`）5×5=25 格，每页 25 件（`pageNum=25`，`allPage=5`，`BackPackElement.as:14-18`），横向间距 = 格宽+11px、纵向间距 = 格高+9px。这 25 个 `PackThings` 实例是 `new` 出来的，SWF timeline 里没有它们的 `PlaceObject`——**用 FFDec 抠对象树，不管抠多细，这个网格的坐标永远抠不出来，因为它压根不在文件里**。转译成本：一个 5×5 循环 + 分页偏移（`_loc4_ + (curPage-1)*25`），15 行左右。

### SkillControl / PassiveSkillControl / SkillSetControl / BuySkill（技能树，主 SWF）

**结论：基础五槽布局 timeline 静态，状态切换按钮 + 悬浮提示是代码驱动。**

`PassiveSkillControl`（46 行，五个被动技能槽 `pskill1`~`pskill5`）全 timeline，零坐标代码——最干净的例子。`SkillControl` 里有两处真代码布局：切换"斩系/火系"心法时移动"升级"按钮（`SkillControl.as:124-140`）：
```actionscript
private function firstXFFunc(param1:MouseEvent) : void
{
   this.upGradebtn.x = 136.95;
   this.upGradebtn.y = 191.35;
   ...
private function secondXFFunc(param1:MouseEvent) : void
{
   this.upGradebtn.x = 136.95;
   this.upGradebtn.y = 391.35;
```
以及升级消耗提示气泡跟随鼠标悬浮位置（`SkillControl.as:96-114`，`localToGlobal` 换算全局坐标）。转译成本：这两组共约15行，但价值有限（`upGradebtn` 两个固定位置直接抄数字即可，不需要理解上下文）。

### GameMenu（主菜单，主 SWF）—— **另一个关键正例**

**结论：菜单按钮的位置本身是多状态代码驱动的滑入/滑出动画，不是单一 timeline 摆放。**

```actionscript
public function showMenu() : void
{
   this.simpleGame.x = 1110;
   this.doubleGame.x = 1110;
   this.backbtn.x = 1110;
   this.gameHelp.x = 751.15;
   this.gameHelp.y = 252.7;
   this.aboutUs.x = 751.15;
   this.aboutUs.y = 305.6;
   this.continueGame.x = 751.15;
   this.continueGame.y = 205;
   this.newGame.x = 751.15;
   this.newGame.y = 157.65;
   this.btnquit.x = 751.15;
   this.btnquit.y = 352.55;
   ...
```
（`GameMenu.as:217-236`，另有 `showSelectNum()`/`hideMenu()` 两组不同坐标，`GameMenu.as:148-215`）同一批按钮在"单人/双人选择态"、"主菜单态"、"隐藏态"下位于三组完全不同的硬编码坐标（1110=移出屏幕，751.15=主列，800=次列），行间距约47.9px 等距排布。**这类"同一控件多状态坐标表"是 timeline 单帧快照完全无法表达的**——SWF 的 timeline 只能给你构造时的初始帧位置，抠对象树顶多拿到其中一个状态（大概率是"隐藏态"或第一帧），另外两组状态的坐标只存在于这段代码里。转译成本：约30行，是所有13个类里"读源码收益最高"的单个发现。

### SaveInter / SetMenu（存档界面 / 暂停设置菜单，主 SWF）

两者都是**100% timeline 静态摆放**的教科书案例：6个存档槽 `btn_0`~`btn_5`、暂停菜单的继续/返回/音效/画质按钮全部 `public var`，代码只做事件绑定和状态读写（音效开关/画质档位），没有一行坐标赋值。

### LineChoose（联机大厅列表，主 SWF）—— 不相关但同样是"代码驱动动态列表"的正例

这是造3当年联机对战大厅（`com.multi4399`），单机复刻用不上，但提供了第三个"运行时动态创建元素 + 硬编码坐标表"的独立证据：
```actionscript
this.posArray = [[100,105],[475,105],[100,195],[475,195],[100,285],[475,285],[100,375],[475,375]];
...
_loc9_ = uint(this.lineArray.length % 8);
_loc10_ = this.posArray[_loc9_];
_loc5_.x = _loc10_[0];
_loc5_.y = _loc10_[1];
```
（`LineChoose.as:46`, `184-187`）两列8行的房间条目坐标表，同样是 `new LineTitle()` 运行时创建、timeline 里不存在。

## 作业 2：对象树 vs 源码——用真实数据量化，而非空谈

以 RoleInfo（chid341，OtherMat1.swf 解密版 `out_res/OtherMat1.swf`）为例，用 `-format xfl:cs6 -selectid 341 -export xfl` 精确导出了它的完整 timeline，拿到了逐层 `DOMSymbolInstance` 的精确 `Matrix tx/ty`：

```xml
<DOMSymbolInstance libraryItemName="Symbol 265" name="bg" ...>
  <matrix><Matrix tx="1.0" ty="2.0"/></matrix>
</DOMSymbolInstance>
...
<DOMSymbolInstance libraryItemName="Symbol 278" name="Yskill" ...>
  <matrix><Matrix tx="130.5" ty="518.15"/></matrix></DOMSymbolInstance>
<DOMSymbolInstance libraryItemName="Symbol 278" name="Uskill" ...>
  <matrix><Matrix tx="170.5" ty="518.15"/></matrix></DOMSymbolInstance>
<DOMSymbolInstance libraryItemName="Symbol 278" name="Iskill" ...>
  <matrix><Matrix tx="210.5" ty="518.15"/></matrix></DOMSymbolInstance>
<DOMSymbolInstance libraryItemName="Symbol 278" name="Oskill" ...>
  <matrix><Matrix tx="250.45" ty="518.15"/></matrix></DOMSymbolInstance>
<DOMSymbolInstance libraryItemName="Symbol 278" name="Lskill" ...>
  <matrix><Matrix tx="290.45" ty="518.15"/></matrix></DOMSymbolInstance>
```

对照 `game/src/ui/hud/RoleInfoHud.ts` 现有代码的注释（"calibrated by min-diff pixel matching against the extracted composite"）：`BG={x:1,y:2}` 与对象树 `tx=1.0,ty=2.0` **完全精确重合**；`game/src/ui/hud/SkillBarHud.ts` 的 `SLOT_CX=[127,167,207,247,287]`（40px 等距）与对象树 `Yskill/Uskill/Iskill/Oskill/Lskill` 的 tx 序列 `130.5/170.5/210.5/250.45/290.45`（同样精确 40px 等距，差值是裁切合成图与完整 timeline 坐标系之间的固定原点偏移 ≈3.5px）**逐格对上**。

**结论**：对象树方法本身没有精度问题——当前项目对 RoleInfo 用的"导出合成 PNG + 手工像素对比校准"（min-diff calibrated）是把一条本可以一步到位的路线走成了试错迭代。**真正该做的流程改进是：用 `-export xfl` 直接拿 `DOMSymbolInstance` 的精确 Matrix，而不是导出扁平合成图再回头猜坐标。** 这是一条独立于三选一之外、马上能落地的效率提升。

信息量损失清单（对象树相比源码，具体丢了什么）：
1. **多状态坐标**（GameMenu 三组菜单状态、SkillControl 两组升级按钮位置）——对象树只能给一个 timeline 初始帧，其余状态的坐标只存在于代码硬编码里。
2. **运行时创建元素的布局**（BackPackElement 25格网格、LineChoose 8个房间位、RoleInfo 动态技能图标）——这些对象根本不在 SWF 文件里，对象树无论怎么抠都是空的。
3. **条件/镜像变换**（RoleInfo.setPos 双人镜像偏移、flipHorizontal 调用）——对象树给的是"单人默认态"的坐标，双人对称态的偏移规则只在代码里。
4. **非布局但高价值的门控逻辑**（SelectPLace 的等级/大关卡门槛、灵魂消耗量）——不属于"布局"范畴，但同样是对象树完全拿不到、必须读源码才有的信息，值得给主会话单独提一句（不在本 spike 判据内，仅作旁注）。

量化一下：13 个类里，**8 个类（RoleInfo基础/SelectRole/SelectPLace/SaveInter/SetMenu/PassiveSkillControl/BackPack基础/SkillSetControl+BuySkill 未展开但同构）布局坐标 100% 来自对象树，读源码零增量；5 个类（RoleInfo镜像+技能图标/BackPackElement网格/GameMenu多状态/SkillControl两态/LineChoose列表）各有一段 15~30 行的、只有源码才能给出的布局代码**。按行数算，13 个类合计约 3800 行 AS3，其中含真实布局信息的代码不到 150 行（约4%）——**"翻译 AS3 布局源码"这条路如果不加甄别地全量做，96% 的翻译工作量是在抄一遍 timeline 已经能给的坐标，纯浪费**；但如果按下面的信号做定点抓取，这4%正好是对象树抓不到的那部分,性价比很高。

## 作业 3：重编译回 SWF/AIR 可行性——no-go

**结论：no-go。** 理由分三层，最后一层最关键：

1. **反编译-再编译对等性风险，446+ 类规模下不可控**：本次仅抽查13个类，FFDec 的 AS3 反编译在方法体层面质量很高（audit-numbers-report 已验证数值逐字精确），但反编译器重建的源码和原始编译单元并非字节码级等价——p-code 到语法树的还原在闭包、内联常量折叠、混淆过的控制流上可能生成"语义等价但结构不同"的代码，446 个类里只要有一个编译失败或行为出现细微偏差（尤其是 `try/catch`、多重嵌套三元展开这类 FFDec 本身都在用变量名 `_loc19_`/`_loc47_` 掩盖真实语义的地方），整个工程就编译不过或运行时跑出隐蔽 bug，且这类 bug 极难在人工回归里发现（原游戏没有单测）。
2. **可用的编译链条本身就是小众/维护中止的**：Adobe 已于 2020 年终止 Flash Player，官方 AS3 编译工具链（Flex/AIR SDK）现由 Harman 接手延续（Harman Adobe AIR SDK），Apache Royale 的传统 SWF 输出目标依赖同一套老式 Falcon 编译器血统；两者都是小众维护、文档和社区都在萎缩的技术栈，选它意味着给项目绑定一个随时可能真正停止维护的依赖。
3. **决定性的一条：这是对已经做出的技术选型的战略性倒退，没有对应收益**。项目 `CLAUDE.md` 已拍板技术栈是 Phaser4+TypeScript+Vite（游戏本体）+ Tauri/electron-builder（桌面壳，WebView2 渲染）+ 独立 Node/WebSocket `agent-server`（已部署到 home，`wss://zm-dev.qmledmq.cn:8443` 测试域已跑通）。如果转向"反编译-改-重编译回 SWF/AIR"，等于把已经完成并验证的 HUD（`RoleInfoHud.ts`/`SkillBarHud.ts`，本次审计确认其坐标已和对象树精确吻合）、背包、agent NPC WebSocket 通信全部推倒重来——而且推倒重来后拿到的不是"更现代"的东西，是回到一个 2020 年就已经被浏览器抛弃的运行时（AIR 桌面应用，不是网页），**没有任何原本目标（agent NPC / Tauri 打包 / WebView2 渲染）因此变得更容易**。agent NPC 要挂 WebSocket 这一条尤其反直觉：AS3/AIR 原生没有 WebSocket 客户端类（只有裸 TCP `flash.net.Socket` 和文件/URL 相关的 API），要么手撸 WebSocket 握手协议跑在 Socket 上，要么找第三方 ANE（Adobe Native Extension）——这比现在已经跑通的 Node `ws` 库反而更难。

**一句话给主会话**：重编译回 SWF/AIR 在纯技术上"能试"，但没有一个环节比现状更好，风险却全方位更高，属于典型的"为了怀旧而怀旧"，不建议投入。

## 作业 4：若"翻译布局源码"胜出——但它没有整体胜出，给的是"定点抓取"流程

不建议把"读 AS3 布局源码"设为每个 UI 屏幕的默认动作（96% 是浪费，见作业2的量化）。建议的可复用流程是**先用对象树，再用四个信号决定要不要额外读源码**：

1. **默认路径**：`-format xfl:cs6 -export xfl`（不是导出扁平合成图再像素对比！）取该屏幕根 Sprite 对应 chid 的 `DOMSymbolItem`，逐层 `DOMSymbolInstance`/`DOMDynamicText` 的 `Matrix tx/ty` 直接就是 Phaser 里子元素的 x/y（本次 RoleInfo 验证误差为0，比"导出合成图再手工校准"快且准）。
2. **触发读源码的四个信号**（在该屏幕的 AS3 类里 grep 一遍即可判断，不需要通读全文件）：
   - 循环体内出现 `.x = ... * (...)` 或 `.y = ... * (...)` 且循环变量来自数组下标——说明是运行时网格/列表（背包25格、联机大厅8格这类），必须读代码拿公式。
   - 同一个具名 timeline 实例的 `.x`/`.y` 在两个及以上不同方法里被赋成不同字面量——说明是多状态布局（菜单滑入滑出），把每个状态的坐标表整段抄下来。
   - 出现 `flipHorizontal`/`scaleX = -1` 或按 `roleid`/`rn`/`playNum` 分支单独改坐标——说明有镜像/多人对称逻辑，按分支条件抄偏移量。
   - 出现 `AUtils.getNewObj(...)` / `new XxxClass()` 后紧跟坐标赋值——说明是运行时创建的子对象，绝对不在 timeline 里，唯一来源是代码。
3. 没有命中以上任何信号的类（本次13个里的8个），直接用第1步的对象树数据收尾，不必读 AS3 布局部分（但如上文旁注，如果该屏幕同时是玩法关键节点如 SelectPLace，门控逻辑仍值得抽出来另记，不算在"布局"工作量里）。

## 反编译产物索引（供追溯，均在 scratchpad，不在仓库内）

- `scratchpad/decompile-codex/export1/scripts/export/{RoleInfo,SelectRole,SelectPLace,GameMenu,LineChoose}.as`
- `scratchpad/decompile-codex/export1/scripts/export/pack/{BackPack,BackPackElement}.as`
- `scratchpad/decompile-codex/export1/scripts/export/shop/{SkillControl,PassiveSkillControl,SkillSetControl,BuySkill}.as`
- `scratchpad/decompile-codex/export1/scripts/export/{saveInterface/SaveInter,setmenu/SetMenu}.as`
- `scratchpad/decompile-codex/roleinfo_xfl/OtherMat1/LIBRARY/Symbol 341.xml`（RoleInfo 精确 PlaceObject 矩阵，来源 `vendor/zmxy_res/.../out_res/OtherMat1.swf`）
- `scratchpad/decompile-codex/main_classlist.txt`（主 SWF 446 个类的 `-dumpAS3` 全量清单）
