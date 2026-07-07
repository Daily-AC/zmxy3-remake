# Home-side half of the packaging acceptance chain (mac-side: build-and-ship.sh / acceptance.sh).
# Produces two independent pieces of evidence per run:
#
#   1. CAPTURE_OK <path>   — capturePage() self-capture, the load-bearing proof that the
#      packaged game renders correctly. Reads the renderer's frame buffer directly, so it
#      doesn't depend on what's happening on the screen-presentation path. This is what
#      gates the script's exit code.
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
# Prints "CAPTURE_OK <path>" / "CAPTURE_FAILED: ..." / "CAPTURE_EMPTY: ..." / "CAPTURE_TIMEOUT: ..."
# (grepped by acceptance.sh for CAPTURE_OK) and "DESKTOP_SHOT <path>" / "DESKTOP_SHOT_SKIPPED: ...".

param(
  [string]$ExePath = "$env:USERPROFILE\zmxy3-spike\unpacked\win-unpacked\ZMXY3RemakeSpike.exe",
  [string]$UserDataDir = "$env:USERPROFILE\AppData\Roaming\zmxy3-desktop-spike",
  [string]$RunAsUser = "zyl\Yilin Zhang",
  [int]$BootWaitSeconds = 8,
  [int]$CaptureTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"
$interactiveTaskName = "ZMXY3AcceptanceInteractive"

function Stop-Game {
  Get-Process ZMXY3RemakeSpike -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}

# ---------- Phase 1: capturePage proof (isolated session) ----------

Write-Output "==> [capturePage] stopping any previous run"
Stop-Game
Remove-Item "$UserDataDir\CAPTURE_NOW" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\captured-frame.png" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\capture-result.json" -ErrorAction SilentlyContinue

Write-Output "==> [capturePage] launching (isolated session)"
Start-Process -FilePath $ExePath

Write-Output "==> [capturePage] waiting ${BootWaitSeconds}s for the scene to settle"
Start-Sleep -Seconds $BootWaitSeconds

Write-Output "==> [capturePage] triggering capture"
New-Item -ItemType File -Force -Path "$UserDataDir\CAPTURE_NOW" | Out-Null

$resultPath = "$UserDataDir\capture-result.json"
$deadline = (Get-Date).AddSeconds($CaptureTimeoutSeconds)
$captureOutcome = $null
while ((Get-Date) -lt $deadline) {
  if (Test-Path $resultPath) {
    $result = Get-Content $resultPath -Raw | ConvertFrom-Json
    if ($result.ok -and $result.size -gt 0) {
      $captureOutcome = "CAPTURE_OK $UserDataDir\captured-frame.png"
    } elseif ($result.ok) {
      $captureOutcome = "CAPTURE_EMPTY: capturePage resolved but returned a 0-byte/0x0 image (dims=$($result.dims | ConvertTo-Json -Compress))"
    } else {
      $captureOutcome = "CAPTURE_FAILED: $($result.error)"
    }
    break
  }
  Start-Sleep -Milliseconds 500
}
if (-not $captureOutcome) {
  $captureOutcome = "CAPTURE_TIMEOUT: no result after ${CaptureTimeoutSeconds}s"
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

Write-Output $captureOutcome
Write-Output $desktopOutcome

if ($captureOutcome -like "CAPTURE_OK*") {
  exit 0
}

Write-Output "--- recent spike.log ---"
Get-Content "$UserDataDir\spike.log" -Tail 15 -ErrorAction SilentlyContinue
exit 2
