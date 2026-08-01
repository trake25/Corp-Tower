#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

INSTANCE="${1:?usage: backup-web-up.sh <1|2|3>}"
case "$INSTANCE" in
  1|2|3) ;;
  *) die "instance must be 1, 2, or 3, got '$INSTANCE'" ;;
esac

require_cmd docker cloudflared curl jq
load_web_env "$INSTANCE"

DOMAIN_VAR="WEB${INSTANCE}_DOMAIN"
PORT_VAR="WEB${INSTANCE}_PORT"
SHA_VAR="CORP_TOWER_WEB${INSTANCE}_BUILD_SHA"
DOMAIN="${!DOMAIN_VAR}"
PORT="${!PORT_VAR}"

CONTAINER_NAME="corp-tower-web-${INSTANCE}"
IMAGE="nginx:alpine"
CONTENT_DIR="$STATE_DIR/web-content-${INSTANCE}"

BUILD_DIR="${CORP_TOWER_WEB_BUILD_DIR:?set by the calling workflow to the exported build/web dir}"

[ -d "$BUILD_DIR" ] || die "web build dir not found at $BUILD_DIR"
[ -f "$BUILD_DIR/index.html" ] || die "$BUILD_DIR has no index.html — refusing to serve a broken/empty build"
find "$BUILD_DIR" -maxdepth 1 -name '*.wasm' -print -quit | grep -q . \
  || die "$BUILD_DIR has no .wasm file — refusing to serve a broken/empty build"

info "Syncing web build into $CONTENT_DIR"
rm -rf "$CONTENT_DIR"
mkdir -p "$CONTENT_DIR"
cp -r "$BUILD_DIR"/. "$CONTENT_DIR"/

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
info "Starting $CONTAINER_NAME on 127.0.0.1:$PORT"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:80" \
  -v "${CONTENT_DIR}:/usr/share/nginx/html:ro" \
  "$IMAGE"

info "Waiting for the web server to report ready"
ready=false
for _ in $(seq 1 15); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || die "web server did not come up — check: docker logs $CONTAINER_NAME"

start_cloudflared_if_needed

info "Upserting Cloudflare DNS record for $DOMAIN"
tunnel_target="${CLOUDFLARE_TUNNEL_ID}.cfargotunnel.com"
upsert_cloudflare_cname "$DOMAIN" "$tunnel_target"
wait_for_cname "$DOMAIN" "$tunnel_target"

if [ -n "${CORP_TOWER_WEB_BUILD_SHA:-}" ]; then
  set_env_value "$SHA_VAR" "$CORP_TOWER_WEB_BUILD_SHA"
fi

info "Backup instance $INSTANCE is now serving https://${DOMAIN}"
