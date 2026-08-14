#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

require_cmd docker

CONTAINER_NAME="corp-tower-redis-demo"

docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 \
  || die "$CONTAINER_NAME is not running — nothing to reset (backup-redis-up.sh starts it)"

before="$(docker exec "$CONTAINER_NAME" redis-cli MGET stats:demo:levelCompletions stats:demo:levelFailures)"
info "Current counts (completed / failed): $(echo "$before" | tr '\n' ' ')"

# Only these two keys -- this Redis instance also backs wstoddemo's live room,
# session and queue state now that REDIS_URL is set, so a FLUSHALL here would
# take the running demo server down with it.
docker exec "$CONTAINER_NAME" redis-cli DEL stats:demo:levelCompletions stats:demo:levelFailures >/dev/null

info "Demo stat counters reset to 0/0"
