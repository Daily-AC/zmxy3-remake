# social-server 交付报告

对应任务书 `tasks/social-server-brief.md`。实现由 `codex:codex-rescue` 完成（架构/schema/协议/算法设计由本会话预拍，写在派发 prompt 里；codex 按契约写代码+测试），全部验证由本会话独立跑通，不是实现方自证。

## 目录

```
social-server/
  package.json  tsconfig.json  README.md
  src/  db.ts types.ts auth.ts friends.ts rooms.ts allocation.ts ws-protocol.ts ws-server.ts server.ts
  test/ auth.test.ts friends.test.ts rooms.test.ts allocation.test.ts e2e-smoke.ts
```

依赖：`express` `ws` `better-sqlite3` `jsonwebtoken` `bcryptjs`（+对应 `@types/*`）+ `tsx`/`typescript`。没有引入更重的框架。默认端口 `5182`（`agent-server` 占 `5181`）。

## 接口清单

### HTTP

| method & path | auth | body | 返回 |
|---|---|---|---|
| POST /auth/register | - | `{username, password}` | 201 `{token, user}`；重名 409，空字段 400 |
| POST /auth/login | - | `{username, password}` | 200 `{token, user}`；账号或密码错统一 401（不泄露具体哪个错） |
| GET /me | Bearer | - | 200 `{id, username}` |
| POST /friends/request | Bearer | `{toUsername}` | 201 `{request}` |
| POST /friends/:requestId/accept | Bearer | - | 200 `{request}` |
| POST /friends/:requestId/reject | Bearer | - | 200 `{request}` |
| DELETE /friends/:userId | Bearer | - | 204 |
| GET /friends | Bearer | - | 200 `{friends, incoming, outgoing}` |
| POST /rooms | Bearer | `{levelId: "L1"\|"L2"}` | 201 `{room}` |
| POST /rooms/:roomId/join | Bearer | - | 200 `{room}` |
| POST /rooms/:roomId/leave | Bearer | - | 200 `{room}`（null=已解散） |
| GET /rooms/:roomId | Bearer | - | 200 `{room}` |

### WebSocket（`ws://127.0.0.1:5182/ws`，schema 见 `src/ws-protocol.ts`）

客户端→服务端：`join{token,roomId}`（必须是第一条）、`ready{ready}`、`leave`、`start`（仅房主）。
服务端→客户端：`room_state{room}`、`member_joined{member}`、`member_left{userId,newOwnerId?}`、`ready_changed{userId,ready}`、`game_start{levelId}`、`error{message}`。

`RoomSnapshot = {id, levelId, ownerId, status, members:{userId,username,ready}[]}`。

## 数据库 schema（better-sqlite3，`src/db.ts`）

版本化迁移：`schema_meta(version)` + 有序迁移数组，当前 version=1。

```sql
users(id, username UNIQUE, password_hash, created_at)
friend_requests(id, from_user_id, to_user_id, status CHECK(pending|accepted|rejected), created_at, updated_at)
friendships(user_id_a, user_id_b, created_at, PRIMARY KEY(user_id_a, user_id_b))  -- 固定 a<b 存一条，查询不用管方向
```

房间**不落库**，纯内存（`RoomManager`），进程重启清空——预拍决策，见下。

## 预拍决策记录

1. **房主权威 + WS 广播，不做战斗内同步**：服务器只做房间路由和消息扇出。`src/rooms.ts`/`src/ws-server.ts` 里有对应注释锚点。下一棒的范围。
2. **经验/灵魂平分**：`splitAmongPresent` 向下取整平分，余数给击杀者；前提是击杀者必须在场（调用方保证，函数对不在场的击杀者抛错，不是静默丢弃余数）。
3. **掉落个人独立 roll**：`rollDropsForPresent` 每个在场玩家对同一张表独立掷骰，互不影响。测试用固定种子的 mulberry32 验证"两人各掷 chance=0.5，四种组合都出现"这条统计独立性，不是抽样看着差不多。
4. **转赠事务防双花**：`lockTransfer`/`commitTransfer`/`refundTransfer` 三段式，直接照抄 `game/src/systems/furnace.ts` 的材料锁定/消耗/退款模式（含"已结算事务上 commit/refund 互斥且幂等"这条测试）。`transferItem` 先查好友关系再动账本，非好友直接拒绝、账本不动。双花防护的根本原因写在代码注释里：单进程同步 JS，check-扣款-入账整个序列中间没有 `await`，不可能被另一次调用交叉执行。
5. **房间不落库**：大厅态是轻量、可重建的会话状态，MVP 阶段没有跨重启保留房间的需求，持久化会话反而增加"房间存在但没人在线"这类僵尸状态要处理。算作范围内的工程简化，不是欠账。
6. **`member_joined` 绑定 WS 连接而非 REST 加入**：REST `/rooms/:id/join` 只建立成员资格，真正广播"某人上线"是在对方 WS 发 `join` 消息成功订阅时。避免"REST 加了但没开 WS"的成员被误报成在线。
7. **JWT secret 强制走环境变量，没有兜底值**：`assertJwtSecret()` 在 `JWT_SECRET` 缺失时直接抛错，代码里不落任何默认密钥字符串；测试文件里自己设的 `unit-test-secret`/`e2e-smoke-secret` 是测试夹具，不是生产配置。
8. **转赠账本是独立验证模型，不接游戏真实背包**：`allocation.ts` 完全不 import `game/` 任何代码，`Ledger` 只是证明事务安全模式用的最小内存 `Map`。接入游戏真实库存是明确的后续集成任务，本棒范围内不做，避免趁手就手滑碰了 `game/`。

## 单测结果（`npm run test:unit`，node:test，全部真实跑过，非转述）

```
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 460.143292
```

覆盖分支：
- **auth**：注册创建可验证 token 的用户；空字段/重名拒绝；登录同一 public user 形状且不泄露具体错在哪个字段；`assertJwtSecret` 在缺变量时清晰报错。
- **friends**：拒绝加自己/已是好友/双向重复 pending；只有 pending 状态、只有接收方能 accept/reject；已结算请求二次操作拒绝；friendshipPair 的稳定配对契约。
- **rooms**：创建/加入/满员拒绝/进行中拒绝/重复加入拒绝；非房主离开不影响房主；房主离开按加入顺序顺位转移；最后一人离开返回 null（解散）；setReady 不可变更新；canStart 全员 ready 才为真；solo 房间房主 ready 即可开始；startGame 未就绪时抛错。
- **allocation**：平分无余数/多种余数场景/单人房间独得/击杀者不在场抛错；独立 roll 的 chance=0/1 边界与统计独立性（2000 次固定种子试验四种组合都出现）；lock/commit/refund 各自行为+已结算事务的互斥幂等性；`transferItem` 好友限定拒绝、余额不足拒绝、连续两次转账第二次因余额耗尽被拒的显式双花测试。

## e2e 冒烟结果（`npm run test:e2e`，真实起服务+真实 HTTP/WS，非 mock）

```
server started http://127.0.0.1:52717
registered users alice=1 bob=2
alice sent friend request 1
bob accepted friend request
friend lists alice=[{"id":"2","username":"bob"}] bob=[{"id":"1","username":"alice"}]
alice created room 02d87e62
bob joined room 02d87e62 via REST
alice ws room_state members=alice,bob
bob ws room_state members=alice,bob
alice saw member_joined user=2
both users ready
both sockets received game_start L1
SMOKE OK
```

流程：真实注册两用户 → alice 发好友申请 → bob 接受 → 双方好友列表互相可见 → alice 建房(L1) → bob 走 REST 加入 → 双方各开一条真实 WebSocket 发 `join` → 都收到 `room_state`，alice 收到 bob 的 `member_joined` → 双方 `ready` → alice（房主）发 `start` → 双方都收到 `game_start{levelId:"L1"}`。

`npm run typecheck`：`tsc --noEmit` 无输出，零错误。

## 疑点（判据之外，未擅自扩范围，供用户裁决）

1. **好友请求/房间 id 的类型**：数据库自增整数转成字符串对外暴露（`String(id)`），房间 id 用 `randomUUID().slice(0,8)`。两种 id 风格不统一，够用但不严谨（8 位 UUID 前缀理论上有碰撞概率，量小可接受）。要不要统一成同一种 id 策略，留给后续棒判断。
2. **房间容量 4 人 vs CLAUDE.md 里刚拍板的"10 人同房不卡"**：写这份报告时发现 `CLAUDE.md` 已经有其他并发任务把总纲更新为"10 人同房不卡"的性能目标（20:2x 用户拍板），但本棒任务书 `tasks/social-server-brief.md` 写的是"房间成员上限 4"。这是任务书之间出现的新旧冲突，不是我擅自改的——`ROOM_CAPACITY=4` 严格按原任务书实现，是否要提到 10 需要用户/主会话对齐两份任务书后决定，本棒没有替用户扩范围。
3. **`transferItem` 的 `TransferTx.toUserId` 先留空再回填**：`lockTransfer` 构造事务时 `toUserId` 还不知道（先扣款），`transferItem` 拿到锁定结果后再手工赋值 `tx.toUserId = toUserId`。这是可用的做法但接口上有点别扭（`TransferTx` 理论上应该一开始就是完整的），如果以后要把 `lockTransfer`/`commitTransfer` 单独暴露给别的调用方（不经过 `transferItem`），这个"先留空"的约定需要显式文档化或重构掉，目前只有 `transferItem` 一个调用方所以没造成实际问题。
4. **房间不持久化 = 服务重启会丢失所有进行中的房间**，包括正在游戏中的房间（`status: "in_game"`）。MVP 可接受，但如果 home 部署后要考虑服务热更新/重启场景，这是一个真实的用户体验缺口（房间里的人会突然掉线且拿不回房间），值得在下一棒接实时同步时一并考虑要不要给房间加最简单的落盘快照。

## 环境事实（交接用）

`codex:codex-rescue` 的沙箱没有出网权限，`npm install` 对公网 registry 会 EPERM 失败，本地 npm 缓存也不完整（缺 `@types/jsonwebtoken` 等）——这是环境限制，不是模型偷懒或糊弄。本棒的处理方式：source 由 codex 静态写完，`npm install`/`tsc`/单测/e2e 全部由本会话在正常出网权限的 shell 里重新跑通，报告里的所有输出都是本会话亲自执行拿到的，不是转述 codex 自己的验证结果。若以后再派 codex 写需要装包验证的服务端任务，建议一开始就告诉它"别装包，写完交给我验证"，能省掉它在离线兜底上空转的时间（这次空转了将近 20 分钟）。
