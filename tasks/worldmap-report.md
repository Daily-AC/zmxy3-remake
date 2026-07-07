# S1 世界地图 WorldMapScene — 交付报告

重派棒（原棒未完成即中断：留下了未接线的 `data/worldmapNodes.ts` + `systems/campaignProgress.ts` + 已提取的
`public/assets/extracted/worldmap/` 位图，但没有 `WorldMapScene.ts`、没有接线、没有 report）。本棒先独立复核了前人
留下的坐标/资产是否可信，再补完整棒。

## 复核结论：前人提取的坐标与位图可信，已用于本棒

没有信任遗留代码里的注释，重新跑了一遍 dual-source 管线的关键步骤做交叉验证：

- 重新用 FFDec 对主 SWF `打开我开始玩.swf` 跑 `-selectclass export.SelectPLace -export script`，拿到完整 AS3 源码（见下节逐条对照）。
- 对 `out_res/OtherMat1.swf` 跑 `-format xfl:cs6 -export xfl`，在 `Symbol 979.xml`（`linkageClassName="export.SelectPLace"`，确认类-符号映射）里逐一核对了全部 9 个关卡节点 + 6 个地标装饰 + 2 个宝箱 + 7 个按钮的 `Matrix tx/ty`，与 `worldmapNodes.ts` 里已有的常量**逐项完全一致**（无一处偏差）。
- `map_bg.jpg` 实测 940×590，与 AS3 反编译头部 `displayRect 18800x11800 twips`（÷20）吻合。

**结论：前人的 Step 1-3（骨/皮/位图提取）产物本身是对的**，中断点在 Step 4（转 Phaser/TS + 接线）——这棒从这里接着做。

## AS3 关键发现（`export.SelectPLace`，主 SWF，逐条原文摘录）

### 节点命名协议 + 三态帧语义

```as3
private function added(param1:Event) : void {
   ...
   while(_loc4_ < this.gc.curBigStage) {
      _loc2_ = uint(_loc4_ + 1);
      if(_loc2_ < this.gc.curBigStage) { _loc2_ = 3; }
      else { _loc2_ = uint(this.gc.curBigLevel); }
      _loc3_ = 0;
      while(_loc3_ < _loc2_) {
         this["s" + (_loc4_ + 1) + "_" + (_loc3_ + 1)].addEventListener(MouseEvent.CLICK, this.onSelected);
         ...
      }
   }
   this["s" + this.gc.curBigStage + "_" + this.gc.curBigLevel].gotoAndStop(2);
}
private function mOver(param1:MouseEvent) : void { param1.currentTarget.gotoAndStop(3); }
private function mOut(param1:MouseEvent) : void {
   if(param1.currentTarget != this["s" + this.gc.curBigStage + "_" + this.gc.curBigLevel]) {
      param1.currentTarget.gotoAndStop(1);
   } else { param1.currentTarget.gotoAndStop(2); }
}
```

节点命名 `s{bigStage}_{bigLevel}`；帧 1=normal、帧 2=current（`gotoAndStop(2)`）、帧 3=hover（`gotoAndStop(3)`，`mOver`）——与 `worldmapNodes.ts` 头部注释逐字吻合。`added()` 只给 stage 1..curBigStage、level 1..(该 stage 是否为当前 stage ? curBigLevel : 3) 的节点挂监听——即**从 s1_1 到 (curBigStage, curBigLevel) 全部可点**，与 `campaignProgress.ts` 的 `isCampaignLevelUnlocked`（`levelIndex <= currentIndex`）规则一致。

**发现的怪设计（记录不改）**：`init()` 里有 `if(!this.gc.isHideDebug){ this.gc.curBigStage = 4; }` ——未深究 `isHideDebug` 的默认值/切换点，但字面看这行会让 `added()` 把全部 12 个节点都挂上监听（等于全部解锁），与"按存档进度门控"的设计意图相悖，大概率是发布前应关闭的调试开关遗留。本棒**没有照抄这行**，节点解锁继续用我们自己的存档驱动逻辑（`campaignProgress.ts`），这是移植协议里"实现违背自身意图的真 bug 不抄"的适用场景。

### 关卡入口点击

```as3
private function onSelected(param1:MouseEvent) : void {
   this.gc.curStage = uint(...substr(1,1)...);   // "s1_2" -> stage=1
   this.gc.curLevel = uint(...substr(3,1)...);    // "s1_2" -> level=2
   this.gc.eventManger.dispatchEvent(new CommonEvent("selectStageOver"));
   ...
}
```

### 底部按钮的真实派发事件（逐一核对，含一处"名不副实"发现）

| 按钮 | AS3 方法 | 派发/行为 | 我们的映射 |
| --- | --- | --- | --- |
| savebtn | `saveGame()` | 序列化+加密+`FileReference.save`，`ts.setTxt("存档成功，记得时常备份存档！")` | SaveSystem；toast **原文复用**该字符串 |
| ldl | `ldlClick()` | `dispatchEvent(CommonEvent("showStrengthEquip",...))` | **确认**炼丹炉=强化装备(StrengthEquipment)入口，与 `FurnacePanel.ts` 头部注释（`export.strength.Making`/`StrengthEquipmentv1090.swf`）互相印证，复用 FurnacePanel 的选择是对的 |
| scgm | `scgmClick()` | `dispatchEvent(CommonEvent("showShoping"))` | 商城，本棒置灰 |
| showBuySkill | `buySkill()` | `dispatchEvent(CommonEvent("showBuySkill",...))` | 学习技能，本棒置灰 |
| rwbtn | `rwbtnClick()` | `dispatchEvent(CommonEvent("ShowTaskInterface"))` | 任务，本棒置灰 |
| **huodongbtn** | `huodongClick()` | **不是"活动"内容面板**——弹确认框把 `gc.difficulity` 在 0(普通)/1(困难) 间切换 | 按钮标签沿用参照图的"活动"（screen-fidelity-spec.md 定的样式判断），行为仍置灰不造——原 AS3 行为（出怪难度切换）不在本棒范围内，记录在此供后续棒参考，不当场造 |
| btnback | `backtomenu()` | `difficulity=0` + `switchSence("GameMenu")` + `initData()` | 返回主菜单 |

### 地标建筑门控（决定性证据：为何本棒把它们渲染成"真位置真美术但不可点"）

```as3
private function dsgClick(...) { // 斗兽场
   if(this.gc.player1.getCurLevel() < 40){ ts.setTxt("玩家的等级必须都大于40级才可以进入"); return; }
   this.gc.curStage = 12; ...
}
private function nmgClick(...) { // 南天门
   if(this.gc.curBigStage < 3 || (this.gc.curBigStage == 3 && this.gc.curBigLevel < 3)){
      ts.setTxt("请先通过朝会殿的考验！"); return;
   }
   this.gc.curStage = 4; ...
}
private function inToLingLongTower(...) { // 玲珑塔
   if(this.gc.curBigStage < 4){ ts.setTxt("请先通过凌霄宝殿的考验！"); return; }
   GMain.getInstance().switchSence("OpenAnimation");
}
private function renewalseOk3(...) { // 昆仑山 天庭主线模式
   if(this.gc.player1.getLhValue() < 5000){ ts.setTxt("灵魂不足！"); return; }
   this.gc.player1.setLhValue(...- 5000); ...
}
```

**修正一处此前理解的精度**：`worldmapNodes.ts` 注释写 "btnnmg 需要 curBigStage>=3"，AS3 原文实际是 `curBigStage<3 || (curBigStage==3 && curBigLevel<3)` 才拒绝——即真实门槛是"已过 stage3 的第 3 关"，比"curBigStage>=3"更严格一点。不影响本棒结论（这些系统我们都没有，节点依旧渲染为不可点占位），仅在此记录更精确的原文供以后棒引用。

**额外发现**：`sssl`（西部的建筑，`ssslClick`）在 AS3 里**完全没有门控**——直接 `curStage=9` 跳转，不像 dsgbtn/btnnmg/llbt/kls 那样有等级/进度检查。`worldmapNodes.ts` 把它和另外几个一起归为"有真实 AS3 门控逻辑"不够精确；已在此更正：`sssl` 本身无门控，只是它对应的"第9大关"内容在本港不存在，所以最终渲染结论（不可点占位）一致，但成因不同——不是"档位不够"，是"我们没做那一关"。

## xfl 坐标交叉验证

FFDec `-format xfl:cs6 -export xfl` 导出 `out_res/OtherMat1.swf` 的 `Symbol 979.xml`（`linkageClassName="export.SelectPLace"`），逐一核对每个具名实例的 `<Matrix tx="..." ty="...">`，与 `worldmapNodes.ts` 现有常量比对：

| 实例 | Matrix tx,ty | worldmapNodes.ts | 一致 |
| --- | --- | --- | --- |
| s1_1 | 703.45, 524.95 | 703.45, 524.95 | ✓ |
| s4_2（验证排除 s4 系列的依据） | 405.95, 674.2 | — | ✓ y=674.2 超出 590 stage，佐证排除理由 |
| btnback / dsgbtn / sgzz / kls / llbt / sorrybag / sl_sorrybag / ldl / scgm / showBuySkill / huodongbtn / rwbtn / btnnmg / savebtn / sssl | 全部逐一核对 | 全部逐一核对 | ✓（15/15，sgzz 的 `a=1.552`/`d=1.551` 也与 `scale: 1.552` 吻合） |

（s1_2/s1_3/s2_1/s2_2/s2_3/s3_1/s3_2/s3_3 的 tx/ty 同样逐一核对一致，因篇幅省略表格，方法同上。）

## 本棒发现并修的两个真 bug（渲染前人没做过的部分，不是"抄前人代码"）

### 1. 节点标记的锚点不是左上角（origin bug）

按 `docs/playbooks/ui-port-dual-source.md` 的既定惯例（RoleInfoHud 等一律 `setOrigin(0,0)` 直接用 Matrix tx/ty 当左上角），第一版渲染后节点标记（"通天梯"式关卡图标）几乎完全跑出画布——用 s1_1 验证：`centerPoint3DY - ty = 83.5 = height/2` 精确成立，但节点符号（Symbol 857 等 9 个关卡标记符号）的**帧 3（hover）是一个原始 DOMShape**，其 `BitmapFill Matrix tx="-74.75" ty="-110.05"`（151×167 导出位图的确切宽高）证明这批符号的本地 (0,0) 原点落在图形内部靠中间，不是左上角——与按钮/装饰/宝箱（原点在左上角，`setOrigin(0,0)` 直接可用）是两类不同的美术授权惯例。

逐个读了全部 8 个有清晰 shape 定义的节点符号（857/871/878/886/897/904/911/918）的 hover 帧 BitmapFill Matrix，换算成 origin 分数（`74.75/151=0.495` 这类），写进 `WorldMapScene.ts` 的 `NODE_ORIGIN` 表，全部落在 (0.44~0.66) 区间——即这批"地图钉"符号确实统一按接近视觉中心授权，不是随机噪声。`s1_3`（Symbol 864）的 hover 内容嵌套了多一层（`loop` 型子符号），没能拿到同样干净的 shape bounds，保留 `origin(0,0)` 近似并在代码注释里记录了这个已知误差（s1_3 本身也是四个可玩节点里视觉存在感最弱的一个，影响面小）。

### 2. 底部按钮排文字被裁切（cover-fit 居中裁剪 bug）

`worldMapTransform`（前人写的）用"按宽度铺满 + 上下对称裁剪"把 940×590 塞进 960×540 画布。按钮排 y≈506-508，裁剪掉的 62.5px 里对称各裁 31px——button 位图高 71px，正好把"学习技能""活动""任务"等标签文字的最后一行裁没了（`tmp/worldmap-flow/crop_buttons.png` 裁切前后对比截图为证）。这违背了这段代码自己的设计意图（"small overflow crop"本意是裁掉无关紧要的留白，不是裁掉功能性文字），按移植协议"实现违背自身意图的真 bug"条款修了：改成裁剪全部来自顶部（`offsetY = canvasH - stageH*scale`，底部贴齐画布底edge），顶部多裁约 30px（画面里是最上方庙宇尖顶上方的天空，无交互内容），换来全部 7 个按钮标签完整可读。已在 `data/worldmapNodes.ts` 里写明原因与取舍。

## 接线（Step 4）

- `CharacterSelectScene.confirm()`、`SlotSelectScene.continueGame()` 均改为 `scene.start(SCENE.worldMap)`（原来都直入 `battle`）——两条入口统一收敛到地图 hub，符合 CLAUDE.md 描述的"主菜单→存档→选人→世界地图hub→关卡战斗→回地图"结构，brief 原文只点名了 CharacterSelectScene，但 SlotSelectScene 的继续游戏若仍直入战斗会留一条绕过地图的暗路，一并改了。
- `BattleScene` 新增 `init(data: { campaignIndex? })`：WorldMapScene 点击节点时把具体关卡号传进去；没有 shell 的直接/调试进入 `battle`（`entryCampaignIndex===null`）时保留旧行为（读存档进度或默认 0），不破坏既有调试路径。
- `BattleScene.onAdvanceLevel()` 重写：不再在同一场景内 `startLevel(next)` 串关，而是用新写的纯函数 `advanceCampaignFrontier(clearedIndex, savedFrontier)`（`systems/campaignProgress.ts`，已单测）算出新进度（重打旧关不倒退），落存档后 900ms 提示后 `scene.start(SCENE.worldMap)`。顺手把 `BattleScene` 里手搓的 `levelKey`/`readSavedLevel` 私有重复实现替换成 `campaignProgress.ts` 的同名规范函数（同一个 key `zmxy3-remake.slot.v1.${slot}.level`，两处此前就是同一把 key 的重复实现）。
- `DialogueBox.ts`：炼宝按钮改成"仅当 host 传入 `onCraftEnter` 才渲染"；`BattleScene.buildDialogue()` 不再传 `onCraftEnter`——战斗内 老君 聊天保留，但炼丹炉入口从战斗对话框里拿掉了（`openCraftMode`/`furnacePanel`/`__openCraft`/`__submitCraft` 等验收钩子原样留着，只是 UI 上够不到，不删是因为怕破坏既有验收脚本）。
- 新增 `WorldMapScene.ts`：地图渲染（背景+9节点+6装饰+2宝箱+7按钮，全部坐标/origin 见上）、存档读写（`readSlot`/`writeSlot`/`readCampaignIndex`/`writeCampaignIndex`）、炼丹炉（复用 `FurnacePanel`，材料/存档来自持久化 slot inventory 而非战斗期 live inventory，自建一条 `NpcClient` 连接跑同一套 lock/request/validate/consume-refund 协议）、七个按钮的分发（save 真实存档，furnace 真实开炉，back 回主菜单，其余四个 toast"敬请期待"）。
- `main.ts` 注册 `WorldMapScene`，场景顺序 `[MainMenu, SlotSelect, CharacterSelect, WorldMap, Battle]`。

## Adapted/Dropped 决策清单

| 决策 | 依据 |
| --- | --- |
| Adapted：地图节点解锁用存档驱动（`campaignProgress.ts`）而非照抄 AS3 `curBigStage=4` 调试覆盖行 | 该行与"按进度门控"的设计意图相悖，判定为真 bug 不抄（见上文"发现的怪设计"） |
| Adapted：4 个 CAMPAIGN 关卡映射到 s1_1→s2_1（AS3 原始 stage-major/level-minor 遍历顺序的前 4 个） | 我们只有 4 关内容，s2_2/s2_3/s3_1-3 按 brief 渲染为灰态占位不可点 |
| Dropped：s4_1-3（Symbol 848） | Matrix ty=674.2 超出 590px stage，位图本身也是空/透明，无可诚实渲染的内容 |
| Dropped：dsgbtn/btnnmg/llbt/kls/sgzz/sssl 六个地标建筑的真实跳转 | 背后系统（斗兽场/南天门/玲珑塔/灵魂货币/Sgzzinterface/第9大关）本港均不存在；真位置真美术，不可点，不造假 |
| Adapted：huodongbtn 保留"活动"标签与灰态，不还原 AS3 真实的"难度切换"行为 | 与参照图/screen-fidelity-spec.md 的样式判断一致（按钮标签沿用参照图），行为置灰是这棒的既定范围；已记录供后续决定要不要接回真实难度切换 |
| Adapted：炼丹炉迁到地图（WorldMapScene 自建 NpcClient + furnace 协议），战斗内老君对话去掉炼宝按钮但保留聊天 | brief 明确要求；`ldlClick` 的 `showStrengthEquip` 事件也印证炼丹炉本就该是地图入口而非战斗内对话的附属功能 |
| Fixed（非设计变更，真 bug）：节点 origin、按钮排裁剪 | 见上文两个真 bug 小节，均以实测数据（xfl shape bounds / 裁切前后截图）为依据，不是审美判断 |

## 素材来源清单

`game/public/assets/extracted/worldmap/`（前人 Step 1-3 产物，本棒复核坐标后原样使用）：`map_bg.jpg`（地图大图，940×590）、`node_s{1-3}_{1-3}_{normal,current,hover}.png`（9 组关卡节点×最多3态，部分只有一态）、`deco_{dsgbtn,llbt,sgzz,btnnmg,kls,sssl}.png`（6 个地标建筑）、`chest.png`（左右上角补偿礼包共用一张）、`btn_{save,shop,furnace,skills,activity,tasks,back}.png`（7 个底部按钮，图标+竖排小字已烘焙进位图）。

## 测试与构建

- `npm test`：413 passed（基线 401+ 之上，本棒新增 4 条 `advanceCampaignFrontier` 单测，`tests/campaignProgress.test.ts` 从 8 条增至 12 条）。
- `npm run build`：`tsc --noEmit` + `vite build` 均过。

## Overlay 自查结论（非自评分数，给可查证据）

- `tmp/worldmap-overlay/side-by-side.png`：参照图（960×646，重采样到 960×540）与我方渲染并排。地图大图/地标建筑/宝箱/按钮排的相对位置与参照图高度吻合；桥拱/台阶结构因参照图纵横比与我方 940×590→960×540 变换不同（参照图实际是 960×646，比我们的画布更"高瘦"，重采样会引入非本棒引入的形变）存在几像素级横向偏移，**已用直接核对过的 xfl Matrix 坐标渲染，非目测摆放**——这个偏移来源于参照图本身的宽高比，不是坐标错误。已在此点名，未回避。
- `tmp/worldmap-overlay/blend-50-50.png`、`diff.png`：50/50 混合与差值图，供进一步像素级复核。
- `tmp/worldmap-flow/crop_buttons.png`：按钮排裁剪 bug 修复后的确认截图，7 个标签全部完整可读。
- 关卡节点标记（"current" 态的金色阶梯纹样）在地图上确实很不显眼（原始位图透明度均值仅约 11%，是原版自己的设计——hover 态才会点亮 + 弹出地名"九重天"），不是渲染缺失；已用 `NODE_ORIGIN` 定位后确认其落点位于拱门structure附近，与其 hover 态图片里能看到的"九重天"字样及所处方位相符。

## 流程截图三连（`tmp/worldmap-flow/`，实为 4 张，多一张覆盖更完整）

1. `1-charselect.png`：选人确认前
2. `2-worldmap.png` / `2-worldmap-canvas.png`：确认后落地世界地图（当前关卡 s1_1 高亮）
3. `3-battle.png`：点击 s1_1 节点进入 BattleScene（`__worldState()` 验证 `campaignIndex:0, levelName:"巫鹰关"`）
4. `4-worldmap-after-clear.png`：击杀 boss、走传送门通关后，`__shellMapState()` 验证 `currentIndex:1`、s1_1→unlocked、s1_2→current，画面回到世界地图（不是回选人/串行下一关）

另有 `tmp/worldmap-overlay/furnace-open.png`：从地图点"炼丹炉"，`FurnacePanel` 正确弹出并显示战斗中获取、经存档持久化的真实材料（妖怪残魂×20、白银矿石×12）。

## 全流程功能验证（Playwright + 存档钩子，非"代码像对的"）

- 选人确认 → 世界地图（`__shellScene()==='worldmap'`）。
- 点击已解锁节点 → 进入对应 `campaignIndex` 的 BattleScene（`__worldState()` 核对关卡名）；点击未解锁节点（`__shellMapEnterLevel(3)`，s2_1）→ 返回 `false`，不跳转。
- 击杀全部小怪 + boss（`__killGrunts`/`__killBoss`）→ 传送门开启 → `__usePortal()` → 900ms 后场景切回世界地图，`campaignProgress` frontier 正确从 0 推进到 1（重打 s1_1 不会倒退，测试用例已覆盖该分支）。
- 刷新页面（模拟重启）→ 主菜单→读档→继续游戏 → **不再直入战斗**，落地世界地图且 `currentIndex` 与关卡解锁态从 localStorage 正确恢复。
- 保存游戏按钮：调用 `persistSlot()`，toast 文案为 AS3 原文"存档成功，记得时常备份存档！"。
- 炼丹炉按钮：材料为空时 toast 提示去打怪；有材料时正确弹出 `FurnacePanel` 并回显持久化背包（见上）；NPC 离线（本地未跑 agent-server，符合预期）时 `submitCraft` 正确拒绝并提示"太上老君正在闭关…"。
- 商城/学习技能/活动/任务四个禁用按钮：点击均 toast"敬请期待"，不跳转不报错。
- 返回按钮：回到主菜单，NpcClient 正确 dispose（无残留 WS 重连）。

## 遗留缺口

1. `s1_3`（Symbol 864）节点标记的精确本地锚点未能从 xfl 直接拿到（内嵌 loop 子符号多一层），保留 `origin(0,0)` 近似——四个可玩节点里唯一一个未做精细校准的，视觉上是最不起眼的一个（影响面小，已记录不隐瞒）。
2. 参照图 `worldmap-original.png` 实际分辨率 960×646，与我方固定 960×540 画布纵横比不同，overlay 对比时的重采样会引入原图本身没有的形变，不是我方坐标误差——已在 overlay 结论里点名，未来若拿到更高分辨率或原始纵横比的参照图可以做更精确的像素级比对。
3. huodongbtn（"活动"）真实 AS3 行为其实是难度切换而非活动面板，这次只按 brief 置灰不还原真实行为；是否要在未来棒里把"活动"改名/改行为对齐 AS3，留给用户拍板。
4. 炼丹炉在地图上是全新一套独立的 `NpcClient` 连接 + craft 状态机（未跑通真实 agent-server 环境下的端到端结果验收，因为本地没有起 agent-server；lock/refund/超时/reject 四条分支复用了与 BattleScene 完全相同、已在生产验证过的 `systems/furnace.ts` 协议函数，逻辑上是同一套，但"服务端真实返回一件装备"这条端到端路径这次没有条件跑通，只验证到"请求正确发出被拒绝重试"这一步）。
5. 左右上角"补偿礼包"宝箱、六个地标建筑维持"挖到就摆，不可点"，与 brief 一致，未新增任何点击造假内容。

## Commit 列表

见本次 session 的本地 commit 历史（未 push）。

## 终审返修（2026-07-08 02:3x~03:2x，主会话终审 + 就地收尾）

终审结论：AS3 骨/坐标/接线/测试全过，两项打回。返修由 s1b（舞台映射）与主会话（因 s1b 会话被平台策略误报中断两次，主会话按同一套推导就地收尾）完成。

### 1. 舞台映射：cover+顶部裁切 → contain 等比 + pillarbox

原版舞台 940×590（主 SWF header displayRect 实证）。原 cover-fit 裁掉顶部 62px 真实内容（两角补偿礼包宝箱被切半、金顶天宫顶部出画），参照图完整显示这些内容——裁内容比黑边更伤保真。改为等比 540/590≈0.9153、水平居中、左右各 ~50px pillarbox（`worldMapTransform`，s1b 完成）。像素级验证：渲染截图 0–49 与 911–959 列为统一场景底色 (11,14,25)，舞台内容恰占 50–910，无越界（底色非纯黑，记豁免）。

### 2. Overlay 方法重做 + 由此揪出的第三个真 bug（装饰件 origin）

旧 overlay 把 960×646 参照图直接重采样到 960×540，两侧几何未对齐，diff 全图鬼影不可判。重做：按行暗度剖面切掉参照图上下黑框（游戏区 rows 26–629，960×604，纵横比 1.589≈940/590，证明参照图本身就是等比完整舞台），等比缩放到我方舞台矩形 (50,0)–(910,540) 再 blend/diff。

对齐后 diff 暴露**装饰件系统性右下偏移**（双影签名）：`WORLDMAP_DECORATIONS` 渲染写死 `setOrigin(0,0)`，但六个地标符号里五个的本地原点在图形内部——与节点标记同类 bug，原报告"buttons/decorations/chests 都是左上锚"的断言对 decorations 不成立。修复：`tools/worldmap-deco-origins.py` 解析 OtherMat1 swf2xml，沿 PlaceObject 矩阵链递归到 shape bounds，算出 visual-state 并集 bounds → origin 分数（button 态含 over/down；注意 over/down 记录可能同时挂 hitTest 标志，不能按 hitTest 排除）。结果（bounds 与导出 PNG 尺寸逐一吻合）：

| 符号 | id | origin | 备注 |
| --- | --- | --- | --- |
| dsgbtn | 847 | (0.516, 0.563) | sprite |
| llbt | 973 | (0.500, 0.500) | button，150×164 全态并集=PNG |
| sgzz | 889 | (0, 0) | 本就左上锚，diff 中始终对齐互证 |
| btnnmg | 931 | (0.668, 0.487) | sprite |
| kls | 924 | (0.538, 0.535) | bounds 171×156 vs PNG 171×160，≤4px 残差记豁免 |
| sssl | 840 | (0.525, 0.504) | sprite（=左下大树） |

方法交叉验证：同一推导复现 s1_1 (0.495,0.659)、s1_2 (0.460,0.532)，与原报告 BitmapFill 法逐位一致。顺带解决遗留缺口 #1：s1_3（Symbol 864）实为 677×568 大场景 sprite（石牌坊+台阶），递归 bounds 得 origin (0.101,0.102)，`NODE_ORIGIN` 补齐，origin(0,0) 近似移除——旧 diff 里牌坊双影即此。

### 3. 返修后判定（证据）

- 量化：舞台区 |diff|≥40 像素占比 11.5% → 7.68%；**双影全部消失**（llbt/dsgbtn/sssl/kls/btnnmg/牌坊只剩 AA 轮廓）。
- 剩余亮斑全为状态差非几何差，豁免清单：未解锁节点 GREY_TINT 置灰 vs 参照图已推进存档全彩（含 s1_3 整幅场景画）；宝箱发光帧；按钮亮暗态与烘焙文字；AA/重采样模糊；kls ≤4px；场景底色 (11,14,25) 非纯黑。
- 证据文件：`game/tmp/worldmap-overlay/rework2-{blend-50-50,diff}.png`、`rework-ref-aligned.png`（几何对齐后的参照）、`game/tmp/worldmap-flow/rework2-worldmap-canvas.png`（宝箱/金顶天宫完整可见）、`rework2-battle.png`（地图点岛进战斗仍通）。
- 回归：413 测试全绿，`npm run build` 过。frontier 推进视觉证据沿用首轮（2-worldmap vs 4-worldmap-after-clear 像素 diff bbox 恰为台阶区，本次变更不触碰该逻辑）。
