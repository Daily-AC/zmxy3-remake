# 再续西游 系统图谱（systems-map）

2026-07-09 主会话整理。目的：把整个游戏的子系统依赖关系、每个节点的数值真源状态、闭环缺口一次理清，作为后续派工的总蓝图。派任何涉及数值/机制的棒之前先看本图，避免"修一个节点撑爆邻居"。

**真源优先级协议（用户 2026-07-09 确认：无官方内部数据可拿）**：
1. 原版主 SWF 反编译 AS3（唯一权威）
2. 上游仓库（kagami 移植源 / XinTianyu-Sky ZMXY 数值 JSON）——二手源，有占位符前科，用前对 AS3 抽验
3. 挖不到的，参考同类横版 ARPG 通行做法自创，**必须标注 invented + 设计判据**（可闭环、自洽、服务"像小时候"体感）

节点状态图例：🟢 AS3 逐字恢复｜🟡 适配/自建（有意为之或待升级）｜🔴 缺失（闭环漏洞）

## 一、总图

```mermaid
flowchart TB
  subgraph COMBAT[战斗循环]
    INPUT[输入] --> HSIM[heroSim<br/>位移/跳跃/连击 🟢]
    HSIM --> DMG[伤害结算<br/>skillDamageReal+hitbox 🟢]
    DMG --> MSIM[monsterSim<br/>怪物HP/AI 🟡]
    MSIM -->|死亡| KILL[击杀事件]
    MSIM -->|攻击| HCOMBAT[heroCombat<br/>受伤/i-frame/死亡/复活 🟢]
    HCOMBAT --> HID[HeroIdentity<br/>hp/mp/atk/def/level/exp]
    SKILL[heroSkill+mp<br/>技能/耗蓝 🟢] --> DMG
  end

  subgraph GROWTH[成长循环]
    KILL -->|monsterExp| PROG[progression<br/>等级/经验曲线 🟢部分]
    PROG --> HID
    STREE[skillTree<br/>9主动+被动 🟢] --> SKILL
    EQUIP[equipment 穿脱 🟢] --> FX[effects<br/>属性加成+onHit 🟡]
    FX --> HID
    CONSUM[consumables<br/>HP/MP药 🟢] --> HID
    REGEN[自然回血回蓝 🔴考古中] -.-> HID
  end

  subgraph ECONOMY[经济循环]
    KILL -->|dropRoll×drops.json 🟢L2/🟡L1| DROPS[掉落物<br/>装备+强化石]
    DROPS --> PICKUP[pickup 拾取 🟡y盲修复中] --> INV[inventory 背包 🟢]
    INV -->|卖装备 getValue 🔴接线<br/>卖白装+20 🟢| SOUL[soulPurse 灵魂 🟢]
    SOUL -->|升级消耗 🟢| STREE
    SOUL -->|强化/打造/熔炼/分解消耗 🔴| FURNACE
    INV --> FURNACE[炼丹炉四页 🔴重构中<br/>强化/熔炼/打造/分解<br/>配方已逐字恢复] --> INV
    INV --> EQUIP
    EQTABLE[装备全表 218 件<br/>AllEquipment 🟡提取中] -.-> DROPS
    EQTABLE -.-> FURNACE
    SHOP[商店 🔴置灰] -.-> INV
  end

  subgraph META[元游戏层]
    WMAP[世界地图+campaignProgress 🟢] --> LEVEL[level 关卡/波次 🟡L1重建中]
    LEVEL --> COMBAT
    SAVE[save/saveSlots 🟢] -.持久化.- HID
    SAVE -.- INV
    SAVE -.- SOUL
    SAVE -.- STREE
  end

  subgraph AGENT[Agent NPC 层（差异化）]
    LAOJUN[老君对话<br/>agent-server 🟢上线] --> FURNACE
    OPERATOR[规则内代理操作 🔴新拍板<br/>代炼/批量打造/强化] --> FURNACE
  end
```

三个循环咬合成飞轮：**打怪（战斗）→ 掉落+经验+灵魂（经济进项）→ 装备/技能/等级（成长）→ 打更强的怪**。装备是经济与成长的咬合齿；灵魂是技能线的咬合齿；关卡难度墙是飞轮的阻尼。

## 二、节点状态账（按循环分组）

### 战斗循环
| 节点 | 模块 | 状态 | 备注/缺口 |
|---|---|---|---|
| 英雄物理/连招 | heroSim/jump/combo/locomotion | 🟢 | tick=33.3ms、连击窗对 kagami 文档；平台碰撞 climb-engine 在建 |
| 伤害公式 | skillDamageReal/hitbox/effects | 🟢 | 技能公式对 AS3（曾纠正 kagami 6.6x 偏差）；命中盒真 cell 等比（73cbf72） |
| 怪物 AI/数值 | monsterSim/monsterBehaviors + data/monsters + levels | 🟡 | L1/L2 数值 🟢逐字；AI 是综合重写（原版散在各 MonsterN.as）；**y 盲索敌/攻击 + 杂兵不出手排查中（climb-engine 扩单）** |
| 英雄受伤/死亡 | heroCombat/heroSurvivability | 🟢 | 复活 1500ms 为原创记档；怪物攻击力已真实化（min60 封顶已删） |
| Boss 专属机制 | — | 🔴 | 巫鹰 hit2 已做；L2 天王弹幕/机制未做，逐个啃 |

### 成长循环
| 节点 | 模块 | 状态 | 备注/缺口 |
|---|---|---|---|
| 等级/经验 | progression + monsterExp | 🟢部分 | Role1/2 曲线对 AS3 逐字；Role3/4 是 kagami 改动值，放开多角色前必须重验（audit-numbers-report） |
| 属性成长 | heroIdentity/heroGrowth/roleData | 🟢 | 挂靠统一 HeroIdentityState |
| 技能树 | skillTree/heroSkill/mp | 🟢 | 9 主动+嗜血被动已移植；被动页占位；UI 素面板待生图皮 |
| 药品 | consumables | 🟢 | SmallHP/BigHP 公式对 backpack1.swf；**获取渠道单一（掉落），原版商店渠道缺** |
| 自然回复 | — | 🔴 | 原版是否有站立回蓝/回血未考古（economy-archaeology 在查） |

### 经济循环
| 节点 | 模块 | 状态 | 备注/缺口 |
|---|---|---|---|
| 掉落 | dropRoll + drops.json | L2 🟢 / L1 🟡 | L2 对 fallEquip() 概率逐字；L1 材料名自建。**考古更正：原版怪只掉装备+1 级强化石**（fallList/fallStone），材料靠分解装备产出——配方制重构时 L1 表按此重审 |
| 灵魂钱包 | soulPurse | 🟢 | 卖白装+20 逐字；技能升级消耗接通并持久化 |
| **灵魂进项** | — | 🔴 接线 | **二次更正（2026-07-09 canon-numbers + 主会话逐字亲验）：击杀掉魂存在**——BaseMonster 死亡刷 auraRed 灵魂球（power=gxp×2）→ AuraEvent → RoleInfo.addWarriors setLhValue（乌鸦 2 魂/千里眼顺风耳 20/巨灵神 30）。economy-archaeology Q2 判"无击杀掉魂"系漏挖 dropAura 链，作废。完整进项 = 击杀灵魂球 + 卖单件装备（getValue，赋值来源待查）+ 卖白装 + 任务奖励 + 洗技能返还 |
| **炼丹炉** | furnace + agent-server | 🔴 重构 | 2026-07-09 用户拍板翻案：**按原版复刻**。考古已交付全部数据（tasks/economy-archaeology-report.md）：四页结构（强化/熔炼/打造/分解）+ 38 条打造配方逐字 + 强化成功率/消耗二维表 + 熔炼配方 + 分解产出表。"预算-clamp 自由生成"降级为技术储备；agent=规则内代理操作 |
| **装备池** | items（4 自建件） | 🟡 提取中 | AllEquipment.as 全表 218 件（67 真装备+120 物品+10 法宝+12 时装+9 白装），schema 完整、机械提取难度低，codex-econ-extract 在跑 |
| 拾取 | pickup | 🟡 | y 盲已实锤（BattleScene:2385 写死 GROUND_Y），climb-engine 修复中 |
| 商店 | — | 🔴 | 世界地图入口置灰。赛内不做除非用户翻案；但药品获取渠道依赖它，需拍板替代（掉落加权/老君兑换） |

### 元游戏 + Agent 层
| 节点 | 模块 | 状态 | 备注/缺口 |
|---|---|---|---|
| 关卡链 | level + campaignProgress + WorldMapScene | 🟡 | L1 空间结构重建在途（爬塔/卷轴/持续刷怪）；L2 结构待同管线复检（sl21-23 走廊化风险同族） |
| 存档 | save/saveSlots | 🟢 | v1 版本化+迁移；6 槽 bug 已修 |
| NPC 对话 | agent-server（老君, DeepSeek） | 🟢 | home 24h 在线，引用战斗事件 |
| **agent 代理操作** | — | 🔴 新拍板 | 用户定义：agent 在游戏规则内替玩家操作——背包够料自动配方合成、批量打造/强化。前置依赖：配方制炼丹炉 + 装备表 |
| 联机 | social-server | 冻结 | 后端上线（P95=21ms），游戏侧 UI 用户拍板后靠 |

## 三、闭环判定与补洞排序

**当前判定：技术闭环成立，经济闭环有两个断点。** 玩家能从选人一路玩到通关存档；但①灵魂进项瘸（**考古更正：原版本就无击杀掉魂，正确补法是"卖单件装备换灵魂"接线 + 怪物按 fallList 掉真装备**）；②装备线天花板极低（4 自建件，全表提取在途）——成长循环的"装备服务属性"这根齿条实际咬不上力。

补洞顺序（依赖倒排，考古已完成 → 见 tasks/economy-archaeology-report.md）：
1. ~~考古三问~~ ✅（2026-07-09 交付：配方全逐字/无击杀掉魂否证/装备表 schema）
2. **数据机械提取**（在途 codex-econ-extract）：装备全表 218 件 + 逐怪 fallList/掉率 → game/src/data/original/*.json；顺带四待查（药品数值/卖价来源/玉衡石天枢石渠道/制作书 fill 冲突）
3. **炼丹炉四页重构**：furnace.ts 改配方模型（打造 38 配方+宝石附魔/强化成功率表+降级规则/熔炼/分解），UI 照 StrengthEquipment 四页结构；agent 改代理操作接口（列配方、查料、代炼、批量强化循环）
4. **灵魂进项接线**：卖单件装备（等 value 来源考据）+ 怪物掉落改 fallList 制（装备+强化石）
5. **L1 掉落表对表重审**（自建材料名替换为真源材料体系：丝绸/玄铁/檀木经分解产出）
6. 商店替代渠道拍板（药品进项；原版商城是充值微支付，不吃灵魂——赛内替代方案到时问用户）

## 四、维护约定

- 本图谱是活文档：任何棒改变节点状态（🔴→🟢 等）时，验收合入的同时更新本表对应行。
- 新增系统（宠物/法宝/多角色/怒气，赛后路线图）入图时先画依赖边再动工。
