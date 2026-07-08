# Report：battle-fidelity 战斗屏无感化（session5）

派单：`tasks/battle-fidelity-brief.md`。执行：sonnet，2026-07-08。全程 tsc 干净、`vitest run` 468/468 全绿、`npm run build` 过。**A 段经历一轮 team-lead 打回并已返修，本文档是返修后的最终版**（§0-§1 是返修后的最终叙述；原始一版的"bg12/bg13 无石台"排查过程仍然真实且成立，只是排查范围当时漏了 Online 提取物，见 §1.1）。

## 一句话结论

A（背景+地面层）与 B1-B4（HUD 四细节）均已落地并真机验证。A 段第一版被 team-lead 打回两点：悟空脚下仍无可见石台、远景宫殿几乎不可见。根因排查发现：①真正的走廊石面素材在 vendor 侧确实不存在（第一版排查成立），但存在于 **Online 客户端**未被搜过的资源里——已从 4399 官方 CDN 现挖 `stageInfo` 包，取出 `export.gameSence.sl12`/`sl13`（Online 版第一关的真实交互场景，含 StopPoint/怪物刷新点+烘焙好的雕花石面，watermark"4399"与参照图完全吻合）里的真实走廊地面位图并接入；②宫殿"几乎不可见"不是缩放问题，是一个真实的**代码 bug**——`bgBase.setTexture('floorBg1')` 未指定 frame 参数，被 Phaser 纹理系统悄悄捕获成 `floorImg` 早先注册的裁剪帧（`floorBg1__ground`，从原图 y=186 往下裁），导致宫殁楼阁部分从未进入过可见帧，现已定位并修复（`setTexture(key, '__BASE')` 显式钉死基帧）。两项修复后，overlay 与参照图结构性对齐良好：宫殿群清晰可见且比例位置接近参照图、悟空脚下有真实石面地板、桥梁不过大过近、金箍棒/等级居中均保持。

## 0. 前置说明：素材真相核验（做 A 之前先做的排查）

brief 假设 bg12/bg13 编译产物包含"雕花玉石长廊石台"。实测（Python/PIL 逐张裁切放大 + FFDec `swf2xml`/`StageListener12.as`/`StageListener13.as` 全文检索）：

- `bg12.png`（4890×596，莲池华表）：内容是云层+粉白莲花莲叶+一段华表/石雕柱头，**没有可站立的石面纹理**。
- `bg13.png`（4904×678，南天门长廊）：内容是云层+一排红顶牌坊拱门+灯笼杆，**同样没有石面纹理**。
- `level1.xml`（关卡场景 swf2xml 全文）对 bg11/bg12/bg13/floorBg1 四个 characterId **零命名 PlaceObject**——与 `tasks/prefab-compiler-report.md` §5.1 对 bg11 的既有结论一致：关卡背景合成完全靠 AS3 运行时 `addChild`，SWF timeline 里没有可抄的静态摆放坐标；`StageListener12/13.as` 只管 `fbEnter` 法宝门开关与刷怪表，不管背景布局。
- 真正带"雕花石面"质感的素材是 **`floorBg1.png`（1440×690）**——与 `bg11.png` 顶部内容同源（宫殿+彩虹+阶梯+一座浮空的雕花石台，见 `tasks/prefab-compiler-report.md` 已记录的 bg11 结构），且这份素材明显是艺术家专为"地面段远景"构图好的完整小场景（宫殿只占自身高度前 23%），而 bg11 是为纵向攀爬另画的高图（同样内容要占它自身高度约 23%，但那是在 3051px 高的图上，也就是说原图内容本身没有为"横版地面镜头"缩小过）。

**处置（第一版）**：A 段的"远景宫殿变小变远"改接 `floorBg1`，bg12/bg13 保留作为地面段的中景装饰层（华表栏杆+莲池+牌坊），"悟空站在石台上"效果借用 floorBg1 自身浮空平台边缘的第二个、更大更近的实例顶替。**team-lead 终审打回**：脚下依然读不出"石台"（有没有的问题，不是清不清的问题），远景宫殿因一个后来才发现的渲染 bug 几乎不可见（矫枉过正）。

## 0.1 返修：Online 客户端才是参照图的真源

team-lead 指出关键线索：`battle-original.png` 里的 HP 19335、"光棍节脱光"活动横幅、地面石缝里烘焙的"4399"字样，都说明这张参照图是 **Online 实机**，不是 vendor。之前 §0 的排查只穷尽了 vendor 四张图（bg11/12/13/floorBg1），没搜 Online 侧素材——这是范围漏项，不是排查方法错误。补做：

1. **`docs/reference/zmxy-online-extracted/`、`vendor/canonical-hunt/official_4399/batch/`（88 个官方包）、`docs/reference/zmxy3-official/`** 三处逐一核对，`batch/` 里没有现成的关卡1地面素材（88 个文件是按 `Decrypt.as` 里`loadSwfsWhenStageN` 数组 + 版本号映射拼出来的，覆盖不全，见其 README 自陈的"已知不完整"）。
2. 反编译 `gamefile.swf`（官方 loader 内嵌的完整游戏逻辑包）的 `my/Decrypt.as`，找到资源命名规则：`base.BaseGameSence` 构造函数里 `this.bgSprite = AUtils.getNewObj("bg" + curStage + curLevel)`——跟 vendor 的 `bg11`/`bg12`/`bg13` 命名逐字一致，证明 Online 与 vendor 共享同一套底层资源命名规范。
3. 直接从 4399 官方 CDN（`https://sda.4399.com/4399swf/upload_swf/ftp7/hanbao/20120107/6/1.swf`，Referer 绕防盗链，`docs/research/canonical-art-hunt.md` 已验证过的手法）现挖 `1.swf`（关卡1整包）解密后核对：符号表（`bg11`/`bg12`/`bg13`/`floorBg1`/`Monster2-30`，字符 ID 都对得上）**与 vendor 逐字节同源**——证明 vendor 的关卡1背景美术就是 Online 官方原版，第一版的排查结论（bg12/bg13/floorBg1 都没有石面纹理）在"关卡1的 bg 类"这个范围内依然成立，换 Online 的同名文件也挖不到新东西。
4. **真正的突破口**：`stageInfo` 包（88 个官方文件之一，`stageCommonv1270.swf`/`stageInfov1620.swf`）是 Online 客户端**把全游戏所有关卡的"交互场景"类合并打包**的容器（`export.gameSence.sl01` ~ `sl651`，"sl" = StageListener 的缩写）。反编译其中 `sl11`/`sl12`/`sl13`（`[Embed(source="assets.swf", symbol="symbol346/335/323")]`，characterId 346/335/323）发现：这三个类的 `MonsterAppearPoint.enemyType` 分别对应 Monster4/8/7/3/2（sl12）与 Monster8/7/5/3/30（sl13）——与 vendor `LEVEL_1_WUYING` 的怪物名单精确重合，**证实 sl11/12/13 就是关卡1的三个子阶段**。用 FFDec 把 char 335（sl12）/323（sl13）渲染成位图（`-format sprite:png -export sprite`），底部烘焙着一整条**雕花石面地板，带"4399"水印**——跟参照截图里悟空脚下那道石面像素级同款花纹。
5. **关键架构认知**：Online 把"背景"拆成了两层——`bgSTAGE+LEVEL` 类（宫殿/云图，运行时动态加载，vendor 也有对应的 bg11/12/13）和 `sl` 类自己的静态 timeline（走廊地板+怪物刷新点标记，这层烘焙在关卡的"交互场景"本身里，不属于可换的"bg"）。vendor 版本里这一层的 art 内容显然被简化/省略了（out_res/1.swf 只有前一层）；Online 侧的 `stageInfo` 恰好把两层都留了下来，这才是真正能找到走廊地面的地方。第一版排查漏看的正是这第二层。

产物：`game/public/assets/extracted/level1/online_floor12.png`（4700×95，取自 sl12，裁掉了编辑器专用的红色刷怪点图标）、`online_floor13.png`（同法取自 sl13，本棒暂未启用，留作后续/其他子阶段备用）。

## 0.2 返修：远景宫殿"几乎不可见"是渲染 bug，不是构图问题

复现后发现 `bgBase`（承载 floorBg1）实际渲染的画面缺了宫殿主体，只剩浮空平台。用隔离的 playwright-core 脚本直接查询 `scene.bgBase.frame` 才找到根因：

```
frameName: 'floorBg1__ground', frameW: 1440, frameH: 504   // 应为 690（整图）
```

`floorImg`（`placeFloor()`）此前调用 `scene.textures.get('floorBg1').add('floorBg1__ground', 0, 0, 186, 1440, 504)` 给**共享的** `floorBg1` 纹理对象注册了一个裁剪帧（从原图 y=186 往下，切掉了 y=0-186 的宫殿+彩虹部分）。Phaser 的纹理帧是按 texture key 全局共享的，不是按 GameObject 实例隔离的——`this.bgBase?.setTexture('floorBg1')`（不带 frame 参数）被 Phaser 解析成"该纹理当前的默认帧"，而这个默认帧被 `floorImg` 早先的 `tex.add()` 调用改写成了 `floorBg1__ground`，导致 `bgBase` 从未展示过整张图，宫殿部分从物理上就不在渲染范围内——**这与缩放/定位参数无关，之前怎么调参数都救不回来**。

**修复**：三处 `bgBase?.setTexture(...)` 调用全部显式传入 `'__BASE'` 帧名（`setTexture(key, '__BASE')`），钉死为整图，不再受其他对象注册的裁剪帧影响。修复后用真实整图重新量了一遍宫殿在 floorBg1 里的位置（原生宫殿+彩虹簇集中在 x≈400-1000、y≈0-160，水平中心在 x≈700，即 1440 宽图的中偏右），重新计算 `GROUND_BG_SCALE=1.3`、`GROUND_BG_X=-260`、`GROUND_BG_Y=20`（分别解决"宫殿一大半在画布右边界外"和"宫殿贴着画布顶边被裁"两个真实的定位偏差），宫殿群自然、完整地出现在画面右上角。

## 1. A. 战斗段背景 + 地面层接入（返修后）

### 1.1 prefab 管线正式化

`tools/prefab-compiler` 编译产物（`game/tmp/prefab-dev/level1-compiled/bg12.prefab.json` / `bg13.prefab.json`）落位到 `game/src/data/prefab/bg12.prefab.json` / `bg13.prefab.json`（与 `PassiveSkillControl.prefab.json` 同一约定）。两个符号都编译为**单节点 container+image**（bg12/bg13 是无内部子结构的整图 shape，编译器输出已如实反映这一点，未强行拆分不存在的子结构）；纹理沿用已加载的 `bg12`/`bg13` 贴图 key（`game/public/assets/extracted/level1/`），未重新导出。`BattleScene.buildL1GroundLayers()` 用 `PrefabLoader.build(doc, {textureKeyFor: () => 'bg12'|'bg13'})` 具体化为 `Phaser.GameObjects.Container`，换来的是 originFrac 锚点正确性，而非场景图分解（老实说明，不夸大 prefab 管线在本例的收益）。

### 1.2 背景分层重做（`BattleScene.ts`：`buildBackground`/`buildL1GroundLayers`/`swapBackground`/`placeL1GroundBand`/`startClimb`/`finishClimb`）

- **bgBase 换源+定位修复**：地面模式（非攀爬）纹理从 `bg11` 换成 `floorBg1`（`GROUND_BG_SCALE=1.3`，位置 `(GROUND_BG_X=-260, GROUND_BG_Y=20)`——见 §0.2 的 bug 排查与重新测量）。**bg11 本身零改动**——`startClimb()` 显式把 `bgBase` 切回 `bg11`+`scale(1)`+`position(0,0)`（与本任务开工前完全一致的像素/scrollFactor 行为），`finishClimb()` 再切回 `floorBg1` 的地面态参数。理由：`bg11` 原生宽 1132px，缩小会露出画布左右空隙，无法在不露白边的前提下缩小；`floorBg1` 原生就是艺术家画好的小构图，直接换源比硬缩 bg11 更忠实。三处 `setTexture()` 调用均显式传 `'__BASE'` 帧名，避免再次被其他对象注册的裁剪帧劫持（§0.2 的教训）。
- **bg12/bg13 缩放**：此前用 `TileSprite` 按 1:1 原生像素平铺（bg12 的华表栏杆轮廓原生高约 436px，在 540px 高画布里几乎顶到底——这正是 team-lead 判读的"桥梁中景过大过近"）。改为 `GROUND_BG12_SCALE=0.68`、`GROUND_BG13_SCALE=0.6` 的 `PrefabLoader` 容器，不再用 TileSprite 手动平铺（1:1 平铺还会在栏杆图案上产生可见接缝，改用整图缩放后 4890/4904px 原宽早已覆盖 WORLD_W=1560 的滚动范围，不需要平铺）。
- **bg13 挪后**：`GROUND_BG13_X=900`（世界坐标）——bg13（南天门长廊，`StageListener13.as` 对应的 boss 前场子阶段）叙事上在 bg12 法宝门之后，此前固定摆在 (0,0) 导致牌坊拱门从第一帧就顶满全屏；现在只有玩家往关卡纵深走时才逐渐入画，符合它"更靠后的子阶段"身份，也让 `battle-original.png` 实际截到的开局镜头（bg13 完全不在视野内）与我们一致。
- **地面走廊（`placeL1GroundBand`，返修重点）**：不再借用 floorBg1 的浮空平台边缘顶替，改用 §0.1 从 Online `stageInfo` 包挖到的**真实走廊地板**（`online_floor12.png`，4700×95，复用共享的 `floorImg` 对象），`L1_GROUND_BAND_SCALE=1.3` 放大后定位到 `y=GROUND_Y-5=395`，让石面地板的顶沿贴着悟空的 `GROUND_Y=400` 落脚线。这是本棒唯一新增的素材文件（其余全部复用/重新定位既有素材）。
- **L2-L4 零回归**：所有新逻辑都挂在 `swapBackground()`/`startClimb()`/`finishClimb()` 内部的 `n===1`/`isL1` 分支下；返修后再次用隔离 playwright-core 脚本验证 `s.startLevel(1)`：`bgBase` 纹理正确回落 `bg21`/`scale(1)`、`bg12Layer` 隐藏——与返修前的验证结论一致，未受本轮改动影响。

### 1.3 Overlay 对比结论（返修后）

`docs/reference/user-flow-refs/battle-original.png` vs 本棒地面段渲染（isolated playwright-core 截图，960×540 原生分辨率，等比缩放到参照图分辨率后并排+50%混合）：

- **远景宫殿**：清晰完整可见（楼阁+彩虹+阶梯），位置在画面右上，比例与参照图接近——不再是"几乎不可见"。
- **中景桥梁/栏杆**：不顶满画布高度，比例与参照图接近；石雕纹理、位置基本对齐。
- **悟空脚下**：真实雕花石面地板贴着落脚线，与参照图"有一条走廊"的结构判读一致；色调比参照图略偏灰绿（参照图更暖金），细节见 §4 豁免记录。
- 岩石堆造型（bg12 自带的一处石雕/假山）在两张图里都出现，位置也大致吻合，纯属素材本身巧合，不是刻意对齐。

对比图：`/tmp/overlay_sidebyside_v2.png`（返修后，隔离 playwright-core 截图；本次会话截图，未入库——按惯例调试截图不进 git）。

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

1. **走廊地板色调**：`online_floor12.png` 比参照图里的走廊略偏灰绿，参照图更暖金——两者应是同一份原画在不同批次/版本压缩下的色彩差异（Online 客户端图像经过 JPEG 有损压缩链路），未做色彩校正（不属于几何/结构问题，按"版本色差允许"的既有裁决口径，见 `tasks/ui-finish-report.md`）。
2. **HUD 视觉风格差异**：`battle-original.png` 的 HP/MP/EXP 是满宽彩色进度条+外部数值（Online 画风），我们的 HUD 是 vendor `export.RoleInfo` 墨团+锥形墨条画风——按 `tasks/ui-finish-report.md` 已冻结的"裁决规则"（HUD 几何/画风以 vendor 对象树为准，Online 只作参照，不因画风差异回头手改），本棒未改 HUD 底层画风，只按 vendor 真源修了 B1/B4 两处几何/连接问题。
3. **地面段未做成程序化子场景**：与 `prefab-compiler-report.md` §5.4.2 遗留一致——bg12 法宝门（`fbEnter`/`colipse` 碰撞开关）、bg13 独立子屏，本棒仍是把它们当同一屏的背景装饰层用，未新增碰撞/关卡状态机（无对应系统支撑，超出"只动渲染层"边界）。
4. **跨关卡视差因子（scrollFactor）为估算值**：`GROUND_BG12_SCALE`/`GROUND_BG13_SCALE`/`*_X`/`*_Y` 等数值来自"量参照截图比例+反复真机截图核对"，不是对象树/AS3 抠出的精确值（已核实：`level1.xml`+`StageListener12/13.as` 里确实没有这类布局数据，见 §0），如实标注为 Adapted，而非冒充精确复刻。
5. **online_floor13.png 已提取但未启用**：本棒只接入了 sl12（法宝门子阶段）对应的走廊地板；sl13（boss 前场）的地板已同法提取存档，留给后续棒在实现 bg13 独立子屏时直接复用，避免重复挖矿。

## 6. 测试与构建

- `cd game && npx tsc --noEmit` → exit 0（返修前后各跑过一次）。
- `cd game && npx vitest run` → **468 passed**（基线 463 + 之前并发棒新增 5 条，本棒未新增/未删测试，纯渲染层无对应单测，符合仓库既有惯例"没有任何测试实例化真实 Phaser.Scene"）。
- `cd game && npm run build`（`tsc --noEmit && vite build`）→ 通过。
- **真机验证方法（返修后改用隔离链路）**：第一版验证用的是用户本机 Chrome 扩展中继，返修阶段发现该浏览器被其他并发 agent 反复抢占（tab 被切换、端口漂移到 5202/5203/5204，一度让验证脚本对着别人的会话跑），改用项目既有惯例的**隔离 playwright-core + 缓存 chromium**（`~/Library/Caches/ms-playwright/chromium-1228`，可执行文件路径 `chrome-mac-arm64/Google Chrome for Testing.app/...`，因为环境里没有全局 `playwright-core` 包，临时用 `bun add` 在 scratchpad 装了一份，脚本见 `/private/tmp/.../pw-verify/verify.mjs`），起自己的 `nohup npx vite --port 5201 --strictPort`。流程 = 主菜单 `__shellEnter` → 新游戏 `__shellNewGame(0)` → 选悟空 `__shellSelectHero(1)`+`__shellConfirm` → 世界地图 `__shellMapEnterLevel(0)` → BattleScene；用 `__scene.heroState.vertical.y=75; __scene.updateClimb()` 直接触发 `finishClimb()`（跳过手动连点 K 键的攀爬过程，只为验证效率，不代表攀爬手感有改动——攀爬段代码本身零改动）。二关回归用 `__scene.startLevel(1)` 直接验证背景切换正确性；用 `page.evaluate` 直接读 `scene.bgBase.frame`/`.x`/`.y`/`.scaleX` 等属性做数值级校验（不是纯靠肉眼判读截图），这正是发现 §0.2 帧劫持 bug 的手段。
  - 截图证据（会话临时目录，未入库）：`pw-climb-start.png`（攀爬段起点，bg11 像素级未变）、`pw-ground-v3.png`（返修后地面段最终渲染）、`pw-l2-check.png`（二关无回归）、`overlay_sidebyside_v2.png`（与参照图并排）、`isolate-bgbase.png`（bgBase 单独渲染，用于定位帧劫持 bug）、`evidence2-hero-weapon.png`/`evidence2-hud.png`/`evidence2-floor.png`（B1/B3/走廊地板特写）。

## 7. Commit 列表

本地 commit，**未 push**（遵循边界）；只 `git add` 本棒改动的文件——`git status` 显示同一工作树里还有并发团队改动中的 `CLAUDE.md`/`progress.md`/`game/public/assets/extracted/menu/*`/`docs/reference/user-flow-refs/*-feedback-0708.png`/`tasks/skilltree-ui-brief.md` 等，均未碰。

- `game/src/scenes/BattleScene.ts`：A 段背景分层重做（含返修：走廊地板换真源、宫殿帧劫持 bug 修复+重新定位）+ B3 武器默认显示。
- `game/src/ui/hud/RoleInfoHud.ts`：B1 等级数字居中。
- `game/src/ui/hud/SkillBarHud.ts`：B4 坞连接底座补缝。
- `game/src/data/prefab/bg12.prefab.json`、`game/src/data/prefab/bg13.prefab.json`：prefab 管线正式化产物。
- `game/public/assets/extracted/level1/online_floor12.png`、`online_floor13.png`：返修新增，Online `stageInfo` 包现挖的真实走廊地板（§0.1）。

## 8. 边界遵守情况自查

- `jump.ts`/`combo.ts`/`systems/` 下任何文件零改动（未打开编辑，只读引用）。
- bg11 攀爬段实装（`startClimb`/`updateClimb`/`finishClimb`/`CLIMB_*` 常量）行为零变化——新增的纹理/scale 切换代码在进入/退出攀爬时精确复原到本棒开工前的状态，真机验证过（`pw-climb-start.png` 与本棒开工前的攀爬起点截图视觉一致；`floorImg` 在攀爬期间的可见性/depth/scrollFactor 也与本棒开工前完全一致，只是贴图内容从 floorBg1 裁剪帧换成了 online_floor12——纯粹是贴图替换，不是新引入的行为）。
- UI 坐标（LEVEL 常量）取自对真实位图的像素边界框测量，未目测；SkillBarHud 底座坐标同理测量自烘焙图集的阴影延伸范围。
- 设计疑点/bug（bg12/bg13 无石台、chid262 与坞按钮的对象树距离、bgBase 帧劫持根因）均落本报告，未擅自改变量含义或编造不存在的坐标关系；4399 CDN 现挖行为符合项目 CLAUDE.md「法律风险已澄清」节授权范围（自有素材的工程化接入）。
