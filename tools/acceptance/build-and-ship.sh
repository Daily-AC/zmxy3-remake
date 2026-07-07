#!/usr/bin/env bash
# Builds game/dist, packages the Electron "dir" target, and ships it to home.
# Idempotent: safe to rerun. First run transfers the full win-unpacked tree (~307MB);
# later runs detect the base already exists on home and swap only app.asar (~28MB),
# which is the fast path for iterating on game changes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ELECTRON_DIR="$REPO_ROOT/tools/packaging/electron"
GAME_DIR="$REPO_ROOT/game"

# scp/ssh must not go through the HTTP proxy; electron's own binary download does.
unset https_proxy http_proxy all_proxy 2>/dev/null || true

echo "==> building game/dist"
(cd "$GAME_DIR" && npm run build)

echo "==> syncing renderer"
rm -rf "$ELECTRON_DIR/renderer"
cp -r "$GAME_DIR/dist" "$ELECTRON_DIR/renderer"

if [ ! -d "$ELECTRON_DIR/node_modules" ]; then
  echo "==> installing electron/electron-builder (first run only)"
  (cd "$ELECTRON_DIR" && ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install)
fi

echo "==> electron-builder --win dir --x64"
(cd "$ELECTRON_DIR" && ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npx electron-builder --win dir --x64)

ASAR="$ELECTRON_DIR/out/win-unpacked/resources/app.asar"

# A running exe memory-maps/locks app.asar; overwriting it while a previous run is still
# alive corrupts the scp transfer (surfaces as a confusing "Broken pipe", not a clear
# permission error). Always kill before shipping.
echo "==> stopping any process still holding the previous build's files"
ssh home 'Get-Process ZMXY3RemakeSpike -ErrorAction SilentlyContinue | Stop-Process -Force' 2>&1 || true

echo "==> checking whether home already has the win-unpacked base"
BASE_EXISTS="$(ssh home 'Test-Path "$env:USERPROFILE\zmxy3-spike\unpacked\win-unpacked\ZMXY3RemakeSpike.exe"' 2>&1 | tr -d '\r')"

if [ "$BASE_EXISTS" = "True" ]; then
  echo "==> base exists on home, shipping app.asar only (fast path)"
  scp -O "$ASAR" 'home:zmxy3-spike/unpacked/win-unpacked/resources/app.asar'
else
  echo "==> base missing on home, shipping full win-unpacked (first run, slower)"
  (cd "$ELECTRON_DIR/out" && rm -f win-unpacked.zip && zip -qr win-unpacked.zip win-unpacked)
  ssh home 'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\zmxy3-spike" | Out-Null'
  scp -O "$ELECTRON_DIR/out/win-unpacked.zip" 'home:zmxy3-spike/win-unpacked.zip'
  ssh home 'Expand-Archive -Path "$env:USERPROFILE\zmxy3-spike\win-unpacked.zip" -DestinationPath "$env:USERPROFILE\zmxy3-spike\unpacked" -Force'
fi

echo "==> shipping run-and-capture.ps1 + playthrough-script.json (kept in sync every run)"
scp -O "$SCRIPT_DIR/run-and-capture.ps1" 'home:zmxy3-spike/run-and-capture.ps1'
scp -O "$SCRIPT_DIR/playthrough-script.json" 'home:zmxy3-spike/playthrough-script.json'

echo "==> build-and-ship done"
