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

## Commit 列表（累计，两轮）

第一轮：见上文。第二轮新增改动的文件（待提交）：
- `game/src/scenes/CharacterSelectScene.ts`（翻案 + 新按钮）
- `game/src/scenes/MainMenuScene.ts`（标题/裁切/字体）
- `game/src/scenes/WorldMapScene.ts`（删礼包渲染）
- `game/src/data/worldmapNodes.ts`（删礼包数据）
- `game/src/systems/artFont.ts`（新文件，字体加载器）
- `game/src/main.ts`（挂字体预加载）
- `game/public/assets/fonts/*.ttf` + `OFL-*.txt`（新增三款字体文件+许可证）
- `game/public/assets/extracted/menu/select_role_idle.png`、`select_role_selected_wukong.png`（去掉烘焙的"请输入名字"）
- `tasks/verdict-fixes-report.md`（本文件）

未 `git add` 的并发改动（battle-fidelity 棒，未碰）同第一轮列表，另加对方这期间产生的新改动（`game/src/data/prefab/*.prefab.json` 等）。
