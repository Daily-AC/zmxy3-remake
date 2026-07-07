#!/usr/bin/env bash
# One-command packaging acceptance check: build, ship to home, run there, pull back two
# pieces of evidence — a capturePage() frame-buffer proof (the acceptance gate) and a real
# desktop screenshot (honest on-screen state, reused from another session's tooling; not
# gating since the on-screen rendering issue is a known, separately-tracked open item).
# See tools/acceptance/README.md and docs/research/packaging-spike.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/tmp/debug-shots"
mkdir -p "$OUT_DIR"

unset https_proxy http_proxy all_proxy 2>/dev/null || true

"$SCRIPT_DIR/build-and-ship.sh"

echo "==> running on home: kill old -> launch -> wait -> capture (x2: capturePage + desktop)"
# ssh from a Windows/PowerShell target returns CRLF line endings; strip the \r so later
# grep/parsing on this string doesn't get corrupted (e.g. a path with a trailing \r fails
# scp with a confusing "protocol error: filename does not match request").
RESULT="$(ssh home 'powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\zmxy3-spike\run-and-capture.ps1"' 2>&1 | tr -d '\r')"
echo "$RESULT"

STAMP="$(date +%Y%m%d-%H%M%S)"

if ! echo "$RESULT" | grep -q "^CAPTURE_OK"; then
  echo ""
  echo "==> ACCEPTANCE FAILED — see diagnostic output above"
  exit 1
fi

CAPTURE_LOCAL="$OUT_DIR/acceptance-$STAMP.png"
scp -O 'home:AppData/Roaming/zmxy3-desktop-spike/captured-frame.png' "$CAPTURE_LOCAL"

DESKTOP_LOCAL=""
DESKTOP_LINE="$(echo "$RESULT" | grep "^DESKTOP_SHOT " || true)"
if [ -n "$DESKTOP_LINE" ]; then
  REMOTE_WIN_PATH="${DESKTOP_LINE#DESKTOP_SHOT }"
  # C:\Projects\screenshots\foo.png -> /Projects/screenshots/foo.png (scp -O's absolute-path form for this host)
  REMOTE_SCP_PATH="$(echo "$REMOTE_WIN_PATH" | sed -E 's/^[A-Za-z]://' | tr '\\' '/')"
  DESKTOP_LOCAL="$OUT_DIR/acceptance-desktop-$STAMP.png"
  if ! scp -O "home:${REMOTE_SCP_PATH}" "$DESKTOP_LOCAL"; then
    echo "==> (desktop screenshot fetch failed, continuing — it's supplementary evidence)"
    DESKTOP_LOCAL=""
  fi
fi

echo ""
echo "==> ACCEPTANCE PASSED"
echo "capturePage proof (game renders correctly, frame-buffer read):  $CAPTURE_LOCAL"
if [ -n "$DESKTOP_LOCAL" ]; then
  echo "desktop screenshot (honest on-screen state, may still be blank): $DESKTOP_LOCAL"
else
  echo "desktop screenshot: not captured this run (see DESKTOP_SHOT_SKIPPED reason above)"
fi
