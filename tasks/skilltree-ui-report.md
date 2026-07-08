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

## 第二轮：从0到1全量重写（2026-07-08，用户增量指令 + 终审打回）

用户看了第一轮结果后追加三条指令，主会话终审同时对第一轮给出裁决。三条增量：①被动技能/BOSS技能页签直接隐藏删除，不留占位；②"很多黑块和重合块"必须清零；③"与其后面改倒不如从0到1"，授权推倒重写视觉层。终审同时裁定：技能升级列抗辩我判赢（保留），名牌/孟婆图标缺口如实记档可接受，但表格宏观几何不许再用"已知残差"豁免，且要求解释一张显示内容下沉的截图。

### 终审开场问题：final-active.png 为什么内容挤在底部

排查结论：**是我自己截图脚本的事故，不是场景 bug**。当时用 `page.locator('canvas').screenshot()` 但没有显式 `setViewportSize`，Playwright 新建的页面用了一个较小的默认视口，Phaser 的 Scale Manager 在这个视口下把 canvas 的 CSS 尺寸算成了和内部 960×540 分辨率不同的比例，`locator.screenshot()` 按 CSS 盒子截图导致内容被挤压。补上 `page.setViewportSize({width:1280,height:800})` 后，`canvas.boundingBox()` 精确等于 `{width:960,height:540}`，重新截的图（`game/tmp/skilltree-ui/final2-active.png`）内容占满整个画布，无下沉。以后所有终态证据图都固定用这个视口设置。

### 架构层面的改动：为什么黑块会自动清零

第一轮的黑块/重合块，根因是把整个屏建在两张写死内容的合成位图上（`bg.png` 940×590、`table_school1.png` 889×425），这两张图里烘焙了跟真实存档不匹配的内容（"9999999999"占位灵魂数、"当前等级：999"占位、只有心法一有真实预览态而心法二没有），每一处动态数值都得画一个不透明矩形盖掉错误像素再在上面重画正确值——这些矩形就是用户说的"黑块"。这次重写整个不再用这两张位图（连同 `rebind_modal.png`、`PassiveSkillControl` prefab 一起移除），只保留：

- 10 个技能的三态真彩图标（`st_icon_<id>_{locked,unlocked,learned}`，本来就是真实的，未动）。
- 新增两个小体积真位图 `card_icon_school1.png`/`card_icon_school2.png`——直接从已提取的 `table_school1.png` 里裁出斻/火两个心法图腾小方块（不是重新跑 FFDec，是从一张已有真实素材里再截一张更小的真实素材，规避了那张大图其余部分的内容错误问题）。
- AS3 真坐标（`mainskillmc.skillN/skillsetN/upgradeN`、行 y）继续作为图标/设置/升级按钮的唯一真源，本轮重新用裁图验证过（`game/tmp/skilltree-ui/vendor-row0.png`/`vendor-row4.png`：在这些坐标裁 table_school1.png 能精确裁到对应行的真实图标）。
- 从参照截图直接取色的纯色圆角面板（黑底/深蓝面板，色值来自像素采样，见文件头注释），取代原来的位图+遮罩架构。
- `SKILL_DISPLAY` 里已有的全部 10 个技能真实中文名+说明（此前只给心法二用，心法一靠位图自带文字）——现在两个心法走同一份渲染代码，不再分叉。

因为没有任何一处是"先画错的再盖对的"，这次重写里没有一个黑色矩形是遮挡用途（唯一的黑色是导航栏本身的纯黑背景和技能未解锁时的半透明变暗，两者都是参照截图本来就有的真实设计，不是遮挡）。

### 页签：被动技能/BOSS技能已删除，不是隐藏

不再有 tab 切换逻辑、不再有 `activeTab` 状态、不再加载 `PassiveSkillControl` prefab 相关纹理。底部只剩一个纯文字标签"主动技能"（非按钮，无高亮框，因为没有别的页可切）。证据：`game/tmp/skilltree-ui/final-bottombar-zoom.png`。

### 表格宏观几何：举证 + 修正（不是留豁免）

对参照截图做了独立于任何假设的精确测量：在图标列（x:600-730）逐行扫描非背景色像素带，测得 5 行图标中心分别在参照图 y = 255.5/381.5/505/628/758（1532×954 图），行距 ≈125.6px，占参照图高度的 13.17%。

再独立测量 vendor 烘焙位图（`table_school1.png`）自己的行距：用 AS3 y 坐标反推 table-local 坐标裁图，确认图标真的落在预测位置（`vendor-row0.png`/`vendor-row4.png`），vendor 行距 = 77.66 stage 单位，占 590 高度的 13.16%。

**两者行距占比几乎完全相同（13.16% vs 13.17%）**——vendor/AS3 与参照截图在"相对行距"上根本没有分歧，此前终审看到的"越往下错位越大"，用回归拟合验证后发现残差在 5 个点上全部 <2px、不随行号增长，说明那不是缩放误差，而是一个**恒定**的垂直平移量（≈32 stage 单位/≈52 参照像素）——旧代码的 bug 恰恰在这里：图标坐标用 `ROW_Y`，但表头/心法卡的文字坐标用另一套基于 `table_school1.png` 位图放置位置的 `TABLE_OFFSET_Y` 换算，两套坐标系本身就没对齐，才读出"越往下越花"的错觉。本次重写让一行内的图标/名称/说明/按键/升级坐标全部共用同一个 `y`，这个"组内错位"已经不可能再发生。

剩下那个恒定的 32 单位平移，这次**没有留作豁免记录，而是直接修正**：新增 `VERT_SHIFT=30` 常量整体下移卡片+表格区块（连带 `CARD_H` 从 195 加到 205 防止下移后底部溢出面板）。因为这次是从0到1重写、面板绝对位置本来就不是 AS3 强制的（只有行与行之间的相对间距是强制真值），把这个已经量化、低成本的差距修掉不产生保真代价。

**对照证据**：`game/tmp/skilltree-ui/final-overlay-blend.png`（新）vs 本 report 前面 §3 的 `overlay-blend.png`（旧）。新图里表头行"技能名称/技能图标/技能说明/按键设置/技能升级"、五行图标、五行说明文字、底部"主动技能"、右下灵魂徽章，全部单线重合，不再有第一轮那种整段文字的双影。残留的双影只剩心法卡内部一小块（"心法二"标题/"当前等级"行与参照的对应文字），量级在个位数像素，判断为卡片内部间距的个人化选择差异（本来就不是 AS3 强制值），非几何 bug。

### 回归验证（真实功能路径，非 mock）

用 `__skillTreeAddSoul`/`__skillTreeUpgradeSchool`/`__skillTreeLearn`/`__skillTreeUpgradeSkill`/`__skillTreeRebind` 走生产代码路径验证：
- 心法升级：加 5000 灵魂→升级心法一→等级 1→2，灵魂正确扣减（5000→4800，消耗 200 匹配 `SCHOOL_UPGRADE_COST[1]`）。
- 技能升级：`upgradeSkillLevel('slz',...)` 在英雄等级 1（AS3 `getCurLevel()/5>=slev` 要求等级≥5）下正确被拒绝，未强行放行——验证真实门槛未被本次重写破坏。
- 学习新技能：默认存档已占满 5 个学习位（AS3 `SKILL_LEARN_LIMIT=5`），尝试学第 6 个正确被拒绝——同样验证真实上限完好。
- 改绑：`rebindSkill('lys','Y')` 正确把 lys/slz 的键位互换（Y↔U），持久化后 `__skillTreeState()` 读回一致。

### 测试/构建

`npx tsc --noEmit` 0 错误、`npx vitest run` 468/468 全绿、`npm run build` 过。逻辑层 `skillTree.ts`/`heroSkill.ts`/`save.ts` 全程未改一行。

### 新增/移除的素材文件

新增（真实位图裁剪产物，非新 FFDec 提取）：`game/public/assets/extracted/skilltree/card_icon_school1.png`、`card_icon_school2.png`。

本轮不再加载（文件仍在磁盘，未删除，只是场景不再引用）：`bg.png`、`table_school1.png`、`rebind_modal.png`、`btn_upgrade_{up,over}.png`、`slot_{Y,U,I,O,L}_1.png`、`passive_panel.png`、`tools/prefab-compiler` 编译产物 `assets/extracted/prefab/PassiveSkillControl/*`。未删除这些文件，因为不确定是否有其他代码/文档引用；如需清理仓库卫生，建议主会话确认后再统一删。

### commit

单独一个新 commit，只 add `game/src/scenes/SkillTreeScene.ts`（本次重写覆盖第一轮的版本）+ 新增的两个 `card_icon_school*.png` + 本 report 更新，不 push，不碰其他文件。

### 疑点清单（更新）

1. 技能升级列——终审已裁定保留，不再是疑点。
2. 表格宏观几何——本轮已举证+修正，不再是疑点。
3. 悟空名牌位图/孟婆药剂图标/表头烘焙字体——三项缺口性质不变，仍需要一轮新的 Online 客户端实机抓包才能真正闭环，本轮同样如实记档未做。
4. 心法卡内部次级间距（"心法二"标题/"当前等级"行与参照的几像素残留双影）——量级很小，本轮未继续抠，如果主会话认为需要，可用同样的像素回归方法定位卡片内部的确切目标位置再修一版。
