# UI 复刻双源提取管线（对象树取皮 + AS3 取骨）

三源交叉验证定稿（opus/codex/fable 独立评估一致，2026-07-08）。报告：`tasks/decompile-as3-ui-report{,-codex,-fable}.md`。
本管线**取代**旧的"照截图/合成图手工像素校准"做法（那是把一步能到位的事绕成试错）。

## 一句话结论

造3 的 UI = timeline 的**皮**（控件静态坐标/尺寸/层级）+ 主 SWF AS3 的**骨**（动态布局/事件/语义）。两者物理分离在不同文件，复刻必须两个都读——不是三选一。**重编译回 SWF/AIR 改原版：no-go**（复活 2021 死运行时承载现代 agent 增量，零净收益，与已部署的 Phaser+TS+Tauri+WS 栈方向相反；可玩原版用桌面 .exe projector 已免费获得）。

## 三条管线铁律（三方各自踩坑得出，违背=白跑）

1. **类代码只认主 SWF**：`打开我开始玩.swf`（明文 CWS，446 类）是 AS3 逻辑权威源。`out_res/OtherMat1.swf`（559 类）里有同名类的**旧副本**，版本分歧（主 SWF 是魔改更新版，多防作弊/开关逻辑）。读逻辑用主 SWF，OtherMat1 只用来取符号 + 对象树坐标。
2. **子 SWF 用 out_res/ 解密版**：客户端 `assets/` 下的子 SWF 是**加密态**（magic 非 FWS/CWS），FFDec 对它们**静默输出 0 类、exit 0 不报错**（最坑：不报错但啥也没导出）。UI 皮的真源在 `vendor/zmxy_res/.../out_res/`。
3. **坐标用 xfl 精确矩阵，不手工校准**：`-format xfl:cs6 -export xfl` 直接吐出精确到小数的 PlaceObject `Matrix tx/ty`，实测与 ui-finish 之前"合成图肉眼 min-diff 校准"的结果逐格吻合——别再绕试错。

## 四个"必须停下来读 AS3"的信号（对象树永远拿不到）

对象树只有静态摆放快照。命中以下任一信号，该屏必须定点读 AS3 补行为层，否则"照坐标摆"必错：

| 信号 | 实例 | 对象树为何拿不到 |
| --- | --- | --- |
| **运行时 `new`+循环赋坐标** | BackPackElement 5×5 格 `x=col*(w+11) y=row*(h+9)` | 格子不在 SWF 文件里，PlaceObject 只有空容器 |
| **同控件多方法多坐标（多态/动画）** | GameMenu 按钮 x=751 显示 / x=1110 屏外隐藏；SkillControl 191.35/391.35 两态 | timeline 只存一帧，抠到的可能是屏外假坐标 |
| **flipHorizontal/镜像分支** | RoleInfo.setPos() 双人模式 +159/-159/翻转 | 2P 版布局根本不在 timeline |
| **gotoAndStop(state) 帧语义** | RoleInfo 血条 = 101 帧 MovieClip 逐帧美术，非 scaleX | 对象树只知它是 MovieClip，不知按帧当进度条用 |
| （附带）**事件门控逻辑** | SelectPLace 进关等级 gating（大圣坟场 lv≥40） | 非布局但复刻行为需要，只在 AS3 |

## 逐屏源码归属速查（已实测，7 屏）

| 屏 | 布局主源 | 必读 AS3 的点 | 转译估计 |
| --- | --- | --- | --- |
| RoleInfo 战斗HUD | timeline | setPos 镜像 / setSkillIcon 居中 / 血条帧语义 | 0.5~1 天 |
| SelectRole 选人 | timeline | 仅 hover 浮层相对定位 | 2~3 时 |
| SelectPLace 世界地图 | timeline | 关卡 gating（非布局） | ~1 天 |
| GameMenu 主菜单 | **AS3**（坐标写死） | showMenu/hideMenu 全套坐标 | 2~4 时 |
| BackPack 背包/个人资料 | timeline | BackPackElement 网格公式 / 战斗力公式 / 数字拼接 | 1.5~2 天 |
| SaveInter 存档 | timeline（0 坐标赋值） | state 机（读/写/删） | 半天 |
| BuySkill/SkillControl 技能树 | 混合 | SkillControl 两态坐标 | 1~2 天 |

注：类名以主 SWF 实际为准——`export.SelectPLace`（大写 L）、技能 UI 是 `export.shop.BuySkill/SkillControl/SkillSetControl/PassiveSkillControl`（不存在 "RoleSkillInterface" 类）。

## 复用四步（每屏照做）

```bash
JAVA=/opt/homebrew/opt/openjdk/bin/java
FFDEC=tools/ffdec/ffdec-cli.jar
MAIN="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf"
OTHERMAT="vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/OtherMat1.swf"
```

- **Step 1 骨**：`$JAVA -Djava.awt.headless=true -jar $FFDEC -selectclass export.<类> -export script <out> "$MAIN"`，读 `public var` 列表（=控件清单）+ 命中上表四信号的行。
- **Step 2 皮**：`-format xfl:cs6 -export xfl` 或 `-swf2xml` 目标符号所在的 out_res 子 SWF，取命名 PlaceObject 的 `Matrix tx/ty`（÷20=px，xfl 已是 px）、scale、depth。
- **Step 3 位图**：`-export image,sprite <out_dir> <子SWF>` 取原件纹理。
- **Step 4 转 Phaser/TS**：Step 1 坐标→Container 子对象；Step 2 信号逻辑→TS（镜像偏移直译/网格公式直译/帧血条→setFrame 或 tween）；Step 3 位图→纹理。交付含 xfl 坐标 vs 渲染的 overlay 对比图，主会话终审。

## FFDec 环境坑

- Java：系统 PATH 无 java，用 `/opt/homebrew/opt/openjdk/bin/java`。
- **裸跑 `java -jar ffdec.jar`（无子命令）弹 Swing GUI**（事故记录，exit 144）——headless CLI 必带子命令（`-export`/`-swf2xml`/`-dumpSWF`）+ `-Djava.awt.headless=true`。
- macOS 无 `timeout` 命令。
- 主 SWF swf2xml 产物 40+MB，按屏取子 SWF 更实际。
