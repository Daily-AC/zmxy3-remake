# frontend-deploy 报告：game 前端部署 zaixu.qmledmq.cn（2026-07-09 00:4x 定名收尾）

social-deploy 棒的续单（team-lead 派）。把 `game/` 前端静态站部署到 home 子域名，方便随时随地看。所有验收本会话跨公网真实跑出。

## 域名状态：已定名 zaixu.qmledmq.cn（2026-07-09 用户拍板收尾）

- **前端上线：`https://zaixu.qmledmq.cn:8443`**（最终 URL，手机/浏览器可达，带 :8443）。
- **正式后端预留：`zaixu-api.qmledmq.cn`**（尚未绑定；agent-server/social-server 现役仍在 zm-dev.qmledmq.cn，将来正式化再迁 zaixu-api，那是以后的棒）。
- **`zm.qmledmq.cn` 弃用**：撞了原规划里给正式后端的预留名，已整体空出。vhost 删除、C:\www\zm 目录改名 zaixu、主 Caddyfile import 换 zaixu-site。实测 zm.qmledmq.cn 现只落到 `*.qmledmq.cn` 通配占位块（任意路径回 45 字节 text/plain "Caddy wildcard..." 占位串，非游戏）——游戏在该名下彻底下线。
- **迁移改动面**（首轮绑 zm→本轮改 zaixu 实际做的）：C:\www\zm 改名 zaixu、新增 caddy/zaixu-site.Caddyfile 删 caddy/zm-site.Caddyfile、主 Caddyfile import 替换、删已部署孤儿 C:\Caddy\zm-site.Caddyfile、一键脚本 SITE 默认 zm→zaixu。**build/dist 内容零改动**（renamed 目录，未 rebuild）。C:\infra commit d3b37fe。

## 部署状态：闭环

- 从 remote master **d2cd5b7** 拉码（含 keyart 生成件 7d84b3a + 首屏接线 ebbf9b8 + 五人群像偏移终稿 d2cd5b7）在 home WSL build 出 dist，拷到 Windows 侧 `C:\www\zm`。
- Caddy 新 vhost `zm.qmledmq.cn:8443` 静态站（file_server），C:\infra commit **db35ac2**。
- 一键更新脚本落 home WSL `~/deploy-zm-frontend.sh`，后续每次 push 后可远程触发刷新。
- zm-dev 上 agent-server / social-server 零打扰回归通过。

## 验收结果

| 判据 | 结果 |
|---|---|
| curl https://zm.qmledmq.cn:8443 返回游戏 index（200 + 标题字符串） | **通过**。HTTP 200，`<title>造梦西游3 Remake</title>`；JS bundle 200（1.88MB）、keyart-home.png 200（3.38MB）均跨公网可取 |
| 浏览器打开截图游戏主菜单真实渲染（新水墨首屏） | **通过**。playwright 打开公网地址，5s 后截图：水墨键图五角色群像（悟空+队伍+第五个"?"神秘剪影，keyart 左移后未被菜单遮挡=d2cd5b7 修复生效）、金色宫殿+水墨云背景、标题"再续西游"毛笔书法、菜单五项全毛笔字。唯一 console error 是 favicon.ico 404（无害，dist 未放 favicon）|
| agent-server 零打扰回归 | **通过**。wss://zm-dev.qmledmq.cn:8443/ 根路径 welcome[laojun] 仍通 |
| social-server 零打扰回归 | **通过**。/social/me 401、/social/auth/login 坏凭证 401，均正常 |

## WS 地址：部署配置固化

game/src/net/npcClient.ts 解析优先级 query > env(VITE_NPC_SERVER_URL) > default(`ws://localhost:5181`)。默认是 dev 用的 localhost；部署态按代码注释（line 17）设计走 env 覆盖。**build 时喂 `VITE_NPC_SERVER_URL=wss://zm-dev.qmledmq.cn:8443`**（team-lead 批准，属部署配置非改码，default 不改），已固化进一键脚本 step 3。验证：dist bundle 里 baked in `wss://zm-dev.qmledmq.cn:8443`（并存的 localhost 字符串是未用的默认常量，运行时走 env）。

## 一键更新脚本（home WSL `~/deploy-zm-frontend.sh`）

后续每次 push 后远程触发：`ssh home-wsl 'bash ~/deploy-zm-frontend.sh'`。做四步：

1. `git -c http.proxy=http://127.0.0.1:7890 pull --ff-only`（origin/master）
2. `cd game && npm install`
3. `VITE_NPC_SERVER_URL=$NPC_WS npm run build`（WS 后端地址）
4. `cp -r dist/. /mnt/c/www/$SITE/`（先清空目标再拷；从 WSL 写 Windows 侧，Caddy 就地读，避开跨文件系统读取问题）

**两个变量（定名时改这里）**：脚本头部 `SITE`（默认 `zm`，= Caddy vhost 服务的 `C:\www\<SITE>` 目录名，跟前端子域名走）和 `NPC_WS`（默认 `wss://zm-dev.qmledmq.cn:8443`，= agent-server 后端，是另一个已稳定的独立域名，**不是**前端服务域名，定名前端时不用动它）。两者都支持 env 覆盖（`SITE=xxx bash ~/deploy-zm-frontend.sh`）。

脚本内显式挂 7890 代理 env + source nvm，不管怎么被调用都能出网/找到 node（非交互 ssh shell 不 source .profile 的坑）。

## Caddy vhost（`C:\infra\caddy\zm-site.Caddyfile`，commit db35ac2）

```caddy
zm.qmledmq.cn:8443 {
	tls C:/Caddy/certs/qmledmq.cn.crt C:/Caddy/certs/qmledmq.cn.key
	root * C:/www/zm
	encode gzip
	file_server
}
```

主 Caddyfile 追加 `import C:/Caddy/zm-site.Caddyfile`。zm.qmledmq.cn 是三级域，`*.qmledmq.cn` 通配 DNS（Cloudflare/DDNS）+ 通配证书都现成，无需动 DNS/证书。改 C:\infra 受控副本 → apply.ps1 -DeployCaddy（validate 通过后 reload，exit=0），严禁直改 C:\Caddy。

## 坑/注记

1. **静态资源要靠 vite 的 public/ 拷贝**：keyart 等在 game/public/assets/，vite build 自动拷进 dist/assets/，实测 dist/assets/generated/keyart-home.png 到位。不是手工搬。
2. **PowerShell over ssh 的嵌套引号/反引号会被 mac zsh 抢解析**：写 vhost 用 base64+WriteAllBytes；追加 import 用 Add-Content（自带换行，免反引号 `` `n ``）；分两个简单 ssh 调用，别一条复杂命令里塞 `\"`/backtick。
3. **HTML `<title>` 仍是旧品牌"造梦西游3 Remake"**（游戏内标题美术已是"再续西游"）。这是浏览器标签页标题，非本棒范围、非改码授权，报 team-lead 知会不擅改。
4. **bundle 1.88MB 单 chunk**（vite 警告 >500KB）：项目级性能事项，非部署问题，gzip 后 442KB。

## 边界遵守

- 只加不删：新增 zm vhost + C:\www\zm + WSL 脚本；zm-dev/agent-server/social-server/既有服务/端口映射零改动（apply.ps1 顺带幂等重注册的计划任务是其本职）。
- 没碰 game/ 业务代码：WS 地址走 build env（部署配置），default 未改。commit 只 add C:\infra 侧。
- git pull 只快进到 remote d2cd5b7，未推任何游戏 repo commit。

## 对外端点（交接）

- 游戏前端：**`https://zaixu.qmledmq.cn:8443`**（手机/任意浏览器可达，带 :8443）
- 刷新：push 后 `ssh home-wsl 'bash ~/deploy-zm-frontend.sh'`（脚本文件名沿用，CLAUDE.md §3b 记此路径；内部 SITE=zaixu）
- 内部：Windows `C:\www\zaixu`（Caddy file_server 根），WSL build 源 `~/projects/zmxy3-remake/game`
- 正式后端预留：`zaixu-api.qmledmq.cn`（未绑）；agent-server/social 现役在 zm-dev.qmledmq.cn:8443
- 复验（定名后跑过）：curl `https://zaixu.qmledmq.cn:8443` 200 + `<title>`、keyart 3385731 image/png；playwright 截图水墨首屏真实渲染；zm.qmledmq.cn 游戏下线（通配占位 45B）；zm-dev agent welcome[laojun] + /social/me 401 零打扰
