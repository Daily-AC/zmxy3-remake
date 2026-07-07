#!/usr/bin/env bash
# One-command packaging acceptance check: build, ship to home, launch in home's real
# interactive session, self-capture a frame, pull it back. Prints the local screenshot
# path on success. See tools/acceptance/README.md and docs/research/packaging-spike.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/tmp/debug-shots"
mkdir -p "$OUT_DIR"

unset https_proxy http_proxy all_proxy 2>/dev/null || true

"$SCRIPT_DIR/build-and-ship.sh"

echo "==> running on home: kill old -> launch -> wait -> capture"
RESULT="$(ssh home 'powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\zmxy3-spike\run-and-capture.ps1"' 2>&1)"
echo "$RESULT"

if ! echo "$RESULT" | grep -q "^CAPTURE_OK"; then
  echo ""
  echo "==> ACCEPTANCE FAILED — see diagnostic output above"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_PATH="$OUT_DIR/acceptance-$STAMP.png"
scp -O 'home:AppData/Roaming/zmxy3-desktop-spike/captured-frame.png' "$LOCAL_PATH"

echo ""
echo "==> ACCEPTANCE PASSED"
echo "screenshot: $LOCAL_PATH"
