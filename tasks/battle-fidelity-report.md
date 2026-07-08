# Report：battle-fidelity 战斗屏无感化（session5）

派单：`tasks/battle-fidelity-brief.md`。执行：sonnet，2026-07-08。全程 tsc 干净、`vitest run` 468/468 全绿、`npm run build` 过。

## 一句话结论

A（背景+地面层）与 B1-B4（HUD 四细节）均已落地并真机验证；A 的关键发现是团队lead brief 里认定的"bg12/bg13 地面素材含雕花石台"与实测不符——bg12/bg13 实为纯云图+莲叶/牌坊装饰，真正的雕花石台其实是 `floorBg1`（与 bg11 顶部同一素材）自带的浮空平台边缘，已按真实素材来源改接（见 §1.2 疑点记录）。overlay 与参照图结构性对齐良好（远景宫殿变小变远、桥梁不再过大过近、悟空持金箍棒、等级数字居中），仍有一项已知不完美：hero 脚下的雕花质感不如参照图清晰锐利（受限于素材本身分辨率与用途，见 §4 豁免记录）。

## 0. 前置说明：素材真相核验（做 A 之前先做的排查）

brief 假设 bg12/bg13 编译产物包含"雕花玉石长廊石台"。实测（Python/PIL 逐张裁切放大 + FFDec `swf2xml`/`StageListener12.as`/`StageListener13.as` 全文检索）：

- `bg12.png`（4890×596，莲池华表）：内容是云层+粉白莲花莲叶+一段华表/石雕柱头，**没有可站立的石面纹理**。
- `bg13.png`（4904×678，南天门长廊）：内容是云层+一排红顶牌坊拱门+灯笼杆，**同样没有石面纹理**。
- `level1.xml`（关卡场景 swf2xml 全文）对 bg11/bg12/bg13/floorBg1 四个 characterId **零命名 PlaceObject**——与 `tasks/prefab-compiler-report.md` §5.1 对 bg11 的既有结论一致：关卡背景合成完全靠 AS3 运行时 `addChild`，SWF timeline 里没有可抄的静态摆放坐标；`StageListener12/13.as` 只管 `fbEnter` 法宝门开关与刷怪表，不管背景布局。
- 真正带"雕花石面"质感的素材是 **`floorBg1.png`（1440×690）**——与 `bg11.png` 顶部内容同源（宫殿+彩虹+阶梯+一座浮空的雕花石台，见 `tasks/prefab-compiler-report.md` 已记录的 bg11 结构），且这份素材明显是艺术家专为"地面段远景"构图好的完整小场景（宫殿只占自身高度前 23%），而 bg11 是为纵向攀爬另画的高图（同样内容要占它自身高度约 23%，但那是在 3051px 高的图上，也就是说原图内容本身没有为"横版地面镜头"缩小过）。

**处置**：A 段的"远景宫殿变小变远"改接 `floorBg1`（原本只用于攀爬段的 bg11 保持像素级不变，只是地面模式换成用 floorBg1 当底图），bg12/bg13 保留作为地面段的中景装饰层（华表栏杆+莲池+牌坊），但不再声称它们提供"石台"——真正的"悟空站在石台上"效果由 floorBg1 自身的浮空平台边缘的**第二个、更大更近的实例**提供（§1.3）。此处理经过验证，未按 brief 字面（bg12/bg13=石台）盲抄，理由已如上。

## 1. A. 战斗段背景 + 地面层接入

### 1.1 prefab 管线正式化

`tools/prefab-compiler` 编译产物（`game/tmp/prefab-dev/level1-compiled/bg12.prefab.json` / `bg13.prefab.json`）落位到 `game/src/data/prefab/bg12.prefab.json` / `bg13.prefab.json`（与 `PassiveSkillControl.prefab.json` 同一约定）。两个符号都编译为**单节点 container+image**（bg12/bg13 是无内部子结构的整图 shape，编译器输出已如实反映这一点，未强行拆分不存在的子结构）；纹理沿用已加载的 `bg12`/`bg13` 贴图 key（`game/public/assets/extracted/level1/`），未重新导出。`BattleScene.buildL1GroundLayers()` 用 `PrefabLoader.build(doc, {textureKeyFor: () => 'bg12'|'bg13'})` 具体化为 `Phaser.GameObjects.Container`，换来的是 originFrac 锚点正确性，而非场景图分解（老实说明，不夸大 prefab 管线在本例的收益）。

### 1.2 背景分层重做（`BattleScene.ts`：`buildBackground`/`buildL1GroundLayers`/`swapBackground`/`placeL1GroundBand`/`startClimb`/`finishClimb`）

- **bgBase 换源**：地面模式（非攀爬）时纹理从 `bg11` 换成 `floorBg1`（`GROUND_BG_SCALE=1.2`）。**bg11 本身零改动**——`startClimb()` 显式把 `bgBase` 切回 `bg11`+`scale(1)`（与本任务开工前完全一致的像素/scrollFactor 行为），`finishClimb()` 再切回 `floorBg1`。理由：`bg11` 原生宽 1132px，缩小会露出画布左右空隙（960 视口 + 72px 滚动余量已经接近其原生宽度上限），无法在不露白边的前提下缩小；`floorBg1` 原生就是艺术家画好的小构图，直接换源比硬缩 bg11 更忠实、也更安全（零风险波及攀爬段）。
- **bg12/bg13 缩放**：此前用 `TileSprite` 按 1:1 原生像素平铺（bg12 的华表栏杆轮廓原生高约 436px，在 540px 高画布里几乎顶到底——这正是 team-lead 判读的"桥梁中景过大过近"）。改为 `GROUND_BG12_SCALE=0.68`、`GROUND_BG13_SCALE=0.6` 的 `PrefabLoader` 容器，不再用 TileSprite 手动平铺（1:1 平铺还会在栏杆图案上产生可见接缝，改用整图缩放后 4890/4904px 原宽早已覆盖 WORLD_W=1560 的滚动范围，不需要平铺）。
- **bg13 挪后**：`GROUND_BG13_X=900`（世界坐标）——bg13（南天门长廊，`StageListener13.as` 对应的 boss 前场子阶段）叙事上在 bg12 法宝门之后，此前固定摆在 (0,0) 导致牌坊拱门从第一帧就顶满全屏；现在只有玩家往关卡纵深走时才逐渐入画，符合它"更靠后的子阶段"身份，也让 `battle-original.png` 实际截到的开局镜头（bg13 完全不在视野内）与我们一致。
- **地面近景平台带**（`placeL1GroundBand`，`L1_GROUND_BAND_*` 常量）：复用共享的 `floorImg` 对象，取 `floorBg1` 原生 y210-610 一段（含浮空平台雕花边缘+其下方云层），按 `L1_GROUND_BAND_SCALE=1.3` 放大、定位到 y=290，让平台边缘落在悟空脚下 `GROUND_Y=400` 附近。**这是同一份雕花平台素材的第二个、更大更近的实例**——没有另找/发明素材，理由见 §0。
- **L2-L4 零回归**：所有新逻辑都挂在 `swapBackground()`/`startClimb()`/`finishClimb()` 内部的 `n===1`/`isL1` 分支下；真机验证 `s.startLevel(1)` 后 `bgBase` 纹理正确回落 `bg21`/`scale(1)`、`bg12Layer` 隐藏、`bgTiles` 恢复可见（截图 `tmp/battle-l2-regression-check.png`，二关天王殿场景与本棒改动前视觉一致）。

### 1.3 Overlay 对比结论

`docs/reference/user-flow-refs/battle-original.png` vs 本棒地面段渲染（同机位，等比缩放到参照图分辨率后并排+50%混合，脚本见下）：

- **远景宫殿**：从"填满大半屏幕的近景"变为"画面右上角一小块、带彩虹、有纵深"，与参照图结构一致。
- **中景桥梁/栏杆**：不再顶满画布高度，比例与参照图接近；石雕纹理、位置基本对齐。
- **悟空脚下**：能看到雕花平台边缘的浅蓝纹理（`tmp/hero_feet_v2.png`），但清晰度/对比度不如参照图那道米色石台鲜明——**豁免记录见 §4**。
- 岩石堆造型（bg12 自带的一处石雕/假山）在两张图里都出现，位置也大致吻合，纯属素材本身巧合，不是刻意对齐。

对比图：`/tmp/overlay_sidebyside.png`（本次会话截图，随本报告一并描述，未入库——按惯例调试截图不进 git）。

## 2. B1：等级数字居中

`RoleInfoHud.ts` 的 `LEVEL` 常量从 `{x:22,y:79}` 改为 `{x:20,y:72}`。**测量依据**：用 PIL 对 `hud_ri_bg.png`（226×86，chid264）做 alpha 通道边界框分析，发现该位图里烘焙了**两个**圆圈——一个是头像大墨团（避免误认成等级圈），另一个是左下角、有明显描边的小圆环（bbox x:[1,38] y:[54,86]，被图片底边裁切），这才是真正的等级墨圈，圆心 ≈ (19.5, 71)（bitmap 本地坐标）。`hud_ri_bg` 本身摆在 (1,2)，故等级圈圆心在 RoleInfoHud 容器坐标系里 ≈ (20.5, 73)，取整 (20, 72)。原值 (22, 79) 偏差主要在 y（差 6-7px），落在圈的偏下沿——与 team-lead"数字在墨圈左下角"的判读方向一致。**未按对象树 txtlevel PlaceObject (7,61) 直接抄**，因为动态文本域的注册点通常是文本框左上角、不代表视觉居中点（同类坑此前在 head/rage 的校准记录里已有先例），改用真实位图的像素边界框，符合"不许目测"但改用"量位图"的精神。

验证截图：`/tmp/level_circle_v2.png`（"1" 现在清楚地落在圆环正中）。

## 3. B2：无双充能条

**核验结论：真源位图已在此前（S3 阶段，`tasks/ui-finish-report.md` 第三阶段）落地，本棒未发现需要重做的白色占位条。** brief 转述的"S1 时代按空 chrome 渲染的占位"与代码现状不符——`RoleInfoHud.ts` 里 `hud_ri_rage`（`game/public/assets/extracted/ui/hud_ri_rage.png`，323×11）是从 `export.RoleInfo` 对象树 chid262 `herobeattacktimes` 真实导出的位图（本身就是白色圆角空条——这是原件在 0 充能时的真实长相，不是我们发明的占位色块），坐标 `(3, 87) sx0.666` 已按 `ui-finish-report.md` 记录的 min 像素-diff 校准过。真机截图确认该条仍在渲染、仍是这份真源位图（`/tmp/evidence-hud.png` 可见白色胶囊条）。本棒未改动这部分代码，仅在报告里更正这一处认知偏差，供后续棒参考，避免重复排查。

## 4. B3：悟空默认金箍棒视觉

`BattleScene.ts` 的武器叠加逻辑（`applyHeroRender` 内）此前是 `if (this.equipment.weapon) 显示 weaponSprite`——未装备锻造武器时悟空空手。`role1_equip0` 贴图经交叉核实（`tasks/integration-batch-report.md`/`tasks/furnace-report.md` 均称其"金箍棒上手"）**就是默认金箍棒素材**，Stage A 阶段唯一存在的武器叠加皮肤（EQUIP_6/7 缺失，见代码注释历史）。改为**始终显示**该叠加层，不再按 `equipment.weapon` 门控——因为唯一可用的皮肤本来就是金箍棒，装备任意锻造武器时渲染结果与未装备时完全相同（这是既有的 Stage A 近似，本棒未新增），去掉门控只是不再在"无装备"状态下隐藏它。真机截图确认悟空默认持棒（`/tmp/evidence-hero-weapon.png`），二关（L2）同样持棒，无关卡差异。

## B4：无双按钮与充能条视觉相连

**疑点澄清（对象树核验后）**：chid262 充能条（RoleInfo 对象树内，紧贴 EXP 条下方，y≈78）与 `SkillBarHud` 底部坞的"无双"圆盘按钮（同一对象树内的 `wsmc`，y≈542.8）**在原始坐标系里相距约 460px**，分属"顶部状态面板"与"底部技能坞"两个视觉区域，对象树里没有任何证据表明这两者应该视觉相连——brief 原句"充能条"在这里更可能是团队lead 参照 `battle-original.png` 时，把坞本身那条"无双圆盘→YUIOL 五槽"之间的连接底座（黑色圆角长条，参照图与我们现有渲染都有）误称/泛指为"充能条"。

**已做的具体修复**：`SkillBarHud.ts` 里绘制的深色连接底座（`ledge`）原本左边界卡在 native x=105，与坞图集自带的"无双"圆盘阴影延伸（实测右边界到 x≈119）之间有细缝；改为从 x=98 起画，让手绘底座与烘焙图集的圆盘阴影搭接，肉眼不再有断缝（`/tmp/evidence-dock.png`）。chid262 本身位置未动（仍在顶部 RoleInfo 面板内，见 §3），未强行把它挪到底部坞——没有源数据支持这个改动，按"疑点落 report 不改代码"原则如实记录，留给用户/team-lead 判断是否要基于视觉参照图（而非对象树）重新定义这条充能条的位置。

## 5. 豁免记录（overlay diff 无法归零的已知项）

1. **悟空脚下石台清晰度**：`floorBg1` 的雕花平台边缘原生分辨率/对比度不如参照图鲜明（该素材设计初衷是"远景浮空岛的边缘"，被我们放大挪近后必然不如专门画的近景石材质感清楚）。素材库里没有第二份专门的"近景石面"贴图可换（已逐张核对 bg11/bg12/bg13/floorBg1，无遗漏）。
2. **HUD 视觉风格差异**：`battle-original.png` 的 HP/MP/EXP 是满宽彩色进度条+外部数值（疑似 Online 大闹天庭篇画风），我们的 HUD 是 vendor `export.RoleInfo` 墨团+锥形墨条画风——按 `tasks/ui-finish-report.md` 已冻结的"裁决规则"（HUD 几何/画风以 vendor 对象树为准，Online 只作参照，不因画风差异回头手改），本棒未改 HUD 底层画风，只按 vendor 真源修了 B1/B4 两处几何/连接问题。
3. **地面段未做成程序化子场景**：与 `prefab-compiler-report.md` §5.4.2 遗留一致——bg12 法宝门（`fbEnter`/`colipse` 碰撞开关）、bg13 独立子屏，本棒仍是把它们当同一屏的背景装饰层用，未新增碰撞/关卡状态机（无对应系统支撑，超出"只动渲染层"边界）。
4. **跨关卡视差因子（scrollFactor）为估算值**：`GROUND_BG12_SCALE`/`GROUND_BG13_SCALE`/`*_X`/`*_Y` 等数值来自"量参照截图比例+反复真机截图核对"，不是对象树/AS3 抠出的精确值（已核实：`level1.xml`+`StageListener12/13.as` 里确实没有这类布局数据，见 §0），如实标注为 Adapted，而非冒充精确复刻。

## 6. 测试与构建

- `cd game && npx tsc --noEmit` → exit 0。
- `cd game && npx vitest run` → **468 passed**（基线 463 + 之前并发棒新增 5 条，本棒未新增/未删测试，纯渲染层无对应单测，符合仓库既有惯例"没有任何测试实例化真实 Phaser.Scene"）。
- `cd game && npm run build`（`tsc --noEmit && vite build`）→ 通过。
- 真机验证：独立 Chrome 扩展中继（用户本机浏览器，非 headless），`nohup npx vite --port 5201 --strictPort` 起服务；流程 = 主菜单 `__shellEnter` → 新游戏 `__shellNewGame(0)` → 选悟空 `__shellSelectHero(1)`+`__shellConfirm` → 世界地图 `__shellMapEnterLevel(0)` → BattleScene；用 `__scene.heroState.vertical.y=75; __scene.updateClimb()` 直接触发 `finishClimb()`（跳过手动连点 K 键的攀爬过程，只为验证效率，不代表攀爬手感有改动——攀爬段代码本身零改动）。二关回归用 `__scene.startLevel(1)` 直接验证背景切换正确性。
  - 截图证据（会话临时目录，未入库）：`battle-climb-start.png`（攀爬段起点，bg11 像素级未变）、`battle-ground-v2.png`（地面段最终渲染）、`battle-l2-regression-check.png`（二关无回归）、`overlay_sidebyside.png`（与参照图并排）、`evidence-hero-weapon.png`/`evidence-hud.png`/`evidence-dock.png`（B1/B3/B4 特写）。

## 7. Commit 列表

本地 commit，**未 push**（遵循边界）；只 `git add` 本棒改动的文件——`git status` 显示同一工作树里还有并发团队改动中的 `CLAUDE.md`/`progress.md`/`game/public/assets/extracted/menu/*`/`docs/reference/user-flow-refs/*-feedback-0708.png`/`tasks/skilltree-ui-brief.md` 等，均未碰。

- `game/src/scenes/BattleScene.ts`：A 段背景分层重做 + B3 武器默认显示。
- `game/src/ui/hud/RoleInfoHud.ts`：B1 等级数字居中。
- `game/src/ui/hud/SkillBarHud.ts`：B4 坞连接底座补缝。
- `game/src/data/prefab/bg12.prefab.json`、`game/src/data/prefab/bg13.prefab.json`：prefab 管线正式化产物（新增文件）。

## 8. 边界遵守情况自查

- `jump.ts`/`combo.ts`/`systems/` 下任何文件零改动（未打开编辑，只读引用）。
- bg11 攀爬段实装（`startClimb`/`updateClimb`/`finishClimb`/`CLIMB_*` 常量）行为零变化——新增的纹理/scale 切换代码在进入/退出攀爬时精确复原到本棒开工前的状态，真机验证过（`battle-climb-start.png` 与本棒开工前的攀爬起点截图视觉一致）。
- UI 坐标（LEVEL 常量）取自对真实位图的像素边界框测量，未目测；SkillBarHud 底座坐标同理测量自烘焙图集的阴影延伸范围。
- 设计疑点（bg12/bg13 无石台、chid262 与坞按钮的对象树距离）均落本报告，未擅自改变量含义或编造不存在的坐标关系。
