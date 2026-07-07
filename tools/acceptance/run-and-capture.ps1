# Home-side half of the packaging acceptance chain (mac-side: build-and-ship.sh / acceptance.sh).
# Produces two independent pieces of evidence per run:
#
#   1. A scripted playthrough (menu -> new game -> select 悟空 -> battle -> combo attack ->
#      skill cast -> pick up a drop -> talk to 太上老君 -> craft + equip a real item via the
#      agent-server round trip -> clear level 1's boss and walk through the portal), driving
#      the game through its own `window.__*` acceptance hooks (BattleScene.exposeDebugHooks)
#      rather than simulated OS input — those hooks exist specifically for this and are more
#      reliable than trying to get real keystrokes into a window that may not even be
#      visible/focused in this launch session (see the isolated-vs-interactive split below).
#      Each step captures via `capturePage()`, which reads the renderer's own frame buffer
#      directly, independent of the window's screen-presentation path (packaging-spike.md
#      section 7) — this is what gates the script's exit code (PLAYTHROUGH_OK/PARTIAL/TIMEOUT).
#      The step sequence lives in tools/acceptance/playthrough-script.json, not in this file,
#      so it can be edited without touching the runner.
#   2. DESKTOP_SHOT <path> — a real desktop screenshot via the ZmxyScreenshot scheduled
#      task (another session's tooling, reused here rather than rebuilt — see
#      docs/research/home-setup.md). Honest current on-screen state: as of 2026-07-07 this
#      still shows the game window's title/menu chrome but a blank content area (see
#      docs/research/packaging-spike.md section 6-8) — a known, separately-tracked issue,
#      not something this script papers over. Non-fatal if it fails (missing task, no one
#      logged on at console, etc.) since it's supplementary, not the acceptance gate.
#
# Launch-method split (see docs/research/packaging-spike.md section 8): a plain
# Start-Process from this SSH session lands the exe in an isolated, non-interactive window
# station — invisible to a human at the console — but capturePage() reliably returns a
# real, correctly-rendered frame from it (repro'd multiple times). A Scheduled Task run
# with the logged-on user's interactive token (LogonType=3) lands in the real console
# session with a screen-eligible window instead, but capturePage() reproducibly returns an
# empty 0x0 image from THAT launch path (also repro'd multiple times) — so the two capture
# methods each need their own launch of the exe, run one at a time.
#
# Output contract (parsed by acceptance.sh):
#   "PLAYTHROUGH_OK" / "PLAYTHROUGH_PARTIAL_FAIL" / "PLAYTHROUGH_TIMEOUT: ..."
#   "STEP <id> OK [<capturedFileName>]" / "STEP <id> FAIL <error>"  (one per script step)
#   "DESKTOP_SHOT <path>" / "DESKTOP_SHOT_SKIPPED: ..."

param(
  [string]$ExePath = "$env:USERPROFILE\zmxy3-spike\unpacked\win-unpacked\ZMXY3RemakeSpike.exe",
  [string]$UserDataDir = "$env:USERPROFILE\AppData\Roaming\zmxy3-desktop-spike",
  [string]$ScriptPath = "$env:USERPROFILE\zmxy3-spike\playthrough-script.json",
  [string]$RunAsUser = "zyl\Yilin Zhang",
  [int]$BootWaitSeconds = 8,
  [int]$ScriptTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$interactiveTaskName = "ZMXY3AcceptanceInteractive"

function Stop-Game {
  Get-Process ZMXY3RemakeSpike -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}

# ---------- Phase 1: scripted playthrough (isolated session) ----------

Write-Output "==> [playthrough] stopping any previous run"
Stop-Game
Remove-Item "$UserDataDir\RUN_SCRIPT" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\SCRIPT_RESULT.json" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\step-*.png" -ErrorAction SilentlyContinue

Write-Output "==> [playthrough] launching (isolated session)"
Start-Process -FilePath $ExePath

Write-Output "==> [playthrough] waiting ${BootWaitSeconds}s for boot"
Start-Sleep -Seconds $BootWaitSeconds

Write-Output "==> [playthrough] shipping script + triggering run"
Copy-Item -LiteralPath $ScriptPath -Destination "$UserDataDir\playthrough-script.json" -Force
Set-Content -LiteralPath "$UserDataDir\RUN_SCRIPT" -Value "$UserDataDir\playthrough-script.json" -NoNewline

$resultPath = "$UserDataDir\SCRIPT_RESULT.json"
$deadline = (Get-Date).AddSeconds($ScriptTimeoutSeconds)
$scriptResult = $null
while ((Get-Date) -lt $deadline) {
  if (Test-Path $resultPath) {
    $scriptResult = Get-Content $resultPath -Raw | ConvertFrom-Json
    break
  }
  Start-Sleep -Seconds 1
}

$playthroughOutcome = $null
$stepLines = @()
if ($null -eq $scriptResult) {
  $playthroughOutcome = "PLAYTHROUGH_TIMEOUT: no SCRIPT_RESULT.json after ${ScriptTimeoutSeconds}s"
} else {
  $playthroughOutcome = if ($scriptResult.ok) { "PLAYTHROUGH_OK" } else { "PLAYTHROUGH_PARTIAL_FAIL" }
  foreach ($step in $scriptResult.steps) {
    if ($step.ok) {
      if ($step.capture) {
        $fileName = Split-Path $step.capture.file -Leaf
        $stepLines += "STEP $($step.id) OK $fileName"
      } else {
        $stepLines += "STEP $($step.id) OK"
      }
    } else {
      $stepLines += "STEP $($step.id) FAIL $($step.error)"
    }
  }
}
Stop-Game

# ---------- Phase 2: honest on-screen desktop screenshot (interactive session) ----------

$desktopOutcome = $null
$consoleUser = (quser 2>&1 | Select-String -Pattern "Active")
if (-not $consoleUser) {
  $desktopOutcome = "DESKTOP_SHOT_SKIPPED: no user has an Active console session (quser found none)"
} elseif (-not (Get-ScheduledTask -TaskName ZmxyScreenshot -ErrorAction SilentlyContinue)) {
  $desktopOutcome = "DESKTOP_SHOT_SKIPPED: ZmxyScreenshot scheduled task not found on this host"
} else {
  Write-Output "==> [desktop] launching (interactive session)"
  $service = New-Object -ComObject Schedule.Service
  $service.Connect()
  $rootFolder = $service.GetFolder("\")
  try { $rootFolder.DeleteTask($interactiveTaskName, 0) } catch {}
  $taskDef = $service.NewTask(0)
  $taskDef.Settings.Enabled = $true
  $taskDef.Settings.AllowDemandStart = $true
  $action = $taskDef.Actions.Create(0)
  $action.Path = $ExePath
  $principal = $taskDef.Principal
  $principal.UserId = $RunAsUser
  $principal.LogonType = 3
  $rootFolder.RegisterTaskDefinition($interactiveTaskName, $taskDef, 6, $null, $null, 3) | Out-Null
  $rootFolder.GetTask("\$interactiveTaskName").Run($null) | Out-Null

  Write-Output "==> [desktop] waiting ${BootWaitSeconds}s for the scene to settle"
  Start-Sleep -Seconds $BootWaitSeconds

  Write-Output "==> [desktop] triggering ZmxyScreenshot"
  Start-ScheduledTask ZmxyScreenshot
  Start-Sleep -Seconds 4
  $shot = Get-ChildItem C:\Projects\screenshots -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($shot) {
    $desktopOutcome = "DESKTOP_SHOT $($shot.FullName)"
  } else {
    $desktopOutcome = "DESKTOP_SHOT_SKIPPED: no file appeared in C:\Projects\screenshots"
  }

  try { $rootFolder.DeleteTask($interactiveTaskName, 0) } catch {}
  Stop-Game
}

Write-Output $playthroughOutcome
foreach ($line in $stepLines) { Write-Output $line }
Write-Output $desktopOutcome

if ($playthroughOutcome -eq "PLAYTHROUGH_OK") {
  exit 0
}

Write-Output "--- recent spike.log ---"
Get-Content "$UserDataDir\spike.log" -Tail 25 -ErrorAction SilentlyContinue
if ($playthroughOutcome -eq "PLAYTHROUGH_PARTIAL_FAIL") {
  exit 1
}
exit 2
