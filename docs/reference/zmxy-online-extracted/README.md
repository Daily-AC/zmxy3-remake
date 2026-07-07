# 造梦西游 Online 资源包解包（2026-07-07）

home 上装的《造梦西游online·大闹天庭篇》客户端实际解包出的原始资源图（不是截图，是从
SWF 里直接导出的位图素材），来源见下方"安装目录与资源形态"。

**用法与警示（与 `docs/reference/zmxy-online-screens/README.md` 同一口径）**：
Online 是系列后作（独立客户端、独立编号版本），**不是**我们的复刻对象《造梦西游3（再续
天庭 0.72）》。素材保真仍以 `vendor/zmxy_res` 里造3客户端的提取物为唯一真源；本目录只作
**系列 UI 语言的构图/布局/字体/图标参考**，像素细节、配色、构图比例不以它为准，更不能直接
拿来当最终交付素材用（私用参考，不进最终对外分发产物）。

## 安装目录与资源形态

- 安装目录：`C:\Users\Yilin Zhang\AppData\Local\4399\GameLogin\Zmxyol\`（快捷方式
  `Zmxyol_Launcher.exe`，卸载器 `unins000.exe` 表明是 Inno Setup 安装的独立客户端）。
- **本地安装包本身不含游戏资源**——只有一个 Adobe AIR 运行时（`Adobe AIR/` 目录，
  49MB 纯运行时 DLL）+ 一个 6KB 的 `zmair.swf` 启动器桩 + `zmxy_online.exe`（AIR 壳，
  应用标识 `com.4399.zmair`，`META-INF/AIR/application.xml` 声明入口内容就是那个 6KB
  的 `zmair.swf`）。**真正的游戏内容是这个 AIR 壳内嵌一个 ActiveX IE 浏览器控件，实时从
  4399 CDN 流式加载 Flash 游戏**（跟网页版造梦西游同一套交付方式，只是包了一层原生窗口）。
- 因此资源不在安装目录里，而在**当前登录用户的 IE 磁盘缓存**：
  `C:\Users\Yilin Zhang\AppData\Local\Microsoft\Windows\INetCache\IE\<随机8字符目录>\
  <符号名>[N].swf`。这次趁客户端正在运行（进程 `zmxy_online.exe`）现场抓取，缓存目录里
  已经有几十个游戏资源 SWF 包（世界地图/通用UI/怪物/角色外观/BGM/图标等），文件名沿用
  跟造3同一套命名习惯（`GameMapxxxx.swf`、`Commonxxxx.swf`、`EIconxxxx.swf`……）。
  **这份缓存是易失的**（IE 会轮换/清理容器目录），抓取时用 `Copy-Item -LiteralPath`
  （注意：普通 `-Path` 会把文件名里的 `[1]` 当成通配符字符类，导致复制静默失败/复制空）
  打包成 zip 一次性拉回 mac，未来想复现需要客户端处于运行状态时立刻抓。
- **资源格式是加密过的 SWF**（文件头被字节置换打乱，直接喂给 FFDec 会报
  `Invalid SWF file, wrong signature`）。本次逆向出参数并写了通用解密脚本
  `tools/decrypt-zmxyol-swf.py`（见下）。

## SWF 头部加密算法（本次逆向）

CLAUDE.md 记录过造3单机版的加密参数来自 `jbji/ZaoMeng_JourneyToTheWest_3_4399_Flash_Utility`
（MIT，`ZaoMengFlashCracker/main_UTF8.cpp`）：把文件前 `MY_END` 字节当一个窗口，`[MY_PIVOT:
MY_END)` 这段搬到最前面，再接 `[0:MY_PIVOT)`，窗口外字节不动；该仓库文档的参数是造3单机版
`PIVOT=200,END=275`、造2 `PIVOT=96,END=165`，都不是基于 4399 官方 CDN 的加密（是基于
bilibili UP 主 uid100857231 二创单机版逆向的），**跟 Online 官方 CDN 的这批 SWF 直接试了不
匹配**（解不出合法 SWF 头）。

本次现场对 Online 的一个真实缓存文件（`GameMapv3870.swf`）做了参数爆破：不满足于"头 8
字节看起来像合法签名"这种弱验证（假阳性概率不低），而是要求解密后紧跟头部的 zlib 流必须
**完整解压到底不报错**（`zlib.decompressobj().decompress()` 吃完全部字节、`unused_data`
为空），这是几乎不可能凑巧满足的强验证。爆破结果：**`PIVOT=300, END=325`**——是全新的一
组参数，不是造3/造2既有参数的简单倍数或变体，说明 Online 是独立加密配置，不能从 CLAUDE.md
已记录的参数直接推断。已用这组参数对本次抓到的全部 10 个加密文件解密，10/10 FFDec 打开无
报错、symbolclass 正常导出。脚本：`tools/decrypt-zmxyol-swf.py <in.swf> <out.swf> [...]`
（可传多对 in/out 做批量转换），算法说明和踩坑写在脚本头部注释里。

**结果分布**：本次抓到的 37 个缓存 SWF 里，只有 10 个是加密的（世界地图/通用UI/图标/材质
类"高价值美术资源"包：`GameMap`/`Common`/`OtherMat`/`stageCommon`/`stageInfo`/`EIcon`/
`MagicWeapon`/`petEIcon`/`GameBackGround`/关卡包），另外 27 个（角色外观/怪物/BGM/4399平台
UI）文件头本身就是合法 `CWS`，未加密——猜测 4399 只对"值得盗版保护"的一类资源包加密，跟
造3单机版"资源全加密"的策略不同。

## 目录结构（挖到的参考图，按用途分类）

| 目录 | 来源 SWF / chid / 符号名 | 内容 |
|---|---|---|
| `title-menu/` | `main-title-background.png` ← GameBackGround3870.swf chid1 `GameBG` | 标题画面完整原画：左侧四人组角色群像 + logo + 版权声明面板 |
| | `title-logo-inkwash.png` ← Commonv3720.swf chid240（无类名，MainTimeline 内嵌位图） | 水墨晕染风格 logo 底图（无角色，纯 logo+水墨笔触） |
| | `loading-screen.png` ← Commonv3720.swf chid144（无类名） | 加载画面原画：天庭浮山+彩虹+"正在加载素材中，请稍等。。。" |
| `world-map/` | `world-map-full.png` ← GameMapv3870.swf chid80（无类名，`export.SelectPLace`/`MapMenu` 等容器内嵌位图） | 完整世界地图鸟瞰图：浮岛群、熔岩区、雪山 |
| | `world-map-heaven-palace-region.png` ← chid187 | 地图局部：天庭宫阙区域（云阶+牌坊+彩虹） |
| | `world-map-dark-temple-region.png` ← chid564 | 地图局部：暗色石造神殿/地牢区域（龙纹石柱+火把） |
| `battle-hud/` | `skill-hotkey-{Y,U,I,O,L}.png` ← Commonv3720.swf chid35-39 `Skill_L/O/I/U/Y` | 技能栏键位字母图标（对照 `docs/reference/zmxy-online-screens/battle-hud.png` 里"技能栏带键位字母(YUIOL)"这一观察点的原始位图） |
| | `levelnum0`–`levelnum9.png` ← Commonv3720.swf chid21-30 `levelnum0..9` | HUD 等级数字字体（橙黄描边风格，跟角色等级徽章配套） |
| | `save-icon-ok.png`/`save-icon-fail.png` ← Commonv3720.swf chid14/13 `SaveOK`/`SaveNO` | 存档成功/失败的小图标（存档弹窗本体是 `export.saveInterface.SaveInter`/`SavingGameInterface` 等纯 vector+TextField 容器，FFDec 位图导出器抠不出完整弹窗贴图——这类"矢量拼出来的面板"目录里没有对应静态图，`zmxy-online-screens/save-slots.png` 那张真机截图仍是存档弹窗构图的主参考） |
| `skill-icons/` | `ss_*.png`（40 个）← OtherMatv3570.swf chid1-40 `ss_zq`/`ss_dzj`/…/`ss_slz`/`ss_lys`/`ss_hytj`/`ss_lyfb`/`ss_jdy`/`ss_qsez`/`ss_zz`/`ss_hmz`/`ss_hyjj`/… | 全套技能图标。**`ss_slz`/`ss_lys`/`ss_hytj`/`ss_lyfb`/`ss_jdy`/`ss_qsez`/`ss_zz`/`ss_hmz`/`ss_hyjj` 这 9 个跟 `game/src/systems/heroSkill.ts` 里悟空的 `Role1SkillId`（slz/lys/hytj/lyfb/jdy/qsez/zz/hmz/hyjj）缩写完全对上**——是目前技能树 UI 最直接能用的图标参考源，其余 31 个是别的技能/道具图标 |
| `damage-numbers/` | `pnum0/5/9`、`bunum0/5/9`、`hurtnum0/5/9`、`mp_0/5/9`、`bulnum0/5/9`、`miss`、`bingoBmd` ← stageCommonv1270.swf | 战斗飘字数字字体，共 5 个数字家族（普通伤害/子弹伤害?/受伤/MP消耗/另一伤害变体，命名含义按符号名字面推断，未逐一实机触发核对），每家族抽了 0/5/9 三个代表数字（家族内其余数字字重/风格一致，见 stageCommonv1270 全量导出于 `tmp/zmxyol-images/`，未入库）；另有 `miss`（未命中提示）、`bingoBmd`（暴击/命中特效位图，命名疑为"bingo bitmapdata"） |
| `results-screens/` | `challenge-success.png`/`challenge-fail.png` ← OtherMatv3570.swf chid226/248（`export.win.GameWin`/`export.lose.GameFail` 容器内嵌） | "挑战成功"/"挑战失败" 大字横幅，风格化描边字体+小人剪影，是战斗结算的核心视觉 |
| | `my-results-banner.png`/`retry-button.png` ← chid230/252 | "我的成绩"标签条 + "重新挑战"按钮，结算界面配套元素 |

## 未收录但已定位（价值较低或结构性拿不到，供以后按需回补）

- **无双按钮/HP血条/RoleInfo/boss血条**：`OtherMatv3570.swf` 里的 `OtherMat_fla.無雙_40`
  （chid115）、`OtherMat_fla.血_43`（chid120）、`export.RoleInfo`（chid164）、
  `GMain_bossBlood`（chid385）都只是 MovieClip 容器类名，指向内部矢量描边+渐变填充拼接
  （不是单张位图），FFDec 的位图导出器天然抠不出"合成后的样子"——真要拿到手需要用 FFDec
  GUI 逐帧渲染截图或者写 SWF 内联脚本跑一帧，本次任务时间预算内跳过，原版真实 HUD 素材
  （RoleInfo 等）本来就已经在 `game/public/assets/extracted/ui/` 里有更靠谱的真源。
- **选人界面**（`SelectTSMc`/`SelectBJMc`/`SelectWKMc`/`SelectSSMc`，Commonv3720.swf
  chid390-405）：同样是容器类，非单一位图，跳过。
- **stageInfov1620.swf**：解密成功、FFDec 能开，但内容几乎全是关卡碰撞/触发点逻辑符号
  （`export.gameSence.sl*`，两百多个关卡监听器类名），没有值得抠的静态美术资源，跳过。
- **level1.swf（缓存里未命名的 `1.swf`）、MagicWeaponv1240.swf、EIconv3420.swf、
  petEIconv1450.swf**：都已解密成功可正常打开，但内容分别是具体关卡数据、法宝特效、通用
  图标库、宠物图标库——跟本次任务优先级（标题/HUD/存档/地图/伤害字体）不直接相关，只解密
  验证过，未做位图抽取，原始解密产物在 `tmp/zmxyol-decoded/`（gitignored，未入库）。

## 复现方法

```bash
# 1. 抓取（客户端需在 home 上处于运行状态）：见 tools/ 里没有固化脚本（这次是一次性
#    交互式抓取，用的 PowerShell 片段见本次 session 记录，核心是 Copy-Item -LiteralPath
#    把 INetCache\IE\*\*.swf 打包 zip 传回 mac）。
# 2. 解密：
python3 tools/decrypt-zmxyol-swf.py <加密swf> <解密后swf输出路径>
# 3. 导出位图：
java -jar tools/ffdec/ffdec-cli.jar -format image:png -export image <输出目录> <解密后swf>
```
