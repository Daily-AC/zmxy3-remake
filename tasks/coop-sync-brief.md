# 任务书：coop-sync——战斗内多人同步（主机权威，demo 级口径）

派发：2026-07-09 14:5x 主会话 → codex。report 写 `tasks/coop-sync-report.md`。**先纯逻辑后集成**：BattleScene 正被 B 棒占用，你先把纯逻辑层 + 协议做完做绿，集成接线等主会话发令（或 B 棒 commit 后你 pull 再动）。

## 口径（用户拍板 demo 级，别加码）

同房 2~4 人同关：互见对方角色（位置/朝向/动作动画）、同打一批怪（主机模拟怪物，广播怪物位置/HP/死亡）、伤害主机权威（客机上报攻击命中意图，主机结算）、掉落/拾取各自独立（不做所有权仲裁，黑客松口径）。**不做**：断线重连、延迟补偿、反作弊、观战、中途加入。

## 传输

复用 social-server 房间 WS 广播（`social-server/src/` 真源；房内 broadcast 已压测 P95 21ms）。若其消息类型不够用，在 social-server 加一个透传型 `game_event` 通道（服务端不解析 payload，房内扇出即可）——server 改动最小化并写测试。

## 产出

1. `game/src/systems/coopSync.ts`（Phaser 无关纯逻辑）：状态快照/增量协议（英雄态 8~12 字段@10Hz + 怪物态 host→peers@10Hz + 命中意图 peer→host + 结算广播 host→all）、序列号去旧、插值缓冲（100~150ms 简单线性）。vitest：编解码 roundtrip、乱序丢弃、插值正确性、host/peer 状态机。
2. `game/src/net/coopChannel.ts`：把 coopSync 协议挂到 socialClient 的 WS 上（coop-shell 棒产出 socialClient.ts，接口对不上就先写接口契约 + mock，report 标注）。
3. social-server `game_event` 透传（若需要）+ 其测试。
4. **集成设计文档**（report 内）：BattleScene 挂点清单（spawn 远程英雄实体/怪物权威开关/命中上报点），等主会话发令后执行集成（预计 B 棒 16:30 前收口）。

## 边界

产权：`game/src/systems/coopSync.ts`、`game/src/net/coopChannel.ts`、`social-server/src/`（最小透传通道）、`game/tests/`、`social-server/test/`、本 report。**现阶段禁碰 BattleScene/scenes/**（集成阶段另发令）。禁 npm install/联网（两边 node_modules 都已装好；社服测试直接跑）。
判据（纯逻辑阶段）：coopSync 测试覆盖上述四类消息 + 插值；social-server 全量测试绿；game 全量 vitest 绿+tsc 净。commit 逐件不 push。
