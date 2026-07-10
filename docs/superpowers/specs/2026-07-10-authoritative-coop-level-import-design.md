# 再续西游：权威联机、原版关卡导入与战斗修复设计

日期：2026-07-10

状态：用户已批准总体方向；本规格等待最终文字审阅。

## 1. 目标

本轮工作解决四类已经相互影响的问题：

1. 战斗表现和输入存在可复现缺陷，包括 Boss 血条遮挡 MP、队友名牌悬空、按键越快攻速越快、空中不能普攻、攻击特效与武器错位、怪物近身攻击漏判和无限受击硬直。
2. 第一章关卡结构错误。原版 `sl11`、`sl12`、`sl13` 是 `stage=1` 下三个独立关卡，当前代码将其合并为一关，并把第二章错误映射到世界地图节点 `s1_2`。
3. 联机没有共享的战斗真源。各客户端分别生成关卡、怪物和掉落，房主快照只做事后覆盖，导致出怪分叉、队员不能稳定命中、掉落和奖励无法仲裁。
4. 原始装备与掉落数据已提取，但掉落装备没有统一转换成完整运行时属性；房间大厅、分享、断线重连、局内地图和可靠自动保存也未形成完整闭环。

最终结果必须满足：代码和编译产物是进度真源；同一个原版数据只存在一个运行时解释入口；单机和联机复用同一套战斗世界状态与关卡数据。

## 2. 已确认的产品规则

- Boss 血条采用 A 方案：组件保持画布水平居中，纵向放在左侧角色 HUD 下方，不再通过右移躲避遮挡。
- 队友名牌采用可见内容锚点：位置为当前动画可见顶边上方 10px，不使用固定 `py - 118`。
- 联机采用可迁移的房主权威模拟。服务端负责房间成员、权威租约和消息转发，不在本轮运行完整战斗模拟。
- 房主异常断线后全局暂停最多 60 秒。房主在期限内重连则原位继续；超时后由最早加入且在线的队员接管权威。
- 手动退出立即离开房间，不进入断线保留状态。再次进入必须重新加入新房间或仍处于等待状态的房间。
- 世界掉落物由实际拾取者获得。经验和灵魂按每个玩家对该怪物造成的有效伤害比例分配。
- `sl11`、`sl12`、`sl13` 恢复为世界地图上三个独立关卡。
- 缺失图片优先从 SWF 导出；确认无法导出时才生成风格匹配的替代图片，并在资源清单标注 `generated`。

## 3. 方案选择

### 3.1 联机权威模型

采用房主权威模拟，不继续使用“各端独立模拟后补快照”的模型，也暂不把完整模拟搬到 social-server。

房主是以下状态的唯一写入者：

- 关卡时钟、随机数状态、关卡阶段和触发器；
- 所有英雄的确认态；
- 怪物、投射物、场景机关和传送门；
- 掉落物生成、运动、领取状态；
- 命中、伤害、死亡、经验、灵魂和装备结算；
- 权威快照的 tick、epoch 和校验摘要。

队员客户端只发送带序号的输入帧和菜单命令。客户端可以预测本地英雄移动和攻击动画，但不能直接修改权威怪物 HP、生成掉落或领取奖励。

### 3.2 原版关卡导入

采用编译管线，不继续手写每个关卡的波次和坐标。

编译器组合三类真源：

- FFDec `swf2xml`：场景树、矩阵、实例名、碰撞标记、StopPoint、MonsterAppearPoint 和传送门位置；
- 反编译 AS3：实例属性、怪物编号、数量、延迟、间隔、随机规则、Boss 标志和特殊监听器行为；
- 导出位图/动画：背景、场景对象、怪物、攻击特效和 UI 资源。

编译结果是可审查、可测试的 `LevelPrefab` JSON。运行时只消费 JSON 和少量显式机制插件，不直接解析 AS3 或 SWF。

## 4. 关卡数据契约

每个原版关卡单独生成一个 `LevelPrefab`：

```ts
interface LevelPrefab {
  id: string
  source: {
    stage: number
    level: number
    sceneClass: string
    listenerClass: string
    sourceSwf: string
  }
  bounds: Rect
  heroSpawns: Point[]
  backgrounds: SceneAssetPlacement[]
  walls: WallSpec[]
  stopPoints: StopPointSpec[]
  spawners: MonsterSpawnerSpec[]
  transferDoors: TransferDoorSpec[]
  scriptedObjects: ScriptedObjectSpec[]
  requiredSpecies: string[]
  requiredAssets: string[]
  mechanismPlugin?: string
}
```

`MonsterSpawnerSpec` 保存原版实例的 `enemyType`、`stopPointIdx`、`delay`、`interval`、`totalNum`、`isRandom` 和原始场景坐标。稳定实体 ID 使用：

```text
<levelId>:<spawnerInstanceId>:<spawnOrdinal>
```

这样单机、房主、队员和重连快照对同一怪物使用同一 ID，不再依赖各端创建顺序。

第一章恢复为：

- `stage-1-level-1`：`sl11`，爬塔、Monster30 蜂群、巫鹰；
- `stage-1-level-2`：`sl12`，五个原生 StopPoint、原生 MonsterAppearPoint 波次、破障副本门、千里眼与顺风耳；
- `stage-1-level-3`：`sl13`，五个原生 StopPoint、原生波次、巨灵神。

世界地图 `s1_1/s1_2/s1_3` 分别进入这三关。当前整合后的第二章数据后移到 `s2_1`，不再占用 `s1_2`。

特殊行为不塞入通用 JSON 表达式。`sl11` 的垂直镜头和刷怪、`sl12` 的破障门等通过命名插件实现；插件只能读取 `LevelPrefab` 和修改 `BattleWorldState`，不能在 BattleScene 中另建一套关卡状态。

## 5. 可序列化战斗世界

从 BattleScene 中抽出 Phaser 无关的 `BattleWorldState`：

```ts
interface BattleWorldState {
  protocolVersion: number
  authorityEpoch: number
  tick: number
  rngState: number
  level: LevelRuntimeState
  heroes: Record<string, HeroRuntimeState>
  monsters: Record<string, MonsterRuntimeState>
  projectiles: Record<string, ProjectileRuntimeState>
  drops: Record<string, DropRuntimeState>
  damageLedgers: Record<string, Record<string, number>>
  pendingRewards: Record<string, RewardGrant[]>
}
```

单机模式使用本地权威驱动同一状态；联机模式由房主驱动。Phaser 场景只负责收集输入、调用模拟、渲染确认态和本地预测态。

所有随机行为从 `rngState` 获取，包括刷怪随机位置、怪物技能选择、掉落掷骰和装备附加属性。禁止联机战斗路径直接调用 `Math.random()`。

## 6. 联机协议

### 6.1 输入和状态

队员以 20Hz 发送 `input_frame`：

```ts
interface InputFrame {
  userId: string
  seq: number
  clientTick: number
  held: { left: boolean; right: boolean }
  pressed: { jump: boolean; attack: boolean; skills: string[] }
}
```

房主以 10Hz 广播增量快照，以 2 秒一次广播完整迁移检查点。快照包含 `authorityEpoch` 和 `tick`；接收端丢弃旧 epoch 或旧 tick。

本地英雄使用预测与确认态回滚：小误差平滑收敛，大误差立即纠正。远端英雄、怪物和投射物使用 120ms 插值缓冲。

### 6.2 命中与结算

客户端不再发送自己计算出的伤害值。攻击、技能和移动都由输入帧表达；房主根据权威位置、动作帧、装备和命中盒计算伤害。

房主广播可靠事件：

- `combat_hit`
- `entity_died`
- `drop_spawned`
- `drop_claimed`
- `reward_granted`
- `level_transition`
- `authority_paused`
- `authority_resumed`
- `authority_migrated`

事件都带全局 `eventId`，客户端持久化已处理水位，保证重连重放不重复加物品或经验。

### 6.3 断线与房主迁移

服务端把“房间成员”和“在线连接”分开：

- WebSocket 异常关闭：成员标记为 `disconnected`，保留 60 秒；
- 客户端发送 `leave` 或 REST leave：立即删除成员；
- 房主异常断线：服务端发 `authority_paused`，所有客户端停止世界 tick，但 UI、聊天和重连提示继续；
- 房主期限内回来：沿用原 `authorityEpoch`，从最后检查点继续；
- 60 秒超时：服务端按加入顺序选最早在线成员，递增 `authorityEpoch`，发 `authority_granted`；新房主从本地缓存的最新完整检查点恢复并广播摘要；
- 旧房主晚到：以普通队员身份接收新 epoch，不得恢复旧权威状态。

每个客户端都缓存最近三个完整检查点。检查点带 tick、epoch 和内容哈希；迁移时若候选房主缺少最新检查点，向其他在线队员请求同 tick 检查点后再恢复。

## 7. 掉落、经验和灵魂

怪物承受的有效伤害记入 `damageLedgers[monsterId][userId]`。有效伤害取本次结算值与怪物剩余 HP 的较小值，避免过量伤害放大奖励比例。

怪物死亡时：

- 经验和灵魂总量只计算一次；
- 只给造成过有效伤害的玩家分配；
- 使用最大余数法取整，确保所有玩家整数奖励之和严格等于原总量；
- 断线保留期内的玩家继续获得其已贡献伤害对应的奖励，奖励进入 `pendingRewards`；
- 手动退出前已经造成的伤害仍参与该怪物最终结算，避免退出瞬间吞掉已完成贡献。

装备、材料和药品作为共享世界掉落实体。房主按权威 tick 判断第一个进入拾取范围的玩家，并广播 `drop_claimed`。同一个 `dropId` 只能成功领取一次。

灵魂和经验不作为可争抢掉落物；可以在各客户端播放仅自己可见的吸收动画，但数值来源必须是房主的 `reward_granted`。

## 8. 装备与原始数据

新增唯一的原版装备转换入口，将 `original/equipment.json` 的原始字段转换为运行时 `Item`：

```ts
originalEquipmentToRuntimeItem(fillName, rng): Item
```

怪物掉落、炼丹炉打造、调试发放和存档迁移都复用该函数。转换包括 HP、MP、攻击、防御、暴击、闪避、吸血、魔防、需求等级、品质和强化数据；不允许掉落路径只保存名称和品质而丢失属性。

掉落图标按 `fillName` 解析原始资源。确认资源包中不存在对应图标时，生成替代图并写入资源清单：

```json
{ "source": "generated", "reason": "not present in unpacked SWF" }
```

## 9. 战斗与 HUD 修复

### 9.1 固定步长输入

删除“检测到输入边沿就额外推进一个 33ms tick”的行为。输入边沿进入待处理缓冲，只在真实累计时间达到固定 tick 时消费。快速敲击只能增加待处理输入，不能加速模拟时钟或攻击动画。

同一攻击动作期间的新攻击按键继续丢弃，不缓存成下一击，保持现有 AS3 输入语义。

### 9.2 空中攻击

空中允许普攻。攻击动作不重置垂直速度、重力或水平惯性；攻击期间仍继续跳跃物理。空中攻击使用独立动作状态，不进入地面五段连招。当前攻击结束后仍在空中时可以再次攻击，但按键不能缩短动作时长。

### 9.3 命中与怪物反击

英雄和怪物攻击统一使用数据化 `AttackSpec`：

```ts
interface AttackSpec {
  action: string
  hitFrame: number
  hitbox: Rect
  visualEffect?: VisualAttachmentSpec
  damage: DamageSpec
  knockback: KnockbackSpec
}
```

命中盒和攻击特效引用同一局部坐标和朝向变换。怪物近战不再使用“距离加 facing side”单点条件，而是用攻击帧的世界命中盒与英雄受击盒求交。

杂兵连续四次受击硬直后进入 1200ms 霸体反击窗口；Boss 连续六次后进入相同窗口。窗口内仍承受伤害，但不重新进入 hurt，也不会重置当前攻击。连续 2000ms 未受击则计数清零。这是对当前简化动作系统的明确适配，替代原版 20 至 24 次保护阈值造成的无限硬直体验。

### 9.4 特效与视觉锚点

特效资源编译器保留 SWF 符号原点、递归 bounds 和 AS3 创建位置。`VisualAttachmentSpec` 定义：

- 锚点实体或目标；
- 面向相关的局部 X 偏移；
- 局部 Y 偏移；
- 原始 symbol pivot；
- 跟随或一次性生成；
- 帧率、帧数和原始缩放。

BattleScene 不再为每张图写临时偏移。英雄武器、英雄攻击特效和怪物攻击特效都走同一变换函数。

### 9.5 HUD A 方案

Boss 条 X 永远是逻辑画布中心。Y 由角色 HUD 的实际底边加 12px 得出，而不是固定到会穿过 MP 条的位置。组件内部名称牌和血条整体参与居中计算。

队友名牌使用角色动画帧的可见顶边，向上留 10px。名字、等级圈和蓝条作为一个整体布局，不分别使用世界常数。

局内地图放在右上角，显示关卡横向或纵向边界、自身、队友和当前传送目标。默认不显示全部怪物和掉落，避免代替探索与战斗观察。

### 9.6 背景生命周期

每个 LevelPrefab 声明完整 `requiredAssets`。进入关卡前必须等待这些资源加载完成，再原子切换背景层；旧背景只能在新背景容器建立成功后销毁。

背景裁切、帧选择和缩放只能作用于该关卡自己的 Image/TileSprite 实例，不能修改共享 Texture 或复用前一关残留的 frame/crop 状态。场景重进、窗口尺寸变化和 WebGL context restore 都从当前 LevelRuntimeState 重建完整背景层，不依赖旧显示对象仍然存活。

## 10. 房间大厅与分享

social-server 增加等待房间列表接口，返回房间 ID、关卡、房主、人数、容量和创建时间。大厅支持刷新、按关卡筛选、直接加入和继续使用房间 ID 加入。

分享按钮优先调用 Web Share API，内容包含房间号和带 `room` 查询参数的游戏链接；不支持 Web Share 时复制链接并显示成功提示。分享链接打开后只预填房间并展示确认，不自动加入。

房间成员状态显示 `ready`、`connected`、`disconnected` 和重连剩余时间。手动退出按钮在大厅和局内暂停菜单都可用，确认后发送显式 `leave` 并回到大厅。

## 11. 自动保存

保留现有事件驱动保存，并增加：

- 每 30 秒保存一次个人存档；
- `visibilitychange` 进入 hidden 时保存；
- `pagehide` 时保存；
- 关卡完成、奖励确认、装备变化、技能变化和手动退出时立即保存；
- 高频事件使用 500ms 防抖合并写入。

联机中只有收到房主 `reward_granted` 或 `drop_claimed` 后才写入个人成长存档。客户端预测状态不进入持久化。

## 12. 错误处理

- 协议版本不兼容时拒绝进入战斗并返回大厅，不能静默降级到各端独立模拟。
- LevelPrefab 缺少必需资源或引用未知怪物时，编译失败；不在运行时生成占位波次。
- 权威快照校验失败时暂停客户端并请求完整检查点，不继续应用增量。
- 掉落和奖励事件必须幂等；重复 `eventId` 只确认，不重复发放。
- 房主迁移没有可用完整检查点时结束本局并保留已经确认的个人奖励，不尝试从不完整状态继续。

## 13. 验证策略

### 13.1 纯逻辑测试

- 固定步长输入在不同键盘频率和渲染帧率下产生相同攻击时长；
- 空中攻击不改变垂直速度和落地时间；
- 四击/六击硬直保护和 1200ms 反击窗口；
- AttackSpec 的视觉变换与命中盒变换一致；
- 伤害比例、过量伤害截断和最大余数分配；
- 掉落只允许一个领取者；
- authority epoch、旧快照丢弃和事件幂等；
- 60 秒重连、超时选主和旧房主回归；
- 原始装备的掉落与炼丹炉转换结果一致。

### 13.2 编译器测试

- `sl12` 编译出 5 个 StopPoint 和 13 个 MonsterAppearPoint；
- `sl13` 编译出 5 个 StopPoint 和 14 个 MonsterAppearPoint；
- 每个 spawner 的编号、数量、延迟、间隔、stopPointIdx 和坐标与 AS3/XML 黄金数据一致；
- 所有必需资源存在，缺失资源有明确来源报告；
- 同一输入重复编译产生字节级稳定 JSON。

### 13.3 浏览器和真实服务端测试

- 两个独立浏览器上下文连接真实 social-server，看到完全一致的怪物 ID、波次、HP、掉落和关卡状态；
- 非房主可以正常移动、普攻、技能命中并获得伤害份额；
- 两人同时拾取同一掉落时只一人获得；
- 房主断线后双方暂停，60 秒内重连恢复；超时后队员接管并继续；
- 手动退出立即从房间和局内地图消失；
- Boss 条不遮挡 MP，队友名牌在站立、跑、跳、攻击动作下都保持 10px 间距；
- 连续切换三关、返回地图后重进、调整窗口尺寸和模拟 WebGL context restore 后，背景均完整可见；
- 桌面和移动视口截图无文字、HUD 或地图重叠。

## 14. 实施顺序

1. 先交付独立的战斗/UI 修复：HUD A、名牌锚点、输入缓冲、空中攻击、AttackSpec、硬直保护、特效原点和自动保存。
2. 扩展关卡编译器，生成并接入独立的 `sl11/sl12/sl13` LevelPrefab，迁移世界地图和旧存档进度。
3. 抽出可序列化 BattleWorldState，确保单机全流程先通过同一模拟入口。
4. 接入房主权威输入、快照、事件、掉落与奖励账本。
5. 实现 60 秒断线保留、权威迁移、公开大厅、分享和局内地图。
6. 完成双浏览器真实服务端验收，再提交、推送和部署前后端。

## 15. 非目标

- 本轮不把完整战斗模拟迁移到 social-server。
- 本轮不实现竞技对战、防作弊审计或观战。
- 本轮不恢复第一章之外所有原版特殊机关；后续关卡复用本轮编译器与插件边界逐关导入。
- 本轮不为已经能够从 SWF 导出的资源重新生图。
