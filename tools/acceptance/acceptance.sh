#!/usr/bin/env bash
# One-command packaging acceptance check: build, ship to home, run a scripted playthrough
# there (menu -> new game -> select 悟空 -> battle -> combo attack -> skill cast -> pick up
# a drop -> talk to 太上老君 -> craft + equip a real item -> clear level 1's boss -> portal),
# and pull back one capturePage() screenshot per step plus a supplementary honest desktop
# screenshot. See tools/acceptance/README.md, tools/acceptance/playthrough-script.json, and
# docs/research/packaging-spike.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$REPO_ROOT/tmp/debug-shots/acceptance-$STAMP"
mkdir -p "$OUT_DIR"

unset https_proxy http_proxy all_proxy 2>/dev/null || true

"$SCRIPT_DIR/build-and-ship.sh"

echo "==> running on home: scripted playthrough (x1) + honest desktop screenshot (x1)"
# ssh from a Windows/PowerShell target returns CRLF line endings; strip the \r so later
# grep/parsing on this string doesn't get corrupted (e.g. a path with a trailing \r fails
# scp with a confusing "protocol error: filename does not match request").
RESULT="$(ssh home 'powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\zmxy3-spike\run-and-capture.ps1"' 2>&1 | tr -d '\r')"
echo "$RESULT"

PLAYTHROUGH_LINE="$(echo "$RESULT" | grep -E "^PLAYTHROUGH_(OK|PARTIAL_FAIL|TIMEOUT)" || true)"

if [ -z "$PLAYTHROUGH_LINE" ]; then
  echo ""
  echo "==> ACCEPTANCE FAILED — no PLAYTHROUGH_* line in output, see diagnostic output above"
  exit 1
fi

# Pull back every step that reports a captured file. STEP lines look like:
#   "STEP 05-confirm-enter-battle OK step-05-confirm-enter-battle.png"
#   "STEP 04-select-wukong OK"                              (no capture for this step)
#   "STEP 19-submit-craft FAIL <error text...>"
PULLED=0
FAILED_STEPS=0
while IFS= read -r line; do
  case "$line" in
    "STEP "*" FAIL "*)
      FAILED_STEPS=$((FAILED_STEPS + 1))
      echo "  [FAIL] $line"
      ;;
    "STEP "*" OK "*.png)
      remote_file="${line##* }"
      local_step_id="$(echo "$line" | awk '{print $2}')"
      if scp -O "home:AppData/Roaming/zmxy3-desktop-spike/$remote_file" "$OUT_DIR/$local_step_id.png" 2>/dev/null; then
        PULLED=$((PULLED + 1))
      else
        echo "  [WARN] scp failed for $remote_file (step $local_step_id)"
      fi
      ;;
  esac
done <<< "$RESULT"

DESKTOP_LOCAL=""
DESKTOP_LINE="$(echo "$RESULT" | grep "^DESKTOP_SHOT " || true)"
if [ -n "$DESKTOP_LINE" ]; then
  REMOTE_WIN_PATH="${DESKTOP_LINE#DESKTOP_SHOT }"
  # C:\Projects\screenshots\foo.png -> /Projects/screenshots/foo.png (scp -O's absolute-path form for this host)
  REMOTE_SCP_PATH="$(echo "$REMOTE_WIN_PATH" | sed -E 's/^[A-Za-z]://' | tr '\\' '/')"
  DESKTOP_LOCAL="$OUT_DIR/desktop.png"
  if ! scp -O "home:${REMOTE_SCP_PATH}" "$DESKTOP_LOCAL"; then
    echo "==> (desktop screenshot fetch failed, continuing — it's supplementary evidence)"
    DESKTOP_LOCAL=""
  fi
fi

echo ""
if [ "$PLAYTHROUGH_LINE" = "PLAYTHROUGH_OK" ]; then
  echo "==> ACCEPTANCE PASSED (all playthrough steps succeeded)"
else
  echo "==> ACCEPTANCE PARTIAL/FAILED — $PLAYTHROUGH_LINE ($FAILED_STEPS step(s) failed, see [FAIL] lines above)"
fi
echo "playthrough evidence ($PULLED screenshots, one per scripted step): $OUT_DIR/"
if [ -n "$DESKTOP_LOCAL" ]; then
  echo "desktop screenshot (honest on-screen state, may still be blank): $DESKTOP_LOCAL"
else
  echo "desktop screenshot: not captured this run (see DESKTOP_SHOT_SKIPPED reason above)"
fi

if [ "$PLAYTHROUGH_LINE" != "PLAYTHROUGH_OK" ]; then
  exit 1
fi
