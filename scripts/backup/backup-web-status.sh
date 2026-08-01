#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

INSTANCE="${1:?usage: backup-web-status.sh <1|2|3>}"
case "$INSTANCE" in
  1|2|3) ;;
  *) die "instance must be 1, 2, or 3, got '$INSTANCE'" ;;
esac

CONTAINER_NAME="corp-tower-web-${INSTANCE}"
DOMAIN_VAR="WEB${INSTANCE}_DOMAIN"
SHA_VAR="CORP_TOWER_WEB${INSTANCE}_BUILD_SHA"

echo "--- container ---"
docker ps --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
  || echo "docker not available"

echo "--- cloudflared ---"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user is-active cloudflared 2>/dev/null || echo "inactive"

domain=""
build_sha=""
env_file="$STATE_DIR/.env.backup"
if [ -f "$env_file" ]; then
  # shellcheck disable=SC1090
  set -a; source "$env_file"; set +a
  domain="${!DOMAIN_VAR:-}"
  build_sha="${!SHA_VAR:-}"
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

echo "--- build freshness ---"
if [ -z "$build_sha" ]; then
  echo "no ${SHA_VAR} recorded — web backup instance $INSTANCE has never been deployed"
elif [ -d "$REPO_ROOT/.git" ]; then
  if git -C "$REPO_ROOT" fetch --quiet origin main 2>/dev/null; then
    main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)"
    if [ "$build_sha" = "$main_sha" ]; then
      echo "web backup instance $INSTANCE is serving ${build_sha:0:7} — up to date with origin/main"
    else
      behind="$(git -C "$REPO_ROOT" rev-list --count "${build_sha}..origin/main" 2>/dev/null || echo "?")"
      echo "web backup instance $INSTANCE is serving ${build_sha:0:7} (${behind} commits behind origin/main)"
    fi
  else
    echo "web backup instance $INSTANCE is serving ${build_sha:0:7} (couldn't fetch origin/main to compare — offline?)"
  fi
else
  echo "web backup instance $INSTANCE is serving ${build_sha:0:7} (repo not found at $REPO_ROOT to compare against)"
fi
