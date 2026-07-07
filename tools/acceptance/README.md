# 打包验收工具链

一条命令跑通"repo → Windows exe → home 上真实运行 → 截图证据"全链路：

```bash
tools/acceptance/acceptance.sh
```

成功时打印 `screenshot: tmp/debug-shots/acceptance-<时间戳>.png`——这张图是
`webContents.capturePage()` 直接读渲染器帧缓冲拿到的，不经过屏幕呈现/合成/
虚拟显示这条链路，见 `docs/research/packaging-spike.md` 第 7 节。失败时打印
诊断信息（`spike.log` 尾部 + 进程状态）而不是静默挂起。

## 组成

- `build-and-ship.sh`（mac 侧）：`game/` 构建 → 拷进 `tools/packaging/electron/renderer`
  → `electron-builder --win dir --x64` → 传到 home。幂等：首次全量传
  `win-unpacked/`（~307MB），之后检测到 home 已有底座就只换 `app.asar`
  （~28MB，快得多，适合迭代游戏内容）。
- `run-and-capture.ps1`（home 侧，由 `build-and-ship.sh` 每次同步过去，`ssh` 触发）：
  杀掉上一轮残留进程 → 注册/重建一个 `LogonType=3`（交互令牌）的 Scheduled Task
  拉起 exe（这是唯一验证过能拿到真实交互会话窗口的方法，纯 SSH `Start-Process`
  会落进隔离的 window station——原理见 packaging-spike.md 第 4 节）→ 等场景稳定
  → 写 `CAPTURE_NOW` 信号文件触发 `main.js` 里的截帧 → 轮询结果 JSON，超时打印
  诊断退出。
- `acceptance.sh`：串联以上两步 + 把结果 PNG 传回本地 `tmp/debug-shots/`，唯一
  入口。
- `tools/packaging/electron/main.js` 配合的两个机制（不在本目录，但是这条链路
  依赖的部分）：
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

## 参数

`run-and-capture.ps1` 支持覆盖默认路径/超时（一般不用改）：

```powershell
run-and-capture.ps1 -ExePath <exe路径> -UserDataDir <userData路径> `
  -RunAsUser "zyl\Yilin Zhang" -BootWaitSeconds 8 -CaptureTimeoutSeconds 20
```

## 已知限制

- 这套截图证据证明"游戏逻辑/渲染管线在 home 上正确工作"，**不证明**"人眼在
  物理/虚拟屏幕上看得见游戏画面"——后者是 packaging-spike.md 里仍然 open 的
  屏幕呈现问题（怀疑跟虚拟显示适配器有关），需要真人到场或用真 RDP 验证。
- home 交互会话的窗口创建能力在高频反复 kill/relaunch 后出现过不稳定（连续
  测试一个多小时后甚至连 notepad 都受影响过），如果 `run-and-capture.ps1`
  超时失败，先看是不是短时间内跑了很多次，歇一会儿再试。
- 目前只有 `dir` target（免安装解包目录），没有走 `portable`（NSIS 单文件）
  ——`build-and-ship.sh` 用 `dir` 是因为它免签名/免解压启动更快，适合高频
  验收循环；正式发布产物的打包工具选型仍按 CLAUDE.md 走 Tauri。
