#!/usr/bin/env bash
# Rebuilds game/dist and copies it into this dir as ./renderer for electron to load via loadFile().
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$SCRIPT_DIR/../../../game"

(cd "$GAME_DIR" && npm run build)

rm -rf "$SCRIPT_DIR/renderer"
cp -r "$GAME_DIR/dist" "$SCRIPT_DIR/renderer"
echo "synced game/dist -> $SCRIPT_DIR/renderer"
