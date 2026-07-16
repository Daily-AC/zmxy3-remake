#!/usr/bin/env bash
set -euo pipefail

source_dir=${1:-game/dist}
target_dir=/mnt/c/www/zaixu-dev
stage_dir=/mnt/c/www/.zaixu-dev-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-0}

if [[ ! -f "$source_dir/index.html" ]]; then
  echo "missing frontend build: $source_dir/index.html" >&2
  exit 1
fi

cleanup() { rm -rf "$stage_dir"; }
trap cleanup EXIT

mkdir -p "$stage_dir" "$target_dir"
rsync -a --delete "$source_dir/" "$stage_dir/"

# Hashed assets are published first. The entry document is replaced last so
# clients never receive an index that points at files which are not present yet.
rsync -a --delete --exclude index.html "$stage_dir/" "$target_dir/"
install -m 0644 "$stage_dir/index.html" "$target_dir/index.html.next"
mv -f "$target_dir/index.html.next" "$target_dir/index.html"

curl --fail --silent --show-error --retry 8 --retry-all-errors \
  --retry-delay 1 https://zaixu-dev.qmledmq.cn:8443/ >/dev/null
echo "frontend deployed: ${GITHUB_SHA:-manual}"

