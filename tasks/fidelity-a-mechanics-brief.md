# 任务书：保真 A 棒——机制与数值（掉魂/掉落模型/物品表/反刷门/技能经济/聚而不啄）

派发：2026-07-09 主会话 → codex。report 写 `tasks/fidelity-a-mechanics-report.md`。
规格真源（先通读）：`tasks/canon-numbers-report.md`（数值裁决+技能经济机制）、`tasks/economy-archaeology-report.md`（掉落机制§Q2，注意其"无击杀掉魂"结论已被否证）、`tasks/fidelity-r3-backlog.md` A 节、`docs/design/systems-map.md`。AS3 导出在 `tmp/re-level1/mainscripts/scripts/`（只读）。已落库数据：`game/src/data/original/monster-drops.json`（85 怪掉率/掉落表）、`original/equipment.json`（218 物品）。

## 七件事（判据逐条写死）

1. **击杀掉魂接线**（链路已亲验：BaseMonster.as:901 auraRed power=gxp×2 → AuraEvent → RoleInfo.as:520 setLhValue）。①先补数据：逐怪 gxp 从 `export/monster/MonsterN.as` 构造函数提取（可扩展 tools/extract-monster-drops.mjs 或新小脚本，写入 monster-drops.json 每怪 `gxp` 字段，分支同 hp 规则）；②游戏侧：怪死→灵魂球实体（掉落物理可复用 pickup 管线）→拾取加 soulPurse，数值=gxp×2。判据：vitest 断言乌鸦死掉 2 魂、千里眼 20、巨灵神 30（测试名点名 AS3 出处）；灵魂球是可拾取实体而非直接入账。
2. **掉落改原版单掷模型**（BaseMonster.as:1009 fallEquip 语义）：一次总掷 `probability`（isBoss ×1.5）→ 中了从 fallList **随机取一件**。改 dropRoll/spawnDrops 消费 `original/monster-drops.json`（乌鸦 prob=0 不掉、L1 杂兵 0.15、巫鹰 s1l1 分支 prob=1 掉 ptd* 新手装）。旧 drops.json 多条目独立掷模型废除。判据：固定 rng 种子断言单掷语义 + 杂兵 100 次击杀掉落数在 15%±区间；乌鸦永不掉。
3. **L1 物品表按真源重写**：废除自建物品（妖怪残魂/白银矿石/大还丹等），fallList 的 fillName 对 `original/equipment.json` 解析出真物品（名称/品质/类型）；巫鹰新手装 ptd* 在 equipment.json normalEquipment/otherEquipment 里找对应件。**桃子**：`export/cure/{SmallHP,SmallMP,BigHP}.as` 数值逐字（economy-extract-report 四待查①若已给数值直接用），作为即时回血/回蓝拾取物接入（怪掉 cure 的概率分支在 BaseMonster fallEquip 附近，读 AS3 确认再接）。判据：击杀掉落的物品全部能在 equipment.json 或 cure 类中溯源，浏览器背包里名称/品质与真源一致（wrapper 层验）。
4. **反刷经验门**：英雄等级≥10 时 Monster30 exp 记 0（Monster30.as 逐字，阈值用 SWF 的 10 不用攻略的 8）。判据：vitest 两侧断言（9 级有经验/10 级零经验）。
5. **乌鸦聚而不啄根因排查修复**：地面上乌鸦围聚不出手（用户实玩）。排查攻击判定链（出手 roll 通过后 hit 是否因 y/命中盒不重叠恒 miss；悬停高度 vs 英雄命中盒）。对 AS3（Monster30 攻击=发 Monster30Bullet1 子弹！读 setAction/attack 相关——它可能根本是远程弹道怪，近战贴脸打空是符合原版的，如是则实现其子弹攻击）。判据：固定种子下乌鸦在射程内对英雄产生真实伤害事件；结论（近战 vs 弹道）写 report 带 AS3 引用。
6. **技能激活经济**：废默认白送 5 技能（createDefaultSkillTreeState 演示态）；改为初始仅第一个技能（对 SkillControl.as 初始态，读 AS3 确认初始解锁集）；升级消耗 `150·sl²·√sl` 灵魂（SkillControl.as:106/314）；主动技能限装 5（Y/U/I/O/L 坞位）。技能书/孟婆药剂本棒不做（记 report 后续项）。**存档迁移**：老档已白送的技能保持可用（save 版本迁移写清楚），别把用户档打回零。判据：新档只有初始技能可用；升级扣魂数值对公式；老档迁移测试。
7. **逐怪 stage 分支记档**（不改码）：千里眼/顺风耳/巨灵神 s3l3/s8 复用为 20000 血杂兵的双分支，在 monster-drops.json/report 里标注留给 L2+。

## 边界

产权：`game/src/systems/`（dropRoll/pickup/level/skillTree/soulPurse/monsterSim/consumables 等）、`game/src/scenes/BattleScene.ts`、`game/src/scenes/SkillTreeScene.ts`、`game/src/data/`（drops.json/levels/monsterExp.ts/original/monster-drops.json 的 gxp 字段）、`game/tests/`、`tools/`（提取脚本扩展）、本 report。
**不许动**：`game/src/ui/`（C 棒产权）、net/、agent-server/。
禁止 npm install/联网/起 dev server；vitest 用 `game/node_modules/.bin/vitest`。全量回归必须绿（现基线 511 过/1 跳过 + tsc 干净）。commit 只 add 产权文件不 push；沙箱 git 失败则文件清单写 report 由包装层验证后提交（包装层必须先亲跑全量 vitest+tsc 再 commit）。
每完成一件立即 commit（BattleScene 是高流量文件，改动即刻提交防收编事故）。
