# Report：UI 收尾三件套（YUIOL / 炼丹炉 / 结算横幅）

执行：opus，2026-07-07。三件各自独立 commit（未 push）。全程 tsc 干净、测试全绿。
派单：`tasks/ui-finish-brief.md`。

## 成果一览

| 件 | commit | 改动文件 | 状态 |
|---|---|---|---|
| ① 技能坞 YUIOL | `f80bbbf` | `BattleScene.ts` | 完成，功能+显示都换，实机验证 |
| ② 炼丹炉窗体 | `3fddb28` | `BattleScene.ts` `DialogueBox.ts` `ui/hud/FurnacePanel.ts` `ui/hud/hudTheme.ts` `assets/.../furnace_frame.png` | 完成，实机验证 |
| ③ 结算横幅接线 | `758b2f5` | `BattleScene.ts` | 完成（成功横幅），失败横幅按判据不做（见下） |

对比截图（`tmp/debug-shots/`，未进 git，供用户点视觉分）：
- `ui-finish-1-skilldock-COMPARE.png` —— 我们的坞 vs Online 实机 battle-hud 的 YUIOL 坞
- `ui-finish-2-furnace-COMPARE.png` —— 我们的炼丹炉窗 vs 官方 panel-header-炼丹炉 + furnace_making
- `ui-finish-2-furnace-selected.png` —— 择材后投料槽填充 + 炉火预算实时计算
- `ui-finish-3-banner-COMPARE.png` —— 我们的挑战成功横幅 vs Online 原版 challenge-success 素材
- `ui-finish-3-portal.png` —— 关横幅后传送门出现

---

## ① 技能坞热键 YUIOL 化

**关键判断：原版是 5 格坞，不是 9 格改标签。** 双真源一致：
- Online 实机截图 `docs/reference/zmxy-online-screens/battle-hud.png`：底部"无双"大招图标后**正好 5 格，热键从左到右 Y U I O L**。
- kagami `SkillUISystem.ts`：`SkillSlotKeyLabels.p1` 与 `P1_BINDING_ORDER = ['Y','U','I','O','L']`，玩家1 技能槽就是 5 个。

**做法**：`SKILL_KEYS` 从 9 项（ONE..NINE）缩为 5 项（Y U I O L），键位映射与坞显示一起换。默认坞放 5 个基本技能 `slz/lys/hytj/lyfb/jdy`（`heroSkill.ts` Role1SkillId 前 5 个，最不武断的默认）。

**疑点/取舍（按 brief "别为塞满发明键位"）**：我们有 9 个主动技，原版坞只放 5 个。超出的 4 个（`qsez/zz/hmz/hyjj`）**下坞**——原版靠技能绑定 UI（技能树里选哪 5 个上坞）解决，我们还没那套 UI（属未来技能树功能）。这 4 个技能仍存在、仍可通过 `__castSkill` 释放（验收脚本靠它），只是暂无热键。**没有为它们发明 6-9 或别的键**——那会是原版没有的方案。**待用户拍板**：默认坞这 5 个是否合适，或要不要先做个简易绑定切换。

**键位冲突处理**：U 键原先绑"卸装备"（dev 快捷键，甚至没进屏幕提示行），让位给技能；卸装备保留 `__unequip` 钩子（测试用），装备走 E / 背包。

**验证**：实机按物理 Y 键 → slz 释放（MP 50→16）；按 U 键 → lys 释放（MP 50→22）；I/O/L 走同一 `kb.on('keydown-'+code)` 循环，绑定同理成立。acceptance 步骤 12 用 `__castSkill('slz')` 按 skillId 不按数字键，不受影响。

## ② 炼宝 → 原版炼丹炉窗体

**现状纠正**：`FurnacePanel.ts` 组件早已存在（包了官方 `furnace_making` 投料布局），但**没接进流程**——炼宝实际走 `DialogueBox` 的水墨 craft overlay。缺口是：①缺外层炼丹炉窗框；②没接线。

**做法（呈现层换装，协议零改动）**：
- `FurnacePanel` 重写为完整炼丹炉窗口：官方 `furnace_frame`（`StrengthEquipmentv1090.swf` 的"打造"页抬头，烘焙着"炼丹炉"三字）作外框 + `furnace_making`（`export.strength.Making` 投料布局：制作书/基本材料×2/宝石×3→生成物/打造）作内容 + 右栏材料选择器 + 心愿输入 + 实时炉火预算。
- `BattleScene` 把炼宝从 `dialogue.openCraft(...)` 改为 `furnacePanel.open(...)`；**craft 协议一字未动**（`lockMaterials`/`buildCraftRequest`/`craftRequest`/`validateCraftedEquipment`/`addItem` 全原样，net 层没碰）。老君闲聊/任务仍走对话框，只有炼宝进面板。
- `DialogueBox` 瘦身为纯聊天（删掉已死的水墨 craft overlay：chips/预算/submit/craftMode 全移除），保留"炼宝 ✦"入口按钮。避免留两套 craft UI 埋雷。

**心愿输入是我们的 agent 增量**：原版"打造"是确定性配方无自由文本；我们的老君 agent 炼器需要自然语言描述，所以炉窗里加了"心愿"输入框（标注清楚）。

**验证**（独立浏览器，见末节）：炉窗忠实复刻官方（`ui-finish-2-furnace-COMPARE`）；点妖怪残魂×2 + 白银矿石×1 → 两个基本材料槽填入对应图标、炉火预算算出"10 点（atk≤10 def≤10 hp≤40）"；`openCraftMode` 开炉、`furnacePanel.close()` 关炉后正确回到对话框；重写后的 DialogueBox 聊天渲染正常（`_verify-dialogue.png`）。acceptance 18/19/20/21 步（`__openCraft`/`__submitCraft`/`__craftState`）钩子已同步更新（`craftMode` 现读 `furnacePanel.isOpen`），协议路径不变。

## ③ 结算横幅接线：boss 死 → 横幅 → 传送门

**做法**：boss 死不再直接开传送门，改为：
1. `revealTransferDoor`（门标记可用，传送门保持可达、`__usePortal` 继续工作），但**不立即显传送门 glow**；
2. 播 `ResultBanner.showSuccess`（挑战成功横幅，meta-shell 早交付的组件，用 Online 原版素材），stat 行 = **关名 / 妖王已除 / 境界 Lv**（全取自现成数据 `CAMPAIGN[i].name` + `MONSTER_NAMES[boss.species]` + `progression.level`，未加新计数器）；
3. 继续按钮 / ↑ 键 / 6 秒超时 → 关横幅 + 显传送门 glow；重新挑战按钮 → 重开本关。

**acceptance 安全**：门在 boss 死时已 reveal，`__usePortal` 若横幅还开着会先自动关横幅再传送。实测 `__killBoss`(25) → `__usePortal`(26) 仍能进下一关（关 0→1）。

**失败横幅不接（按 brief 判据"现成就接，不现成落 report 不做"）**：`ResultBanner.showFail` 组件层支持，**但游戏没有败局**——战斗模型里英雄死亡是原地自动重生（`onHeroRespawn`），没有"游戏结束/失败"事件可挂。接失败横幅 = 要新增死亡/败局规则，属功能新增、越出"纯呈现"范围。故不做，如实记录。**待用户拍板**：是否要引入败局机制（那是数值/玩法决策，不是 UI 收尾）。

**验证**：清波次刷出 boss（monster3=巫鹰）→ `__killBoss` → 横幅开、门可达、传送门 glow 未显；关横幅 → 传送门 glow 出现 + "妖王已除"提示；`__usePortal` → 进第 2 关。见 `ui-finish-3-banner.png` / `-portal.png`。

---

## 验证方法说明（重要）

**共享 MCP playwright 浏览器被并行 agent 反复抢占**（导航到别的 app、tab 变扩展页、端口漂移 5210/5221），brief 预警过的"多 agent 互踩"实锤发生。改用**独立 playwright-core 脚本 + 缓存 chromium**（`~/Library/Caches/ms-playwright/chromium-1228`），起自己的 vite dev（`--port 5175 --strictPort`，nohup），完全隔离验证。三件的实机截图与状态断言都来自这条隔离链路。

## 并发情况提示（非本任务，供 team-lead 知悉）

本任务期间**同一工作树有并行 agent 在改 `systems/`（承伤数值 tuning）**：其 commit `4619099`/`9646822` 夹在我三个 commit 之间，工作树里还有它未提交的 `heroSurvivability.ts`/`heroIdentity.ts`/`monsterExp.ts` 等改动。我的每个 commit **只 `git add` 自己的文件**（BattleScene/DialogueBox/FurnacePanel/hudTheme/furnace_frame.png），没碰它们的 systems 改动。中途 `vitest` 一度因它们的承伤断言 WIP 红过（与我无关，我的 furnace/ui 相关测试始终绿），现已恢复 401 全绿。

## 测试基线
- tsc `--noEmit`：exit 0（三件每件后都跑过）。
- `vitest run`：387（起始）→ 401（并行 agent 加了承伤/monsterExp 测试）全绿。furnace.test 14 个全过。

---

# 第二阶段：HUD 像素级重做（现场纠偏，2026-07-07）

用户把当前构建与原版实机（`docs/reference/zmxy-online-screens/battle-hud-user2.png`）并排，判"web 感过重"，team-lead 下 12 条逐元素差距清单。①技能坞初审打回（旧 task1 版），②③过。本阶段按清单重做 HUD，方法论：原版位图优先、每轮并排自查。

## commit（本阶段，均未 push）
- `5aac615` HUD 组件重做（RoleInfoHud + SkillBarHud + hudTheme）
- `09cbbc2` BattleScene 场景侧（坞重定位/背景接缝/暂停帮助）+ 4 项承伤接线补丁
- `c6ba94f` 技能坞图标框相连 + 大白热键 + ADD-glow（①第一轮重做）
- `d76b5a8` 挖出更亮图标（RoleSkillInterface skillicon）换上 + 画槽框（①收口）

## 12 条清单逐条

| # | 项 | 状态 | 做法 |
|---|---|---|---|
| 1 | 拆整块底板 | ✓ | RoleInfoHud 去 plate，头像+条各自悬浮 |
| 2 | 短粗胶囊血条 | ✓ | 重画：capsule r=h/2、墨色描边、TAB_W 左标签牌 |
| 3 | 条上白字大号居中 | ✓ | value text 居中、白字黑描边 |
| 4 | 墨色标签牌 | ✓ | 每条左端深色 tab + HP/MP/EXP 白字 |
| 5 | 等级墨点白字 | ✓ | 用 `hud_avatar_wukong` 位图烘焙的墨点，动态白数字对齐盖住烘焙"99"；裁掉该位图底部烘焙白条 |
| 6 | 删属性行 | ✓ | 移除"攻击/武器"文字 |
| 7/8 | 亮色满格图标+原版格框 | ✓ | 见下"图标挖掘" |
| 9 | 去 Lv/MP 只留热键 | ✓ | SkillBarHud 不再画 level/mpCost |
| 10 | 无双+按钮簇 | ✓ | 用提取 `hud_roleinfo_bottom_skilldock` 位图 cluster 区（无双/法宝/宠物/技能/青包/设置） |
| 11 | 按键帮助挪 Esc 菜单 | ✓ | 删战场文字，暂停面板加高加 help 行 |
| 12 | 背景第二道彩虹接缝 | ✓ | 见下"背景接缝" |

## ①图标挖掘（team-lead 批准的第二轮，硬时间盒，已收手）

**根因**：`ss_*.png`（`OtherMatv3570.swf` chid1-40，45px，暗红火+烘焙深框）叠在坞底灰空槽上=双重深框="暗成一团"。

**挖掘（FFDec `tools/ffdec/ffdec-cli.jar`）**：`RoleSkillInterfacev3550.swf`（未加密）导出 178 图，其中 `skillicon_*`（66px，边到边亮火焰，无烘焙框）是技能树 UI 图标，40 个符号含悟空全 9 技能（`skillicon_slz/lys/hytj/lyfb/jdy/qsez/zz/hmz/hyjj`）。比 ss_* 明显亮一档、更清晰。已拷为 `game/public/assets/online/skill-icons/sb_*.png`，`skill_<id>` 改指向它。因新图无框，SkillBarHud 改为**画槽框**（深底+棕金细边，cell 相连成排）内嵌亮图标 + 大白热键居中。证据：`tmp/debug-shots/ui-finish-1-skilldock-COMPARE3.png`。剩微差：我画的棕金框比原版细黑框略重，可辩护为雕花框风格。

## 背景接缝（第 12 条）

**根因**：`floorBgN` 是**整场景图**（自带宫殿+彩虹在顶、雕花石台+云在下），被当"地面带"从 y470 平铺就把它自带的彩虹重画在了画面下缘=第二道彩虹。**改法**：`placeFloor()` 给 floor 纹理加子帧裁掉顶部 27%（彩虹+宫殿，bg11 已画），只贴石台+云 band 到脚下（`FLOOR_TOP_Y`）；并把 `bg12`（莲叶前景：绿莲叶+粉莲花+栏杆）depth 从 -20 提到 -8（floor 之前），莲叶前景显出来，与参照前景一致。

## 石台（team-lead 批：不追）

原版参照那道米色雕花石台是"大闹天庭篇"该关的地面 art；我们 L1 用的 `floorBg1` 是天宫云景（自带蓝色浮空石台已在裁剪带里但融进云不显眼）。米色石台属别关 art，非本关素材。接受现状（L1 用云+莲叶前景，与参照的莲叶前景吻合），不强塞别关石台。

## 乌龟怪体型核查（team-lead 要求：只核不改，结论落此）

**结论：真渲染 bug，属关卡/怪物线，不归 UI 棒。**

`BattleScene.ts:937` 怪物 scale = `(isBoss?2.0:1.5) * (200/cellH)`——归一的是 **sheet cell 高度**（把任意 cellH 拉到 300px cell = 英雄 200×1.5），**不是角色轮廓**。实测 idle 帧 alpha 包围盒：
- 英雄 role1_0：轮廓 100px，填其 200 cell 的 50%，显示 100×1.5 = **150px**
- Monster7（cellH 150）：轮廓 101px，填其 150 cell 的 67%，显示 101×2.0 = **202px（英雄 1.35 倍）**
- Monster8：轮廓 94px，显示 188px（**1.25 倍**）

即怪物美术填满其（更小的 150）cell、英雄在其（更大的 200）cell 里有留白，cell 归一后怪的**轮廓**就比英雄大 1.25~1.35 倍。原版参照里怪与英雄大致同高，说明原版不用这套 cell 归一。**修法建议（不归我）**：按测量轮廓高度归一，或给每 species 一个对齐原版的 scale 因子，让轮廓≈英雄轮廓，而非 cell≈cell。

## 4 项承伤接线补丁（照 `hero-survivability-report.md` 精确应用，已进 `09cbbc2`）

所调用 systems 函数均已由承伤线提交（HEAD 实测存在）：① `resolveIncomingHeroDamage` 魔防分数 `0`→`heroMagicDef(this.identity)`；② `seedFromSave` 尾 + `doEquip`/`doUnequip` 后 `syncHeroEquipment(this.identity, this.equipment)`（不接裸血比改前低约14%）；③ `this.mp` 容量 `+this.identity.equipMaxMpBonus`（createMp + syncMpMax 两处）；④ `awardKillExp` 加 `species` 参数、`monsterExp(species)` 替 flat `MONSTER_KILL_EXP=80`（常量已删）。验证：tsc 干净、401 全绿、进战斗无 runtime error。魔防仅 L10+ 生效（曲线 L10 起 10%），L1 boot 观测不到效果，具体减伤 A/B 按承伤 report 由用户手玩定夺。

## 第二阶段测试基线
tsc `--noEmit` exit 0；`vitest run` 401 全绿（每 commit 后跑过）。验收全程用独立 playwright-core 脚本 + 缓存 chromium（`~/Library/Caches/ms-playwright/chromium-1228`）起自有 vite（`--port 5175 --strictPort`）——共享 MCP 浏览器被并行 agent 反复抢占，另起隔离链路。

---

# 第三阶段：HUD 抄 SWF 对象树重建（用户打回手搓，改抄上游，2026-07-07）

用户把第二阶段终版打回（措辞重）：血条几何不对（不等长细矩形、EXP 错位）、数字缩右侧小字、头像墨框稀疏、坞图标偏暗。核心纠偏：**停止"截图迭代手搓"，改抄上游 SWF 对象树坐标，子位图用原件不重绘，验收改机器可查的像素 diff。** commit `7288335`。

## 方法：export.RoleInfo 对象树 → 原件按原坐标组装

FFDec `swf2xml` 导出 `OtherMat1.swf`（vendor 再续天庭），提取 `DefineSprite 341 (export.RoleInfo)` 的 PlaceObject 子件坐标（twips/20 = px）：

| 子件 | chid | x | y | 说明 |
|---|---|---|---|---|
| bg | 264 | 1 | 2 | 墨团 + 3 锥形墨 track + 等级墨圈（226×86 shape） |
| head | 273 | 53.8 | 35.9 | 悟空脸 + 圆墨框（86×80，帧1） |
| hpline/mpline/expline | 298/301/304 | 85.5/86.7/86.7 | 16.3/35.1/54.8 | 血条；填充件 297/300/303 **实测都 143×11 等宽** |
| txthp/txtmp/txtexp | 305/306/307 | ~116 | 16.6/36/55 | 数字文本域（动态） |
| txtlevel | 308 | 7 | 61 | 等级（动态） |
| Yskill..Lskill | 278 | 130.5..290.4 | 518.1 | 5 坞槽（同 chid278 空框，间距 40） |
| wsmc 无双 | 286 | 100 | 542.8 | |
| btn_cw/fb/study/bb/set | 340/334/328/322/316 | — | 472~563 | 宠物/法宝/技能/青包/设置 簇 |

**关键真值**：三条血条填充 297(红)/300(蓝)/303(金) FFDec 导出实测**都是 143×11**——等宽、同 x 起点、y 等距叠放。我第二阶段按眼重画成不等长细矩形就是错在这里。

**组装（RoleInfoHud 重写，全用原件）**：`hud_ri_bg`(264) + `hud_ri_head`(273) + `hud_ri_hp/mp/exp`(297/300/303) 按上表坐标 place，不画任何胶囊/端帽/track。血条动态=`setCrop(0,0, 143×fraction, 11)` 露出 bg264 的空锥形 track（不是 scaleX 压缩、不是暗色盖）。数字居中压条、等级在墨圈。头像偏移 (8,-5) 是**对复合图跑 min 像素-diff 选的**（`for ax,ay: minimize diff`），非眼调。HP/MP/EXP 字母是唯一手写文字（对象树无独立标签位图），已注明。

## 像素 diff 验收（机器可查，非形容词）

**apples-to-apples 用同版本 vendor 复合图**（`hud_roleinfo_top_avatar_bars.png` = RoleInfo 原始渲染）：`tmp/debug-shots/ui-finish-hud-overlay-vendor.png` 四联 + 标注版 `ui-finish-hud-diff-annotated.png`。OVERLAY 里三条血条完全重叠、DIFF 里条身与头像近黑（几何零错位）。

**DIFF 亮区逐项（像素分类，team-lead 复审纠错后重算）**：
- HP/MP/EXP 标签 217px（10.8%）——复合图烘焙 vs 我用文字；
- 9999 数字 316px（15.7%）——动态；
- **chid262「怒气/无双充能条」1293px（64.1%）——复合图有、我省略（见下）。这是亮区绝对大头，我初版报告把它含糊成"复合图底部白条(我不含)"是不实，被 DIFF 自己揭穿，此处纠正。**
- 残余几何/边缘AA 192px（9.5%）——条边缘 + 头像 min-diff 偏移的抗锯齿，这才是真几何残差，很小。

即：几何层零错位成立，但亮区最大的是被我漏报的怒气条，不是标签/数字。

**跨版本说明（诚实）**：用户参照 `battle-hud-user2.png` 是 Online「大闹天庭篇」，而 `export.RoleInfo` 对象树**只在 vendor「再续天庭」**——已实测 Online 那批包（OtherMatv3570 等）不导出 RoleInfo，战斗 HUD 运行时渲染不落包。故几何真源是 vendor。强行 pixel-overlay vs Online 参照不会近零，但那是**跨版本差**（血值 19335 vs 34、绝对缩放不同、色差），非几何错位——按 team-lead"版本色差允许、几何错位不允许"的口径，同版本 vendor 复合图是唯一 apples-to-apples 的几何验证源。

## 坞图标（对象树结论）

RoleInfo 对象树里 5 个坞槽（Yskill..Lskill）都引用 `chid278`——是**空槽框**，技能图标运行时按装配的技能载入、不烘焙进坞。故不存在"战斗坞专用图标符号"；图标源就是技能图标集。第二阶段已从 `RoleSkillInterfacev3550.swf` 挖出 `skillicon_*`（sb_*，66px 亮火），实测比 `ss_*`（OtherMatv3570 chid1-40，45px 暗）亮一档，是现有最亮的技能图标源，坞已用。

## 第三阶段验证
tsc `--noEmit` 干净；`vitest run` 401 全绿（HUD 组件无测试，纯渲染）。验收链路仍为独立 playwright-core + 缓存 chromium + 自有 vite 5175。

## 遗漏子件核查：chid262「怒气/无双充能条」（team-lead 复审要求）

DIFF 底部整条白色胶囊件全亮，是 RoleInfo 对象树里我组装时跳过的子件。查实：
- **chid262 `herobeattacktimes`**，323×11 白色圆角空条，PlaceObject 于 (111.7, 78.0) sx=0.68（在 EXP 条下方）。
- **语义 = 怒气/无双充能条**：名字"被攻击次数"+ OtherMat1 XML 里 `rage`/`RAGE` 命中 + kagami `DropSystem.ts`/`SaveSystem.ts` 都有 `rage` 字段（掉落给怒气、存档持久化怒气）——是原版真机制，挨打/攻击攒满驱动坞上的「无双」大招。
- **处置（按 team-lead 规则"没有的系统→暂缺不造假"）**：本项目**没有怒气系统**（坞上无双按钮目前是装饰），故**不渲染**这条（渲染一条永远空的怒气条=给没有的系统造视觉假象）。**暂缺、点名记录于此**。kagami 侧已有 rage 逻辑，将来接怒气/无双系统时可移植，届时按 chid262 原坐标 (111.7,78,sx0.68) 渲染。可选：若要视觉完整，可加一条空 chid262 chrome，一行的事，待 team-lead/用户定。

## 裁决规则（team-lead 2026-07-07 补，写进 report）

参照图 `battle-hud-user2.png` 是 Online 实机，对象树源是 vendor 再续天庭。**若 overlay 出现系统性几何偏差且能证明是版本差异（vendor 对象树自洽、只是与 Online 布局不同），以 vendor 为准**（它是本项目复刻真源，CLAUDE.md 写死），分歧记进 report，**不许为贴 Online 参照回到手调**。像素 diff 硬判据 = 我们的渲染 vs vendor 对象树坐标 diff≈0；vs Online 参照的 overlay 仅作版本差异说明附上。

## vs Online 头像锚定 side-by-side（给用户判版本差的证物）

`tmp/debug-shots/ui-finish-hud-vs-online.png`（按头像同高对齐）：两版头像几乎一致，三条锥形墨条的位置/宽度/叠放几何非常接近——vendor 对象树几何与 Online 参照吻合。可见差异：① 血值（游戏状态，非 HUD）② Online 血条稍亮/饱和一档（版本色差）③ Online 有怒气条、我省略（见上 chid262）④ Online 数字更粗大。按裁决规则，几何以 vendor 为准且已证吻合；上述差异记录在此供用户判版本可否接受。
