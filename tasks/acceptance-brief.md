# 任务书：一键验收链路 tools/acceptance/acceptance.sh

## 目标
终包验收自动化：一条命令完成 build → 出 Windows exe → 推 home → 静默安装/拉起 → 截屏回传 → 本地落证据。这是最终验收口径（CLAUDE.md：只看桌面安装包在 home 真机运行）。

## 必读（全部知识已踩坑落盘，照做别重新发明）
- `docs/research/packaging-spike.md` — electron-builder 交叉出 exe、scp -O 传输、schtasks 空格坑、capturePage 验证法
- `docs/research/home-setup.md` — home 依赖链、ZmxyScreenshot 计划任务（截屏走它）、base64 文件管道
- wanctl 用法见 wanctl skill（CLI 走 Bash）；home 设备名/连接细节以上述两文档为准

## 实现范围
1. `tools/acceptance/acceptance.sh`：串起 game build（vite build）→ electron-builder 出 exe → 传 home → 杀旧进程/静默装/拉起 → 等待 → 触发 ZmxyScreenshot → 回传截图到 `tmp/debug-shots/acceptance-<时间戳>.png` → 打印结论（成功/失败在哪步）。
2. 幂等：可重复跑；每步失败给出可读错误和重试提示；home 不可达时干净退出。
3. 用当前 repo 状态真实跑通一次全链路作为自测。

## 边界与纪律
- 只动 `tools/acceptance/`、tmp/。绝不动 game/src/、agent-server/（多 team 并行中）。
- commit 只 add 自己文件，不 git add -A；遇 index.lock 重试。不 push。
- 不改 home 上 Caddy/系统配置；只做部署验收动作。

## 验收判据
1. 真实跑通一次：本地出 exe → home 拉起 → 回传截图（游戏画面真实渲染，不是黑屏/桌面）落 tmp/debug-shots/。
2. 写 `tasks/acceptance-report.md`：脚本用法、每步依赖、失败模式排查表。

完成后返回：真实链路跑通证据（截图路径）+ commit hash + 遗留问题。