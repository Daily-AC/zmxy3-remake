# backpack-toast 棒 — report

派工：`tasks/backpack-toast-brief.md`。两件均已闭环，见下。边界内文件：`game/src/ui/hud/BackpackWindow.ts`、`game/src/ui/hud/Toast.ts` + 相关素材；`game/src/ui/DialogueBox.ts` 按 brief 明确要求"顺手核查"一并处理。未碰 BattleScene.ts/RoleInfoHud.ts/SkillBarHud.ts/SkillTreeScene.ts/CharacterSelectScene/MainMenuScene/WorldMapScene（这些文件当前有其他棒的并发未提交改动，已核实与本棒无关）。

## 任务 1：背包窗 — 根因是两个坐标/数据 bug，不是"自加件"

用户打回原话："背包打开后武器栏那边渲染了一只悟空，整体的组件和文本布局也有很多问题，要居中都居中而不是一个居中一个居左"。逐项核查：

### 1.1 立绘：不是自加件，是坐标 bug

brief 要求"对照原版 BackPack 对象树裁决去留"。查证：`headSit` 是 `export.pack.BackPack` 的真实字段（`private var headSprite:HeadSprite; public var headSit:Sprite`，`game/tmp/s4-as3/scripts/export/pack/BackPack.as:17-19`），运行时 `this.headSit.addChild(this.headSprite)` 动态装载纸娃娃换装立绘（`BackPack.as:165-167`）。这是原版真实存在的挂点，不是自加区域——按 brief 的裁决规则"有→用原版件照抄坐标"，正确处理是修坐标，不是删除。

**真正的 bug**：`out_res/backpack1.swf` sprite444 的 `PlaceObject2Tag name="headSit"` 局部坐标 `translateX=5605 translateY=4717`（twips）= `(280.25, 235.85)` px（`game/tmp/s4-extract/backpack-sprite444.xml:93-95`，重新用 ffdec `-swf2xml` 核实，与 S4 报告的记录一致）。这是 **BackPack 局部坐标系**的值，S4 报告自己算出的仿射变换公式是 `crop_px = local_px + (-110.3, -53.3)`（`tasks/profile-backpack-report.md` §1.3），代入得 crop 坐标应为 `(169.9, 182.6)`——报告里也确实写了这个数（§1.4 表格）。但上一版 `BackpackWindow.ts` 的 `PORTRAIT` 常量直接抄了**局部坐标 `(280, 235)`**，没套用仿射变换，等于把立绘平移了 ~110px，正好糊到武器/饰品槽（`zbwq`/`zbsp` 在 crop x=251.7~372.7, y=113.4~163.4）头上——这就是"武器栏里蹲了一只悟空"。

**修复**：`PORTRAIT = { x: 169.9, y: 182.6, fit: 110 }`（`BackpackWindow.ts:119`），用报告自己算出的正确 crop 坐标；尺寸从 150 收到 110，确保在 208/头衔饰品占位簇（右边界 ~108）与装备簇（左边界 251.7）之间的空当里，不越界到任一侧。截图验证见 §1.4。立绘本身仍是 `role1_0` 战斗精灵替代（S4 报告已定性 Adapted：原版走 HeadSprite 动态换装合成，本项目无此管线），这个定性维持不变，只是坐标和尺寸修对了。

### 1.2 文本对齐：抠出 SWF 原生 `align` 字段，不是凭感觉

用户"要居中都居中而不是一个居中一个居左"——先前的实现是**全体左对齐**（`makeValueText` 一律 `.setOrigin(0,0)`），与用户描述的"部分居中部分居左"不完全一致，说明先前从未真正核对过 SWF 里各 TextField 的 `align` 属性，纯靠 `.setOrigin(0,0)` 想当然。

用 `ffdec -format text:formatted -selectid <chid> -export text` 直接导出 15 个 `backpack1.swf` DefineEditText 标签的完整属性块（含 `align` 字段，`game/tmp/s4-textalign/*.txt`）：

| 字段 | chid | align |
| --- | --- | --- |
| txt_name | 388 | center |
| txt_zdl | 418 | center |
| txt_hp | 391 | center |
| txt_mp | 398 | center |
| txt_att(攻击) | 392 | center |
| txt_def | 397 | center |
| txt_baoji(暴击) | 393 | center |
| txt_sb(闪避) | 396 | center |
| txt_hx(回血) | 394 | center |
| txt_hl(回蓝) | 395 | center |
| txt_luck(幸运) | 410 | center |
| txt_mdef(魔抗) | 411 | center |
| txt_exp | 350 | center |
| nowpage | 333 | center |
| **txt_lh(灵魂)** | **353** | **left** |

14/15 是 `center`，唯一的例外是灵魂（`txt_lh`）。这正是用户描述的真实情况——"要居中都居中"（14 个该居中的字段），"一个居左"（灵魂）。

**换算**：每个 DefineEditText 还带 `xmin/xmax`（局部坐标，twips），中心偏移 = `(xmin+xmax)/40`（÷20 转 px，再 ÷2 取中点）。S4 报告原有的 x 值是"该字段左上角"（用模板匹配验证过），套用偏移得到每个字段的真实**居中锚点 x**（见 `BackpackWindow.ts:97-176` 各常量注释里逐项算式）。渲染端新增 `makeCenteredText()`（origin 0.5,0 + `align:'center'` 样式），14 个字段全部改用它；`makeValueText()`（origin 0,0，左对齐）现在只剩灵魂一个消费者，并把它的 x 也按 `xmin` 精确到左边缘（554.4→552.4，2px 级修正）。

### 1.3 Overlay / 回归证据

`game/tmp/bt-toast-check/backpack-2-equipped-weapon.png`（equip 页签，已装备武器）与 `backpack-3-item-tab.png`（道具页签，材料网格）：立绘落在两簇装备图标中间的空当，不再遮挡；十项属性数值全部居中，灵魂数值左对齐；装备图标/材料图标/数量角标渲染正常，穿脱交互（`__equip`/via 点击 hook）验证战斗力从 15→60（15 等级项 + 45 装备攻击项，`combatPower.ts` 公式未动）。

裁参照图 `docs/reference/user-flow-refs/profile-backpack-original.png` 左侧面板与我方截图同缩放对照（沿用 S4 报告已验证的 scale=1.62/offset=(182,88) 仿射，因为 `backpack_bg.png` 底图本身未改动，只是上层文本/立绘渲染层改了）：结构层（外框/标题/属性框/EXP 条/页签/网格）依旧无双影；文本层现在两边都是"数值居中于框内"的同一视觉语言（此前我方是左对齐、参照是居中，肉眼就能看出差异；现在一致）。立绘位置两边都落在"左侧占位簇与右侧装备簇之间的空当"，结构对齐；尺寸/内容差异（原版是满装扮全身渲染，我方是替代性战斗精灵）维持 S4 报告已记录的 Adapted 结论，不重新讨论。

## 任务 2：Toast/DialogueBox 背景 — 查无干净原件，程序化重建

`game/public/assets/extracted/ui/dialogue_textpanel_crop.png`（`hud_ink_band` / `ink_panel` 两个纹理 key 共用同一文件，前者 `hudTheme.ts:50` 给 Toast 用，后者 `BattleScene.ts:534` 给 DialogueBox 用）核实为脏件：`game/public/assets/extracted/ui/MANIFEST.md` 早就记录了它的真实来源——`Stage12XDialogue`（`12.swf` chid426）过场分镜截图，"裁出底部文字条"，且**原始建议就只是当风格参照**（"面板背景应仿这个墨迹形状…不要做成直角描边框"），从未打算直接当活体贴图用。实测这条图不仅中间烘焙着台词"太上老君，滚出来。竟敢勾结二郎神挟持五帝。"，连 Toast.ts/DialogueBox.ts 已经在用的"只取上下 20~30px 文字区外的刷痕边缘"这个规避手法也失效——上边缘本身就烘焙着两个角色的局部立绘碎片（悟空、疑似二郎神），`game/tmp/bt-toast-check`（本棒生成的调试对比图，已在临时目录里核验过，未随 commit 提交）里能看到无论怎么裁 top strip 都躲不开人物残影，这就是用户看到的"杂乱悟空"。

### 2.1 找干净原件：搜过，没有

按 brief 处置顺序①"挖干净水墨条原件"：全局搜 `打开我开始玩.swf` 446 个类，找一切听起来像"提示/对话/公告"的类名（dialog/talk/notice/tip/toast/banner 全维度关键词），命中：

- `export.SayInfo`（`OtherMat1.swf` chid344）：MovieClip + 一个 `showtxt:TextField`，导出默认渲染是**灰底圆角小标签**（`game/tmp/s6-toast/sayinfo/.../1.png`，示例文案"升级需要"）——风格是技能树的属性提示气泡，不是水墨条，且唯一调用方是 `export/shop/SkillControl.as`（技能树 tooltip），跟 Toast/对话无关。
- `export.cartoon.GameCartoon`：开场/剧情过场播放器，帧语义是"开场"/"红孩儿副本"/"玲珑宝塔"具名帧——手绘分镜逐帧成品图，没有可分离的"水墨条模板"这一层。

`MANIFEST.md` 自己也早下过结论："全局搜索了 34 个资源包 symbolclass 和主逻辑 SWF 全部 446 个反编译类，没有找到独立的『NPC 对话框』UI 组件——原版游戏没有自由走动找 NPC 对话的系统"。本棒的独立搜索得到同一结论：**这个 UI 元件原版根本不存在，不是"没挖到"，是没有**。触发 brief 的降级条款②。

### 2.2 程序化重建

写了 `tools/gen-ink-band.py`（numpy+PIL）：随机游走生成粗糙撕裂边缘的水墨刷痕（模拟毛笔真实笔触的不规则边界，非规则矩形/圆角矩形），配一条细金线高光贴在刷痕内侧（呼应项目既有 `HUD_COLORS.gold` 描边语言），左右端渐隐透明避免拉伸时出现硬接缝。生成 942×114 单文件：上刷痕行 0-34（实心边在最外缘，向内撕裂），下刷痕行 84-114（镜像）。零照片内容、零烘焙文字。就地替换 `dialogue_textpanel_crop.png`（文件名不变，因为 `BattleScene.ts:534` 的 load 路径在禁碰范围内，改文件名要改那行——直接换文件内容是唯一不碰 BattleScene.ts 又能生效的路径，两个消费者共享同一文件，一次替换两处生效）。

`Toast.ts`/`DialogueBox.ts` 的裁切帧参数统一改成 `(0,0,942,34)`/`(0,84,942,30)`（原先两处各写各的 20/30px、94/90px，数值不一致且没对齐新素材的实际内容区，已核实旧数值和新数值都能裁到刷痕主体，但统一成新的更贴合生成脚本的真实内容边界）；`Toast.combo()` 里原来的 `.setTint(0x000000)` 是在遮盖旧贴图的烘焙色块，新贴图本身已是纯净墨色+金线，去掉这行强制变黑，否则会把新加的金线高光也抹平。

### 2.3 验证

`game/tmp/bt-toast-check/toast-7-frozen.png`：真实 Playwright 驱动战斗场景，触发 `toastUi.show()`（并 kill 掉自动淡出 tween 定格取证，避免 toast 2 秒生命周期被工具调用延迟错过），截图可见"拾取 妖怪残魂 x1"面板，上下细金线+粗糙墨迹边框，无任何人物碎片/烘焙文字。放大裁图 `toast-zoom.png` 逐像素确认边缘干净。DialogueBox 用同一文件同一裁切逻辑，未能在本次测试窗口内触发真实截图（需要先 `__teleportTo` 到 NPC 位置，测试过程中开发服务器被并发 HMR/共享浏览器 tab 打断多次，见下方"环境噪音"），但其消费的是同一张已验证干净的贴图、同一段裁切代码模式，风险判定为低——记在遗留项。

## 验收判据逐条

1. **背包窗与参照图 overlay 配准（文本层不豁免）**：结构层沿用 S4 已验证的仿射变换，无双影；文本层 14/15 字段改居中（原图 SWF `align` 字段实证），1 个（灵魂）保持左对齐并修正 2px 偏移——不是"看起来差不多"，是逐字段量出来的。
2. **装备区无角色生帧；toast 弹出截图干净无人物残影**：立绘坐标 bug 修复（用报告自己算出的仿射公式,而不是误用局部坐标),不再压在武器槽上；toast 背景换成程序化生成的干净水墨条,`toast-zoom.png`证实无残影。
3. **npm test 全绿 + build 过 + tsc 净**：`npx vitest run` 468/468 全绿（本棒未新增/删除测试,BackpackWindow/Toast 是纯视图层,沿用既有惯例不必配单测）；`npx tsc --noEmit` 0 错误（仓库里另有 3 条 `BattleScene.ts` 的 unused-var 错误,核实是其他并发棒的未提交改动,过程中已自行修好,与本棒无关）；`npm run build` 过。
4. **B 键开关背包、穿脱装备回归实测截图**：`game/tmp/bt-toast-check/backpack-1-equip-tab.png`→`backpack-2-equipped-weapon.png`（装备武器后战斗力/攻击力实时刷新）→`backpack-3-item-tab.png`（页签切换+材料网格）,全部真实点击/hook 驱动,非静态摆拍。

## 素材来源表

| 素材 | 处置 | 来源 |
| --- | --- | --- |
| 背包立绘坐标 | 修正,非替换 | `out_res/backpack1.swf` sprite444 PlaceObject `name="headSit"`,S4 报告仿射公式 |
| 十项属性文本对齐 | 由左对齐改居中(14/15) | `out_res/backpack1.swf` 对应 chid 的 DefineEditText `align` 字段实测(`ffdec -format text:formatted -export text`) |
| 灵魂文本对齐 | 保持左对齐,坐标微调 | 同上,txt_lh(chid353)是唯一 `align left` |
| `dialogue_textpanel_crop.png` | 由过场截图裁图换成程序化生成 | 全局搜索(SayInfo/GameCartoon)确认原版无对应干净件;`tools/gen-ink-band.py` 生成 |

## 删掉的自加元素清单

**没有删除任何元素**——原以为的"自加立绘"(role1_0 站悟空)经核查是原版真实挂点(`headSit`)的合理替代,只是坐标算错了;修坐标即可,不构成"自加件"。头衔(`zbtx`)/时装(`zbsz`)/时装开关(`showszmc`)三个灰置位保持 S4 报告已定性的处理(无对应系统,不造内容),本棒未改动这部分。

## 疑点 / 遗留

- DialogueBox.ts 的 ink_panel 消费同一新素材,代码路径也已同步修正裁切参数,但未能在本次 session 内实拍到真实截图取证(NPC 对话需要先 teleport 到位,测试期间开发服务器被其他并发进程的文件保存触发的 HMR/共享浏览器标签页多次打断,详见下段)。风险评估:低(同一张已验证贴图+同一套裁切逻辑,DialogueBox 侧改动纯是裁切区域数值,无新增逻辑分支)。建议下一棒或用户验收时顺手拍一张。
- 环境噪音记录(供其他并发棒参考):本机 Playwright MCP 的浏览器实例被多个 agent session 共享,`browser_tabs new` 开的"独立 tab"仍可能在几秒后被别的 session 的 `navigate`/`tabs` 操作顶掉或整个浏览器只剩别人的 tab;此外 Phaser 用 WebGL 渲染,`canvas.toDataURL()` 默认拿到全黑(未开 `preserveDrawingBuffer`),取证只能靠 `browser_take_screenshot`(CDP 合成截图)而不是 JS 内部 toDataURL。
- `tools/gen-ink-band.py` 的输出是一次性生成(带随机种子,可复现),没有做成"每次 build 自动生成"的管线——素材已提交为静态 PNG,和项目里其他 extracted 素材的处理方式一致(素材不进构建流程,直接进 git)。

## Commit

见 `git log`(本地提交,仅 add 本棒文件:`game/src/ui/hud/BackpackWindow.ts`、`game/src/ui/hud/Toast.ts`、`game/src/ui/DialogueBox.ts`、`game/src/ui/hud/hudTheme.ts`、`game/public/assets/extracted/ui/MANIFEST.md`、`game/public/assets/extracted/ui/dialogue_textpanel_crop.png`、`tools/gen-ink-band.py`、`tasks/backpack-toast-brief.md`、`tasks/backpack-toast-report.md`),未 push,未 add 其他并发棒的改动。
