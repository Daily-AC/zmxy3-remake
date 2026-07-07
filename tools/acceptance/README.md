# 打包验收工具链

一条命令跑通"repo → Windows exe → home 上真实运行 → 双重截图证据"全链路：

```bash
tools/acceptance/acceptance.sh
```

成功打印两条路径：

```
capturePage proof (game renders correctly, frame-buffer read):  tmp/debug-shots/acceptance-<时间戳>.png
desktop screenshot (honest on-screen state, may still be blank): tmp/debug-shots/acceptance-desktop-<时间戳>.png
```

- 第一张是 `webContents.capturePage()` 直接读渲染器帧缓冲拿到的——不经过屏幕
  呈现/合成/虚拟显示这条链路，证明"游戏逻辑/渲染管线在 home 上真实正确工作"，
  这是脚本退出码的判定依据（`CAPTURE_OK` 才算通过）。
- 第二张是真实桌面截图（复用另一 session 已装好的 `ZmxyScreenshot` 计划任务，
  见 `docs/research/home-setup.md`），代表"人眼在屏幕上实际看到什么"的诚实
  现状——**截至 2026-07-07 这张图大概率还是只有窗口标题栏/菜单、内容区空白**
  （屏幕呈现问题仍是 open item，见下），拿不到就跳过不算失败（补充证据，不是
  验收闸门）。

失败（capturePage 拿不到）时打印诊断信息（`spike.log` 尾部）而不是静默挂起。

## 组成

- `build-and-ship.sh`（mac 侧）：`game/` 构建 → 拷进 `tools/packaging/electron/renderer`
  → `electron-builder --win dir --x64` → 传到 home。幂等：首次全量传
  `win-unpacked/`（~307MB），之后检测到 home 已有底座就只换 `app.asar`
  （~28MB，快得多，适合迭代游戏内容）。传之前会先杀掉 home 上还在跑的旧进程
  ——不杀的话 `app.asar` 被内存映射锁住，scp 报一个不知所云的 `Broken pipe`。
- `run-and-capture.ps1`（home 侧，`build-and-ship.sh` 每次同步过去，`ssh` 触发）：
  跑两轮独立的启动+截图，一轮对应一种证据：
  1. **capturePage 轮**：纯 `Start-Process`（隔离 window station，非交互会话）
     拉起 exe → 等场景稳定 → 写 `CAPTURE_NOW` 信号文件触发 `main.js` 里的
     `capturePage()` → 轮询结果 JSON → 杀进程。
  2. **桌面截图轮**：Scheduled Task + `LogonType=3`（交互令牌，真 SessionId=1
     会话）拉起 exe → 等场景稳定 → 触发 `ZmxyScreenshot` 计划任务 → 抓
     `C:\Projects\screenshots\` 最新文件 → 杀进程。
  两轮必须分开跑、不能用同一个已启动实例——这两种启动方式在这台机器上对
  `capturePage()` 的效果是互斥的，见下面"关键发现"。
- `acceptance.sh`：串联以上两步 + 把两张 PNG 都传回本地 `tmp/debug-shots/`，
  唯一入口。
- `tools/packaging/electron/main.js` 配合的两个机制：
  - **截帧触发协议**：轮询 `%APPDATA%/zmxy3-desktop-spike/CAPTURE_NOW` 是否
    存在，出现就截帧存 `captured-frame.png` + 结果元数据 `capture-result.json`
    （`{ok, size, dims, at}` 或 `{ok:false, error, at}`），不用固定计时器，
    时机完全由调用方（`run-and-capture.ps1`）控制。
  - **GPU 崩溃自动降级重启一次**：home 上观察到过 GPU 子进程崩溃
    （`exitCode 34`，根因未定，疑似跟机器上"网易UU远程"装的虚拟显示适配器
    有关，见 packaging-spike.md 第 6 节）。`app.on('child-process-gone', ...)`
    检测到 `type === 'GPU'` 且本进程还没重启过，就写一个标记文件、
    `app.relaunch()` + `app.exit(0)`；新进程启动时读到标记会
    `app.disableHardwareAcceleration()` 再删掉标记——只降级这一次，不会陷入
    崩溃重启死循环，也不会让下一次全新启动永久跳过硬件加速。

## 关键发现：两种启动方式对 capturePage 的效果是反的

- 纯 SSH `Start-Process`（隔离会话，人眼看不见）：`capturePage()` 稳定拿到
  正确画面（多次复现）。
- Scheduled Task + `LogonType=3`（真交互会话，人眼能看见）：窗口本身尺寸完全
  正常（`getBounds()`/`screen.getPrimaryDisplay()` 都正常），但 `capturePage()`
  稳定返回 `0x0`（3/3 复现，排除过是"机器测试太多次累了"这个猜测——干净重跑
  同样复现）。

也就是说"人能看见的会话"恰恰截不到画面，"截得到画面的会话"人看不见——这是
这台机器上一个尚未查清根因的怪现象（怀疑跟 GameViewer 虚拟显示适配器只
attach 到交互会话有关），详见 `docs/research/packaging-spike.md` 第 7、8 节。
`run-and-capture.ps1` 因此对两种证据各用各自能工作的启动方式，不试图用一次
启动同时满足两者。

## 参数

`run-and-capture.ps1` 支持覆盖默认路径/超时（一般不用改）：

```powershell
run-and-capture.ps1 -ExePath <exe路径> -UserDataDir <userData路径> `
  -RunAsUser "zyl\Yilin Zhang" -BootWaitSeconds 8 -CaptureTimeoutSeconds 20
```

## 已知限制 / 踩过的坑

- 屏幕呈现问题仍然 open：`capturePage()` 证明游戏逻辑/渲染管线正确，**不证明**
  "人眼在屏幕上看得见游戏画面"——需要真人到场或用真 RDP 验证是否只是这套远程
  自动化路径特有的限制。
- `ssh home '...'` 的输出是 CRLF（Windows 那边的行尾），脚本里解析路径/做
  字符串比较前一定要 `tr -d '\r'`，不然路径末尾带个隐形 `\r`，`scp` 会报一个
  完全不指向真实原因的 `protocol error: filename does not match request`。
  `acceptance.sh` 已经这么处理了。
- `scp -O` 对不在 SSH 登录目录（`$HOME`）下的绝对路径（比如
  `C:\Projects\screenshots\...`），要写成 `home:/Projects/screenshots/...`
  （去掉盘符、反斜杠换正斜杠、加前导 `/`）才能拉下来，直接抄 Windows 风格的
  路径字符串会报 `No such file or directory`。
- 目前只有 `dir` target（免安装解包目录），没有走 `portable`（NSIS 单文件）
  ——`build-and-ship.sh` 用 `dir` 是因为它免签名/免解压启动更快，适合高频
  验收循环；正式发布产物的打包工具选型仍按 CLAUDE.md 走 Tauri。
