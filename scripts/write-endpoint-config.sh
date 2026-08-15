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

case "$CORP_TOWER_DEBUG_UI" in
  true|false) ;;
  *) echo "error: CORP_TOWER_DEBUG_UI must be 'true' or 'false', got '$CORP_TOWER_DEBUG_UI'" >&2; exit 1 ;;
esac

case "$CORP_TOWER_DEMO_MODE" in
  true|false) ;;
  *) echo "error: CORP_TOWER_DEMO_MODE must be 'true' or 'false', got '$CORP_TOWER_DEMO_MODE'" >&2; exit 1 ;;
esac

if [ -n "$CORP_TOWER_SUPABASE_URL" ] && [ -z "$CORP_TOWER_SUPABASE_ANON_KEY" ]; then
  echo "error: CORP_TOWER_SUPABASE_URL is set but CORP_TOWER_SUPABASE_ANON_KEY is empty" >&2
  exit 1
fi

if [ -z "$CORP_TOWER_SUPABASE_URL" ] && [ -n "$CORP_TOWER_SUPABASE_ANON_KEY" ]; then
  echo "error: CORP_TOWER_SUPABASE_ANON_KEY is set but CORP_TOWER_SUPABASE_URL is empty" >&2
  exit 1
fi

cat > "$CONFIG_FILE" <<EOF
class_name EndpointConfig

const PRIMARY := "${CORP_TOWER_WS_PRIMARY}"
const FAILOVER := "${CORP_TOWER_WS_FAILOVER}"
const DEBUG_UI_ENABLED := ${CORP_TOWER_DEBUG_UI}
const DEMO_MODE_ENABLED := ${CORP_TOWER_DEMO_MODE}
const SUPABASE_URL := "${CORP_TOWER_SUPABASE_URL}"
const SUPABASE_ANON_KEY := "${CORP_TOWER_SUPABASE_ANON_KEY}"
EOF

echo "Wrote $CONFIG_FILE"
echo "  PRIMARY=${CORP_TOWER_WS_PRIMARY}"
echo "  FAILOVER=${CORP_TOWER_WS_FAILOVER:-<none>}"
echo "  DEBUG_UI_ENABLED=${CORP_TOWER_DEBUG_UI}"
echo "  DEMO_MODE_ENABLED=${CORP_TOWER_DEMO_MODE}"
echo "  SUPABASE_URL=${CORP_TOWER_SUPABASE_URL:-<none>}"
# Never echo the key itself, only whether the build carries one.
echo "  SUPABASE_ANON_KEY=$([ -n "$CORP_TOWER_SUPABASE_ANON_KEY" ] && echo "<set>" || echo "<none>")"
