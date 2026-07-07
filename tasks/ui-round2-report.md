# 报告：UI 第二轮 — 战斗内 UI 原版真组件化（不接线）

把战斗 HUD / 怪血条 / 背包 / 炼制面板 / Toast 从脚手架审美升级为**原版素材真组件**。全部新文件落
`game/src/ui/hud/`，独立演示页 `game/tools/ui-preview.html`，**未动** scenes/、现有 ui/ 文件、systems/、net/。
接线（换装）由串行接线棒按第 4 节做。

## 1. 组件清单与数据接口（TypeScript 签名）

所有组件是纯视图：构造后用一个 `update`/`set*` 方法喂假/真数据，绝不 import 战斗系统。宿主场景负责
`preload`（见第 3 节 `HUD_TEXTURES`/`HUD_ICONS`）。

### RoleInfoHud（左上角战斗 HUD）— `src/ui/hud/RoleInfoHud.ts`
原版 RoleInfo 头像（水墨墨框悟空圆像，OtherMat1.swf export.RoleInfo 抠出）+ 等级牌 + HP/MP/EXP 三条 + 攻击/武器名。
```ts
new RoleInfoHud(scene, x, y, opts?: { avatarTexture?; scale? })
hud.update(data: RoleInfoData)
interface RoleInfoData { level; hp; maxHp; mp; maxMp; exp; expToNext; atk; weaponName }
hud.setVisible(v); hud.setDepth(d)
```
MP 条已留（heroSkill/mp.ts 接线后立即用）。原版 composite 把数字烘焙进笔触条（无法驱动动态值），故**头像用真素材、三条按原版配色（HP红/MP蓝/EXP金）重绘并数据驱动**——见第 5 节。

### BossHpBar + MonsterHpBar — `src/ui/hud/MonsterHpBar.ts`
```ts
// Boss 顶部横幅：原版红笔刷条（主SWF BossBlood chid82 抠出 hud_boss_bar_fill）+ 动态名牌 + 右向左消减
new BossHpBar(scene, x=480, y=34, opts?: { barWidth? })
boss.update({ name: string; hp: number; maxHp: number })   // name 对齐 level.ts BossSpec.label
boss.setVisible(v)

// 普通怪头顶小血条（世界坐标跟随；原版无小血条素材，按 HUD 配色画）
new MonsterHpBar(scene, opts?: { width?; height? })
mob.update(hp, maxHp, worldX, worldY, showAtFull=false)   // 满血/死亡自动隐藏
mob.setVisible(v); mob.destroy()
```

### BackpackWindow — `src/ui/hud/BackpackWindow.ts`
原版 个人资料/背包 窗（backpack1.swf export.pack.BackPack 裁剪）+ 右栏 6×4=24 格（原版格子素材平铺）+ 物品图标 + 数量 + hover 品质色 tooltip（原版语言：稀有度只用**文字颜色**区分，无边框素材）。
```ts
new BackpackWindow(scene, opts?: {
  x?; y?; cols?=6; rows?=4;
  iconKeyFor?: (item: Item) => string;   // 默认 icon_<id>，缺则 fallback
  onClose?: () => void;
})
bag.setItems(stacks: { item: Item; qty: number }[])   // 对齐 inventory.ts listStacks()
bag.open(); bag.close(); bag.isOpen
```

### FurnacePanel（炼制/制作面板）— `src/ui/hud/FurnacePanel.ts`
原版 制作 面板（backpack1.swf export.strength.Making 抠出）：制作书 + 基本材料×2 + 宝石×3 投料格 + 生成物 + 打造按钮，全真素材；投料格坐标实测对齐。
```ts
new FurnacePanel(scene, opts?: {
  x?; y?; iconKeyFor?: (item)=>string; onCraft?: ()=>void; onClose?: ()=>void;
})
furnace.setMaterials(items: Item[])      // 填 5 个投料格（基本材料2+宝石3）
furnace.setResult(item: Item | null)     // 生成物槽 + 名称按结果稀有度上色
furnace.setInfo({ name: string; cost: number } | null)   // 名称/所需灵魂
furnace.open(); furnace.close(); furnace.isOpen
```

### Toast + 飘字 — `src/ui/hud/Toast.ts` + `hudTheme.ts`
```ts
new Toast(scene, x=480, y=150); toast.show(text, color?)   // 拾取/升级/炼成横幅
// 伤害/治疗/经验飘字：参数表在 hudTheme.FLOAT_STYLES（brief 要的"参数表"），渲染便捷函数：
spawnFloatingText(scene, x, y, text, kind: 'damage'|'crit'|'heal'|'burn'|'exp')
```
Toast 背景：原版水墨文字条中段有烘焙剧情文字，故**只取其上/下无字笔触边**（同 DialogueBox 手法）叠在净色墨底上。
飘字样式表（FLOAT_STYLES）：普通白金 damage / 大号橙 crit / 绿 heal / 橙 burn / 紫 exp，各含 color/fontSize/risePx/durationMs/stroke。

## 2. 品质色映射（纯逻辑，带单测）— `src/ui/hud/rarity.ts`
原版无稀有度边框素材，只用**文字颜色**区分。我们 Item.rarity 是 3 档（items.ts 1|2|3），映射到 BattleScene 掉落星已用的同一套色（5fd6a0/6ba8ff/d9a441），保持代码库内一致：
```ts
rarityStyle(r) => { color: number; css: string; name: string }
rarityColor(r); rarityCss(r); rarityName(r)   // 1 优良(绿) / 2 精良(蓝) / 3 史诗(金)，越界回退 普通(灰)
```
单测 `tests/hudRarity.test.ts`（5 例：三档互异、css↔num 一致、中文名、越界回退、真 Item 字段）。

## 3. 预加载（接线第一步）— `src/ui/hud/hudTheme.ts`
```ts
import { HUD_TEXTURES, HUD_ICONS } from '../ui/hud/hudTheme'
preload() { for (const {key,url} of [...HUD_TEXTURES, ...HUD_ICONS]) this.load.image(key, url) }
```
`HUD_TEXTURES` = 头像/boss条/墨带/背包窗/格子/制作面板/合成面板；`HUD_ICONS` = 21 枚物品图标（key `icon_<id>`）。
路径均为 `assets/extracted/...`（相对，与 BattleScene 现有 load 一致）；演示页用 `this.load.setBaseURL('/')`。

## 4. 换装接口清单（交串行接线棒；组件与素材已就绪，均不需再改本组件）

| 目标 | 现状（脚手架） | 换装动作 |
| --- | --- | --- |
| **战斗 HUD** | BattleScene 调试文字 `statsText`/`heroHpBar`/`hud`/`invText` | preload HUD_TEXTURES；create 建 `new RoleInfoHud(this,16,14)`；update 里 `hud.update({level:p.level, hp:c.hp, maxHp:c.maxHp, mp:identity.mp, maxMp:identity.maxMp, exp:p.exp, expToNext:p.expToNext, atk:heroTotalAtk(...), weaponName:equipment.weapon?.name ?? '空手'})` |
| **Boss 条** | `mhpText` 调试文字 | boss 关（level.ts 有 BossSpec）建 `new BossHpBar(this)`，`boss.update({name: bossSpec.label, hp, maxHp})`；非 boss 关不显 |
| **普通怪血条** | 无 | 每只怪一个 `MonsterHpBar`，update 传 `monsterState.x, GROUND_Y-110, hp, maxHp` |
| **背包** | `invText` 右上角文字条 | `new BackpackWindow(this,{iconKeyFor})` + 一个开关键（B/I）；库存变化时 `bag.setItems(listStacks(inventory))`。**需补**：item.id→icon key 映射（drops.json 图标名即 id，或给个字典）；缺省已 fallback |
| **Toast/飘字** | `showToast()`/`floatText()` 自绘 | 换 `new Toast(this)` + `spawnFloatingText(this,x,y,txt,kind)`；kind 按暴击/治疗/灼烧/经验选 |
| **炼制面板** | 炼宝棒的"择材入炉"半透明黑块 | `new FurnacePanel(this,{iconKeyFor, onCraft})`；选材 `setMaterials(selected)`；WS `craft_item` 回来 `setResult(item)`+`setInfo({name,cost})` |
| **对话框本体** | DialogueBox 水墨自绘 | **无原版对话框素材可换**（见第 6 节），保持现状；如需统一，Toast 的笔触边手法可复用 |

约束：以上全是接线棒在 BattleScene.ts / DialogueBox 侧的动作；本轮组件不接线、不改那些文件。

## 5. 素材来源（全部原版真素材，headless FFDec 提取，无裸跑 GUI）

| 组件用图 | 来源符号 | 处理 |
| --- | --- | --- |
| `hud_avatar_wukong.png` | OtherMat1.swf `export.RoleInfo`（hud_roleinfo_top_avatar_bars）左侧头像 | 裁出墨框悟空圆像（84×94），动态等级牌盖住烘焙"99" |
| `hud_boss_bar_fill.png` | 主SWF `BossBlood` chid82（hud_bossblood）红笔刷段 | 按红色像素包围盒裁出纯红笔刷条（311×19）作 boss 填充 |
| `backpack_window_crop.png` | backpack1.swf `export.pack.BackPack` | 按非透明包围盒裁到窗体（755×497）；格子用已有 `backpack_slot_cell.png` |
| `furnace_making.png` / `furnace_fusion.png` | backpack1.swf `export.strength.Making` / `Fusion` | 裁到面板包围盒（354×385 / 354×361）；投料格中心 PIL 实测对齐 |
| Toast 墨带 / 物品图标 | 已有 `dialogue_textpanel_crop.png` / `icons/*.png`（21 枚） | 墨带只用无字笔触边；图标 key `icon_<id>` |

## 6. 炼丹炉 / 对话框 素材穷尽搜索证据（断言"无"附证据）

**方法**：headless `java -jar tools/ffdec/ffdec-cli.jar -export symbolclass <out> <swf>`（全程带动作参数，无裸跑 GUI），对全部 34 个 out_res SWF + 主逻辑 SWF（打开我开始玩.swf）dump 后 grep。

**炼丹炉/八卦炉**：全库唯一的"投料→炼制"UI 是 **backpack1.swf 的 `export.strength.*`**：
`Making`(制作) `Fusion`(合成) `Strength`(强化) `Resolution`(分解) `StrengthEquipment` `SutraInterface`(经书)。
grep `furnace|alchemy|liandan|bagua|refine|smelt|forge|八卦炉|炼丹|炼制`：**无独立"八卦炉窗体"类**；EIcon1 的
`baguaEffect`(924)/`MagicBaguaBmd`(517) 是八卦**特效贴图**不是窗体。结论：原版炼制 UI 就是 strength.Making/Fusion，
我用 Making 作炼制面板真源（合成面板 Fusion 也已入库备用）。**这不是自造，是原版真面板。**

**对话框**：grep 全 34 包 + 主SWF 无独立 NPC 对话框窗体类（与 session1 MANIFEST §1 结论一致：原版剧情是全屏漫画分镜
`Stage12XDialogue`，非文本框系统；仅有小气泡 `export.SayInfo` chid344 作提示）。故对话框本体无原版素材可换，
保持现有水墨 DNA 自绘。

**顺带挖到（未用，登记备查）**：Common1.swf `IsCover`(154) = "您确定要覆盖此档？"存档覆盖确认框（黄按钮黑底），
可给存档槽"覆盖/删除"确认复用。

## 7. 验收判据逐条

| 判据 | 结果 | 证据 |
| --- | --- | --- |
| 1. 演示页四类组件真素材渲染、假数据变化正确（血条会动/背包有物/Boss 条有名字） | ✅ | `game/tools/ui-preview.html`；截图 tmp/debug-shots/ui2-01-hud（血条实时波动+Toast+飘字）、ui2-02/03-backpack（+hover tooltip 品质色）、ui2-04-furnace |
| 2. vitest 全绿（品质色映射带小测试） | ✅ | 31 files / 358 tests 全过（含 hudRarity 5 例）；tsc --noEmit 净 |
| 3. report：组件数据接口 + 换装步骤清单 | ✅ | 本文件 §1/§4 |

**并排对比图**（原版 vs 我的组件）：`ui2-compare-backpack.png`、`ui2-compare-furnace.png`（上=原版4399面板，下=我的真组件+假数据，布局重合）。

## 8. 遗留 / 待接线方注意

1. RoleInfoHud 三条为原版配色重绘（原版 composite 数字烘焙进笔触、无法驱动）；头像/boss条/背包/炼制面板为原版真素材。
2. BackpackWindow/FurnacePanel 的 `iconKeyFor` 需接线方给 item.id→icon key 字典（drops.json 图标名多数即 id；缺省已 fallback 到 `icon_fallback`）。
3. 小怪头顶血条无原版素材（原版只有 boss 横幅），按 HUD 配色画；如需更还原可后续找怪物专属条。
4. 对话框本体维持现状（无原版窗体素材，证据见 §6）。
5. 演示页在 `game/tools/`，vite 直接服务 `/tools/ui-preview.html`，不进主构建、不影响游戏。
