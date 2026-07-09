# 背包/个人资料面板修缮报告（2026-07-09）

范围：`game/src/ui/hud/BackpackWindow.ts` + 其直接消费的资源 `game/public/assets/extracted/ui/backpack_bg.png`。未改动 `BattleScene.ts`。未提交 git（沙箱按要求不 commit）。

验收：`cd game && npx vitest run` → **57 files / 591 passed, 1 skipped**（`backpackWindowLayout.test.ts` 从 2 条扩到 9 条，全绿）。`npx tsc --noEmit` 对本文件 0 报错（仓库里预存在 3 条 `LobbyScene.ts` 的 unused-import 错误，与本次改动无关，未触碰该文件）。

---

## 1. 人物预览太小/没对齐框

**根因**：`PORTRAIT.fit / Math.max(portrait.width, portrait.height)` 除的是 spritesheet **整格**尺寸（200x200），但 `role1_0.png` frame(0,0) 的悟空剪影只占格子里的一小块（用 `PIL.Image.crop((0,0,200,200)).getbbox()` 测得 `left:70 top:72 right:128 bottom:172`，也就是 58x100）。等于拿"含一半透明留白的整格"当"人物本体"去算缩放，实际渲染出来的人物只有"框高85%"目标尺寸的一半左右——这才是"太小"的真根因，不是缩放系数本身设小了。

对齐问题：旧的锚点 `(169.9, 182.6)` + `origin(0.5, 0.85)` 是拍脑袋凑的，没有对准聚光灯框。用 `flood_fill` 从聚光灯地面光斑内一点 `(179,235)` 出发，在 `backpack_bg.png` 上取所有"比暗色面板背景亮"的连通像素，测得聚光灯框（光柱+地面光斑）精确包围盒：`x:[118,241] y:[113,238]`（123x125），中心 x=179.5，框底（该站脚影子的位置）y=238。

**改法**：
- 用测得的内容框（58x100）算缩放：`scale = (框高125 * 0.85) / 100 ≈ 1.0625`。
- `origin` 改用内容框自身的中心/底比例（`(70+128)/2/200=0.495`、`172/200=0.86`），而不是整格的 0.5/1.0，这样锚点对准的是"人物本体的中心/脚底"而不是"整格的中心/底边"。
- 位置改为聚光灯框实测中心/框底：`x=179.5 y=238`。

代码见 `PORTRAIT`/`PORTRAIT_CONTENT`/`SPOTLIGHT` 常量 + 构造函数里 `portraitOriginX/Y`/`portraitScale` 的计算（`BackpackWindow.ts:121-148, 360-379`）。

**验证方式**：像素级测量（flood-fill/裁切核对，多次截图核对聚光灯 bbox 与内容 bbox 边界），未做浏览器截图——按任务书交给主会话终审。

---

## 2. 昵称改读社交会话用户名

新增 `resolveDisplayName(heroName)`：照抄 `LobbyScene.ts` 底部 `runtimeSocialClient()` 的写法（`resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)` + `getSharedSocialClient`），直接 inline 在 `BackpackWindow.ts` 里（`import { getSharedSocialClient, resolveSocialServerBaseUrl } from '../../net/socialClient'`），因为这个 window 没有场景级现成 client 可借。取 `client.getSession()?.user.username`，为空/未登录/抛错一律回落到角色名（原先写死"孙悟空"的其实不是这个文件——是 `saveSlots.ts` 的 `HERO_NAMES[1]`，`BattleScene.refreshBackpackData()` 把它当 `stats.name` 传进来；这次改动只在 `BackpackWindow` 内部做"有会话就覆盖显示，没有就用传入的角色名"，没有动 `HERO_NAMES`/`BattleScene`）。

**关键坑**：`window` 在本项目 vitest（node 环境，无 jsdom）里不存在，直接访问会让已有测试炸掉。加了 `typeof window === 'undefined'` 前置判断 + try/catch 包裹，未登录/无 window/请求异常都稳妥回落，不抛错。

**验证**：新增测试「shows the logged-in social username instead of the hero name, falling back when logged out」+「falls back...without throwing when window is unavailable」，`vi.mock('../src/net/socialClient')` 配合 `vi.hoisted` 做可控 session 桩，覆盖"未登录→角色名"「登录后→用户名」「重新登出→角色名」「无 window→不抛错」四种状态。

---

## 3. 文本垂直居中

**根因**：`makeCenteredText` 用 `origin(0.5, 0)`（顶部锚点），`y` 存的是各字段凹槽的近似**顶边**（当初提取报告给的是"框位置"不是"框中线"）。

**改法**：用 `flood_fill` 从凹槽内一点出发测出每个凹槽暗色内壁的真实竖直包围盒，取中点作为新 `y`；`makeCenteredText` 的 `origin` 改成 `(0.5, 0.5)`。逐项测量结果（原 y → 新 y，均为整数像素中心）：

| 字段 | 旧 y（顶边近似值） | 新 y（凹槽中线） |
|---|---|---|
| 昵称 txt_name | 67.3 | 73 |
| 战斗力 txt_zdl | 93.1 | 99 |
| HP / MP | 260.3 | 268 |
| 攻击 / 防御 | 293.7 | 302 |
| 幸运 / 魔抗 | 327.7 | 335 |
| 暴击 / 闪避 | 360.8 / 361.3 | 369 |
| 回血 / 回蓝 | 394.2 / 393.8 | 402 |
| 经验 txt_exp | 428.8 | 436（=EXP_FILL 轨道 426~446 的中点，双重验证一致）|

「灵魂」额外要求水平居中：`flood_fill` 测出整个"灵魂[值]"框是 `x:[504,627]`，原先存的 `x=552.4, w=74` 其实正好是标签右侧"值子区"的左边+宽度（`552.4+74=626.4` 精确贴合框右边），说明原坐标没错，只是渲染时用的是左对齐(`origin(0,0)`)。改成 `x = 552.4+37=589.4`（值子区中点）+ `origin(0.5,0.5)`，并把 `makeValueText`（原来专供左对齐用）整个删掉、`soulText` 复用 `makeCenteredText`——这是本次唯一一处主动偏离原版 SWF `align left` 的字段，是任务书明确要求的（`txt_lh` 在原 SWF 确实是左对齐，改动理由已写进代码注释）。

**验证**：`backpackWindowLayout.test.ts` 新增「centers value text on both axes...」「recenters 灵魂 in its value sub-box...」两条断言 origin 与 y/x 数值。

---

## 4. 翻页条尖刺 + 页码居中

**根因排查**：`resolveHit()` 里 `PREV_BTN`/`NEXT_BTN` 只是点击热区常量，代码里**没有**为这两个按钮画任何 graphics/stroke（不是任务书猜测的"9-slice 拉伸"）。用像素扫描（对比"干净行"与"异常行"每行的非背景色最右/最左延伸点）在 `backpack_bg.png` 里精确定位到两处烘焙美术缺陷：
- 「上一页」按钮右下角：`x:[574,581] y:[443,447]` 有一块矩形色块凸出圆角边界外（阴影/斜切层没有被圆角遮罩裁掉）。
- 「下一页」按钮左下角：`x:[619,625] y:[443,446]` 有一小块脱节的浮色像素（同类烘焙瑕疵，更小）。

**改法**：写了一个一次性 Python/PIL 脚本，对这两块坐标做"用同行同色的背景色回填"（而不是整张图重绘），已确认按钮已知的直边（y=419~442 稳定在 x=573／x=623）不受影响，字形（"上一页"/"下一页"四个字 + 箭头三角）离这两块坐标有安全距离，不会被误刷掉。补丁后用同样的裁切对照（补丁前/后 crop 截图）确认尖刺消失、边角干净，无残留可见瑕疵。

原图片已保留一份备份在本机临时目录（未入库，仓库素材本就 `.gitignore`），如需回滚可随时找回；改动只落在 `backpack_bg.png` 像素数据，未改任何坐标常量。

页码居中：`NOWPAGE.x=600.8`（两按钮间 32.2px 缝隙的水平中点，本来就对）不变；`y` 从 425.6 改成 `PREV_BTN.y + PREV_BTN.h/2 = 436.2`（按钮自身的竖直中点），配合上面第 3 条的 `origin(0.5,0.5)` 统一改动，实现横竖都居中。

**验证**：像素测量前后对比截图（已核对，无法在此文本报告里贴图，主会话可自行用同一坐标复核 `backpack_bg.png`）；新增测试断言 `nowpageText.y === 436.2`（并入第 3 条那条测试）。

---

## 5. 右侧阴影带

**根因（已定位并修复，是真 bug 不是"多半是"）**：`BackpackWindow` 里全屏 dim 遮罩这行

```ts
add(scene.add.rectangle(480, 270, 960, 540, 0x000000, 0.55))
```

`(480,270)` 是"整张 960x540 画布居中"的旧写法，但这个矩形是被塞进 `children` 数组、最终交给 `scene.add.container(BG_X, BG_Y, children)` 的——Phaser 的 `Container` **不会**把已存在的 GameObject 坐标重新换算为"保持世界坐标不变"，子物体的 x/y 一旦进了容器就被当作**容器局部坐标**。所以这个矩形实际渲染中心在世界坐标 `(480+102.5, 270+21.5)=(582.5,291.5)`，960x540 的半宽半高一算，实际覆盖范围是世界 `x:[102.5,1062.5] y:[21.5,561.5]`——canvas 左边 `102.5px`（正好是 `BG_X`，面板本身的左边距）和顶边 `21.5px`（`BG_Y`）这两条窄带完全没被遮罩盖到，会透出未变暗的战斗画面。

（备注：我这里测算出来的是"左侧+顶部"露出未变暗的窄带，不是用户描述的"最右"；但这是同一个 bug 的两种描述角度都可能——不管具体是哪一侧看起来最扎眼，遮罩本身确实没有覆满整个画布这件事是可以用坐标算清楚的事实，修法对不对不依赖于"到底是哪条边看起来最明显"。也检查了面板底图 `backpack_bg.png` 右缘的 alpha 通道，边缘是正常的圆角面板轮廓透明像素，没有发现"烂边"损坏，所以判定 dim 遮罩偏移是唯一根因。）

**改法**：`scene.add.rectangle(480 - BG_X, 270 - BG_Y, 960, 540, ...)`，让矩形局部坐标反向抵消容器偏移，使其真实覆盖范围精确回到画布 `(0,0)-(960,540)`。

**验证**：新增测试「covers the true 0..960 x 0..540 canvas with the dim backdrop」直接断言 `container.children[0]`（dim 矩形）的局部坐标 = `(480-102.5, 270-21.5)`。

---

## 6. 武器格图标 + 人物持械预览

**(a) 图标映射**：`equipment.json` 里 `type==='zbwq'`（武器）共 31 条，横跨悟空/唐僧/八戒/沙僧四个角色；运行时 `Item.id` 就是这些条目的 `fillName`（`furnaceRecipe.ts: id: source.fillName`）。`extracted/icons/` 21 个图标里唯一贴武器主题的是 `star_blade`，其余都对不上任何具体武器 id。

新增 `resolveIconKey(item)`：在调用方传入的 `iconKeyFor(item)` 落到通用占位图（`ICON_FALLBACK_KEY`）**且** `item.id` 命中这 31 个武器 id 之一时，换成 `icon_star_blade`；否则原样透传。这个 wrapper 换掉了 `redrawEquip()`/`buildCell()` 里原来直调 `this.opts.iconKeyFor(item)` 的两处，所以左侧装备栏武器格 **和** 右侧背包网格里的武器条目都会吃到这个映射（不只是任务书字面提到的"武器格"）。

**缺图标物品清单**（31 个武器 id，全部目前只有 `star_blade` 这一张通用占位图，不是各自专属美术；建议按 8 种武器形制—棍/杖/耙/铲/弓/锤/斧/刀—各出一张而不是 31 张全出）：

```
ptdxzg ptdcz ptddp ptdyyc kyg kyz xhc whg jmc qybd
hylc hylz wtp zjksf zjbtg smz ydjg xlth xltc xltz
xlts zjxmc qlg plz ylf jlg jlc ryjgb lhz jcdp mdflc
```

**(b) 人物持械预览**：`BattleScene.ts` 里武器 overlay 的做法是"用同一套 200x200 格子/同一帧号，零偏移地叠在悟空当前帧上"（`WEAPON_TEX='role1_equip0'`，逐帧同步 `frame/flipX/angle/alpha/position`，代码注释明确写了"grip 会落在拳头里"）。`role1_equip0.png` 实测就是与 `role1_0.png` 完全同规格的 1200x2800（6x14x200x200）表，第 0 帧（idle 待机第一帧）跟人物立绘用的是同一帧。

照此复制了这个"零偏移"事实（未改 `BattleScene.ts`，只是把这条已知事实抄了一份到本文件，来源已在代码注释标注）：新建 `weaponOverlay`，用跟人物立绘完全相同的 `position/origin/scale`（因为对齐关系与角色格子完全一致，不需要额外换算），叠在同一坐标上，默认隐藏；`redrawEquip()` 里按 `equipment.weapon` 是否有值切换显隐。

**验证**：新增测试「shows the weapon overlay only while the weapon slot is filled」和「maps a weapon-slot item...to icon_star_blade」，覆盖显隐切换与图标映射两条逻辑。

---

## 改动文件清单

- `game/src/ui/hud/BackpackWindow.ts` —— 六条主体代码改动
- `game/public/assets/extracted/ui/backpack_bg.png` —— 像素级修补翻页按钮圆角尖刺（第4条）
- `game/tests/backpackWindowLayout.test.ts` —— 新增 7 条测试（原 2 条 → 9 条，全绿）
- `game/tasks/backpack-polish-report.md` —— 本报告

未改动：`game/src/scenes/BattleScene.ts`（按要求）。未 `git commit`（按要求，沙箱交主会话统一提交）。
