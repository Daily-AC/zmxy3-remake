# social-deploy 棒：social-server 部署 home + 真实网络压测（2026-07-08 23:0x）

## 目标

把已验收的 social-server（大厅层后端，remote master 上 146102e/a17a8c4）部署到 home 服务器常驻，公网可达，并拿到跨真实网络的压测数字（loopback P95=2ms 的下一层证据）。

## 先读

- winhome-infra skill（home 拓扑/连接方式/判障；wanctl 可用）
- docs/research/home-setup.md + progress.md 里 agent-server 部署账（2026-07-07 13:35 节）——**照它的模式做**：WSL systemd 服务 + Caddy 反代
- tasks/social-server-report.md（服务的接口/env/启动方式）

## 主会话已拍的架构决策

- **不新增公网入口（最小暴露）**：复用现有 vhost `zm-dev.qmledmq.cn:8443`，Caddy 加 `handle_path /social/*` 反代到 social-server 内部端口（建议 127.0.0.1:7100）。WS 走同路径。agent-server 现有路由行为必须零变化。
- Caddy 配置**只改 C:\infra\caddy 受控副本再 apply.ps1 -DeployCaddy**（-ExecutionPolicy Bypass），严禁直改 C:\Caddy——坑单在 progress 13:35 节。
- systemd unit `zmxy-social`（WSL）：照 zmxy-agent 的模式（bash -lc 拿 nvm；Restart=always；unit 挂 127.0.0.1:7890 代理环境变量防出网楔死）。
- **JWT_SECRET 在 home 主机上生成**（openssl rand -hex 32 > EnvironmentFile，600 权限），值绝不进对话、不进 git、不进本机文件——secret-vault 原则。
- 代码上 home 走 git pull（home 与 mac 同 gh 账号，先例如此；别用 wanctl 推包）。home 侧 npm install 正常出网（它不在 codex 沙箱里）。

## 验收判据（全部真实跑出留证）

1. home 上 `systemctl status zmxy-social` active；重启 WSL 后自愈（Restart=always 验证可选，至少 unit enabled）。
2. **mac 端跨公网 e2e**：对 `https://zm-dev.qmledmq.cn:8443/social/...` + `wss://.../social/...` 跑通注册→好友→建房→WS 广播→game_start 完整链路（social-server 的 e2e 脚本改 base URL 跑，或等价 curl+wscat 序列），输出留 report。
3. **跨公网扇出压测**：loadtest-fanout 改指向公网地址跑一轮，报 P95/P99/丢失数——这是"10 人不卡"的第一个真实网络数字（判据不设死线，如实报数供架构参考；若 P95 > 100ms 分析瓶颈在链路还是服务）。
4. agent-server 回归：`wss://zm-dev.qmledmq.cn:8443` 原路径 welcome[laojun] 仍通（零破坏证据）。
5. report 落 `tasks/social-deploy-report.md`：部署步骤/unit 文件/Caddy diff/压测数字/坑。

## 边界

- 不碰 game/、不碰 social-server 业务代码（发现 bug 报我，不就地改）；C:\infra 改动按受控副本流程 commit。
- home 是用户共享资源：只加不删，agent-server/既有服务零打扰；操作出错立即回滚并报告。
- commit 只 add C:\infra 侧（若该 repo 在管）与本 report；不 push 游戏 repo。
