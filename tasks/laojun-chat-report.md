# 太上老君聊天抽屉重做（2026-07-10）

范围：只动 `game/src/ui/hud/FurnaceRecipeView.ts`，新增两个纯逻辑模块 +
配套测试。未动 `BattleScene.ts` / `WorldMapScene.ts`（主会话并行改动中）。
`appendNpcLine(text: string): void` 公开签名不变，`WorldMapScene.onNpcMessage`
调用方式无需改动。

## 1. 横向溢出 bug — 根因

Phaser `Text` 的默认 `wordWrap` 按**空格**断词。中文长句大多没有空格，一整
段文字被当成"一个词"，永远不折行，超出宽度直接画出框外——这就是"老君回
复超出抽屉右缘"的根因，不是坐标算错。

修法：所有聊天 `Text`（老君平铺文本 + 用户气泡内文本）的 `wordWrap` 都加
`useAdvancedWrap: true`（按字符宽度折行，对 CJK 有效），宽度收紧到内容区
实际可用宽度（见下表），右缘不会再出框。

## 2. ChatGPT 式布局 — 尺寸表

`npcLines: string[]` 换成结构化 `ChatMessage[]`（`{who:'user'|'npc', text}`），
渲染时按类型分叉：

| 项 | 值 |
|---|---|
| 聊天视口 `CHAT_VIEWPORT` | x:582 y:172 w:268 h:242（原抽屉内容区，留出标题/关闭/输入行） |
| 老君文本缩进 `NPC_INSET` | 4px，wordWrap 宽度 = 268-8=260 |
| 老君文本颜色 | `HUD_COLORS.textGold`，左对齐无气泡平铺 |
| 用户气泡最大宽度 | 视口宽度 × 0.78 ≈ 209px |
| 气泡内边距 | 横 10px / 纵 7px |
| 气泡填充/描边 | `0x3a2c12` 暖棕 0.94 alpha + 1px 金色 (`GOLD`) 0.55 alpha 描边，圆角 8px |
| 用户文本颜色 | `HUD_COLORS.text`（浅色），右对齐贴视口右边缘 |
| 消息间距 `CHAT_GAP` | 10px |

气泡宽度按**实测**文本宽度（`text.width`，wordWrap 后 Phaser 会算出实际
最宽行）+ padding 与 `maxBubbleW` 取 `min`，短消息气泡窄、长消息气泡到顶
宽——这是"hug content"的 ChatGPT 手感，不是固定宽度。消息竖向堆叠用新增
纯函数 `stackChatLayout(heights, gap)`（`systems/chatLayout.ts`）按每条消
息的**实测**高度（老君=text.height，用户=bubble 高度）动态排布，不再是
旧代码的固定行距。

## 3. 历史可滚动

`chatContentLayer`（装所有消息 group 的容器）套一个 `GeometryMask`（一个
不加入显示列表的 detached `Graphics` 对象，`scene.add.graphics().setVisible(false)`
+ `fillRect(CHAT_VIEWPORT)` + `createGeometryMask()`），裁剪到
`CHAT_VIEWPORT`，超出视口的消息不再溢出画面。

滚动机制：`scene.input.on('wheel', ...)`，仅当抽屉开启且指针落在
`CHAT_VIEWPORT` 矩形内时响应；`chatScroll`（内容坐标系里视口顶部对应的
y）用 `clampChatScroll(offset, contentHeight, viewportHeight)` 钳制到
`[0, maxChatScroll]`；`applyChatScroll()` 只移动
`chatContentLayer.setY(CHAT_VIEWPORT.y - chatScroll)`，不重建消息对象，滚
动本身开销很小。新消息到达（`appendNpcLine` / `submitChat`）前把
`chatScroll` 设为 `+Infinity`，交给 `clampChatScroll` 钳成"贴底"（最新消
息可见）；其余触发 `refresh()`/`rebuildChat()` 的路径（如
`setCraftLocked`）会保留当前滚动位置而不是每次强制回到底部。

加分项：视口右侧 3px 细金色滚动指示条（`scrollIndicator`），高度按
`viewport²/contentHeight` 比例，内容不超出视口时自动隐藏。

**验证方式**（未写自动化 UI 测试，见"已知缺口"）：`npm run dev` 起本地
服务，打开炼丹炉配方面板 → 点「太上老君」开抽屉 → 连续多轮对话（可用
`window.__laojunTestAppend?.(...)` 之类的临时 hook，或直接走真实
NPC WS 回复）撑出 10+ 条超过视口高度的消息 → 肉眼确认：新消息到达自动
滚到底、鼠标悬停在抽屉聊天区滚轮可翻看历史、滚出视口的消息被裁剪不会
穿透面板边缘、滚动条比例随内容量变化。

## 4. 一账号一 session 持久化

新增 `systems/chatHistory.ts`（纯逻辑，`ChatHistoryStorage = Pick<Storage,
'getItem'|'setItem'>` 依赖注入，与本仓库 `systems/save.ts`/`saveSlots.ts`
的既有约定一致——这层不猜测 window 是否存在，测试用内存 stub 注入，运行
时由调用方传真实 `localStorage`）：

- key：`zmxy.laojun.chat.<username>`，未登录/空用户名落 `guest`。
- `loadChatHistory(storage, username)` / `saveChatHistory(storage, username, messages)`，
  上限 `CHAT_HISTORY_LIMIT = 50` 条，超出裁剪最旧的。
- 读取时过滤掉格式不对的脏数据（非数组、缺字段、`who` 不在
  `user`/`npc` 枚举内），JSON 解析失败也吞掉返回 `[]`，不抛异常。

`FurnaceRecipeView.ts` 里用户名解析照抄 `BackpackWindow.ts` 的
`resolveDisplayName` 写法（`getSharedSocialClient(resolveSocialServerBaseUrl(...)).getSession()?.user.username`），
未登录/取值失败都回落 `'guest'`。`chatStorage()` 私有方法把
`window.localStorage` typed 成注入接口，`typeof window === 'undefined'` +
`try/catch` 双重守卫（这层守卫主要防"存储被禁用"而非"跑在 vitest 里"——
本文件本来就有 `document.createElement('input')` 之类无守卫的浏览器专属
调用，从未也不会被 vitest 直接执行，守卫是防御性的，不是为了让本文件可
测）。历史在**首次**需要时懒加载（抽屉首次打开，或抽屉从未开过就先来
了一条老君消息触发自动展开），且如果解析出的用户名变化（登录状态在游
戏运行期间变化）会重新加载对应账号的历史，替换掉内存里当前 session 的
记录。

**验证方式**：浏览器打开 devtools Application → Local Storage，登录账号
A 聊几句，看到 `zmxy.laojun.chat.<A的用户名>` 写入且条数随对话增长（上
限 50）；刷新页面重开抽屉，历史原样恢复；换成账号 B 登录（或退出到
guest）重开抽屉，看到的是另一份 key 下的历史，互不串。

## 顺手修：弹层点击穿透

`WorldMapScene` 的关卡节点用真正的 Phaser `setInteractive()` +
`.on('pointerdown', ...)`（`img.setInteractive({useHandCursor:true})`，见
`WorldMapScene.ts:229/241`）。`FurnaceRecipeView` 打开时，它自己的按钮全
部走独立的 `scene.input.on('pointerdown')` + 手动矩形碰撞（这套写法是为
了绕开 `setInteractive()` 在相机滚动场景里的漂移 bug，见
`ui/screenHit.ts` 顶部说明），**但整个面板没有任何一个 Phaser 原生
interactive 对象去"占住"最上层**——所以 Phaser 的 `topOnly` 拾取会穿透
面板，落到面板下面仍然 interactive 的关卡节点上，点面板任意空白处等于
点穿进关。

修法：给已有的整屏半透明遮罩矩形（`scene.add.rectangle(480,270,960,540,
0x000000,0.6)`，本来就是纯视觉暗化背景，覆盖整个 960x540 画布）加一行
`.setInteractive()`，不挂任何 `pointerdown` 监听。它位于本容器的
`MODAL_PANEL_DEPTH`（210）深度，天然高于关卡节点的默认深度，`topOnly`
拾取会先命中它、事件到此为止不再往下传；因为没挂监听器，视觉和已有的
手动矩形碰撞逻辑（`scene.input.on('pointerdown')`）完全不受影响——两套
机制互不冲突（一个是 Phaser 对象级分发，一个是场景级全局回调）。没有另
外新增一个重复的吞噬层，直接复用现成的暗化背景矩形，最小 diff。

**验证方式**：打开炼丹炉面板，点面板内任意空白区域（非按钮、非配方
行、含 DOM 输入框周边），确认不会触发底层世界地图关卡节点的
`tryEnterLevel`；再点面板外区域，确认地图节点点击仍正常进关（没有被过
度吞噬）。

## 测试

- `systems/chatLayout.ts` 纯堆叠/滚动钳制数学（堆叠+gap、`maxChatScroll`
  为 0/正值两种情况、`clampChatScroll` 含 `±Infinity` 的"贴底/贴顶"用法）
  → `tests/chatLayout.test.ts`，8 条全过。
- `systems/chatHistory.ts` 持久化（key 生成、round-trip、多账号隔离、上
  限裁剪、脏数据/非法 JSON 容错）→ `tests/chatHistory.test.ts`，8 条全过。
- `cd game && npx tsc --noEmit`：干净，无输出。
- `cd game && npx vitest run`：59 个测试文件、607 通过 + 1 skip（既有
  skip 与本次改动无关），全绿。

## 已知缺口

`FurnaceRecipeView.ts` 本身（Phaser 视图层）目前没有专属单元测试——仓库
里同类组件 `BackpackWindow.ts` 有一套基于 `FakeGameObject` mock 的
`tests/backpackWindowLayout.test.ts`（~300+ 行 Phaser mock 脚手架），本
次为控制 diff 范围与工期，没有搭一套等价的 mock 去覆盖气泡布局/滚动裁
剪/穿透吞噬这几个新分支，只做了：①两个纯逻辑模块的完整单测，②上面列
出的手动浏览器验证步骤。如果后续要把这些也纳入自动化回归，建议照抄
`backpackWindowLayout.test.ts` 的 mock 模式新开一个
`tests/furnaceRecipeViewLayout.test.ts`。
