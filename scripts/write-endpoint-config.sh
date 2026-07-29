#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/src/Client/App/corp-tower/Sys/NetMan/Endpoint_Config.gd"

: "${CORP_TOWER_WS_PRIMARY:?CORP_TOWER_WS_PRIMARY must be set (e.g. wss://wsplaytod.galaxxigames.com)}"
CORP_TOWER_WS_FAILOVER="${CORP_TOWER_WS_FAILOVER:-}"
CORP_TOWER_DEBUG_UI="${CORP_TOWER_DEBUG_UI:-true}"

case "$CORP_TOWER_DEBUG_UI" in
  true|false) ;;
  *) echo "error: CORP_TOWER_DEBUG_UI must be 'true' or 'false', got '$CORP_TOWER_DEBUG_UI'" >&2; exit 1 ;;
esac

cat > "$CONFIG_FILE" <<EOF
class_name EndpointConfig

const PRIMARY := "${CORP_TOWER_WS_PRIMARY}"
const FAILOVER := "${CORP_TOWER_WS_FAILOVER}"
const DEBUG_UI_ENABLED := ${CORP_TOWER_DEBUG_UI}
EOF

echo "Wrote $CONFIG_FILE"
echo "  PRIMARY=${CORP_TOWER_WS_PRIMARY}"
echo "  FAILOVER=${CORP_TOWER_WS_FAILOVER:-<none>}"
echo "  DEBUG_UI_ENABLED=${CORP_TOWER_DEBUG_UI}"
