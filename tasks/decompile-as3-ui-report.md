# 反编译 AS3 UI 源码可行性 + 质量评估报告

评估员：独立 spike 会话（opus）。纯评估，不改 `game/` 任何代码。真源：主 SWF `vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf` 及同目录 `assets/*.swf`。工具 FFDec headless CLI（`tools/ffdec/ffdec.jar`，Java = `/opt/homebrew/opt/openjdk/bin/java`）。反编译产物落 scratchpad，未入仓库。

---

## 结论先行

**三选一：都不是纯赢家，正确答案是「对象树坐标为主 + 定点读 AS3 源码为辅」的双源提取，不是三选一里任何一条的极端形式。**

关键发现推翻了问题的前提：**这游戏把「代码」和「布局」放在两个不同的 SWF 里**。

- 主 SWF `打开我开始玩.swf` = **446 个 AS3 类、约 13 万行纯逻辑代码**，反编译质量极高（0 个类反编译失败，类名/方法名/变量名逐字保留）。但它**几乎不含控件的静态坐标**——UI 类里的 `txthp`/`hpline`/`Yskill`/`btn_bb` 全是 timeline 实例变量，主 SWF 的 SymbolClass 表里根本没有这些 UI 符号（只有 93 个符号绑定，RoleInfo 之类不在其中）。
- 布局坐标在**素材 SWF**里。RoleInfo 的视觉符号（连同所有控件的命名摆放和像素级坐标）在 `assets/OtherMat1.swf`（brief 说的 chid341 属实），运行时由 `AUtils.getNewObj()` 按字符串从素材 SWF 取符号、绑定到主 SWF 的 AS3 类。

所以：

| 想要的东西 | 权威源 | 提取方式 |
| --- | --- | --- |
| 控件静态坐标/尺寸/层级 | **素材 SWF 的 timeline**（命名 PlaceObject 矩阵） | `swf2xml` 素材 SWF，解析 `name=` + `translateX/Y` |
| 动态/条件布局、双人镜像、事件逻辑、血条机制、公式 | **主 SWF 的 AS3 源码** | `-export script` 主 SWF，定点读目标类 |

「抠对象树坐标」（现行）和「翻译 AS3 布局源码」**不是对立的两条路，是同一屏 UI 的两个不同图层**。对象树给你坐标底座（而且是命名、像素精确的，比读 AS3 更干净——因为坐标压根不在 AS3 里），AS3 给你对象树永远拿不到的行为层。**推荐固化成一套「对象树 + 定点 AS3」双源流程**（第 6 节给出）。

**重编译回 SWF：明确 no-go。** 理由见第 5 节，一句话——它要复活一个已死的运行时（Flash Player 2021 EOL）去承载本项目的现代增量（Phaser4/agent NPC），还要跨 15+ 个 SWF 重建 SymbolClass 链接与 364 处运行时字符串反射，工程量以周计且无成功保证，而它能给的「可玩的忠实原版」——项目手里的 `.exe` projector 已经免费提供了。

---

## 1. 关键架构发现：代码与布局物理分离

`grep` 主 SWF 的 SymbolClass 映射，UI 类（RoleInfo/SelectPLace/GameMenu/BackPack/SelectRole）**都不在里面**。它们的实例化走 `AUtils.getNewObj("export.setmenu.SetMenu")` 这类字符串反射（全库 364 处），符号从素材 SWF 的 ApplicationDomain 解析。

实证：把 `assets/OtherMat1.swf` 转 XML，RoleInfo 声明的 18 个控件里 16 个都是**命名的 PlaceObject2Tag**，坐标现成（twips÷20 = px）：

```
txthp      x= 116.35 y=  16.60      Yskill  x= 130.50 y= 518.15
txtmp      x= 116.85 y=  36.00      Uskill  x= 170.50 y= 518.15   ← 40px 等距
txtexp     x= 116.85 y=  55.00      Iskill  x= 210.50 y= 518.15
hpline     x=  85.45 y=  16.30      Oskill  x= 250.45 y= 518.15
mpline     x=  86.70 y=  35.10      Lskill  x= 290.45 y= 518.15
head       x=  53.75 y=  35.90      btn_bb  x=  32.90 y= 540.50
bg         x=   1.00 y=   2.00      wsmc    x= 100.00 y= 542.75
```

这套坐标在 AS3 里**一个都没有**——AS3 里 `Yskill`、`txthp` 只是 `public var` 声明。所以「翻译 AS3 当权威布局规格」对静态坐标是**错的方向**：坐标不在那儿。

反过来，对象树里**只有坐标**，拿不到「player 2 时 Yskill 要 +159px 并水平翻转」这类逻辑（见 §2）。两边缺一不可。

---

## 2. 逐类反编译质量结论（带真实片段）

所有 UI 类反编译**零失败、完全可读**。差别只在「布局逻辑落在 AS3 还是 timeline」，逐类判定如下。

### RoleInfo（战斗 HUD）—— 混合型，AS3 含高价值动态层

①布局归属：**基础坐标在 OtherMat1.swf timeline；AS3 承载全部动态/条件布局**。
②可读性：满分。③转译工作量：中（坐标抄对象树 + 动态逻辑照译 AS3，约半天/屏）。

AS3 独有、对象树拿不到的三类信息：

**(a) 双人模式镜像布局**（`setPos()`，rn==2 时整屏翻转 + 精确偏移）：
```actionscript
private function setPos() : void {
   this.Yskill.x += 159;  this.Uskill.x += 80;
   this.Oskill.x -= 80;   this.Lskill.x -= 159;
   AUtils.flipHorizontal(this.btn_bb,-1);   // 按钮水平翻转
   this.txtexp.x = 3 * 60;                  // = 180
   this.bg.x -= 20;  this.head.x -= 20;  this.hpline.x -= 20;
   this.shows.x = 110;  this.wsmc.x -= 8;
}
```

**(b) 技能图标动态定位**（相对锚点 sprite 居中，运行时按已学技能生成）：
```actionscript
_loc4_.x = this[_loc9_ + "skill"].x - this[_loc9_ + "skill"].width / 2;
_loc4_.y = this[_loc9_ + "skill"].y - this[_loc9_ + "skill"].height / 2;
```

**(c) 血条 = 100 帧影片剪辑按百分比 `gotoAndStop`**（不是缩放条，是逐帧动画）：
```actionscript
this.hpline.gotoAndStop(Math.round(100 * (1 - HHP/SHHP)) + 1);
```
这条决定了复刻血条要用「101 帧的 spritesheet + setFrame」还是简单进度条——对象树给不了这个语义。

### GameMenu（主菜单）—— AS3 权威型（坐标就在代码里）

①布局归属：**坐标写死在 AS3**。菜单靠把按钮在屏内 `x=800` / 屏外 `x=1110` 之间移动做进出场动画。
②可读性：满分。③工作量：低（坐标直接抄 AS3 常量）。

```actionscript
public function showSelectNum() : void {      // 选人数面板
   this.simpleGame.x = 751.15;  this.doubleGame.x = 751.15;
   this.backbtn.x = 800;
   this.newGame.x = 1110;  this.continueGame.x = 1110; ... // 1110 = 移出屏外
}
private function hideMenu(param1:Boolean) : void {
   ...  this.backbtn.x = 800;
   if(param1){ this.continueGame.x = 800; this.newGame.x = 800; this.newGame.y = 205.5; }
}
```
这类界面**对象树只能抓到初始一帧**，进出场的目标坐标（800/1110/205.5）全在 AS3。这里 AS3 是权威。

### SelectPLace（世界地图 hub，最高价值缺口）—— timeline 权威型

①布局归属：**关卡节点全在 timeline 静态摆放**，AS3 只有状态机 + 命名约定。
②可读性：满分（除一处 FFDec 渲染 artifact，见下）。③工作量：中（节点坐标抠对象树，交互逻辑照译）。

节点是命名实例 `s{大关}_{小关}`（如 `s1_1`），AS3 按名字反查，不生成坐标：
```actionscript
private function onSelected(param1:MouseEvent) : void {
   this.gc.curStage = uint(...(int(String(param1.currentTarget.name).substr(1,1)))...);
   this.gc.curLevel = uint(...(int(String(param1.currentTarget.name).substr(3,1)))...);
}
private function mOut(param1:MouseEvent) : void {   // 锁定/当前/悬停三态
   if(target != this["s"+curBigStage+"_"+curBigLevel]) target.gotoAndStop(1);
   else target.gotoAndStop(2);
}
```
> FFDec artifact 注记：`onSelected` 里出现 `uint(uint(uint(...)))` 上百层嵌套——这是 FFDec 对 `uint()` 转换的一个已知渲染缺陷，**语义正确、能编译**，但读的时候需要人肉剥壳。全库仅此类少数点位有，不影响可读性判断。

对象树给节点坐标，AS3 给三态帧号（1锁/2当前/3悬停）和 `s{stage}_{level}` 命名协议。地图这一屏**对象树是主源**。

### SelectRole（选人五格）—— timeline 权威型

①布局归属：五个按钮 `btn1..btn4` timeline 摆放，AS3 只有悬停浮层的相对定位和点击逻辑。②可读性：满分（全类 153 行）。③工作量：低。
```actionscript
private function over(param1:MouseEvent) : void {
   _loc2_.x = param1.currentTarget.x - 50;   // 浮层相对按钮
   _loc2_.y = 40;
}
```

### BackPack（背包/个人资料）—— timeline 权威型 + AS3 数值层

①布局归属：面板 chrome、装备槽（`zbwq/zbsp/zbfj/zbfb`）、20+ 属性文本框、物品格全是 timeline 实例变量；AS3 负责数据绑定 + 战斗力公式 + 少量子精灵偏移。②可读性：满分。③工作量：中偏高（控件多，坐标抠对象树；`getFightingForce` 战斗力公式值得照译）。

AS3 独有的数字→数字图拼接布局（等级显示）：
```actionscript
_loc4_.x = 5.8 + _loc5_ * param3;   // 多位数逐位摆放，param3=位距
_loc4_.y = 13;
```

### RoleSkillInterface / 法宝技能（SutraInterface, shop/BuySkill）—— timeline 权威型

技能/法宝强化界面（`export/strength/SutraInterface.as`、`export/shop/BuySkill.as`）同 BackPack 模式：控件（`txt_fbname/txt_fbatk/resetbtn`…）timeline 摆放，AS3 绑数值。可读性满分。

### 主菜单存档（SaveInter）—— timeline 权威型

`btn_0..btn_5` 存档槽 timeline 摆放，AS3 管 `state` 机（读/写/删）。

---

## 3. 对象树 vs AS3 源码：信息量对比（以 RoleInfo 量化）

| 信息 | 对象树（swf2xml 素材 SWF） | AS3 源码（主 SWF） |
| --- | --- | --- |
| 18 个控件的静态 x/y/scale | ✅ 命名、像素精确（§1 表） | ❌ 不存在 |
| 控件层级/深度 | ✅ depth 字段 | ⚠️ 部分（addChild 顺序） |
| 双人镜像布局（+159/翻转/-20 等 20 处偏移） | ❌ | ✅ `setPos()` |
| 技能图标运行时定位公式 | ❌ | ✅ `anchor.x - w/2` |
| 血条 = 101 帧 gotoAndStop 机制 | ⚠️ 能看到是 MovieClip，看不出用法 | ✅ 明确 |
| 5 个按钮各自的点击行为（开背包/设置/学技能/法宝/宠物） | ❌ | ✅ 5 个 handler |
| 防作弊数值编码（wsValue 拆分校验） | ❌ | ✅ |

**「只抠对象树」在 RoleInfo 上丢失的**：全部条件布局（双人模式整屏错位会摆错）、技能图标定位、血条渲染方式、以及所有交互——即这一屏「怎么动」的信息 100% 丢失，只剩「初始长什么样」。

**「只翻译 AS3」在 RoleInfo 上丢失的**：全部 18 个控件的基准坐标——即这一屏「长什么样」的信息 100% 丢失，只剩「怎么动」。

结论：**RoleInfo 这种混合型屏，任一单源都缺一半规格。** GameMenu 偏 AS3、SelectPLace/SelectRole 偏对象树，但没有一屏是「纯对象树够用」——因为交互和状态永远在 AS3。现行「抠对象树坐标」方法的系统性损失 = **整个行为/动态布局图层**，屏越复杂丢得越多（RoleInfo/GameMenu 丢得最狠，静态展示屏丢得少）。

---

## 4. FFDec 反编译质量总评

- **446 个主 SWF 类，0 个反编译失败**（无 `§§`/P-code 回退标记）。类名、方法名、局部变量语义名（`this.hero`/`roleProperies`/`getWsValue`）全保留。
- 唯一瑕疵：极少数 `uint()`/位运算点位有嵌套渲染 artifact（如 SelectPLace.onSelected），语义正确可编译，读时需剥壳。
- 素材 SWF `swf2xml` 命名摆放齐全（OtherMat1 有 180 个命名 PlaceObject），坐标即取即用。

即 audit-numbers 报告里「AS3 逐字可读」的结论，在 UI 类上同样成立且更强。

---

## 5. 重编译回 SWF：go/no-go 详论 —— **no-go**

技术可行性（不等于该做）：
- FFDec 反编译产物**理论上可用 Apache Royale / AIR SDK 重编译**，但对象是 **13 万行跨 15+ SWF、含 364 处运行时字符串反射（`getNewObj`/`getImageObj`/ApplicationDomain 按名解析）** 的工程。重编译必须重建：多 SWF 的 SymbolClass 绑定表、素材 SWF 的 ApplicationDomain 加载拓扑、以及所有 timeline DefineSprite——FFDec 导出的是 AS3 源码，不导出可直接 round-trip 的 FLA 工程结构。字符串反射意味着编译器静态查不到的类引用会在运行时才炸，排错以周计且无收敛保证。
- WebSocket 不是障碍：AIR 桌面有 `flash.net.Socket`（裸 TCP）+ as3-websocket 库，agent NPC 挂 WS 技术上能接。**但这恰恰暴露了问题**——为了接现代 agent，要先复活一个 2021 EOL 的运行时（Flash Player 已死，AIR 现由 Harman 小众维护）。

为什么 no-go（决策层，压倒技术层）：
1. **零净收益**。重编译唯一产出是「可玩的忠实原版」——项目手里 `打开我开始玩.exe`（同内容 projector）**已经能双击就玩**。重编译不提供任何 exe 没有的东西。
2. **与项目论点正面冲突**。CLAUDE.md 已拍板：Phaser4 + TS + WebView2/Tauri，核心增量是 LLM agent NPC，agent-server 的 WS 层**已在 JS 侧建好并部署 home**。重编译等于把地基推倒重铺到一个死运行时上，再把已经建好的现代 agent 层往回移植进 AS3。方向相反。
3. **保真度风险高、验收口径不匹配**。项目验收口径是「Windows exe 装到 home 真机运行」，Flash projector/AIR 打包与该链路（Tauri/WebView2）不兼容。

倾向：**放弃重编译分支。** 把反编译产物当**只读规格源**（代码逻辑 + 数值 + 布局），不当编译目标。

---

## 6. 推荐固化的可复用流程：「对象树 + 定点 AS3」双源提取

若某屏要复刻，照此做（替代现行「只抠对象树」，补上行为层）：

**Step 0 定位符号所在 SWF。** UI 符号通常在素材 SWF 而非主 SWF。先在主 SWF export script 里读到 AS3 类的 `public var` 列表（= 控件清单），再拿这些控件名去 `grep` 各素材 SWF 的 swf2xml 找命中（RoleInfo → OtherMat1.swf）。brief 里给的 chid 是捷径。

**Step 1 抠静态坐标（对象树）。**
```bash
JAVA=/opt/homebrew/opt/openjdk/bin/java
$JAVA -Djava.awt.headless=true -jar tools/ffdec/ffdec.jar -swf2xml <素材.swf> out.xml
# 解析：每个 name="xxx" 的 PlaceObject2Tag，取其后 matrix 的 translateX/Y (÷20=px)、scaleX/Y
```
产出 `{控件名: (x, y, scaleX, scaleY, depth)}` 表 —— 布局底座。

**Step 2 读行为层（AS3）。** export script 后定点读目标类，抽四样：
- `public var` 列表 → 控件清单（对齐 Step 1 命名摆放）
- `setPos()` / 条件重定位 / `flipHorizontal` → 双人镜像、变体布局
- 动态子对象生成循环 + 坐标公式（技能图标、物品格、数字拼接）
- 事件 handler + `gotoAndStop(state)` 语义（血条帧机制、三态节点）

**Step 3 导素材位图。**
```bash
$JAVA -Djava.awt.headless=true -jar tools/ffdec/ffdec.jar -export image,sprite out_dir <素材.swf>
```

**Step 4 转 Phaser/TS。** Step 1 坐标 → Container 子对象定位；Step 2 逻辑 → TS（镜像偏移直译、公式直译、帧血条→setFrame/tween）；Step 3 位图 → 纹理。

一次沉淀，每屏照做，把现行方法从「只有坐标底座」升级成「坐标 + 行为完整规格」。

---

## 附录：环境与踩坑

- Java：系统 PATH 无 java；用 `/opt/homebrew/opt/openjdk/bin/java`（openjdk 26）跑 FFDec 正常。
- **FFDec 裸跑弹 GUI 事故复现并证实**：`java -jar ffdec.jar`（无子命令）会启 Swing GUI（本次触发过，exit 144，已 `pkill -f ffdec.jar` 处理）。**headless CLI 必须带子命令**：`-export` / `-swf2xml` / `-dumpSWF`，且加 `-Djava.awt.headless=true` 兜底。macOS 无 `timeout` 命令，别用。
- 主 SWF swf2xml 产物 44MB；素材 SWF 小得多，按屏取素材 SWF 更实际。
- 反编译产物落 scratchpad（`.../scratchpad/decomp/main`、`othermat1.xml`），未入仓库。
