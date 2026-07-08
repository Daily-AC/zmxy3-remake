# social-server

好友/登录/房间大厅层后端。独立 Node + TypeScript 进程，与 `agent-server/` 并列，互不依赖。默认监听 `5182`（`agent-server` 占了 `5181`）。

**架构预拍决策（本棒不做的事）**：房主权威 + WebSocket 房内广播。服务器只做房间路由/消息扇出，不做战斗仲裁，也不做任何战斗内实时同步——这是下一棒的范围。房间上限 `ROOM_CAPACITY = 10`（`src/rooms.ts`，2026-07-08 用户拍板"10 人同房不卡"性能目标，从任务书原定的 4 上调）。本服务的 WS 层目前有两类消息：大厅事件（成员进出/准备状态/开始信号）+ 给下一棒占位的 `state`/`event` 协议形状（10-20Hz 高频状态 vs 低频可靠事件，服务端只做无仲裁的原样转发）。代码里能看到这条边界的注释（`src/rooms.ts`、`src/ws-protocol.ts`、`src/ws-server.ts`）。

## 运行

```sh
npm install
JWT_SECRET=<随便一个开发用的字符串> npm run start   # 监听 http://127.0.0.1:5182
npm run typecheck    # tsc --noEmit
npm run test:unit    # 纯函数 + DB 单测（node:test，40 条）
npm run test:e2e     # 端到端冒烟：真实起服务 + 真实 HTTP/WS 走一遍完整流程
npm test              # test:unit && test:e2e
npm run loadtest:fanout   # 10 人满房扇出压测，默认跑 30s，见下方"性能"一节
```

环境变量：
- `JWT_SECRET`（必填）：JWT 签名密钥。缺失时启动直接抛错，配置文件里不落任何默认值/兜底值。
- `SOCIAL_SERVER_PORT`（可选，默认 `5182`）。
- `SOCIAL_DB_PATH`（可选，默认 `social-server/data/social.db`，测试用 `:memory:`）。

## 数据存储

SQLite（better-sqlite3），版本化迁移（`src/db.ts`）：`schema_meta(version)` 表 + 一个有序迁移数组，每步只在当前版本落后时执行。当前版本 1，建 `users` / `friend_requests` / `friendships` 三张表。`friendships` 固定按 `user_id_a < user_id_b` 存一条记录，查询不用管方向。

房间是纯内存状态（`RoomManager`，`src/rooms.ts`），进程重启即清空——大厅态本来就该是轻量的，这是有意的简化，不是遗漏。

## HTTP 接口

| method & path | auth | body | 说明 |
|---|---|---|---|
| POST /auth/register | - | `{username, password}` | 201 `{token, user}`；用户名重复 409，字段为空 400 |
| POST /auth/login | - | `{username, password}` | 200 `{token, user}`；账号或密码错都是 401，不区分哪个错 |
| GET /me | Bearer | - | 200 `{id, username}` |
| POST /friends/request | Bearer | `{toUsername}` | 201 `{request}`；加自己/已是好友/重复申请分别拒绝 |
| POST /friends/:requestId/accept | Bearer | - | 200 `{request}`；只有接收方能对 pending 请求操作 |
| POST /friends/:requestId/reject | Bearer | - | 同上 |
| DELETE /friends/:userId | Bearer | - | 204；解除好友关系 |
| GET /friends | Bearer | - | 200 `{friends, incoming, outgoing}` |
| POST /rooms | Bearer | `{levelId: "L1"\|"L2"}` | 201 `{room}`；创建者即房主 |
| POST /rooms/:roomId/join | Bearer | - | 200 `{room}`；满员/进行中/重复加入拒绝 |
| POST /rooms/:roomId/leave | Bearer | - | 200 `{room}`（room 为 null 表示已解散）|
| GET /rooms/:roomId | Bearer | - | 200 `{room}` |

## WebSocket 协议（`src/ws-protocol.ts`，未来游戏客户端复用这个 schema 文件）

连接地址 `ws://127.0.0.1:5182/ws`。房间成员身份由 REST 的 `/rooms/:id/join` 建立；WS 连接建立后必须先发 `join` 消息完成订阅，之后才能收发其它消息类型。

客户端 → 服务端：

| type | 字段 | 说明 |
|---|---|---|
| `join` | `token, roomId` | 必须是第一条消息；服务端校验 JWT + 校验该用户已经是这个房间的 REST 成员 |
| `ready` | `ready: boolean` | 切换准备状态 |
| `leave` | - | 主动离开（socket 断开也等效于 leave） |
| `start` | - | 仅房主可发；全员 ready 才会真正开始 |
| `state` | `seq, payload, sentAt` | 高频（10-20Hz）状态占位协议，见下方"未来同步协议占位"|
| `event` | `name, payload` | 低频可靠事件占位协议，同上 |

服务端 → 客户端：

| type | 字段 | 说明 |
|---|---|---|
| `room_state` | `room: RoomSnapshot` | `join` 成功后立即发给该 socket |
| `member_joined` | `member: {userId, username}` | 广播给房间里**已连接**的其它 socket——注意：这是在某个 socket 的 `join` 消息成功时触发，不是 REST 加入时触发，故意把"在线"和"已建立 WS 连接"绑在一起，避免只走了 REST 没开 WS 的成员被误报为在线 |
| `member_left` | `userId, newOwnerId?` | 房主离开且还有其他成员时带 `newOwnerId`（顺位继承，按加入顺序） |
| `ready_changed` | `userId, ready` | |
| `game_start` | `levelId` | 房主发起 `start` 且全员 ready 后广播 |
| `error` | `message` | 协议错误（如非法首条消息、房间不存在、非房主发 start） |
| `state` | `fromUserId, seq, payload, sentAt` | 原样转发客户端的 `state`，附上发送者 id |
| `event` | `fromUserId, name, payload` | 原样转发客户端的 `event`，附上发送者 id |

`RoomSnapshot = { id, levelId, ownerId, status, members: {userId, username, ready}[] }`

### 未来同步协议占位（`state` / `event`）

这两类消息是给**下一棒**（真实战斗同步）占位的协议形状，本棒只设计不实现：服务端收到后原样转发给房间里其它已连接的 socket，不做仲裁、不做校验、不限定谁能发（"只有房主能发 state"这类权威判定是下一棒的游戏策略决定，不属于这层大厅路由）。

- **`state`**（高频，10-20Hz，位置/动作类）：带单调递增的 `seq`。可靠传输（WebSocket/TCP）之上叠加一条应用层的"不可靠语义"：接收方必须丢弃任何 `seq` 小于等于已接收过的最大 `seq` 的消息，当作被网络丢弃处理——过期的位置数据一旦有更新的样本就没有价值，这是有意的"后到丢弃/以新覆旧"策略，不是传输层限制。
- **`event`**（低频，伤害/拾取/掉落等不可丢事件）：不需要 `seq`，普通的 WS/TCP 顺序保证就够，因为这类事件稀少且每一条都重要。

序列化目前就是普通 JSON（跟其它消息一样），等压测（`test/loadtest-fanout.ts`）在更真实的人数/频率下如果测出 JSON 开销顶到延迟预算上限，那才是切二进制编码的触发条件——现在没有必要提前优化。

## 性能：10 人同房扇出压测（`test/loadtest-fanout.ts`）

对应"10 人同房不卡"这条判据在服务器侧的基线证据（客户端渲染/插值不归这个服务管）。场景：真实起服务，10 个用户注册并把一个房间填满到 `ROOM_CAPACITY`，全部开真实 WebSocket 连接订阅同一房间；其中 1 个连续 30 秒以 20Hz 发 `state` 消息，另外 9 个接收并各自统计端到端延迟（收方 `Date.now()` 减发送方 `sentAt`）与"过期 seq 丢弃"次数。判据：P95 端到端延迟 < 50ms。

实测（本机回环，2026-07-08）：

```
scenario: 10 clients, 1 sender @ 20Hz for 30000ms, P95 budget 50ms
room ea645536 filled to capacity (10)
all 10 sockets subscribed
sender: 580 state messages sent (seq 1..580)
receivers: 9, expected deliveries: 5220, actual received: 5220
transport loss (expected~0 on TCP loopback): 0
stale-seq discarded (application-level, per receiver highest-seq rule): 0
end-to-end latency ms -- p50: 1.00, p95: 2.00, p99: 3.00, max: 9.00
LOADTEST OK -- P95 2.00ms < 50ms budget
```

P95 2ms，远低于 50ms 预算；本机 TCP loopback 上没有真实网络丢包，`transport loss` 恒为 0 是预期结果（这条指标要测出非零值需要真实广域网延迟/丢包环境，不是本地回环能验证的东西）；`stale-seq discarded` 同样恒为 0，因为单条 TCP 连接本身就保证有序，不会出现乱序到需要应用层丢弃的情况——这条判据在本机环境下验证的是"丢弃规则的语义写对了、不会误伤正常消息"，而不是"真的抗住了丢包乱序"，这一层真实网络条件下的验证要等实际联机测试（跨机器/弱网模拟）才有意义。

## 分配算法纯逻辑模块（`src/allocation.ts`，不依赖 HTTP/WS/DB，纯函数）

- **经验/灵魂**：`splitAmongPresent(total, presentUserIds, killerUserId)`——在场成员向下取整平分，余数全部给击杀者。前提：击杀者必须在 `presentUserIds` 里（现实里打不到怪就不可能是击杀者，调用方负责保证），否则抛错。
- **掉落**：`rollDropsForPresent(table, presentUserIds, rng)`——每个在场玩家对同一张掉落表独立掷骰，互不影响、互不争抢；`rng` 可注入，测试用固定种子验证统计独立性。
- **转赠事务**：`lockTransfer` / `commitTransfer` / `refundTransfer` 三段式，模式抄自 `game/src/systems/furnace.ts` 的材料锁定/消耗/退款；`transferItem` 是给上层用的入口，先查好友关系（非好友直接拒绝，账本不动），再锁定+立即提交。因为这是单进程同步 JS，check-扣款-入账整个序列中间没有 `await`，不可能被别的调用交叉执行，这就是这里不会双花的根本原因。账本本身（`Ledger`）只是验证事务安全模式用的最小内存模型，接游戏真实背包是后续棒的事，本服务不 import `game/` 任何代码。

## 已知边界 / 未做的事

- 房间是内存态，不持久化，重启即丢——MVP 大厅态可接受。
- 没有聊天、没有匹配、没有战斗内实时同步（架构已预拍为房主权威+广播，具体同步协议留给下一棒）。
- `allocation.ts` 的转赠账本是独立的验证模型，不是真实库存系统。
