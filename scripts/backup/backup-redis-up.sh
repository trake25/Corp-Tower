#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

require_cmd docker

NETWORK_NAME="corp-tower-backup"
CONTAINER_NAME="corp-tower-redis-demo"
VOLUME_NAME="corp-tower-redis-demo-data"

docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 \
  || { info "Creating $NETWORK_NAME network"; docker network create "$NETWORK_NAME" >/dev/null; }

if docker ps --filter "name=${CONTAINER_NAME}" --filter "status=running" --format '{{.Names}}' 2>/dev/null | grep -q .; then
  info "$CONTAINER_NAME already running"
  exit 0
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
info "Starting $CONTAINER_NAME (appendonly, survives restarts via $VOLUME_NAME)"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  -v "${VOLUME_NAME}:/data" \
  redis:7-alpine redis-server --appendonly yes >/dev/null

for attempt in $(seq 1 15); do
  if docker exec "$CONTAINER_NAME" redis-cli ping 2>/dev/null | grep -q PONG; then
    info "$CONTAINER_NAME is up"
    exit 0
  fi
  sleep 1
done

die "$CONTAINER_NAME did not answer PING — check: docker logs $CONTAINER_NAME"
