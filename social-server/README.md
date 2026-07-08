# social-server

好友/登录/房间大厅层后端。独立 Node + TypeScript 进程，与 `agent-server/` 并列，互不依赖。默认监听 `5182`（`agent-server` 占了 `5181`）。

**架构预拍决策（本棒不做的事）**：房主权威 + WebSocket 房内广播。服务器只做房间路由/消息扇出，不做战斗仲裁，也不做任何战斗内实时同步——这是下一棒的范围。本服务的 WS 层只有大厅事件（成员进出/准备状态/开始信号），代码里能看到这条边界的注释（`src/rooms.ts`、`src/ws-protocol.ts`）。

## 运行

```sh
npm install
JWT_SECRET=<随便一个开发用的字符串> npm run start   # 监听 http://127.0.0.1:5182
npm run typecheck    # tsc --noEmit
npm run test:unit    # 纯函数 + DB 单测（node:test，40 条）
npm run test:e2e     # 端到端冒烟：真实起服务 + 真实 HTTP/WS 走一遍完整流程
npm test              # test:unit && test:e2e
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

服务端 → 客户端：

| type | 字段 | 说明 |
|---|---|---|
| `room_state` | `room: RoomSnapshot` | `join` 成功后立即发给该 socket |
| `member_joined` | `member: {userId, username}` | 广播给房间里**已连接**的其它 socket——注意：这是在某个 socket 的 `join` 消息成功时触发，不是 REST 加入时触发，故意把"在线"和"已建立 WS 连接"绑在一起，避免只走了 REST 没开 WS 的成员被误报为在线 |
| `member_left` | `userId, newOwnerId?` | 房主离开且还有其他成员时带 `newOwnerId`（顺位继承，按加入顺序） |
| `ready_changed` | `userId, ready` | |
| `game_start` | `levelId` | 房主发起 `start` 且全员 ready 后广播 |
| `error` | `message` | 协议错误（如非法首条消息、房间不存在、非房主发 start） |

`RoomSnapshot = { id, levelId, ownerId, status, members: {userId, username, ready}[] }`

## 分配算法纯逻辑模块（`src/allocation.ts`，不依赖 HTTP/WS/DB，纯函数）

- **经验/灵魂**：`splitAmongPresent(total, presentUserIds, killerUserId)`——在场成员向下取整平分，余数全部给击杀者。前提：击杀者必须在 `presentUserIds` 里（现实里打不到怪就不可能是击杀者，调用方负责保证），否则抛错。
- **掉落**：`rollDropsForPresent(table, presentUserIds, rng)`——每个在场玩家对同一张掉落表独立掷骰，互不影响、互不争抢；`rng` 可注入，测试用固定种子验证统计独立性。
- **转赠事务**：`lockTransfer` / `commitTransfer` / `refundTransfer` 三段式，模式抄自 `game/src/systems/furnace.ts` 的材料锁定/消耗/退款；`transferItem` 是给上层用的入口，先查好友关系（非好友直接拒绝，账本不动），再锁定+立即提交。因为这是单进程同步 JS，check-扣款-入账整个序列中间没有 `await`，不可能被别的调用交叉执行，这就是这里不会双花的根本原因。账本本身（`Ledger`）只是验证事务安全模式用的最小内存模型，接游戏真实背包是后续棒的事，本服务不 import `game/` 任何代码。

## 已知边界 / 未做的事

- 房间是内存态，不持久化，重启即丢——MVP 大厅态可接受。
- 没有聊天、没有匹配、没有战斗内实时同步（架构已预拍为房主权威+广播，具体同步协议留给下一棒）。
- `allocation.ts` 的转赠账本是独立的验证模型，不是真实库存系统。
