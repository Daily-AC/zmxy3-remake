# S6 主菜单微调 — 派工 brief（session4 第五棒/收尾小棒，2026-07-08）

授权背景：本项目是《造梦西游3》团队成员的授权重制（CLAUDE.md「法律风险已澄清」节），FFDec 读取的是团队自有游戏资源。

## 目标

按 `docs/design/screen-fidelity-spec.md` §S6 微调主菜单（已接近，小棒收尾）。三项差距：
1. 右栏菜单项应带下划分隔线、字距版式照原版；
2. 标题栏文字重影（两行标题叠字）修掉；
3. 菜单项集合对齐 vendor 版（新的开始/继续游戏/游戏帮助/关于我们/退出游戏；造梦论坛→外链可省）。

## 源与判据

- playbook 归属表：GameMenu 布局主源是 **AS3（坐标写死）**——showMenu/hideMenu 全套坐标从主 SWF `export.GameMenu`（或近名类）读，注意"多态多坐标"信号（x=751 显示 / x=1110 屏外隐藏，timeline 抠到的可能是屏外假坐标）。
- 素材：现 MainMenuScene 用 Online title 底（用户指定保留）；菜单栏区域若 vendor 有原件（分隔线/字体位图）按对象树取，取不到的文字项用现有渲染但字距/行距按 AS3 坐标。
- 判据（spec 原文）：与 Ruffle 版 overlay（**菜单栏区域**）——参照用 `docs/reference/user-flow-refs/menu-original.png`；先按 playbook 纪律 3 对几何（互相关配准可复用 S5 报告方法）。
- 前棒教训必读：tasks/skilltree-report.md「终审返修」（自造 chrome 会被打回；版式与参照分歧先核 vendor 再定论）。

## 交付物

代码（本地 commit，**不 push**）、`tasks/menu-polish-report.md`（AS3 坐标摘录+出处、改动清单、豁免清单）、overlay（`game/tmp/s6-overlay/`）、流程截图（主菜单→新的开始/继续游戏 两路仍通，`game/tmp/s6-flow/`）、`npm test` 全绿（基线 450）+ `npm run build` 过。

## 环境事实

同前棒（Java /opt/homebrew/opt/openjdk/bin/java；FFDec tools/ffdec/ffdec-cli.jar headless 带子命令+-Djava.awt.headless=true；vite nohup 独立端口，5199 是主会话 dev server 可复用；调试产物落 game/tmp/）。

## 验收

主会话终审 overlay 菜单栏区域 + 两路流程回归。
