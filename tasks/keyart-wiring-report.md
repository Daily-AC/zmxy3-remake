# 首屏接线 — 交付报告

任务：把 art-keyart 棒产出的生图素材（`game/public/assets/generated/`，commit 7d84b3a）接进
`MainMenuScene.ts`/`SlotSelectScene.ts`，替换掉素材审计（`tasks/asset-audit-report.md`）定性
的全库最后一个"活体脏件"`online/title/title-bg.png`（一张造梦西游 Online 宣传截图，烘焙了
4399 版权声明全文 + 错误的 Online logo + Online 自己的菜单项），并删除该文件。

## 改动

- `MainMenuScene.ts`：背景从 `title_bg`（`assets/online/title/title-bg.png`）换成
  `keyart_home`（`assets/generated/keyart-home.png`，1920×1080，cover-fit 到 960×540，
  16:9 对 16:9 所以实际是等比缩放不裁切）。标题从马善政实时渲染的文字改成预渲染的
  书法位图 `title-zaixuxiyou.png`。
- `SlotSelectScene.ts`：背景同步换成 `keyart_home`，复用既有的 `0x07060a@0.62` 暗化叠层
  （brief 提到"对比度不够可加暗化垫底"——这层本来就在，不是新加的，代码注释里说清楚了）。
- 删除 `game/public/assets/online/title/title-bg.png` 及其空目录，两处 `preload()` 的
  load 行一并删除。全库 grep 确认无残留引用（`dist/` 产物里也做了字符串搜索确认零残留）。

## 一个当场发现并处理的真问题：标题位图黑墨看不见

`title-zaixuxiyou.png` 是黑色墨迹（RGB ≈ 22,18,15）在透明底上，直接贴到 `MainMenuScene`
的深色墨面板（`0x0a0a0f`，几乎同色）上后，实测截图放大裁切确认标题几乎完全不可见（只有
极淡的一团深色痕迹）。这不是"能不能接受"的审美问题，是纯粹的对比度 bug——不能就这么交付。

处理：写了一个一次性脚本，把该 PNG 的 RGB 通道整体设为纯白、alpha 通道原样保留（笔画形状/
运笔/字距完全不变，只换墨色），另存为 `title-zaixuxiyou-white.png`，`MainMenuScene.ts`
改用这张。原始黑墨版本原样保留在目录里（是 art-keyart 棒交付的原始件，不删除，只是不用它
直接贴在深色面板上）。改色理由和之前"实时文字标题为什么用白色"是同一个理由（面板本身是
深色墨底，白色/亮色才能读出来）——不是新审美判断，是延续既有结论。

## 验收证据

- `npx tsc --noEmit`：0 错误。`npx vitest run`：474/474（本任务零测试改动，纯素材/渲染层）。
  `npm run build`：过。
- 截图（`game/tmp/verdict-fixes-flow/`）：
  - `keyart-final-mainmenu.png`：主菜单，新 keyart 背景（无任何烘焙文字/logo/版权声明）+
    白色书法标题位图"再续西游"清晰可读 + 马善政字体菜单项无裁切。
  - `keyart-final-slotselect.png`：存档屏，同一 keyart 背景 + 既有暗化叠层，卡片对比度良好。
- 字符串搜索确认：`dist/assets/*.js` 产物里 `title-bg` 零命中；`game/public/assets/online/`
  目录下 `title/` 子目录已不存在。

## Adapted 记录

- 标题位图重新着色（黑→白）：Adapted，非原始交付件的直接使用，理由见上，形状/笔画未改动。

## Commit

只 `git add` 自己改动的文件：
- `game/src/scenes/MainMenuScene.ts`
- `game/src/scenes/SlotSelectScene.ts`
- `game/public/assets/generated/title-zaixuxiyou-white.png`（新增，重新着色件）
- 删除 `game/public/assets/online/title/title-bg.png`
- `tasks/keyart-wiring-report.md`（本文件）

未 push。
