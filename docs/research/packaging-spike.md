# 打包管线 spike：repo → Windows exe → home 上运行（2026-07-07）

目的：不等游戏做完，today 证明"仓库 → Windows exe → 在 home 上双击能跑"这条链路走得通。
用当前 `game/` 占位场景（Phaser 4 悟空 idle/walk/hit）即可。产出限定
`tools/packaging/`（不碰正式 Tauri 打包决策，见 CLAUDE.md 已拍板"桌面打包：Tauri 2"）。

**结论先行**：electron-builder 能从 macOS 干净交叉编译出 Windows exe（无需装 wine，
它自带一份 mac 版 wine 二进制处理签名步骤）；exe 传到 home、以真实交互会话身份启动、
确认进程常驻、窗口标题栏/原生菜单正确渲染——这几步全部走通。但卡在最后一步：
Phaser/WebGL 画布内容（乃至任何网页内容）在 home 这台机器上死活不合成到屏幕，
只有 Electron 原生的 `backgroundColor` 填色能画出来。根因高度怀疑是 home 上装的
"网易UU远程"（GameViewer）虚拟显示适配器——Windows 的 GPU 适配器列表里除了真实的
RTX 5090 / Intel 核显外，还多一个 `GameViewer Virtual Display Adapter`，Chromium 的
合成器/交换链对这类游戏串流虚拟显示驱动经常不兼容（原生 Win32 chrome 不走这条合成
路径所以还能画，网页内容要走这条路径所以画不出来）。这一步需要真人在物理屏幕前
双击验证，排除是不是只有"远程自动化路径"才复现。

## 路线选择：为什么是 electron-builder 而不是 Tauri

项目 CLAUDE.md 已拍板桌面打包用 Tauri 2，且明确"Tauri 不支持从 macOS 交叉编译
Windows"。本次任务是独立的"打包管线可行性 spike"：只验证 repo→exe→home 双击这条
物理链路今天能不能走通，不代表最终选型；用 Electron 是因为它能从 macOS 真交叉编译
出 Windows exe（Tauri 做不到，必须上 home 原地编译），拿到手感更快。已跟 team-lead
过了这个决策（无异议）。正式打包仍走 Tauri（后续里程碑，在 home 原地编译）。

## 复现步骤

### 1. game/ 侧的唯一改动：相对路径打包

```diff
# game/vite.config.ts
 export default defineConfig({
+  base: './', // 让 dist/index.html 也能通过 file:// 加载（Electron/Tauri 都用得到）
   server: { port: 5180 },
   build: { target: 'es2022' },
 })
```

不改 dev 流程（`vite` dev server 下 `base: './'` 无影响）。src 里资源引用本来就是
相对路径（`assets/extracted/...`，见 `BattleScene.ts`），不用改。

```bash
cd game && npm run build   # 产出 dist/，33M（含解密素材+音频）
```

### 2. Electron 壳：`tools/packaging/electron/`

- `main.js`：加载 `renderer/index.html`（`sync-renderer.sh` 从 `game/dist` 拷贝过来）。
- `package.json`：`electron` + `electron-builder` devDependencies；`build.win.target`
  给了 `portable`（单文件 NSIS 自解压 exe）/ `zip` / `dir`（免安装解包目录）三选。
- `sync-renderer.sh`：`npm run build`（game）→ 拷贝 dist → `renderer/`。

```bash
cd tools/packaging/electron
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/  # npm 官方源在国内慢，electron 二进制走镜像
npm install                              # 装 electron 33.4.11 + electron-builder 25.1.8，~44s
npx electron-builder --win dir --x64     # win-unpacked/，307M，快，用于快速迭代
npx electron-builder --win portable --x64  # 单文件 exe，101MB (ZMXY3RemakeSpike 0.0.1.exe)
```

macOS 上**没装 wine**（`wine`/`wine64` not found），两种 target 都能出：electron-builder
自己下载了一份 `wine-4.0.1-mac.7z`（mac 原生二进制，不是通过系统 wine）来跑
`signtool.exe`（因为没配代码签名证书，最终是 "no signing info identified, signing is
skipped"，但流程本身没有因为没装 wine 而失败）。`portable` target 额外需要 NSIS
（`nsis-3.0.4.1.7z`，electron-builder 自动下载），同样不依赖系统 wine。

产物大小：`dir` target 解包目录 307MB；`portable` 单 exe 101MB（NSIS 自解压，首次
运行会解到临时目录，之后是内存里跑，不留盘）。

### 3. 传到 home：scp 的新协议在 Windows OpenSSH 上会炸

```bash
# 会失败：scp: Received message too long <一个很大的数>
scp file.exe home:path

# 能用：强制走 legacy scp 协议（-O），且不要设代理环境变量（跟这条连接无关，
# 但混着 http_proxy/https_proxy 一起测的时候一并规避，没细究是否必要）
unset https_proxy http_proxy all_proxy
scp -O file.exe home:relative/path/to/dest   # 相对路径落在 ssh 登录目录（$HOME）
```

macOS 新版 OpenSSH 默认 scp 走 SFTP 协议；Windows OpenSSH Server 那端对这个新协议
握手有问题（不是 profile 输出污染——sftp 走独立 subsystem `sftp-server.exe`，不经过
PowerShell，同样的错）。`-O`（legacy scp 协议）实测稳定，144MB 的 zip 传输 ~23s。

### 4. home 上运行：SSH 直接起的 GUI 进程是"看不见"的

```powershell
# 这样起的进程有 PID，但是不可见：
Start-Process .\app.exe
# CopyFromScreen 会抛 "The handle is invalid" —— SSH 登录session的进程默认落在
# 隔离的 window station（类似 Session 0 服务会话的隔离逻辑），
# 即使 SSH 用户和物理登录用户是同一个账号也一样。
```

**验证方法**：`quser` / `query session` 确认物理 console 有人登录
（`yilin zhang`，SessionId 1, Active）；SSH 起的进程 `Get-Process ... SessionId`
不是 1，或者是 1 但 `MainWindowHandle` 永远 0。

**解法（两种都验证过，都能进 SessionId=1 并拿到真实窗口）**：

1. **Scheduled Task + 交互令牌**（COM API，别用 `schtasks.exe /it` 命令行）：

```powershell
$service = New-Object -ComObject Schedule.Service
$service.Connect()
$rootFolder = $service.GetFolder("\")
$taskDef = $service.NewTask(0)
$action = $taskDef.Actions.Create(0)
$action.Path = "C:\full\path\with spaces\app.exe"   # COM 属性直接赋值，没有命令行引号转义问题
$principal = $taskDef.Principal
$principal.UserId = "domain\User Name"
$principal.LogonType = 3   # TASK_LOGON_INTERACTIVE_TOKEN —— 用当前已登录用户的交互令牌
$rootFolder.RegisterTaskDefinition("MyTask", $taskDef, 6, $null, $null, 3) | Out-Null
$rootFolder.GetTask("\MyTask").Run($null)
```

   **坑**：`schtasks.exe /create /tr "路径带空格" /it` 这条命令行路子会把 exe 路径从
   第一个空格处截断（Task Scheduler 事件日志显示 `Task Scheduler failed to launch
   action "C:\Users\Yilin"`，只截到用户名第一个词），无论怎么加引号
   （单引号、双引号、`""..""`双写）在 PowerShell→schtasks.exe 的参数转义链路上
   都救不回来——`/tr` 存进任务定义时引号会丢。COM API 直接设 `.Path` 属性没有这个
   问题，路径按字符串原样存，不用处理任何 shell 转义层。

2. **模拟真双击**（`Shell.Application` COM，走真实 `explorer.exe` 进程）：

```powershell
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut("$env:USERPROFILE\Desktop\Run.lnk")
$shortcut.TargetPath = "C:\full\path\app.exe"
$shortcut.Save()
$shell = New-Object -ComObject Shell.Application
$item = $shell.Namespace("$env:USERPROFILE\Desktop").ParseName("Run.lnk")
$item.InvokeVerb("open")   # 相当于双击，子进程由 explorer.exe fork 出来
```

   两种方法起的进程 `SessionId` 都是 1，`MainWindowTitle` 都正确显示页面 `<title>`
   （标题栏中文渲染正常），原生菜单栏（File/Edit/View/Window/Help）也正确画出来。

### 5. 远程截图：PrintWindow 优于全屏截图

一开始用 `Graphics.CopyFromScreen` 截全屏，拍到的是桌面 + 其他窗口（这台机器上
"网易UU远程"会不时抢前台，SetForegroundWindow 从非前台进程调用受 Windows 的
"前台锁定超时"限制，经常静默失败），拍到我们自己窗口的概率不稳定。改用
`PrintWindow(hwnd, hdc, 2)`（`nFlags=2` 即 `PW_RENDERFULLCONTENT`，硬件加速内容
必须加这个 flag 才能截到，普通 PrintWindow 对 GPU 合成的窗口经常截出全黑/全白）
直接指定窗口句柄截图，不受 z-order/前台窗口影响。定位句柄用 `EnumWindows +
GetWindowThreadProcessId` 按 PID 反查，比 `Process.MainWindowHandle`（有时候在
刚启动几秒内还没就绪，返回 0）更可靠。

截图证据（`tmp/debug-shots/home-exe-*.png`，供以后验收复用同一套方法）：
- `home-exe-05.png`：`PrintWindow` 截到的窗口——标题栏"造梦西游3 Remake"和原生
  菜单栏正确渲染，但内容区全白（问题最初现形）。
- `home-exe-08-redbg-test.png`：`BrowserWindow({backgroundColor:'#ff0000'})` 诊断——
  红色能画出来，证明合成器本身没死，只是网页内容那条合成路径画不出来。
- `home-exe-11-minimal.png`：连一个不含任何 CSS/JS/asar 的最小 `data:` URL 页面
  （纯内联 HTML，蓝底白字）都画不出来，只显示 backgroundColor 的红——排除是
  Phaser/WebGL 或素材加载的问题，是 Chromium 合成流水线本身的问题。
- `home-exe-13-chrome-check.png`：同样手法启动系统自带 Google Chrome 做对照，
  11 个 chrome.exe 子进程起来后也**没有任何一个进程能查到 MainWindowHandle**
  （不确定是否因为 Chrome 单实例机制把真正的窗口留在了另一个可能早已存在的实例
  上，这个对照测试不算决定性证据，但方向上支持"这不是我们代码的问题"）。

### 6. 卡住的地方：GPU 合成器不出网页内容

已排除：素材/JS 加载失败（`did-finish-load` 触发，console 打出 Phaser v4.2.0
banner，`index.html`/`app.asar` 路径都 `exists=true`）；WebGL 上下文创建失败（试过
`app.disableHardwareAcceleration()` + `--enable-unsafe-swiftshader` 强制走软件
WebGL，日志里"Automatic fallback to software WebGL has been deprecated"警告消失了，
说明真的切到了 SwiftShader，画面依然是空的）；GPU 沙箱权限（`--disable-gpu-sandbox`
同样无效）。

`Get-CimInstance Win32_VideoController` 显示三张"显卡"：

```
GameViewer Virtual Display Adapter   OK   15.6.5.199
NVIDIA GeForce RTX 5090 Laptop GPU   OK   32.0.15.9201
Intel(R) Graphics                    OK   32.0.101.8243
```

`GameViewer Virtual Display Adapter` 是"网易UU远程"（游戏串流远程协助工具）装的
虚拟显示驱动。`[System.Windows.Forms.Screen]::AllScreens` 只看到一块 1707×1067
的屏，很可能就是这块虚拟显示（游戏笔记本原生面板分辨率通常不是这个数，且用户
大概率是通过 UU远程串流访问这台机器，不是坐在物理屏幕前）。这类面向游戏串流的
虚拟显示驱动常见不支持 Chromium 期望的窗口合成/交换链呈现模型（它们通常只优化
DirectX 独占全屏路径），这跟"原生 Win32 内容能画、Chromium 合成层内容不能画"的
症状完全吻合。

**没有验证的假设（round 1 时）**：如果真人坐在物理屏幕前（笔记本自己的屏，不经过
UU远程），同一个 exe 是否正常渲染——round 2（下节）用 `capturePage()` 绕开了这个
假设，不需要真人在场也拿到了决定性证据。

## 7. round 2：`capturePage()` 自证——游戏本身证实能跑

team-lead 提了三条补测路线：① `--disable-direct-composition`（Chromium 在 Windows
上默认走 DirectComposition 呈现，怀疑跟虚拟显示驱动打架）；② `webContents.
capturePage()` 直接读渲染器帧缓冲，绕开合成器/显示输出；③ `MoveWindow` 挪到物理
显示器坐标再截。补了 ①②，③ 因为后来窗口创建本身变得不稳定（见下）没跑成。

**关键突破**：在 `did-finish-load` 3 秒后调用 `win.webContents.capturePage()` 存盘，
配合 `app.commandLine.appendSwitch('disable-gpu-sandbox')` +
`--disable-direct-composition` + `--disable-features=DirectComposition`，一次用
plain SSH（隔离 window station，非 SessionId=1）启动的实例上，`capturePage()` 存出
了一张**真实 1008×690、32KB 的 PNG**——`tmp/debug-shots/home-exe-14-capturepage.png`：
悟空 idle 站姿贴图正确显示，左上角调试 HUD 文本正确渲染（`action: wait  x: 480
y: 400  vy: 0.0` / `grounded: true  jumps: 0` / `combo: 0  running: false`），底部
操作提示文本正确显示，背景是我们 CSS 设的深藏青色（不是之前诊断用的红色占位）。
**这就是"游戏画面在跑"的直接证据**——比屏幕截图更硬，因为它是从渲染器自己的帧
缓冲直接读出来的，不经过任何屏幕呈现/合成/虚拟显示这条链路，不存在"肉眼看不见
但其实在跑"的解释空间。

同时补充了崩溃诊断（这轮才加的，之前没有）：`app.on('child-process-gone', ...)`、
`process.on('unhandledRejection', ...)`、`process.on('exit', ...)`。加上之后立刻
在日志里看到之前从没见过的一条：

```
child-process-gone: {"type":"GPU","reason":"crashed","exitCode":34,"serviceName":"GPU"}
```

GPU 子进程确实在崩（exit code 34），只是之前没打日志所以看不见——回头看，前面
round 1 的"内容区全白"很可能就是这次崩溃的下游表现，不是一个独立现象。

**`--disable-direct-composition` 的因果关系没有坐实**：开着这个 flag 时，遇到过
"GPU 崩了但 app 挺住并成功渲染"（就是上面那张突破性截图的那次）；但后续反复在
`SessionId=1`（真交互会话）里用同样的启动方式（scheduled task + `LogonType=3`）
测试时，`capturePage()` 开始稳定返回 `0x0`（`dims={"width":0,"height":0}`），
`EnumWindows` 按 PID 反查也找不到任何窗口（连不可见的 0×0 窗口都没有）——**关掉
这个 flag 重测，同样是 0 个窗口**，说明这个 flag 不是这一现象的决定变量。怀疑是
这台机器在这轮测试里被反复 kill/relaunch（一个多小时内几十次）之后，`SessionId=1`
这个交互会话本身的窗口创建能力开始不稳定，跟 GPU/DirectComposition 未必是一回事。
没来得及做一个干净的对照（同一会话状态下开关这个 flag 各测一次）就已经进入这个
不稳定阶段，所以" round 1 的红底/白屏假设"和"这个 flag 是否真的解决问题"都还没有
最终定论——但已经不重要了，因为 `capturePage()` 已经绕开了整个问题，证明了游戏
本身没问题。

**MoveWindow 到物理显示器坐标（team-lead 补测路线 ③）没跑成**：到这一步为止交互
会话里已经拿不到有效窗口句柄了，没有可移动的窗口。

## 验收清单对照（round 2 更新）

1. ✅ exe 传到 home 并真实启动过——`ZMXY3RemakeSpike.exe`（101MB portable）和
   `win-unpacked/`（307MB dir 版）都传过去了，进程常驻（`SessionId=1`，非僵尸）。
2. ✅ **游戏画面确认在跑**——`capturePage()` 直接从渲染器帧缓冲截出真实游戏画面
   （悟空 + 实时调试 HUD），`tmp/debug-shots/home-exe-14-capturepage.png`。仍然
   **没有**拿到"人眼在物理/虚拟屏幕上直接看见游戏画面"的截图——这条链路（合成器
   →屏幕呈现）本身还有问题，但游戏逻辑/渲染管线本身已经证实正确，不再是未知数。
3. ✅ 本文档：构建命令、产物大小、home 侧运行步骤、坑清单、根因排查全过程——见上。
4. ✅ `tools/packaging/` 已 `git add` 待 commit（`wip(packaging):` 前缀，不含
   `tmp/`/`node_modules/`/`out/`）。

## 下一步建议

- **屏幕呈现问题不再阻塞"游戏能不能跑"这个问题**——已经证实能跑。如果验收口径
  接受 `capturePage()` 这种"读帧缓冲"证据（技术上比人眼截屏更硬，因为不可能是
  "凑巧画对了别的东西"），这条 spike 到这里就可以算过了。
- 如果验收口径坚持要"人眼在屏幕上看见"，建议先让这台机器歇一会儿再测（这轮
  一个多小时内反复 kill/relaunch 了 20+ 次，`SessionId=1` 的窗口创建能力在测试
  末段变得不稳定，不确定是不是测试本身造成的系统状态劣化），或者换一次干净会话
  只测一个变量（比如就测"物理屏幕前双击"，不叠加其他自动化操作）。
- 若最终选定 Tauri（CLAUDE.md 已拍板），Tauri 用的是系统 WebView2
  （同样是 Chromium 内核）而非打包自己的 Chromium 二进制，值得留意 GPU 崩溃
  （exit code 34）和呈现问题是否也会在 WebView2 上重现——如果根因确实是虚拟显示
  适配器，两者都可能中招；`capturePage()` 这个自证手段在 Tauri/WebView2 下没有
  直接等价物，需要另找方法（WebView2 有类似的 `CapturePreview` API）。
- home 上残留：`C:\Users\Yilin Zhang\zmxy3-spike\`（exe/zip/日志/诊断脚本，
  ~250MB）留着方便下次直接复用；scheduled tasks（`ZMXY3Spike2`）和桌面快捷方式
  这轮测试后还没清理，下次接手时先跑一遍 cleanup（kill 进程 + 删 scheduled tasks
  + 删桌面 `ZMXY3RunMe.lnk`）。

## 8. round 3：把配方固化成一键工具（`tools/acceptance/`），顺带纠正 round 2 一个错误猜测

team-lead 收尾单：把 build→ship→launch→capture 这套配方固化成 `tools/acceptance/
acceptance.sh` 一条命令入口（`build-and-ship.sh` + `run-and-capture.ps1`），main.js
补两件事——① 截帧触发从"固定 3 秒计时器"改成"轮询信号文件"（调用方控制时机）；
② GPU 崩溃时自动 `disableHardwareAcceleration()` 重启一次（写标记文件避免死循环）。
详见 `tools/acceptance/README.md`。**真实跑通了完整链路**（不是 mock），最终产出
`tmp/debug-shots/acceptance-20260707-132104.png`——里程碑 2 的完整战斗画面（天庭
视差背景、悟空对战云头妖鸟带血条、背包 UI、NPC"闭关中"状态、连击/拾取提示），
比 round 2 那张纯 idle 站姿的图信息量大得多，因为 game/ 这几个小时里已经并行推进
到这个程度。

**纠正 round 2 的一个错误结论**：round 2 末尾我把"交互会话里 capturePage 返回
0x0"归因于"测试机器被反复 kill/relaunch 搞劣化了"。round 3 用全新脚本、干净
状态重跑，**同样的 0x0 又出现了**——connect 3 次复现，不是偶发。这排除了"机器
累了"的解释，坐实是一个**跟启动方式绑定的确定性差异**：

- Scheduled Task + `LogonType=3`（交互令牌，真 SessionId=1 会话）：窗口本身
  `getBounds()` 完全正常（`{x:213,y:109,width:1281,height:801}`，加了
  `screen.getPrimaryDisplay()` 诊断日志确认显示器信息也正常：`1707×1067`），
  但 `capturePage()` 稳定返回 `{width:0,height:0}`，3/3 复现。窗口尺寸不是原因
  （已用 `win.setBounds()` 强制过，无效）。
- 纯 SSH `Start-Process`（隔离 window station，非交互会话）：`capturePage()`
  稳定拿到正确内容（round 2 一次、round 3 这次，2/2）。

也就是说，**"真人能看见的那个会话"恰恰是 capturePage 拿不到画面的那个会话**，
反过来"capturePage 能拿到画面的会话"人眼永远看不见（隔离 window station）。这
两件事在这台机器上像是互斥的，进一步支持"根因在 GameViewer 虚拟显示适配器只
attach 到 SessionId=1、并在那个会话里连累了 Chromium 的帧读回路径"这个猜测，
但没有再深挖底层原因（时间成本 vs 价值不划算——两条路都不通向"人眼截屏"这个
目标，一条通向 capturePage 证据，够用）。

**设计取舍**：`run-and-capture.ps1` 因此选择用纯 `Start-Process`（隔离会话），
因为这是唯一能可靠拿到 `capturePage()` 证据的方式——工具的目标是稳定复现"游戏
渲染正确"这个已被 team-lead 验收的证据形式，不是死磕"人眼看见"这个仍然 open
的问题（后者见上面"下一步建议"，需要真人到场或真 RDP）。

**另一个坑**：`build-and-ship.sh` 首次没在传 `app.asar` 前杀掉 home 上还在跑的
旧进程，scp 报 `Broken pipe`（不是网络问题，是 Windows 文件锁——运行中的 exe
把 `app.asar` 内存映射住了，覆盖写入把传输流弄坏，报错信息完全不指向真实原因）。
修复：`build-and-ship.sh` 传文件前先 `Stop-Process`。

## 9. 接上另一 session 装好的桌面截图链路，双证据闭环

team-lead 转来情报：另一个并行 session 把 home 依赖链装完时，顺手装好了一套
独立的桌面截图工具——`C:\Projects\screenshot.ps1`（`Graphics.CopyFromScreen`
截整个虚拟屏）+ 计划任务 `ZmxyScreenshot`（Principal "Yilin Zhang"，
`LogonType Interactive`，按需触发），端到端验证过能拉回 694KB 真实桌面 PNG。
这条链路本质跟我自己那套 `PrintWindow`/`EnumWindows` 方案是同一个问题的两种
解法（都要解决"SSH 直接起的 GUI 进程在隔离会话里看不见"），复用现成的而不是
重造一遍。

已经把它接进 `run-and-capture.ps1`：现在一次 `acceptance.sh` 产出**两张图**——
capturePage 帧缓冲证据（判定验收是否通过的硬证据）+ 触发 `ZmxyScreenshot` 拿到
的真实桌面截图（人眼视角的诚实现状，不判定通过与否，纯粹如实记录）。用这台
机器现成的 `ZmxyScreenshot` 重新验证了一遍第 7/8 节的发现：以交互会话
（`LogonType=3`）方式拉起 exe 后触发桌面截图，看到的**还是标题栏"造梦西游3
Remake"+ 原生菜单栏正确渲染，内容区空白**（`tmp/debug-shots/
interactive-desktop-with-game.png`）——跟我自己那套截图方法拍到的一模一样，
这是一次独立交叉验证：不是我的截图方法有问题，是这台机器上这个会话下 Chromium
内容真的画不出来。

**顺手修的两个坑**（都是"file transfer 看起来失败但其实是格式问题，不是连不上"
类型，容易误判成大问题）：

- `ssh home '...'` 拿回的字符串是 CRLF 结尾（Windows 那头的行尾），脚本里
  `grep`/字符串比较前必须先 `tr -d '\r'`。忘了处理的后果：从 `DESKTOP_SHOT
  <path>` 这行摘出来的路径末尾带一个看不见的 `\r`，传给 `scp` 报
  `protocol error: filename does not match request`——报错完全不提示真实
  原因，排查了几分钟才想到是行尾字符。
- `scp -O` 拉取不在 SSH 登录目录（`$HOME`）下的绝对路径文件（比如
  `C:\Projects\screenshots\foo.png`，这个盘符路径跟 `$HOME`
  即 `C:\Users\Yilin Zhang\` 不是同一棵树），必须写成
  `home:/Projects/screenshots/foo.png`（去掉盘符、反斜杠转正斜杠、加前导
  `/`）——直接抄 Windows 风格路径字符串会报 `No such file or directory`。
  这跟 team-lead 情报里说的"scp 在这台机器上不工作，要用 base64 管道"结论不
  一致：实测 `scp -O` 配合正确的路径格式完全能用，之前判定"不工作"大概率是
  没加 `-O` 或者路径格式没转换对——已经在这条工具链里验证过好几次，不需要退
  到 base64 方案。
