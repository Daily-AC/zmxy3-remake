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

**精确机制**（读 Phaser 4.2.0 源码 `node_modules/phaser/src/input/InputManager.js:924-925` 逐行确认，
不是猜的）：

```js
var px = tempPoint.x + (csx * gameObject.scrollFactorX) - csx
```

`tempPoint` 是指针屏幕坐标经 `camera.getWorldPoint()` 换算后的"世界坐标"（约等于
`screenX + camera.scrollX`）；`gameObject.scrollFactorX` 读的是**这个子对象自己的**
scrollFactor 属性，不是从父 Container 继承来的。旧代码只在最外层 `this.container` 上调了
`.setScrollFactor(0)`，里面每个按钮矩形自己的 `scrollFactorX` 从没设置过，默认值是 `1`——
渲染时之所以看起来"没歪"，是因为 Phaser 渲染一个 Container 子树只在最外层结算一次相机偏移
（子对象自己的 scrollFactor 在渲染路径上根本不会被读取），但 `InputManager.hitTest()` 是
拿到手的一份"独立于容器层级的可交互对象扁平列表"逐个测，直接读每个对象自己的
`scrollFactorX`——这就是"渲染依赖父级，命中测试依赖对象自己"这条分叉的根源。

代入 `scrollFactorX=1` 化简：`px = tempPoint.x = screenX + csx`，命中比对的是对象未经滚动
修正的世界矩阵位置，于是解出"实际可点的屏幕坐标 = 视觉位置 - camera.scroll"——跟前面
`scrollX=400` 实测的漂移方向和量级完全对上。

顺带一提：Phaser 其实自带了针对这个坑的官方解法——`Container.setScrollFactor(x, y,
updateChildren)` 第三个参数 `updateChildren=true` 会把 scrollFactor 广播给
`this.list`（`Container.js:1305-1320`）。但它只广播**直接子节点**，`BackpackWindow.ts` 的
装备格/道具格分别挂在 `equipLayer`/`gridLayer` 两层嵌套子 Container 里，广播不到那一层，还需要
在每次 `redrawEquip()`/`redrawGrid()` 重建后手动补调用——本质上并不比这次选的"整体换成手动
场景级命中测试"更省事，反而要在两条腿（Phaser 原生 setInteractive + 手动广播）上各留一份心智
负担，所以维持了现在这个统一方案。

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

## 命中区可视化验证（渲染坐标 vs 实际监听坐标对账）

上面的复现已经能证明"点不动"，但为了直接给出"渲染在哪、命中区在哪"两张图叠加对比（而不是
只靠点击成功/失败的间接推断），另外补了一轮更硬的验证：不用我自己推导的公式，而是直接调用
Phaser **真实的** `scene.input.manager.hitTest(pointer, gameObjects, camera)` 函数去逐个问
"这个按钮此刻到底在哪能被点中"，把结果和渲染坐标画框叠加截图。

**方法**：`git worktree add` 出修复前的提交（`a07b511`，不动共享工作区，其他棒的未提交改动
不受影响）单独起一个 dev server，playwright 独立 tab 进 L1 战斗、强制 `scrollX=400`、打开
背包（并装备一件武器，让装备格命中区也有样本）。递归遍历 `backpack.container.list`（含
`equipLayer`/`gridLayer` 嵌套子容器）收集所有 `interactive` 的 GameObject，对每一个：

- 渲染框（绿色实线）= `container.x + object.x/y ± width/height/2`（scrollFactor(0) 祖先链下
  这个位置不随相机滚动变化，前面已验证）。
- 命中框（红色虚线）= 用 `scene.input.manager.hitTest()` 真实验证：在"渲染位置"采样点调用，
  返回未命中；在"渲染位置 − camera.scroll"采样点调用，返回命中——不是猜的，是 Phaser 自己
  的函数给出的结果。

截图 `tasks/backpack-fix-shots/06-hit-overlay-BEFORE-fix.png`：关闭钮、装备格、四个页签、
出售/上一页/下一页，全部是"绿框画在按钮上，红框漂到左侧 400px 外的头像/属性栏区域甚至
画布外"——九个按钮全部 `hitAtVisual: false`（渲染位置点不中）、`hitAtPredicted: true`
（漂移后的位置才能点中），逐项打印在本报告旁的 playwright 会话记录里。

同一套方法在**修复后的代码**上重跑一遍（`resolveHit()` 是纯本地坐标运算，天然不吃相机滚动，
所以这次没有独立的 Phaser hitArea 对象可查，改为直接调用 `backpack['resolveHit'](cx, cy)`
逐个按钮验证返回的 `kind` 与预期一致，7/7 全部匹配，含新增的装备格）：截图
`tasks/backpack-fix-shots/07-hit-overlay-AFTER-fix.png`，同样 `scrollX=400`，绿框（渲染）
与青色虚线框（确认命中）现在完全重合——因为两者现在读的是同一份坐标常量，不再是两套独立
维护、容易失步的数字。

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
- `06-hit-overlay-BEFORE-fix.png`：**渲染坐标 vs 实际命中坐标叠加图（修复前）**，`scrollX=400`。
  绿色实线=按钮实际画在哪，红色虚线=Phaser 真实 `hitTest()` 确认的可点击区域——九个按钮全部
  错位，其中关闭钮/四个页签整体漂到画布左侧、部分红框落在头像和属性栏文字上，肉眼可见"点得到
  但要点在错位的隐形区域上"。
- `07-hit-overlay-AFTER-fix.png`：同一张图的修复后版本，同样 `scrollX=400`。绿框（渲染）与
  青色虚线框（`resolveHit()` 确认命中）现在逐个重合。

## 踩坑记录（协作纪律，供其他棒参考）

本次用共享 playwright 浏览器时，自开的 tab 被其他并发 agent 的操作两次顶掉/切走
（`browser_press_key`/`browser_tabs` 等高层工具似乎读写的是浏览器全局"当前 tab"指针，
会被其他 agent 的动作打断）；其中一次误在别人的 session（`localhost:5205`）上执行了一条
`heroState.vertical.y` 调试赋值 + 一次背包 toggle，随即发现并停止，未做进一步操作。
之后改为：每次都在**同一个 `run_code_unsafe` 调用**里 `bringToFront()` + 断言
`page.url()` 命中自己的端口，一旦不对立刻中止，不再触碰场景状态；所有后续步骤都用这个
"单次调用内断言+全串行"的写法完成，没有再发生跨 session 干扰。建议后续棒沿用这个模式，
或者干脆各自起一个独立的 vite dev server 端口（本次用的是 `5811`，已在收尾时关闭）。
