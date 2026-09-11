#!/usr/bin/env bash
set -euo pipefail

readonly SEOUL_SOURCE_PROJECT_REF="lfvbxkidatmfhjbmcgyq"
readonly SINGAPORE_PRODUCTION_PROJECT_REF="kweqwprbahlfoznyzlvf"
# Singapore Development is independent from Production and Seoul. Development
# deployments may use only this provisioned Singapore project.
readonly SINGAPORE_DEVELOPMENT_PROJECT_REF="mlanmibqvffbshuxkfff"

die() {
  echo "error: $*" >&2
  exit 1
}

require_value() {
  local name="$1"
  [ -n "${!name:-}" ] || die "$name must be set"
}

verify_hmac_configuration() {
  require_value SUPABASE_AUTH_REQUIRED
  require_value PLAYER_IDENTITY_HMAC_SECRET
  require_value PLAYER_IDENTITY_HMAC_KEY_VERSION
  require_value PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION

  [ "$SUPABASE_AUTH_REQUIRED" = "true" ] \
    || die "SUPABASE_AUTH_REQUIRED must be 'true' for a persistent server deployment"
  [[ "$PLAYER_IDENTITY_HMAC_KEY_VERSION" =~ ^[1-9][0-9]*$ ]] \
    || die "PLAYER_IDENTITY_HMAC_KEY_VERSION must be a positive integer"

  if [ -n "${PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET:-}" ]; then
    [[ "$PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION" =~ ^[1-9][0-9]*$ ]] \
      || die "PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION must be positive when a previous secret is set"
    [ "$PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION" != "$PLAYER_IDENTITY_HMAC_KEY_VERSION" ] \
      || die "current and previous HMAC key versions must differ"
    [ "$PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET" != "$PLAYER_IDENTITY_HMAC_SECRET" ] \
      || die "current and previous HMAC secrets must differ"
  else
    [ "$PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION" = "0" ] \
      || die "PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION must be 0 when no previous secret is set"
  fi
}

verify_supabase_environment() {
  local expected_environment="${1:-}"
  shift || true

  local require_client_key=false
  local require_hmac=false
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --require-client-key) require_client_key=true ;;
      --require-hmac) require_hmac=true ;;
      *) die "unknown option '$1'" ;;
    esac
    shift
  done

  case "$expected_environment" in
    production|development) ;;
    *) die "usage: verify-supabase-environment.sh <production|development> [--require-client-key] [--require-hmac]" ;;
  esac

  require_value TOD_DATA_ENVIRONMENT
  require_value SUPABASE_PROJECT_REF
  require_value SUPABASE_URL
  require_value SUPABASE_SERVICE_ROLE_KEY

  case "$SUPABASE_SERVICE_ROLE_KEY" in
    sb_secret_*)
      die "this runtime currently requires the legacy service_role JWT key; sb_secret keys cannot be sent as bearer tokens"
      ;;
    sb_publishable_*)
      die "SUPABASE_SERVICE_ROLE_KEY contains a publishable client key"
      ;;
  esac

  [ "$TOD_DATA_ENVIRONMENT" = "$expected_environment" ] \
    || die "expected data environment '$expected_environment', got '$TOD_DATA_ENVIRONMENT'"
  [[ "$SUPABASE_PROJECT_REF" =~ ^[a-z]{20}$ ]] \
    || die "SUPABASE_PROJECT_REF must be a 20-letter Supabase project ref"
  [ "$SUPABASE_PROJECT_REF" != "$SEOUL_SOURCE_PROJECT_REF" ] \
    || die "the Seoul migration source cannot be used as a runtime environment"

  local expected_project_ref
  case "$expected_environment" in
    production)
      expected_project_ref="$SINGAPORE_PRODUCTION_PROJECT_REF"
      ;;
    development)
      expected_project_ref="$SINGAPORE_DEVELOPMENT_PROJECT_REF"
      [ -n "$expected_project_ref" ] \
        || die "Singapore Development is not provisioned; Development deployments remain blocked"
      ;;
  esac

  [ "$SUPABASE_PROJECT_REF" = "$expected_project_ref" ] \
    || die "$expected_environment must use Supabase project ref '$expected_project_ref'"

  local normalized_url="${SUPABASE_URL%/}"
  local expected_url="https://${SUPABASE_PROJECT_REF}.supabase.co"
  [ "$normalized_url" = "$expected_url" ] \
    || die "SUPABASE_URL does not match SUPABASE_PROJECT_REF"

  if [ "$require_client_key" = true ]; then
    require_value SUPABASE_ANON_KEY
    case "$SUPABASE_ANON_KEY" in
      sb_publishable_*)
        die "this client currently requires the legacy anon JWT key; sb_publishable keys cannot be sent as bearer tokens"
        ;;
      sb_secret_*)
        die "SUPABASE_ANON_KEY contains a server secret key"
        ;;
    esac
    [ "$SUPABASE_ANON_KEY" != "$SUPABASE_SERVICE_ROLE_KEY" ] \
      || die "the client key must not be the server service-role/secret key"
  fi

  if [ "$require_hmac" = true ]; then
    verify_hmac_configuration
  fi

  command -v curl >/dev/null 2>&1 || die "curl is required"
  command -v jq >/dev/null 2>&1 || die "jq is required"

  local curl_config openapi_file
  umask 077
  curl_config="$(mktemp "${TMPDIR:-/tmp}/corp-tower-supabase-curl.XXXXXX")"
  openapi_file="$(mktemp "${TMPDIR:-/tmp}/corp-tower-supabase-openapi.XXXXXX")"
  cleanup() {
    rm -f -- "$curl_config" "$openapi_file"
  }
  trap cleanup EXIT

  # Keep elevated API material out of command arguments and logs. The temporary
  # curl config is mode 0600 and is removed by the EXIT trap.
  printf 'header = "apikey: %s"\n' "$SUPABASE_SERVICE_ROLE_KEY" > "$curl_config"
  printf '%s\n' 'header = "Accept: application/openapi+json"' >> "$curl_config"

  if ! curl \
    --config "$curl_config" \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 5 \
    --max-time 30 \
    --output "$openapi_file" \
    "${normalized_url}/rest/v1/"; then
    die "Supabase Data API schema check failed for $expected_environment"
  fi

  local -a required_paths=(
    /profiles
    /player_accounts
    /player_identities
    /player_profiles
    /account_settings
    /progression_tracks
    /trios
    /trio_progress
    /game_runs
    /game_run_players
    /currencies
    /account_balances
    /economy_events
    /wallet_ledger
    /trio_checkpoint_claims
    /account_milestone_claims
    /item_catalog
    /account_items
    /account_loadout_slots
    /store_offers
    /store_offer_costs
    /store_offer_grants
    /external_purchase_receipts
    /account_stats
    /trio_stats
    /achievement_catalog
    /account_achievements
    /account_progression
    /challenge_catalog
    /account_challenges
    /friendships
    /account_blocks
    /site_catalog
    /site_modifier_catalog
    /content_rotations
    /rpc/claim_player_provider
    /rpc/claim_player_facebook_provider
    /rpc/apply_wallet_transaction
    /rpc/secure_trio_checkpoint
    /rpc/claim_account_milestone
  )
  local -a missing_paths=()
  local path
  for path in "${required_paths[@]}"; do
    if ! jq -e --arg path "$path" '.paths[$path] != null' "$openapi_file" >/dev/null; then
      missing_paths+=("$path")
    fi
  done

  if [ "${#missing_paths[@]}" -gt 0 ]; then
    printf 'error: Supabase %s is missing required Data API surface(s):' "$expected_environment" >&2
    printf ' %s' "${missing_paths[@]}" >&2
    printf '\n' >&2
    exit 1
  fi

  cleanup
  trap - EXIT
  echo "Verified Supabase ${expected_environment} environment (${SUPABASE_PROJECT_REF}) and ${#required_paths[@]} durable API surfaces."
}

verify_supabase_environment "$@"
