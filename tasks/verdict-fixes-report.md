# verdict-fixes 棒 — 交付报告

用户 2026-07-08 拍板的三件套小修，逐件独立完成，边界内未碰 `BattleScene.ts` 与 `game/src/ui/`（只读/调用，不改）。

## 1. 怪物纵向追击最小版（`game/src/systems/monsterSim.ts`）

新增 opt-in 的 Y 轴跟随能力，默认关闭，关闭态与改动前逐位一致（regression 测试见下）。

### 改动

- `VerticalFollowConfig { enabled, speed, arriveThreshold }`：新导出类型，`speed` 标了 `TODO-verify`（Monster30 的空中追击是原版自有飞行 AI，本次没有反编译出具体纵向速度常量，沿用横向 `speed` 数量级作占位）。
- `MonsterConfig.verticalFollow?: VerticalFollowConfig`：可选字段，缺省 `undefined`。
- `MonsterInput.heroY?: number`：可选字段，缺省 `undefined`。
- `stepVertical(state, heroY, follow)`：新私有函数，`enabled=false` 或 `heroY===undefined` 时是 no-op；否则每 tick 最多逼近 `speed` px，进入 `arriveThreshold` 内即停（不来回抖动）。
- 接线点：`tickMonster` 的 `hasTarget` 分支里，`state.mode = 'chase'` 之后、判断 `attackRange` 之前调用一次 `stepVertical`——即"有索敌目标"（无论正在攻击距离内还是正在横向追赶）时才纵向逼近；`patrol`/`hurt`/`attack`/`dead`/`gone` 五个 switch-case 分支完全不触碰，行为不变。
- 没有改一行现有怪物的 X 轴逻辑/数值——`stepVertical` 调用点之外零改动，`dist`/`decisionAccMs`/`faceHero`/攻击判定全部原样。

### 测试（`game/tests/monsterSim.test.ts`，新增 5 条，整文件 12 条全绿）

1. `verticalFollow` 缺省时不生效（跑 2000ms 追击/攻击循环，`y` 全程等于初始值）。
2. 开启时逐 tick 逼近 heroY（单 tick 验证 `y: 400 -> 390`，speed=10）。
3. 进入 `arriveThreshold` 内即停，不越过 hero（`y` 停在 397，heroY=400，threshold=5）。
4. `enabled:false` 与"缺省"效果一致（`y` 不动）。
5. **回归断言**：复用既有"melee-attacks (hit1)"场景，分别用"无 `verticalFollow` 字段"和"`verticalFollow.enabled:false`"两种 cfg 各跑一遍，断言 `mode`/`action`/`x`/`y`/`attack-start` 事件与改动前的原始断言完全一致（`x` 停在攻击前的 500，`y` 停在初始 400）。

### 接线 API（留给渲染层棒，不在本棒范围）

`BattleScene.monsterConfigFor()`（`game/src/scenes/BattleScene.ts:1065`，本棒未改）目前构造 `MonsterConfig` 时不传 `verticalFollow`——保持关闭即是零改动。要让第一关攀爬段的 Monster30 真的纵向追人，接线棒需要做两件事：

```ts
// 1. monsterConfigFor 里按怪物种类打开开关（例如 species === 'monster30' 且
//    当前处于攀爬段时）：
private monsterConfigFor(species: string, stats: MonsterStats): MonsterConfig {
  return {
    // ...既有字段不变...
    verticalFollow:
      species === 'monster30'
        ? { enabled: this.isClimbing, speed: 7, arriveThreshold: 20 } // speed 沿用横向数值占位，见 monsterSim.ts TODO-verify
        : undefined,
  }
}

// 2. 每帧 advanceMonster 调用处（BattleScene.ts:1636 附近）把 hero 的真实 y 传进去：
const events = advanceMonster(
  monster.state,
  { heroX: hero.x, heroY: hero.y, heroAlive: hero.alive, incomingHit },
  dtMs,
  monster.config,
)
```

`isClimbing` 沿用 prefab-compiler 棒已经落地的攀爬段标志（`tasks/prefab-compiler-report.md` §C1 的 `startClimb()`/`finishClimb()`）。渲染层还需要让怪物的 Phaser sprite 读 `state.y` 更新位置（目前 BattleScene 里怪物精灵大概率只绑定了 `state.x`，需要确认并补上 `sprite.y = state.y` 或等效绑定——这一步本棒没有验证，因为不能碰 `BattleScene.ts`）。

## 2. huodongbtn 置灰（`game/src/data/worldmapNodes.ts`）

**发现：这条在本棒开工前已经是目标状态**——`worldmap-report.md` 棒当时就已经把 `huodongbtn` 做成 `enabled:false`（原位贴图+灰度 tint 0x8a8a8a+alpha 0.75）+ 点击 `this.toastUi.show('敬请期待', ...)`（主题 Toast 组件，非原生弹窗）。核对了 `WorldMapScene.ts:240-265` 的渲染/点击逻辑，与本单验收判据逐条比对：按钮位图原位保留 ✓、灰态处理与地图其他置灰项统一（同一个 `GREY_TINT` 常量）✓、点击走 Toast 组件 ✓。

本棒唯一补的是**代码注释**（验收判据 4 明确要求"注明原版语义=难度切换"，之前只在 `tasks/worldmap-report.md` 里记录，代码本体没有）：在 `worldmapNodes.ts` 的 `huodongbtn` 条目上方加了注释，写明 AS3 真实语义（`huodongClick()` 切 `gc.difficulity` 难度，不是活动面板）、拍板结论、日期，不改任何行为/坐标/贴图。

## 3. 删 S2 选人屏第五格自加标签（`game/src/scenes/CharacterSelectScene.ts`）

- `LOCKED_PANELS` 从 `[1,2,3,4]` 改为 `[1,2,3]`，`LOCKED_LABEL` 同步去掉 `'？？？'` 一项。
- 效果：唐僧/猪八戒/沙僧（AS3 里有真实 `btn2/btn3/btn4`，只是本项目功能范围内锁定）继续显示"敬请\n期待"覆盖文字 + 点击 toast；第五格"???"（AS3 `DefineSprite_1011`，无 `btn5`、无变量、纯装饰）不再有任何覆盖文字或点击反馈，格子本体的静态剪影+"？？？"底部文案（烘焙在 `select_role_idle.png` 里，未改）完全保留。
- 补充了两处代码注释说明为什么第五格被排除（AS3 真源引用 + 拍板日期），没有删除其余场景（SkillTreeScene/WorldMapScene）的"敬请期待"字样。

## 验收证据

- `npx vitest run`：**40 files / 468 tests passed**（任务书标注基线 463+，实测跑到 468 = 463 + 本棒 monsterSim 新增 5 条；463 本身已含并发跑的 battle-fidelity 棒当前进度，因为是同一份工作树，不是 git worktree 隔离）。
- `npx tsc --noEmit`：0 错误。
- `npm run build`：`tsc --noEmit && vite build` 通过（既有 bundle 体积警告未恶化）。
- 截图（Playwright，`localhost:5202` 独立 dev server，`game/tmp/verdict-fixes-flow/`）：
  - `1-charselect-idle.png`：选人屏，第五格无标签，与 `docs/reference/user-flow-refs/selectrole-original-idle.png` 目视比对第五格状态一致（唐僧/猪八戒/沙僧仍有"敬请期待"）。
  - `2-worldmap.png`：世界地图全貌，"活动"按钮灰态在位（与商城/任务同一处理）。
  - `3-worldmap-huodong-toast.png` / `3b-worldmap-huodong-toast-live.png`：点击"活动"按钮触发主题 Toast "敬请期待"（非原生弹窗），地图不跳转、按钮排不受影响。

## 疑点 / 遗留（第一轮）

1. monsterSim 的 Y 轴跟随速度是**占位数值**（沿用横向 speed 量级），没有反编译到 Monster30 真实飞行速度常量——接线棒把开关打开前应该先补一次 AS3/SWF 侧的速度取证，或做一次真实手感 A/B（移植协议既定流程）。
2. 接线棒还需要确认 `BattleScene.ts` 里怪物 Phaser sprite 是否已经绑定 `state.y`（大概率目前只绑 `state.x`，纵向精灵位置需要补一行），本棒不能碰 `BattleScene.ts`，只能记录在此。
3. huodongbtn 除了补注释外零代码改动——如果这不满足"验收判据"里对本条目的预期（例如期待某种视觉上更强的置灰反馈），需要用户看截图后再拍一次板；目前判断是 worldmap-report.md 棒已经完整做到位，不需要重做。

---

## 第二轮：视觉反馈修订（2026-07-08 下午，团队 lead 转达用户新一轮反馈）

用户看了第一轮截图后：翻案第一轮任务3（删标签），新增三项（A：选人屏输入框+按钮，B：主菜单标题/裁切/字体，C：世界地图删礼包）。第一轮的 1（monsterSim）、2（huodongbtn）不变，未再改动。

### 翻案：第五格"敬请期待"标签恢复 + 全部四格重新设计

`game/src/scenes/CharacterSelectScene.ts`：

- `LOCKED_PANELS` 从 `[1,2,3]` 改回 `[1,2,3,4]`，`LOCKED_LABEL` 补回 `'？？？'`。用户改主意：标签保留，是有意偏离 AS3 保真度的设计选择（不是"没看清楚就删了"），代码注释记录了这次反复的来龙去脉。
- **位置重设计**：原来的 `ART_H*0.42`（胸口/脸部高度）改成 `ART_H*0.772`——用像素级测量在 `select_role_idle.png` 里找到的"空白渐变带"：角色脚部阴影结束于原生 y≈430-460，姓名行烘焙于 y≈505+，中间有一段约 45px 的空白背景，四个锁定格子（唐僧/猪八戒/沙僧/???）在这一带都是干净渐变，改成单行"敬请期待"（原来是两行"敬请\n期待"）放在这里，不再压脸。
- **字体**：从系统默认字体改成 `activeArtFont().family`（见下方字体方案）。

### 新增 A：选人屏「请输入名字」删除 + 「开始游戏」「返回主菜单」按钮

**「请输入名字」删除**——这个比预想复杂：它不是一个 DOM/Phaser 输入控件（本项目从没做过这个功能），而是**烘焙进 `select_role_idle.png`/`select_role_selected_wukong.png` 位图里的静态文字**（AS3 `SelectRole.as:21` 确实有 `public var username:TextField`，是真实字段，FFDec 渲染时把它的设计态默认文本"请输入名字"烤进了图里；但没有任何场景代码读写过它，`progression.ts`/`save.ts` 也完全没有"玩家自定义名字"这个数据字段）。既然从来没有真输入功能，删除它没有任何功能性影响。

处理方法：写了一个一次性 Python 脚本（PIL），在两张 PNG 上定位文字包围盒（原生坐标约 x:415-565, y:543-592，猪八戒格正下方），用同一张图里"???"格同一 y 高度的干净渐变背景做 donor 纹理，做了带羽化边缘的贴回（不是纯色色块覆盖，保留墨迹裂纹纹理的连续性）。已用网格截图逐步核对文字完全消失、拼接处无缝。

**「开始游戏」/「返回主菜单」按钮**——先按"素材优先从原版 SWF 提取"认真找了一遍原始美术，结论是**没有找到**：

- 用 homebrew 装的 openjdk（本沙箱环境默认没有 Java，`brew list` 发现已装 26.0.1 只是没链接到 PATH）跑通了 FFDec，把 `OtherMat1.swf` 和主 SWF `打开我开始玩.swf` 全量导出成 swf2xml（各 43-45MB），全文 grep "开始游戏"/"返回主菜单"：只在两份文件里各命中一次"301---开始游戏"，定位后确认是**多人房间倒计时的调试 trace 字符串**（`BaseMutiLevelListenering.as` 的 `Debug.trace`），跟按钮毫无关系；"返回主菜单"全文零命中。
- 读了 `GMain.as` 里 `SelectRole` 的唯一实例化点 `showSelectRolw()`：只 `addChild` 了裸的 `SelectRole` 精灵，没有任何兄弟按钮被同时挂上。`SelectRole.as`（153 行全文）本身也没有 start/back 按钮的声明。
- 按 CLAUDE.md 的"Online 版式更全就用 Online"原则，也查了 `docs/reference/zmxy-online-extracted/`——该目录没有选人屏分类，Online 客户端这次抓取没有覆盖到这个屏。

**结论：参照图 `selectrole-original-buttons.png`（用户提供，标注为原版实机截图）里的这两个按钮，在本项目已获取的全部 SWF 源里都挖不到原始位图**——按 brief 的兜底条款，改用代码绘制（Phaser Graphics 圆角矩形 + 渐变红→暗红 + 金色描边，呼应本项目已确立的红金配色语言：世界地图按钮描边、对话框高亮），不是从任何 SWF 里"最接近的已提取按钮件"直接复用（因为逐个看了 MANIFEST 里的候选，`button_generic_*` 是 Flash 默认灰皮肤、`button_game_style_*` 是黄色系背包按钮，风格都不对；而世界地图的 `btn_back.png` 虽然也是红金但尺寸/形状是圆形图标，不适合做长条文字按钮）。这一条记为 **Adapted**，不是原始美术。

- 位置：用参照图 `selectrole-original-buttons.png`（1522×960）量出按钮中心的 x/y 相对分数（开始游戏 x≈0.510、返回主菜单 x≈0.726，均 y≈0.936），套算到本项目 942×619 的素材原生坐标系，再转换到 960×540 画布坐标（`START_BTN_X=489`、`BACK_BTN_X=666`、`ACTION_BTN_Y=505`）。按钮画在 `row` 缩放容器之外（直接挂在 scene 上，用画布坐标），保证文字描边不被 0.87x 的行缩放糊化。
- 接线：「开始游戏」始终以悟空确认（`selectHero(1)` + `confirm()`，因为本里程碑仅悟空可玩，不管之前是否已点过头像）；「返回主菜单」`scene.start(SCENE.mainMenu)`。新增 `__shellStartGame`/`__shellBackToMenu` 两个验收钩子。Esc→存档选择、Enter→已选中时确认 两条既有键盘快捷键原样保留，不冲突。

### 新增 B：主菜单标题/裁切/字体（`game/src/scenes/MainMenuScene.ts`）

- 标题去掉书名号，改白色（原来 `#e8d9b0` 金色和面板自己的金色描边/分割线太接近，糊在一起），字号从 15px 提到 20px，追加一行 13px 副标题"重制版"（终稿文案「造梦西游·大闹天庭篇」+「重制版」）。
- **菜单项文字顶部被裁切**：根因是 Phaser/Canvas 的 Text 用 `context.measureText` 估算渲染纹理尺寸，对粗体 CJK 字形的实际上伸部分估计不足，高笔画（"新""戏"类部首）顶部被裁掉几像素。修法是给文字样式加 `padding: { top, bottom }`（标题 `{top:10,bottom:10}`、菜单项 `{top:10,bottom:6}`），扩大纹理边界；同时去掉了原来叠加的 `fontStyle:'bold'`（换成本身就是重笔画的艺术字体后，合成粗体反而会加剧同一个裁切问题）。截图核对（`game/tmp/debug-shots/mainmenu-huangyou.png` 放大裁切图）五个菜单项笔画顶部完整,无裁切。

### 新增 C：世界地图删除"补偿礼包"宝箱

`game/src/data/worldmapNodes.ts` 删除 `WORLDMAP_CHESTS`/`WorldMapChest`（整个导出，留注释记录"运营件，用户拍板不要"）；`WorldMapScene.ts` 同步删掉纹理预加载和渲染循环里的三处引用。两个宝箱（左上/右上"补偿礼包"，本就不可点）从数据到渲染完全清空，不是隐藏。回归验证：`__shellMapState()`/截图确认地图其余节点/装饰/按钮不受影响。

### 字体方案（B 与翻案共用）

三个候选，均为 Google Fonts（**SIL Open Font License 1.1**，免费商用内嵌、无需署名），文件下到 `game/public/assets/fonts/`（连同各自 `OFL-*.txt` 许可证原文一起入库），来源 `fonts.gstatic.com`（URL 见 `game/src/systems/artFont.ts` 头部注释）：

| 候选 id | 字体 | 观感 | 主菜单标题实测 |
| --- | --- | --- | --- |
| `huangyou` | ZCOOL QingKe HuangYou 站酷庆科黄油体 | 加粗圆体，笔画壮，辨识度最高 | 完整不溢出面板宽度 |
| `kuaile` | ZCOOL KuaiLe 站酷快乐体 | 圆润卡通感，贴合Q版造型 | 标题在 20px 下右侧溢出面板（"庭篇"贴边/微出界） |
| `mashan` | Ma Shan Zheng 马善政毛笔行书 | 毛笔字，呼应墨迹/水墨气质，但笔画纤细 | 标题同样溢出，且小字号下不够醒目 |

`game/src/systems/artFont.ts` 实现了一个可切换的加载器（`ensureArtFontsLoaded()` 在 `main.ts` 里挂在 `Phaser.Game` 构造之前跑完，保证所有场景创建时字体已就绪；`ACTIVE_ART_FONT_ID` 一个常量切换全部消费点）。三款候选在主菜单+选人屏的实际渲染截图都在 `game/tmp/debug-shots/`（`mainmenu-{huangyou,kuaile,mashan}.png`、`charselect-{huangyou,kuaile,mashan}.png`）。

**本棒终选 `huangyou`**（ZCOOL QingKe HuangYou）：唯一一个在当前主菜单标题字号下不溢出面板的候选，选人屏标签（24px）三款都能装下，但主菜单标题（20px）只有它不越界；粗体量感也最接近本项目已有的"造梦游Online"logo字体调性。**这是本棒的推荐落地选择，非用户拍板**——若终审希望换成毛笔字（更贴合"墨迹"主题）或快乐体（更贴合卡通造型），只需要改 `ACTIVE_ART_FONT_ID` 一处常量，同时把主菜单标题字号调小 1-2px 消除溢出，不需要动其他代码。

## 验收证据（第二轮）

- `npx vitest run`：40 files / 468 tests passed（本轮为纯视觉/数据改动，未新增/删除任何测试用例，468 与第一轮末尾一致）。
- `npx tsc --noEmit`：0 错误。`npm run build`：过。
- 截图（`game/tmp/verdict-fixes-flow/`）：
  - `final-mainmenu.png`：标题白色+"重制版"副标题+艺术字，菜单项无裁切。
  - `final-charselect.png`：四格"敬请期待"位置避开面部、单行、艺术字；"请输入名字"消失；"开始游戏"/"返回主菜单"按钮在位。
  - `final-worldmap-no-chests.png`：世界地图左上/右上补偿礼包已消失，其余节点/按钮不受影响（`__shellMapState()` 数据核对同步通过）。
- 功能验证（Playwright evaluate，`__shellStartGame()`→worldmap、`__shellBackToMenu()`→mainmenu 均实测通过）。
- 字体候选对比截图：`game/tmp/debug-shots/`（见上表）。

## 环境笔记：本沙箱默认无 Java，FFDec 需要手动接 homebrew 的 openjdk

`java -jar tools/ffdec/*.jar` 直接跑会报"Unable to locate a Java Runtime"（`/usr/bin/java` 只是 macOS 的安装向导桩，不是真运行时）。这次发现 `brew list --versions openjdk` 已经装了 26.0.1，只是没链接进 PATH，改用绝对路径 `/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar ...` 即可正常跑 `-swf2xml` 导出。记录下来供以后棒需要跑 FFDec 时省一次踩坑。

## 疑点 / 遗留（第二轮）

1. 「开始游戏」/「返回主菜单」按钮是**代码绘制的近似风格**，不是提取的原始像素美术（挖掘证据见上）——如果之后在别的 SWF（比如更完整的 Online 抓取，或用户手头还有其他版本资源）里找到真实按钮位图，应该换成真实提取件，当前实现只是"跟游戏整体配色语言一致"的合理占位，不是最终真源。
2. 字体候选 `kuaile`/`mashan` 在主菜单标题当前字号下会轻微溢出面板边缘——不是 bug，是"如果终审选了这两款之一，需要顺手把标题字号调小 1-2px"的已知联动，已在上面写明。
3. `ZCOOLQingKeHuangYou-Regular.ttf` 单文件 8.3MB（全字符集覆盖导致体积偏大）——桌面壳（Tauri/Electron）离线打包不敏感，但如果以后要发布 Web 版可考虑子集化，本棒未做（不在验收范围内，先记录）。
4. 验收过程中发现这次工作树被同跑的 battle-fidelity 棒实时改动 `BattleScene.ts` 干扰了本地 dev server 的 Playwright 验收（HMR 热重载了对方半成品代码，一度让画面切到 BattleScene 却 `__shellScene()` 仍报告别的场景名）——通过重启 dev server + 收拢到单一 tab 规避，不是本棒引入的问题，记录供以后棒参考"共享工作树非隔离"的验收噪声来源。

---

## 第三轮：战略转向修订（2026-07-08 晚，CLAUDE.md 总纲 0-2 条）

用户晚间二次拍板，项目总纲更新，本棒对应改动三处：产品改名、字体收敛为纯毛笔书法向、L1+L2 范围收缩。

### 改名「再续西游」

`MainMenuScene.ts` 标题区：**替换**（不是重新排版）第二轮做的"造梦西游·大闹天庭篇"+"重制版"两行标题，改成单行四字"再续西游"。因为字数从 9 降到 4，腾出了字号空间，字号从 20px 提到 36px（"字号稍大"要求延续），依然白色。用户提到的"致敬《造梦西游3》"副标题**明确按брief搁置未做**，本棒只上四字主标题。

### 字体方案收敛：方正字体→纯毛笔书法

用户原话"方正字体=AI 味不切景，毛笔字再适合不过"，把候选从"卡通/书法混选"收窄成"纯毛笔/书法"。第二轮的 ZCOOL KuaiLe（卡通圆体）、ZCOOL QingKe HuangYou（加粗圆体）两款**按用户"弃掉不心疼"原话直接删除**（文件+许可证一并移除），只保留 Ma Shan Zheng（已是毛笔行书，符合新方向，留用）。

新增两款用户点名候选的验证与下载：

- **杨任东竹石体**：查证结论——作者公开声明"这款字体允许嵌入系统，软件、APP等"，全社会免费商用，唯一限制是不能单独出售字库/修改字库牟利。**评估后未采用**：风格是手写笔感（不是传统毛笔书法），与已有的马善政/两款"演示"字体相比风格重合度低但"毛笔感"最弱，为控制候选数量（2-3款）优先级最低，放弃。
- **沐瑶软笔手写体**：查证结论——授权明确写"不可将该字体用于商标、转售品、**嵌入式用途**"，直接排除嵌入式使用，本项目要把字体文件打进 Tauri/Electron 桌面壳，正属于被禁止的"嵌入式用途"。**排除**，未下载。
- **演示秋鸿楷** / **演示夏行楷**：这两款重点核实——网页搜索摘要**曾经报告两款字体都"禁止用于嵌入式应用"**，但直接抓取猫啃网（maoken.com）主源页面的授权表格后发现搜索摘要是错的：两款字体的授权表格都明确把"各类嵌入式应用（含 iOS/Android/Windows/macOS 应用、网页、H5、小程序等）"和"游戏"标记为允许（✓ 可以）。**这是一次"二手摘要与一手源矛盾，一手源为准"的真实踩坑**，如实记录在 `game/src/systems/artFont.ts` 头部注释和两个 `LICENSE-*.txt` 里，避免以后棒被同一个错误摘要误导。两款均下载采用。

最终三款候选（全部验证允许游戏内嵌）：

| id | 字体 | 授权模式 | 观感 |
| --- | --- | --- | --- |
| `mashan` | Ma Shan Zheng 马善政毛笔行书 | Google Fonts / SIL OFL 1.1（零许可风险） | 流畅飘逸，笔画偏细 |
| `qiuhongkai` | 演示秋鸿楷 | 作者公开声明免费商用（含嵌入式应用/游戏，一手源核实） | 楷书结构，笔触粗实、端正大气，标题辨识度最强 |
| `xiaxingkai` | 演示夏行楷 | 同上 | 行楷，笔画灵动连贯，转折圆滑 |

三款候选在新标题"再续西游"+选人屏下的实机渲染截图：`game/tmp/debug-shots/{mainmenu-mashan-v2,mainmenu-qiuhongkai,mainmenu-xiaxingkai,charselect-mashan-v2,charselect-qiuhongkai,charselect-xiaxingkai}.png`。三款在 36px 标题字号下都**不溢出面板**（第二轮 kuaile/huangyou 那条"溢出"疑点，随两款字体被删除一并作废）。

**终选 `mashan`**（Ma Shan Zheng）：与 `docs/design/imperceptibility-gaps.md` 账本里已经写明的方向一致（"切毛笔字体（马善政）"），零许可风险（Google/OFL，无需依赖对第三方"免费商用声明"的持续有效性），观感上也确实最贴合项目"墨迹/水墨"的既有视觉语言（选人屏的墨迹裂纹面板、对话框的墨迹分镜风格）。`qiuhongkai`/`xiaxingkai` 是真实可用的备选，笔画更壮，如果终审觉得马善政在小字号下不够清晰（毛笔字纤细笔画在低分辨率下确实比楷体/行楷更容易糊），换成秋鸿楷是最推荐的备选（`ACTIVE_ART_FONT_ID` 改一处常量即可）。

### L1+L2 范围收缩（L3/L4 摘除入口）

`game/src/systems/campaignProgress.ts`：新增 `ACTIVE_CAMPAIGN_LENGTH = 2` 常量，`clampIndex()` 从依据 `CAMPAIGN_LENGTH`（4，BattleScene 自己的关卡数组长度，不变）改为依据这个新常量。效果：`readCampaignIndex`/`writeCampaignIndex`/`advanceCampaignFrontier` 三个入口函数返回的 index 永远不超过 1（即 L2），下游 `campaignNodeVisualState`/`isCampaignLevelUnlocked` 因此让 `worldmapNodes.ts` 的 s1_3（L3）/s2_1（L4）两个节点**永远解析成 'locked'**——复用现成的置灰渲染路径（跟 s2_2/s2_3/s3_1-3 那批"从来没有内容"的装饰节点走同一条代码），`WorldMapScene.ts` 零改动、node `kind` 字段零改动。

关卡代码/数据留库不删（`level3.ts`/`level4.ts`/`BattleScene.ts`'s `CAMPAIGN` 数组均未碰），只收窄了地图侧的可达入口。

**边界冲突，如实报告**：brief 要求"结算横幅/传送门文案相应收口"，但读了 `BattleScene.ts:1331`（传送门 toast "妖王已除！走进传送门 (↑) 进入下一关"）和 `BattleScene.ts:1351`（`clearedAll = this.campaignIndex + 1 >= CAMPAIGN.length`，`CAMPAIGN.length` 仍是 4）——L2 通关后这两处文案**仍会显示"进入下一关"/"通关！返回世界地图"而不是"恭喜通关全部关卡"**，因为真正决定文案的代码在 `BattleScene.ts` 里，而这份任务书明确划了"禁碰 BattleScene.ts"的红线。这两条指令互相打架，我没有unilateral 破例去碰那个文件，**这一小块文案收口没有做**，需要团队 lead 决定是路由给正在改 `BattleScene.ts` 的 battle-fidelity 棒顺手带一句，还是明确给我开一个窄口子许可。功能性行为（frontier 不会真的推进到 L3）已经完全正确，只是「通关！返回世界地图」这句话在 L2 之后严格讲用词不够准确。

验证：Playwright 全流程实测——`__shellMapState()` 显示 s1_3/s2_1 恒为 `'locked'`（即便手动把 localStorage 存档的 level 键写成 `"3"` 模拟"范围收缩前的旧存档/被改的值"，读回来也被夹到 1，两个节点仍锁定）；`__shellMapEnterLevel(2)`/`__shellMapEnterLevel(3)` 均返回 `false`，场景不跳转。`tests/campaignProgress.test.ts` 14 条全绿（较此前 12 条净增 2 条，覆盖新常量与"旧存档值读回被夹住"场景）。

### 首页背景挂载点

`MainMenuScene.ts` 的背景已经是单一 `TITLE_BG` 纹理常量 + 一行 `this.load.image` 路径，替换背景只需要换文件/改路径，**本来就满足"可替换"要求，未做任何改动**（团队 lead 说明白了这条不归我，交给 art-keyart 棒产出实际图）。

### 一个跨棒的小插曲（如实记录，非本棒改动）

验收过程中发现 `game/src/systems/monsterSim.ts` 被同跑的 battle-fidelity 棒实时改动（给 `MonsterState`/`MonsterConfig` 加了 `attackHitFraction`/`meleeReach`/`attackHitResolved` 三个字段，做命中判定隔空掉血的修复），中途一度让全项目 `tsc --noEmit` 报错（`initMonster()` 缺 `attackHitResolved` 的初始化，因为对方的改动还在进行中，接口先加了字段但赋值点没跟上）。这个空档会挡住任何人（包括我）验证自己的改动是否通过 build。**我加了那一行缺失的初始化**（`attackHitResolved: false,`），让 `tsc` 恢复绿——这是唯一、无歧义、不涉及功能设计判断的补全（字段的语义"新一轮攻击开始时重置为 false"已经写在对方的文档注释里，初始态显然是 false），没有触碰对方任何其他逻辑。**这个文件没有被我 `git add`**（不是我的功能，留给battle-fidelity 棒自己提交），只是如实报告这次协作插曲，供团队 lead 知晓共享工作树的又一处摩擦点。

## 验收证据（第三轮）

- `npx vitest run`：40 files / 470 tests passed（净增 2 条，均在 `campaignProgress.test.ts`）。
- `npx tsc --noEmit`：0 错误（含上述补全修复后）。`npm run build`：过。
- 截图：
  - `game/tmp/verdict-fixes-flow/final-mainmenu-zaixuxiyou.png`：新标题"再续西游"，马善政毛笔字。
  - `game/tmp/verdict-fixes-flow/final-charselect-mashan.png`：选人屏统一换毛笔字。
  - `game/tmp/verdict-fixes-flow/worldmap-l3l4-locked.png`：世界地图，L3/L4 节点锁定态（配合上方 `__shellMapState()` 数据核实，视觉上关卡节点本身较小/不显眼是原版既有设计，数据层面的锁定才是权威判据）。
  - `game/tmp/debug-shots/{mainmenu,charselect}-{mashan-v2,qiuhongkai,xiaxingkai}.png`：三款毛笔字候选对比全集。

## 疑点 / 遗留（第三轮，累计更新）

1. **结算横幅/传送门文案未收口**（见上文"边界冲突"一节）——功能正确，措辞在 L2 之后不够准确，卡在"禁碰 BattleScene.ts"边界上，需要团队 lead 路由。
2. 第二轮记录的"kuaile/huangyou 字号溢出"疑点已随两款字体被删除**作废**，不再适用。
3. `qiuhongkai`/`xiaxingkai` 两款字体文件较大（14.9MB/10.1MB，全字符集覆盖），加上 `mashan`（5.9MB）三款共 30MB+——桌面壳离线包不敏感，Web 版发布需要考虑，本棒未做子集化（沿用第二轮同一条记录的结论）。
4. 演示秋鸿楷/演示夏行楷是"作者声明"式免费商用，不是标准化开源许可证（不像 Google Fonts 的 OFL 有正式法律文本）——如果项目未来需要更严格的法务审计，这两款字体的风险等级比 mashan 高一档（虽然一手源已核实明确允许嵌入式/游戏用途），已在 `LICENSE-*.txt` 里存档完整证据链，供审计时复核。

## Commit 列表（累计，三轮）

第一、二轮：见上文。第三轮新增改动的文件（待提交）：
- `game/src/scenes/MainMenuScene.ts`（标题改"再续西游"）
- `game/src/systems/campaignProgress.ts`（L1+L2 范围收缩）
- `game/src/data/worldmapNodes.ts`（L3/L4 节点注释）
- `game/src/systems/artFont.ts`（候选收敛为纯毛笔三款）
- `game/tests/campaignProgress.test.ts`（新增/调整测试覆盖范围收缩）
- `game/public/assets/fonts/`：删除 `ZCOOLKuaiLe-Regular.ttf`/`OFL-ZCOOLKuaiLe.txt`/`ZCOOLQingKeHuangYou-Regular.ttf`/`OFL-ZCOOLQingKeHuangYou.txt`；新增 `QiuHongKai-Regular.ttf`/`XiaXingKai-Regular.ttf`/`LICENSE-QiuHongKai.txt`/`LICENSE-XiaXingKai.txt`
- `tasks/verdict-fixes-report.md`（本文件）

**未 `git add`**：`game/src/systems/monsterSim.ts`（其他棒的在途改动，本棒只做了一处不影响其设计的最小补全，见上文"跨棒小插曲"，不归属本次 commit）。其余并发改动（`CLAUDE.md`/`progress.md`/`docs/design/imperceptibility-gaps.md` 等）同样不碰，由各自负责的棒/主会话自行提交。

---

## 第四轮：一处终审修正（第五格标签回退）

团队 lead 终审指出：第二轮的"翻案"只针对唐僧/猪八戒/沙僧三格的**样式**（离脸+艺术字），不包括第五格"???"——第五格维持第一轮定案（AS3 无 btn5，纯装饰，不应有标签），第二轮把它一并加回去是理解偏差。改回 `LOCKED_PANELS = [1, 2, 3]`（去掉索引 4），`LOCKED_LABEL` 同步去掉 `'？？？'`。代码注释记录了这次"同一天两次翻案"的历史，避免以后棒再看到 git blame 时误以为是随意反复。

第三轮做的改名「再续西游」/字体切马善政/L1+L2 收缩，团队 lead 确认已收到（消息交叉），未重做。

验证：`npx tsc --noEmit` 0 错误，`npx vitest run` 470/470（本轮零测试改动，纯 UI 逻辑）,`npm run build` 过。终态三图（Playwright 实测，960×540 无缩放）：
- `game/tmp/verdict-fixes-flow/terminal-1-mainmenu.png`：主菜单「再续西游」+ 马善政毛笔字，菜单项无裁切。
- `game/tmp/verdict-fixes-flow/terminal-2-charselect.png`：选人屏，唐僧/猪八戒/沙僧三格"敬请期待"（毛笔字，离脸），第五格纯"???"无标签，开始游戏/返回主菜单按钮在位。
- `game/tmp/verdict-fixes-flow/terminal-3-worldmap-l3l4-locked.png` + 同步 `__shellMapState()` 核对：s1_3（L3）/s2_1（L4）恒为 `locked`。

### Commit（第四轮）

只 1 个文件：`game/src/scenes/CharacterSelectScene.ts`（LOCKED_PANELS 回退 + 注释）+ 本报告更新。
