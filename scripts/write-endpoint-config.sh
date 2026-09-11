#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/src/Client/App/corp-tower/Sys/NetMan/Endpoint_Config.gd"
readonly SEOUL_SOURCE_PROJECT_REF="lfvbxkidatmfhjbmcgyq"
readonly SINGAPORE_PRODUCTION_PROJECT_REF="kweqwprbahlfoznyzlvf"
# Keep client builds on the same independently provisioned Singapore
# Development project required by the server deployment guard.
readonly SINGAPORE_DEVELOPMENT_PROJECT_REF="mlanmibqvffbshuxkfff"

: "${CORP_TOWER_WS_PRIMARY:?CORP_TOWER_WS_PRIMARY must be set (e.g. wss://wsplaytod.galaxxigames.com)}"
CORP_TOWER_DEBUG_UI="${CORP_TOWER_DEBUG_UI:-true}"
CORP_TOWER_DEMO_MODE="${CORP_TOWER_DEMO_MODE:-false}"

# Local, non-shipping calls may still omit Auth. Shipping workflows set an
# expected data environment below, which makes the project marker, ref, URL,
# and client key mandatory.
CORP_TOWER_SUPABASE_URL="${CORP_TOWER_SUPABASE_URL:-}"
CORP_TOWER_SUPABASE_ANON_KEY="${CORP_TOWER_SUPABASE_ANON_KEY:-}"
CORP_TOWER_SUPABASE_URL="${CORP_TOWER_SUPABASE_URL%/}"
CORP_TOWER_EXPECTED_DATA_ENVIRONMENT="${CORP_TOWER_EXPECTED_DATA_ENVIRONMENT:-}"
TOD_DATA_ENVIRONMENT="${TOD_DATA_ENVIRONMENT:-}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

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

if [ -n "$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT" ]; then
  case "$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT" in
    production|development) ;;
    *)
      echo "error: CORP_TOWER_EXPECTED_DATA_ENVIRONMENT must be 'production' or 'development'" >&2
      exit 1
      ;;
  esac

  [ -n "$TOD_DATA_ENVIRONMENT" ] || {
    echo "error: TOD_DATA_ENVIRONMENT must be set for a shipping build" >&2
    exit 1
  }
  [ "$TOD_DATA_ENVIRONMENT" = "$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT" ] || {
    echo "error: expected data environment '$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT', got '$TOD_DATA_ENVIRONMENT'" >&2
    exit 1
  }
  [[ "$SUPABASE_PROJECT_REF" =~ ^[a-z]{20}$ ]] || {
    echo "error: SUPABASE_PROJECT_REF must be a 20-letter Supabase project ref" >&2
    exit 1
  }
  [ "$SUPABASE_PROJECT_REF" != "$SEOUL_SOURCE_PROJECT_REF" ] || {
    echo "error: the Seoul migration source cannot be embedded in a shipping build" >&2
    exit 1
  }
  [ -n "$CORP_TOWER_SUPABASE_URL" ] || {
    echo "error: CORP_TOWER_SUPABASE_URL must be set for a shipping build" >&2
    exit 1
  }
  [ -n "$CORP_TOWER_SUPABASE_ANON_KEY" ] || {
    echo "error: CORP_TOWER_SUPABASE_ANON_KEY must be set for a shipping build" >&2
    exit 1
  }
  case "$CORP_TOWER_SUPABASE_ANON_KEY" in
    sb_publishable_*)
      echo "error: shipping clients currently require the legacy anon JWT key; sb_publishable keys cannot be sent as bearer tokens" >&2
      exit 1
      ;;
    sb_secret_*)
      echo "error: CORP_TOWER_SUPABASE_ANON_KEY contains a server secret key" >&2
      exit 1
      ;;
  esac
  [ "$CORP_TOWER_SUPABASE_URL" = "https://${SUPABASE_PROJECT_REF}.supabase.co" ] || {
    echo "error: CORP_TOWER_SUPABASE_URL does not match SUPABASE_PROJECT_REF" >&2
    exit 1
  }

  case "$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT" in
    production)
      [ "$SUPABASE_PROJECT_REF" = "$SINGAPORE_PRODUCTION_PROJECT_REF" ] || {
        echo "error: production must use the Singapore Production Supabase project" >&2
        exit 1
      }
      ;;
    development)
      [ -n "$SINGAPORE_DEVELOPMENT_PROJECT_REF" ] || {
        echo "error: Singapore Development is not provisioned; Development builds remain blocked" >&2
        exit 1
      }
      [ "$SUPABASE_PROJECT_REF" = "$SINGAPORE_DEVELOPMENT_PROJECT_REF" ] || {
        echo "error: development must use the Singapore Development Supabase project" >&2
        exit 1
      }
      ;;
  esac
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
echo "  DEBUG_UI_ENABLED=${CORP_TOWER_DEBUG_UI}"
echo "  DEMO_MODE_ENABLED=${CORP_TOWER_DEMO_MODE}"
echo "  SUPABASE_URL=${CORP_TOWER_SUPABASE_URL:-<none>}"
if [ -n "$CORP_TOWER_EXPECTED_DATA_ENVIRONMENT" ]; then
  echo "  DATA_ENVIRONMENT=${TOD_DATA_ENVIRONMENT}"
  echo "  SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF}"
fi
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
