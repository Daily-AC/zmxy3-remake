# zmxy3-remake — 造梦西游3 重构级重制

童年梦想项目。不是维护老 Flash，而是用现代栈重写《造梦西游3（再续天庭）》，并加入前人没做过的东西：**LLM agent 驱动的 NPC**。

## 目标与边界

- **最终验收只看桌面安装包**（2026-07-07 用户拍板）：Windows exe 装到 home（zyl，走 wanctl）真实运行为准；dmg 本机顺手出。浏览器只是开发态迭代环境，不是交付物。
- 澄清过的技术事实：Tauri exe 壳内是 WebView2（Chromium 内核），打包不改变渲染引擎；质量上限在复刻用心度不在容器。
- Windows 构建机 = home 本身（Tauri 不支持从 macOS 交叉编译 Windows）；验收工具（推包/静默装/拉起/截屏回传/崩溃日志）放 tools/acceptance/。
- 私有项目，**绝不公开分发含 4399 原版素材的产物**；素材不进 git（走本地提取管线）。
- kagami 仓库无 LICENSE：其代码只做参考不复制；已决定暂不联系作者（2026-07-07 用户拍板）。

## 技术栈（已拍板，2026-07-07）

- 游戏本体：Phaser 4（2026-04 正式版，全新 node-based WebGL2 渲染器，API 与 v3 大体兼容）+ TypeScript + Vite（`game/`）
  - 注意：LLM 训练数据里 Phaser 例子多为 v3，给子 agent 派 Phaser 活时提示其先查 v4 迁移差异（渲染管线/tint/FX/Shader 有破坏性变更），纯逻辑模块不受影响
- 桌面打包：Tauri 2（后期里程碑）
- agent NPC 服务端：独立 Node 进程（`agent-server/`），WebSocket 连游戏；桌面包内作 Tauri sidecar
- 架构原则（学 kagami）：游戏规则写成 Phaser 无关的纯逻辑模块，可单测；Phaser 只做渲染/输入壳

## Agent NPC 设计（核心增量）

双层大脑：反射层（引擎内 FSM，毫秒级）+ 认知层（agent，秒级异步，工具 = observe_world/say/give_item/set_goal）。
第一档：对话层 NPC（有记忆、感知世界事件、动态发任务）。
第二档（跑通后）：炼器 NPC——coding agent（opencode serve）现场生成装备/技能脚本，沙箱校验热加载。

## 上游资源（调研结论见 docs/research/upstream-survey.md）

- `vendor/zmxy_res`（github zmcj21/zmxy_res，sparse clone，不进 git）：再续天庭 0.72 完整客户端 + **out_res/ 已解密全套 SWF** + ffdec 15
- kagami-kasumi/zaomengxiyou3-zaixutiantingpian-phaser-version：3.2 万行机制逻辑 + 6500 行逆向文档（AS3 证据索引 mechanics-index.md）+ 素材符号名清单（AssetManifest.ts）——**当标准答案查，不抄代码**
- XinTianyu-Sky/ZMXY：数值 JSON（57 怪物/10 关波次/技能曲线/装备表）和 84 个原版音频可作数据源；代码质量差不参考
- jbji/ZaoMeng_JourneyToTheWest_3_4399_Flash_Utility（MIT）：SWF 解密原理（byte-swap，造3 参数 PIVOT=200 END=275）+ 存档转换器

## 里程碑（产出 + 完成判据，不用时间盒）

1. 素材管线：FFDec 从解密 SWF 批量导出 → spritesheet。判据：浏览器里播放悟空行走+攻击动画。
2. 玩法切片：一张图、位移/跳跃/连击、一只怪、掉落进背包。判据：打死怪掉装备捡起进背包。
3. Agent NPC 对话层。判据：NPC 对话引用刚发生的游戏事件，give_item 真实进背包。
4. 炼器 NPC。判据：自然语言 → 独一无二可装备、沙箱安全的装备。
5. 桌面打包（最终验收口径）：home 上原地 build Windows exe + wanctl 远程验收链路跑通。判据：exe 在 home 双击可玩、悟空动画/战斗/agent NPC 全链路正常，截屏回传确认。dmg 为附带产物。

## 工程约定

- 进度真源：progress.md（每次 session 结束前更新）
- 素材/vendor 一律 .gitignore；工具脚本放 tools/
- git clone GitHub 走本地代理 127.0.0.1:7897
