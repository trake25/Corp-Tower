#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/src/Client/App/corp-tower/Sys/NetMan/Endpoint_Config.gd"

: "${CORP_TOWER_WS_PRIMARY:?CORP_TOWER_WS_PRIMARY must be set (e.g. wss://wsplaytod.galaxxigames.com)}"
CORP_TOWER_WS_FAILOVER="${CORP_TOWER_WS_FAILOVER:-}"
CORP_TOWER_DEBUG_UI="${CORP_TOWER_DEBUG_UI:-true}"
CORP_TOWER_DEMO_MODE="${CORP_TOWER_DEMO_MODE:-false}"

# Auth is opt-in: an empty URL or key leaves AuthManager disabled and the client
# falls back to its locally generated profile id, which is the pre-Supabase
# behaviour. Both must be set for sign-in to engage.
CORP_TOWER_SUPABASE_URL="${CORP_TOWER_SUPABASE_URL:-}"
CORP_TOWER_SUPABASE_ANON_KEY="${CORP_TOWER_SUPABASE_ANON_KEY:-}"
CORP_TOWER_SUPABASE_URL="${CORP_TOWER_SUPABASE_URL%/}"

# OAuth rides on top of that: it needs a redirect target the platform can receive.
# Android uses the custom scheme baked into addons/DeeplinkPlugin/export.cfg, so
# only the web target is build-injected. Guest sign-in works without any of this.
CORP_TOWER_AUTH_OAUTH="${CORP_TOWER_AUTH_OAUTH:-false}"
CORP_TOWER_AUTH_REDIRECT_WEB="${CORP_TOWER_AUTH_REDIRECT_WEB:-}"

# Android only: the Google Cloud "Web application" OAuth client ID, reused as
# Credential Manager's serverClientId so the native account-picker flow issues
# an ID token Supabase already trusts. Empty disables native sign-in and
# Android falls back to the browser flow unconditionally.
CORP_TOWER_GOOGLE_SERVER_CLIENT_ID="${CORP_TOWER_GOOGLE_SERVER_CLIENT_ID:-}"
TOD_FACEBOOK_APP_ID="${TOD_FACEBOOK_APP_ID:-}"
TOD_FACEBOOK_CLIENT_TOKEN="${TOD_FACEBOOK_CLIENT_TOKEN:-}"

case "$CORP_TOWER_DEBUG_UI" in
  true|false) ;;
  *) echo "error: CORP_TOWER_DEBUG_UI must be 'true' or 'false', got '$CORP_TOWER_DEBUG_UI'" >&2; exit 1 ;;
esac

case "$CORP_TOWER_DEMO_MODE" in
  true|false) ;;
  *) echo "error: CORP_TOWER_DEMO_MODE must be 'true' or 'false', got '$CORP_TOWER_DEMO_MODE'" >&2; exit 1 ;;
esac

case "$CORP_TOWER_AUTH_OAUTH" in
  true|false) ;;
  *) echo "error: CORP_TOWER_AUTH_OAUTH must be 'true' or 'false', got '$CORP_TOWER_AUTH_OAUTH'" >&2; exit 1 ;;
esac

if [ -n "$CORP_TOWER_SUPABASE_URL" ] && [ -z "$CORP_TOWER_SUPABASE_ANON_KEY" ]; then
  echo "error: CORP_TOWER_SUPABASE_URL is set but CORP_TOWER_SUPABASE_ANON_KEY is empty" >&2
  exit 1
fi

if [ -z "$CORP_TOWER_SUPABASE_URL" ] && [ -n "$CORP_TOWER_SUPABASE_ANON_KEY" ]; then
  echo "error: CORP_TOWER_SUPABASE_ANON_KEY is set but CORP_TOWER_SUPABASE_URL is empty" >&2
  exit 1
fi

if [ "$CORP_TOWER_AUTH_OAUTH" = "true" ] && [ -z "$CORP_TOWER_SUPABASE_URL" ]; then
  echo "error: CORP_TOWER_AUTH_OAUTH is true but no Supabase project is configured" >&2
  exit 1
fi

if [ -n "$CORP_TOWER_GOOGLE_SERVER_CLIENT_ID" ] && [ "$CORP_TOWER_AUTH_OAUTH" != "true" ]; then
  echo "warning: CORP_TOWER_GOOGLE_SERVER_CLIENT_ID is set but CORP_TOWER_AUTH_OAUTH is not true — native Google sign-in will stay unreachable" >&2
fi

cat > "$CONFIG_FILE" <<EOF
class_name EndpointConfig

const PRIMARY := "${CORP_TOWER_WS_PRIMARY}"
const FAILOVER := "${CORP_TOWER_WS_FAILOVER}"
const DEBUG_UI_ENABLED := ${CORP_TOWER_DEBUG_UI}
const DEMO_MODE_ENABLED := ${CORP_TOWER_DEMO_MODE}
const SUPABASE_URL := "${CORP_TOWER_SUPABASE_URL}"
const SUPABASE_ANON_KEY := "${CORP_TOWER_SUPABASE_ANON_KEY}"
const AUTH_OAUTH_ENABLED := ${CORP_TOWER_AUTH_OAUTH}
const AUTH_REDIRECT_WEB := "${CORP_TOWER_AUTH_REDIRECT_WEB}"
const AUTH_GOOGLE_SERVER_CLIENT_ID := "${CORP_TOWER_GOOGLE_SERVER_CLIENT_ID}"
const AUTH_FACEBOOK_APP_ID := "${TOD_FACEBOOK_APP_ID}"
const AUTH_FACEBOOK_CLIENT_TOKEN := "${TOD_FACEBOOK_CLIENT_TOKEN}"
EOF

echo "Wrote $CONFIG_FILE"
echo "  PRIMARY=${CORP_TOWER_WS_PRIMARY}"
echo "  FAILOVER=${CORP_TOWER_WS_FAILOVER:-<none>}"
echo "  DEBUG_UI_ENABLED=${CORP_TOWER_DEBUG_UI}"
echo "  DEMO_MODE_ENABLED=${CORP_TOWER_DEMO_MODE}"
echo "  SUPABASE_URL=${CORP_TOWER_SUPABASE_URL:-<none>}"
# Never echo the key itself, only whether the build carries one.
echo "  SUPABASE_ANON_KEY=$([ -n "$CORP_TOWER_SUPABASE_ANON_KEY" ] && echo "<set>" || echo "<none>")"
echo "  AUTH_OAUTH_ENABLED=${CORP_TOWER_AUTH_OAUTH}"
echo "  AUTH_REDIRECT_WEB=${CORP_TOWER_AUTH_REDIRECT_WEB:-<none>}"
if [ -n "$CORP_TOWER_GOOGLE_SERVER_CLIENT_ID" ]; then
  echo "  AUTH_GOOGLE_SERVER_CLIENT_ID=<set, length=${#CORP_TOWER_GOOGLE_SERVER_CLIENT_ID}, sha256[:12]=$(printf '%s' "$CORP_TOWER_GOOGLE_SERVER_CLIENT_ID" | sha256sum | cut -c1-12)>"
else
  echo "  AUTH_GOOGLE_SERVER_CLIENT_ID=<none>"
fi
echo "  AUTH_FACEBOOK_APP_ID=$([ -n "$TOD_FACEBOOK_APP_ID" ] && echo "<set>" || echo "<none>")"
echo "  AUTH_FACEBOOK_CLIENT_TOKEN=$([ -n "$TOD_FACEBOOK_CLIENT_TOKEN" ] && echo "<set>" || echo "<none>")"
