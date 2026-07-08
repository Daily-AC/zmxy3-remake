# social-deploy 报告：social-server 部署 home + 跨公网压测（2026-07-08 23:1x）

对应任务书 `tasks/social-deploy-brief.md`。照 agent-server 先例（progress 13:35 节）做的第二个常驻服务：WSL systemd + Caddy 反代。所有验收数字均本会话跨公网真实跑出，非转述。

## 部署状态：闭环

- systemd unit `zmxy-social`：**active + enabled**，Restart=always 已真实验证（杀 MainPID 后自愈、重新监听 7100）。
- Caddy `zm-dev.qmledmq.cn:8443` 加 `/social/*` 路由，agent-server 原路径零破坏（welcome[laojun] 回归通过）。
- JWT_SECRET 在 home 上 `openssl rand -hex 32` 生成，写入 600 root:root 的 EnvironmentFile，**值全程未进对话/git/本机脚本**。
- C:\infra 侧 Caddy 改动已 commit（`b7fbc46`）。

## 四项验收结果

| # | 判据 | 结果 |
|---|---|---|
| 1 | systemd active + enabled，重启自愈 | **通过**。active + enabled；kill -9 MainPID(29161) → 6s 内自愈为 29747 并重新 listen 7100（Restart=always 实证，非仅 enabled）|
| 2 | mac 跨公网 e2e 完整链路 | **通过**。注册→好友申请/接受→好友列表互见→建房 L1→REST 加入→双 WS join→room_state→member_joined→双方 ready→房主 start→双方 game_start L1，全程走 `wss://zm-dev.qmledmq.cn:8443/social/ws`，854ms 完成 |
| 3 | 跨公网扇出压测 P95/P99/丢失 | **通过**。见下节，P95 21ms 远低于 100ms 参考线，无瓶颈需分析 |
| 4 | agent-server 原路径 welcome[laojun] 回归 | **通过**。`wss://zm-dev.qmledmq.cn:8443/` 根路径首帧 `{"type":"welcome","npcIds":["laojun"]}` |

## 跨公网扇出压测数字

10 人满房，1 个发送端以 20Hz 连续 30s 发 `state`，其余 9 个接收。**10 条 WS 全部从 mac 发起**（mac 发→home 北京服务器扇出→mac 收），sender 的 `sentAt` 与 receiver 的 `Date.now()` 同一 mac 时钟，测的是完整往返真实网络延迟，无时钟偏移问题。

```
scenario: 10 clients over PUBLIC net, 1 sender @ 20Hz for 30000ms
room 92bd4893 filled to capacity (10)
all 10 sockets subscribed
sender: 582 state messages sent (seq 1..582)
receivers: 9, expected deliveries: 5238, actual received: 5238
transport loss: 0
stale-seq discarded: 0
end-to-end latency ms -- p50: 17.00, p95: 21.00, p99: 25.00, max: 34.00, samples: 5238
```

对照 social-server 报告里的本机 loopback（P95=2ms）：跨公网多出的约 19ms 就是 mac↔北京 home 的真实网络 RTT（经 Caddy TLS + WSL）。5238 条预期投递零丢失、零 stale。诚实边界：这 10 条连接同源一台 mac、共享同一条上行链路，不是 10 台地理独立客户端；但服务端扇出争用（真正被测的东西）是真实的，延迟也是真实公网 RTT。这是"10 人不卡"的第一个真实网络数字，服务端扇出路径不是瓶颈。

## 部署步骤（可复现）

1. **拉码**：WSL `~/projects/zmxy3-remake` git pull（faab9ba → eb7b591，快进），social-server/ 到位。
2. **装依赖**：`cd social-server && npm install`（136 包，better-sqlite3 原生模块正常——单测 40/40 通过实证），`npm run typecheck` 零错误。
3. **JWT_SECRET**：root 下 `openssl rand -hex 32` 直接管道进 `/etc/zmxy-social/social.env`（umask 077，chmod 600 root:root，值从不落屏）。
4. **systemd unit**（见下）：`daemon-reload` + `enable --now`，data 目录 `install -d -o zyl` 预建给 sqlite。
5. **Caddy**：改 `C:\infra\caddy\zm-dev-site.Caddyfile` 受控副本 → `apply.ps1 -DeployCaddy -ExecutionPolicy Bypass`（validate 通过后 reload，exit=0）。严禁直改 C:\Caddy。
6. **验收**：mac 端跑 scratchpad 里的 public-e2e / public-loadtest / agent-regression 三脚本（均指向公网地址）。

## systemd unit（`/etc/systemd/system/zmxy-social.service`）

```ini
[Unit]
Description=zmxy3-remake social-server (lobby: auth/friends/rooms/WS fanout)
After=network.target

[Service]
User=zyl
WorkingDirectory=/home/zyl/projects/zmxy3-remake/social-server
ExecStart=/bin/bash -lc 'exec npm run start'
Restart=always
RestartSec=3
EnvironmentFile=/etc/zmxy-social/social.env
Environment=SOCIAL_SERVER_PORT=7100
Environment=http_proxy=http://127.0.0.1:7890
Environment=https_proxy=http://127.0.0.1:7890
Environment=HTTP_PROXY=http://127.0.0.1:7890
Environment=HTTPS_PROXY=http://127.0.0.1:7890
Environment=no_proxy=localhost,127.0.0.1
Environment=NO_PROXY=localhost,127.0.0.1

[Install]
WantedBy=multi-user.target
```

照 zmxy-agent 模式：`bash -lc` 拿 nvm 的 node；Restart=always 崩溃自愈；挂 7890 代理 env（social-server 其实不出网，为与 agent 一致 + 未来防楔死保留）。JWT_SECRET 走 EnvironmentFile 不落 unit（systemd 以 root 读 600 文件后再降权到 zyl，安全）。SOCIAL_SERVER_PORT=7100 覆盖默认 5182。

## Caddy diff（`C:\infra\caddy\zm-dev-site.Caddyfile`，commit b7fbc46）

改前：vhost 里一条裸 `reverse_proxy 127.0.0.1:5181`（吃所有路径）。
改后：

```caddy
zm-dev.qmledmq.cn:8443 {
	tls C:/Caddy/certs/qmledmq.cn.crt C:/Caddy/certs/qmledmq.cn.key

	# social-server :7100；handle_path 剥掉 /social 前缀
	# /social/auth/register -> :7100/auth/register, /social/ws -> :7100/ws
	handle_path /social/* {
		reverse_proxy 127.0.0.1:7100 {
			flush_interval -1
		}
	}

	# agent-server :5181；handle 兜底吃所有非 /social 路径，保持原路由零变化
	handle {
		reverse_proxy 127.0.0.1:5181 {
			flush_interval -1
		}
	}
}
```

`handle_path` 剥前缀、`handle` 兜底——agent-server 在根路径（含 WS）行为完全不变，实测 welcome[laojun] 回归通过。`flush_interval -1` 两块都留，WS 流式必需。

## 坑清单

1. **WSL sudo 要密码，走 `wsl -u root` 装 unit**：home-wsl 的 zyl 用户 `sudo -n` 需密码；照 winhome 冷启套路用 `ssh home` → `wsl -d Ubuntu-24.04 -u root -- bash -s` 从 stdin 喂脚本，绕开 PowerShell 的引号/重定向地狱（`ssh home 'wsl ... bash -c "..."'` 里的 `<`/`>` 会被 PowerShell 抢先解析报错）。
2. **npm 的 allow-scripts 警告是虚惊**：`npm install` 报 better-sqlite3/esbuild 的 install script "not yet covered by allowScripts"，但原生模块实际能加载——单测 40/40 + 本地 register 201 实证，没被拦。
3. **本地 vs 远端 git 领先**：mac 本地领先 origin/master 两个 commit（美术/AI 的活，与本棒无关），social-server 已在 origin/master(eb7b591)，WSL 直接 pull 拿到，无需先推本地。
4. **Caddy 结构从裸 reverse_proxy 改 handle 块**：原 vhost 只有一条裸 `reverse_proxy`，加第二个后端必须重构成 `handle_path` + `handle` 兜底，不能两条裸 reverse_proxy 并列（会冲突）。apply.ps1 的 validate 会挡住错配。
5. **git commit 别管道 `| tail`**：home 的 git 在 PowerShell 里跑，`| tail` 会 "not recognized" 打断命令链导致 commit 静默没执行——用 `Write-Output` 分隔或分开跑。

## 边界遵守

- 只碰了 social-server 部署所需的新增件（unit、env、Caddy /social 块、data 目录），agent-server/既有服务/端口映射/计划任务零改动（apply.ps1 顺带重注册的 KaimingRelay/WanctlAgent/cert-sync 是其幂等本职，非本棒引入）。
- 没碰 game/、没碰 social-server 业务代码。e2e/loadtest 脚本是 scratchpad 里的独立副本，未改仓库内 test/。
- 部署后把 social.db 重置成干净初始态（压测/e2e 灌的一次性账号清掉，schema 自动重建），现库仅剩 1 个 postreset 冒烟账号（无害，游戏用户自行注册）。

## 对外端点（交接）

- HTTP：`https://zm-dev.qmledmq.cn:8443/social/*`（如 `/social/auth/register`、`/social/rooms`）
- WS：`wss://zm-dev.qmledmq.cn:8443/social/ws`
- 内部：WSL `127.0.0.1:7100`（unit zmxy-social）
