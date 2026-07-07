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
- port-progression → 移植 SaveSystem → systems/save.ts（未完成）
- port-hero-damage → 移植 LevelSystem → systems/level.ts（2 关 + 难度墙，未完成）

**已移植完成、已合入 remote（纯逻辑在 repo，但都还没接进 BattleScene）**：
- systems/progression.ts（等级/经验，359672f）、systems/heroCombat.ts（受伤/死亡/i-frame/原创复活 1500ms）
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

### 赛后路线图（终包后）
- 关卡流水线：16 个同构关卡包可多 agent 并行移植（导包→抠怪物动作表→接波次→对 kagami 文档验数值）；每关 Boss 专属机制（HP_REJECT/弹幕MC）是硬骨头逐个啃。
- 功能线（独立于关卡）：多角色（唐僧/八戒/沙僧动作表已备）、宠物、法宝、技能树。
- 沉淀移植 skill 到 ~/.agents/skills/：FFDec命令族+动作表抠取+JSON schema+验收清单+Boss机制排查路径，让任意 session 冷启动接一关。
- 打包正规化：electron spike → Tauri 终选；home 屏幕呈现问题（UU虚拟显示 vs Chromium合成）待物理到场验证。

### 下一步
- [ ] 批量导出：四角色 + Music.swf 音频 + 第 1 关场景包（按 asset-pipeline-notes.md 策略）
- [ ] 动作节奏换算：setFrameStopCount → Phaser 帧 duration（先悟空 14 个 hit）
- [ ] 里程碑 2 切片：地面/物理、连击输入缓冲、第一只怪（Monster30）、掉落
- [ ] 打包 spike：Pake 对本地静态文件 + sidecar 支持实测
