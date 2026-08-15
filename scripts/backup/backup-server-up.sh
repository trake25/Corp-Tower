#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

INSTANCE="${1:?usage: backup-server-up.sh <1|2|3>}"
case "$INSTANCE" in
  1|2|3) ;;
  *) die "instance must be 1, 2, or 3, got '$INSTANCE'" ;;
esac

require_cmd docker cloudflared git curl jq
load_ws_env "$INSTANCE"

DOMAIN_VAR="WS${INSTANCE}_DOMAIN"
PORT_VAR="WS${INSTANCE}_PORT"
TAG_VAR="CORP_TOWER_WS${INSTANCE}_IMAGE_TAG"
DOMAIN="${!DOMAIN_VAR}"
PORT="${!PORT_VAR}"
EXPECTED_SHA="${!TAG_VAR:-}"

CONTAINER_NAME="corp-tower-server-${INSTANCE}"
IMAGE_TAG="corp-tower-server:dev${INSTANCE}"

[ -d "$REPO_ROOT/src/Server" ] || die "repo not found at $REPO_ROOT (set CORP_TOWER_REPO_ROOT if it lives elsewhere)"

current_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [ -n "$EXPECTED_SHA" ] && [ "$current_sha" != "$EXPECTED_SHA" ]; then
  info "Checked-out commit ($current_sha) differs from ${TAG_VAR} in .env.backup ($EXPECTED_SHA)."
  if [ -t 0 ]; then
    read -r -p "Continue building from $current_sha anyway? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "aborted — checkout the expected commit or update ${TAG_VAR}"
  else
    info "Non-interactive run (e.g. CI) — proceeding; dispatching the workflow was the confirmation."
  fi
fi

info "Building server image from $current_sha"
docker build -t "$IMAGE_TAG" -f "$REPO_ROOT/src/Server/Dockerfile" "$REPO_ROOT/src/Server"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
BOTS_ARGS=()
REDIS_ARGS=()
# Export SUPABASE_URL before running this script to turn token verification on;
# left unset the server stays on the client-supplied profile id path.
AUTH_ARGS=(
  -e "SUPABASE_URL=${SUPABASE_URL:-}"
  -e "SUPABASE_AUTH_REQUIRED=${SUPABASE_AUTH_REQUIRED:-false}"
)
if [ "$INSTANCE" = "3" ]; then
  BOTS_ARGS=(-e CORP_TOWER_BOTS_ENABLED=true)
  # The public demo counters (stats:demo:*) must survive this script's own
  # container recreate, not just a crash, so instance 3 alone gets a real,
  # persistent Redis instead of Redis_State.js's in-memory fallback.
  "$SCRIPT_DIR/backup-redis-up.sh"
  REDIS_ARGS=(--network corp-tower-backup -e REDIS_URL=redis://corp-tower-redis-demo:6379)
  info "Starting $CONTAINER_NAME on 127.0.0.1:$PORT (REDIS_URL set — persistent demo stats)"
else
  info "Starting $CONTAINER_NAME on 127.0.0.1:$PORT (no REDIS_URL — single-instance in-memory mode)"
fi
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:3000" \
  "${BOTS_ARGS[@]}" \
  "${REDIS_ARGS[@]}" \
  "${AUTH_ARGS[@]}" \
  "$IMAGE_TAG"

start_cloudflared_if_needed

info "Upserting Cloudflare DNS record for $DOMAIN"
tunnel_target="${CLOUDFLARE_TUNNEL_ID}.cfargotunnel.com"
upsert_cloudflare_cname "$DOMAIN" "$tunnel_target"
wait_for_cname "$DOMAIN" "$tunnel_target"

info "Waiting for the server to report ready"
for attempt in $(seq 1 30); do
  if docker logs "$CONTAINER_NAME" 2>&1 | grep -q "WebSocket server running on port"; then
    info "Server is up. Backup instance $INSTANCE is serving wss://${DOMAIN}"
    set_env_value "$TAG_VAR" "$current_sha"
    exit 0
  fi
  sleep 1
done

die "Server did not report ready — check: docker logs $CONTAINER_NAME"
