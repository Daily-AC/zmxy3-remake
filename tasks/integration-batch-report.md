# 集成批次报告 — HeroIdentityState + 移植系统接进 BattleScene

## 概述
把 `heroCombat` / `progression` / `equipment+effects` 三个已合入的纯逻辑系统，通过统一的
`HeroIdentityState` 宿主真正接进 `game/src/scenes/BattleScene.ts`。现在游戏里能看到：悟空会被
怪打死、倒地、1500ms 后原地复活；杀怪掉经验、跨阈值升级并数值成长；穿武器后手里出现金箍棒、攻
击力进伤害、onHit 吸血/灼烧/冰冻结算、面板显示当前攻击。

## 做了什么

### 1. 新纯逻辑模块 `game/src/systems/heroIdentity.ts`（+ 单测）
统一英雄身份宿主，三个系统挂靠在同一个对象上，避免三份状态各自漂移：
- `progression` 拥有 level/exp 和每级数值曲线（maxHp/maxMp/atk/def）。
- `heroCombat` 拥有实时 hp、hurt/death 状态机、无敌帧、复活。
- `equipment` + `effects` 在等级曲线之上叠加 atk/def（及其它 stat）加成。
- **不变式**：等级曲线驱动 combat 的 maxHp。`createHeroIdentity` 用 `getLevelStats` 播种
  `combat.maxHp`（覆盖 heroCombat 自带的 120 默认池）；`gainHeroExp` 升级时把 maxHp/maxMp 上移
  到新等级曲线，并把成长量当作一次部分治疗补到当前值（对标 kagami 战斗中即时升级）。死亡的悟空不
  在升级时回血，复活时才补满。
- 完全不碰 `heroSim.ts` 的 HeroState（位移/连招），二者在场景里并排组合；HeroState 作为
  `HeroPosition` 传给击退逻辑。
- 对外只加不改：新模块 + 新测试，未改动任何已测系统模块的接口。

### 2. BattleScene 接线
- **受伤/死亡/复活**：怪 `attack-start` 事件 → `monsterHitsHero()`：先扣 `heroTotalDef`（伤害
  `max(1, MONSTER_ATTACK_DMG - def)`），再走 `damageHero`（无敌帧/死亡/复活都在 combat 模型里决
  定）。每帧 `updateHeroIdentity` 做 hurt 超时、无敌帧到期、击退积分、到点自动复活（复活位在
  `HERO_START_X`，避开怪）。死亡时禁用输入（`collectEdges` 返回 NO_EDGES）。
- **渲染**：死亡 = 保持 hurt 帧 + 旋转 90° 倒地 + 灰化（每帧重刷，防瞬时 tint 清掉）；无敌帧闪烁
  （alpha 交替）；武器叠加层同步角度/alpha。role1 没有专门死亡帧，故用 hurt 姿势旋转表现「倒地」。
- **升级**：怪 `death` 事件 → `awardKillExp`：`gainHeroExp(MONSTER30_KILL_EXP)` + 飘 `+80 EXP` +
  升级时 `升级！Lv.x` toast + 金光闪。
- **装备闭环**：连招伤害 = `STAGE_DAMAGE[stage] + heroTotalAtk(identity, equipment)`（等级 atk 与
  装备 atk 都进伤害）；命中首帧飘伤害数字；金箍棒叠加层（`role1_equip0`）在武器装备时可见；
  `rollOnHitProcs` 吸血回补 `identity.combat.hp`；面板显示 Lv/EXP/HP/攻击/武器。
- **调试/验收钩子**：`__worldState` 增加 level/exp/hp/maxHp/dead/atk/def；新增 `__damageHero`
  `__killHero`（清无敌帧确保必中）`__killHeroSticky`（挂起自动复活以便截图定格死亡帧）
  `__respawnHero` `__gainExp`；`__setHeroHp` 改为写 `identity.combat.hp`。

## 参数出处
| 参数 | 值 | 出处 |
|---|---|---|
| 等级曲线 maxHp/maxMp/atk/def、expToNext | — | kagami ProgressionSystem 逐字移植（progression.ts） |
| 受击/无敌帧/受击条/复活延迟(1500ms) | — | heroCombat.ts（kagami 文档值 + 复活为原创，见其头注） |
| `MONSTER_ATTACK_DMG` | 14 | **TODO-verify**：kagami Monster30 是远程子弹怪，无近战伤害值；调到让 1 级悟空（80hp）能挨几下 |
| `MONSTER30_KILL_EXP` | 80 | **TODO-verify**：怪 JSON 无 exp 字段；调到约 2 杀过 1 级（需 135） |
| `STAGE_DAMAGE` | [0,30,30,35,45,60] | 沿用现有场景常量（原本就标 TODO-verify） |
| `HERO_ID` | 1 | 悟空 = kagami 英雄曲线 #1 |

## 验收判据逐条

1. **`npx vitest run` 全绿**：✅ 195 passed（含新增 `tests/heroIdentity.test.ts` 7 个；基线 126
   仍全绿；其余为并行 agent 新增，均绿）。
2. **浏览器真实验证**（vite dev + playwright MCP + `window.__*` 钩子），截图落
   `game/tmp/debug-shots/`：
   - `01-baseline.png`：Lv.1 EXP 0/135、HP/80、攻击 10（全部来自等级曲线）。
   - `02-hero-dead.png`：✅ HP 0/80，血条空，悟空灰化+倒地。
   - `03-hero-respawn.png`：✅ 复活后直立、血条从 0 回填。（`__worldState` 佐证 dead:true→false、
     state dead→ready、hp 归满）
   - `04-weapon-equipped.png` / `05-weapon-hit-number.png`：✅ 手里出现金箍棒，面板攻击 10→55，
     武器：赤炎噬血杖。
   - `06-level-up.png`：✅ Lv.2、EXP 25/145、HP .../130（maxHp 80→130）、攻击 60（基础 atk
     10→15 + 装备 45），背包有击杀掉落（妖怪残魂×2、白银矿石×1）。
   - **数值链路数字化实证**：空手 hit1 让怪 150→113（30+10-3def=37）；装备后 hit1 一击把怪
     打死（30+55-3=82，两下 >150hp）；杀怪 exp 0→80、掉落进背包；再补一杀经验跨 135 → Lv.2。
     即「atk 进伤害 / 杀怪涨经验 / 升级成长」全链路真实跑通。
3. 本报告：✅

## 遗留问题
- **飘字伤害数字未能在截图里定格**：命中首帧会飘 `-伤害` 黄字（代码在命中去重块内，已验证命中真实
  扣血），但飘字生命周期 700ms、上浮渐隐，而 playwright 截图往返有数百毫秒延迟，实测无法稳定抓到某
  一帧的数字。机制本身经数值实证（空手 37 / 装备 82）与面板 atk（10→55→60）已充分证明「伤害变高」；
  仅「屏幕上冻住一个数字」这一视觉受工具时序限制未拿到，非机制问题。
- **`npx tsc --noEmit` 有 1 处报错，在 `src/systems/saveSlots.ts:125`**（`Record<string,unknown>`
  转 `SlotMeta` 的 cast），该文件是并行 agent 的在建文件，不在我的改动范围（我只加了
  heroIdentity.ts，与 BattleScene.ts、heroIdentity.test.ts 均通过 tsc）。未触碰，转交对应 agent。
  vitest 不做类型检查故 195 全绿；但 `npm run build`（含 tsc）会被此文件卡住，需该 agent 修复。
- `MONSTER_ATTACK_DMG` / `MONSTER30_KILL_EXP` 为 demo 手调值（见上表 TODO-verify），等波次/数值数据
  接入（下一棒 level.ts）时应改从怪物数据读。
- 死亡表现用 hurt 帧旋转代替，role1 无专门死亡帧；后续有更好素材可替换。
- 场景内新增的调试杀敌/复活/加经验钩子（`__killHeroSticky` 等）为验收用途，量产前可清理。
