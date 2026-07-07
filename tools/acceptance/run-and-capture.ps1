# Home-side half of the packaging acceptance chain (mac-side: build-and-ship.sh / acceptance.sh).
# Kills any previous run, launches the packaged exe, waits for the scene to settle, then
# signals main.js to self-capture a frame via capturePage() and polls for the result.
#
# Launch method note (see docs/research/packaging-spike.md section 7): a plain
# Start-Process from this SSH session lands the exe in an isolated, non-interactive window
# station — invisible to a human at the console — but capturePage() reliably returns a
# real, correctly-rendered frame from it. The alternative (a Scheduled Task run with the
# logged-on user's interactive token, LogonType=3) *does* land in the real console session
# with a screen-eligible window, but on this host capturePage() reproducibly returns an
# empty 0x0 image from that launch path even though the window itself has normal bounds —
# repro'd 3/3 times. Root cause not identified (suspect interaction with the GameViewer
# virtual display adapter, which is presumably only attached for the real session); tracked
# as an open item, not solved by this script. This script uses plain Start-Process because
# that is what reliably produces the capturePage proof this tool exists to generate. It
# does NOT currently produce a human-visible on-screen window — that remains open.
#
# Prints "CAPTURE_OK <path>" on success (grepped by acceptance.sh) or a diagnostic on failure.

param(
  [string]$ExePath = "$env:USERPROFILE\zmxy3-spike\unpacked\win-unpacked\ZMXY3RemakeSpike.exe",
  [string]$UserDataDir = "$env:USERPROFILE\AppData\Roaming\zmxy3-desktop-spike",
  [int]$BootWaitSeconds = 8,
  [int]$CaptureTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

Write-Output "==> stopping any previous run"
Get-Process ZMXY3RemakeSpike -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Remove-Item "$UserDataDir\CAPTURE_NOW" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\captured-frame.png" -ErrorAction SilentlyContinue
Remove-Item "$UserDataDir\capture-result.json" -ErrorAction SilentlyContinue

Write-Output "==> launching"
Start-Process -FilePath $ExePath

Write-Output "==> waiting ${BootWaitSeconds}s for the scene to settle"
Start-Sleep -Seconds $BootWaitSeconds

Write-Output "==> triggering capture"
New-Item -ItemType File -Force -Path "$UserDataDir\CAPTURE_NOW" | Out-Null

$resultPath = "$UserDataDir\capture-result.json"
$deadline = (Get-Date).AddSeconds($CaptureTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $resultPath) {
    $result = Get-Content $resultPath -Raw | ConvertFrom-Json
    if ($result.ok -and $result.size -gt 0) {
      Write-Output "CAPTURE_OK $UserDataDir\captured-frame.png"
      exit 0
    } elseif ($result.ok) {
      Write-Output "CAPTURE_EMPTY: capturePage resolved but returned a 0-byte/0x0 image (dims=$($result.dims | ConvertTo-Json -Compress))"
      exit 1
    } else {
      Write-Output "CAPTURE_FAILED: $($result.error)"
      exit 1
    }
  }
  Start-Sleep -Milliseconds 500
}

Write-Output "CAPTURE_TIMEOUT: no result after ${CaptureTimeoutSeconds}s"
Write-Output "--- recent spike.log ---"
Get-Content "$UserDataDir\spike.log" -Tail 15 -ErrorAction SilentlyContinue
Write-Output "--- process state ---"
Get-Process ZMXY3RemakeSpike -ErrorAction SilentlyContinue | Select-Object Id, SessionId | Format-Table -AutoSize
exit 2
