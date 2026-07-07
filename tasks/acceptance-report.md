# 验收报告：一键链路 tools/acceptance/acceptance.sh

## 结论

真实跑通了一次完整链路（不是 mock）：repo 当前状态（含最新移植的 ProgressionSystem
/ LevelSystem / SaveSystem / HeroCombatSystem / 技能树等，见 `git log`）→ `vite build`
→ `electron-builder --win dir --x64` 出 Windows 包 → 传到 home → 隔离会话拉起 →
`capturePage()` 读取渲染器帧缓冲 → 回传本地证据。

**判定用截图**（验收闸门，游戏真实渲染，非黑屏/桌面）：
`tmp/debug-shots/acceptance-20260707-162447.png` —— 悟空站在天庭云头场景（视差
背景、鳌头石柱、莲叶），HUD 显示 `Lv.1 EXP 0/135 HP 56/80 攻击 10 武器：空手`，
右上背包面板（空），画面右侧有一只妖鸟。这是从 Electron 渲染器帧缓冲直接读出的
真实画面，不经过任何屏幕呈现/合成链路。

**补充截图**（非判定，如实记录人眼视角现状）：
`tmp/debug-shots/acceptance-desktop-20260707-162447.png` —— 桌面截图上前台是一个
终端窗口，游戏窗口标题栏"造梦西游3 Remake"可见但被终端遮挡；这条截图链路本来
就不用来判定通过与否（见下"已知限制"），这次连游戏窗口都被别的前台窗口挡住是
新观察，不影响验收结论。

脚本退出码 0（`ACCEPTANCE PASSED`），全程约 3 分钟（本地 build+打包最慢，~90s；
home 侧启动等待+双轮截图 ~30s；scp 传输因为走的是 app.asar 增量路径，几秒）。

## 用法

```bash
cd /Users/e0_7/Projects/zmxy3-remake
./tools/acceptance/acceptance.sh
```

无参数。成功时打印两条本地路径（capturePage 证据 + 桌面截图路径，后者可能为空，
非致命）；失败时打印失败发生在哪个阶段 + home 侧诊断日志尾部（`spike.log` 最后
15 行），退出码非 0。

幂等：可重复跑。`build-and-ship.sh` 检测 home 上是否已有 `win-unpacked` 底座——
有就只换 `app.asar`（~28MB，快），没有就传整个解包目录（~307MB，慢，仅首次或
home 侧被清理后触发）。

## 每步依赖

| 步骤 | 依赖 | 缺失时的表现 |
|---|---|---|
| `game/` build | `game/` 下 `npm install` 过；`tsc --noEmit` 干净 | vite build 报类型错误直接退出（`set -euo pipefail`），不会带着坏 dist 往后走 |
| electron 打包 | `tools/packaging/electron/` 下 `npm install` 过一次（脚本首次自动装，装 electron 33.4.11 + electron-builder 25.1.8，需要 `ELECTRON_MIRROR` 环境变量走国内镜像，否则慢/超时） | 缺 node_modules 时脚本自动 `npm install`，但如果没设镜像会卡在下载 electron 二进制 |
| ssh 别名 `home` | `~/.ssh/config` 里 `Host home`（`home.qmledmq.cn:20777`，见 winhome-infra skill） | ssh 连不上直接报错退出，不会挂起 |
| home 侧不能挂代理环境变量 | 脚本已 `unset https_proxy http_proxy all_proxy`（scp/ssh 走代理会连不上或很慢；electron 二进制下载反而需要代理，两者互斥，脚本按阶段各自处理） | 忘记 unset 的话 scp 可能超时或连去错的出口 |
| home 侧 `zmxy3-spike/` 目录 + 已装好的 `win-unpacked` 底座 | 首次跑会自动建目录 + 传整包 | 目录不存在时脚本会创建，不算失败模式 |
| home 侧 `ZmxyScreenshot` 计划任务 | 另一 session 已注册（principal "Yilin Zhang", LogonType Interactive），见 `docs/research/home-setup.md` | 任务不存在时 `run-and-capture.ps1` 打印 `DESKTOP_SHOT_SKIPPED: ZmxyScreenshot scheduled task not found`，不影响 `CAPTURE_OK` 判定 |
| home 侧有人登录物理/远程 console session | `quser` 查有 Active session 才会尝试桌面截图 | 无人登录时打印 `DESKTOP_SHOT_SKIPPED: no user has an Active console session`，非致命 |
| home 侧 GPU/虚拟显示适配器（"网易UU远程"装的 GameViewer Virtual Display Adapter） | 已知会导致 GPU 子进程偶发崩溃（exitCode 34）；`main.js` 已加自动降级重启一次（`disableHardwareAcceleration()`）兜底 | 极端情况下两次都崩会导致 `CAPTURE_TIMEOUT`，需要人工登录 home 排查 `spike.log` |

## 失败模式排查表

| 症状 | 大概率原因 | 排查/修复 |
|---|---|---|
| `vite build` 阶段直接报错退出 | `game/` 里有 TS 类型错误或语法错误（并行 team 正在改 `game/src/`） | 先 `cd game && npx tsc --noEmit` 单独看错误，不要在 acceptance 脚本层面猜 |
| `scp` 报 `Broken pipe` | home 上还有旧进程内存映射着 `app.asar`，覆盖写入被文件锁挡住 | 脚本已经在传输前 `Stop-Process ZMXY3RemakeSpike`；如果仍然出现，手动 `ssh home 'Get-Process ZMXY3RemakeSpike \| Stop-Process -Force'` 后重跑 |
| `scp` 报 `Received message too long` | macOS 新版 OpenSSH 默认走 SFTP 协议，Windows OpenSSH Server 握手有问题 | 脚本里所有 scp 调用都已带 `-O`（legacy 协议）；如果手工调试时忘了加会复现这个 |
| `scp` 报 `No such file or directory`（拉桌面截图时） | Windows 绝对路径（`C:\Projects\screenshots\...`）没转成 `home:/Projects/screenshots/...` 形式（去盘符、反斜杠转正斜杠、加前导 `/`） | 脚本已处理（`sed -E 's/^[A-Za-z]://' \| tr '\\' '/'`）；如果远端脚本后续加了新的桌面截图目录要同步改这行 |
| `scp` 报 `protocol error: filename does not match request` | `ssh home '...'` 拿回的字符串是 CRLF，路径末尾带隐形 `\r` | 脚本已经 `tr -d '\r'` 处理 ssh 输出，不要绕过这一步直接用原始字符串 |
| `CAPTURE_EMPTY: ... dims={"width":0,"height":0}` | 复现过的已知怪现象：用交互会话（`LogonType=3`/真人能看见）启动的实例，`capturePage()` 稳定拿 0x0；只有隔离 `Start-Process` 会话才能拿到真实帧。脚本设计上两轮截图**必须分开跑**，不能复用同一个已启动实例 | 确认 `run-and-capture.ps1` 里 capturePage 轮用的是 `Start-Process`（不是 scheduled task），如果这行被改成 scheduled task 就会必现这个问题 |
| `CAPTURE_FAILED: ...`（明确错误信息） | GPU 子进程崩溃（`child-process-gone` type=GPU, exitCode 34），`main.js` 应已自动降级重启一次；如果两次都崩会到这里 | 看 `spike.log`（脚本失败时自动打印尾部 15 行）；人工登录 home 用 `Get-Process`/事件查看器看崩溃详情 |
| `CAPTURE_TIMEOUT` | home 侧启动特别慢，或 `CAPTURE_NOW` 信号文件轮询没被 `main.js` 侦测到 | 检查 `main.js` 的轮询逻辑是否还在（不要被后续改动误删）；临时提高 `run-and-capture.ps1` 的 `-CaptureTimeoutSeconds` |
| `DESKTOP_SHOT_SKIPPED: ...` | 计划任务不存在 / 无人登录 console / 触发后没来得及生成文件 | 非致命，跳过即可；如果需要人眼截图证据，先 `quser` 确认物理/远程会话在线 |
| home 上桌面截图内容区仍是空白或被其他窗口遮挡 | **已知 open item，不是这个脚本的 bug**：Chromium 内容合成到虚拟显示适配器（GameViewer Virtual Display Adapter）这条链路本身有问题，`capturePage()` 才是判定证据；这次额外观察到前台还叠了一个终端窗口挡住游戏窗口标题栏，属于同一类"人眼视角不可靠"的表现 | 不用当作本次验收失败处理；需要坐实"人眼可见"需要真人到场或真 RDP 会话，见 `docs/research/packaging-spike.md` 第 6-8 节 |
| home ssh 不可达 | 网络/wanctl 侧问题，跟这个脚本无关 | 先用 `wanctl`/裸 `ssh home 'hostname'` 单独确认连通性，再重跑 acceptance.sh |

## 边界确认

本次执行只调用了已存在的 `tools/acceptance/acceptance.sh`（未修改脚本本身，重跑
仍然工作，无需改动），只新增了这份报告文件。未触碰 `game/src/`、`agent-server/`
（这两处这次运行期间有其他并行 team 在改，`git status` 显示的相关 diff/未跟踪
文件均非本次任务产出）。

## 遗留问题

- 屏幕呈现问题（人眼在物理/虚拟屏幕上看见游戏画面）仍然 open，根因怀疑是 home
  上"网易UU远程"装的 GameViewer 虚拟显示适配器与 Chromium 合成器不兼容，见
  `docs/research/packaging-spike.md`。不阻塞验收（`capturePage()` 已经是更硬的
  证据），但如果未来验收口径改成要求人眼截图，需要真人到场或真 RDP 测试。
- 当前链路走的是 electron-builder spike（CLAUDE.md 已拍板正式打包是 Tauri 2，
  home 原地编译）；本工具链只验证"能不能跑通"，不是最终交付形态，Tauri 化
  时这套 build-and-ship/run-and-capture 脚本需要重写（WebView2 没有
  `capturePage()` 的直接等价物，需要另找方法，如 `CapturePreview` API）。

## 追加验收：master 中间态冒烟测试（终包风险前置，2026-07-07 18:09）

**背景**：距上次验收后 repo 内容体量翻倍（技能/MP、炼丹炉、存档、四关关卡数据、
84 个音频 mp3、大量新素材、主菜单/选人/存档等新场景）；同时 `BattleScene.ts` 正
在被另一个 agent 做阶段 B 大重构，工作树处于半成品状态（`git status` 显示
`BattleScene.ts`/`hudTheme.ts`/`ui-preview.ts` modified + 一个未跟踪的
`placeholder-online/` 目录）。目的是在半成品还没合完之前，先确认"代码体量翻倍
后打包链路是否还成立"，不是测半成品本身。

**方法**：没有直接对着脏工作树跑（会把半成品打进中间包），也没有用 `git stash`
（多 team 并行同一 checkout，stash 会把其他 agent 未提交的改动一并抽走，太危险）。
改用 `git worktree add --detach <scratchpad路径> master` 开一个独立干净副本
（`master` 此时与 `origin/master` 完全同步，0 commits 差异，即"当前 master"=
"origin/master"，两者本次没有歧义）。`game/node_modules` 和
`tools/packaging/electron/node_modules` 用符号链接指回主 checkout 已装好的目录
复用（纯 tooling 依赖，跟具体素材无关，省了重装 electron 二进制的时间），跑完
`git worktree remove` 干净移除，不留痕迹。

**结果：PASSED，且发现的都是"变多了"而不是"变坏了"**：

1. `vite build` 干净通过（`tsc --noEmit` 零错误，40 modules，JS bundle 1.77MB/
   gzip 410KB——比上次 spike 的 1.73MB 只涨了一点点，符合预期，新增内容主要是
   `public/` 静态资源而非 JS 逻辑膨胀）。
2. **`dist/` 总体积从上次量级涨到 96MB**（本报告没记录上次的精确 dist 体积，
   量级判断来自本次现场检查），构成：`dist/assets/audio/` 84 个 mp3 全部正确
   出现在 `dist/` 里（12MB，个数验证过是 84，不多不少）；`dist/assets/extracted/`
   下 `level1`~`level4`/`menu`/`npc`/`icons`/`ui` 全部 8 个子目录都在。`vite.config.ts`
   的 `base: './'` 没被改动，`dist/index.html` 引用仍是相对路径
   `./assets/index-*.js`，源码里也没有新引入 `/assets/...` 绝对路径写法（Electron
   打包最常见的相对路径坑没有复发）。**结论：体积暴涨（96MB）是真实内容增长，
   不是资源误打包/重复打包的信号**，但如果后续还要塞更多素材，这个体积迟早要
   考虑分层/压缩策略，先记一笔。
3. **capturePage 截图确认新入口正确渲染**：`tmp/debug-shots/smoke-master-
   capturePage.png`——不再是直接进战斗，而是 `MainMenuScene`：标题 logo（用的
   正是上次从 Online 客户端逆向出的水墨 logo 素材）、"进入游戏"按钮、"游客登录 ·
   本地存档 · 回车 / 点击进入" 提示文字，全部正确渲染，不是白屏/资源404。这是
   本次验收的核心新证据——证明"入口场景换了之后，新场景本身的素材加载链路没
   有断"。
4. **验证缺口（诚实记录，没有强行绕过）**：现有 `run-and-capture.ps1` 的
   capturePage 机制只在启动后固定等待再触发一次截帧，**没有模拟点击/回车**，
   所以这次没能独立证实"点进游戏后能到战斗场景"这一步（任务书要求的第2条
   验收点的后半段）。本次严格遵守"不改任何代码，纯验证"的边界，没有为了让
   这条链路更完整而去改 `main.js`/`run-and-capture.ps1` 加交互模拟能力，把这个
   验证缺口如实记在这里而不是假装测过。**如果需要坐实这一步**，需要单独一个
   小任务给 capture 协议加"发送一次 Enter/点击"的能力（main.js 已经支持
   `CAPTURE_NOW` 信号文件轮询机制，理论上可以照同样思路加一个 `ADVANCE_NOW`
   信号在截帧前先模拟输入，但这是新功能，不在本次纯验证范围内）。
5. `spike.log` 尾部检查：GPU 子进程崩溃+自动降级重启一次的模式跟以前完全一致
   （`exitCode 34`→ `disableHardwareAcceleration()` 重启），Phaser 4.2.0 正常打
   出 banner，控制台没有任何资源 404/加载失败的错误行。**没有发现新失败模式**。
6. 桌面截图（非判定，如实记录）：`tmp/debug-shots/smoke-master-desktop.png`——
   跟已知限制一致，内容区仍然空白（这次前台还叠了用户自己在操作的浏览器窗口，
   碰巧连带印证了 CLAUDE.md 新记录的"Online「大闹天庭篇」就是官方造3入口"这
   条情报——截图里能看到用户当时在看的 4399 系列页面有"4 洪荒大劫篇/5 上古
   天帝篇"分集入口，与"3 大闹天庭篇=造3"的说法自洽，纯属捎带观察，不是本次
   任务目标）。

**结论**：当前 master 的打包链路在内容体量翻倍后依然成立，没有发现体积暴涨
之外的新失败模式；新入口场景（MainMenuScene）资源加载正确。深入到战斗场景的
验证需要一次单独的"给 capture 协议加交互模拟"的小任务，不在这次纯验证范围内。
