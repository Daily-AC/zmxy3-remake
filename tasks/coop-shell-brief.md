# 任务书：coop-shell——登录 + 房间大厅游戏侧接线（黑客松提交硬需求）

派发：2026-07-09 14:5x 主会话 → codex。**截止 ~22:35，功能优先，视觉由主会话亲自做后续 restyle——你把布局做成可换肤（颜色/字体/贴图集中在一个 theme 常量对象），别在视觉上花时间。** report 写 `tasks/coop-shell-report.md`。

## 后端（已上线勿动，只做客户端）

- REST：`https://zm-dev.qmledmq.cn:8443/social/*`（register/login→JWT、好友、rooms 建/加）；WS：`wss://zm-dev.qmledmq.cn:8443/social/ws`（join→room_state/member_joined/ready/game_start）。
- API 形状读 `social-server/src/`（真源在本仓库）+ `tasks/social-deploy-report.md` e2e 一节（注册→建房→双 WS→game_start 全链已验证 854ms）。
- 本地开发态：social-server 可 `node` 直起（读 README/ src，端口 7100；沙箱无 npm install——node_modules 已装好，直接跑）。客户端 server 地址走 config（query `?socialServer=` > env VITE_SOCIAL_SERVER_URL > 默认生产 wss），照 npcClient.ts 的先例。

## 产出

1. `game/src/net/socialClient.ts`：REST + WS 客户端（JWT 存内存+localStorage；重连简单化：断了提示回大厅，不做无缝重连）。
2. `game/src/scenes/LoginScene.ts`：账号/密码输入（Phaser DOM element 或 canvas 输入，走现有 DialogueBox 输入先例）、注册/登录、错误 toast（用现有 Toast，禁原生弹窗）。入口：主菜单加"联机共斗"项 → LoginScene；已有 JWT 直接跳大厅。
3. `game/src/scenes/LobbyScene.ts`：房间列表（建房/加入）、房内成员列表 + ready 态、房主"开始"→ 双方收 game_start(levelIndex) → 各自带 `coopSession`（roomId/memberId/isHost/peers）进 BattleScene。**本棒不做战斗内同步**（coop-sync 棒的活），只把 coopSession 通过 scene data 传进去，BattleScene 侧只加"读取并存参"的最小接缝（≤10 行，标注 COOP-SEAM 注释）。
4. vitest：socialClient 协议编解码（mock 传输）；场景可测逻辑（房态 reducer）。

## 边界

产权：`game/src/net/socialClient.ts`、`game/src/scenes/LoginScene.ts`、`game/src/scenes/LobbyScene.ts`、`game/src/scenes/MainMenuScene.ts`（加一个菜单项）、`main.ts`（注册场景）、`game/tests/`、本 report。BattleScene 只许加 COOP-SEAM 最小接缝（B 棒在途，改前 git pull 最新、改完立即 commit）。禁碰 ui/hud（C 棒）、systems/。
判据：本地起 social-server + 两个浏览器 tab 注册两账号→建房→加入→ready→开始→两 tab 都进 L1（包装层亲自跑通截图，存 tmp/coop-shell-evidence/）；全量 vitest 绿+tsc 净。commit 逐件不 push。
