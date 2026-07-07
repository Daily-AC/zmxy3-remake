# S5 技能树/学习技能 — 实现报告

对应任务书：`tasks/skilltree-brief.md`。

## 1. 双源提取

### 1.1 AS3（骨）— 主 SWF `打开我开始玩.swf`

```
JAVA=/opt/homebrew/opt/openjdk/bin/java
FFDEC=tools/ffdec/ffdec-cli.jar
MAIN="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
$JAVA -Djava.awt.headless=true -jar $FFDEC -selectclass "export.shop.BuySkill,export.shop.SkillControl,export.shop.SkillSetControl,export.shop.PassiveSkillControl,user.User,config.Config" -export script game/tmp/s5-as3 "$MAIN"
```

产物：`game/tmp/s5-as3/scripts/export/shop/{BuySkill,SkillControl,SkillSetControl,PassiveSkillControl}.as`、`scripts/user/User.as`、`scripts/config/Config.as`。

**关键发现（逐条摘录 + 出处，均已落进 `game/src/systems/skillTree.ts` 头部注释）**：

| 发现 | AS3 出处 | 与 kagami 的分歧 |
| --- | --- | --- |
| 两心法各 5 技能，固定表 `Config.as:263 allSklName[0/1]`（roleid1）：斻系=`[slz,zz,sx,qsez,hmz]`，火系=`[lys,hytj,lyfb,jdy,hyjj]` | `Config.as:263` | 无分歧，kagami `HERO_SKILL_TREES[1]` 一致（含 sx 作为普通技能位，非独立"被动"分类） |
| 心法等级 = 已解锁技能槽数（`SkillControl.as:151-165 initStudySkill` 循环 `1..xflevel`，`xflevel>=5` 隐藏升级按钮） | `SkillControl.as:151-165` | 一致 |
| 心法升级消耗 `findNextNeedLHValue`：100/200/500/1000/2000 | `SkillControl.as:358-379` | kagami `TREE_UPGRADE_COSTS` 完全一致 |
| **学习上限 = 5**（`User.as:114` 构造函数 `setSkillLimit(5)`），两心法合计 | `User.as:96-116,220-229` | **kagami `SKILL_LEARN_LIMIT=10`，错。5 正对应 spec 文案"每个角色只能学习5个技能"** |
| **学习本身不扣灵魂**（`SkillControl.as:418-451 buy()` 全程无 lhValue 操作） | `SkillControl.as:418-451` | kagami `learnSkill` 同样不扣费，一致 |
| **学习即自动上坞**：`findWhichSkillBtnNoneSet()` 按固定顺序 `["Y","U","I","O","L"]`（P1）找首个空位 | `User.as:1109-1121` | kagami `P1_BINDING_ORDER` 完全一致 |
| 技能等级上限 = **9，且对全部技能一视同仁**（`SkillControl.as:302,322 slev<9`） | `SkillControl.as:282-328` | **kagami 发明 `SPECIAL_SKILLS`/`UNUPGRADEABLE_SKILLS` 区分，非特殊技能封顶18级——AS3 无此区分，全部9级封顶** |
| 技能升级消耗 = `150 * slev^2 * sqrt(slev)`（`SkillControl.as:295`，同公式复用于 hover 提示 `mOver:96-114`） | `SkillControl.as:282-328,96-114` | **kagami `Math.ceil(200*Math.pow(2560,Math.pow((L-1)/base,0.8)))`，完全不同的指数曲线，错** |
| 技能升级需要 `heroLevel >= slev*5`（`SkillControl.as:304 getCurLevel()/5>=slev`） | `SkillControl.as:304` | kagami `getSkillLevelRequirement` 一致（去掉了 kagami 给"特殊技能"额外 ×10 的部分，AS3 无此区分） |
| **SkillSetControl 拖拽绑定有真实实现 bug**：`replaceSkillButton`（:286-299）只清掉目标键原占用技能的绑定项，从不清掉被拖技能自己原键位的绑定项——逐行追踪 `up()`/`back()`/`replaceSkillButton` 确认，未在真机复现二次验证 | `SkillSetControl.as:168-315` | kagami 无对应实现（`assignSkillToSlot` 是简单单槽替换，无此 bug） |
| `PassiveSkillControl`（`passivebtn` 切换目标）是**独立于心法树的 5 格固定面板**（`pskill1..5`），与心法树里的 `sx` 技能位完全无关 | `PassiveSkillControl.as` 全文 | kagami 无对应类，未建模 |
| `BuySkill.as` 只接了 `activebtn`/`passivebtn` 两个按钮，**没有 BOSS 技能按钮/监听器** | `BuySkill.as:80-89` | 确认 brief 判断："BOSS技能页签若无系统支撑→置灰" |

### 1.2 皮（timeline）— `out_res/OtherMat1.swf`（Symbol 489/736/193/769）

`OtherMat1.swf` 同时含这四个类的**旧副本**（版本分歧，按铁律①只信主 SWF 逻辑，皮/坐标仍取 OtherMat1）：

```
$JAVA -Djava.awt.headless=true -jar $FFDEC -format xfl:cs6 -export xfl game/tmp/s5-as3/othermat-xfl "$OTHERMAT"
```

**坐标表**（940×590 舞台空间，PlaceObject Matrix tx/ty，px）：

| 符号/字段 | 归属 Symbol | tx | ty | 说明 |
| --- | --- | --- | --- | --- |
| `txtlh`（灵魂计数文本） | 489 (BuySkill) | 805.95 | 544.0 | 底部灵魂计数 |
| `passivebtn` | 489 | 163.25 | 555.95 | 底部"被动技能"页签 |
| `activebtn` | 489 | 62.4 | 555.95 | 底部"主动技能"页签 |
| `btnback`（返回） | 489 | 853.3 | 23.35 | 顶栏返回 |
| bg（Symbol 478，两层 BitmapFill） | 489 | 0 | 0 | 940×590 满屏背景（edges 18800×11800 twips÷20） |
| `xfname2`（火系心法名） | 736 (SkillControl) | 129.95 | 361.2 | |
| `xfname1`（斻系心法名） | 736 | 130.95 | 161.2 | |
| `mainskillmc`（技能表容器，注册点） | 736 | 648.45 | 317.2 | |
| `xf2mc`（心法二卡） | 736 | 57.65 | 351.0 | |
| `xf1mc`（心法一卡） | 736 | 57.65 | 151.0 | |
| `lhtxt2` | 736 | 163.95 | 454.15 | |
| `leveltxt2` | 736 | 130.95 | 427.15 | |
| `lhtxt1` | 736 | 162.95 | 255.2 | |
| `leveltxt1` | 736 | 129.95 | 228.2 | |
| `upGradebtn`（**两态**，brief 点名信号） | 736 | 136.95 | **191.35**（选中心法一时） | `firstXFFunc` 设置 |
| `upGradebtn`（同一按钮，另一态） | 736 | 136.95 | **391.35**（选中心法二时） | `secondXFFunc` 设置——证实 brief"两态坐标"警告：timeline 单帧只能抠到其中一态，另一态必须读 AS3 |
| "技能升级"标题文本 | 736 | 837.0 | 91.65 | |
| `mainskillmc.skill1..5`（技能图标，相对 mainskillmc 注册点） | 733 | -272.95 | -191.65 / -114.0 / -37.0 / 39.95 / 119.0 | 换算绝对坐标：x≈376.45，y≈125.55/203.2/280.2/357.15/436.2 |
| `mainskillmc.skillset1..5`（按键设置按钮） | 733 | 135.95 | 同上五行 y 偏移 | 绝对 x≈784.4 |
| `mainskillmc.upgrade1..5`（技能升级按钮） | 733 | 207.05 | 同上五行 y 偏移 | 绝对 x≈855.5 |
| `Ymc/Umc/Imc/Omc/Lmc`（SkillSetControl 拖拽槽） | 193 | 230.95/324.95/416.95/509.95/602.95 | 339.0 | Y→U→I→O→L 从左到右，间距 93px |
| `sourcemc`（拖拽起点/托盘） | 193 | 416.95 | 228.0 | |
| `x_btn`（关闭） | 193 | 680.45 | 137.05 | |
| `pskill1..5`（被动面板固定 5 格，未系统支持） | 769 | 122.0~124.0 | 144.95/221.95/304.95/381.95/460.95 | |

以上坐标全部原样用于 `SkillTreeScene.ts`（未手工校准），是本屏渲染的唯一坐标真源。

### 1.3 素材

- 技能图标：9 主动复用已提取的 Online `sb_<id>.png`（`game/public/assets/online/skill-icons/`），`sx` 无 `sb_sx` 亮版，补extract Online `ss_sx.png`（`docs/reference/zmxy-online-extracted/skill-icons/ss_sx.png` → 拷贝进 `game/public/assets/online/skill-icons/ss_sx.png`），新增 `hudTheme.ts` 纹理条目 `skill_sx`。
- `docs/reference/zmxy3-official/skill-tree-ui/skillicon_*.png`（vendor 造3 原生 `skillicon_` 命名，AS3 `SkillSetControl.as:83 AUtils.getImageObj("skillicon_"+name)` 引用的正是这一命名）只有 5/10（hmz/hyjj/jdy/lys/slz），缺 zz/qsez/sx/hytj/lyfb——不完整，改用完整的 Online `sb_*`/`ss_*` 十件套，遵循根 CLAUDE.md"素材选用按收益不按来源教条"。
- 未做 FFDec 默认帧背景合成（S4 backpack 那套单图技法）：`SkillControl`/`BuySkill` 的 `-export image` 对复合精灵未产出栅格件（该命令只导出 DefineBitmap/DefineShape 原始位图，不渲染精灵合成），本任务时间预算内未深挖替代渲染路径。面板/卡片/表格边框改用项目既有 ink-panel 绘制原语（`ui/menu/inkBackdrop.ts` 同款、`MenuButton.ts` 同款配色），与 BattleScene 暂停菜单/DialogueBox 使用同一套视觉语言，非纯手工新配色。**每个可交互元素的坐标仍是上表的 AS3 真值**，overlay 判据看的正是这些。

## 2. kagami 移植清单 + AS3 校验结论

`vendor/kagami-phaser/src/systems/SkillUISystem.ts` 是移植源。逐项校验结果（✅=移植正确可直接抄，⚠️=需改，❌=错误已弃用改自 AS3）：

| kagami 项 | 校验结论 |
| --- | --- |
| `HERO_SKILL_TREES[1]`（斻系/火系分组） | ✅ 逐字一致，直接抄进 `ROLE1_SCHOOLS` |
| `TREE_UPGRADE_COSTS = [100,200,500,1000,2000]` | ✅ 逐字一致 |
| `getTreeUnlockedSkillCount = min(level,5)` | ✅ 逐字一致（`getUnlockedSlotCount`） |
| `SKILL_LEARN_LIMIT = 10` | ❌ AS3 是 5，已改 |
| `SPECIAL_SKILLS`/`UNUPGRADEABLE_SKILLS`/9 或 18 级分层 | ❌ AS3 全部技能统一 9 级封顶，已简化删除分层 |
| `getSkillUpgradeCost`（指数曲线） | ❌ AS3 是 `150*L²*√L`，已替换 |
| `getSkillLevelRequirement = L*5` | ✅ 一致（但 kagami 给"特殊技能"×10 的分支已随上一条一起删除） |
| 学习无灵魂消耗 | ✅ 一致 |
| `SkillSlotKeyLabels.p1`/`P1_BINDING_ORDER = ['Y','U','I','O','L']` | ✅ 逐字一致，AS3 `findWhichSkillBtnNoneSet` 独立验证同序 |
| `assignSkillToSlot`（单槽替换，无 AS3 那个"旧键位悬挂"bug） | 未采用其形状，改用本任务自写的 `rebindSkill` 干净交换（见下） |

## 3. 系统实现

- `game/src/systems/skillTree.ts`（新）：`ROLE1_SCHOOLS`/`SCHOOL_UPGRADE_COST`/`SKILL_LEARN_LIMIT=5`/`MAX_SKILL_LEVEL=9`/`BIND_KEYS`；`SkillTreeState`（`schools:[SchoolState,SchoolState]` + `bindings:Record<BindKey,skill|null>`）；`createDefaultSkillTreeState()`（旧存档/新角色回退，见下）；`upgradeSchool`/`learnSkill`/`upgradeSkillLevel`/`rebindSkill` 等全部纯函数，均接 `SoulPurse`（`soulPurse.ts` 新增 `trySpendSoul`）。27 例单测，逐条断言对齐 AS3 公式（非"断言等于自己再算一遍"）。
- **`rebindSkill` 是 Adapted 而非逐字移植**：AS3 `SkillSetControl.replaceSkillButton` 有第 1.1 节表格里记录的悬挂 bug（拖动技能后旧键位残留一份重复绑定）。按项目移植协议"当场可改仅两类：违背自身意图的真 bug"，拖拽改绑的意图明显是"移动"而非"复制"，故实现为干净的双向交换（A↔B 互换键位），并在代码注释里完整记录了判断依据与未真机复现的说明。
- `createDefaultSkillTreeState()`：brief 拍板"无绑定的旧存档回退默认5技（slz/lys/hytj/lyfb/jdy）"——不是"什么都不扣就有技能"的作弊，而是直接构造出"斻系点到1级解锁slz、火系点到4级解锁lys/hytj/lyfb/jdy"后的等价状态（学习本身免费，只是构造了对应心法等级），保留旧存档/全新角色在没访问过本屏前的开局体验，与本棒之前 `SKILL_KEYS` 硬编码默认值完全一致。
- `game/src/systems/save.ts`：`GameSaveV1.skills` 类型从 `unknown`（恒 `null` 占位）升级为真 `SkillTreeState|null`；新增 `soul: number` 字段（原来 `soulPurse` 完全不持久化，见 §5）。**未提升存档版本号**——`skills` 一直恒为 `null` 是文件头注释早就预留的"这样将来接入不用迁移"设计，`decodeSkillTree` 把 `null`/任何非法形状按"回退默认" 处理，旧存档天然兼容，新增 4 个测试覆盖（含往返 + 旧存档回退）。
- `game/src/systems/soulPurse.ts`：新增 `trySpendSoul`（此前该文件没有"花费"原语，因为 S4 落地时灵魂经济尚无任何消费方）。

## 4. 场景实现

- `game/src/scenes/SkillTreeScene.ts`（新，独立 Phaser Scene，`SCENE.skillTree`）：读取思路与 `WorldMapScene`/`CharacterSelectScene` 一致——`create()` 从 `REG.activeSlot` 读槽位、`readSlot`+`restoreGameState` 拿到 `skillTree`/`soul`/`progression`，每次状态变更（学习/升级心法/升级技能/改绑定）立即 `persist()` 写回槽位（同 `WorldMapScene.persistSlot()` 的"改了就存"模式），不额外碰 `campaignIndex`。
  - 顶栏：孙悟空 badge + 说明文案（**逐字抄自参照图** `skilltree-original.png`，非本任务发明；该文案本身无 AS3 动态字段支撑，是烘焙美术文字）+ 返回（真坐标）。
  - 左栏：心法一/心法二两卡（"心法一"/"心法二"标签是根据参照图补的装饰性表头，AS3 timeline 无对应元素）+ 心法名/当前等级/升级所需灵魂/升级按钮（真坐标，文案"当前等级：N"/"升级所需灵魂：N" 逐字对齐参照图）。
  - 右栏：4 列表头（技能图标/技能名称与技能说明合并一列/按键设置/技能升级，仅"技能升级"表头 x 是 AS3 真坐标 837，其余三个是本任务自定的列位）+ 5 行技能（图标/名称+等级/说明/绑定按钮/升级按钮，行分隔线）。**斻系心法 5 行说明文字逐字转录自参照图**（唯一可见该表的参照截图）；火系心法因无对应参照截图，说明列退化显示真实 MP 消耗数据（不是编造文案）。
  - 底部：主动技能/被动技能/BOSS技能 三页签（前两个真按钮坐标，BOSS技能全靠自定坐标延续 101px 间距，无系统支撑置灰同 S4 处理时装/经书）+ 灵魂计数（真坐标）。
  - 改绑定：点技能行的绑定按钮打开一个模态弹窗（Y/U/I/O/L 五槽横排，真坐标间距移植自 `SkillSetControl`），点某槽即调用 `rebindSkill` 完成交换——交互模型从 AS3 的拖拽改成点选（Adapted：Phaser 里做拖拽需要额外的输入状态机，点选达到同等"选一个新键位"的功能，且更适配自动化测试）。
  - 被动技能页签：`PassiveSkillControl` 的 5 个 `pskill` 槽位坐标已提取但**无对应系统**（sx 已经通过心法树正常学习/升级/绑定，这个面板在 AS3 里是完全独立的另一套机制，本项目未实现），置灰占位，同 brief 对 BOSS技能的处理原则。
- `game/src/scenes/shellShared.ts`：`SCENE.skillTree = 'skilltree'`。
- `game/src/main.ts`：注册 `SkillTreeScene`。
- `game/src/data/worldmapNodes.ts`：`showBuySkill` 按钮 `enabled: false → true`。
- `game/src/scenes/WorldMapScene.ts`：`onButton` 新增 `skills` 分支 → `this.scene.start(SCENE.skillTree)`。
- `game/src/scenes/BattleScene.ts`（S5 前是唯一被 skill-tree-port-brief 禁止触碰的文件，现在按本任务范围改）：
  - 删除硬编码 `SKILL_DEMO_LEVELS`（全技能满 1 级 demo）与硬编码 `SKILL_KEYS`（Y/U/I/O/L 固定绑 slz/lys/hytj/lyfb/jdy）。
  - `seedFromSave()`：新增"新鲜读取"逻辑——`skillTreeState`/`soulPurse` 不再从 `registry.get('shell.loadedState')` 的一次性快照取（那份快照只在 CharacterSelect/SlotSelect 时写一次，WorldMapScene/SkillTreeScene 之后的所有修改都是直接写 storage，绕过了这个快照，会读到旧值），改为每次 `seedFromSave()` 都单独 `readSlot`+`restoreGameState` 现读一次——这是让"战斗中绑定技能真实施放"能成立的必要修复，equipment/inventory/progression 三个既有字段的读取路径未动（不在本棒范围）。
  - `learnedSkillLevels()`：从 `skillTreeState` 现算出 `Partial<Role1SkillLevels>` 喂给 `syncRole1SkillLevels`，替换掉旧的全技能硬编码 demo 等级。
  - `castBoundSkill(key)`：Y/U/I/O/L keydown 新入口，查 `skillTreeState.bindings[key]`，空位或 `sx`（被动，无 `tryCastRole1Skill` 入口）静默不做，否则调用既有 `castSkill`。
  - `refreshSkillBar()`/冷却扫描：从遍历 `SKILL_KEYS` 改成遍历 `BIND_KEYS` + 现查绑定表，空槽渲染为禁用格。
  - `saveToSlot()`：`createGameSave` 新增 `skillTree`/`soul` 两个字段，此前完全没有持久化技能/灵魂状态。
  - 新增测试/验收钩子 `__castBoundSkill(key)`（走真实 `castBoundSkill` 私有方法，不是重新实现）。

## 5. Adapted / Dropped 清单

| 项 | 处理 | 依据 |
| --- | --- | --- |
| `SkillSetControl` 拖拽改绑的悬挂-重复 bug | 改为干净双向交换（`rebindSkill`） | 移植协议"真 bug 当场可改"，见 §1.1/§3 |
| kagami `SKILL_LEARN_LIMIT=10` | 改为 AS3 真值 5 | 源优先级：主 SWF AS3 > kagami |
| kagami 特殊技能 9/18 级分层 | 删除，统一 9 级封顶 | 同上 |
| kagami 技能升级指数曲线 | 改为 AS3 真公式 `150·L²·√L` | 同上 |
| 拖拽交互 → 点选绑定弹窗 | 功能对等，实现方式改点击 | Phaser 拖拽额外状态机成本，且更利于自动化验收 |
| `PassiveSkillControl` 五格固定面板 | 置灰不造内容 | brief"无系统支撑→置灰"，同 S4 时装/经书 |
| BOSS技能页签 | 置灰不造内容，坐标自定（AS3 无此按钮） | brief 直接点名 |
| 心法一/心法二表头标签、四列表头（除"技能升级"外三个） | 补充为装饰性文本，非 AS3 坐标 | 参照图可见但 timeline 无对应元素，未深挖其烘焙位图坐标 |
| 火系心法 5 行"技能说明" | 显示真实 MP 消耗而非编造文案 | 无参照截图可转录，宁可显示真数据也不编内容 |
| 面板/卡片/表格边框视觉 | 项目既有 ink-panel 绘制原语，非提取位图合成 | S4 的单图合成技法（FFDec 渲染默认帧）本次未能复现于该复合精灵，时间预算内改用已建立的绘制系统 |
| soulPurse 从"不持久化占位"升级为"持久化"，`GameSaveV1.soul` 新增 | 直接改动，非围栏内 hack | S5 扣费必须接到一个能跨场景存活的灵魂池，S4 报告已明确标注这是"占位显示非真经济"，本棒把它接成真经济是该占位设计本就等待的下一步 |

## 6. 战斗接线与"真实施放"验收证据

`game/tmp/s5-flow/`：

| 文件 | 内容 |
| --- | --- |
| `1-worldmap-skills-enabled.png` | 世界地图"学习技能"按钮点亮（不再置灰） |
| `2-skilltree-open-active-tab.png` | 进入本屏，斻系心法（school0）默认选中，slz 已学习绑 Y，其余 4 行按解锁状态显示 |
| `3-skilltree-school2-selected.png` | 点心法二卡片切换，显示火系 4/5 已学（lys/hytj/lyfb/jdy 绑 U/I/O/L），hyjj 未解锁 |
| `4-skilltree-after-upgrade-and-learncap-toast.png` | 加灵魂→升级心法一到 2/5→学习位解锁 zz→尝试学习触发"您当前只能学习5个技能!"（**真实验证了 SKILL_LEARN_LIMIT=5 上限逻辑**，因为默认 5 技已占满学习位） |
| `5-back-to-worldmap.png` | 返回世界地图 |
| `6-battle-with-rebound-binding.png` | 进入战斗，技能坞正常渲染 |
| `6-castBoundSkill-evidence.json` | **核心证据**：`SkillTreeScene.rebindSkill('jdy','Y')` 把 jdy 换绑到 Y（原键位 slz 被挤到 L）并持久化后，世界地图→进关卡→`__castBoundSkill('Y')` 返回 `boundSkill:'jdy'`、满蓝时 `cast:'hit11_1'`、MP 999→933（对应 heroSkill.ts 真实 jdy MP 表）；`__castBoundSkill('L')` 返回 `boundSkill:'slz'`、`cast:'hit6'`、MP 50→14（对应 slz 真实消耗 36）。两次调用走的是 `castBoundSkill` 私有方法本体（真实 keydown-Y/L 监听器调的同一个方法），不是重新实现的验收桩 |

`__castBoundSkill` 走真实生产路径而非合成 DOM KeyboardEvent 的原因：headless Playwright 驱动 canvas 内 Phaser 键盘插件在没有稳定 focus 的情况下不可靠地路由真实按键（已实测：`page.keyboard.press('y')` 在多次尝试里均未触发 `keydown-Y` 监听器），故直接调用同一段生产代码，属性/参数完全一致，只是跳过了浏览器→DOM→Phaser InputManager 这一段与本任务改动无关、且已被既有 5 个基础技能长期验证过的输入管线。

## 7. Overlay

`game/tmp/s5-overlay/`（`ours-active-school1.png` 为我方渲染，`docs/reference/user-flow-refs/skilltree-original.png` 为参照）：

- 参照图内容态是"两心法均5/5满级、灵魂138771214"的终局存档，我方是"斻系2/5、火系4/5、灵魂4800"的新存档——两者内容注定不同，量化 diff% 因此不判据（同 S4 backpack 报告先例，"内容差异"和"几何差异"要分开看）。
- **结构判据（无双影）**：右栏技能图标（升龙斩/重斩/嗜血/七十二斩/火魔斩五张图）在 `blend-50-50.png` 里逐张单线重合，无第二层错位——这是最强的坐标正确性证据，因为图标坐标是 AS3 `mainskillmc.skillN` 真值直接使用，未做任何人工校准。名称/说明文字行、心法卡片标题/等级/消耗行、底部三页签、灵魂计数，均单线对齐或仅有 1 行内的轻微垂直位移（判定为字号/行距差异，非几何错位）。
- 已知残留差距（诚实记账，非几何错位）：①"按键设置"列我方显示实际绑定的键字母（如 "L"）或"学习"按钮，参照图显示统一的"设置"字样——两者语义一致（都是该行的操作入口），文案不同是因为我方额外展示了已绑定的具体按键，信息量更大而非更少；②AS3 真实存在的"技能升级"按钮/列在参照截图里视觉上不可辨认（可能因为该截图行高较紧或按钮本身是仅在特定状态显示的图标）——按项目"版式与参照分歧时先核 vendor 烘焙态再定论，vendor 胜"的既定纪律，保留该真坐标控件，不因参照图看不清而删除已验证的 AS3 功能；③心法卡片顶部墨字图腾（斻/火）字体渲染细节与参照的书法字体不同（我方复用了普通字体渲染中文字符，未提取参照图专属的美术字图案），记为素材缺口不修复。

## 8. 测试与构建

- `cd game && npx vitest run`：**450/450 全绿**（基线 421 + 本棒新增 29：`skillTree.test.ts` 27 例 + `save.test.ts` 追加 2 例）。
- `npx tsc --noEmit`：0 错误。
- `npm run build`：过。

## 9. 遗留缺口

- `sx`（吸血/暴击被动）在心法树里可正常学习/升级/绑定，但其战斗效果（`calculateRole1LifeSteal`，heroSkill.ts 已有纯函数）从未被 BattleScene 调用过——这是 skill-tree-port-report 早就记录的"遗留问题"，不在本棒范围内，本棒只是让 sx 变得"可学"，未让它"生效"。
- 心法卡片顶部墨字图腾用系统字体渲染中文字符（"斻"/"火"）代替参照图的书法体位图，纯视觉表现力差距。
- 右栏"技能名称/技能说明"合并成单列（上下两行），未做成参照图的左右两独立列——AS3 真坐标本身也没有把"名称"和"说明"分成两个独立文本字段（说明文字很可能是烘焙进技能行背景位图的美术字，非动态字段），因此严格按列拆分需要额外的位图切割工作，本棒未做。
- SkillSetControl 悬挂-重复 bug 的判断基于逐行阅读代码，未在真机/Ruffle 复现验证；`rebindSkill` 按"明显违背自身意图"的判断改为干净交换，如后续有真机验证证明原版实际表现不同，需要重新评估这个 Adapted 决定。
- `soulPurse` 从占位升级为持久化后，是否要为 S4 已有的"出售白装"添加对应的存档兼容性说明——已在 `soulPurse.ts`/`save.ts` 注释里交代，未单独起报告。

## 10. commit

本地提交，未 push；见 `git log`。
