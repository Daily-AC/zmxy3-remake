# home (zyl) machine setup for zmxy3-remake

Date: 2026-07-07. Role of this machine: Windows build host + real-machine exe acceptance environment + agent-server (NPC backend) host, later bound to zm-dev.qmledmq.cn.

Connection topology, SSH aliases (`home` = Windows, `home-wsl` = WSL Ubuntu-24.04), proxy and modem port-forward tooling: see the `winhome-infra` skill / `C:\infra` README. Nothing in existing services, scheduled tasks, or port mappings was modified, except one new scheduled task documented below.

## Windows side

- Node v24.18.0, git 2.54.0.windows.1, gh 2.95.0 — all preinstalled, nothing new installed via winget.
- gh auth: the stored Daily-AC token had expired. Fixed by piping a fresh token from the Mac's keyring over ssh stdin (`gh auth token | ssh home "gh auth login --with-token"`); the token never appeared on screen or in a shell history. `gh auth status` now green for Daily-AC.
- Repo cloned to `C:\Projects\zmxy3-remake` (via `gh repo clone`, https protocol, gh credential helper).
- Build verified: `cd game && npm install && npm run build` → `tsc --noEmit` clean, vite build OK, `dist/index.html` + `dist/assets/index-*.js` produced. Note: vite warns about one 1.69 MB chunk — project-level concern, not an environment one.

### Screenshot tool (for remote exe acceptance)

- Script: `C:\Projects\screenshot.ps1` (PowerShell native, `Graphics.CopyFromScreen` over the virtual screen, saves timestamped PNG to `C:\Projects\screenshots\`).
- **Pitfall: it cannot run directly in an ssh session** — no interactive desktop handle, `CopyFromScreen` throws "The handle is invalid" and you get a small black PNG. The working path is a scheduled task with an Interactive logon type that runs in the console session:
  - Task `ZmxyScreenshot` is registered (principal "Yilin Zhang", LogonType Interactive, no trigger — run on demand).
  - Usage from ssh: `Start-ScheduledTask ZmxyScreenshot; Start-Sleep 4; Get-ChildItem C:\Projects\screenshots | Sort LastWriteTime -Desc | Select -First 1`
  - Requires the user to be logged on at the console (check with `quser`); a locked/absent session yields black frames.
- Verified end-to-end: 694 KB PNG of the real desktop pulled back and visually inspected. Capture resolution is the DPI-scaled logical resolution (1707×1067 here), fine for acceptance.
- To fetch a PNG over ssh (scp is broken against this host's PowerShell default shell): `ssh home "[Convert]::ToBase64String([IO.File]::ReadAllBytes('<path>'))" | base64 -d > out.png`

## WSL side (agent-server host)

- Node v24.18.0 via nvm 0.40.3 (`nvm install --lts`), no sudo needed. **Pitfall:** the nvm installer only edits `~/.bashrc`, which Ubuntu skips for non-interactive shells, so ssh-executed commands couldn't see node; fixed by adding the `NVM_DIR` init lines and `~/.opencode/bin` + `~/.local/bin` PATH entries to `~/.profile`.
- gh 2.95.0 installed as a plain binary in `~/.local/bin` (no sudo apt), authenticated the same stdin-pipe way, `gh auth setup-git` wires the git credential helper.
- Repo cloned to `~/projects/zmxy3-remake`; `cd agent-server && npm install` OK, `npx tsc --noEmit` exits clean (zero errors).
- Outbound network from WSL goes through the local proxy `http://127.0.0.1:7890` (login-shell env already exports it; remember systemd services do NOT inherit it — see winhome-infra notes).

### opencode + DeepSeek

- opencode 1.17.14 installed via the official installer (`curl -fsSL https://opencode.ai/install | bash`) into `~/.opencode/bin`.
- `DEEPSEEK_API_KEY` provisioned into `~/.profile` (chmod 600) by piping the value from the Mac over ssh — the value never entered any conversation, log, or command line, and is not stored anywhere else on the machine.
- `~/.config/opencode/opencode.json` configures the deepseek provider with `"apiKey": "{env:DEEPSEEK_API_KEY}"` — env reference only, no literal.
- Verified: `opencode models` lists `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`; `opencode run -m deepseek/deepseek-v4-flash "回复ok"` returns `ok`.

## Untouched / observed

- packaging-spike agent activity confirmed live on the Windows desktop (ZMXY3RemakeSpike Electron window, `~/zmxy3-spike/unpacked/win-unpacked` work). Not touched.
- All existing services (Caddy, ddns-go, sshd, kaiming relay, wanctl) and modem port-forward rules untouched.
