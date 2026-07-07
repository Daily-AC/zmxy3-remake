# 打包验收工具链

一条命令跑通"repo → Windows exe → home 上真实运行 → 走一遍完整交互剧本 →
分段截图证据"全链路：

```bash
tools/acceptance/acceptance.sh
```

成功打印每步截图落在哪个目录：

```
==> ACCEPTANCE PASSED (all playthrough steps succeeded)
playthrough evidence (17 screenshots, one per scripted step): tmp/debug-shots/acceptance-<时间戳>/
desktop screenshot (honest on-screen state, may still be blank): tmp/debug-shots/acceptance-<时间戳>/desktop.png
```

## 2026-07-07 升级：从"只截 boot 帧"到"走完整交互剧本"

之前这条链路只证明"exe 能跑起来，第一帧渲染正确"。现在 `run-and-capture.ps1`
驱动游戏走一遍真实剧本（`playthrough-script.json` 定义，28 步）：

主菜单 → 新游戏 → 选悟空 → 进战斗（第1关·巫鹰关）→ 5 段连击打怪 → 放技能 →
（保底击杀，防止手动连击伤害不稳定卡流程）→ 走到掉落物拾取进背包 → 走到太上
老君面前对话 → 给材料 → 开炼宝面板 → 提交炼制请求（真实走 WS → agent-server
→ DeepSeek，不是 mock）→ 轮询等真实炼制结果 → 穿上炼好的装备 → 清光本关剩余
杂兵 → 打死 boss → 走传送门 → 确认进入第 2 关·天王关。**28 步全部真实跑通过
一次**（2026-07-07 对 master HEAD 8061749 验证），证据在
`tmp/debug-shots/playthrough-test/`（这次验证跑的截图，未入库，仅本地留存）：
悟空真实连击动画、太上老君对话框（"猴头，来炼丹房作甚？"）、DeepSeek 生成的
真实炼宝台词（引用了提交时给的确切描述"六道轮回杖，青花瓷纹理，锋利威猛"）、
角色从 Lv.1 打到 Lv.7、最后一张截图标题是"第 2 关·天王关"（视觉主题完全不同
的火焰龙纹场景）——证明关卡真的推进了，不是卡在原地。

**驱动方式**：不是模拟 OS 级键鼠输入（`sendInputEvent` 或 `SendKeys`），而是
调用游戏自己暴露的 `window.__*` 验收钩子（`BattleScene.exposeDebugHooks()`，
如 `__shellEnter`/`__shellSelectHero`/`__inject('pressAttack')`/`__castSkill`/
`__npcOpen`/`__submitCraft`/`__usePortal` 等）——这些钩子本来就是给验收用的，
比"设法让一个可能连可见/可聚焦都做不到的窗口收到真实按键"可靠得多（见下面
"关键发现"，这台机器上真人能看见的会话 capturePage 反而拿不到画面，跟这里
"要给一个不可见窗口发键鼠事件"是同一类根源问题——干脆绕开它，走 Electron
的 `webContents.executeJavaScript()` 直接调用页面里的钩子函数，不依赖窗口是
否可见/聚焦）。

**发现的真实问题（如实记录，未修）**：`27-final-level-state.png` 里能看到
老君对话框还叠在第 2 关标题卡上方——场景切换时旧对话框没有被清掉，是一个真实
UI 层级 bug，本次任务只负责挖出来记录，不改 `game/src/`（越界）。

## 组成

- `build-and-ship.sh`（mac 侧）：`game/` 构建 → 拷进 `tools/packaging/electron/renderer`
  → `electron-builder --win dir --x64` → 传到 home（含同步 `run-and-capture.ps1`
  和 `playthrough-script.json`）。幂等：首次全量传 `win-unpacked/`（~307MB），
  之后检测到 home 已有底座就只换 `app.asar`（~28MB，快得多，适合迭代游戏内容）。
  传之前会先杀掉 home 上还在跑的旧进程——不杀的话 `app.asar` 被内存映射锁住，
  scp 报一个不知所云的 `Broken pipe`。
- `playthrough-script.json`（mac 侧，纯数据，不是代码）：剧本步骤数组，每步
  `{id, js?, waitMs?, capture?, repeat?, repeatIntervalMs?, pollUntil?,
  pollTimeoutMs?, pollIntervalMs?}`。改剧本只改这个文件，不用碰
  `run-and-capture.ps1` 或 `main.js`。`js` 字段是要在渲染进程里执行的一行/一段
  代码（调用游戏的 `window.__*` 钩子），`pollUntil` 是一个返回布尔值的表达式，
  用来等异步操作（炼制请求走 WS 到 agent-server 有真实网络延迟，不能只 wait
  固定时间）。
- `run-and-capture.ps1`（home 侧，`build-and-ship.sh` 每次同步过去，`ssh` 触发）：
  跑两轮独立的启动+截图，一轮对应一种证据：
  1. **交互剧本轮**：纯 `Start-Process`（隔离 window station，非交互会话）
     拉起 exe → 等 boot → 把 `playthrough-script.json` 拷进 userData → 写
     `RUN_SCRIPT` 信号文件（内容是脚本文件路径）触发 `main.js` 逐步执行 →
     轮询 `SCRIPT_RESULT.json` → 解析每步结果，OK 的步骤如果有截图就记文件名
     → 杀进程。
  2. **桌面截图轮**：Scheduled Task + `LogonType=3`（交互令牌，真 SessionId=1
     会话）拉起 exe → 等场景稳定 → 触发 `ZmxyScreenshot` 计划任务 → 抓
     `C:\Projects\screenshots\` 最新文件 → 杀进程。
  两轮必须分开跑、不能用同一个已启动实例——这两种启动方式在这台机器上对
  `capturePage()` 的效果是互斥的，见下面"关键发现"。
- `acceptance.sh`：串联以上两步，解析 `STEP <id> OK/FAIL [文件名]` 输出行，
  把每一步有截图的 PNG 都传回本地 `tmp/debug-shots/acceptance-<时间戳>/`
  （每步一张，文件名就是步骤 id），唯一入口。任何一步 FAIL 整体判定
  `PLAYTHROUGH_PARTIAL_FAIL`（非零退出码），但仍然把已经拿到的截图和失败
  诊断一起打印出来，不是"一步错就什么都不给"。
- `tools/packaging/electron/main.js` 配合的机制：
  - **单帧截图协议**（保留，未删除，向后兼容/给不需要完整剧本的场景用）：
    轮询 `CAPTURE_NOW` 触发一次 `capturePage()`。
  - **交互剧本协议**（新增）：轮询 `RUN_SCRIPT`（内容是脚本 JSON 的路径），
    出现就读取脚本、逐步 `await webContents.executeJavaScript(step.js)` +
    等待 + （可选）`capturePage()` 存成 `step-<id>.png`，全部跑完写
    `SCRIPT_RESULT.json`（`{ok, at, steps:[{id, ok, jsResult?, capture?,
    error?}]}`）。单步出错会被 catch 记录到该步的 `error` 字段，**不会**
    中断后面的步骤——这样一次运行能看到"卡在哪一步"而不是运行到中途就
    整体报错退出，诊断信息更完整。
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
启动同时满足两者——这也是为什么交互剧本走 `executeJavaScript` 调用游戏钩子
而不是模拟键鼠：隔离会话里的窗口本来就不是"人眼能看见"的窗口，键鼠事件送
去也大概率进不了正确的输入队列，`executeJavaScript` 直接进渲染进程执行，
不依赖窗口的可见性/焦点状态。

## 参数

`run-and-capture.ps1` 支持覆盖默认路径/超时（一般不用改）：

```powershell
run-and-capture.ps1 -ExePath <exe路径> -UserDataDir <userData路径> `
  -ScriptPath <playthrough-script.json路径> -RunAsUser "zyl\Yilin Zhang" `
  -BootWaitSeconds 8 -ScriptTimeoutSeconds 60
```

`ScriptTimeoutSeconds` 默认 60s，覆盖了 28 步剧本的实测耗时（含一次真实
agent-server 炼制 WS 往返）；如果剧本改长/加了更多 `pollUntil` 轮询步骤，
可能要调大。

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
- 剧本步骤里的 `js` 字段调用的是 `window.__*` 钩子，这些钩子是 `game/src/`
  的一部分（`BattleScene.exposeDebugHooks()` 等）——如果场景/钩子名字改了，
  `playthrough-script.json` 要跟着改，两边不是自动同步的。目前钩子名单：
  `__shellEnter`/`__shellNewGame`/`__shellSelectHero`/`__shellConfirm`/
  `__inject`/`__heroState`/`__worldState`/`__teleportTo`/`__castSkill`/
  `__setSkillLevels`/`__npcOpen`/`__giveMaterials`/`__openCraft`/
  `__submitCraft`/`__craftState`/`__equip`/`__killGrunts`/`__killBoss`/
  `__usePortal`/`__levelState`（完整清单以 `BattleScene.ts` 源码为准）。
