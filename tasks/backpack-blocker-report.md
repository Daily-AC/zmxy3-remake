# backpack-blocker: 背包窗按钮点不动/关不掉 修复报告

## 报障

用户实机反馈（阻塞级）：战斗内按 B 打开背包窗后，所有按钮点不动，窗口也关不掉；另外"布局歪七扭八"。

## 根因

`BackpackWindow.ts` 里关闭钮、四个页签、出售/翻页钮、装备格、道具格全部用 Phaser 的
`setInteractive()` 做点击检测，而整个窗口的容器是 `setScrollFactor(0)`。Phaser 对
interactive 对象做命中测试时，会把指针坐标经由**相机当前的滚动量**换算成世界坐标去比对，
但完全不管对象自己是不是 `scrollFactor(0)`——于是只要战斗相机一滚动（水平跟随悟空移动、
以及 L1 攀爬序章的纵向滚动，两者都是这局游戏的常态），窗口的可视位置纹丝不动，但它每一个
按钮的命中区都会跟着相机滚动量整体漂移，点在按钮上等于点在漂移后命中区旁边的空气上——
表现就是"点不动"。关闭钮同理失效，所以"关不掉"和"点不动"是同一个根因，不是两个独立问题。

这正是 `SkillBarHud` 之前踩过、也修过的同一个坑（commit `4662cd6`，战斗 HUD 五图标那次）：
`setInteractive()` 放进 `scrollFactor(0)` 容器里会随镜头漂移，需要改成场景级屏幕坐标手动
命中测试。`BackpackWindow.ts` 当时没有跟着改，这次是同一个坑的第二个受害者。

"布局歪七扭八"：实测排除——在 `scrollX=400` 强制滚动后截图，窗口像素级位置与
`scrollX=0` 时完全一致（渲染层没有 bug，`scrollFactor(0)` 本身工作正常）。用户感知到的
"歪"实际是"点在看起来对的位置上没反应"，不是真实的布局错位。

## 复现（修复前）

用 playwright 独立 tab，走 `__shellEnter → __shellNewGame(0) → __shellSelectHero(1) →
__shellConfirm → __shellMapEnterLevel(0)` 进入 L1 战斗，然后：

1. `scrollX=0`（未滚动）：点击 道具 页签、关闭钮 —— 都正常生效。
2. 强制 `cameras.main.scrollX = 400`（模拟战斗中相机已滚动的常态），在**完全相同的几何
   坐标**上点击同样两个按钮 —— 页签没切换、窗口没关闭。坐标本身没错（截图确认按钮画在那个
   位置），只是 Phaser 的命中判定跑偏了。

## 修复

只改了 `game/src/ui/hud/BackpackWindow.ts`，把所有 `setInteractive()` 命中检测换成场景级
`pointerdown`/`pointermove` 监听 + 手动矩形命中测试（`resolveHit()`），指针坐标直接减去
`container.x/y` 换算成窗口本地坐标，不再经过相机滚动换算：

- 新增 `resolveHit(lx, ly): HitResult | null`：按顺序测关闭钮、四个页签矩形、出售/上一页/
  下一页矩形、动态的装备格命中列表 `equipHits`、动态的道具格命中列表 `gridHits`。
- `onPointerDown`：命中什么就调用对应的 `onClose`/`setTab`/`onSell`/`setPage`/`onUnequip`/
  `onEquip`。
- `onPointerMove`：复用同一个 `resolveHit()`，用来还原原来 `setInteractive({useHandCursor})`
  和 `pointerover`/`pointerout` 提供的手型光标 + tooltip 效果（手动切 `canvas.style.cursor`，
  hover 目标变化时才重建 tooltip，避免每帧重建）。
- `redrawEquip()`/`buildCell()`（道具格）不再各自创建一个透明 `setInteractive()` 矩形当热区，
  改成把 `{slot/stack, rect}` 推进 `equipHits`/`gridHits` 供 `resolveHit()` 查表；这两个数组
  在每次 `redrawEquip()`/`redrawGrid()` 开头清空重建，装备变化、切页签、翻页都会同步刷新。
- 顶部 dim 背景板、四个静态按钮（关闭/出售/上一页/下一页）不再需要对应的透明 GameObject 热区，
  直接删除（原来 alpha=0，纯粹用来挂 `setInteractive`，几何判断现在直接读常量）。
- `close()` 里补了 `canvas.style.cursor = ''` 复位，避免窗口关闭后光标卡在手型。

场景级监听在构造函数里注册（`scene.input.on('pointerdown'|'pointermove', ...)`），仿照
`SkillBarHud` 的写法在 `Phaser.Scenes.Events.SHUTDOWN` 时反注册；handler 内部先判
`this.container.visible`，窗口关着时直接跳过，不影响其他 HUD 的点击。

未触碰 `BattleScene.ts`（任务要求先问，本次改动完全不需要动它——`__toggleBackpack`/
`window.__scene` 等既有调试钩子已经够用）。

## 复验（修复后，同样 `scrollX=400`）

同一套坐标、同一批点击：

| 操作 | 修复前 | 修复后 |
|---|---|---|
| 点击"道具"页签 | 无反应（`tab` 仍是 `equip`） | 切换成功（`tab` 变 `item`） |
| 点击关闭钮 | 无反应（`isOpen` 仍 `true`） | 正确关闭（`isOpen` 变 `false`） |
| 点击已装备武器格（卸下） | 未测（预期同样失效） | 正确卸下（`world.weapon` 从"赤炎噬血杖"变 `null`），且 hover 时 tooltip 正常弹出"卸下【赤炎噬血杖】" |

`npx tsc --noEmit` 净、`npx vite build` 过、`npx vitest run --root game`：40 个测试文件全绿
（483 passed / 1 skipped）。

截图（`tasks/backpack-fix-shots/`）：
- `01-battle-start.png`：进入 L1 战斗初始画面。
- `02-open-after-scroll-BEFORE-fix.png`：修复前，纵向滚动后打开背包（用于确认渲染位置正确，
  排除"布局歪"是真实渲染 bug）。
- `03-open-scrollX400-BEFORE-fix.png`：修复前，`scrollX=400` 时打开背包，布局像素级正确，
  但后续点击证明按钮不响应。
- `04-open-scrollX400-AFTER-fix.png`：修复后，同样 `scrollX=400`，页签/关闭点击均生效。
- `05-after-unequip-scrollX400.png`：修复后，`scrollX=400` 下点击武器格成功卸下，hover
  tooltip 正确跟手。

## 踩坑记录（协作纪律，供其他棒参考）

本次用共享 playwright 浏览器时，自开的 tab 被其他并发 agent 的操作两次顶掉/切走
（`browser_press_key`/`browser_tabs` 等高层工具似乎读写的是浏览器全局"当前 tab"指针，
会被其他 agent 的动作打断）；其中一次误在别人的 session（`localhost:5205`）上执行了一条
`heroState.vertical.y` 调试赋值 + 一次背包 toggle，随即发现并停止，未做进一步操作。
之后改为：每次都在**同一个 `run_code_unsafe` 调用**里 `bringToFront()` + 断言
`page.url()` 命中自己的端口，一旦不对立刻中止，不再触碰场景状态；所有后续步骤都用这个
"单次调用内断言+全串行"的写法完成，没有再发生跨 session 干扰。建议后续棒沿用这个模式，
或者干脆各自起一个独立的 vite dev server 端口（本次用的是 `5811`，已在收尾时关闭）。
