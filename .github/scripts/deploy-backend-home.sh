#!/usr/bin/env bash
set -euo pipefail

service=${1:?usage: deploy-backend-home.sh agent|social}
case "$service" in
  agent)
    source_dir=${GITHUB_WORKSPACE:-$PWD}/agent-server
    unit=zmxy-agent
    smoke_url=ws://127.0.0.1:5181
    ;;
  social)
    source_dir=${GITHUB_WORKSPACE:-$PWD}/social-server
    unit=zmxy-social
    smoke_url=http://127.0.0.1:7100
    ;;
  *)
    echo "unknown backend: $service" >&2
    exit 2
    ;;
esac

deploy_root=/home/zyl/services/zaixu/$service
release_id=${GITHUB_SHA:-manual-$(date +%Y%m%d%H%M%S)}
release_dir=$deploy_root/releases/$release_id
stage_dir=$deploy_root/releases/.${release_id}.next
current_link=$deploy_root/current
previous=$(readlink -f "$current_link" 2>/dev/null || true)

rm -rf "$stage_dir"
mkdir -p "$stage_dir" "$deploy_root/releases"
rsync -a --delete --exclude data --exclude node_modules --exclude test "$source_dir/" "$stage_dir/"
npm ci --prefix "$stage_dir"

if [[ "$service" == social ]]; then
  shared_data=$deploy_root/shared/data
  mkdir -p "$shared_data"
  rm -rf "$stage_dir/data"
  ln -s ../../shared/data "$stage_dir/data"
fi

rm -rf "$release_dir"
mv "$stage_dir" "$release_dir"
ln -sfn "$release_dir" "$deploy_root/.current.next"
mv -Tf "$deploy_root/.current.next" "$current_link"

rollback() {
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" "$deploy_root/.current.rollback"
    mv -Tf "$deploy_root/.current.rollback" "$current_link"
    sudo -n systemctl restart "$unit"
  fi
}
trap 'rollback' ERR

sudo -n systemctl restart "$unit"
for _ in {1..20}; do
  if sudo -n systemctl is-active --quiet "$unit"; then break; fi
  sleep 1
done
sudo -n systemctl is-active --quiet "$unit"

if [[ "$service" == social ]]; then
  status=$(curl --silent --output /tmp/zaixu-social-smoke.json --write-out '%{http_code}' \
    --retry 8 --retry-all-errors --retry-delay 1 \
    -H 'content-type: application/json' -d '{}' "$smoke_url/auth/register")
  [[ "$status" == 400 ]]
else
  (
    cd "$release_dir"
    SMOKE_URL="$smoke_url" node --input-type=module <<'NODE'
import WebSocket from 'ws'

const deadline = Date.now() + 30_000
let lastError = 'no connection attempt completed'

function retry() {
  if (Date.now() >= deadline) {
    console.error(`agent smoke test timed out: ${lastError}`)
    process.exit(1)
  }

  const socket = new WebSocket(process.env.SMOKE_URL)
  const attemptTimer = setTimeout(() => {
    lastError = 'connection attempt timed out'
    socket.terminate()
  }, 3_000)
  let receivedWelcome = false

  socket.once('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type !== 'welcome' || !Array.isArray(message.npcIds)) {
        throw new Error(`unexpected message: ${raw.toString()}`)
      }
      receivedWelcome = true
      clearTimeout(attemptTimer)
      socket.close()
      process.exit(0)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      socket.terminate()
    }
  })
  socket.once('error', (error) => {
    lastError = error.message
  })
  socket.once('close', () => {
    clearTimeout(attemptTimer)
    if (!receivedWelcome) setTimeout(retry, 500)
  })
}

retry()
NODE
  )
fi

trap - ERR
find "$deploy_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | awk 'NR > 3 { sub(/^[^ ]+ /, ""); print }' | xargs -r rm -rf
echo "$service deployed and verified: $release_id"
