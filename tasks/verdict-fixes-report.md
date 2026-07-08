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

## 疑点 / 遗留

1. monsterSim 的 Y 轴跟随速度是**占位数值**（沿用横向 speed 量级），没有反编译到 Monster30 真实飞行速度常量——接线棒把开关打开前应该先补一次 AS3/SWF 侧的速度取证，或做一次真实手感 A/B（移植协议既定流程）。
2. 接线棒还需要确认 `BattleScene.ts` 里怪物 Phaser sprite 是否已经绑定 `state.y`（大概率目前只绑 `state.x`，纵向精灵位置需要补一行），本棒不能碰 `BattleScene.ts`，只能记录在此。
3. huodongbtn 除了补注释外零代码改动——如果这不满足"验收判据"里对本条目的预期（例如期待某种视觉上更强的置灰反馈），需要用户看截图后再拍一次板；目前判断是 worldmap-report.md 棒已经完整做到位，不需要重做。

## Commit 列表

本地新增 commit（未 push），只 `git add` 本棒改动的 4 个源文件 + 本报告 + 任务书：
- `game/src/systems/monsterSim.ts`
- `game/tests/monsterSim.test.ts`
- `game/src/data/worldmapNodes.ts`
- `game/src/scenes/CharacterSelectScene.ts`
- `tasks/verdict-fixes-report.md`
- `tasks/verdict-fixes-brief.md`

未 `git add` 的并发改动（属于同跑的 battle-fidelity 棒，未碰）：`game/src/scenes/BattleScene.ts`、`game/src/ui/hud/RoleInfoHud.ts`、`game/src/ui/hud/SkillBarHud.ts`、`game/src/data/prefab/bg12.prefab.json`、`game/src/data/prefab/bg13.prefab.json`、`progress.md`、`tasks/battle-fidelity-brief.md`。
