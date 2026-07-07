# S2 选人 + S3 存档 — 报告

两屏版式重做，功能不变（仅悟空可选、6 槽增删读）。S2 源 = vendor `OtherMat1.swf`
`export.SelectRole`（timeline 皮）+ 主 SWF `export.SelectRole`（AS3 骨，153 行）；S3 源 =
参照图本身（`docs/reference/user-flow-refs/saveslots-original.png`，Online 版式，用户指定），
`docs/reference/zmxy-online-extracted/` 里对应符号是纯矢量容器挖不出位图（README 已记录），
按 spec 允许的"图量"路径执行。

## 1. S2 — AS3 骨（`export.SelectRole`，主 SWF `打开我开始玩.swf`）

全文 153 行，`tmp/l4work/mscripts/scripts/export/SelectRole.as`（decompile-as3-ui-spike 棒已挖，
本棒复用）。关键行：

```actionscript
public var btn1:SimpleButton;  // 孙悟空
public var btn2:SimpleButton;  // 唐僧
public var btn3:SimpleButton;  // 猪八戒
public var btn4:SimpleButton;  // 沙僧（第五格"???"无按钮，纯装饰，AS3 里没有对应变量）

private function over(param1:MouseEvent) : void {
   var _loc2_:* = AUtils.getImageObj(this.curSelected + "P");  // 取名为"1P"/"2P"的库符号
   _loc2_.x = param1.currentTarget.x - 50;
   _loc2_.y = 40;
   this.addChild(_loc2_);
}

private function onClick(param1:MouseEvent) : void {
   param1.currentTarget.removeEventListener(...);  // 摘监听，该格锁死
   var _loc2_:uint = uint(int(String(param1.currentTarget.name).substr(3,1)));  // "btn1"→1
   if (this.gc.playNum == 1) { this.newRole(_loc2_); }        // 单机：点一下=选+确认，立即 newRole
   ...
   param1.target.upState = param1.target.downState;  // 点后 up 态永久替换成 down 态（保持彩色/红底）
}

private function newRole(param1:uint = 3) : void {
   if (this.curSelected == 1) { this.gc.player1.roleid = param1; ... }
   this.gc.newRole();
   if (this.gc.playNum == 2) { ... }           // 双人模式才有第二次选择
   else { this.selectOver(); }                 // 单机：立刻从舞台移除 SelectRole，进游戏
}
```

**发现（未按字面复刻的一处，已记录）**：原版单机模式实际是**单击立即选中并确认**（`onClick` 内
联调用 `newRole()`→`selectOver()`，没有独立的"再点一次才确认"步骤）；spec 文档写的"确认=再次
点击/回车"更接近 Ruffle 测试时观察到的悬停(`over()`加徽章)+点击体验描述，与本项目既有的
"选中→再点/回车确认"两段式交互（`__shellSelectHero`/`__shellConfirm` 分离钩子）并不完全一致。
brief 明确"功能不变"，本棒**保留既有两段式交互**（只重做视觉），未改回 AS3 的单击即触发——这是
一处刻意的 Adapted（既有产品行为优先于逐字还原单机点击语义），已记录不擅自回退。

顶部徽章定位 `badge.x = btn.x - 50, y = 40` 是 SelectRole 自身坐标系里唯一的运行时布局公式，
直接复用（换算到我方素材像素空间后的常量见 §3）。

## 2. S2 — timeline 皮（`OtherMat1.swf` → `DefineSprite_1012 export.SelectRole`）

`tools/selectrole-origins.py`（改自 `tools/worldmap-deco-origins.py`，同一套"沿 PlaceObject
矩阵链递归到 shape bounds"方法）读 `OtherMat1.swf` 的完整 swf2xml，定位：

| 符号 | chid | SymbolClass | 说明 |
| --- | --- | --- | --- |
| DefineSprite_1012 | 1012 | `export.SelectRole` | 整个五格容器 |
| DefineButton2_985/991/996/1002 | 985/991/996/1002 | — | 悟空/唐僧/猪八戒/沙僧按钮，up=灰(带 ColorMatrixFilter)/over+down=彩(同一份子符号，无 filter) |
| DefineSprite_983/989/994/1000 | 983/989/994/1000 | — | 四个按钮各自的面板美术（红底渐变+彩色立绘+书法名） |
| DefineSprite_1011 | 1011 | — | 第五格"???"，静态 PlaceObject3 常驻同一 ColorMatrixFilter，无按钮态（永远灰，无法选中，AS3 也没有 btn5） |
| DefineBitsLossless2 | 11 / 14 | `1P` / `2P` | 徽章位图，84×84，AUtils 按类名反射取用 |

**关键真发现**：原版"灰度立绘"不是单独烘焙的灰图素材，而是运行时对**同一份彩色美术**加
`ColorMatrixFilter`（标准亮度去色矩阵 `0.3117/0.6155/0.0828`）实现的——up 态记录带这个 filter，
over/down 态记录**引用同一个 characterId**但不带 filter。之前 meta-shell 棒挖到的
`select_role_bg.png` 之所以全灰，是因为 FFDec 静态渲染默认按 up 态出图；本棒额外单独导出了
over 态，第一次拿到真·彩色/红底面板美术。

### origin 表

`bounds()` 递归到 983/989/994/1000/1011 各自局部坐标系，origin 分数 = (-Xmin/W, -Ymin/H)：

| 符号 | 局部尺寸(px) | origin | 备注 |
| --- | --- | --- | --- |
| panel1_wukong (983) | 263.0×1066.4 | (0.491, 0.500) | 近似形心锚定，非左上 |
| panel2_tangseng (989) | 255.0×1066.4 | (0.523, 0.500) | |
| panel3_bajie (994) | 276.4×1066.4 | (0.500, 0.500) | |
| panel4_shasheng (1000) | 284.1×1066.4 | (0.526, 0.500) | |
| panel5_mystery (1011) | 258.2×1066.4 | (0.529, 0.500) | |

五个 origin 都落在 (0.49~0.53, 0.50) 一线——即全部面板美术是**以自身形心为局部原点**摆放，
不是左上角（playbook 三条纪律 #1 命中：不可默认 origin=(0,0)）。

### origin/placement 的一处坑（记录，供下一棒复用）

analytic 方法（"780 twips 直接换算" 那套）在算 panel 在整行画布里的**最终像素位置**时踩了坑：
`SelectRole` 整体的 swf2xml 聚合 bounds（ymin=-188.65px）与逐层应用 `BUTTONRECORD` 内部矩阵 +
`SelectRole` 对 `btn1` 的 PlaceObject 矩阵算出的 panel1 局部→全局变换，理论上应算出 panel1 顶部
恰好等于聚合 ymin（validated，二者一致，-188.55 ≈ -188.65）——但这个数字转成 FFDec 实际导出的
1014×1077 画布像素坐标后，跟真实画布不吻合（差了约 170px）。根因推测：FFDec 给"带 filter 的
sprite"导图时画布会按 filter 潜在扩展量额外加padding，不是纯 shapeBounds 决定画布尺�寸——这
在 twips 数学里推不出来。**最终改用经验对齐**：把每个按钮的 `1_up.png` 单独导出图，跟整行灰度
合成图做归一化互相关（`numpy`，`np.abs(patch[alpha]-up_arr[alpha]).mean()`）找最佳偏移，四个面
板均在 ±1px 内锁定唯一最小值（diff 2.4~4.1，接近 0，即像素级重合）：panel1 offset=(5,5)，
panel2=(190,5)，panel3=(372,5)，panel4=(549,5)。playbook 的"origin 必算"仍然成立（形心锚定的
结论是真的、也用在了理解 AS3 坐标系上），但**最终落地到具体像素合成时，经验互相关比纯 twips
解析更可靠**——建议后续屏遇到"symbol 带 ColorMatrixFilter/其他滤镜"时，直接用互相关兜底，不要
只信 analytic 换算。

## 3. S2 — 资产合成（`game/tmp/s2s3-build/*.py` 内联脚本，产物已进 `game/public/assets/extracted/menu/`）

- `select_role_idle.png`（942×619）：FFDec 原生渲染 `DefineSprite_1012` 得到 1014×1077 画布，PIL
  非透明 bbox 裁剪到 (15,175)-(957,794)。与 meta-shell 棒的裁剪结果**完全一致**（同一份原始渲染，
  交叉验证方法无误）。
- `select_role_selected_wukong.png`（942×619）：同一张 1014×1077 原始画布，先把 `985/2_over.png`
  （悟空彩色/红底态）贴到偏移 (5,5)（互相关锁定值），再做**同一个**裁剪矩形 (15,175)-(957,794)，
  保证两张图逐像素同坐标系，运行时零额外对齐代码。
- `badge_1p.png`：直接导出 chid=11（`1P`），84×84，未加工。徽章像素位置换算：AS3
  `badge.x=btn.x-50, y=40`（SelectRole 局部坐标）→ 用 panel1 offset 反推的仿射
  `canvas_px = local_px + (16.29, 193.55)` → 减裁剪偏移 (15,175) → **(69, 59)**（cropped 942×619
  坐标系）。贴图验证（`select_role_selected_wukong_badge_test.png`）与
  `selectrole-original-1p.png` 目视位置吻合，采用。
- 面板 2/4 的彩色态（`select_role_selected_panel{2,3,4}_refonly.png`）顺带生成，**未接入运行时**
  （仅悟空可选），留作将来解锁其他角色时的现成素材，已在 `game/tmp/`（不进 git，按约定）。

## 4. S2 — 场景实现（`game/src/scenes/CharacterSelectScene.ts`，全量重写）

- 舞台映射：`ART_W=942 ART_H=619`，`scale=540/ART_H≈0.8724`，`offsetX=(960-ART_W*scale)/2≈69.1`，
  contain-fit + 左右 pillarbox，**未做 cover 裁切**（playbook 纪律 #2，S1 棒因违反此条被打回，本
  棒直接照抄该定式）。
- 删除：金边框、"选择角色"大标题、副标题、返回/确定按钮条、悟空格里叠的独立 sprite——全部移除，
  改成两张整行贴图（idle / selected-wukong）+ 一个徽章 image 的简单状态切换，无运行时逐格拼合。
- 保留（功能不变）：仅悟空可选，其余四格"敬请期待"半透明遮罩+文字（原版本身没有这个遮罩——
  原版四格本来都能选——这是本项目"暂缺其余角色玩法"的功能性遮罩，不是样式发挥，brief 明确
  "仅悟空可选其余灰锁（现状功能不变）"覆盖了这条）。
- 交互：`onPanel1Click`——未选中时选中（切贴图+显示徽章），已选中时确认；Enter 仅在已选中时确
  认；新增 Esc 键（无可见按钮，纯键盘）返回存档选择，避免"删掉按钮条"后无路可退，不违反"无按
  钮条"的样式要求（不可见控件不算按钮条）。
- 钩子不变：`__shellScene/__shellSelectHero/__shellConfirm`，行为契约与 meta-shell 棒一致（浏览
  器实测：`__shellSelectHero(2)` 对锁定角色是 no-op，`__shellConfirm()` 不依赖是否先选中，均保
  留原语义）。

## 5. S3 — 素材来源与"图量"声明

`docs/reference/zmxy-online-extracted/README.md`（"未收录"节）已记录：Online 的存档面板
（`export.saveInterface.SaveInter` 等）是纯矢量+TextField 拼接，FFDec 位图导出器天然抠不出完
整贴图，此前棒已跳过，本棒复核结论一致——**没有可用的符号级真源**，改走 brief 允许的"按参照图
量版式"路径。所有坐标/颜色常量在 `SlotSelectScene.ts` 顶部注释标注"图量"，来源
`docs/reference/user-flow-refs/saveslots-original.png`：

| 常量 | 值 | 来源 |
| --- | --- | --- |
| 面板 header 灰 | `#6e6e6e` | 采样标题条背景像素 `(750,345)`→`#747474`，取整 |
| 面板 body 灰 | `#242424` | 采样卡片间隙像素 `(750,530)/(750,780)`→`#262626` |
| 卡片底色 | `#0d0d0d` | 采样卡片内部非文字区 |
| 编号橙 | `#c36a3d` | 采样数字"1"描边核心像素 `(395,470)`→`#c06c3f`，多点平均 |
| 关闭 X 红 | `#e0392a` | 目视比对参照图右上角红叉（造梦Online主菜单同款配色，未逐像素采样，取常用鲜红） |
| 面板/卡片/网格几何 | 见文件顶部常量块 | 在 900×520 裁剪窗口内量测 header/卡片/间距比例，按比例套用到本项目 900×456 面板尺寸（与既有实现同尺寸，只换皮） |

## 6. S3 — 场景实现（`game/src/scenes/SlotSelectScene.ts`，全量重写）

- 双色调面板：header 浅灰条（圆角仅上两角）+ body 深灰（整体圆角），无金边框、无金色描边——
  完全移除旧实现里的 `0x4a2c12`/`0xd9b45a` 金色描边体系。
- 卡片：近黑圆角矩形，左侧大号橙色编号，右侧**两行**文字（角色名 / 时间戳）。**主动删除**了旧实
  现的第三行游戏时间与等级后缀——参照图卡片只有两行内容，spec 原文"卡内两行"，多一行即样式发
  挥，Adapted/Dropped 记录：`playtimeSec`/`level` 数据仍在 `SlotSummary` 里，只是不再渲染到卡面。
- **主动删除**了旧实现的圆形头像（悟空头像裁切）——参照图六张卡片无一张带头像/立绘，纯文字+编
  号，同上原则去掉，不是"漏做"。
- 删除按钮（`✕`，右上角小字）：参照图**没有**可见的逐卡删除入口，但本项目功能判据要求
  "6 槽增删读"必须保留；做了一个克制的小号灰字 `✕`（非金色/非红色常驻，仅 hover 变红），不与
  参照的视觉语言冲突，记录为功能性补充而非样式发挥。
- 空槽：同一套卡片壳，仅显示"空存档位"，去掉旧实现的"＋"图标（参照图空槽长什么样未知——
  Online 六槽全部有存档——这里延续现有留白风格但去掉与"两行" spec 不符的额外符号）。
- 钩子/存储层完全未动：`saveSlots.ts`/`save.ts` 零改动，`__shellSlots/__shellNewGame/
  __shellContinue/__shellDeleteSlot/__shellAskDelete/__shellCloseConfirm/__shellRefreshSlots`
  全部保留且浏览器实测通过（见 §7）。

## 7. 验收证据

### 7.1 单测 + 构建

```
npx vitest run  → 36 files / 413 tests passed（基线 413，零新增测试文件——
                   本棒只动渲染层，saveSlots/save 等纯逻辑模块零改动，无需新增用例）
npx tsc --noEmit → 0 错误
npm run build    → 通过（vite build, 1.85MB bundle，既有警告未恶化）
```

### 7.2 浏览器实测（Playwright, 960×540, `localhost:5197` 独立 dev server）

流程screenshot（`game/tmp/s2s3-flow/`）：
1. `1-mainmenu.png` 主菜单
2. `2-saveslots-empty.png` S3 六槽全空
3. `3-charselect-idle.png` S2 未选态（全灰五格）
4. `4-charselect-selected.png` S2 选中态（悟空红底彩色+1P徽章）
5. `5-worldmap-after-confirm.png` 确认后落地世界地图（S1 milestone 未受影响）
6. `6-saveslots-occupied.png` 回到 S3，slot1 显示"孙悟空 + 时间戳"（存档回环验证）
7. `7-delete-confirm.png` 删除确认弹窗（原样保留）
8. `8-locked-select-noop.png` 对锁定角色调用 `__shellSelectHero(2)` 确认 no-op（仍是未选态）

功能实测逐条：
- `__shellNewGame`→S2→`__shellSelectHero(1)`→`__shellConfirm()`→落地 `worldmap`：✅
- `__shellSelectHero(2)`（锁定角色）：no-op，视觉不变：✅
- 键盘 Enter：未选中时无效（仍在 charselect）；选中后确认并跳转：✅
- 键盘 Esc：从 charselect 返回 slotselect：✅
- 存档持久化：新建 slot0 后返回 S3，卡片正确显示"孙悟空 2026-07-08 03:55"：✅
- 删除：`__shellAskDelete(0)`→`__shellDeleteSlot(0)`→`__shellCloseConfirm()`→六槽回空：✅
- 控制台报错：仅 pre-existing 的 `favicon 404` 与 `ws://localhost:5181` (agent-server 未启动)，
  与本棒改动无关（改动前后一致）。

### 7.3 Overlay（`game/tmp/s2s3-overlay/`，方法按 playbook 纪律 #3：先切参照图游戏区再等比缩放对齐，
不直接重采样整张截图）

**S2 idle**：参照图 `selectrole-original-idle.png`（958×744，含 Ruffle 窗口标题栏+菜单栏）按行
暗度剖面切出游戏区 rows 96–739（纯色阈值 mean<60），等比缩放到我方画布面板矩形 (69,0)-(891,540)
再 blend/diff。`|diff|≥40` 占比 **17.2%**；`s2-idle-diff.png` 目视确认无双影（面板边框/人物轮廓/
名字均单线对齐），高亮区集中在我方新增的"敬请期待"遮罩文字（参照图没有，功能性差异非几何错位）。

**S2 selected**：参照图 `selectrole-original-1p.png`（966×664，已接近无窗口铬，rows 14–657）同法
对齐。`|diff|≥40` 占比 **20.1%**；`s2-selected-diff.png` 确认红底/彩色悟空/1P 徽章/五格边框均单
线对齐、无双影，高亮同样集中在"敬请期待"遮罩（参照图 1P 场景里唐僧等格仍是普通灰态，无遮罩文
字，属预期功能性差异）。

**S3（结构层）**：参照图 `saveslots-original.png` 裁到对话框区域 (332,310)-(1179,794)，等比缩放
到我方面板矩形 (30,42)-(930,498)。`|diff|≥40` 占比 **12.0%**；`s3-blend-50-50.png` 目视确认标题
居中位置、6 张卡片网格坐标、编号左对齐位置均对齐良好；差异主要来自内容不同（参照图六槽均有演
示存档数据、我方截图仅 slot1 有数据，文字内容天然不同不是几何误差）。

三组 diff 均无"整体平移双影"（S1 棒打回的那种签名），几何对齐判定通过。

## 8. Adapted / Dropped 清单

| 项 | 类型 | 说明 |
| --- | --- | --- |
| S2 单击即确认（AS3 单机语义） | 保持现状（未回退） | 项目既有两段式选中/确认交互优先于逐字还原，§1 已记录 |
| S2 悟空格"敬请期待"遮罩 | Adapted（功能性） | 原版四格全部可选，本项目仅悟空可选，遮罩是功能补充非样式发挥 |
| S3 卡片仅两行（去掉等级/游戏时间/头像） | Dropped | 参照图卡片只有编号+两行文字，无头像；数据仍在 SlotSummary，只是不上卡面 |
| S3 删除按钮 | Adapted（功能性） | 参照图无可见入口，本项目需要保留删除功能，做了克制的小号灰字按钮 |
| S3 面板/卡片几何常量 | 图量 | 无符号级真源（矢量拼接界面），按参照图比例测量后套用，§5 逐条标注 |

## 9. 遗留 / 交接

- S2 面板 2-4（唐僧/猪八戒/沙僧）的彩色"over"态图片已生成（`game/tmp/`，未入库），未来解锁多角
  色时可直接用 `tools/selectrole-origins.py` 同一套 offset 表接入，无需重新挖 SWF。
- S2 第五格"???"角色在 AS3 里完全没有交互入口（无 btn5），符合"敬请期待"锁定语义，非本项目遗
  漏。
- S3 参照图空槽长什么样未知（Online 截图六槽都已存档），本项目空槽样式（"空存档位"文案+同款卡
  片壳）是延续过往实现的合理外推，非参照图直接来源。

## 10. 终审返修（2026-07-08，主会话终审后本棒就地收尾）

终审结论：S2 两态全过，未动。S3 打回一项：`s3-diff.png` 里六个橙色编号 + "存档记录"标题全部
双影，判定是两个"图量"常量没量准（不是网格/卡片本体的问题——卡片边框/网格坐标本来就对齐）。

### 方法：把 §7.3 那套"先切参照图游戏区再等比对齐"的 overlay，从目视判读升级成加权质心互相关

之前 §7.3 的 diff 百分比够用于判断"有没有整体错位"，但不够精确到"该挪几像素"。返修改用**加权
质心**（不是简单像素 bbox min/max，那对反锯齿边缘噪声敏感）：橙色数字用"橙色偏离度"当权重
（`r-(g+b)/2`），标题白字用"偏离局部背景中位数的灰度差"当权重，对参照图裁剪对齐版与我方截图
分别求质心，直接相减得到需要挪的像素量——不用再靠肉眼猜方向。

### 测出的偏移 + 修法

| 元素 | 返修前残差 (dx, dy) | 修法 | 返修后残差 |
| --- | --- | --- | --- |
| 编号 slot1 | (+13.8, -1.9) | 数字文本 x 从 `left+34` 改 `left+47`（两个槽平均 dx≈+12.6，四舍五入取 +13，Y 残差在噪声内未动） | (+0.8, -1.9) |
| 编号 slot2 | (+11.4, +1.6) | 同上（统一常量，非逐槽单独调） | (-1.6, +1.6) |
| 标题"存档记录" | (-0.7, +5.6) | 文本位置从 `(W/2, PANEL_Y+HEADER_H/2)` 改 `(W/2-1, PANEL_Y+HEADER_H/2+6)` | (+0.3, -0.4) |

三项返修后残差全部 <2.3px，达标（目标 <3px）。`s3-blend-50-50.png` 重新生成后目视确认：六个数字
和标题均单线对齐，无双影（原本的重影问题在 diff 图里已看不到，`s3-diff.png` 上数字/标题只剩细
描边级差异，卡内文字区域的高亮差异是内容不同——参照图六槽是演示数据，我方截图仅 slot1 有真实
存档——不是几何误差）。`|diff|≥40` 占比从 12.0% 微降到 11.6%（这个指标本身对"文字内容不同"不
敏感，主要看质心残差和目视）。

### 关闭 X 位置核查（结论：参照图的红叉不属于存档对话框）

`docs/reference/user-flow-refs/saveslots-original.png` 里的红叉实测坐标 (1192.9, 242.9)（全图
1516×982），红通道质心法定位。核对上下文（`game/tmp/s2s3-overlay/dbg-topright-fullctx.png`）发
现：**这个红叉压在右侧常驻竖排菜单条上方**（"造梦...online·大闹天庭篇"文字左侧、"新的开始"菜
单项正上方），不在中央"存档记录"对话框的可见范围内（对话框 bbox 是 (332,310)-(1179,794)，红叉
y=242.9 在对话框顶部 310 以上 67px，且 x=1192.9 也超出对话框右边界 1179）。也就是说：这个红叉
是整个右侧菜单面板的常驻关闭按钮，不是存档对话框自己的关闭控件；原版存档对话框本身是否有专属
关闭入口，这张参照图看不出来（很可能是同一个红叉承担多态关闭语义，随当前弹出的是哪个面板变化
含义，但像素位置不变）。

本项目 S3 场景没有对应的"常驻右侧菜单条"结构（那是主菜单/存档弹窗分层设计之外的另一套布局，
不在本棒范围），所以逐像素对齐参照图的红叉坐标没有意义。**保留原设计**：红叉在我方对话框自己
的右上角（`PANEL_X+PANEL_W-10, PANEL_Y-22`），代码里补充了这一发现的注释说明，不做坐标改动。

### 证据

- `game/tmp/s2s3-overlay/s3-{ref-aligned,ours-crop,blend-50-50,diff}.png`（重新生成，覆盖返修前
  版本）
- `game/tmp/s2s3-overlay/dbg-title-anaglyph-3x.png`（返修前红/绿双色叠加图，直观显示标题的
  縦向偏移方向，用于交叉验证质心法结果不是算法 bug）
- `game/tmp/s2s3-overlay/dbg-topright-fullctx.png`（关闭 X 上下文截图，证明其属于右侧菜单条）
- `game/tmp/s2s3-flow/6-saveslots-occupied.png`（重新截图，slot1=孙悟空+时间戳）
- 回归：`npx tsc --noEmit` 0 错误、`npx vitest run` 413/413 全绿、`npm run build` 过（返修只动
  两个文本节点的坐标常量，不触碰任何逻辑）

### commit

`fix(slotslot): tune S3 numeral/title position against reference centroid` — 本地 commit，未
push。

## 11. commit 列表

见 `git log`（本棒 commit，均未 push）：
1. `tools(selectrole-origins): add SelectRole panel/badge origin script`
2. `assets(menu): extract SelectRole idle/selected + 1P badge art`
3. `feat(charselect): rebuild S2 as full-bleed five-panel row`
4. `feat(slotselect): rebuild S3 as Online-style save card grid`
5. `chore: drop superseded select_role_bg/name_wukong assets`
