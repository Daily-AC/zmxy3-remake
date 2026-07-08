# S6 主菜单微调 — 完成报告

对应 brief：`tasks/menu-polish-brief.md`。本报告为完整版，补全终审前的 AS3 坐标出处、量化 overlay 结论、诚实简化记账（此前 `ea1ca49` 提交里的同名文件是主会话在怀疑本次执行中断时抢先写的 15 行摘要，本次以此版本为准，细节更全但结论一致）。

## 改动清单

文件：`game/src/scenes/MainMenuScene.ts`（唯一改动文件）。

1. **标题栏文字重影修掉**（根因修复，非仅删字）：`title-bg.png`（Online 截图素材）左上角原图本身烘焙了一行"造梦西游online·大闹天庭篇"字样，cover-fit 缩放后落在我方右侧菜单面板区域内；面板原来只有 0.68 透明度（`fillStyle(0x0a0a0f, 0.68)`），烘焙字透出来跟我方自己画的头部文字叠在一起，就是"两行标题叠字"。改为面板完全不透明（alpha=1），彻底遮住底图烘焙字——同时也更贴近参照图（Ruffle 版面板本身接近纯黑不透光，见下方 overlay）。头部文字改为完整书名号格式 `《造梦西游·大闹天庭篇》`（原来是 `造梦西游 · 大闹天庭篇`，中圆点两侧多了空格、缺书名号）。
2. **菜单项加下划分隔线、字距版式照原版**：
   - 原来菜单项**居中**排列、hover 时才临时画一条下划线；改为**左对齐**（vendor 渲染实测文字左边缘 = AS3 `x=751.15` 到 0.15px 内，不是居中——见下方"皮的交叉验证"），每一项下方**常驻**分隔线（vendor 六行全部有，不是 hover 态限定）。
   - 去掉悬停时的 `setScale(1.06)` 缩放动画（原版没有，且会和常驻分隔线错位）、去掉文字描边 stroke（面板已不透明，不再需要靠描边保对比度，原版本身也是无描边纯色字）。
   - 字号从 30px 降到 28px，更贴近 vendor 渲染的字形比例。
3. **菜单项集合对齐 vendor**：`读取存档` → `继续游戏`（对应 AS3 `continueGame` 按钮，原标签是本地开发时的占位名，不是 vendor 命名）；顺序保持 新的开始/继续游戏/游戏帮助/关于我们/退出游戏，与 AS3 声明顺序、`showMenu()` 的 y 坐标升序（207.65 < 255 < 302.7 < 355.6 < 402.55）完全一致。造梦论坛（`btn_forum`）按 brief 省略（指向 4399 论坛外链，本地单机版无对应功能）。
   - `exposeHooks()` 里的 `__shellMenu` label map 同步改名，避免 `继续游戏` 这个新标签点不通。

## AS3 坐标摘录 + 出处

`export.GameMenu`（主 SWF AS3，`game/tmp/s5-as3/othermat-xfl/export/GameMenu.as`，来自 `docs/playbooks/ui-port-dual-source.md` 逐屏归属表标注的"GameMenu 布局主源=AS3"）`showMenu()`：

```as3
public function showMenu() : void
{
   this.simpleGame.x = 1110;      // 单人/双人子菜单按钮，屏外停泊（多态坐标陷阱：另一态 x=1110）
   this.doubleGame.x = 1110;
   this.backbtn.x = 1110;
   this.gameHelp.x = 751.15;  this.gameHelp.y = 302.7;
   this.aboutUs.x = 751.15;   this.aboutUs.y = 355.6;
   this.continueGame.x = 751.15; this.continueGame.y = 255;
   this.newGame.x = 751.15;   this.newGame.y = 207.65;
   this.btnquit.x = 751.15;   this.btnquit.y = 402.55;
   this.btn_forum.x = 751.15; this.btn_forum.y = 448.85;
}
```

这组 x=751.15（显示）/x=1110（屏外，`simpleGame/doubleGame/backbtn`）正是 `ui-port-dual-source.md` 逐屏归属表里点名的 GameMenu 多坐标陷阱实例本身（"同控件多方法多坐标"信号）。

## 皮的交叉验证：FFDec 复合渲染

只有 AS3 数字不足以定版式（不知道字号、左右对齐、分隔线样式），按 playbook Step 3 用 FFDec 把 `DefineSprite_258 export.GameMenu` 整体渲染成位图交叉验证：
`game/tmp/s2s3-extract/sprites/sprites/DefineSprite_258_export.GameMenu/1.png`（S2/S3 棒遗留产物，本棒复用未重新导出）。

该图是 FFDec 对 GameMenu 时间轴的一帧合成渲染，六个按钮全部落在其"显示态"位置——像素测量把 AS3 的 x=751.15 精确复现为文字左边缘 x=751（偏差 0.15px），证明这张图与 AS3 源同源、无冲突，可放心当皮的定量来源：

| 项 | 测量（面板局部像素，vendor stage 940×590，1px≈1 stage 单位） |
| --- | --- |
| 面板左边缘 | x=690（与既有 `PANEL_X` 巧合吻合，未改） |
| 文字左边缘（六行一致） | x=751（AS3 x=751.15，仅 0.15px 差） |
| 头部标题 bbox | y=107–123（居中） |
| 新的开始/继续游戏/游戏帮助/关于我们/退出游戏/造梦论坛 文字 bbox 中心 y | 162 / 209 / 257 / 310 / 356.5 / 403.5 |
| 分隔线（每行下方常驻，六行全有） | y=185 / 232 / 286 / 336 / 377 / 426，颜色灰阶（R=G=B），中心亮度峰值 ~89/255（≈0.35 alpha 白线过黑底），左右渐隐 |
| 分隔线水平范围 | 面板局部 x=20→~191-203（比文字左右各多出约 42px，非贴文字宽度） |

## 换算成我方画布的做法（不是直接照搬 stage 像素）

MainMenuScene 的背景是 Online 截图素材（`title-bg.png`，940×590，cover-fit 铺满 960×540），不是 vendor 的 940×590 舞台本体——这屏是"Online 底图 + vendor 版式菜单栏"的混合构图（brief 明确"现 MainMenuScene 用 Online title 底，用户指定保留"），所以不能直接照搬 vendor 舞台绝对像素，而是取**面板相对分数**再套到我方面板尺寸，几何上才不失真：

- `textLeft 分数 = (751-690)/(940-690) = 0.244` → 套到我方面板宽 270px（`W-PANEL_X`）→ `TEXT_LEFT_X ≈ 756`
- `分隔线左右各外扩分数 = 42/250 = 0.168` → `DIVIDER_PAD ≈ 45`
- 头部/各项 y 用 vendor 590 高舞台的分数换算到我方 540 高画布：头部 115/590=0.195→105；首项 162/590=0.275→148；平均步进 (255-207.65+302.7-255+355.6-302.7+402.55-355.6)/4 ≈ 48.7/590=0.0825→44.5，取整 44

（推导过程见本节表格与 `MainMenuScene.ts` 顶部注释，代码内联了同样的分数与出处，避免文档与实现漂移。）

## 已知简化 / 豁免清单（诚实记账）

- **分隔线渐变简化为纯色半透明**：vendor 原件是软笔刷渐变（中间亮、两端渐隐），本次用 `lineStyle(1, 0xffffff, 0.26)` 单一透明度直线近似，未逐像素复刻渐变笔刷纹理。判断：面板已是"微调"级任务，渐变笔刷是装饰细节而非结构差距，brief 三项差距点名的是"有没有分隔线+版式"而非渐变质感，故未过度施工。
- **纵向节奏取六项测量均值取整（44px）而非逐项还原原始抖动**：vendor 六个间距分别是 47.35/47.7/52.9/46.95/46.3（"关于我们"那一档明显宽一些），推断是 FLA 手工摆放的自然误差而非语义信息，取平均更利于我方五项等距版式的可读性，未强行复刻这处抖动。
- **未追求整屏像素级 stage 坐标 1:1**：本屏背景是 Online 素材而非 vendor 舞台重建（S1/S2 等全舞台复刻屏那种 contain-fit 940×590→960×540 严格映射在此不适用，见上节"换算做法"），故 overlay 的判据集中在"菜单栏区域相对版式"而非全画布绝对坐标，与 brief 的判据口径一致（"与 Ruffle 版 overlay（菜单栏区域）"）。

## Overlay 量化结论

流程：`docs/reference/user-flow-refs/menu-original.png`（Ruffle 窗口截图，含窗口 chrome）→ 用行亮度剖面切出真实菜单面板区域（左边缘 x=709、上边缘 y=106，方法同 S1 棒"按行/列暗度剖面切游戏区"纪律）→ 在参照截图与我方新渲染里分别独立测量头部+5 项文字行的中心 y、文字左边缘 x（各自像素测量，不依赖假设的整屏缩放系数）→ 两组点做线性回归拟合仿射变换：

- y 轴：6 点（头部+5 项）拟合，`ours_y = 0.881 * ref_y - 112.68`，残差全部 <2.3px
- x 轴：2 点（面板左边缘 + 文字左边缘）算出 `ours_x = 1.081 * ref_x - 76.15`

用该仿射把参照图整图 warp 到我方 960×540 画布坐标系（`game/tmp/s6-overlay/ref-warped-full.png`）→ 裁出面板区域（`ref-aligned-panel.png` vs `ours-panel.png`）→ 50/50 blend（`blend-50-50.png`）+ pixel diff（`diff.png`）。

结论：`diff.png` 里五个菜单项（新的开始/继续游戏/游戏帮助/关于我们/退出游戏）的文字轮廓几乎完全重合，diff 图里只剩字形抗锯齿边缘（证明配准误差 <3px，属于测量+重采样噪声，不是版式错位）；`blend-50-50.png` 里同样能看到单层清晰文字而非双影错位。头部标题行残差略大（拟合点包含头部本身，头部字体渲染引擎/字重跟原版位图字不同，属于"烘焙文字字体差异"豁免项，非坐标错误）。分隔线本身因为渐变→纯色简化，diff 里读数偏高但属于上面记账的已知简化，非几何误差。

## 测试与构建

- `npx tsc --noEmit`：0 错误。
- `npx vitest run`：**450/450 全绿**（与基线一致，逻辑层完全未动，只碰了 `MainMenuScene.ts` 渲染代码）。
- `npm run build`：过。

## 流程回归

`game/tmp/s6-flow/`：
- `1-mainmenu.png`：新版主菜单（左对齐+分隔线+单层标题+新标签集）。
- `2-click-newgame-to-saveslots.png`：`window.__shellMenu('新的开始')`（等价真实点击 `item.action()`）正确进入存档记录面板。
- `3-click-continue-to-saveslots.png`：`window.__shellMenu('继续游戏')`（改名后的新标签）同样正确进入存档记录面板，标签改名未破坏 `exposeHooks()` 路由。

另外用合成 `PointerEvent`/`MouseEvent` 直接在 canvas 真实像素坐标 (800, 148)（"新的开始"行）与 (800, 192)（"继续游戏"行）派发点击，验证了 `setOrigin(0, 0.5)` 改动后的命中区域仍落在预期文字位置上——两次都正确触发场景跳转，证明左对齐重排没有把可点击热区带偏（该验证未截图存档，属过程性检查，结论已并入本报告）。

## Commit

- `ea1ca49` `feat(menu): S6 menu-bar polish — AS3-true geometry, opaque panel (title ghosting root-fix), vendor item set`（代码 + 首版 15 行摘要报告，本地提交未 push）
- 本次补记：更新 `tasks/menu-polish-report.md` 为完整版（AS3 坐标摘录、皮的交叉验证表、换算推导、诚实简化记账、量化 overlay 结论），单独一个后续 commit，同样本地未 push。

工作树内改动只有 `game/src/scenes/MainMenuScene.ts` 一个源码文件，`git log` 可查完整 diff。
