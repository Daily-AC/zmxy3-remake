# 造梦西游3 官方资源（Online 客户端「3 大闹天庭篇」现挖，2026-07-07）

**这批是复刻真源候选，不是仅供参考**——CLAUDE.md 已记录：法律风险已澄清（用户是
造梦西游团队成员），且 Online 客户端登录后篇章选择里的"3 大闹天庭篇"就是官方
造梦西游3 本体入口（vendor 的"再续天庭"是其后期资料片版本）。这批资源来自用户
亲自点进"3 大闹天庭篇"主界面/技能/装备强化面板时，资源从 4399 CDN 实时流入
home 机器的 IE 磁盘缓存——跟 `docs/reference/zmxy-online-extracted/`（Online 系列
后作，仅 UI 语言参考）性质不同，这批**标注来源即可直接用作复刻依据**。

## 挖到什么

用户点开"炼丹炉"（装备强化）+ 技能面板时，缓存里新增了 5 个资源包（此前
`docs/reference/zmxy-online-extracted/` 那次挖掘时没有，因为用户当时还没点进
造3 主界面）：`RoleSkillInterfacev3550.swf`（技能树/技能购买 UI）、
`StrengthEquipmentv1090.swf`（装备强化五合一：强化/分解/合成/打造/重铸）、
`TaskInterfacev1490.swf`（任务面板）、`ActivityInterfacev3870.swf`（历年活动
UI 大杂烩，不含造3 本体核心内容）、`MicropaymentInterfacev1420.swf`（内购商城）。
全部已是合法 `CWS` 签名，未加密，`-export symbolclass`/`-export image` 直接可用
（这批高交互性面板包没走加密，跟上次挖到的世界地图/图标等"值得保护"的美术包
不同）。

本目录只收录跟当前项目直接相关的两块——**技能面板**和**装备强化（含炼丹炉）**：

| 目录 | 内容 |
|---|---|
| `furnace-ui/` | `panel-header-炼丹炉.png`——**"打造"标签页的面板抬头直接写着"炼丹炉"三个字**，是我们"炼丹炉"命名和视觉概念的官方原型；`fusion-recipe-diagram.png`——合成配方图示：主装备+副装备+神火+神铁 → 生成物（配"所需灵魂"消耗提示），是官方"用材料合成新装备"这套飞轮的可视化原型；`tab-*.png`——强化/分解/合成/打造/重铸五个标签按钮，是装备强化系统的完整功能分区 |
| `skill-tree-ui/` | `elixir-tier-list-一品丹到五品丹.png`——一品丹～五品丹的分级列表，官方就用"丹"分级命名炼丹产物，直接印证我们"炼丹炉"叫法贴合原版语言；`panel-frame-blank.png`——空白墨笔面板底（跟其他系列包同款笔触边框，UI 语言一脉相承）；`skillicon_slz/lys/jdy/hmz/hyjj.png`——5 个跟我们 `heroSkill.ts` skillId 缩写完全对应的技能图标样本（完整 40 图标集已在上次任务的 `docs/reference/zmxy-online-extracted/skill-icons/` 里，这里只再挑几个确认新包里的版本） |
| `boss-skill-icons/` | `combo-up-up.png`/`combo-down-down.png`/`combo-down-up.png`——boss 技能面板里的方向组合输入图标（↑↑/↓↓/↓↑），格斗游戏式连招输入提示，上次挖掘没有的新内容，暂无直接用途，归档留存 |

未深挖（时间预算内跳过，已定位但判断价值较低）：`TaskInterface`（日常任务/活动
任务/领取奖励三个 tab，任务系统 UI，本项目暂无任务系统）、`ActivityInterface`
（`export.huodong.*` 命名空间下 40+ 个历年活动/节日/周年庆界面类，纯运营活动
UI，跟核心玩法复刻无关）、`MicropaymentInterface`（内购商城，私人复刻项目
不做付费）、`41v3651.swf`（昆仑山/王母/小龙女 NPC 相关的特定活动关卡场景，
不是通用 UI 组件）。

## 关键 diff：vendor（再续天庭 0.72）vs Online「大闹天庭篇」同名资源

抽 5 对同名资源做符号计数对比（`-export symbolclass` 数行数，不逐符号逐一比对
内容，是规模级 diff 不是像素级 diff）：

| 资源 | vendor（再续天庭 0.72） | Online（大闹天庭篇） | 差异 |
|---|---|---|---|
| `EIcon1.swf` / `EIconv3420.swf`（图标库） | 1.51MB，866 符号 | 1.25MB，657 符号 | vendor 多 209 个图标（+32%） |
| `WuKong.swf` / `Role1v690.swf`（悟空本体+弹幕） | 4.09MB，34 符号 | 1.88MB，20 符号 | vendor 多 14 符号，体积大一倍以上 |
| `Music.swf` / `Music_v700.swf`（音效库） | 10.21MB，84 符号 | 0.65MB，74 符号 | vendor 多 10 条音效 |
| `OtherMat1.swf` / `OtherMatv3570.swf`（杂项：选人/选关/交互物） | 5.67MB，**304 符号** | 2.53MB，**78 符号** | vendor 多近 4 倍符号——vendor 这包含选人 `SelectRole`、选关 `SelectPLace`、传送风 `TransferWind` 等一整套系统级 UI，Online 这包只有 78 个基础符号 |
| `MagicWeapon.swf` / `MagicWeaponv1240.swf`（法宝特效） | 1.02MB，36 符号 | **6.64MB，90 符号** | **反过来了**——这一项 Online 比 vendor 多且大得多 |

**结论**：前 4 对资源一致支持"vendor（再续天庭）是比 Online（大闹天庭篇）更晚、
内容更多的资料片版本"这个假说——图标、音效、杂项 UI 系统（尤其选人/选关这类
框架级组件）vendor 都更丰富，跟"再续天庭是资料片、大闹天庭篇是本体"的时间线
吻合。**但 `MagicWeapon`（法宝特效）这一项方向相反**，Online 版反而更大更多——
说明"vendor 版本更全"不是一条放之四海皆准的规律，法宝特效系统在两个版本间
可能被重新设计/精简过，不是单纯的"资料片=只增不减"。

**给复刻真源优先级的建议**：核心玩法系统（选人/选关框架、通用 UI 组件、音效
覆盖面）优先信 vendor（再续天庭 0.72，内容更全，且已是我们当前复刻的基线，
换源等于推倒重来不划算）；**但涉及"炼丹炉"命名/装备强化系统这类 vendor 版本
可能没有独立呈现的具体子系统，Online「大闹天庭篇」这批新挖到的 UI（尤其
`StrengthEquipment` 五合一面板、"炼丹炉"抬头文字）值得单独核对 vendor 的
`backpack1.swf`（`export.strength.*` 逻辑绑定类所在包）是否有对应/更完整的
同名系统再决定**——本次任务时间预算内没有反向去查 vendor 侧 `backpack1.swf`
的 `export.strength.*` 符号表做逐一核对，这是下一步如果要深入炼丹炉视觉设计
时该做的功课，先如实记录成一个开放项而不是假装已经查完。

## 复现方法

同上次流程（`docs/reference/zmxy-online-extracted/README.md` 已有完整步骤），
唯一差异：这批 5 个新包大多数**没有加密**（`-export symbolclass`/`-export image`
可以直接用，不需要先跑 `tools/decrypt-zmxyol-swf.py`）——只有 `EIconv3420`/
`OtherMatv3570`/`MagicWeaponv1240` 这三个是本次重新抓到的、已知需要解密的旧包
（PIVOT=300/END=325，跟上次一致）。

## 后续更新：不用再等用户点，88 个官方资源已批量直下到本地（同日）

反编译已缓存的官方 loader（`v3870.swf` → 内嵌 `gamefile.swf`）拿到完整资源清单和
CDN 直连 URL 规律，方法+过程详见 `docs/research/canonical-art-hunt.md`"后续"一节。
结果：88 个官方 SWF（134MB，覆盖开局必加载的 7 个 UI 包、全部关卡容器、boss、宠物、
四个角色本体）已直接从 `https://sda.4399.com/4399swf/upload_swf/ftp7/hanbao/20120107/6/`
批量拉到本地 `vendor/canonical-hunt/official_4399/batch/`（gitignored，不进 git，
跟 `vendor/` 全部素材同规矩）。以后要抠具体某个关卡/怪物/UI 面板的美术，直接从这批
本地文件解密（`tools/decrypt-zmxyol-swf.py`，未加密的文件跳过这步）+ FFDec 导出即可，
不需要再连 home、不需要再等用户点任何界面。
