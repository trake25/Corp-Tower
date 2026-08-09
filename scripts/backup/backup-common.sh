#!/usr/bin/env bash
# SAFETY EXCEPTION to the no-source-comments convention (CLAUDE.md): this
# file is committed to a public repo. It must never hold credential values —
# those live only in the gitignored, machine-local STATE_DIR/.env.backup,
# which load_env reads at runtime and enforces 0600 permissions on.

set -euo pipefail

SCRIPT_DIR_COMMON="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${CORP_TOWER_REPO_ROOT:-$(cd "$SCRIPT_DIR_COMMON/../.." && pwd)}"
STATE_DIR="${CORP_TOWER_BACKUP_STATE_DIR:-$HOME/corp-tower-server-backup}"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "  $*"; }

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 \
      || die "$cmd not found — required: docker, cloudflared, git, curl, jq"
  done
}

load_env() {
  local env_file="$STATE_DIR/.env.backup"
  [ -f "$env_file" ] || die "missing $env_file — copy scripts/backup/.env.backup.example there and fill it in"

  local perms
  perms="$(stat -c '%a' "$env_file")"
  if [ "$perms" != "600" ]; then
    info "tightening $env_file permissions ($perms -> 600)"
    chmod 600 "$env_file"
  fi

  # shellcheck disable=SC1090
  set -a; source "$env_file"; set +a

  : "${CLOUDFLARE_API_TOKEN:?not set in .env.backup}"
  : "${CLOUDFLARE_ZONE_ID:?not set in .env.backup}"
  : "${CLOUDFLARE_TUNNEL_ID:?not set in .env.backup}"
}

# Loads env and requires WS<n>_DOMAIN / WS<n>_PORT for the given game server
# instance (1, 2, or 3). Values are read via indirect expansion so one
# function serves every instance instead of near-duplicate copies.
load_ws_env() {
  load_env
  local n="$1" domain_var port_var domain_val port_val
  domain_var="WS${n}_DOMAIN"
  port_var="WS${n}_PORT"
  domain_val="${!domain_var:-}"
  port_val="${!port_var:-}"
  [ -n "$domain_val" ] || die "$domain_var not set in .env.backup"
  [ -n "$port_val" ] || die "$port_var not set in .env.backup"
}

# Loads env and requires WEB<n>_DOMAIN / WEB<n>_PORT for the given web server
# instance (1, 2, or 3).
load_web_env() {
  load_env
  local n="$1" domain_var port_var domain_val port_val
  domain_var="WEB${n}_DOMAIN"
  port_var="WEB${n}_PORT"
  domain_val="${!domain_var:-}"
  port_val="${!port_var:-}"
  [ -n "$domain_val" ] || die "$domain_var not set in .env.backup"
  [ -n "$port_val" ] || die "$port_var not set in .env.backup"
}

# Rewrites KEY=... in STATE_DIR/.env.backup in place. Used by the up scripts
# to self-record the commit/build SHA they just deployed.
set_env_value() {
  local key="$1" value="$2" env_file="$STATE_DIR/.env.backup"
  sed -i "s#^${key}=.*#${key}=${value}#" "$env_file"
}

# Looks up the DNS record for $1 (CNAME) and PATCHes it to $2 if it exists,
# otherwise POSTs a new one. Requires CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID
# from load_env. Prints nothing sensitive — the Cloudflare response body never
# echoes the request's bearer token, only record data.
upsert_cloudflare_cname() {
  local name="$1" target="$2"
  local existing_record_id cloudflare_response cloudflare_success

  existing_record_id="$(
    curl -fsS \
      --connect-timeout 10 --retry 2 --retry-all-errors --retry-delay 2 \
      --max-time 15 \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --get "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
      --data-urlencode "type=CNAME" \
      --data-urlencode "name=${name}" \
    | jq -r '.result[0].id // empty'
  )"

  if [ -n "$existing_record_id" ]; then
    cloudflare_response="$(
      curl -fsS \
        --connect-timeout 10 --retry 2 --retry-all-errors --retry-delay 2 \
        --max-time 15 \
        -X PATCH \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${existing_record_id}" \
        --data "$(jq -n --arg target "$target" '{content:$target,proxied:true}')"
    )"
  else
    cloudflare_response="$(
      curl -fsS \
        --connect-timeout 10 --retry 2 --retry-all-errors --retry-delay 2 \
        --max-time 15 \
        -X POST \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
        --data "$(jq -n --arg name "$name" --arg target "$target" '{type:"CNAME",name:$name,content:$target,ttl:60,proxied:true}')"
    )"
  fi

  cloudflare_success="$(printf '%s\n' "$cloudflare_response" | jq -r '.success')"
  [ "$cloudflare_success" = "true" ] || die "Cloudflare DNS update failed: $cloudflare_response"
}

# Confirms $1's CNAME content is $2 by re-reading it back from the
# Cloudflare API — NOT via `dig`. Proxied (orange-cloud) records never
# expose a literal CNAME to public resolvers (Cloudflare resolves them
# straight to its own anycast A/AAAA addresses instead), so `dig +short
# $name CNAME` is empty for a correctly-configured proxied record — checking
# it would always time out and declare a working cutover as failed. The
# Cloudflare API reflects a write immediately, so this needs no propagation
# wait; the retry loop is just a safety margin against a transient API read.
wait_for_cname() {
  local name="$1" expected_target="$2" seen
  for _ in $(seq 1 5); do
    seen="$(
      curl -fsS \
        --connect-timeout 10 --retry 2 --retry-all-errors --retry-delay 2 \
        --max-time 15 \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        --get "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
        --data-urlencode "type=CNAME" \
        --data-urlencode "name=${name}" \
      | jq -r '.result[0].content // empty'
    )"
    [ "$seen" = "$expected_target" ] && return 0
    sleep 1
  done
  die "$name's DNS record content is '${seen:-<none>}', expected '$expected_target' — check Cloudflare dashboard"
}

# All six backup containers (corp-tower-server-1/2/3, corp-tower-web-1/2/3)
# share one cloudflared user service. Starting is always safe/idempotent;
# stopping must only happen when none of the six is still running, so
# tearing one down doesn't cut the tunnel out from under the others.
start_cloudflared_if_needed() {
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if systemctl --user is-active --quiet cloudflared; then
    info "cloudflared already running"
  else
    info "Starting cloudflared (user service)"
    systemctl --user start cloudflared
  fi
}

stop_cloudflared_if_idle() {
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  for name in corp-tower-server-1 corp-tower-server-2 corp-tower-server-3 corp-tower-web-1 corp-tower-web-2 corp-tower-web-3; do
    if docker ps --filter "name=${name}" --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -q .; then
      info "Leaving cloudflared running — ${name} is still active"
      return 0
    fi
  done
  info "Stopping cloudflared"
  systemctl --user stop cloudflared || true
}
