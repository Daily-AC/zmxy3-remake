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

**没有验证的假设**：如果真人坐在物理屏幕前（笔记本自己的屏，不经过 UU远程），
同一个 exe 是否正常渲染。这一步需要用户配合，本次 spike 没有条件测（只有 SSH，
没有物理/真 RDP 访问）。

## 验收清单对照

1. ✅ exe 传到 home 并真实启动过——`ZMXY3RemakeSpike.exe`（101MB portable）和
   `win-unpacked/`（307MB dir 版）都传过去了，进程常驻（`SessionId=1`，非僵尸）。
2. ⚠️ 截图证据——**拿到了窗口截图，但内容区是空的**，不是"游戏画面在跑"的截图。
   截图方法（`PrintWindow` + `EnumWindows` 定位句柄）本身验证有效，为下次复用；
   但游戏本身有没有真的在这台机器上能看见，还没有确凿证据。
3. ✅ 本文档：构建命令、产物大小、home 侧运行步骤、坑清单——见上。
4. ✅ `tools/packaging/` 已 `git add` 待 commit（`wip(packaging):` 前缀，不含
   `tmp/`/`node_modules/`/`out/`）。

## 下一步建议

- 请用户（或下次有物理/RDP 访问时）在**笔记本自己的屏幕**上直接双击
  `C:\Users\Yilin Zhang\zmxy3-spike\unpacked\win-unpacked\ZMXY3RemakeSpike.exe`
  肉眼确认——如果物理屏幕上也是空白，那是这台机器 Chromium 合成器的真问题
  （可能要查 GPU 驱动版本/关掉 UU远程虚拟显示再试）；如果物理屏幕正常，则
  确认是"远程自动化路径专属"的限制，验收时改用真 RDP 而不是 SSH+计划任务这套。
- 若最终选定 Tauri（CLAUDE.md 已拍板），Tauri 用的是系统 WebView2
  （同样是 Chromium 内核）而非打包自己的 Chromium 二进制，值得留意这个合成问题
  是否也会在 WebView2 上重现——如果根因确实是虚拟显示适配器，两者都会中招。
- home 上残留：`C:\Users\Yilin Zhang\zmxy3-spike\`（exe/zip/日志/诊断脚本，
  ~250MB）留着方便下次直接复用；scheduled tasks 和桌面快捷方式已清理干净。
