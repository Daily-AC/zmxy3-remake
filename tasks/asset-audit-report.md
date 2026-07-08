# 素材卫生审计报告（asset-audit 棒）

只读审计，未改动任何文件。范围：`game/public/assets/` 下全部图片（`fonts/` 除外）。
判定三类问题：A=截图裁切脏件（烘焙台词/无关角色碎片/UI 残影/屏幕杂物）；B=疑似滤镜灰图（本应彩色却整体去饱和）；C=来源可疑（风格不符/分辨率异常/压缩噪点像网图）。

## 总数与覆盖

- 总图片数（除 fonts）：**234 张**
- 亲眼看过：**234 张全部**（ui/menu/hud/worldmap/skilltree/icons/online/prefab/npc 逐张全高清看；level 背景与怪物 spritesheet 用接触印相图逐张扫，可疑者再全高清）
- 判定有问题（脏件/坏件）：**3 张**（2 张 A 类脏截图 + 1 张空图；其中 title-bg 是活体、玩家首屏可见）
- 另有 **~11 张干净但已成死件/孤儿**（非脏，属仓库卫生，单列）

## 最严重的 3 个发现

1. **`online/title/title-bg.png`（A 类，活体，玩家首屏）** —— 整张是造梦西游 Online「大闹天庭篇」的**宣传截图**，里面烘焙了：4399 的**版权法律声明**全文（"造梦西游online 系列作品已获得版权登记…四三九九网络股份有限公司"）、Online 官方 logo（**游戏名已改「再续西游」，这是错名**）、Online 菜单项（"多种限时副本开启/邪子鼠开启"）、右侧黑色信箱边+角标。当前被 **MainMenuScene 主菜单背景**和 **SlotSelectScene 存档屏背景**两处直接 load 使用。右侧不透明面板只挡住右上角角标，**左中部的角色群、online logo、菜单项、版权声明块全部露在背景上**。这是本轮最严重脏件——玩家一进游戏就看到别家产品的版权告示和错误游戏名。

2. **`extracted/ui/dialogue_fullscene_stage12_frame1.png`（A 类，孤儿）** —— 过场截图硬裁条，烘焙了台词"太上老君，滚出来。竟敢勾结二郎神挟持玉帝。"+ 左侧老君头肩碎片 + 右侧二郎神碎片。这正是已被换掉的 `dialogue_textpanel_crop` 当初裁切的**源截图**。全库无任何代码引用，是历史糊弄件残留。

3. **`extracted/level2/floorBg2.png`（空图/坏导出，L2 在范围内）** —— 文件完全透明（bbox=None，0 不透明像素），是空的 FFDec 导出。`BattleScene` 会为 L2 load `floorBg2` 当地面层。不属三类脏件，属"空/坏导出"。代码注释（BattleScene.ts:984-988）称 vendor L2 本无独立地面层，故空图**可能是有意占位**而非漏导——标"疑似"，请团队一眼定性（同族 floorBg3/floorBg4 也是空图，但属已摘除的 L3/L4，影响面小）。

## 问题清单（脏件/坏件）

| 路径 | 类别 | 证据 | 引用点 | 影响面 | 处置建议 |
|---|---|---|---|---|---|
| `online/title/title-bg.png` | A（活体） | 整屏 Online 宣传截图，烘焙 4399 版权法律声明全文 + online logo（错名）+ 菜单项 + 信箱黑边 | MainMenuScene.ts:58,64（主菜单背景 cover-fit）；SlotSelectScene.ts:81（存档屏背景） | 玩家首屏 + 存档屏，两处高频可见 | **生图替换**：首页 keyart 已由 art-keyart 棒按 style bible 重画（总纲 0 条），落地后即弃用此件；在替换落地前它是当前活体最严重脏件 |
| `extracted/ui/dialogue_fullscene_stage12_frame1.png` | A（孤儿） | 过场截图硬裁，烘焙台词"太上老君，滚出来…"+ 老君/二郎神人物碎片 | 无（grep src 零引用） | 无（死件） | **可直接删** |
| `extracted/level2/floorBg2.png` | 空图/坏导出（疑似） | 完全透明，0 不透明像素 | BattleScene.ts:535,1027（L2 地面层 load） | L2（在范围内），运行时画空 | 团队定性：若 L2 确无独立地面层则删 load 分支+删空文件；若应有地面则**重导出** |

（`floorBg3.png`/`floorBg4.png` 同为空图，属已摘除 L3/L4，同上处置、优先级低。）

## 死件/孤儿（干净但无引用，属仓库卫生非脏件）

按"现存坏素材一律弃用 + 清单化处置"一并列出，供批量清理裁量。均已亲看确认画面干净、无脏内容。

| 路径 | 状态 | 说明 | 处置建议 |
|---|---|---|---|
| `extracted/menu/title_logo_bg.png` | 孤儿 | 原版「造梦西游Ⅲ 再续天庭篇」logo，游戏已更名「再续西游」，0 引用 | 可删（更名后作废） |
| `extracted/ui/backpack_window_crop.png` | 孤儿 | 干净的个人资料窗框，0 引用（实际用的是 `backpack_bg.png`） | 可删 |
| `extracted/ui/backpack_window_full.png` | 孤儿 | 同上，全画布版，0 引用 | 可删 |
| `extracted/worldmap/chest.png` | 死件 | 「补偿礼包」运营宝箱，已按拍板从世界地图删除，仅剩注释引用 | 可删 |
| `extracted/prefab/PassiveSkillControl/758.png` | 死件 | 被动技面板的**烘焙暗格位图**，被动页签已删（decadfb 改纯色面板），仅注释引用 | 可删 |
| `extracted/prefab/PassiveSkillControl/768_1..6.png`（6 张） | 死件 | 被动技行条，同上，页签已删 | 可删 |
| `extracted/skilltree/passive_panel.png` | 死件 | 被动技面板底图，页签已删，0 引用 | 可删 |
| `extracted/npc/danlu_bg121_crop.png` | 孤儿 | 干净的炼丹炉场景裁切（含太极香炉/丹葫芦），0 引用 | 保留作参考或删，无影响 |
| `extracted/npc/laojun_idle_preview.png` | 孤儿 | 老君预览图，0 引用（实际用 `laojun_sheet.png`） | 可删 |

## 亲看无问题的目录（逐一列明，不漏报当没看）

- **`extracted/ui/`（42 张，全高清+印相图）**：背包窗/数字/页签/按钮/HUD 条/头像/炼器框/升级提示——全部干净。`furnace_frame.png` 呈纯黑是"墨框黑底+『炼丹炉』金标"的正规面板底（非坏黑图）。`dialogue_textpanel_crop.png` 已核实是**重生成的干净程序化墨条**——像素级验证其被采样的顶部 0-34 行与底部 84-114 行零彩色碎片、中间基本透明，与"已换成程序化件"一致；唯文件名仍带 `_crop` 有误导，属命名卫生非脏件。
- **`extracted/menu/`（5 张）**：`select_role_idle.png`（全灰）与 `select_role_selected_wukong.png`（悟空彩、余四格灰）是**忠实还原原版 ColorMatrixFilter 行为**（未选态带灰度滤镜、选中态该角色去滤镜）的有意烘焙合成，代码注释与 progress 均印证——**非 B 类灰图 bug**。`badge_1p`/`title_palace_bg` 干净且在用。`title_logo_bg` 干净但已成死件（见上）。
- **`extracted/worldmap/`（32 张）**：世界地图底图、七个功能按钮、装饰件、各关卡节点三态——全部干净、风格一致。`map_bg.jpg`（唯一 JPG）是干净的原版世界地图原画（不透明底用 JPG 合理，无压缩噪点/UI 残留），**非 C 类可疑源**。
- **`extracted/skilltree/`（52 张）**：技能图标三态（learned 真彩/locked 灰/unlocked 灰+学习标）是**有意的技能状态设计**——learned 已修为真彩，locked/unlocked 灰是"未学得"应有的暗态，非滤镜 bug。`rebind_modal.png`（按键设置弹窗）、`table_school1.png`、`bg.png`、字母槽、按钮全干净。
- **`extracted/icons/`（21 张）**：21 个道具/装备/丹药图标，全部彩色、风格统一，无脏件。
- **`online/skill-icons/`（19 张）+ `online/results/`（4 张）**：技能大小图标、「挑战成功/失败」横幅（失败灰是**主题设计**非 bug）、「我的成绩」「重新挑战」——全部正规件。
- **`extracted/prefab/PassiveSkillControl/`（7 张）**：画面本身干净，但整组随被动页签删除已成死件（见上）。
- **`extracted/npc/` + 角色 spritesheet（`role1_0`/`role2_0`/`role3_0`/`role4_shovel_0`/`role1_equip0`/preview + `laojun_sheet`）**：均为提取的原版动作帧，干净（总纲允许保留已提取原版件）。
- **`extracted/level1..4/` 背景（16 张）**：bg11/12/13、online_floor12/13、bg21/22/23、bg31/32/33、bg41、floorBg1 全部干净关卡背景，无 HUD/文字/截图残留。floorBg2/3/4 为空图（见问题清单）。
- **`extracted/level1..4/` 怪物 spritesheet（26 张 Monster*）**：全部干净原版动作帧。`Monster12.png` 虽整体银灰（饱和度 4.0）但**红眼保留彩色 → 是原生金属甲怪，非 ColorMatrixFilter 灰图**（滤镜会同时杀掉红眼）；Monster32 等 L4 灰色小怪同理为原生配色。

## 方法与判据说明

- 全库先建带尺寸/字节数的清单，再对全 234 张跑饱和度扫描客观定位灰图嫌疑（`meansat`/`coloredFrac`），把嫌疑者逐张全高清核。灰度=0 的件逐一甄别：`icon_*_locked`（锁定态应灰）、`dialogue_tooltip_sayinfo`（灰底提示条）、`hud_ri_bg`（墨形底）、`button_generic_*`（灰按钮）、`758.png`（暗格面板）均为**设计本应灰**，非 bug。
- `dialogue_textpanel_crop.png` 的清洁度用像素统计证实（采样带零彩色碎片），不靠肉眼一句"看着还行"。
- 已知两类历史坏素材（截图硬裁、ColorMatrixFilter 灰度导出）在本轮均已被前序棒修复并经本审计复核成立；本轮新增确认的活体脏件是 **title-bg.png**（此前未被点名）。
