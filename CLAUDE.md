# zmxy3-remake — 造梦西游3 重构级重制

童年梦想项目。不是维护老 Flash，而是用现代栈重写《造梦西游3（再续天庭）》，并加入前人没做过的东西：**LLM agent 驱动的 NPC**。

## 目标与边界

- **最终验收只看桌面安装包**（2026-07-07 用户拍板）：Windows exe 装到 home（zyl，走 wanctl）真实运行为准；dmg 本机顺手出。浏览器只是开发态迭代环境，不是交付物。
- 澄清过的技术事实：Tauri exe 壳内是 WebView2（Chromium 内核），打包不改变渲染引擎；质量上限在复刻用心度不在容器。
- Windows 构建机 = home 本身（Tauri 不支持从 macOS 交叉编译 Windows）；验收工具（推包/静默装/拉起/截屏回传/崩溃日志）放 tools/acceptance/。
- **法律风险已澄清（2026-07-07 用户拍板）**：用户是造梦西游团队成员，对造3 与 Online 全系列素材的使用无版权障碍，占位/分发红线作废。素材仍不进 git（纯仓库卫生/体积，非法律）。
- **素材选用按收益，不按来源教条（2026-07-07 用户纠偏"别轴"）**：Online 与 vendor/kagami repo 素材都可直接用进最终产物，选哪个只看"哪个更完整、更现成、更还原目标界面"——登录/主菜单/存档这类 Online 版式更全就直接用 Online（用户已指定照 Online「大闹天庭篇」界面复刻登录流），战斗/角色/关卡 vendor 更全就用 vendor。标注来源仅供追溯，不构成排斥任何一方的理由，别为"纯本体"返工。同理代码：kagami repo 有现成逻辑就移植，别重写。
- **造3 官方真源升级路径**：Online 客户端「3 大闹天庭篇」就是官方造3 入口（vendor 的「再续天庭」是其后期资料片版本）。点进去让资源从 4399 CDN 流入缓存即可挖到官方造3 资源，比 vendor 魔改版更权威——注意版本可能与「再续天庭 0.72」有资料片差异，diff 后择优。
- kagami 仓库无 LICENSE：其代码只做参考不复制；已决定暂不联系作者（2026-07-07 用户拍板）。
- 造梦 Online 客户端（home）逆向结论：Adobe AIR 薄壳 + ActiveX IE 控件，游戏 SWF 从 4399 CDN 实时流入 IE 磁盘缓存（`AppData/Local/Microsoft/Windows/INetCache/IE/<rand>/*.swf`），本地无打包资源。加密 SWF 用 byte-swap，**Online 参数 PIVOT=300 END=325**（不同于离线造3 的 200/275、96/165），解密器 `tools/decrypt-zmxyol-swf.py`。产物 `docs/reference/zmxy-online-extracted/`——**系列后作，仅 UI 语言/布局参考，非复刻真源**（复刻真源仍是 vendor 造3 提取物）。坑：PowerShell `Copy-Item -Path` 把缓存名里的 `[1]` 当通配符静默失败，必须 `-LiteralPath`。

## 技术栈（已拍板，2026-07-07）

- 游戏本体：Phaser 4（2026-04 正式版，全新 node-based WebGL2 渲染器，API 与 v3 大体兼容）+ TypeScript + Vite（`game/`）
  - 注意：LLM 训练数据里 Phaser 例子多为 v3，给子 agent 派 Phaser 活时提示其先查 v4 迁移差异（渲染管线/tint/FX/Shader 有破坏性变更），纯逻辑模块不受影响
- 桌面打包：Tauri 2 为终选；黑客松期间（2026-07-07~09）先用 electron-builder 出 spike exe 验证交付链路，赛后再正规化到 Tauri
- agent NPC 服务端：独立 Node 进程（`agent-server/`），WebSocket 连游戏；已部署 home（2026-07-07）：WSL systemd 服务 `zmxy-agent`（bash -lc 拿 nvm/key，unit 挂 127.0.0.1:7890 代理防出网楔死），Windows Caddy 反代，**测试域 `wss://zm-dev.qmledmq.cn:8443`（必须带端口）**，正式域 zm 同法再绑。exe 直连远端 WS，不捆 sidecar。Caddy 配置改 C:\infra\caddy\ 受控副本再 apply.ps1 -DeployCaddy，别直改 C:\Caddy
- NPC 大脑：opencode 驱动 + DeepSeek V4 Flash（2026-07-07 用户拍板；API key 走环境变量，配置里绝不落 key 值；代码保留 provider 开关，claude-agent-sdk 路径留作 A/B）
- 架构原则（学 kagami）：游戏规则写成 Phaser 无关的纯逻辑模块，可单测；Phaser 只做渲染/输入壳

## Agent NPC 设计（核心增量）

双层大脑：反射层（引擎内 FSM，毫秒级）+ 认知层（agent，秒级异步，工具 = observe_world/say/give_item/set_goal）。
第一档：对话层 NPC（有记忆、感知世界事件、动态发任务）。
第二档（跑通后）：炼器 NPC——coding agent（opencode serve）现场生成装备/技能脚本，沙箱校验热加载。

## 上游资源（调研结论见 docs/research/upstream-survey.md）

- `vendor/zmxy_res`（github zmcj21/zmxy_res，sparse clone，不进 git）：再续天庭 0.72 完整客户端 + **out_res/ 已解密全套 SWF** + ffdec 15
- kagami-kasumi/zaomengxiyou3-zaixutiantingpian-phaser-version：3.2 万行机制逻辑（src/systems/ ~2.4 万行 Phaser 无关纯 TS）+ 6500 行逆向文档 + 素材符号名清单
  - **策略（2026-07-07 用户拍板纠偏）：移植 > 重写。** 之前"当参考不抄代码"被执行成"对着文档从零重造"，是进度慢的根因。改为以 kagami systems/ 为移植源做代码转换+接口适配。法律：kagami 无 LICENSE，直接移植=项目带其代码血统，与原版素材同属"private 自用无碍、开源前需清洗"风险级。炼丹炉合成 kagami 侧也没有，需原创（正是 agent 炼器嵌入点）。
  - 别再退回"对着逆向文档从零设计"的惯性——有 kagami 现成逻辑就移植它。
- XinTianyu-Sky/ZMXY：数值 JSON（57 怪物/10 关波次/技能曲线/装备表）和 84 个原版音频可作数据源；代码质量差不参考
- jbji/ZaoMeng_JourneyToTheWest_3_4399_Flash_Utility（MIT）：SWF 解密原理（byte-swap，造3 参数 PIVOT=200 END=275）+ 存档转换器

## 里程碑（产出 + 完成判据，不用时间盒）

1. 素材管线：FFDec 从解密 SWF 批量导出 → spritesheet。判据：浏览器里播放悟空行走+攻击动画。
2. 玩法切片：一张图、位移/跳跃/连击、一只怪、掉落进背包。判据：打死怪掉装备捡起进背包。
3. Agent NPC 对话层。判据：NPC 对话引用刚发生的游戏事件，give_item 真实进背包。
4. 炼器 NPC。判据：自然语言 → 独一无二可装备、沙箱安全的装备。
5. 桌面打包（最终验收口径）：home 上原地 build Windows exe + wanctl 远程验收链路跑通。判据：exe 在 home 双击可玩、悟空动画/战斗/agent NPC 全链路正常，截屏回传确认。dmg 为附带产物。

## 移植协议（2026-07-07 讨论定稿）

- 移植期发现"奇怪/设计不好"→ 落 report 记设计疑点，代码保持原样。当场可改仅两类：实现违背自身意图的真 bug（如 jdy 二段状态位从未置位）；平台适配（带 Adapted/Dropped 来源注释，如 level.ts 爬塔→横版）。
- 基线跑通后，疑点清单在现有场景里 A/B 定改不改——判据是真实手感对比，不是读代码的审美；试了不如原样就保持原样。
- 理由：保真即验收判据（"像小时候"）；数值是围绕原 gating 调平的，改 gating = 隐式重做平衡；先保真后改便宜、先即兴后回滚贵。
- **源优先级（2026-07-07 hero-scale 教训）**：数值/公式以原版主逻辑 SWF 反编译 AS3 为真源；kagami 是二手源（已实证含占位符：普攻写死 30-34、技能公式与原版差 6.6x），只作结构参考与对照，移植数值前先对 AS3 验一遍。
- **成长曲线校验状态（2026-07-07 独立审计，tasks/audit-numbers-report.md）**：progression.ts 中仅 Role1 悟空/Role2 已对原版 AS3（RoleN.upGrade）逐字验证；Role3/Role4 的 atk 曲线 kagami 改过（原版 20+6/16+4 vs 代码 15+8/9+4），Role5 原版根本不存在（kagami 臆造）。放开多角色前必须先对 AS3 重验，别把 progression.ts 当"全体=原版"。monsterBehaviors 的 monster3 数值亦来自 kagami（hp926 vs 原版巫鹰 300），对齐手感时需改回。

## UI 复刻管线（2026-07-08 三源交叉验证定稿）

- **双源提取**：UI 皮（控件坐标/尺寸/层级）在 timeline，骨（动态布局/事件/帧语义）在主 SWF AS3，物理分离必须都读。完整流程 + 逐屏源码归属 + 四个"必须读 AS3"信号见 `docs/playbooks/ui-port-dual-source.md`。旧的"照截图手工像素校准"作废。
- 三条铁律：①类代码只认主 SWF `打开我开始玩.swf`（OtherMat1 有旧副本，版本分歧）；②子 SWF 用 `out_res/` 解密版（`assets/` 下是加密态，FFDec 静默导 0 类不报错）；③坐标用 `-export xfl` 精确矩阵，不手工校准。
- **重编译回 SWF/AIR 改原版：no-go**（复活死运行时承载现代增量，零净收益，与 Phaser+TS+Tauri+WS 栈方向相反）。反编译产物只当只读规格源。
- 屏幕流结构缺口：原版有世界地图 hub（保存/炼丹炉/学技能/任务挂地图、从地图进关），我们缺整层——见 `docs/design/screen-fidelity-spec.md`（主会话逐屏判读 + 用户 14 张全流程参照图 `docs/reference/user-flow-refs/`）。

## 工程约定

- 进度真源：progress.md（每次 session 结束前更新）
- 素材/vendor 一律 .gitignore；工具脚本放 tools/
- git clone GitHub 走本地代理 127.0.0.1:7897
