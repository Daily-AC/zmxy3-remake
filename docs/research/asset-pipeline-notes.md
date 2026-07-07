# 素材管线测绘笔记（out_res 34 个 SWF）

2026-07-07 实测。SWF 源：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/`；
游戏主逻辑 SWF（含全部 AS3 代码，未加密）：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`。
FFDec CLI：`/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar`。

## 核心发现：ROLE1_* 为什么 `-export sprite` 导不出来

`ROLE1_0`~`ROLE1_11`（时装整身）、`ROLE1_EQUIP_0`~`9`（武器外观）、`ROLE1_SHALLDOW`
**不是 MovieClip，而是 DefineBitsJPEG3 / DefineBitsLossless2 位图 tag**（WuKong.swf chid 1–15，
用 `-dumpSWF` 可见）。它们是 1200×2800 的 spritesheet（6 列 × 14 行，单元格 200×200），
所以 sprite 导出器直接跳过；必须用 **image 导出器**：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectid 12 -format image:png -export image \
  vendor/extracted/WuKong_body \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/WuKong.swf"
```

产出 `vendor/extracted/WuKong_body/12_ROLE1_0.png`（悟空默认时装整张表，带 alpha）。
chid ↔ 类名对照来自 `-export symbolclass`（symbols.csv）：12=ROLE1_0，13=ROLE1_EQUIP_0，
9=ROLE1_SHALLDOW，其余 1–15 同理。武器外观同法导出（`-selectid 13`），
与本体同一网格，运行时按同帧坐标叠加合成。

切帧（已验证，62 帧落在 `vendor/extracted/WuKong_body/frames/`）：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
python3 -m venv vendor/extracted/.venv
vendor/extracted/.venv/bin/pip install pillow
vendor/extracted/.venv/bin/python tools/slice_role1.py \
  vendor/extracted/WuKong_body/12_ROLE1_0.png \
  vendor/extracted/WuKong_body/frames
```

## 动作 → 网格坐标映射（帧标签的真源）

资源 SWF 里**没有帧标签**——动作分段全部硬编码在主逻辑 SWF 的
`export.hero.Role1.setAction()` 与 `initBBDC()`（`base.BaseBitmapDataClip` 驱动）。
提取脚本的命令：

```bash
cd /Users/e0_7/Projects/zmxy3-remake
/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar \
  -selectclass export.hero.Role1,base.BaseHero,base.BaseBitmapDataClip,base.BaseBitmapDataPool \
  -export script /tmp/zmxy-scripts \
  "vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
```

Role1（悟空）动作表，`(起始列, 行, 帧数)`，单元格 200×200：

| 动作 | 列 | 行 | 帧数 | 说明 |
| --- | --- | --- | --- | --- |
| wait | 0 | 0 | 6 | 待机 |
| wait2 | 0 | 1 | 2 | 待机变体（长时间不动） |
| walk | 0 | 2 | 4 | 走 |
| run | 0 | 3 | 4 | 跑（独立帧行，不是 walk 加速） |
| jump1 / jump3 | 0 / 1 | 4 | 各 1 | 起跳 / 下落 |
| hit9 / hit10 / hit11_1 / hit11_2 | 2 / 3 / 4 / 5 | 4 | 各 1 | 技能施法姿势（第 4 行是单帧杂物行） |
| jump2 | 0 | 5 | 5 | 二段跳翻滚 |
| hit1 / hit2 | 0 | 6 | 5 | 普攻一段/二段共用行 |
| hit3 | 0 | 7 | 5 | 普攻三段 |
| hit4 | 0 | 8 | 5 | 上挑 |
| hit5 | 0 | 9 | 5 | 下砸 |
| hit6 | 0 | 10 | 4 | 技能 |
| hit8 | 0 | 11 | 4 | 技能 |
| hit12 / hit7 / hurt / hit13 | 0 / 1 / 2 / 3 | 12 | 各 1 | 单帧行；hurt = 受击 |
| hit14 | 0 | 13 | 3 | 无双 |

节奏数据（`initBBDC()` 原文）：
`setFrameStopCount([[2,2,2,3,2,4],[5,5],[4,4,4,4],[2,2,2,2],[1,1,13,100,hit11,hit11],[2,2,2,2,2],[2,2,1,1,3],[1,1,1,1,5],[1,1,1,1,5],[2,2,1,1,5],[2,2,1,6],[2,3,2,3],[17,15,15,10],[2,12,16]])`
——每行一个数组，**数组长度 = 该行实际用的格数，每个值 = 该格停留的 tick 数**。
`setFrameCount([36,8,4,4,[1,1,1,1,1,1],5,5,5,5,5,4,4,[1,1,1,1],3])`
——每行播满多少个 keyframe 步触发一次 frame-over 回调（循环/收招判定）；数组形式表示该行按列独立计数。
渲染偏移 `setOffsetXY(5,-15)`（hit14 时 `(5,-30)`）。
Role2/3/4 同构，各自的表在 `export.hero.Role2/3/4.setAction()`；Role5（白龙）走 ZM4 分片资源，另一套。

弹幕/技能特效（`Role1Bullet1`~`Role1Bullet14_*`）**是**真 MovieClip，
上一轮 `-format sprite:png -export sprite,symbolclass` 已能正确导出逐帧 PNG——那条命令没错，
只是对位图类资产天然无效。

## 34 个 SWF 盘点

方法：每个 SWF 跑 `-dumpSWF`（顶层 tag 直方图）+ `-export symbolclass`（绑定类名清单）。
所有 34 个包都带 DoABC（只是资源绑定类），真正的游戏逻辑全部在 `打开我开始玩.swf`（约 5 MB）。

### 角色包（位图表 + 弹幕 MC 的双结构）

| SWF | 内容 |
| --- | --- |
| WuKong.swf | Role1 悟空：ROLE1_0~11 时装表、ROLE1_EQUIP_0~9 武器表、ROLE1_SHALLDOW 影子（均为位图，chid 1–15）+ Role1Bullet* 技能弹幕 MC ×19 |
| TangSeng.swf | Role2 唐僧：ROLE2_* 同构 + Role2Bullet* + 共享基类壳（ObjectBaseSprite*、HeroBeHurt、MonsterBeHurt1/2） |
| BaJie.swf | Role3 八戒：ROLE3_* + Role3Bullet* |
| ShaShen.swf | Role4 沙僧：ROLE4_SHOVEL_*/ROLE4_ARROW_*（铲/弓两套时装表）+ ROLE4_EQUIP_* + Role4BulletArrow*，24 个 ROLE 符号，34 包里最多 |

### 关卡场景包（数字名，结构一致）

统一结构：`bg<N>x` 背景层位图 + `floorBg<N>` 地面 + `files<N>` 关卡容器 MC +
本关怪物（`Monster<M>` 本体 + `Monster<M>Bullet*` 弹幕）。怪物本体与角色一样多为位图表。

| SWF | 关卡 | 亮点 |
| --- | --- | --- |
| 0.swf | 第 0 关（教学） | 仅 4 符号 |
| 1.swf–10.swf | 第 1–10 关 | 各关杂兵 + Boss（如 3.swf 含二郎神 Monster22 及其 HP_REJECT 机制符号） |
| 12.swf | 第 12 关 | 含 Stage12XDialogue 剧情对话 MC |
| 14.swf | 第 14 关 | 小包，Monster61 |
| 17.swf | 第 17 关 | 混入 fl.controls UI 组件 |
| 1000.swf | 第 18 关（天庭章） | files18 + Monster1001/1002/1111 Boss 群 |
| zmⅣMonsterInfo.swf | 第 13/15/16 关合包 | files13/15/16 + bg151/bg161 + Boss Monster1003/1007（files11 全库未见，第 11 关疑不存在或并入他包） |

### 日期名补丁包（后期追加内容）

| SWF | 内容 |
| --- | --- |
| 20120117.swf | 四角色 6 号时装（ROLE1_6~ROLE4_*_6）+ HeroReLive 复活特效 |
| 20120119.swf | 四角色 5/7 号时装与武器 + ZhuanLunWangSzEffect |
| 20120203.swf | 宠物弹幕大包（PetTiger/PetKabu/PetMonkey…）+ 少量 ROLE 符号 |

### 功能/系统包

| SWF | 内容 |
| --- | --- |
| Common1.swf | 通用 UI + 春节/卡布活动界面（fl.controls、export.huodong.*） |
| backpack1.swf | 背包/任务/装备强化合成分解界面（export.strength.*、export.taskInterface.*） |
| EIcon1.swf | 866 个符号：装备/技能/Buff 图标库 + 称号特效，全游戏最大符号包 |
| OtherMat1.swf | 304 符号杂项：选人 SelectRole、选关 SelectPLace、传送风 TransferWind、场景交互物 |
| MagicWeapon.swf | 法宝特效 + export.magicWeapon.* 逻辑绑定类 |
| pet1.swf | 宠物全家桶：135 符号（凤凰/龙/虎/卡布/猴 本体 + 弹幕） |
| Monster47.swf / Monster60.swf | 独立 Boss 包（含 Monster155Spritenew） |
| Music.swf | 纯音频库：84 个 DefineSound（BGM + 角色技能音效 Role4_hit* 等） |
| SD1.swf | PK 竞技场/房间/聊天 UI（export.muti.*、PK_DAOJISHI 倒计时） |
| sgzz.swf | 单一活动界面 Sgzzinterface（2 符号） |

## 建议的批量导出策略

1. **每包先导 symbolclass**（秒级），拿 chid↔类名表作路由：
   `-export symbolclass <out> <swf>`。
2. **位图类资产**（ROLE*_*、Monster 本体、bg*、图标）：`-format image:png -export image`
   全量导出，文件名自带 `<chid>_<类名>.png`；角色/怪物表再按各自 `setAction()`
   的网格表切帧（仿 `tools/slice_role1.py`，注意每个角色 cell 尺寸可能不同，
   以各 Role/Monster 类 `new BaseBitmapDataClip(..., w, h, ...)` 为准）。
3. **MovieClip 类资产**（*Bullet*、特效、UI）：`-format sprite:png -export sprite`
   逐帧 PNG（上一轮已验证可用）。
4. **音频**：`-export sound` 对 Music.swf（84 条，符号名即用途）。
5. **动作节奏**：从 `打开我开始玩.swf` 按需 `-selectclass export.hero.RoleN -export script`
   抠 `setFrameStopCount/setFrameCount`，换算成 Phaser anims 的 frameRate/duration；
   资源 SWF 内不要找帧标签，没有。
6. 产物统一落 `vendor/extracted/<包名>/`，原始 SWF 只读不动。
