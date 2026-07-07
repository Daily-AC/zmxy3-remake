# Ruffle 跑原版 SWF：可行性 spike（2026-07-08）

目的：不复刻代码,先证明能不能拿到一个"活的原版参照"——随时开 `打开我开始玩.swf`
（vendor 造3「再续天庭 0.72」全套已解密 SWF 的主入口）,截任意界面,供 UI 像素级
复刻对照。

**结论先行：桌面版 Ruffle（0.3.0,macOS universal build）完整跑通主入口 SWF,
从主菜单一路打到 boss 战斗,全程无黑屏/无崩溃/无卡关。** 音频（BGM）、AS3 逻辑
（怪物生成、按钮焦点、场景切换）、位图/矢量美术全部正确渲染,中文字体清晰。
Web 自托管版（浏览器 + WASM）只验证到"WASM 初始化 + 开始加载 SWF",headless
Playwright Chrome 里画布一直空白——大概率是 headless 环境缺 GPU 合成、不是
Ruffle 本身的 bug,没有在真实开窗浏览器里复测(时间盒内没必要,桌面版已经够用)。
**结论：桌面版 Ruffle 就是这个项目要的"活参照",今后任何界面要对照原版,直接走
下面的复现步骤开一份。**

## 跑通的界面(可复用作对照的参照点)

| 截图 | 内容 |
|---|---|
| `tmp/debug-shots/ruffle-desktop-10-after-open.png` | 主菜单——标题艺术字、6 个菜单项(新的开始/继续游戏/游戏帮助/关于我们/退出游戏/造梦论坛)、活动横幅、版权声明,BGM 在放 |
| `tmp/debug-shots/ruffle-desktop-14-doubleclick.png` | 世界地图 + 模式选择弹窗("你想要的模式为?确定为天庭主线,取消为轮玩宝珠"),底部图标栏(保存游戏/商城/炼丹炉/学习技能/活动/任务/论坛) |
| `tmp/debug-shots/ruffle-desktop-15-confirm-mode.png` | 实际横版关卡——HP/MP/怒气条 HUD、角色贴图、平台、飞行怪物(凤凰系),技能栏在底部 |
| `tmp/debug-shots/ruffle-desktop-16-move-right.png` | boss 战实拍——对战"巫鹰",紫色伤害数字浮空("7"),boss 血条独立渲染在顶部 |

日志证据(`ruffle_core::context`/`avm_trace`)显示 AS3 逻辑真的在跑,不是静态贴图:
`Loaded SWF version 41, resolution 940x590 @ 30 FPS`、`GameMenu--added`、
`生成怪物——》[object Monster30]`(世界地图周期性刷怪)、
`Focus is now on Some(Avm2Button(...))`(按钮真实响应点击)。

非致命警告(不挡渲染,原样记录):`AVM2 flash.utils.Dictionary constructor with
weak keys`、`flash.display.Loader.unload()`/`URLLoader.close()` 是 stub、
几个设备字体缺失(`方正粗圆_GBK`/`Times Roman`/`SimSun`,回退到系统字体,肉眼看
文字渲染没问题)。

## 复现步骤

### 1. 装 Ruffle desktop(0.3.0,macOS universal,无 Homebrew cask,走 GitHub release)

```bash
export HTTPS_PROXY=127.0.0.1:7897   # 走本地代理
curl -sSL -o ruffle-macos.tar.gz \
  "https://github.com/ruffle-rs/ruffle/releases/download/v0.3.0/ruffle-0.3.0-macos-universal.tar.gz"
tar xzf ruffle-macos.tar.gz -C desktop
# desktop/Ruffle.app/Contents/MacOS/ruffle 是 universal binary(x86_64 + arm64)
```

### 2. 直接用原始绝对路径启动(**不要**用 ASCII symlink 绕过中文路径)

```bash
RUFFLE=desktop/Ruffle.app/Contents/MacOS/ruffle
SWF_DIR="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)"
SWF_PATH=$(find "$SWF_DIR" -maxdepth 1 -name "*.swf")   # 用 find 取字节精确路径,别手打中文文件名
"$RUFFLE" --width 960 --height 640 "$SWF_PATH"
```

**踩坑 1——中文路径 + symlink 会导致 Ruffle 静默拒绝加载**:先建了一个 ASCII
symlink(`main.swf -> 打开我开始玩.swf`)想绕开中文文件名,结果 Ruffle 接受这个
参数(不报 clap 校验错),但会静默加载失败,回退到它自己的"点击打开文件"欢迎屏
(几乎跟系统原生 Open 面板一模一样,容易误判成"没传对参数")。换成直接传原始
绝对路径(经过 `find` 取得精确字节,不是手工重打中文文件名——手打会因为终端/
工具的 Unicode 正规化差异,复现出与 `ls` 显示不一致的字节,导致 clap 报
"Input path is not a file")就正常了。**结论:Ruffle 桌面版似乎对 symlink 目标
做了路径规范化/沙箱检查,指向仓库外部真实路径时会拒绝;用原始真实路径反而最
省事。**

**踩坑 2——本地文件访问会触发一次性权限弹窗,弹窗本体不挂在 `ruffle` 进程下**:
首次加载会跳一个原生 `CFUserNotificationDisplayAlert`("The current movie is
attempting to read files stored in "...",点 Yes 然后还会弹一个系统 Open 面板
确认目录访问)。这个弹窗**不在** `System Events` 里 `process "ruffle"` 的
window/UI element 列表里(查了几个候选进程,包括 `loginwindow`、
`CoreServicesUIAgent`,也都查不到——它就是不出现在任何进程的可枚举 window 列表
里)。能点开它的办法是 `System Events` 的**裸坐标点击**（不挂靠进程/UI 元素）:

```applescript
tell application "System Events" to click at {x, y}
```

这条命令不管坐标下面是谁的窗口都能点(截图里量出弹窗按钮的像素坐标,按屏幕
Retina 2x 换算成 point 坐标就行:`pt = 截图像素 / 2`,注意截图工具展示给我看的
图和实际 PNG 文件分辨率可能不同,要按 PNG 真实尺寸换算,不是按对话里"看到"的
展示尺寸)。点了 Yes 之后紧跟着的系统 Open 面板同样点 Open 即可,面板会自动
预选中目标目录,不用再手动导航。

**踩坑 3——单次点击游戏内菜单/按钮不生效,菜单一动不动**:同样用裸坐标点击的
`新的开始` 按钮,点一次没反应,`avm_trace` 日志也没有任何新记录。原因猜测:
macOS 对非 key window 的"首次点击只负责激活窗口,不传递点击本身"这个惯例
(`acceptsFirstMouse`),`System Events` 的 `set frontmost to true` 未必能让
winit/wgpu 窗口真正拿到 key window 状态。**解法:同一坐标连点两次**(激活 +
真正点击),`avm_trace` 立刻能看到 `Focus is now on Some(Avm2Button(...))`,
画面也确实翻页了。之后所有菜单/关卡内点击都用这个"帧内连点两次"模式,稳定复现。

```applescript
tell application "System Events"
    tell process "ruffle"
        set frontmost to true
    end tell
    delay 0.5
    click at {x, y}
    delay 0.3
    click at {x, y}
end tell
```

键盘输入(方向键等)走同一个 `tell process "ruffle" to set frontmost` 前置,
`key code 124`(→)这类可以直接生效,不需要双发。

### 3. 关闭/清理

```bash
pkill -f "ruffle.*打开我开始玩"
```

无需卸载/清理 `~/Library/Containers/rs.ruffle.ruffle`(存了 OpenH264 解码器
缓存和这次点过 Yes 的目录授权,留着下次启动更快、不用重新过一遍权限弹窗)。

## Web 自托管版:只验证到初始化,没追下去

装的是同一个 GitHub release 里的 `ruffle-0.3.0-web-selfhosted.zip`(纯静态
`ruffle.js` + wasm,零依赖,本地 `python3 -m http.server` 加一个三行 `<script>`
的 `index.html` 调 `RufflePlayer.newest().createPlayer()` 即可,不需要额外
npm 依赖)。用 Playwright headless Chrome 打开,console 显示:

```
Ruffle WASM module has been initialized
New Ruffle instance created (Version: 0.3.0 | WebAssembly extensions: ON | Used renderer: wgpu-webgl)
Loading SWF file main.swf
```

无报错(除了一条无害的 favicon 404),但画布区域(960x640)一直是纯白,等了
6 秒以上没有变化。没有继续深挖——大概率是 headless Chrome 缺乏真实 GPU 合成
导致 `wgpu-webgl` 渲染管线画不出来(跟 `docs/research/packaging-spike.md` 里
记录的"home 机器上 Chromium 网页内容画不出来、只有原生内容能画"是同一类"合成
管线在特定环境下失效"的问题,但这次是 headless 沙箱环境,不是那台机器的驱动
问题,两者不是同一根因,只是症状类似)。桌面版已经完整跑通、满足"活参照"的
目标,没必要为了验证 web 版而去装一个真实带 GPU 的浏览器窗口再测——如果以后
真需要"网页里嵌一个原版对照 iframe"这种形态,再回来这条路径确认是不是真实
windowed 浏览器也一样白屏。

## 怎么把它当 UI 参照用

1. 按"复现步骤"启动,导航到需要对照的界面(主菜单/世界地图/背包/炼丹炉/
   技能树/战斗 HUD 等——本次验证到主菜单→世界地图→模式选择→关卡→boss 战斗
   这条主线,背包/炼丹炉/技能树没点进去,但既然按钮点击链路已经验证稳定,
   点开它们只是重复"连点两次"这个动作,不预期有新的坑)。
2. `screencapture -x path.png` 截全屏,或只截窗口区域(`screencapture -x -R
   x,y,w,h`,坐标同样按 PNG 真实像素/2 换算)。
3. 跟 `game/` 里对应场景的当前实现截图并排比对像素/间距/字号/配色。
4. 素材本身(位图/矢量)如果需要单独抠出来,走既有的 FFDec 管线
   (`docs/research/asset-pipeline-notes.md`),Ruffle 只用来对"活的界面观感"
   (动效时序、面板切换、HUD 布局这些静态帧看不出来的东西),不是素材导出工具。
