# 报告：游戏壳 — 登录/选人/存档槽

复刻"打开游戏 → 登录 → 选存档 → 选人 → 进战斗 → 刷新继续"的原版体验壳。本地单机、假登录、
存档 3 槽走 `systems/save.ts`。全部为新增文件，`BattleScene.ts` 未改动一行。

## 1. 场景流转图

```
                （首屏，main.ts scene 数组第一个 → 自动启动）
   MainMenuScene ── 进入游戏 / Enter ──▶ SlotSelectScene
   (key 'mainmenu')                       (key 'slotselect')
   情怀壳假登录，游客                        3 槽：空槽 / 已有存档
   标题 + 悟空立绘                              │        │        │
        ▲                                     │        │        └─(删除)─▶ 确认弹窗 ─确认─▶ deleteSlot ─▶ 刷新本场景
        │ 返回                                 │        │                              └─取消─▶ 关弹窗
        └──────────────────────────────────────┘        │
                                    (空槽)新建存档        (已有)继续
                                        │                 │
                                        ▼                 │ readSlot → restoreGameState
                              CharacterSelectScene        │ registry 写入 activeSlot/loadedState/activeSave/origin='continue'
                              (key 'charselect')          │
                              原版 SelectRole 五格立绘      │
                              悟空可选，其余"敬请期待"       │
                                        │                 │
                          确定出战 / Enter                │
                          createNewSlotEnvelope + writeSlot│
                          registry 写入 …/origin='new'     │
                                        │                 │
                                        ▼                 ▼
                                   BattleScene (key 'battle') ◀── 二者殊途同归
```

- 首屏由 `main.ts` 的 `scene: [MainMenuScene, SlotSelectScene, CharacterSelectScene, BattleScene]` 顺序决定
  （数组第一个自动 start）。这是对 `main.ts` 的**唯一**改动：加三个 import + 把场景数组从 `[BattleScene]`
  扩成四个。BattleScene 仍在数组里、仍是同一个 key `'battle'`，只是不再是首屏。
- 场景间数据通过 **Phaser game registry**（游戏级 DataManager）传递，见第 3 节接口清单。
- "刷新继续"：整页 reload 后 Phaser 重启到 MainMenu，SlotSelect 每次 `create()` 都实时读 localStorage，
  所以已建的槽自动显示回来（已浏览器实测，见第 4 节判据 2）。

## 2. 存档槽 key 设计

真源模块 `game/src/systems/saveSlots.ts`（纯逻辑，注入 `SaveStorage`，带 13 条单测
`game/tests/saveSlots.test.ts`）。它**包裹**而非修改 `save.ts`：

- **localStorage key**：`zmxy3-remake.slot.v1.<slot>`，slot ∈ {0,1,2}（`slotStorageKey(slot)`）。
  与 `save.ts` 自己的单存档 key `zmxy3-remake.save.v1` 命名空间隔离，互不干扰。
- **槽内存的是一个"信封"** `SlotEnvelope`（JSON）：
  ```jsonc
  {
    "slotVersion": 1,             // 信封 schema 版本，独立于 GameSave.version
    "meta": {                     // 菜单摘要用，避免为渲染列表而 restore 整个存档
      "heroId": 1, "level": 1,
      "playtimeSec": 0,           // GameSave 里没有的字段，只活在 meta
      "savedAt": "2026-…Z"
    },
    "save": { …GameSaveV1… }      // 原样委托给 save.ts 的 createGameSave/serialize
  }
  ```
- **防篡改/防漂移**：读取时 `parseSlotEnvelope` 会用 `save.ts` 的 `parseGameSave` 重新校验内嵌 save，
  并**从 save.progression 重新推导** heroId/level/savedAt，只保留 meta 里的 `playtimeSec`
  （因为它在 save 里无处安放）。手改 meta 无法让菜单显示与真正加载的存档不一致（有单测覆盖）。
- **摘要 API**：`readSlotSummary(storage, slot)` / `listSlotSummaries(storage)` 返回
  `{slot, occupied:false}` 或 `{slot, occupied:true, heroId, heroName, level, playtimeSec, savedAt}`；
  空槽或损坏槽都归为 `occupied:false`（菜单侧统一当"可新建"处理）。
- **辅助**：`formatPlaytime(sec)`（`MM:SS` / `H:MM:SS`）、`formatSavedAt(iso)`、`HERO_NAMES`/`heroName()`。

## 3. 需 BattleScene 配合的接口清单（交给集成棒）

壳侧已经把该传的都传好了，BattleScene **当前尚未消费**，因此现在进战斗仍是硬编码的满血悟空
（不影响本单验收：存档在壳内持久化、刷新可读回已实测通过）。要真正打通"读档进战斗 + 战斗存回槽"，
BattleScene 需按下面接口接线（都不需要壳侧再改）：

### 3.1 进入战斗时读取已加载状态（registry，均已由壳写入）

| registry key | 类型 | 含义 |
| --- | --- | --- |
| `shell.activeSlot` | `SlotId (0\|1\|2)` | 当前存档槽号，存回时用 |
| `shell.loadedState` | `LoadedGameState` (`save.ts`) | `{ progression, equipment, inventory }`，已 `restoreGameState` 好 |
| `shell.activeSave` | `GameSave` | 原始存档（一般用 loadedState 即可，这个留作需要时取 savedAt 等） |
| `shell.origin` | `'new' \| 'continue'` | 新建还是读档进入 |

建议在 `BattleScene.create()` 开头：
```ts
const loaded = this.registry.get('shell.loadedState') as LoadedGameState | undefined
if (loaded) {
  // 用存档播种，替换现在的 createHeroIdentity(1)/createEquipment()/createInventory(24)
  this.identity = createHeroIdentity(loaded.progression.heroId, loaded.progression.level)
  this.identity.progression.exp = loaded.progression.exp   // 精确恢复经验（createProgression 已按等级设好 expToNext 并 clamp）
  this.equipment = loaded.equipment
  this.inventory = loaded.inventory
} else {
  // 保留现有默认（直接 new 'battle' 调试时仍可跑）
}
```
`createHeroIdentity(heroId, level)` 现签名已支持传 level；exp 用赋值补齐即可。

### 3.2 存回当前槽（存档点 / 自动存 / 退出前）

```ts
import { buildSlotEnvelope, writeSlot } from '../systems/saveSlots'
import { createGameSave } from '../systems/save'
const slot = this.registry.get('shell.activeSlot') as SlotId
const save = createGameSave({ progression: this.identity.progression, equipment: this.equipment, inventory: this.inventory })
writeSlot(window.localStorage, slot, buildSlotEnvelope(save, this.playtimeSec))
```
- 触发时机由 BattleScene 决定：关卡通关、定时自动存、或退出前。
- **游戏时间**：BattleScene 累加 `playtimeSec`（用 update 的 delta），存档时传给 `buildSlotEnvelope` 的第二参。
  壳侧新建槽时给的是 0；只有 BattleScene 能把它累加起来，槽列表就会显示真实游戏时长。

### 3.3 从战斗返回主菜单（关闭闭环，可选但推荐）

现在没有"回主菜单"出口。加一个暂停键/死亡后菜单，先按 3.2 存回，再
`this.scene.start('mainmenu')`（或直接 `'slotselect'`）即可回到壳。壳的 registry 是 game 级的，
重进 SlotSelect 会实时重读 localStorage，无需清理。

### 3.4 约束回顾

- 壳绝不改 BattleScene；以上全是"BattleScene 侧要做的动作"，接口面就是 registry 四个 key + saveSlots/save 两个模块的纯函数。
- 壳用 `createInventory(24)` 与 BattleScene 现在的 `createInventory(24)` 容量一致，读档不会容量冲突。
- 选人已把 heroId 持久化进存档（当前只有悟空=1 可选）；将来 BattleScene 支持多角色时，直接读
  `loaded.progression.heroId` 切换角色资源即可，壳无需改。

## 4. 验收判据逐条

| 判据 | 结果 | 证据 |
| --- | --- | --- |
| 1. vitest 全绿（现有不许挂 + 槽位逻辑带单测） | ✅ | `npx vitest run` → 25 files / 235 tests 全过（含新增 `saveSlots.test.ts` 13 条）；`tsc --noEmit` 无错 |
| 2. 浏览器真实走通并截图：主菜单→新建槽→选悟空→进战斗；刷新→继续槽读回 | ✅ | 见下方截图；用独立 headless Chrome（puppeteer-core）实测，非 mock。刷新后 slot0 读回 `孙悟空 Lv.1 游戏时间00:00`，继续进战斗 registry=`{activeSlot:0, origin:'continue', hasLoaded:true}` |
| 3. 本报告（流转图/key 设计/接口清单/素材来源） | ✅ | 本文件 |

截图落 `tmp/debug-shots/`：
- `01-mainmenu.png` 主菜单（标题 + 游客登录 + 进入游戏 + 悟空立绘）
- `02-slots-empty.png` 三个空存档槽
- `03-charselect.png` 原版 SelectRole 五格立绘，悟空高亮可选、其余"敬请期待"
- `04-battle.png` 进入 BattleScene（南天门关卡、悟空、HUD Lv.1/HP80、云头妖鸟）
- `05-slots-occupied.png` **整页刷新后** slot0 显示已存档（悟空头像 + Lv.1 + 游戏时间 + 日期）
- `05b-delete-confirm.png` 删除确认弹窗
- `06-continue-battle.png` 从已有槽"继续"再次进入战斗

## 5. 素材来源

优先从 out_res 原版 SWF 挖到了**真·原版选人界面**，不是自造：

| 素材 | 来源 | 处理 |
| --- | --- | --- |
| `menu/select_role_bg.png` | `OtherMat1.swf` → `DefineSprite_1012_export.SelectRole`（vendor/extracted 已导出的 sprite） | PIL 按非透明包围盒裁剪 1014×1077→942×619，五格墨迹立绘（孙悟空/唐僧/猪八戒/沙僧/???）+"请输入名字"全保留 |
| `menu/name_wukong.png` | `OtherMat1.swf` → `DefineSprite_756_export.shop.SelectWK` frame2（选中态彩色名牌） | 原样，叠在悟空格上标识"可选/激活" |
| 悟空立绘/头像 | 已有 `assets/extracted/role1_0.png`（WuKong.swf ROLE1_0，6×14@200） frame0 待机帧 | 主菜单彩色立绘 + 选人叠彩色悟空 + 槽位圆形头像 |
| 按钮/面板/弹窗 | 无原版可抠（MANIFEST 已注明原版对话框/品质框都不存在），按已确立的水墨 DNA 程序化绘制 | `ui/menu/MenuButton.ts`（橙黄木质圆角 + 深棕描边 + 金色内线，仿 `button_game_style_*`）、`ui/menu/inkBackdrop.ts`（暖墨渐变背景） |

- 关于 `Opening`（`DefineSprite_208_export.scene.Opening`）：挖出来是纯黑开场遮罩 + "跳过"按钮，不是标题屏，弃用。
- 34 包与主逻辑 SWF 都无独立"登录/主菜单"UI 组件（原版开场是过场动画非菜单），所以登录屏按 DNA 自造，选人屏用真素材。

## 6. 遗留问题

1. **BattleScene 尚未消费存档**（第 3 节）：这是设计边界内的"只写接口、不动 BattleScene"。当前进战斗永远是满血 Lv.1 悟空；
   打通读档播种 + 战斗存回 + 游戏时间累加，需集成棒按 3.1–3.3 接线。
2. **游戏时间恒为 0**：壳侧新建/继续都不推进 playtime（只有 BattleScene 能累加）。槽位已能显示，等 3.2 落地即有真实值。
3. **选人只有悟空**：唐僧/八戒/沙僧/白龙"敬请期待"，符合任务书；四角色 sheet 已在库，等 BattleScene 支持多角色时解锁。
4. **无 DOM 名字输入**：原版 SelectRole 有"请输入名字"，本壳暂用 heroId 派生固定名（孙悟空），未做自定义昵称输入
   （避免 headless 截图里 DOM 焦点抖动）。要做的话在 CharacterSelect 加一个 Phaser DOM input，存进 meta 加个 `heroName` 字段即可。
5. **并行 team 共用同一 checkout**：`BattleScene.ts`/`npcClient.ts` 等在工作树里是他人改动（`git status` 可见），本单 commit 只 add 自己的新文件，未 `git add -A`。

## 7. 壳↔战斗存档接线 — 已完成（2026-07-07 集成会话）

§3 的接口，本棒已全部接进 `BattleScene.ts`（只动 BattleScene，未碰壳场景/saveSlots/save）。玩家流
「选槽进战斗 → 打怪升级捡装备 → 炼一件 → 存档回主菜单 → 再进继续档 → 等级/背包/装备原样恢复」
浏览器真机走通。

**接线（严格按 §3.1–3.3）**：
- `create()` 开头 `seedFromSave()`：读 registry `shell.activeSlot/origin/loadedState`；`origin==='continue'
  && loadedState` 时用 `createHeroIdentity(heroId, level)` + `identity.progression = loaded.progression`
  播种，`equipment/inventory = loaded.*`；否则默认满血 Lv.1 悟空（直接进 'battle' 调试仍可跑）。
- **游戏时间**：`playtimeSec` 在 `update` 里按 delta 累加（整秒进位）；`seedFromSave` 从槽 meta 读回上次
  时长续累（§3.2 指出只有 BattleScene 能累加，故读 `readSlot` 拿旧值）。
- **存回**：`saveToSlot()` = `createGameSave` → `buildSlotEnvelope(save, playtimeSec)` → `writeSlot`。
  自动存触发点：升级/杀怪(`awardKillExp`)、炼成装备(`onCraftResult` ok)、穿脱装备(`doEquip/doUnequip`)、
  以及回主菜单前。
- **回主菜单出口**：Esc 开暂停菜单（水墨风，`继续` / `保存并回主菜单`），暂停时 `update` 早返冻结模拟；
  `保存并回主菜单` = `saveToSlot` + `npcClient.dispose` + `scene.start('mainmenu')`。死亡 toast 提示
  「Esc 可回主菜单」，暂停菜单在死亡态也可开（键盘在非对话态可用），覆盖 §3.3 的死亡出口。

**验收判据逐条**：
1. `npx vitest run` 全绿：✅ 248 passed；BattleScene.ts 过 `tsc --noEmit`（仓库当前唯一 tsc 报错在
   `src/ui/hud/RoleInfoHud.ts`，另一 agent 的在建 HUD 文件，非本棒，未触碰）。
2. 浏览器真机端到端（vite dev + 壳流转 + `window.__shell*`/`__save*` 钩子），截图落
   `game/tmp/debug-shots/`：
   - `11-slot-occupied-after-save.png`：新建档 slot0 打到 Lv.2 + 炼「试炉法宝」+ 回主菜单后，选档界面
     slot0 显示「孙悟空 Lv.2 游戏时间 00:24 + 日期」。
   - `12-continue-restored.png`：「继续」slot0 再进战斗，HUD `Lv.2 / HP _/130 / 攻击 65 / 武器：试炉法宝`
     ——等级、maxHp(130)、装备、attack 全恢复。
   - `13-pause-menu.png`：Esc 暂停菜单（继续 / 保存并回主菜单），游戏冻结。
   - 数值实证：存档前 `{level:2, weapon:'试炉法宝', origin:'new'}` → 回主菜单 → `listSlotSummaries`
     slot0 = `{occupied:true, 孙悟空, level:2, playtimeSec:24}` → 继续 → `{origin:'continue', level:2,
     weapon:'试炉法宝', atk:65}`，前后一致。
3. 本节即报告追加。

**遗留（接线棒）**：
- 存回目前是"事件驱动自动存 + 退出存"，没做定时自动存（够用；要的话在 update 里加节流计时）。
- `__saveState/__saveNow/__togglePause/__returnToMenu` 为验收调试钩子，量产前可清理。
- Esc 暂停菜单是程序化水墨面板；后续若壳团队出暂停 UI 素材可替换，接口（saveToSlot/scene.start）不变。

---

## 附录：Online「大闹天庭篇」登录流复刻（2026-07-07，meta-shell 续单）

用户拍板照《造梦西游 Online·大闹天庭篇》实机图复刻登录门面（两张实机图为准：
`docs/reference/zmxy-online-screens/title-menu.png` + `save-slots.png`）。素材政策已放开
（CLAUDE.md：全系列素材可直接用进产物）。

- **主菜单改 Online 版式**（MainMenuScene 重写）：左侧角色群像+logo 原画（`assets/online/title/
  title-bg.png` = Online main-title-background）满屏 + 右侧深色墨板竖排菜单。菜单裁到单机功能：
  新的开始 / 读取存档 / 游戏帮助 / 关于我们 / 退出游戏（去掉联网项 造梦论坛/返回首页）。游戏帮助/
  关于我们为程序化浮层，退出游戏尝试 window.close() 否则显告别浮层。
- **存档弹窗改 6 槽**（saveSlots.ts SLOT_COUNT 3→6，SlotId 0..5；SlotSelectScene 重写为 2 列 ×
  3 行卡片）：深色面板 + 橙色大槽号 + 头像 + 角色名/等级 + 游戏时间 + 时间戳 + 右上红叉关闭；
  空槽 ＋新建、满槽点卡片继续、卡片角 ✕ 删除。存档槽逻辑扩容是纯数据层，单测已更新（SLOT_COUNT=6）。
- 之前 chid410 造3 logo 方案未白做：`title_logo_bg.png` 仍在库，若要把 Online logo 换成造3 logo，
  在 title-bg 上叠 chid410 logo 裁片即可（当前用 Online 原画 logo，与实机图一致）。
- 判据：与用户两张实机图并排对比 `tmp/debug-shots/menu3-compare-title.png` /
  `menu3-compare-slots.png`（版式/信息层级重合）；6 槽混合态截图 `menu3-03-slots-mixed.png`
  （0/1/3/4 有档、2/5 空，刷新持久化实测）；vitest 387 全绿。
- 接线不变：新建/继续仍走 registry（activeSlot/loadedState/origin），BattleScene 接线接口同正文。
