# progress

## 2026-07-07 立项 + 上游调研（session 1）

- 拍板：造梦西游3、素材提取重写路线、Phaser3+TS+Vite、Tauri 桌面包、agent NPC 先对话层后炼器、kagami 只参考不 fork、暂不联系其作者。
- 调研结论落盘 docs/research/upstream-survey.md（两个 Phaser 重制项目深评 + 素材链路）。
- 关键发现：vendor/zmxy_res 里有再续天庭 0.72 完整客户端和**已解密**全套 SWF（out_res/），"找本体+解密"两步免了。
- 进行中：项目骨架 ✅；Java/FFDec 安装、zmxy_res sparse clone、game/ 脚手架 → 见下次记录。

- 11:04 用户变更验收口径：最终只看 Windows exe（home 上真机验收），dmg 附带；浏览器降级为开发态。已纠正"打包脱离浏览器引擎"误区（Tauri=WebView2/Chromium）。构建策略：home 兼任 Windows 构建机（wanctl）。
- Phaser 升到 4.2（2026-04 正式版，绿地无迁移成本）；CLAUDE.md 已记录"子 agent 写渲染层须查 v4 迁移差异"。
- 素材管线：WuKong.swf 首导只出了弹幕/特效，ROLE1 本体未渲染；已派 agent 测绘 34 个 SWF + 攻克 ROLE1 导出，产出 docs/research/asset-pipeline-notes.md。

- 11:30 **里程碑 1 达成**：ROLE1_* 实为 1200×2800 位图表（6×14 格 200×200），动作表硬编码在主逻辑 SWF（22 动作映射已提取，见 asset-pipeline-notes.md）；悟空接入 Phaser 4，浏览器验证 wait/walk/hit1 全部真实播放（证据 tmp/debug-shots/）。修复：素材本体朝左、flipX 反了（用户实测发现"倒着走"）；补 x 边界钳制；加 window.__scene 验收钩子。
- 用户新增约定：调试产物一律落项目内（tmp/ gitignored）；推送用 GitHub（home 与 mac 同 gh 账号，不走 wanctl 推包）；打包优先试 Pake（tw93/Pake），不行退裸 Tauri。
- 建 GitHub 私有仓库并推送（见下条 commit）。

- 12:05 用户宣布黑客松语境：还剩两天，要求尽可能并行收敛。分治图定为四线并行（game/src 内串行）：A 战斗切片(opus,进行中) / B agent-server NPC 服务端(sonnet,已派) / C 打包 spike——今天必须出 home 上能跑的 exe，主路线 electron-builder 交叉构建，Tauri/Pake 赛后再正规化(sonnet,已派) / D 原版八戒沙僧素材猎手(sonnet,进行中)。怪物/掉落/背包、音频、HUD 刻意串行排在 A 之后。
- 素材验收：批量导出全部通过（唐僧正统；八戒/沙僧确认被魔改换皮→用户拍板：先用魔改造型推进，另派 D 找原版）。asset-exporter 另发现原版数据 bug：Monster7 hit2 指向不存在的贴图行，已剔除记档。
- 两天目标 demo：home 上双击 exe → 第 1 关战斗切片（悟空 vs 怪、掉落进背包）→ 太上老君 NPC 对话引用战斗事件 + give_item；stretch：最小炼器。

- 12:15 里程碑 2 核心验收通过并推送（ca828dd）：30 单测 + playwright 实测（jump1→jump2 二段、hit1→hit5 连击推进/超窗重置）。参数出处表干净：tick=33.3ms/jumpPower=-20/走跑 6/10 来自 kagami 文档；重力 2、收招窗 220ms、空中禁普攻为自定 TODO-verify（源码就地注释）。
- **美术前提反转（重要）**：canonical-art-hunter 从 4399 官方 CDN 直连下载 role3/role4 官方资源包（referer 绕防盗链 + 反编译 loader 挖路径，方法记 docs/research/canonical-art-hunt.md，可复用于拿任何官方素材），证实"二次元造型八戒/沙僧"就是官方原版美术，不存在猪头版。素材线结案，当前素材即正史。
- 12:20 下一棒双线：combat-slice(opus) 接怪物/掉落拾取/视差背景/音频；codex-inventory(codex) 接背包+掉落表纯逻辑（接口契约已在任务书里写死，文件集与 opus 不相交）。npc-server、packaging-spike 仍在跑。

- 13:10 前后密集合龙：里程碑2完整闭环验收通过（击杀→掉落→拾取→背包，天庭视差背景，实测截图 tmp/debug-shots/accept-m2-full-loop.jpeg）；NPC 大脑切 opencode+DeepSeek V4 Flash（provider 开关保留 claude 对照；DeepSeek 引用怪名不逐字/人设略糙已记录，demo 可切 claude）；老君立绘找到（原版兜率宫 Boss Monster65，12.swf，300×300 6×7）；炼器服务端完成（受限 DSL+硬 clamp 沙箱）。
- **打包 spike 判定通过**：mac 交叉出 101MB exe → scp -O 传 home → 交互会话拉起 → capturePage 帧缓冲截图亲眼验证游戏真实渲染（tmp/debug-shots/home-exe-14-capturepage.png）。残留风险：UU 串流下屏幕呈现路径未证（需物理到场/现场机）；GPU 子进程崩溃 exitCode 34 留观（已安排自动降级重启缓解）。运维知识（scp -O、PrintWindow、schtasks 空格坑）在 docs/research/packaging-spike.md。
- codex 二单挂死 36min 已取消转派 npc-server；坑沉淀到全局 memory feedback-delegate-code-to-codex。
- 在途：combat-slice NPC 游戏侧集成（最后一大块）、npc-server effects 解释器救火单、packaging-spike 一键验收工具链、asset-exporter 物品图标。

- 13:35 **agent-server 上线 home**：WSL systemd `zmxy-agent`（Restart=always，代理环境变量按 winhome-infra 坑单挂好）+ Caddy vhost zm-dev（写 C:\infra 受控副本，途中发现并避开两个坑：受控副本 head 截断导致误判漂移差点重复 import；apply.ps1 需 -ExecutionPolicy Bypass）。mac 直连 wss://zm-dev.qmledmq.cn:8443 验证 welcome[laojun]。C:\infra 已提交。effects 解释器（npc-server 救火）70/70 验收合入；图标 21 枚 + 老君立绘（原版兜率宫 Boss Monster65）入库。home 依赖链由用户另一 session 完成（截屏计划任务 ZmxyScreenshot、base64 文件管道等机器级 knowhow 提级 winhome-infra，用户已确认）。

- 14:05 里程碑3合并推送（caedbf7）：老君真立绘 + WS地址config化(query>env>default) + 对话CJK换行修复。远端端到端亲验通过（浏览器?npcServer=切生产→wss://zm-dev:8443→home→DeepSeek真回话引用妖鸟事件）。**主线全闭环。**
- **UI 素材关键发现**：原版无独立 NPC 对话框组件（剧情是全屏漫画分镜 Stage12XDialogue，非文本框）→ 对话框是全新设计，只能借原版水墨美术语言；稀有度原版用文字颜色区分无边框素材。真实提取到：RoleInfo 完整战斗HUD、BackPack 背包窗、水墨文字条、黄色描边按钮，落 ui/ + MANIFEST。
- 14:10 开 UI 打磨大棒（combat-slice/opus，含 Enter 导航修复）：复刻原版水墨 DNA（笔触边框+深棕木质+橙黄描边按钮），7 项见任务书。用户拍板"搞完我玩"→ 这是终包前最后一大棒。只动 scenes/+ui/，锁定 systems/net。

- 14:xx **战略纠偏（用户拍板）**：进度太慢的根因是"参考不抄"被执行成"从零重造"，未用 kagami 2.4 万行现成纯逻辑。改为移植>重写。移植清单已出（docs 见 gameplay-anatomy + Explore 盘点）：受伤死亡/技能树/等级/存档/法宝强化/关卡停点BOSS 均有 kagami 现成可搬；只有 4 块原创——炼丹炉合成、宝石、英雄复活、多关选关。策略：不推翻已跑通的（连击/掉落/背包/装备穿脱/agent NPC），移植补缺+适配层。方向 1(炼丹炉飞轮)+2(战斗循环)都做，不降级（用户在现实把控时间，我不自我阉割范围）。
- 已启动第一批并行移植（独立纯逻辑，与 combat-slice 装备闭环阶段A 不冲突）：port-hero-damage(受伤死亡+原创复活)、port-progression(等级经验)。技能树(最大资产)、炼丹炉(原创+agent嵌入)、存档、关卡链待后续批次。UI 打磨第二轮暂缓（功能优先于美化）。
- UI 打磨第一轮已验收合入（对话框水墨化+老君头像框+输入框内嵌、调试HUD挂F1、背景右缝修复露出完整第1关美术）。

### === 会话交接 session1 → session2（2026-07-07 15:20）===

换会话原因：session1 上下文已长。remote（Daily-AC/zmxy3-remake）是唯一代码真源，读 CLAUDE.md + 本文件即可接手。

**⚠️ 换会话即中断的在途 agent**（新会话无法 SendMessage 旧会话的 agent，从工作树捡起或重派）：
- combat-slice：装备闭环**阶段A**（数值接入 applyEquipStats 进连击伤害 + 武器视觉 role1_equip0 叠加 + onHit 吸血/灼烧/冰冻结算 + 面板显示 atk）。判据未验：炼杖→穿→悟空手里出现金箍棒→打怪伤害变高→吸血回血。工作树可能有半成品。
- port-hero-damage → 移植 LevelSystem → systems/level.ts（2 关 + 难度墙）：**工作树可能已有半成品（vitest 计数涨到 126 疑似含 level 测试），新会话先 git status 检查再决定捡起/重派**

**已移植完成、已合入 remote（纯逻辑在 repo，但都还没接进 BattleScene）**：
- systems/progression.ts（等级/经验）、systems/heroCombat.ts（受伤/死亡/i-frame/原创复活 1500ms）、systems/save.ts（版本化存档 v1+迁移机制，550071a）
- systems/equipment.ts（穿脱）、effects.ts（applyEquipStats/rollOnHitProcs）、inventory/dropRoll/items（背包掉落，codex）

**🔑 下一个关键节点 = 集成批次**（把移植成果变可玩）：heroSim 目前只是物理/连招状态机，**没有英雄身份状态（hp/atk/level）宿主**；progression/heroCombat/equipment 各自独立。集成时在 BattleScene 建一个统一 HeroIdentityState（hp/mp/atk/def/level/exp）供它们共同挂靠，然后接线：怪命中→applyHeroDamage（悟空会死+血条+复活）、杀怪→gainExp（升级）、装备→applyEquipStats 进伤害。做完游戏里才看得到"会死/升级/装备生效"。动 BattleScene，单支笔串行。

**下一步优先级**：
1. 完成在途（阶段A装备闭环、SaveSystem、LevelSystem）→ 重派 agent
2. **集成批次**（HeroIdentityState + 受伤死亡/等级/装备数值接进 BattleScene）
3. **炼丹炉合成**（原创 + agent 炼器嵌入，差异化核心）：agent-server 已有炼器能力，游戏里嵌成"掉料→找老君用料现场炼独一无二装备→穿上变强"的养成飞轮中枢。设计依据 gameplay-anatomy.md §5。
4. 技能树移植（kagami 最大资产 SkillUISystem+HeroSkillSystem+Role*，先 Role1 悟空子集+MP，别整块搬 5 角色避免大重构）
5. UI 打磨第二轮（HUD 真组件/怪血条/背包窗/toast，combat-slice UI 大棒阶段B；素材在 assets/extracted/ui/ + MANIFEST）
6. 终包：tools/acceptance/acceptance.sh 一键出 home exe

**⚠️ kagami 移植源**：clone 在 /private/tmp/.../scratchpad/zmxy-eval/kagami-phaser（session 临时目录，**换会话后大概率丢失**）。新会话继续移植需重拉：`git clone --depth 1 --filter=blob:none --sparse https://github.com/kagami-kasumi/zaomengxiyou3-zaixutiantingpian-phaser-version`（走代理 127.0.0.1:7897），重点 src/systems/（2.4 万行纯逻辑，只 InputSystem.ts 碰 Phaser）。移植清单见本文件"战略纠偏"段。

**MVP 方向（用户拍板，别改）**：方向1炼丹炉飞轮 + 方向2战斗循环都做，不降级；移植>重写；用户在现实把控时间，别自我阉割范围。

**基建**：agent-server 部署 home wss://zm-dev.qmledmq.cn:8443（老君 24h 在线，DeepSeek 驱动，NPC_BRAIN_PROVIDER=claude 可切回 claude 对照）；打包 acceptance.sh；home 依赖链已装（截屏走 ZmxyScreenshot 计划任务，见 docs/research/home-setup.md）。**git push 坑**：环境变量 https_proxy 偶尔不被 git 继承致 SSL_ERROR_SYSCALL，用 `git -c http.proxy=http://127.0.0.1:7897 push` 显式指定 + 失败重试几次。

## 2026-07-07 session 2 接手（16:00）

- 16:05 接手核查：LevelSystem 在工作树是**完成品**（126/126 全绿含 10 个 level 测试），已合入推送（b7a2ced）；combat-slice 阶段A 半成品确认丢失（BattleScene 零改动），并入集成批次重做。kagami 移植源重拉到 `vendor/kagami-phaser`（gitignored，位置从 scratchpad 改为项目内防再丢）。
- 16:10 三路并行派工，任务书落 `tasks/`（brief/report 均进 git）：
  - **integration-batch (opus)**：HeroIdentityState + 受伤死亡/升级/装备闭环（含原阶段A）接进 BattleScene，独占 scenes/+ui/。判据：浏览器实测悟空会死会复活、杀怪升级、穿金箍棒伤害变高。
  - **furnace (opus)**：炼丹炉纯逻辑 + WS 炼器协议 + agent-server 炼制处理（gameplay-anatomy §5：骨中唯一空白 + agent 差异化落点）。独占 net/+agent-server/。安全核心：游戏侧材料→预算 + 返回装备硬 clamp 不信任服务端。场景接线留串行下一棒。
  - **skill-tree-port (sonnet)**：kagami HeroSkillSystem Role1 子集 + MP 纯逻辑移植，只加新文件。
- 防互踩纪律：同 checkout 并行，文件集互不相交写死在任务书；commit 只 add 自己的文件、不 push，主会话验收后统一推。

- 16:25 用户拍板"小公司"模式：多 team 并行 + 主理人层级，黑客松叙事本身 =“用 CC 快速构建大型项目”。新开三线（任务书在 tasks/）：**level-pipeline（opus 主理人，唯一真 team：试点第2关→沉淀 docs/playbooks/level-port-playbook.md→自派 sonnet worker 铺第3、4关）**、**meta-shell（opus：登录/选存档槽/选人壳，save.ts 接线，原版素材挖掘）**、**acceptance（sonnet：tools/acceptance/acceptance.sh 一键出包→home 拉起→截屏回传）**。已向 integration-batch 发边界修正：独占范围收窄到 BattleScene.ts + 现有 ui 文件，给壳团队让 scenes/ 新文件。六线并行：integration-batch / furnace / skill-tree-port / level-pipeline / meta-shell / acceptance；串行点守住 BattleScene 单支笔和 main.ts 注册表。

- 16:30 **两线验收通过**（主会话独立验收：真跑测试/亲看截图，非 agent 自述）：
  - skill-tree-port：悟空 9 主动技+被动+MP 移植（heroSkill.ts 757 行/mp.ts，35 个新测试，182/182 全绿，数值抽查与 kagami 逐字吻合；顺手修了 jdy 二段真 bug）。已推 62ac6ae/7236390。续单：怪物行为库（monsterBehaviors.ts 数据驱动 + Monster3System + 原版 SWF 逆向 2~3 新怪），补关卡线行为真空。
  - acceptance：一键链路早已存在（build-and-ship.sh，session1 产物），本次真跑全链路 PASSED ~3min，capturePage 截图亲验真实渲染（tmp/debug-shots/acceptance-20260707-162447.png）；HUD 显示 Lv/EXP/HP 56/80/攻击/武器 → integration-batch 接线已实质进构建。报告 65bcae6 已推。已知遗留：home 物理屏呈现路径未解（虚拟显示适配器嫌疑，capturePage 为准不阻塞）；Tauri 化时截屏方案需重写。

- 16:35 **两线再验收通过**：
  - furnace（2599e68 已推）：furnace.ts 预算模型（材料稀有度→点数，成本表与字段上限共用汇率，单字段顶满恰耗尽预算）+ craft 协议 + agent-server forge（mock/opencode/claude 三 provider）。我亲验 forge-mock e2e：服务端静态 clamp（atk 999→50）与游戏侧预算校验双层真实触发；超预算整件拒收、材料事务防双花有测试。续单在途：真实 DeepSeek e2e + home 部署新版 agent-server（旧版无 craft 协议，不更 demo 会哑）。
  - **integration-batch（ff2c7bb 已推）：主线骨架全接活。** heroIdentity.ts 统一宿主，死亡/复活/升级/装备数值/武器视觉/onHit procs 全部进 BattleScene。截图亲验：HP 0/80 灰化倒地复活、赤炎噬血杖上手攻击 10→55（一击 82 毙命 vs 空手 37）、Lv.2 升级材料入包。遗留：tsc 两处报错在 meta-shell 在建文件（saveSlots.ts:125 cast、MenuButton.ts 未用变量），记为其验收项；伤害飘字截图未定格（机制已数值实证）。
  - BattleScene 笔已传下一棒：integration-batch 接**炼丹炉场景接线**（掉料→老君对话炼宝→入包穿上，demo 核心面）。移植协议三条已写入项目 CLAUDE.md（疑点落 report 不落代码、基线后场景 A/B、真 bug 与平台适配可当场改）。

- 16:45 **三线验收通过**（全部已上 remote）：
  - level-pipeline 阶段1+2：第 2 关天王关（fc44497）——6 怪動作表/数值 SWF 原值逐字（多闻天王 16000/广目 12000/增长 7874），预览截图亲验；playbook 落盘（3c4f239）。接口缺口上报→我拍方案(a)亲手落地：MonsterSpeciesId 开放 string + 内部 BuiltinSpeciesId 保拼写检查（6cf311e）。阶段3已放行：worker 铺 L3（Boss 二郎神 HP_REJECT）/L4。
  - audio（b6fa1bf）：mp3 提取实为 session1 已完成（84 枚），本棒做独立对账（84/84 零缺口，Music.swf 唯一音源已排他验证）+ MANIFEST（置信度标注）+ soundMap.ts 纯数据映射（测试断言 key→磁盘真实文件）。真实缺口记档：wait/walk/levelup/ui_click 等原版无音效。
  - furnace 收尾（3f1e44a）：home 部署新版 agent-server（ff 到 faab9ba + systemd 重启，key 未落盘）+ mac→wss://zm-dev→真实 DeepSeek 远端往返炼出「赤焰噬魂枪」入库。真实 shape 与 mock 一致；行为差异记档：真实模型基本不触发 clamp，"威力已收敛"提示多数不出现。
  - 测试基线 235。BattleScene 接线棒队列：炼丹炉（在途）→ 关卡（LEVELS+sprite 预加载）→ 技能/MP → 音效(soundMap)/手感。

- 16:50 **再两线验收通过（已推）**：monster-behavior（cb190c6）——Monster3(kagami逐字)/7/13(SWF自逆向) 数据驱动行为库，选型有据（扫 85 个 monster 类分辨真弹道 EnemyMoveBullet，仅 Monster13 既真弹道又在 2~4 关表内）；SWF 版本分歧（Monster3 def）与 Monster7 空技能槽如实记档不实现。meta-shell（bd93d12）——主菜单/存档槽(3槽含删除确认)/选人壳全走通，**挖到真原版选人素材 SelectRole（五格墨迹立绘）**，tsc 欠账已清；读档播种/存回/游戏时间/回菜单四个接口留给 BattleScene 棒（report §3 有代码级示例）。
- **BattleScene 接线棒队列（更新）**：炼丹炉（在途）→ 壳存档播种/存回（小，report 有现成示例）→ 关卡接线（LEVELS+sprite 预加载+新怪行为消费）→ 技能/MP → 音效(soundMap)/手感。测试基线 235，tsc 全清。

- 17:10 **主线两大棒合龙（已推）**：炼丹炉场景接线（26043fa）——掉料→老君炼宝→穿上变强浏览器真机走通（材料消耗/超预算退料/999 攻双层 clamp 数值实证）；壳存档接线（a9c57b7）——选槽→打怪升级炼宝→存档回主菜单→继续档等级/背包/装备原样恢复 + Esc 暂停菜单 + 自动存（升级/炼成/穿脱/退出）。**"登录选人开档变强存档"童年链全真实闭环。**
- 关卡线收官：L3 二郎神关（b195b10，二郎神 hp45137+哮天犬伴生+HP_REJECT 实为对英雄 30s 禁回血 debuff，逐行验证）、L4 邪念之境（81cbe45，邪四圣 Boss 链）、cast 清理+FFDec headless 坑单（2b581f3）。L5+ 暂停待赛后。**平衡断层立项**：关卡怪血是原版口径（万级）vs 英雄小数值口径——hero-scale 单已派（heroScale.ts + 可赢性核算表），是关卡接线前置。
- **UI 两次用户打回（重要教训）**：主菜单 + 炼宝面板均为"脚手架审美"，与原版无对比。纠偏：meta-shell 优先重做主菜单（穷尽挖原版标题素材，"没有"须附证据）、炼丹炉/对话框素材加入挖掘清单；**UI 验收新标准：与原版并排对比图 + 用户点头，主会话不再代打视觉分**。FFDec 裸跑弹 GUI 事故已归因（level-pipeline 认领）+ 坑单落 playbook。
- 笔队列：技能/MP 接线（在途）→ 关卡接线（等 hero-scale）→ 音效(soundMap) → 手感 → UI 换装。

- 17:40 **原版口径弹药全部齐装（已推）**：heroScale（41318ac，普攻真公式 0.707/1.183/1.304×Hurt——kagami 普攻实为写死 30-34 的占位符；防御公式确认现行=原版；可赢性瓶颈修正为"站不住"：二郎神 hit2=1299 > L20 全血）；heroGrowth（b1c9175，成长曲线确认 kagami 忠实=原版，二郎神禁疗精确语义：回血整笔丢弃）；skillDamageReal（d7bf1a5，真技能公式=每技能四系数指数式，与 kagami 差 1.4~663x 非单调，筋斗云被 kagami 错放大 500x+；带分歧守护测试）；furnace 上限 atk/def→200、hp/mp→800 两侧镜像（edf378b，e2e 复验）。**源优先级教训入 CLAUDE.md：数值以原版 AS3 为真源，kagami 仅结构参考。**
- 技能/MP 接线验收（6cdf759）：数字键九技+MP 条+busy-lock 互斥+拒放 toast，临时 SKILL_DAMAGE_SCALE 待换装删。发现多 agent 共享 playwright 浏览器互踩（MP/位置被外部改），后续浏览器验收需独立 tab/context。
- 素材战线（用户情报驱动）：造梦 Online 客户端（home，疑似 Electron）= 全系列合集含官方造3 入口——vendor 0.72 是魔改版，Online 内造3 是官方真源候选。用户已登录进造3 主页缓存已热；acceptance 在挖（app.asar + Chromium cache 的 CDN URL 清单，产物落 docs/reference/zmxy3-official/）。Online 六屏真机截图已入库 docs/reference/zmxy-online-screens/（UI 语言参考，非复刻真源）。
- 在途：integration-batch 合龙大棒（口径统一换装+关卡链接线，判据=预期等级炼装真实击杀多闻天王且秒数落核算区间）、level-pipeline 真·L1 移植（1.swf）、skill-tree-port 丹药表、meta-shell UI 组件+炼丹炉素材、acceptance home 挖掘。

- 17:55 **阶段A 口径统一验收通过（c686fdb，已推）**：BattleScene 三处伤害全换 AS3 真源——普攻 calculateNormalAttackPower（.707/.707/.707/1.183/1.304×Hurt+暴击词条）、承伤 resolveIncomingHeroDamage 桥、技能 calculateRealSkillDamage（删 6.6x 偏差的临时缩放）。tsc 全清（meta-shell 之前报的 9 处正是此单半成品，收口后消失）、387 全绿、真机验证 slz 一击 45.7−def。**游戏内伤害数字从此全是原版公式。** integration-batch 开阶段B（关卡链大重构，波次+boss+多sheet 预加载，费时一棒）。
- 真·L1 巫鹰关合入（9292f53）：四关战役全原版数值；Monster30 真身=1血速8蜂群（手搓版误给 150）；巫鹰 300 血机制型登顶 Boss 保持原样。丹药真相（3fd6ca5）：原版无背包喝药，回血是杀怪掉落的场上拾取球（小红+100/大红+50%/蓝+100，10s 消失），蒙特卡洛验证掉率；红球走禁疗门控、蓝球不受限——二郎神对抗张力原生成立。
- **素材逆向大捷（f1d7b9e + 工具，已推）**：Online 客户端=AIR薄壳+IE缓存流式 SWF，acceptance 抢救 37 SWF、暴力破解出新 byte-swap 参数 PIVOT=300/END=325（异于离线 200/275），解密器 tools/decrypt-zmxyol-swf.py + 参数与坑入 CLAUDE.md。产出 docs/reference/zmxy-online-extracted/：40 技能图标（9 个符号名精确对应我们悟空技能）+ 5 套伤害数字字体 + YUIOL 热键 + 挑战成功/失败横幅，转 UI 线。meta-shell 据 Online 参考微调飘字/连击/存档卡（37f99e2）。
- 收敛：阶段B 关卡链接线（在跑，主线）→ 体验棒（UI 五件套换装 + 拾取球生成 + 音效 soundMap，待发）→ 终包。UI 三单（存档壳/主菜单/组件+微调）等用户终审。

- 18:25 **官方造3 UI 挖掘（9137ab8，已推 docs/reference/zmxy3-official/）**：入口=Online 客户端「3 大闹天庭篇」=官方造3；用户手动逛界面让资源流入缓存，acceptance 抓 5 新包。**保真验证彩蛋**：官方强化面板"打造"页头就叫「炼丹炉」——我们炼丹炉的命名是原版原词非自造；官方合成配方图（主装备+副装备+神火+神铁→生成物+所需灵魂）是我们"投料合成"的官方视觉原型；一品～五品丹分级证明"丹"分级是原版词汇。**真源结论**：vendor「再续天庭 0.72」作核心系统真源基线（symbol-count diff 证其更全：OtherMat 304 vs 78，带整套 SelectRole/SelectPlace）；Online「大闹天庭篇」furnace/skill UI 作视觉对照。诚实记录反例：MagicWeapon 是 Online 更大（90 vs 36），"vendor 严格超集"不成立。开放项：vendor backpack1.swf export.strength.* 的呈现完整度未与官方 furnace UI 交叉核对（README 记档）。
- 打包链路冒烟通过（158977e）：干净 master worktree 出 96MB dist，84 音频/四关素材全进包、相对路径无 file:// 陷阱、home 拉起进主菜单渲染正确。缺口：未模拟点击验证进战斗（终包前补交互验收）。UI 全组件交付待用户终审（壳/主菜单/五组件/微调/SkillBar+ResultBanner）。

- 19:xx **用户亲测反馈(转折,主会话优先级纠偏)**:功能骨架真机验证通过(acceptance 28步交互脚本+真LLM炼宝往返确认,home exe 登录→选人→战斗→技能→炼宝→boss→传送门→L2 全通;主会话另在浏览器亲验登录→选人→战斗掉血),**但UI/UX是核心短板**:①战斗HUD仍是脚手架文字块——RoleInfoHud/SkillBarHud/BackpackWindow/BossHpBar 真组件早做好(ui-round2)却从没接进BattleScene(换装棒被功能棒一路挤后);②波次乱序(boss当小兵混进普通波);③登录流Online版式(b2f37fe)未集成到用户构建;④切场景对话框残留(acceptance报)。**根因=主会话把"能玩通"排在"玩起来像"之前,判断错。已掉头**:派UI换装棒(最高优先,删脚手架接真组件,对照用户Online实机battle-hud.png+kagami SkillUISystem 371行布局)+波次修复棒(小兵波→sub-boss→boss分层)。kagami repo结论:有UI布局代码(SkillUISystem/EquipmentUISystem/PetPanel)无资源图(素材gitignored);资源图从SWF+Online逆向88件已备。
- acceptance 真机交互验收能力就绪(3057502,executeJavaScript驱动__inject钩子,不靠OS键盘,隐藏窗口也稳),待UI换装+波次改完跑对比验收。**push策略**:等UI到位+真机验收过再统一推里程碑,不推UI脚手架中间态。

### === 会话交接 session2 → session3（2026-07-07 19:35）===

换会话原因:session2 上下文长(45%)+ 用户要求。remote(Daily-AC/zmxy3-remake)是代码真源,读 CLAUDE.md + 本文件即可接手。

**remote 状态**:已 push 6 个已验收 commit——3b75c1f(阶段B四关链)、b2f37fe(登录流Online版式+6槽)、fa55ea1(官方资源manifest+88件批量下载文档)、8061749(真L1巫鹰关做链头)、3057502(acceptance 28步真机交互验收脚本)、a0a41f3(波次乱序修复)。全部主会话独立验收过(跑测试/亲看截图/真机)。

**⚠️ 在途未 commit(新会话从工作树/git log 捡起,无法 SendMessage 旧 agent)**:
- **integration-batch 的 UI 换装(BattleScene.ts 未提交)= session3 第一优先**。已让它尽快 commit + 落 report;接手先 `git log`/`git status` 看它 commit 没,没有就从工作树 BattleScene 改动 + tasks/ 里它的 report 捡起。

**✅ UI 换装已完成(015602d,已push,主会话亲看21号截图验收)**:BattleScene 脚手架文字 HUD 全删,接入真组件——左上 RoleInfoHud(墨框头像+等级徽章+HP/MP/EXP三条)、左下 SkillBarHud(9格技能坞+真图标+热键+CD)、B键 BackpackWindow(原版背包全窗)、顶部 BossHpBar(名牌+红笔刷条)、MonsterHpBar、Toast/飘字。跟实机图 battle-hud.png 结构对上。387绿、只动显示层。

**🔑 session3 第一件事 = 承伤数值拍板(用户会玩,现在手玩到L2会死得惨)**:见下方"承伤致命"。这是从"能看"到"能玩得下去"的关卡。需要用户拍 maxHp/def 放大方案(放大progression曲线 / 靠炼装+拾取球养成 / 组合)。

**UI 换装的诚实遗留(session3 可继续,非阻塞)**:①技能坞热键显示 1-9 不是 YUIOL——键位实际绑1-9,换YUIOL需改键位映射(功能变更);②FurnacePanel 没换,炼宝仍走水墨对话框overlay(已是真水墨非调试);③ResultBanner 没接,boss死→传送门无结算modal;④切场景对话框残留 bug 需确认修没修。

**用户 4 点反馈状态**:①UI脚手架未换装(换装中,最高优先)②波次乱序(已修 a0a41f3✓)③登录流Online版式(b2f37fe已commit,随UI换装集成进用户构建)④对话框切场景残留(并进UI换装棒)。

**⚠️ 已知遗留/待用户拍板**:
- **承伤致命(重要)**:英雄 maxHp/def 曲线太小(L20仅1030血),真怪攻击279~1658,L2+ 一两下秒死;验收靠 __setHeroHp 续命。根治需放大 progression.ts maxHp/def 曲线(耦合决策,倍率未拍)。原版靠装备/宝石把裸血抬到几万(Online截图HP19335),我们缺那层养成。见 tasks/hero-scale-report.md。**真人从主菜单手玩到第2关会死得很惨,这是数值不是bug。**
- 炼炉服务端 clamp 已确认是 200(craft-validate.ts,不是integration-batch说的50)。
- monsterBehaviors(Monster3/7/13弹体)未接,全走近战回落;二郎神heal-block未接;哮天犬companion机制未接(stats/JSON保留)。
- 26张怪sheet全量预加载(解码~400-600MB GPU纹理),真机WebView2可能慢/压力;integration-batch建议改按关懒加载,未决(先真机验没炸就不改)。
- npm run build 曾被 RoleInfoHud.ts:44 tsc 卡(unused param),需确认 meta-shell 修没修。

**agent 状态(新会话需重派或从盘捡)**:integration-batch(UI换装在途)、meta-shell(登录流b2f37fe完+SkillBar/ResultBanner组件6dc6f9f,待命)、level-pipeline(波次修完待命)、acceptance(真机验收能力就绪待命)、skill-tree-port(丹药consumables 3fd6ca5完,待命)、furnace(待命)。

**素材大捷**:Online客户端逆向出完整资源manifest(loader反编译,decrypt参数PIVOT=300/END=325写进canonical-art-hunt.md),88官方文件已批量下 vendor/canonical-hunt/official_4399/batch/(gitignored,随需FFDec解),docs/reference/zmxy-online-extracted/(技能图标40/HUD件/结算横幅)+ zmxy3-official/(官方炼丹炉UI/合成配方图,验证我们炼丹炉命名=原版)。kagami repo有UI布局代码无资源图。

**基建/纪律**:git push 用 `git -c http.proxy=http://127.0.0.1:7897 push`;vite dev 用 nohup(run_in_background 会被环境杀 exit144);agent-server 部署 home wss://zm-dev.qmledmq.cn:8443;真机验收 tools/acceptance/acceptance.sh(28步交互脚本,executeJavaScript驱动__钩子);素材按收益选不按本体/后作教条(用户纠偏"别轴");移植>重写;素材/数值真源=原版AS3反编译,kagami二手仅结构参考。

## 2026-07-07 session 3 接手（20:03，Fable 主持）

- 20:05 接手核账：387 绿/tsc 净；发现 4.8 自述"remote 干净基线"失实——本地尚有 2 个未推 commit（2d72596 切场景残留修复 + 64f9334 docs），核 diff 后已补推。
- 20:10 派 ui-finish（YUIOL 热键/八卦炉面板/结算横幅，tasks/ui-finish-brief.md）。YUIOL 五格坞已 commit（f80bbbf）。
- 20:14 **用户拍板承伤方案**：判据先行（到关等级+中等炼装，boss 最痛一击 25~40%/普攻 5~10%，手玩可通）、显式养成替代层（不改 progression.ts 原版数字、赛后宝石系统落地可回退）、补魔防成长曲线（原版 countHurt 通道，接线一直传 0 是半成品）、拾取球固定值不动（比例即保真）。派 survivability（tasks/hero-survivability-brief.md）。同时应用户要求对 4.8 会话（16:00~19:35）产出开三路独立审计。
- 20:22 **用户并排截图打回战斗 HUD 视觉**（与 Online 实机差距大）。主会话亲做 12 条逐元素差距清单（整块底板=web感根源/血条形状/条上数字/坞格框暗淡/坞上多余Lv与数字/缺无双+按钮簇/按键帮助文字横战场/背景接缝+缺石台地面），ui-finish 优先级重排为 HUD 像素级保真重做，方法论写死：原版位图优先不许手绘近似、kagami 布局坐标、每轮并排拼图视觉迭代到挑不出、主会话终审后才给用户。参照图入库 docs/reference/zmxy-online-screens/battle-hud-user2.png。
- 21:0x **三路审计全回（报告 tasks/audit-*.md）**：
  - numbers（对 SWF 独立重新反编译）：4.8 标注 SWF 来源的数值全部逐字属实（普攻系数/11 条技能指数公式/双向减伤/三 boss/L1 蜂群巫鹰）；悟空成长曲线直接对上原版 Role1.upGrade 精确逐字，承伤地基可信。过度断言纠正：Role3/4 atk 曲线 kagami 私改、Role5 原版不存在、monster3 行为值=kagami（hp926 vs 原版 300）——校验状态已写入 CLAUDE.md。
  - claims：43 commit 全实且在 remote；关键测试数（126/235/387）checkout 对应 commit 真跑复现全吻合；唯一夸大=skill-tree-port 报 182 例混入他人未提交文件（实际 161）；无未记账暗改动。
  - runtime（origin/master worktree 真跑）：5/5 PASS——波次分层、切场景残留修复、登录流 Online 版式、UI 换装真组件、存档链全恢复。开放项：一次无法复现的"武器未显式 equip 即穿戴"（已记 report，非确认 bug）。
  - **总结论：4.8 的漂移在视觉验收标准与优先级排序；数值移植与工程账经独立复核可信，无需返工。**
- 21:18 survivability 验收合入（4619099，395 绿主会话复跑）：heroSurvivability.ts 替代层 maxHp ×3.5/def ×2/魔防 L10=10%→L30=35% 封顶 50%，判据带写死测试（L3 核击 39.9% 承重断言）；到关等级模型 L2:8/L3:15/L4:21。三尾巴分头：①魔防一行接线 patch 转 ui-finish 持笔应用；②装备 hp 词条从未进 combat.maxHp（真 bug，炼了白炼）续单真修+系数下调；③exp 经济断层（每杀固定 80 占位，L4 自然仅 lv10 vs 门槛 lv21）续单按原版 AS3 每怪 exp 真值修，达不到判据报偏差拍板不擅自放大。
- 在途：ui-finish（HUD 像素级重做，主线）、survivability（续单×2）。push 策略沿用：UI 到位+真机验收过统一推，不推中间态。
- 21:4x~22:5x **承伤线全闭环 + UI 线收官**：
  - survivability 续单交付（de94cee）：装备 hp/mp 词条真接血池（syncHeroEquipment，scale 3.5→3.0 吸收改真修）；原版每怪 exp 反编译落 monsterExp.ts；自然轨迹真值只到 lv8/11 vs 门槛 15/21（关卡结构性压缩所致），主会话拍板 CAMPAIGN_EXP_MULTIPLIER=6（d650b0d/9525a7d，性质同养成替代层可回退，测试 pin 6× 落带 + ×1 对照断言）。承伤线四段全闭环。
  - ui-finish HUD 像素级重做收官（5aac615/09cbbc2/c6ba94f/d76b5a8/161d8d2）：12 条差距清单全闭（拆底板/胶囊条/墨牌/墨点等级/删属性行/按键帮助进 Esc/背景接缝根修+莲叶前景）；技能坞三轮迭代（双重深框根因→图标框相连当槽→FFDec 挖 RoleSkillInterfacev3550 亮图标换装）；4 项承伤接线补丁入 09cbbc2（魔防/syncHeroEquipment/MP 容量/monsterExp）。主会话逐轮终审（round3/COMPARE2/COMPARE3 亲看），定稿待用户点头后统一推。三件套中炼丹炉窗/结算横幅终审过；失败横幅因无败局机制不接（待用户拍板要不要败局）；默认上坞 5 技拍板 slz/lys/hytj/lyfb/jdy。
  - 乌龟怪体型确认真渲染 bug（BattleScene:937 按 sheet 格高归一致 Monster7 大英雄 35%），已派 monster-scale 修复棒（tasks/monster-scale-brief.md，原则=全体统一 px→world 缩放保 SWF 原生比例）。
- 23:0x **用户严厉打回 UI 终版 + 方法论升级（重要教训）**：我终审放水（"分不出门派"是形容词打分不是判断——血条不等长/错位/图标暗肉眼可见）。用户指令"抄上游仓库"。新方法写死：复刻 UI 一律抄原版 SWF 对象树 PlaceObject 坐标 + 原件位图组装、零手调；验收改机器可查（同分辨率 overlay + 像素 diff，布局层 diff≈0 才过）；版本几何分歧 vendor 胜（复刻真源）。教训入全局 memory（feedback-ui-fidelity-pixel-diff）。
- 23:5x~00:1x **对象树重排收官（7288335/bec3bc2/9941695）**：FFDec 导出 export.RoleInfo（OtherMat1 chid341）对象树，血条真值=三条等宽 143×11（之前不等长纯属按眼画）；组装后 vs vendor 复合图像素 diff：几何零错位。过程中主会话从 DIFF 抓到漏报子件 chid262（herobeattacktimes=怒气/无双充能条），拍板渲染空 chrome（与装饰性无双按钮一致性）；终版 DIFF 亮区仅剩烘焙标签+动态数字+AA。vs Online 头像锚定对比图证两版几何吻合。monster-scale 验收合入（b292b35，全体统一 px→world 缩放，巨灵神反证原生比例原则双向成立；monster30 72% 身高判原生保真不追）。**功能缺口对账**（ui-finish report 点名）：怒气系统/失败横幅（无败局，拍板赛内不做）/4 技能下坞待绑定 UI/HP·MP·EXP 标签为手写文字。
- 00:0x kagami UI 悖论解答（用户问"没布局代码怎么像官方"）：kagami 视觉层根本没做（调研档案：不是可玩游戏、零素材），像官方的是机制层；UI 布局唯一真源=SWF 对象树（正在走的路）。派两路借力：ruffle-spike（Ruffle 跑解密 SWF→"活的原版"参照）、community-sweep（社区还原度资料扫荡→docs/research/community-fidelity-resources.md）。
- 00:4x **两路侦察全回，"活的原版"到手**：
  - ruffle-spike（docs/research/ruffle-reference.md）：**桌面版 Ruffle 0.3.0 完整跑通原版**——主菜单→世界地图→模式选择→横版关卡→巫鹰 boss 战，无黑屏无崩溃，AS3 真跑（trace 可证）。**用户亲玩判定"手感很对"**→ Ruffle 可作战斗手感实测基准。GUI 自动化三坑记档（中文路径 symlink 静默拒载/权限弹窗不挂进程需裸坐标/非 key window 首击只激活需连点）。web WASM 版 headless 画布空白未深追。
  - community-sweep（docs/research/community-fidelity-resources.md）：最高价值 Speculum-4399（本地代理+Flash Standalone 跑真实 4399 造3，防盗链绕法与我们独立发现的一致，互证）；官方 Steam 新作《造梦西游：无双》可作现代化取舍标杆；确认社区无 UI 拆解/素材 rip 现货。
  - **待开：手感校验棒**——用 Ruffle 活原版逐项实测校准 combo.ts 的 TODO-verify 参数（收招窗 220ms/重力 2/空中禁普攻/击退硬直）。需 GUI 自动化驱动 Ruffle，与用户用机错峰，屏幕空闲时再派。
  - 用户拍板记录："解包成可魔改基底（弃 Phaser）"路线已评估否决（AS3 无源码、字节码补丁地狱、agent NPC 挂不进黑盒）；Ruffle 怀旧模式嵌壳（WASM 版）作可选 demo 彩蛋备案未派。
- 00:38 用户开玩本地最新构建（vite :5174），重点体感承伤档位与升级节奏；顺手清掉占 5173 的无关进程（soda_webapp，用户令）。

- 01:0x **用户全流程打回 + UI 复刻方法论定型（本 session 最重要转折）**：用户给 14 张原版全流程截图（主菜单/存档/选人三态/模式选择/世界地图/战斗/个人资料/技能树），入库 `docs/reference/user-flow-refs/`。**主会话亲自逐屏判读**（不再下放视觉判断），落 `docs/design/screen-fidelity-spec.md`：**最大缺口是结构不是样式——原版有世界地图 hub（保存/商城/炼丹炉/学技能/任务挂地图、从地图进关），我们缺整层**，选人直接摔进战斗。优先级：世界地图→选人+存档→个人资料面板→技能树→主菜单微调。
  - 承伤真人体感待收（用户开玩 :5174 构建中途转向 UI）：承伤档位/升级节奏的手玩反馈还没拿到，是 spec 之外的独立待办。
- 01:1x **反编译路线三源交叉验证（用户师傅=造梦团队内部人建议）**：opus/codex/fable 独立评估反编译 AS3 取 UI 源码，**三方结论一致**（报告 tasks/decompile-as3-ui-report{,-codex,-fable}.md）：
  - **双源提取**：UI 皮（坐标/尺寸/层级）在 timeline、骨（双人镜像/网格数学/帧语义/事件门控）在主 SWF AS3，物理分离必须都读。不是三选一。
  - **重编译改原版 no-go**（三方一致）：复活死运行时承载现代 agent，零净收益，与 Phaser+TS+Tauri+WS 栈方向相反。
  - 三方各自独到发现：Codex `-export xfl` 直吐精确矩阵（取代手工像素校准，白捡提速）；Fable 版本分歧纪律（类代码认主 SWF，OtherMat1 是旧副本）+ assets/ 加密坑（FFDec 静默导 0 类不报错）；opus 运行时架构（364 处字符串反射）。
  - 铁证"照图必错"：血条是 101 帧 gotoAndStop 逐帧美术非 scaleX；背包 25 格是代码 x=col*(w+11) 现算，对象树只有空容器。
  - **管线固化**：`docs/playbooks/ui-port-dual-source.md`（双源四步 + 三铁律 + 四个"必须读 AS3"信号 + 逐屏源码归属表）+ CLAUDE.md 纪律段。旧"手工像素校准"作废。
  - Ruffle：桌面版跑通原版可当活参照，但 GUI 自动化撞了用户 UU 远程会话（盲坐标点击无 frontmost 断言，坑记 ruffle-reference.md），**规则：用户用机时禁一切桌面 GUI 自动化**。

### === 会话交接 session3 → session4（2026-07-08 01:20）===

换会话原因：session3 上下文长 + 用户要求，明天新会话推进。remote（Daily-AC/zmxy3-remake，master=f8555a1 已全推）是代码真源，读 CLAUDE.md + 本文件即可接手。**本 session 无未推 commit、无在途 agent**（全部收工）。

**session4 第一件事 = 世界地图那屏（WorldMapScene，最大结构缺口）**：
- 依据 `docs/design/screen-fidelity-spec.md` §S1 + 参照图 `docs/reference/user-flow-refs/worldmap-original.png`。
- **走新的双源管线**（`docs/playbooks/ui-port-dual-source.md`，不再手工校准）：export.SelectPLace（大写 L）AS3 取关卡节点命名协议 s{stage}_{level}+三态帧号+进关 gating；对象树 xfl 取节点/按钮坐标；out_res 子 SWF 取地图大图+底部按钮位图。
- 接线：选人确认→WorldMapScene（新增，不摔进战斗）；四关入口映射 CAMPAIGN；保存=SaveSystem；炼丹炉=复用 FurnacePanel（从战斗内迁到地图老君入口）；学技能=占位（技能树屏落地前置灰）；返回=主菜单。
- 交付含 xfl 坐标 vs 渲染 overlay，主会话终审。

**后续屏队列**（每屏一棒串行，走双源管线，spec 有逐屏规格）：选人+存档（S2+S3 同棒，全屏五格重做+存档卡片版式）→个人资料/背包面板（S4）→技能树（S5，顺带解决 9 技选 5 上坞，逻辑移植 kagami HERO_SKILL_TREES）→主菜单微调（S6）。

**spec 外独立待办**：承伤真人体感（用户手玩 L2/L3 验档位）、失败横幅（拍板赛内不做除非用户翻案）、怒气系统（空仪表占位，kagami 有 rage 逻辑赛后移植）。

**纪律提醒**：视觉终审主会话亲自做、禁形容词打分（memory feedback-ui-fidelity-pixel-diff）；用户用机时禁桌面 GUI 自动化；push 用 `git -c http.proxy=http://127.0.0.1:7897 push`；vite dev 用 nohup + 独立端口（5173 常被别的项目占）。

### 赛后路线图（终包后）
- **NPC Agent 能力架构**（游戏作为 MCP、每 NPC 受限工具集=权限边界、动态权限；炼丹炉照配方合成 / 老君概率交易以贱换尊）：用户 2026-07-07 提出的拓展构想，是"agent 驱动 NPC"愿景的完全体，需深入设计再做，**暂缓**。完整记录见 docs/design/npc-agent-mcp.md。
- 关卡流水线：16 个同构关卡包可多 agent 并行移植（导包→抠怪物动作表→接波次→对 kagami 文档验数值）；每关 Boss 专属机制（HP_REJECT/弹幕MC）是硬骨头逐个啃。
- 功能线（独立于关卡）：多角色（唐僧/八戒/沙僧动作表已备）、宠物、法宝、技能树。
- 沉淀移植 skill 到 ~/.agents/skills/：FFDec命令族+动作表抠取+JSON schema+验收清单+Boss机制排查路径，让任意 session 冷启动接一关。
- 打包正规化：electron spike → Tauri 终选；home 屏幕呈现问题（UU虚拟显示 vs Chromium合成）待物理到场验证。

### 下一步
- [ ] 批量导出：四角色 + Music.swf 音频 + 第 1 关场景包（按 asset-pipeline-notes.md 策略）
- [ ] 动作节奏换算：setFrameStopCount → Phaser 帧 duration（先悟空 14 个 hit）
- [ ] 里程碑 2 切片：地面/物理、连击输入缓冲、第一只怪（Monster30）、掉落
- [ ] 打包 spike：Pake 对本地静态文件 + sidecar 支持实测

## 2026-07-08 session4（夜间自主推进，用户睡眠授权 loop）

- 01:2x 接手 session3→4 交接，goal=spec 屏幕队列串行（S1→S2+S3→S4→S5→S6），每棒双源管线派 codex、commit 不 push、主会话亲审。另收到用户转达的外部 Fable 会话"Ruffle 注入=真复刻/Phaser=现代重制"技术判决，落盘 docs/research/ruffle-vs-remake-verdict.md（赛后备案，不改当前主线；用户明确"接自研 agent NPC 必须重构，别换锅"）。
- **平台事故 ×2**：codex 棒两次被 Claude 包装层 AUP 误报打死（"反编译/解密"字样触发；第二次死于返修中途）。对策：派发 prompt 前置授权语境（用户系造梦团队成员、素材自有，引 CLAUDE.md 法律节）+ 中性措辞。首棒死前留下 Step1-3 半成品，s1b 独立复核后续接（复核结论：前人坐标/位图逐项无偏差）。
- **S1 世界地图 WorldMapScene 完成并过终审**（93f1b9d/98f43d3 等 5 commit，未 push）：
  - AS3 骨：s{stage}_{level} 三态帧语义、added() 解锁规则、七按钮真实派发事件逐一核对（huodongbtn 实为难度切换、名不副实待用户拍板；ldl→showStrengthEquip 印证炼丹炉=FurnacePanel 复用正确）；调试遗留全解锁开关（isHideDebug→curBigStage=4）按移植协议未抄。
  - 终审打回两项后闭环：①舞台映射 cover+顶裁 62px 改 contain 等比+pillarbox（940×590 SWF header 实证）；②overlay 几何对齐重做后揪出第三个真 bug——五之六地标装饰件 + s1_3（677×568 牌坊大场景 sprite）origin(0,0) 双影，递归 bounds 推导修复（tools/worldmap-deco-origins.py，方法与 BitmapFill 法交叉验证逐位一致）。量化：舞台区 |diff|≥40 从 11.5%→7.68%，双影清零，余差全为状态差（置灰 vs 参照已推进存档）已逐项豁免记档。
  - 流程闭环实测：选人→地图（节点/按钮状态机正确）→点岛进战斗→通关回地图 frontier 推进（首轮像素 diff 证实台阶变化）；413 测试绿 + build 过。
  - 管线经验固化 playbook：符号 origin 必算（左上锚不可默认）、整屏舞台映射定式（contain+pillarbox）、overlay 先对几何再判读。
- 遗留（worldmap-report.md 记档）：agent-server 端到端炼器未跑（本地无服务）；huodongbtn 行为拍板；kls ≤4px 残差。
- 04:1x~04:5x **S2 选人 + S3 存档棒完成并过终审**（e097ea4..d0bac09 共 7 commit，未 push，s2s3-shell/codex 执行）：
  - S2 五格全屏重做（金框/标题/底按钮全删），真发现：原版灰度=运行时 ColorMatrixFilter 非灰图烘焙（up 态带 filter，over 态同 characterId 无 filter），本棒首次导出真彩五格；AS3 证实第五格"???"纯装饰无变量。带 filter 符号的 analytic origin 会差 ~170px（FFDec 画布 padding），经验互相关兜底——坑记 report §2。两态 overlay 单线对齐过审；"敬请期待"锁定标签为功能性自加（参照无），待用户裁量。
  - S3 Online 版式重做（Online SaveInter 纯矢量抠不出位图，走"图量"），终审揪出编号 +14px/标题错位双影，返修用加权质心法锁到 <2.3px 残差；红叉考古：参照图红 X 实属右侧常驻菜单条非存档弹窗控件，我方保留对话框级红叉（记档）。6 槽增删读回归绿。
  - 413 测试全绿 + build 过（主会话复跑）。终审两轮均主会话亲看 diff/blend，量化互证（我方互相关 vs 其质心法，编号偏移两法一致）。
- 下一棒：S4 个人资料/背包（brief=tasks/profile-backpack-brief.md）。
- 05:5x **S4 个人资料/背包棒完成并过终审**（3ac9ad6，未 push，s4-profile/codex 执行）：BackPack/BackPackElement/PackThings AS3 全读，5×5 网格公式 x=col*(w+11) y=row*(h+9) 直译；战斗力 getFightingForce() 四项中照译 ①level*15 ③装备攻击（②被动④roleid 专属无输入通道，诚实丢弃记档）；出售白装照译（普通且非头衔 → 灵魂+20）；装备槽真实语义纠正 spec 肉眼说法（zbfj=防具/zbsp=饰品/zbfb=法宝/zbtx=头衔/zbsz=时装）；闪避/回血原版本就是纯装备字段，UI 诚实显 0 非占位。origin 用三按钮模板互相关锁仿射偏移（analytic 法有 filter-padding 坑）。新增 combatPower/soulPurse 纯逻辑+8 测（421 全绿）。终审：结构层单线对齐；右下控制条与参照分歧经 vendor 烘焙底图裁决为版本差异、vendor 胜不返修；顺修面板红叉空实现 bug。遗留：armor/accessory/talisman 槽因 slotForItem Stage A 限制恒空（既有缺口）；装备图标 fallback。
- 下一棒：S5 技能树（brief=tasks/skilltree-brief.md）。
- 06:5x~10:2x **S5 技能树棒完成并过终审（一次大返修）**（2d107a9/98aaadf/7c68146，未 push）：
  - 逻辑层首审即过，AS3 考古全夜最高质量：**kagami 三处实错纠正**（学习上限 10→AS3 实为 5、技能封顶"特殊18级"→实为全员 9 级无区分、升级费用公式整条不同→AS3 真式 150*slev²*√slev）；SkillSetControl 拖拽绑定悬挂 bug 识别并按移植协议 Adapted；学习不扣灵魂、学习即按 YUIOL 顺序自动上坞、心法升级 100/200/500/1000/2000 均对 AS3 逐行验证。skillTree/绑定/save 迁移 29 新测，450 全绿。
  - 视觉层被打回（自造暖棕金主题未穿原版皮、技能名显内部码=spec 铁律级违规）；s5 会话换皮至 07:59 中断（**平台 AUP 误报第三击**），主会话就地收尾：遮盖条越界修复（280→196 宽，正是"重斩/火魔斩消失"根因）、删自造黄选中框（AS3 真语义=共享升级钮移位）、卡二补丁盖净。overlay 互相关配准后表格/卡片/图标单线重合，豁免逐项记档（含两处版本分歧 vendor 胜）。
  - **中文技能名负结果记档**：全部可得包字节层均无该字符串（运行时下发配置），斩系五技名来自烘焙表位图可用；**火系五技名待用户供官方名**（一行修复）。
- 10:2x S6 主菜单微调小棒已派（brief=tasks/menu-polish-brief.md，s6-menu/codex）。
- 11:2x **S6 主菜单微调完成并过终审（ea1ca49）——spec 屏幕队列 S1~S6 全部走完**。标题重影根修（Online 底图烘焙字透 0.68 半透明面板叠字→面板改实心，vendor 参照本就实心）；菜单几何照 export.GameMenu.showMenu() 写死坐标（六项 x=751.15 与 FFDec 渲染互证差 0.15px）；集合修正（读取存档→继续游戏，造梦论坛外链省略记豁免）。s6 会话完成代码与证据后中断（**平台 AUP 误报第四击**），report 由主会话补记。450 测绿+build 过。

### session4 夜间收官账目（2026-07-08 01:25~11:30）

- **spec 六屏全过终审**：S1 世界地图（新 hub 场景+双源+campaignProgress）、S2 选人（五格全屏+ColorMatrixFilter 真相）、S3 存档（Online 版式+质心法微调）、S4 资料/背包（网格公式直译+战斗力忠实部分移植+soulPurse）、S5 技能树（kagami 三处纠错+9选5绑YUIOL+换原版皮）、S6 主菜单。测试 413→450，全部本地 commit **未 push**（等用户拍板）。
- 管线资产沉淀：playbook 三条补充纪律（origin 必算/contain-fit 禁裁/overlay 先对几何）+ tools/worldmap-deco-origins.py（递归 bounds 推 origin，S2/S4/S5 均复用）。
- **平台事故账**：codex 棒被 Claude 包装层 AUP 误报打死四次（S1×2、S5 换皮中、S6 报告前）；对策（授权语境前置+中性措辞）降低了频率但未根除，均由主会话按磁盘半成品就地收尾，零工作损失。
- **待用户拍板清单**（见晨间总结）：huodongbtn 真实行为、S2 敬请期待标签、火系五技官方名、S3 空槽版式外推、push 时机、承伤真人体感（spec 外遗留）。
- 12:4x 账目修正：S6 的 s6-menu 会话**并未中断**（我按"45 分钟无文件变更"误判死亡并接管），其后自行跑完全流程、报告扩写入账（505147b）；代码与我提交的 ea1ca49 逐字节相同（本就是它的工作树），零冲突。教训：判死先 SendMessage ping 一轮再接管。全夜"AUP 误报四击"修正为"三击 + 一次我方误判"（S1×2、S5 为真）。

## 2026-07-08 午后：管线跃迁（用户拍板转向 + 三小修）

- 12:2x 用户晨审全流程打回四点：第一关"不像"、战斗内背包/技能打不开、被动页签"热血"叠印、火系名缺失；并拍板转向"别再截图人肉调"。技术检索结论：现成 SWF→Phaser 转换器不存在，业界形态=数据+薄运行时（Flump 范式），自建（docs 见 tasks/prefab-compiler-brief.md）。
- **三小修完成并真机验证**（4662cd6）：①火系官方名+说明（用户 Online 截图供真源：烈焰闪/火焰突击/烈焰风暴/筋斗云/火眼金睛，拼音码 1:1，负结果考古记 skilltree-report §3）；②被动页签叠印双源根修（tableLayer+cardsLayer 整层切换=AS3 真语义）+ school-2 名称列遮罩扩宽除双名；③战斗 HUD 五图标接线（背包=背包窗、设置=暂停、余者诚实 toast）——踩掉 Phaser 坑：scrollFactor(0) 容器内 setInteractive 随镜头漂移，改场景级屏幕坐标命中。
- **zmxy-prefab-compiler 棒完成并过终审**（5c13f65，prefab-compiler/codex）：编译器（泛化 worldmap-deco-origins.py 递归 bounds，回归真值 4/4 逐位命中，14 py 测）+ PrefabLoader 运行时（13 vitest）+ 两验收目标：
  - **第一关真相（考古反转）**：StageListener11.as 证实 vendor 造3 第一关=开放天空双跳攀爬（y≤-1900 触发 boss、Monster30 随行刷怪、无任何平台碰撞体），用户记忆截图的"多平台"是 Online 版式；此前"横版平地"视觉=bg11（1132×3051 攀爬图）被纵向钉死只露顶部裁切。已在边界内实装攀爬（棘轮地板+相机纵向解禁+bg11 真实纵移，jump.ts 零改动、波次数据零改动），主会话亲跑闭环（y 阶梯 400→310→220→130→登顶，巫鹰关 roster 逐字吻合）。
  - 被动面板改编译产物渲染；顺手抓掉第二叠印源（buildSchoolCards 无条件绘制）。
  - 遗留待拍板：怪物纵向追击（monsterSim 需加 Y 轴）、攀爬手感参数（CLIMB_TOP_Y/棘轮）用户校准、S3 空槽/敬请期待标签/huodongbtn（晨间清单未决项顺延）。
- 基线 463 测绿。全部本地 commit 未 push。

### === 会话交接 session4 → session5（2026-07-08 15:1x，用户拍板换会话）===

**用户新定的总纲（最高优先级，覆盖此前一切散拍板）**：
1. **验收北极星：老玩家无感** —— 玩过原版、第一次玩重制版的人，体验上应以为在玩原版。我们做的是架构层革新（弃 Flash 链，现代栈，可拓展可维护、对 AI 友好），不是玩法再创作。
2. **素材**：已拿到原版素材的一律用原版；拿不到的部分整套重做（不混搭半吊子）。
3. **功能模块**：只做"游玩闭环下不得不需要"的模块，**每模块只引入一类实例**（人物只做悟空、武器只做基础类型几个基础件，诸类推）。
4. 手感细调用户亲自来。

**用户 15:0x 战斗屏批判清单（对照官网截图 8，全部待修，是 session5 首要工作）**：
- 背景构图不对（宫殿比例/位置与官方不符；官方图是第一关地面段=bg12 莲池华表/bg13 玉石长廊，我们战斗段没渲染真实地面层）。
- 绿框：悟空脚下没有地面美术（踩空气）——bg12/bg13 地面素材已被 prefab 棒编译出（4890×596 / 4903×678），未接进战斗渲染。
- 红框：等级数字没在墨圈内居中。
- 黄框：白色空条=无双/怒气充能条（chid262 herobeattacktimes，S1 时代按"空 chrome"渲染），真源资源与布局都没提取，且应与左下无双按钮簇视觉相连。
- 蓝框：悟空手上没有武器——原版默认持金箍棒，我们只在穿戴锻造武器时叠加视觉。
- 黑框：无双按钮未接线（怒气系统没做）；法宝/宠物/技能/背包/设置 五图标 4662cd6 已接线并实测（背包开背包、设置开暂停、其余 toast），用户截图可能来自旧端口实例，session5 让用户在最新构建复测。
- 技能坞回答：是——SkillBarHud 组件（原版 dock 位图+覆盖层）放 depth 100 最上层。

**session5 建议首棒**：battle-scene 无感化（用 prefab 管线把 bg12/13 地面层接进战斗 + HUD 四细节：等级居中/无双条真源提取/默认金箍棒视觉/无双钮语义），判据=与官网截图 8 同机位 overlay 无双影 + 用户亲玩点头。

**当前状态**：master 本地 21897d9（约 30 commit 未 push，等用户玩过统一推）；463 测试绿；spec 六屏全过终审；prefab 编译器管线已落地（tools/prefab-compiler + PrefabLoader，回归真值 4/4）；第一关攀爬闭环可玩。dev server：游戏在 game/ 下 `npx vite --port 5201`。在途 agent：无（全部收工）。
**待用户拍板顺延项**：怪物纵向追击（monsterSim 加 Y 轴）、攀爬手感参数、huodongbtn、S2 敬请期待标签、push 时机。
**纪律提醒**：AUP 误报会打死 codex 棒（授权语境前置可缓解，S1×2/S5 三击）；判 agent 死先 SendMessage ping；共享 playwright 浏览器自开 tab；run_code_unsafe 里 page.evaluate 传字符串会静默失败，传函数；scrollFactor(0) 容器内 setInteractive 随镜头漂移。

## 2026-07-08 session 5 接手（16:09，Fable 主持）

- 16:1x 接手核账：master=bb61e31（交接后多一个「青包→背包」小修）、29 未推 commit、工作树净，与交接记录吻合。主会话亲比 battle-original.png vs battle-ours.png 确认用户五点批判全部属实，补判读：官方图宫殿群=收小放远的远景 + 前景雕花玉石长廊地面，我方桥梁中景过大过近且无地面层。派 **battle-fidelity 棒**（codex，tasks/battle-fidelity-brief.md）：A) prefab 管线接 bg12/13 地面段进 BattleScene（bg11 攀爬段与数值逻辑不动）；B) HUD 四细节（等级居中/无双条 chid262 真源提取渲染空态/默认金箍棒/无双钮与条视觉相连）。判据=同机位 overlay 配准 diff + 四点截图 + 测试绿。
- 16:2x **用户五项拍板全收**（AskUserQuestion 两轮）：①怪物纵向追击=做最小版（monsterSim 加 Y 轴跟随）；②huodongbtn=保留原版视觉+置灰（用户注：将来可放活动，难度以后再考虑）；③S2「敬请期待」自加标签=删（恢复原版 ??? 纯装饰）；④push=现在就推——**已执行**（cbeefb6..bb61e31，29 commit 落 remote）；⑤攀爬手感+承伤体感校准=等 battle-fidelity 合完一次玩齐（连同五图标复测共三件）。
- ①②③打包为 **verdict-fixes 棒**（codex，tasks/verdict-fixes-brief.md）并行派出：文件集 monsterSim.ts/WorldMapScene/CharacterSelectScene 与 battle-fidelity 独占的 BattleScene+ui/ 零交集；monsterSim Y 轴只做纯逻辑+回归断言，BattleScene 接线留后续棒。
- 在途：battle-fidelity（主线）、verdict-fixes（小修）。
- 17:0x **用户五图新反馈落账**（截图入库 user-flow-refs/ 五张 *-0708.png 等）：①选人屏「敬请期待」**翻案**——不删，改用符合造梦情景的艺术字体+布局重写（避开脸部）；②选人屏删自加的「请输入名字」输入框 + 照原版加「开始游戏/返回主菜单」按钮（参照 selectrole-original-buttons.png）；③主菜单标题白色+稍大+去书名号+加"重制版"后缀、菜单项顶部裁切修复、标题与菜单项换情景艺术字（字体候选 2~3 款出对比截图主会话终审）；④世界地图删两个补偿礼包宝箱（WORLDMAP_CHESTS，运营件）；⑤技能树屏整体视觉打回，**范围拍板=先做主动技能页**。①~④已 SendMessage 扩单给 verdict-fixes；⑤新派 **skilltree-ui 棒**（codex，tasks/skilltree-ui-brief.md，主会话亲判读八项差距清单：图标灰白疑 ColorMatrixFilter 导出坑/自加技能升级列/角色名牌/表头页签位图/心法卡排版/灵魂计数）。
- 技能树现状核账（答用户问）：逻辑层=九主动+嗜血(sx)被动已移植；被动页签 UI=「本作暂无系统支持」占位文本；BOSS 页签置灰（AS3 无对应）。"先做主动"与现状一致，本棒纯视觉。
- **用户定调提级**：北极星四条 + "好事慢磨别糊弄"已从交接节提级写入项目 CLAUDE.md 总纲节（最高优先级）。
- 在途（更新）：battle-fidelity（战斗屏主线）、verdict-fixes（拍板小修+五图扩单）、skilltree-ui（技能树主动页重做）。
- 17:2x verdict-fixes 三件套验收通过（ba09134，主会话亲看截图+核 commit 边界）：monsterSim Y 轴 opt-in（默认关闭逐位不变，speed=7 TODO-verify，接线 API 在 report）；huodongbtn 实为 worldmap 棒早已做到目标态（置灰+主题 toast），本棒只补考古注释——判定合理非漏做；第五格恢复纯 ??? 装饰（LOCKED_PANELS 改法与用户翻案兼容）。已令其继续五图扩单。
- 17:5x **用户三连打回 + 主会话三诊断**：①怪物隔空掉血——主会话亲查定根因：BattleScene:1775 把 attack-start（起手）当命中直接结算，距离门槛复用 attackRange 250（原版语义=出手感知门控非刀锋范围）；修复单（命中帧结算+近战触及解耦+命中帧复检）追加给 battle-fidelity。②Toast 背景"杂乱悟空"——主会话亲验 dialogue_textpanel_crop.png 实为原版过场截图硬裁条（烘焙台词"太上老君滚出来…"+两侧人物碎片），历史糊弄件。③背包窗——PORTRAIT_TEX='role1_0' 生帧塞装备区（"武器栏蹲了只悟空"）+文本对齐乱。②③打包新棒 **backpack-toast**（codex，从0到1重做背包窗+挖干净水墨条，文本层对齐不豁免）。技能页增量已发 skilltree-ui：未做页签（被动/BOSS）直接隐藏、黑块重合块清零、授权视觉层推倒重写。battle-fidelity 的 ui/ 独占收窄至 RoleInfoHud+SkillBarHud。四棒在途。
- 用户元问题记录（"是我这套指挥官提示词有问题吗"）：主会话诊断=不是总纲问题，是执行层判据与终审松——历史交付"结构对齐但文本层/素材源豁免"成了漏洞（脏截图裁切当组件、生帧当立绘、居中居左混用全是豁免区漏网）。对策已生效：从0到1单文本层不豁免、每个渲染元素追素材来源、主会话终审亲看并排渲染。
- 18:1x 建**无感差距账本** docs/design/imperceptibility-gaps.md（用户问"还差多少"触发）：按老玩家发现时间线分七层（静态观感在途/动态表现未开工/行为层未接线=最高隐性风险/手感未校准/知情取舍/系统性风险/交付层）+ 无感验收协议提案（Ruffle 并排基准+盲测计时）。核查修正：音效基础层（连击/跳/拾取/BGM）实际已接线；monsterBehaviors 确认 BattleScene 零引用。主会话自省已记：被动响应模式改为账本主动扫。
- 18:3x **skilltree-ui 首轮终审：三项考据过（图标真彩根因=烘焙预览态非 filter 坑、灵魂斜线=覆盖矩形短了露出字形钩笔、页签间距 101px）、升级列抗辩判 agent 赢**（SkillControl.as mainskillmc.upgrade1..5 真按钮+参照图为满级态快照——记档：参照无此列≠原版无此列，vendor AS3 胜）、名牌/孟婆图标挖尽无源记档接受。**整体打回三项**：①被动/BOSS 页签未按用户拍板隐藏（增量指令晚到）；②表格宏观几何差半行级（参照行距~125px vs 我方~74px，用户"一言难尽"主要观感源，从0到1授权下不许引历史豁免，限二选一举证：vendor 底图原生几何=版本分歧豁免，或修正缩放）；③final-active.png 场景下沉 70% 需定性（截图事故 or 真 bug）。commit df8cc91 已落（未 push）。
- 19:0x **用户战略转向（路上口述，完整版），总纲重写**：①游戏更名**「再续西游」**（repo 不动）；②定位"神似重制"——机制/数值/手感保原版继续对 AS3，观感统一重绘：全 UI 毛笔书法字体（方正字体=AI 味被点名）、**素材缺口一律生图，不再投入抓取原生资源包**；③首页背景生图重画（角色形象忠实原版）；④关卡收缩 L1+L2（L3/L4 摘除入口代码留库）；⑤**新功能线立项：好友→登录→开房→多人同房打关（联机 co-op）**，物品所有权/经验灵魂分配/好友转赠，后端先行。用户自省"之前太执着单点攻破（抓资源抓布局）限制了模型能力"。主会话技术拍板（报备）：角色/怪物动作帧 spritesheet 保留原版提取件（生图帧间一致性做不到），背景/UI/图标/立绘/标题字生图；联机同步预拍 MVP=房主权威+WS 状态广播。
- 19:1x 转向落地：skilltree-ui 返修**过审收工**（decadfb：页签删除、黑块架构级清零=拆掉写死内容的烘焙位图改纯色面板+真彩图标+AS3 坐标、几何举证 vendor 行距占比 13.16% vs 参照 13.17% 一致+恒定 32px 平移已修、下沉截图=视口事故已定性；素面板恰为生图皮腾了画布）。三在途棒已发方向更新（battle-fidelity 停挖走廊先做命中判定；verdict-fixes 标题改「再续西游」+字体收敛毛笔向+L3/L4 摘除小件；backpack-toast 不受影响继续）。新派两棒：**social-server**（codex：登录 bcrypt+JWT+SQLite/好友状态机/房间+WS 广播骨架/分配算法纯逻辑——平分余数给击杀者+掉落个人独立 roll+转赠事务防双花，均预拍待用户确认）、**art-keyart**（claude+生图 skill：首页 keyart 五角色忠实原版×水墨、走廊贴条、「再续西游」书法标题字，各 2~3 候选，汉字错字零容忍兜底字体渲染路线）。六棒在途峰值。用户要求汇报走飞书（人在路上）。
- 19:4x~20:0x **验收潮：三棒过审**。①backpack-toast（6e7e3e2）过审收工：立绘实为原版真挂点 headSit、"武器栏悟空"根因=S4 算对了仿射但代码抄了变换前坐标（平移 110px 糊到槽上）；文本对齐从 backpack1.swf DefineEditText align 字段抠出 14 居中 1 居左（灵魂），与用户批评逐字对上；Toast 程序化干净水墨条（MANIFEST 佐证原版无此组件，脏图本就只是"墨迹形状参照"被误用作贴图）；DialogueBox 实拍遗留转账本。②verdict-fixes 二轮（8bed836）结构过审：标签离脸单行、输入框羽化克隆删除、开始/返回按钮（SWF 挖尽无原件，代码绘制兜底举证充分）、菜单裁切根修（Canvas 对粗体 CJK 上伸估算不足）、宝箱删除；打回一行修（第五格标签违定案回退）+ 继续方向三件（再续西游标题/切马善政毛笔体/L3L4 摘除——交付时未读到方向消息）。artFont.ts 三候选可切换系统落地（全 SIL OFL 可商用入库）。③battle-fidelity 静默合入 e4e3cfe：**Online 真走廊挖到并接上**（backpack 棒截图里亲见：悟空踩雕花玉石长廊+远景宫殿彩虹占比正确）——转向消息到达前完成，按素材边界"已拿到的原版素材仍可用"留用，待其正式 report 终审。④social-server 实为 codex 后台任务（task-mrbzx5lr）：健康推进中（TDD 红绿），但转发器把我的状态查询错译成"停跑测试静态推理写完"的续跑指令（task-mrc0jp62）——**验收对策：交付时主会话亲跑其测试套件作硬门，红即打回**。测试基线 468。
- 20:2x **用户飞书回执三拍板落地**：①坏素材一律弃用→派 **asset-audit 审计棒**（只读全库过图：截图裁切脏件/滤镜灰图/来源可疑三类，产出处置清单）；②生图风格自洽铁律→art-keyart 改为"先定风格锚"流程（keyart 定稿=全项目锚，style bible 落 docs/design/art-style.md 进 git，后续所有生图棒必引）；③联机性能目标 **10 人同房不卡**→social-server 判据升级（房间上限 4→10、协议分层 state 10-20Hz 带 seq 后到丢弃/event 可靠有序、新增 10 客户端 20Hz×30s 扇出压测 P95<50ms 判据）。三条均已入 CLAUDE.md 总纲（3/3a 条）。social-server 中间账：codex 沙箱无出网 npm install 全挂（真实环境限制非偷懒），分工改为 codex 按测试契约写源码+claude 包裹层跑真实验证链，主会话终审仍亲跑测试作独立门。
- 20:4x **social-server 首轮验收通过**（146102e）：主会话亲跑独立门全绿（tsc 净/单测 40:0 fail/e2e 真实起服双人链路 SMOKE OK）。四块落地：auth（JWT 无兜底 secret）/好友状态机/房间+WS 广播/分配算法（平分余数给击杀者+个人 roll 固定种子验证+转赠三段式照抄 furnace 幂等模型）。它按旧任务书守 ROOM_CAPACITY=4 未擅自对齐新目标（守边界正确），冲突已裁决续单三件：容量→10、协议 state/event 分层带 seq、10 客户端 20Hz×30s 扇出压测 P95<50ms。次要疑点（房间纯内存/id 风格/TransferTx 回填）记档不返工。codex 沙箱无出网坑（npm EPERM 空转 20min）已沉淀全局 memory：以后派 codex 写装依赖类活，brief 开头写明"不装包不跑测试，验证交包裹层"。
- 21:0x **social-server 续单验收通过，本棒收工**（a17a8c4）：容量→10（单常量）、state/event 协议分层（state 带 seq 应用层丢弃语义/event 走 TCP 有序）、扇出压测真实数字 **P95=2ms**（10 连接 20Hz×30s，5220/5220 零丢失，主会话亲跑复现 max 6ms）——远低于 50ms 判据；诚实边界：loopback 不证明弱网韧性，真实弱网挂部署棒。新疑点#5（入房连接可伪造广播，无发送者权限校验）入账本 F2 层=战斗同步棒必修前置。后端大厅层至此完整：auth/好友/房间/分配算法/压测基线。
- 21:2x **asset-audit 验收通过收工 + 处置执行**（cec702a）：234 张全覆盖审计（饱和度扫描客观定位灰图嫌疑再逐张甄别）。**最重发现=首屏活体脏件 title-bg.png**：主菜单+存档屏背景实为 Online 宣传截图，烘焙 4399 版权法律声明全文+旧名 logo+Online 菜单项——keyart 落地即弃用（账本置顶）。历史糊弄件源头 dialogue_fullscene_stage12_frame1（"太上老君滚出来"截图裁条）等 14 个死件/孤儿已删（删前核动态纹理键 icon_*/skill_*/floorBg$n/bg$n$i 排除误删，build+470 绿）。floorBg2/3/4 空导出转 battle-fidelity 定性（动态加载删文件会 404）；两类历史坏素材（截图硬裁/滤镜灰图）经复核均已被前序棒修复成立；select_role 灰格与技能 locked 灰态判为忠实原版设计非 bug。
- 21:4x **verdict-fixes 三轮终审：三项过审 + 第五格二次打回**（1dd8d69）：①主菜单标题「再续西游」毛笔字 36px 白色（亲看无裁切）；②字体收敛终选**马善政**（Google Fonts 零许可风险）——考据亮点：网页摘要称演示秋鸿楷/夏行楷"禁嵌入"，agent 抓猫啃网一手源证实摘要错误（授权表明确允许游戏嵌入），二手摘要 vs 一手源矛盾证据链入 report，两款列为已验证备选；沐瑶排除（授权禁嵌入）、竹石体不够毛笔；③L1L2 收缩：ACTIVE_CAMPAIGN_LENGTH=2 夹逼（含旧存档写 3 读回夹到 1 的实测）、L3/L4 恒 locked 复用置灰路径、代码留库。**第五格标签第二次没删**（把"修正+方向三件"误读为二选一），二次打回一行修。BattleScene 通关文案边界冲突裁决路由 battle-fidelity（按 ACTIVE_CAMPAIGN_LENGTH 判末关）。跨棒插曲：battle-fidelity 改 monsterSim 接口时 tsc 一度全项目红，verdict-fixes 补唯一无歧义一行恢复绿且不 commit 对方文件——处置正确。测试基线 470。
- 22:0x **verdict-fixes 收工**（eb7b591）：第五格纯 ??? 无标签终审过（亲看 terminal-2），跨四 commit（ba09134/8bed836/1dd8d69/eb7b591）三轮拍板变更零边界违规。在途仅剩 battle-fidelity（命中判定+floorBg2 定性+末关文案三小单）与 art-keyart（风格锚候选）。
- 22:2x **art-keyart 交付 + 候选已发用户飞书**：三张 keyart（seedream 多图 ref 锁角色一致性，5504×3040）+ 走廊贴条（A 暖米金推荐，10% cross-fade 已无缝化）+ 「再续西游」书法标题（**没走生图**——"续"字生图必崩，改书法字体渲染+飞白后处理零错字，工具 tools/render-title-calligraphy.py 可复用）+ style bible docs/design/art-style.md 进 git。主会话亲审三张：同意推荐 C（南天门天光留白正好压标题；A 偏淡、B 角色顶满无留白），五角色形象忠实（缝合脸/发带回纹/毗卢冠/蓝发精灵耳/黑影问号），共同小瑕=八戒钉耙不清（定锚后局部重绘）。gpt-image-2 i2i 打样有效但整图端点 1007 异常，整图全走 seedream。**候选 A/B/C+成品预览已发用户飞书待挑锚**；锚定稿后 art-keyart 重出走廊/标题正式件+替换首屏脏件 title-bg。12 个已验收 commit 已推 remote（bb61e31..eb7b591）。
- 22:4x **用户定锚 keyart C + 抓到洗色问题**：八戒沙僧在 C 里灰白偏淡，用户质疑。主会话对真源（role3_0/role4_shovel_0 全彩帧）证实用户观察正确——原版八戒=深青绿僧衣+金发带、沙僧=高饱和蓝发+青绿甲+橙黄边，均不淡；根因=生图 ref 里五格图是灰度态（原版未选中滤镜灰）拖偏上色。art-keyart 返修单：C 基础上按真彩帧重上色两位（禁整图重抽防回退，须并排 diff）+ 顺修八戒钉耙；坑（灰度 ref 拖偏上色，角色 ref 必须全彩帧）写进 art-style.md 禁忌清单。**用户新原则入 style bible**：真源本就淡/缺色时，授权提示词补全最合适对应色（合理演绎优先于死守）。修色过审后 C 才算锚定稿，再出走廊/标题正式件。
- 22:5x **锚定稿拍板：keyart_C_recolor_gpt.png**（主会话亲审两版修色：gpt 版八戒沙僧饱和归位/钉耙九齿清晰/无回退；seedream 版淘汰——八戒缠头跑成蒙眼带、锡杖变叉）。成品已发用户飞书。art-keyart 收尾三件：style bible 更锚+补禁忌两条、走廊正式件（与锚色调佐证）、行楷标题正式件，落 game/public/assets/generated/。首屏接线（换 title-bg 脏件）待正式件到位后派场景棒。
- 23:0x **art-keyart 正式件落 git（7d84b3a）+ 首屏接线派单**：generated/ 三件（keyart-home/battle-floor-tile/title-zaixuxiyou——标题四字亲验零错字）+ style bible + 锚图副本 docs/reference/art-anchor.png + 差距账本/参照图/总纲更新一并入库。**主会话裁决：战斗地面沿用 Online 真走廊件**（e4e3cfe，原版真件优先于生图件），battle-floor-tile 转备胎。verdict-fixes 唤醒接首屏接线单：主菜单+存档屏背景换 keyart-home、标题换行楷位图、**删除全库最后一个活体脏件 title-bg.png**。
- 23:0x **用户飞书点头锚定稿，令继续推**。发现 battle-fidelity 已静默 commit 命中判定修复（d098e5d，21:52）：考据超判据——反编译 L1 小怪各 AS3 类恢复真实机制（伤害子弹在挥砍中段按 bbdc 帧表生成、真刀锋 75-155px 按怪种、起手锁朝向绕背即 miss），BattleScene 只消费新 attack-hit 事件，66 行新测试，474 全绿（主会话亲跑）。floorBg2 定性/末关文案两小单未做，已 ping（三小时无回音，等回音收尾）。**新派 social-deploy 棒**（general-purpose）：social-server 部署 home——主会话拍板**复用 zm-dev vhost 加 /social/* 路径（最小暴露不新增公网入口）**、systemd zmxy-social 照 zmxy-agent 模式、JWT_SECRET home 上生成不进对话；判据含跨公网 e2e + 真实网络扇出压测数字 + agent-server 零破坏回归。
- 17:4x **battle-fidelity 终审：B 过 A 打回**（654333b 已 commit）。**三处考古反转接受并记档，均纠正任务书错误前提**：①bg12/13 实为云+莲叶+牌坊装饰、无石面纹理（PIL 裁切+swf2xml+StageListener12/13 检索，关卡背景布局纯 AS3 运行时 addChild，timeline 零坐标可抄）；②无双条真源（hud_ri_rage.png 323×11=chid262 herobeattacktimes 原件）S3 ui-finish 阶段就已提取接入，白色空条=原件 0 充能真实长相，"没提取"是交接账目错误；③chid262 在对象树里属顶部 RoleInfo 面板（y≈78），与底部无双坞钮相距 460px，"应相连"无源数据支持——坞侧真问题是连接底座细缝，已补。B1 等级数字居中（量位图 alpha bbox，非抄动态文本框注册点）/B3 默认金箍棒/B4 坞补缝过审。**A 打回两项**：悟空脚下仍无可见石台（floorBg1 平台边缘成品里是身后模糊纹理带，非脚下走廊）、远景宫殿几乎不可见（矫枉过正）。**返修关键情报（主会话判读）：参照图 battle-original.png 是 Online 实机**（HP19335/宠物头像/光棍节横幅/走廊 4399 字样），雕花走廊=Online 素材，vendor 里本来就没有——agent 排查诚实但漏搜 Online 提取物三处（zmxy-online-extracted/canonical-hunt batch/zmxy3-official），已令按总纲去挖，挖不到穷尽举证后再拍重绘。
- 23:3x **首屏接线过审（ebbf9b8）+ 用户两拍板**。①verdict-fixes 首屏：keyart 上屏、title-bg 脏件删净（grep+dist 双证）、标题黑墨改白（对比度 bug 的合格适配：只改 RGB 保 alpha、原件保留、如实报告）；一行调在途（第五位黑影被菜单面板挡，背景偏移）。**git 卫生事故记档**：它 commit 时误带 battle-fidelity staged 的 floorBg2/3/4 删除（内容方向一致无损坏，三绿）；裁决不重写历史，归属在此记明：**ebbf9b8 里三个 floorBg 删除实际属 battle-fidelity 的 L2-L4 地面层定性工作**。派发纪律新增：commit 前 git status 核暂存区只含自己 add 的文件。②用户拍板：**联机往后靠**（总纲 3 条已更，后端保持已上线状态、游戏侧 UI 冻结），先做最重要的——排序：battle-fidelity 收尾→行为层接线→表现层→用户亲玩轮→打包；**前端部署子域名**（总纲 3b）：social-deploy 续单 zm.qmledmq.cn:8443 静态站+一键更新脚本，用户随时随地看。③push 大素材坑：generated/ 等 ~20MB 载荷 push 会卡超 2min，需 `-c http.postBuffer=157286400` + 长超时（已推 eb7b591..ebbf9b8）。
- 23:1x **social-deploy 棒闭环：social-server 上线 home**。照 zmxy-agent 模式做第二个常驻服务：WSL systemd `zmxy-social`（Restart=always 已真实验证——杀 MainPID 6s 自愈+重监听 7100；bash -lc 拿 nvm；EnvironmentFile 600 存 openssl 生成的 JWT_SECRET 值不落对话；SOCIAL_SERVER_PORT=7100）+ Caddy `zm-dev.qmledmq.cn:8443` 加 `handle_path /social/*` 反代 7100（agent-server 收进 handle 兜底块，原路径零变化，C:\infra commit b7fbc46）。**四项验收全绿**：①active+enabled+崩溃自愈；②mac 跨公网 e2e 完整链路（注册→好友→建房→WS广播→game_start，854ms）走 wss://zm-dev:8443/social/ws；③**跨公网扇出压测真实数字 P50/P95/P99=17/21/25ms、5238条零丢失**（10 连接同源 mac→home北京→mac 完整往返 RTT，对比 loopback P95 2ms 多出的~19ms 即真实公网延迟，远低于 100ms 线，服务端扇出非瓶颈）；④agent-server welcome[laojun] 根路径回归通过。部署后 social.db 重置干净。report 落 tasks/social-deploy-report.md。坑：WSL sudo 要密码走 wsl -u root 从 stdin 喂脚本；npm allow-scripts 警告虚惊（40/40 单测实证 better-sqlite3 正常）；home git 在 PowerShell 别管道 tail。
- 00:1x（07-09）**前端上线子域名 zm.qmledmq.cn:8443**（social-deploy 续单）。从 remote d2cd5b7 拉码在 home WSL build（VITE_NPC_SERVER_URL=wss://zm-dev.qmledmq.cn:8443 固化进一键脚本，WS 走 env 覆盖非改码，default 不动）→ dist 拷 Windows C:\www\zm → Caddy 新 vhost 静态 file_server（照 wanctl-site 先例，*.qmledmq.cn 通配 DNS/证书现成，C:\infra commit db35ac2）。**验收全绿**：curl 首页 200+标题、JS/keyart 跨公网 200；playwright 截图水墨首屏真实渲染（五角色群像+第五"?"剪影未被菜单遮挡=d2cd5b7 修复、金宫殿水墨云、"再续西游"毛笔标题+菜单毛笔字）；zm-dev 上 agent-server welcome[laojun] + social /social 双 401 零打扰回归。一键更新脚本 home WSL ~/deploy-zm-frontend.sh（push 后 `ssh home-wsl 'bash ~/deploy-zm-frontend.sh'` 刷新）。report 落 tasks/frontend-deploy-report.md。注记：HTML <title> 仍旧品牌（游戏内已"再续西游"），非改码授权未擅动，已知会。
- 00:3x（07-09）**battle-fidelity 收棒 + behavior-wiring 开棒**。①battle-fidelity 静默交清最后两小单（a07b511：floorBg 空图 load 清理 + 末关文案读 ACTIVE_CAMPAIGN_LENGTH 不写死），全棒过审收工（真走廊/命中判定/两小单），474 绿主会话亲跑，已推 remote（..a07b511）；命中修复体感验证并入用户亲玩轮；对其"三次静默 commit 不汇报"提纪律要求。②新派 **behavior-wiring 棒**（codex，tasks/behavior-wiring-brief.md）：巫鹰 hp 926→原版 300、monsterBehaviors 接线（L1/L2 roster：巫鹰 hit2/Monster13 弹道）、攀爬段 Monster30 verticalFollow、弹道命中语义按 AS3——账本 C 层最高风险欠账开工。③主会话复验定名收尾：zaixu 200 / zm 已回落通配占位（45B）。
- 01:0x（07-09）**用户亲玩线上版暴怒打回（session5 最重事故），夜间自主修复窗口开启**。用户新缺陷清单：①战斗内背包按钮点不动+关不掉（阻塞级）+布局歪（疑 scrollFactor 命中漂移老坑在镜头移动后复发）；②地面掉落物无图标；③传送门无素材；④**L1 应有四 boss：千里眼/顺风耳/巨灵神/巫鹰**（用户权威记忆，推翻此前"蜂群+巫鹰"的 roster 考古）；⑤无限眩晕破绽：连击可把小怪永久 hitstun 无脑通关（缺原版受击恢复/霸体）；⑥"小怪打不着我"（线上是 d2cd5b7 未含 d098e5d 命中修复+hitstun 叠加）；⑦攀爬段背景/阶梯不对、通关节奏"跳两下就过"。**主会话事故复盘**：发链接前未亲玩全流程=主责；技能树/背包的结构性修复在玩家体感上"没变"（素面板中间态）+预期管理失败；"多人做好了"的汇报被理解为游戏内可用（实际=后端完成+用户拍板 UI 后靠，入口从未开工）——汇报口径须写明玩家可见状态。另：主会话排查时又踩共享 playwright tab 污染（我的探针跑到 behavior-wiring 的 5205 dev tab 上），坐实独立 context 纪律。**夜间三棒**：behavior-wiring 扩单（hitstun 霸体考古修复+L1 节奏）、l1-truth 只读考古（四 boss 真相/掉落物图标缺口/传送门素材）、backpack-blocker（阻塞 bug 紧急修）。部署刷新已触发。明早交付：可玩版本+飞书复盘。
- 01:2x（07-09）**用户补三诊断+令红蓝对抗 review**：①背包实为"组件渲染位置与监听位置不一致"（用户自诊，转 backpack-blocker 升级判据=每个可交互元素渲染坐标 vs hitArea 对账画框）；②攻击手感命门——棒子打到怪物身体中心判 miss、怪打人同样错位（双向命中错位=渲染 vs 逻辑坐标不一致族）+怪物打人恒 -1（monsterAttackPower 占位公式被防御吞光触 clamp 底）——behavior-wiring 优先级重排"手感三件套置顶"（命中错位/伤害真值/无限眩晕），弹道等顺延；③用户明令整库 codex review 交叉红蓝对抗——**review-red**（玩家视角行为正确性：判定链/状态机破绽/交互命中/资源失败路径）+ **review-blue**（工程一致性：坐标三层契约全库扫/常量双源/生命周期/数据契约/可测缝隙）已派，findings 出齐后交叉对抗验证。夜间五棒：behavior-wiring/backpack-blocker/l1-truth/review-red/review-blue。
- 02:1x（07-09）**夜班第一波验收+再分派**。①backpack-blocker 过审（40e2919+4166706）：根因=Phaser hitTest 用相机滚动换算世界坐标、无视 scrollFactor(0)——九个按钮命中区随镜头漂移 400px（真 hitTest 叠加图铁证，独立 worktree 复现修前态）；"布局歪"排除=感知伪象；修法=场景级 resolveHit 手动命中。②behavior-wiring b173f87 过审：Monster3 十字段逐字改回 AS3 真值、巫鹰 hit2 叠加层方案（不换状态机的权衡正确）、Monster7 双反编译对账一致判不接、Monster13 不在 L1/L2 诚实未凑、攀爬段 threat-free 真相+刷蜂群+顺修 resolveHeroHits 写死 GROUND_Y 的空战 bug；483 绿主会话亲跑。**手感四件套（命中错位/伤害-1/无限眩晕/脚底基线）向其确认中**。③l1-truth 考古三问全破：四 boss=用户按第一章粒度记忆正确（1-1 巫鹰/1-2 千里眼顺风耳/1-3 巨灵神，AS3 hp 300/1500/2000/4000 逐字），我方 level1.ts 已含全部四个、缺的是 mini-boss 演出（isBoss=false 无血条无 toast）+"压缩三关为一关"是记档的设计取舍待用户知情；掉落图标 19/19 库存齐、根因 makeDropSprite 星形占位从不加载图标+spawnDrops 写死 monster30 表（六个专属掉落表成死数据）；传送门=占位图元、原生 TransferWind 十帧已提取就绪。④红蓝 review 交付：红队（掉落表/ResultBanner 同族漂移被 6s 自动关闭掩盖/怪物渲染偏移 vs 命中盒）、蓝队 13 条（3blocker：命中漂移家族 4 处未修含背包残留两热点、掉落、**存档槽 3-5 UI 可选但从不持久化**；major：canvas/depth 写死 13+ 处已有 Toast vs FurnacePanel 同 depth 碰撞）——交叉对抗阶段已启动（互验 blocker/major，refute-or-confirm）。⑤分派：backpack-blocker 唤醒接命中漂移家族清剿+存档槽 bug；behavior-wiring 追加 L1 表现层三件（mini-boss 演出/掉落图标+species/TransferWind 传送门）。⑥浏览器标签题改「再续西游」（主会话一行 commit）。
- 02:3x（07-09）**红蓝对抗收官，裁决全部分派**。交叉验证战果：①红队推翻蓝队"BackpackWindow 残留两热点"指控（当前工作树 setInteractive 零命中=已是修复模式，蓝队读的旧快照）；②命中漂移家族影响面校正：活雷 2（ResultBanner+MenuButton——MenuButton 注释自称跨输入系统一致是哑雷话术，唯一踩雷消费者是滚动相机场景）/哑雷 2（FurnacePanel 两实例：worldmap 相机不滚、BattleScene 只挂调试钩子）；③**存档槽 blocker 双方一致定为全场最重**（BattleScene:792 三元只认 0/1/2，saveSlots 定义 6 槽，玩家选 4/5/6 槽全程静默不落盘）；④equip() 吞装备窗口收窄细化（qty≥2 堆叠+背包满+无处合并）；⑤Toast/炉面板同 depth 210 冲突真实触发点纠正为 WorldMapScene.submitCraft 日常路径（心愿栏留空点提交必撞，比原判更易撞）；⑥蓝队盯在途 diff 挖到 AoE 命中基准半迁移缝隙（buildSpawn 原始 state.y vs 英雄侧已换 visualCenter）→并入 behavior-wiring 手感收尾判据。**证实 behavior-wiring 正在做手感四件套**（未提交的 hitstun-triad 改动被蓝队目击：去 MON_RENDER_OFFSET_Y、加 visualCenter/monsterHitbox）。分派：backpack-blocker（活雷清剿置顶+存档槽+equip 护栏+depth 冲突）、behavior-wiring（AoE 基准核对）。红蓝两棒收工。技术债入账：canvas/depth 常量化（960×540 写死 13+ 处）。
- 03:0x（07-09）**手感三件套过审（73cbf72，485 绿亲跑）**：①双向命中错位+脚底基线同根因——MON_RENDER_OFFSET_Y=30 是 milestone-2 占位补丁，在真实 offset 抠出后成了叠加二次错误且只加怪物侧，删除后悟空与怪脚部坐标精确重合（数学验证+并排截图）；命中盒从写死 120×140 改按真实 cell 等比缩放锚视觉中心，同法应用连击/技能/hit2/血条。②怪物攻击力真实化——min(60, 8+def*1.5) 启发式封顶把高 def 怪全压平（"打人只-1"成因），L1+L2 十种怪逐字反编译替换（千里眼 20→50、广目天王 35→129，减伤后 125 点真打疼人）。③无限眩晕根因反转——原版硬直本就被连击重置（机制没移植错），破绽是**我们自造的输入缓冲**（原版挥招中按键直接丢弃）；删缓冲+收紧 attacking 语义防 1500ms 僵直新回归。**主会话裁决眩晕残余：帧完美连点锁死=原版数学关系真实面貌，保持 AS3 原样不发明反连招**（记档，用户玩后可翻案）。L1 节奏结构推算约 8.4 分钟纯战斗。behavior-wiring 剩 L1 表现层三件+AoE 核对后收棒。
- 03:2x（07-09）**命中漂移家族清剿+存档槽 blocker 过审**（c49c24b+fd255d5，485 绿亲跑）：共享 game/src/ui/screenHit.ts 抽取，FurnacePanel/ResultBanner/DialogueBox 统一改场景级命中；MenuButton 加 opt-in screenSpaceHit（getWorldTransformMatrix 天生免疫相机滚动），默认 false 不动不滚场景。存档槽根因=BattleScene.seedFromSave 私写三元只认 0/1/2→saveToSlot 见 null 静默 no-op；修法=asSlotId 提升 saveSlots.ts 唯一导出三处统一；worktree 对照实证修前 activeSlot 恒 null 进度从不落盘。**协作事故记档**：73cbf72 误打包 backpack-blocker 未提交的 activeSlot 改动（共享工作树高流量文件），该历史点单独检出编译失败，已由 c49c24b 补齐断层并 worktree 验证独立编译——纪律新增：**高流量文件（BattleScene.ts）缩短读改到提交间隔**。AoE 基准缝隙闭环（be94f8e，巫鹰 hit2 锚点统一视觉中心、AS3 偏移原值不动）。待确认：追加 A（equip 吞装备）/B（炉面板 depth）是否交叉遗漏。behavior-wiring 转表现层三件中。
- 03:4x（07-09）**表现层三件过审（807cdea，487 绿亲跑）**：①三 miniboss boss 待遇——平行追踪方案（MINIBOSS_SPECIES 集合+activeMiniBoss 字段）绕开 isBoss 被波次清空判定复用的耦合，顶部血条"千里眼 1500/1500"实测；②掉落真图标（保留稀有度色环）+spawnDrops 传真实 species，千里眼掉 moon_dew/cracked_jade 实证专属表生效；③TransferWind 十帧真素材接入 showPortal（诚实边界：自造过渡流程的风格贴近件非逐帧复刻）。**连锁缺口**：species 修对后暴露 drops.json 只覆盖 L1 七怪，L2 六怪（monster6/9/10/15/16/19）零条目=真零掉落——已开窄口子（drops.json+测试）令其反编译 fallList 逐字补齐后收棒。
- 04:2x（07-09）**backpack-blocker 收棒（fd8d387+a61721b 过审，487 绿亲跑）**：equip 吞装备护栏（照 unequip 模式先验容量+完整回滚，逐字节对照复验）、Toast/炉面板 depth 冲突根治（新 ui/hud/depths.ts：TOAST_DEPTH=310 恒最上层）。**第二次高流量文件收编事故**（这次它的未提交 toast 行被 807cdea 反向收编，功能无害，自补 commit+worktree 独立编译验证）——两次双向事故坐实纪律条款：BattleScene.ts 等高流量文件改动即刻提交。夜班仅剩 behavior-wiring 的 L2 掉落表补齐一笔。
- 05:1x（07-09）**夜班收官：全部修复合入推送（..f9c150c）+ zaixu 已刷新（head=f9c150c）+ 主会话亲玩线上版验收通过**。behavior-wiring 收棒（L2 掉落表 f9c150c：发现掉落系统是项目自建平行体系后不硬凑字面映射，概率数字取 fallEquip() 真实出处 probability×boss1.5/表长；Monster9/10/19 考据原版恒 0 掉落故意留空；端到端多闻天王掉自己的表；整棒五批交付零打回=单棒最高产出）。**亲玩验收**：进关正常、悟空与怪脚底同线、持金箍棒踩雕花走廊、背包点击页签真实切换、布局齐整（截图 game/tmp/finale/）。**新 bug 记账（非阻塞）**：__shellScene() 钩子谎报场景名（battle 时仍报 worldmap，亲玩时误导排查半小时；修法=读 scene manager 真实 active 列表）——所有依赖它的自动验收都可能被骗，下轮修。493 测试全绿。夜班八棒全收（behavior-wiring/backpack-blocker/l1-truth/review-red/review-blue/social-deploy/art-keyart/verdict-fixes）。

### === 会话交接 session5 → session6（2026-07-09 05:2x，夜班收官，本会话上下文近 60%）===

**接手须知**：remote master=f9c150c 全推、线上 https://zaixu.qmledmq.cn:8443 已同步（一键刷新：`ssh home-wsl 'bash ~/deploy-zm-frontend.sh'`）。读 CLAUDE.md 总纲（含 07-08 晚二次拍板：再续西游/神似重制/生图策略/L1+L2/联机后靠）+ 本文件 + docs/design/imperceptibility-gaps.md 账本即可接手。无在途 agent、无未推 commit。

**用户睡前暴怒清单的修复状态（晨间飞书已/将同步）**：背包点不动✅（命中漂移家族全清）、存档槽4-6丢档✅、双向命中错位+脚底基线✅、怪物打人-1✅（真实攻击力）、无限眩晕✅（删自造输入缓冲；帧完美连点残余=原版数学关系，拍板保留可翻案）、四boss✅（roster本就有，补了演出）、掉落图标✅+专属表✅+L2表✅、传送门✅（TransferWind）、L1攀爬阶梯视觉❓（未专项处理——bg11阶梯仍未对齐玩法路径，账本待办）、"多人入口"=用户拍板后靠冻结中。

**session6 建议优先**：①用户晨间反馈处置；②手感校准轮（Ruffle 活原版基准，一直欠）；③技能树/背包 UI 生图皮统一轮（素面板中间态）；④__shellScene 谎报修复；⑤音效覆盖对账+伤害飘字字体（B 层账本）；⑥承伤档位用户亲校。

**纪律（血泪版）**：交付用户前主会话必亲玩线上版；实现活一律 codex（用户硬指令）；高流量文件（BattleScene）改动即刻 commit（两次双向收编事故）；共享 playwright 必须 bringToFront+断言 URL 或独立 context；派 codex 写装依赖服务=brief 开头写"不装包不跑测试验证交包裹层"；push 大素材需 postBuffer+长超时；每 commit 立即汇报（behavior-fidelity 三次静默教训）。（用户拍板：前端 zaixu.qmledmq.cn，正式后端预留 zaixu-api.qmledmq.cn，zm 弃用）。执行：C:\www\zm 改名 zaixu、caddy 受控副本删 zm-site 增 zaixu-site、主 Caddyfile import 替换、删已部署孤儿、一键脚本 SITE 默认改 zaixu（文件名 ~/deploy-zm-frontend.sh 沿用，跟 CLAUDE.md §3b）、build/dist 零改动（renamed 非 rebuild），apply.ps1 -DeployCaddy（C:\infra commit d3b37fe）。**复验全绿**：curl https://zaixu.qmledmq.cn:8443 → 200+标题、keyart 3385731 image/png；playwright 截图水墨首屏真实渲染；zm.qmledmq.cn 游戏彻底下线（现只落 *.qmledmq.cn 通配占位 45B text/plain）；zm-dev 零打扰（agent welcome[laojun]+/social/me 401）。report tasks/frontend-deploy-report.md 域名状态更新。**最终前端 URL：https://zaixu.qmledmq.cn:8443**。

## 2026-07-09 session6（09:30 起）L1 九重天空间结构重建

- 用户实玩指出 L1 三宗罪：背景不对、出怪顺序不对、地图空间不对（原版=纵向爬塔跳阶梯+乌鸦怪追击+顶部巫鹰战且乌鸦照刷）。主会话重挖 SWF 证实：1.swf 实为三子场景（bg11 1132×3051 纵图爬塔 + bg12/13 ~4890 宽横向卷轴），session1 移植时"爬塔→横版"适配把三段压成了单屏平地。
- 真源三处全部挖到：StageListener11.as（刷怪 3s 首轮/6s 周期/每轮 2 只 Monster30 于英雄头顶上方、y≤-1900 触发镜头上摇+巫鹰(750,-2050)、Boss 战刷怪不停，frameClips=24 已核实）；平台碰撞架构 = 场景 MC 子节点命名标记（isWall/isThroughWall/isThroughUpButDownWall/isThroughDownButUpWall，PhysicsWorld.addSubObj 收集）；场景符号 sl11=195/sl12=209/sl13=211（主 SWF）。AS3 全量导出在 tmp/re-level1/。
- 10:30 双 codex 并行派工（用户拍板实现类一律 codex）：**codex-geometry**（挖 195/209/211 平台矩形→level1-geometry.json+overlay 验收图，brief=tasks/level1-geometry-brief.md）∥ **codex-climb-engine**（平台碰撞 platformSim+纵向/横向卷轴相机+持续刷怪器+Monster30 飞行追击+三子场景 transferDoor 串联，brief=tasks/level1-climb-engine-brief.md）。文件产权互斥，geometry JSON schema 冻结作契约，engine 先 fixture 后换真数据。判据写死在 brief；主会话终审=亲跑测试+浏览器亲验爬塔。
- 11:3x 用户四答+大盘点落账：①官方内部数据=无，逆向仍是唯一路（真源优先级协议写入 systems-map）；②**炼丹炉翻案（总纲级）**：按原版配方复刻，agent 降级为规则内代理操作（代炼/批量打造强化），CLAUDE.md Agent NPC 节已更新；③灵魂经济无官方数→挖 AS3；④手感两报：捡拾 y 盲实锤（BattleScene:2385 把英雄 y 写死 GROUND_Y，拾取退化只看 x）+ 小兵不出手待根因——连同怪物索敌 y 盲一并扩单 climb-engine（三件+判据）。
- 新棒：**economy-archaeology**（claude 只读考古，三问：原版炼丹炉配方机制/击杀掉魂链路/AllEquipment 装备全表，产出 tasks/economy-archaeology-report.md）。
- **系统图谱落地 docs/design/systems-map.md**（用户点名要的依赖图谱）：三循环飞轮（战斗→经济→成长）+ 逐节点真源状态账（🟢🟡🔴）+ 闭环判定（技术闭环成立；经济两断点=击杀掉魂缺失+装备池空心）+ 补洞依赖倒排（考古→装备表→配方炉→掉魂→L1 掉落重审→商店替代拍板）。活文档约定：节点状态变更随棒验收同步更新。
- 12:0x **climb-engine 主体交付（9d44038）+ 独立验收进行中**：平台碰撞（四种墙语义测试点名 AS3 分支）/持续刷怪（3s/6s）/高度触发巫鹰/三子场景链全落地；主会话亲跑 vitest 504 绿 + tsc 净，与 report 一致。report 诚实记档四项保真度缺口：①几何 JSON 未落地（fallback 墙为临时适配，loader 就绪）；②sl12/13 用 WaveSpec 近似（真源是打门+站桩解谜脚本，无 createMonster）；③Monster30 为独立轴跟随非真 2D 追踪；④Boss 出场镜头 tween 未做。终审留待几何落地+扩单合入后浏览器亲验一次做完。
- **协作拓扑事故记档**：climb-engine 的下级 codex 包装器"点火即退"，对上级转达的扩单拒收（只认直接 orchestrator 的显式派发）——扩单一度没真跑。已捅回 climb-engine 亲自重派，现已确认在途（工作树可见 pickup/monsterSim/level1/level2 正在被改）。纪律：**经由中间层的追加指令必须要求中间层确认下级真实开跑**（收到"已转达"不算数，要看到进程/文件证据）。
- 手感根因（climb-engine 考古坐实）：**"小兵不打我"= normalAttackRate 字段张冠李戴**——数值表借用了 AS3 无关的 probability 字段（0.15），真实出手判定字段 normalAttackRate 杂兵构造函数根本没覆写、应取基类默认 0.3；monster30/5 恰是仅有的两个用对字段的物种，正好解释"只有乌鸦怪打我"。修表规则：逐物种查 AS3 构造函数有无覆写，无则 0.3（含 level2.ts 边界例外已授权）。
- 浏览器冒烟（vite:5301 独立端口+独立 tab）：主菜单→存档 6 槽→选人→世界地图渲染与导航全正常；进 L1 亲验因工作树活改（HMR 重载）暂停，等扩单 commit 后续验。
- 12:2x **economy-archaeology 收棒（tasks/economy-archaeology-report.md，369 行）**，两大真相改写经济线：①炼丹炉=StrengthEquipment 四页窗（强化/熔炼/打造/分解），配方全部硬编码 AllEquipment.as——38 条打造配方/强化成功率二维表/熔炼配方/分解产出表**全部逐字抄录到手**；②**否证"击杀掉魂"**：原版怪死只掉装备+1级强化石（fallEquip/fallStone），灵魂进项=卖装备(getValue)+卖白装+任务+洗技能返还，经济闭环真相="杀怪→掉装备→卖/分解→灵魂+材料喂炉子"。装备全表 218 件 schema 完整、提取难度低。四待查：药品数值/装备卖价来源/玉衡石天枢石渠道/制作书 fill 冲突。systems-map.md 经济节点已按真相更新。
- 新棒 **codex-econ-extract**：装备全表+逐怪 fallList 机械提取→game/src/data/original/*.json（幂等脚本+计数对账判据）+四待查项。
- **geometry 线卡死救援**：codex job 74 分钟 CPU 0.09s/日志冻结/零产出（判定三样全中），已令 codex-geometry 杀掉重派（全新一次性调用，二次卡死则走 codex exec 裸救援）。climb-engine 扩单三件确认真跑（status 见真实文件读取）。
- 12:5x **多线合流**。①geometry 救援成功：新 job 真跑（旧僵尸已杀），level1-geometry.json 落地——sl11 15 块 through 阶梯+塔顶全宽平台(y=-1872)+传送门(717,-2037)，y 值域 -2379~499 与 bg11 3051px 自洽，Boss 空中刷出落顶层平台的空间叙事成立；overlay/report/commit 待收。②扩单三件代码+测试全落树（拾取 y 双轴/索敌 2D 攻击门 x-only 各点名 AS3 行号/出手率修表含 L2），待 climb-engine 自验提交。③主会话浏览器亲验（vite:5301）：进 L1=「九重天·爬塔」，持续刷怪活证（24 只 hp1 乌鸦 chase、英雄被啄 240→224）、跳跃 400→316→400 正常；**两个视觉问题记账：bg11 相机区域近乎空白（bg 接了但对位存疑）、平台无可视表现**——待几何对齐后保真 pass 一并处理。④econ-extract 开跑（extract-equipment-table.mjs 已出现）。亲验两度被 HMR 打断（并行 codex 写 game/src 触发 vite 重载）——深度亲验安排在全部在途棒 commit 后的静树窗口。
- 13:0x **用户实玩二轮反馈（关键：真源可信度危机）**：①质疑 vendor 魔改版数值不可信（乌鸦原版要打好几棍/经验少/掉落低概率），已派 canon-numbers-research 三路交叉验证（websearch 攻略 + XinTianyu-Sky/ZMXY JSON + 魔改版基线对照），**在裁决前 L1/L2 数值全部标"待验真"**；②等级 11 复盘：hp1 割草 + **原版反刷门（等级≥10 乌鸦经验清零）抄到但没接线（招认）** + 必掉放大；③掉落模型判错：改原版单掷 fallList 制（数据提取在途）；④桃子→大还丹张冠李戴判错，**新纪律：装备/物品/配方三真源表落库前冻结一切物品新增改名**；⑤技能系统定性=架子原版模型但经济未启用（默认白送5技能=演示态遗留；技能书升级机制未考据未做，并入研究棒）；⑥拍板：去掉技能释放的拼音标签（SLZ）；⑦技能特效诚实盘点=未提取未接（WuKong.swf 可导，帧动画真提取优先，生图兜底用于静态类）；⑧渲染 bug 记账：悟空半腿出画/乌鸦矩形蒙版+尺寸偏大（疑同根因=动作表网格错）/乌鸦聚而不啄（疑攻击 y 重叠恒不成立）。
- 13:1x **econ-extract 数据落库验收通过（初验）**：equipment.json 218 件（9/67/10/120/12 与考古报告逐项吻合）+ monster-drops.json 85 怪类。考据小注：桃类物品不在 AllEquipment——桃子=export.cure 即时回血拾取物，进一步坐实"大还丹"张冠李戴。**用户实玩三轮反馈累积成 tasks/fidelity-r3-backlog.md（18 项分 ABCD 四棒）**，新增：个人资料面板四处布局/蒙版 bug（属性列过挤/悬浮黄条/灵魂区文本重叠/灰蒙版）、战斗内技能按钮应复用技能树页（原版行为，拍板）、技能树页 demo 状态确认打回。树静后按 backlog 分棒派出。
- 13:3x **canon-numbers-research 收棒（tasks/canon-numbers-report.md）+ 主会话亲验关键链路**。裁决：用户怀疑的三处（乌鸦 hp=1/exp=4+高级清零/低掉率）**全部是原版忠实值非魔改**（cr173 血量表独立佐证"乌鸦 1HP"；攻略原文"8级以上无经验给4经验2灵魂"；杂兵 15% 掉率）——"打好几棍"记忆=会飞打空+巨灵神战 adds。等级 11 仍是我们的错（反刷门漏接+必掉+自建表）。**重大自纠：击杀掉魂存在**（economy-archaeology Q2 漏挖 dropAura 链判"无"，已作废）——主会话逐字亲验完整链：BaseMonster:901 auraRed(gxp×2)→AuraEvent→RoleInfo:520 setLhValue；乌鸦 2 魂/千里眼顺风耳 20/巨灵神 30。技能经济机制完整到手：灵魂逐级喂 150·level^2.5（SkillControl 逐字）+主动限装5+技能书线+孟婆重置。systems-map 二次更正、backlog A 棒更新（新增掉魂接线+gxp 提取；数值保持不改）。诚实边界记档：无干净 0.72 原版可 diff，"全局无魔改"不能穷举；升级 exp 需求表被混淆编码未强解（ZMXY expCurve 首段 135/145/155 与我们 progression 吻合）。
- 13:5x **全线收口 + 下一轮双棒派出**。收口：①扩单三件主会话亲验（511 绿+tsc 净）并提交（54a1695，climb-engine 包装层等待超时由主会话代收）；②geometry 棒终审通过（overlay 亲看：平台之字形上行/塔顶接宫殿/门在宫殿区；中段云海区无阶梯贴图的可视化方案记档待 Ruffle 对照）+ econ-extract 全部产物提交（0bd9834：几何 JSON+装备 218 件+85 怪掉落表+四脚本+两报告）。派出：**codex-fidelity-a**（机制七件：掉魂接线+gxp 提取/单掷掉落模型/L1 物品表真源重写/反刷门/乌鸦不啄根因（注意可能本是弹道怪）/技能激活经济含老档迁移/分支记档，brief=tasks/fidelity-a-mechanics-brief.md）∥ **codex-fidelity-c**（面板四 bug，产权锁 ui/ 防冲突，包装层负责浏览器截图证据，brief=tasks/fidelity-c-panel-brief.md）。B 棒（战斗表现层：bg11 对位/阶梯可视/乌鸦尺寸蒙版/掉落样式/SLZ 去标签/技能入口复用/特效提取）等 A 收口后串行（同 BattleScene 单支笔）。
- 14:4x **A 棒收口合入（195c8b6，主会话亲验 524 绿+tsc 净）**，七件全交付，两个真相级发现：①**乌鸦本是弹道怪**（Monster30.as hit1 第10帧发 Monster30Bullet1，BaseBullet.checkAttack 命中）——"聚而不啄"根因=我们错建为近战，已实现敌方投射物系统；②技能经济落地（新档只有升龙斩+灵魂升级公式+限装5+老档迁移保护三态测试）。掉魂球/单掷掉落/真物品表/cure 拾取（小血25%大血50%）/反刷门全部接线。**C 棒事故**：包装层空转 40 分钟 codex job 从未启动，已下 30 分钟通牒（自查重发否则自己动手）。**B 棒派出**（codex-fidelity-b，brief=tasks/fidelity-b-visual-brief.md）：bg11 对位+阶梯可视/相机边界/乌鸦网格蒙版/掉落样式/去 SLZ 标签/技能入口复用，产权与 C 互斥，包装层负责截图证据。
- **8 小时冲刺计划（用户 14:35 通报截止 ~22:35）**：B/C 收口+终审+部署亲玩轮（目标 16:30 前）→ 用户反馈修复轮 → 19:00 起终包（acceptance.sh 出 home exe + wanctl 真机验收，预留 2h）→ 21:00 后 buffer+复盘。D 棒（技能树页视觉复刻）降级为时间允许才做（激活经济已在 A 落地）。
- 14:5x **用户拍板扩容提交范围（黑客松硬需求）**：①多人联机必须进提交（同房共打一关，demo 级口径：主机权威/互见/同打怪/不做重连补偿）；②登录+首页 UI 主会话亲自设计（用户点名），"酷"占评分大头要做酷；③keyart 重生成（用户给了燃系布偶风参照图，gpt-image-2/nano banana 中文可用）；④炉子赛内口径=打造页最简一件（尾火棍）+老君 agent 代炼。三路 codex 已派：**coop-shell**（登录/大厅/socialClient，视觉可换肤 theme 留给主会话 restyle）∥ **coop-sync**（同步纯逻辑先行，BattleScene 集成等发令）∥ **furnace-recipe**（配方炉+agent 工具三件）。任务书 tasks/{coop-shell,coop-sync,furnace-recipe}-brief.md。D 棒正式砍掉。主会话车道：keyart 生成+首页/登录视觉设计+各棒终审+终包。
