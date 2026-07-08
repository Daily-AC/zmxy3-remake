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

---

# 追加：命中漂移家族清剿 + 存档槽 3-5 阻塞修复（唤醒后二轮）

蓝队/红队 review（`tasks/review-blue-findings.md` finding#1、`tasks/review-red-findings.md`
major#2）指出 scrollFactor(0) + setInteractive() 命中漂移是家族坑，不止 BackpackWindow 一处；
另有独立 blocker：存档槽 3-5 选中后战斗内进度从不落盘。

## 自查结论：蓝队对 BackpackWindow.ts:560-566/612-620 的指控是误报

`grep -n "setInteractive" game/src/ui/hud/BackpackWindow.ts` 只命中注释行，正文零残留——那两段
行号现在是我第一轮修复留下的 `equipHits.push`/`gridHits.push`，不是 `setInteractive()`。
git log 确认自 40e2919 起只有我一次提交碰过这个文件。判断：蓝队大概率读到了某个旧检出/缓存版本，
不是真的回归；已如实记录，不重复"修复"没坏的代码。

## 真实同族坑：FurnacePanel / ResultBanner+MenuButton / DialogueBox

逐一读源码确认（不是听蓝队转述）：
- **FurnacePanel.ts**：打造钮（原 127 行）、关闭钮（原 168 行）、每次开炉重建的材料选择
  chip（原 240 行）全部在 `scrollFactor(0)` 容器（173 行）内用 `setInteractive()`。
- **ResultBanner.ts**：dim 背景（38 行）、`result_retry` 贴图分支（97-104 行）、以及它用来画
  "继续"/"重新挑战"的共享组件 `MenuButton`（`ui/menu/MenuButton.ts:64-66` 的 `this.hit`）都
  在 `scrollFactor(0)` 容器（39/129 行）内裸用 `setInteractive()`。`MenuButton.ts` 自己的注释
  当时写着"works uniformly across Phaser 4's input system"——这句话只在相机不滚动的场景（主菜单/
  存档槽选择，`SlotSelectScene.ts` 是它另一个调用方）里成立，BattleScene 恰恰是相机持续跟随
  英雄滚动的场景。
- **DialogueBox.ts**：炼宝入口钮（原 137-141 行）同样的坑，目前 `onCraftEnter` 没被
  BattleScene 传入（代码注释自证"dead"），但迟早会重接，按同一趟修掉避免它变成埋雷。

## 修法：抽出共享 helper，四个文件统一改造

新增 `game/src/ui/screenHit.ts` 导出 `Rect` 类型 + `withinRect()`，把原来在 BackpackWindow.ts
里内联的判定逻辑收编成一份带完整机制说明的公共实现（含 Phaser 源码行号引用），四个文件全部
改成"场景级 pointerdown/pointermove 监听 + 手动矩形命中"：

- `FurnacePanel.ts`：单一 `onPointerDown`/`onPointerMove` 监听整个面板生命周期都不用重新挂，
  chip 数组每次 `rebuildChips()` 重建时只更新几何 `hitRect` 字段，不再需要每个 chip 单独挂/
  卸监听器。
- `ResultBanner.ts`：backdrop 直接去掉 `setInteractive()`（同 BackpackWindow 的判断——这局游戏
  没有需要"挡住"的世界可点击对象）；`result_retry` 贴图分支的 hover/点击进了一个
  `Hotspot[]` 数组，每次 `show()`/`hide()` 重建/清空；两个 `MenuButton` 传 `screenSpaceHit: true`。
- `MenuButton.ts`：新增可选项 `screenSpaceHit`（默认 `false`，`SlotSelectScene` 等静态相机场景
  不受影响，继续用原生 `setInteractive()`）。为 `true` 时改用
  `getWorldTransformMatrix()`（Phaser 自带、只做父子链平移合成、天生不受相机滚动干扰的坐标
  换算）实时算出这个按钮的真实屏幕矩形，监听 `scene.input` 的 `pointermove/pointerdown/pointerup`
  手动复现原有的 idle/hover/down 状态机；清理钩子挂在场景 SHUTDOWN **和**按钮自身容器的
  `DESTROY` 事件两处——因为 `ResultBanner` 每次 `show()` 都会 `body.destroy(true)` 整体重建
  两个按钮，不这样会在每次 boss 结算时攒一份新的死监听器。
- `DialogueBox.ts`：`onCraftEnter` 存在时才建的那个热区矩形同样去掉 `setInteractive()`，改成
  单个 `pointerdown` 判定；因为整条 `if` 分支目前在 BattleScene 里从未触发，没做也不可能做
  真机复现，靠 tsc/单测兜底。

顺手用同一版 `withinRect`/`Rect` 替换了 `BackpackWindow.ts` 原来内联的本地实现，避免同一套
判定逻辑五份拷贝各自漂移。

## 存档槽 3-5 阻塞：根因 + 修法

`BattleScene.ts` 的 `seedFromSave()` 自己写了一条三元表达式
`slot === 0 || slot === 1 || slot === 2 ? slot : null`，只认 0/1/2，把 3/4/5 一律映射成
`null`。`saveToSlot()`（升级/装备/捡装备/推进关卡进度的唯一落盘出口）一看到 `activeSlot ===
null` 就直接 no-op——玩家选存档槽 4/5/6（UI 里显示的编号）打游戏，退出那一刻起所有进度静默丢失。
`WorldMapScene.ts`/`SkillTreeScene.ts` 各自独立写过一份**正确**覆盖 0-5 的 `asSlotId()`，唯独
BattleScene 这份是错的——不是三份代码风格不同，是这一份真的漏了三个值。

修法：把 `asSlotId()` 提到 `saveSlots.ts` 作为唯一共享导出（`SLOT_IDS.includes(v)` 判定，
天然对全部 6 个槽正确），三个调用点（BattleScene/WorldMapScene/SkillTreeScene）全部改用这一份，
删掉各自的本地拷贝。顺手把 BattleScene 里原来手写的字符串字面量 `'shell.activeSlot'` 换成
已导入的 `REG.activeSlot` 常量（同一时机顺手对齐，不是新引入的改动）。

## 复验证据

**FurnacePanel（真机，`scrollX=400`）**：`__openCraft()` 开炉后，点击几何位置完全正确的材料
chip 与关闭钮——chip 点击后 `chips[0].selected` 从 0 变 1（`window.__scene.furnacePanel['chips']`
读取确认），随后关闭钮点击后 `__craftState().craftMode` 从 `true` 变 `false`。

**ResultBanner + MenuButton（真机，`scrollX=400`）**：直接调用 `showResultBanner()`/
`resultBanner.showFail()` 触发成功/失败两种banner，点击"继续"（成功banner，`screenSpaceHit`
版 MenuButton）和"重新挑战"（失败banner，`danger` variant）均使 `resultBanner.isOpen` 从
`true` 正确变为 `false`（对应 BattleScene 里 `onContinue`/`onRetry` 回调触发）。截图
`08-resultbanner-scrollX400.png`（成功banner，`scrollX=400` 下正常渲染+可点）、
`09-resultbanner-fail-scrollX400.png`（失败banner同条件）。

**存档槽 3-5（真机，完整用户路径）**：`__shellNewGame(4)`（选存档槽 4，即 UI"存档5"，原三元
判断排除在外的三个值之一）→ 进 L1 战斗，`__saveState().activeSlot` 立即读到 `4`（不是
`null`）→ `__gainExp(500)` 升到 4 级、装备武器、拿材料 → `__returnToMenu()`（内部调用
`saveToSlot()`）→ `__shellMenu('继续游戏')` → `__shellContinue(4)` → 重进关卡，
`__saveState()` 读到完整还原：`level:4, weapon:"赤炎噬血杖", inventory` 齐全。
**修复前对照**（`git worktree` 单独跑当时的 HEAD，同一套操作序列）：`activeSlot` 全程为
`null`，`saveState().weapon` 为 `null`、`inventory` 为空数组；`__shellSlots()` 显示该槽的
存档卡死在角色创建瞬间的 `level:1`（真实打到的 4 级进度从未写入），是"进度静默丢失"最直观
的信号。

`npx tsc --noEmit` 净、`npx vitest run --root game` 40 文件全绿（485 passed / 1 skipped，
比第一轮多出的 1 条是另一位同伴 combo 修复带来的新用例，与本轮改动无关）。commit `c49c24b`
（未 push），落盘前额外验证：单独 `git worktree add` 检出这个 commit 本身、连 tsc/vitest 一起
跑通过——确认这次提交没有把工程恢复到"能编译"状态之前的那个中间断层再遗留一次。

## 踩坑记录（追加）：共享工作目录下两个 agent 同时改一个文件，谁先 commit 谁"吞"另一方的未提交改动

这轮验证时发现：我在 `BattleScene.ts` 里改了 `seedFromSave()` 的 activeSlot 判断（当时还没
commit），另一位同伴几乎同时在同一个文件里做 hitbox/combo 修复并先 commit 了
（`73cbf72`）——git commit 打包的是那一刻整个文件的实际内容，不区分"谁的哪几行"，于是我未提交
的 `asSlotId`/`REG` 改动被顺带打进了他的 commit 里，而 `asSlotId` 真正的定义（在
`saveSlots.ts`）还留在我的工作区没提交——造成 `73cbf72` 这个历史提交点本身单独检出会编译失败
（`No matching export ... for import "asSlotId"`），直到我把剩余文件也提交（`c49c24b`）才补齐。
**教训**：共享工作目录、无文件锁的多 agent 协作模式下，一旦发现自己在改一个"高流量"文件
（这次是 BattleScene.ts，几乎每个战斗相关棒都会碰），应该缩短"读改到提交"的间隔，不要把
半成品长时间晾在未提交状态——否则随时可能被别人一次不相关的 commit 意外收编，制造出历史上
真实存在过的、无法独立编译的中间提交。已用 worktree 验证过当前 HEAD 补齐后是干净的，但这个
坑值得写进协作纪律供后续棒参考。
