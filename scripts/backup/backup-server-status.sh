#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

INSTANCE="${1:?usage: backup-server-status.sh <1|2|3>}"
case "$INSTANCE" in
  1|2|3) ;;
  *) die "instance must be 1, 2, or 3, got '$INSTANCE'" ;;
esac

CONTAINER_NAME="corp-tower-server-${INSTANCE}"
DOMAIN_VAR="WS${INSTANCE}_DOMAIN"

echo "--- container ---"
docker ps --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
  || echo "docker not available"

echo "--- cloudflared ---"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user is-active cloudflared 2>/dev/null || echo "inactive"

domain=""
env_file="$STATE_DIR/.env.backup"
if [ -f "$env_file" ]; then
  # shellcheck disable=SC1090
  set -a; source "$env_file"; set +a
  domain="${!DOMAIN_VAR:-}"
fi

echo "--- dns (${domain:-$DOMAIN_VAR not set}) ---"
if [ -n "$domain" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  curl -fsS \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --get "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    --data-urlencode "type=CNAME" \
    --data-urlencode "name=${domain}" \
    2>/dev/null | jq -r '.result[0] | if . then "content=\(.content) proxied=\(.proxied)" else "no CNAME record found" end' \
    || echo "Cloudflare API lookup failed"
else
  echo "no .env.backup Cloudflare credentials/domain loaded — can't query the API"
fi
