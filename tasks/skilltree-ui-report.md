# skilltree-ui 棒：技能树屏视觉重做返修 — 实现报告

对应任务书：`tasks/skilltree-ui-brief.md`。范围：仅主动技能页，仅 `game/src/scenes/SkillTreeScene.ts`（未新增素材文件，逻辑层 `skillTree.ts`/`heroSkill.ts` 零改动）。

## 0. 方法论说明：为什么没有做新的 FFDec 提取

这次返修的 8 项差距里，多数（1/2/6/7/8）是**渲染逻辑或坐标错误**，用已提取的真实素材就能修——修的是代码，不是缺素材。真正需要"挖新原件"的三项（3 悟空名牌位图、4 孟婆药剂内嵌图标、5 表头/页签烘焙艺术字体）经查证，vendor 主 SWF 和当前 `docs/reference/zmxy-online-extracted/`（仅 battle-hud/damage-numbers/results-screens/title-menu/world-map/skill-icons 六类）都没有对应素材——这三项需要重新对 Online 客户端做一轮实机抓包+解密+FFDec 考古（数小时级别的独立任务），不是本次会话能诚实完成的量。按项目纪律"闭不了的给证据说明"，这三项改为**尽力而为的替代方案**（详见各项），并诚实记档缺口，不假装已解决。

## 1. 逐项闭环状态

| # | 差距 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 技能图标灰白无彩 | **闭环** | 根因非 ColorMatrixFilter 导出坑（S2 那种），而是渲染逻辑坑：`table_school1.png`（Symbol 736 的 FFDec 默认帧静态渲染）本身把所有技能图标都烘焙成了灰度预览态，与真实 learned/unlocked 状态无关——实机验证：全新存档默认已学的 slz（斻系第1格）在旧代码下仍显示灰图。已提取的三态真彩 PNG（`icon_<id>_{locked,unlocked,learned}.png`，逐一验证 avg saturation：learned 0.67–0.92，locked/unlocked 0–0.09，确认是真彩素材非灰图）之前只用在心法二（school-2）行，心法一（school-1）行完全依赖那张灰图静态位图。现在两个心法都无条件叠加绘制真实三态图标（100% 不透明、66×65 与烘焙格完全同尺寸，天然完全覆盖底图，无需额外遮罩）。截图证据：`tmp/skilltree-ui/final-active.png`（斻系已学 slz 显示鲜红火焰漩涡图标）、`tmp/skilltree-ui/final-school2.png`（火系烈焰闪等图标全彩）。 |
| 2 | 自加「技能升级」列 | **部分闭环 + 有据不同意** | 删除了真正自造的部分（每行常驻显示的"150"等升级花费数字——这是本文件自己画的 Text，不是烘焙像素），改为 hover 才显示的提示条，文案格式（"升级需要N灵魂"）直接对齐 AS3 `SkillControl.as:106` `sayinfo.showtxt.text`。**但保留了"技能升级"表头 + 每行"升级"按钮本身**：逐行读了 `SkillControl.as`（`upGradebtn`、`mainskillmc.upgrade1..5`、`skillupgradeFunc`、`initStudySkill` 里对 `upgrade1..5` 的 `addEventListener`），确认这是 AS3 真实按钮、真实点击处理器，`table_school1.png` 里的"技能升级"表头和"升级"字样也是这颗真实按钮的烘焙像素，不是本项目画的。参照截图没显示这列，但删除一个 AS3 verified 的真实功能入口不符合项目"真 bug 才能改，功能不能删"的移植纪律——已把判断依据和引用行号写进代码注释，供主会话终审改判。若终审认为参照截图（当年实机截图）比这次 FFDec 静态渲染更可信、坚持要拿掉这列，建议的做法是重新裁切 `table_school1.png`（去掉最右 ~99px 列）而非在代码里遮罩烘焙像素（遮罩一块纹理背景不均匀的区域会有明显接缝）。 |
| 3 | 左上角色名"悟空"位图 | **未闭环（有替代方案）**| vendor 和 Online 提取物均无此素材（见 §0）。改用已加载的场景艺术字体（`ZCOOL QingKe HuangYou`，见下）+ 金橙描边（复用 CharacterSelectScene 的描边配色惯例），文案改为"悟空"（原为"孙悟空"，两个来源都不支持"孙悟空"）。视觉上比之前的纯白系统字更接近参照的"橙黄描边艺术字牌"气质，但仍是绘制文字非位图，与参照仍有字体形状差距。 |
| 4 | 顶部提示行内嵌孟婆药剂图标 | **未闭环** | 无可用素材（搜索了 inventory/item 相关目录，无药水类图标）。文案维持原样全文照抄（沿用上一版决定），图标缺口原样记录，未新造替代图形。 |
| 5 | 表头/页签烘焙艺术字体 | **部分闭环** | 字体文件已由另一并发任务（`game/src/systems/artFont.ts`，未提交的 WIP）落地并built 好共享加载器 `ensureArtFontsLoaded()`/`activeArtFont()`（当前选中 `ZCOOL QingKe HuangYou`）。本棒复用该共享工具（未新增第二份 FontFace 注册，未改动该文件本身），把它接到本场景自己画的文字上（BOSS技能标签、悟空名牌）。**烘焙位图表头/页签（技能名称/技能图标/技能说明/按键设置/主动技能/被动技能）本身无法用新字体重排**——它们是像素，不是可重排的文本层，除非重新用 FFDec 以新字体重新烘焙美术（超出本棒范围，且原版本来就没有用这个字体，这是"情景艺术字体"方案本身给不存在原件的文字层的兜底，不是要覆盖已有真实位图）。 |
| 6 | 底部页签排布不齐 | **闭环** | 直接原因找到了：`bg.png` 逐像素扫描确认"主动技能"/"被动技能"两个烘焙标签分别占 x:[63,131]/[164,233]（101px 起点间距），旧代码的高亮框宽度 130、中心 x=95，右边缘落在 x=160，只留 4px 就顶到下一个标签——视觉读成"贴在一起"；BOSS技能的 x=305 又打破了 101px 的等距节奏，配合灰色字体，读成"隔很远"。修复：命中区/文字改用测出来的真实间距（BOSS 延续同一 101px step，x=265），BOSS技能改为与另外两个同权重的白色粗体（参照截图三个页签同权重白字，无灰化）。同时把原来的填充高亮框（本身就是本文件此前记录过的"自造 affordance"）换成贴合真实标签宽度的细金色下划线，做法与本文件既有的"心法卡不画自造选中框"原则一致。截图对比见 `tmp/skilltree-ui/tabs-after.png`。 |
| 7 | 心法卡排版对齐 | **未改动，结构判定已一致** | 参照截图两个心法都是满级状态（`当前等级：5`/`升级所需灵魂：0`），AS3 `SkillControl.as:205-212` 在 `xflevel>=5` 时 `upGradebtn.visible=false`——即参照截图里升级按钮本来就是隐藏的，无法用它验证按钮的真实位置/样式该长什么样。当前代码的标签/数值对齐（`当前等级：`/`升级所需灵魂：` 与其后数值同行左对齐，两卡一致）经检查已经自洽，未发现结构性错位，故未改动。唯一可确认的差距（字距）是参照图数字前有明显宽字距，判断为原版位图字体的字偶间距特征，无法用系统字体复刻，不修。 |
| 8 | 右下灵魂计数多余斜线装饰 | **闭环** | 逐像素定位到根因：`bg.png` 里烘焙的占位数字"9999999999"实际字形范围是 stage 坐标 x:[810,935] y:[550,565]，旧的覆盖矩形只有 y:[529,559]——上下都短了几像素，露出每个"9"字形底部的钩笔画，缩放渲染后连成一排"斜线牙齿"（不是自造的斜线花纹，是没盖干净的残字）。新矩形 x:[810,940] y:[545,571]，完整覆盖字形范围且留有余量，同时验证过不会切到左边"灵魂"金字（该文字像素在 x<810，逐像素确认过 x≥810 起始行完全干净）。修复前后对比见 `tmp/skilltree-ui/soul-zoom3.png`（干净黑底，无残留）。 |

## 2. Commit / 改动文件

只改了 `game/src/scenes/SkillTreeScene.ts`（读取了 `game/src/systems/artFont.ts`，未修改它——那是另一条并发棒的未提交 WIP，按边界要求不碰）。未新增素材文件。本 report 是唯一新增文件。commit 只会 `git add` 这两个文件，不 push，不碰 `WorldMapScene.ts`/`CharacterSelectScene.ts`/`MainMenuScene.ts`/`BattleScene.ts`/`ui/`（过程中发现这些文件被其他并发棒实时修改，已在自己的 dev server(5203)/独立 Playwright tab 上工作，未碰这些文件）。

## 3. Overlay 结论

方法：截图（960×540 canvas，裁掉左右 pillarbox，等比缩放到参照图 1532×954）与 `docs/reference/user-flow-refs/skilltree-original.png` 50/50 blend + 逐像素 diff。`|diff|≥40` 占比 25.8%（含内容差异：参照是双心法满 5/5、灵魂 138771214 的终局存档，我方是斻系1/5、火系4/5、灵魂0 的新存档——按项目既定原则"内容差异与几何差异分开看"，不作为坐标判据）。

结构判据：
- **底部三页签**：单线重合，无双影——本棒的间距/字重修复直接验证有效。
- **右下灵魂徽章**：圆形本体单线重合，无残字/斜线伪影——本棒的覆盖矩形修复验证有效。
- **技能图标列（每行）**：单线重合，无双影——图标坐标本身（`ROW_ICON_X`/`ROW_Y`，AS3 真值）此前就是对的，本棒新增的是"该不该画"，不是"画在哪"，故对齐结论延续既有验证。
- **左侧心法卡 + 表格文字整体**：存在系统性纵向错位（我方内容整体比参照低、行距略密），这是 §11.5 终审返修就已记录的"宏观缩放残差，根因未完全查清"的延续，本棒未重新排查（超出本棒 8 项范围，且该问题在表格整体定位层面，动它有较大回归面，不属于"能小范围验证"的改动）——诚实记为已知未解决项，而非新问题。

证据目录：`/private/tmp/claude-501/-Users-e0-7-projects/3930d6d1-94f5-4073-8113-7116dbfec1da/scratchpad/`（`overlay-blend.png`/`overlay-diff.png`/`final-active.png`/`final-school2.png`/`tabs-after.png`/`soul-zoom3.png`/`topleft-zoom.png`/`tooltip-test.png`），会话结束前会同步一份到 `game/tmp/skilltree-ui/` 便于主会话查阅（脚本可复现，见下方"复现命令"）。

## 4. npm test / tsc / build

- `npx vitest run`：**468/468 全绿**（无新增/无删减，逻辑层未动，与 skilltree-report.md 记录的既有 450 + 后续其他棒新增的测试一致）。
- `npx tsc --noEmit`：**0 错误**（过程中一度看到 `WorldMapScene.ts`/`systems/artFont.ts` 各一个类型错误，均在并发棒实时编辑的文件里、非本棒改动触发；复查时那两个错误已被对应棒自行修好，最终态度量为 0 错误，SkillTreeScene.ts 自身全程 0 类型错误）。
- `npm run build`：**过**（`tsc --noEmit && vite build` 完整链路，产物 1.88MB/gzip 442KB，有 chunk 过大的既有警告，与本棒无关）。

## 5. 功能回归实测（Playwright，独立 tab/context，未复用共享浏览器 tab）

流程：主菜单→新的开始→选人确认（默认悟空）→世界地图→点"学习技能"→技能树。用 `window.__shellMenu/__shellNewGame/__shellConfirm/__shellMapAction/__skillTree*` 既有验收钩子驱动，全部走真实生产代码路径。

- 主动技能页默认态：斻系1/5（slz 已学，图标彩色）、火系4/5（lys/hytj/lyfb/jdy 已学，图标彩色，官方中文名正确显示——`SKILL_DISPLAY` 已由其他并发工作补full 官方名，非本棒改动）。
- 心法切换（`__skillTreeSelectSchool`）：斻系↔火系表格内容正确切换，无残留遮罩穿帮。
- 页签切换（点击 960×540 canvas 对应坐标）：主动↔被动内容正确切换，下划线跟随移动，无内容串层。
- Hover 升级按钮：`升级需要150灵魂` 提示条正确弹出/消失，文案与 AS3 `mOver` 格式一致。
- 学习/升级/绑定既有功能：未改动对应处理器（`onLearn`/`onUpgradeSkill`/`onUpgradeSchool`/`onRebind`），本棒改动均在渲染层，未触碰这些方法体。

## 6. 疑点清单

1. **技能升级列去留**——见 §1 第 2 项，已用 AS3 引用行号写进代码注释，需要主会话终审拍板：认这颗真实按钮（保留），还是认参照截图的可见结构（裁图去掉该列）。
2. **表格整体宏观缩放残差**（心法卡+右侧表格系统性偏低/偏密）——延续自终审返修阶段就记录的未解决项，本棒未重新排查根因，建议单独起一个小棒定点排查（怀疑 `TABLE_OFFSET_Y=48.3` 或行距 `ROW_Y` 的原始测量本身有恒定系统误差，需要重新用 5 点回归复核）。
3. **悟空名牌/孟婆药剂图标/烘焙表头字体三项素材缺口**——需要新一轮 Online 客户端实机抓包+FFDec 考古才能真正闭环，本棒诚实标注未做，未硬凑替代位图冒充"已解决"。

## 复现命令

```bash
cd game && nohup npx vite --port 5203 &   # dev server
npx tsc --noEmit && npx vitest run && npm run build
```
截图/overlay 复现脚本内联在本次会话的 Playwright `browser_run_code_unsafe` 调用里（Python 端用 PIL 做裁剪/缩放/blend），未落成独立脚本文件——如需固化为可重跑工具，建议主会话拍板后再补 `tools/` 下的脚本，本棒未新增工具文件以保持"只动 SkillTreeScene.ts"边界最小化。
