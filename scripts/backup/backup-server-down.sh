#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/backup-common.sh"

INSTANCE="${1:?usage: backup-server-down.sh <1|2|3>}"
case "$INSTANCE" in
  1|2|3) ;;
  *) die "instance must be 1, 2, or 3, got '$INSTANCE'" ;;
esac

require_cmd docker

CONTAINER_NAME="corp-tower-server-${INSTANCE}"

info "Stopping $CONTAINER_NAME"
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

stop_cloudflared_if_idle

info "Backup game server instance $INSTANCE is down. Its DNS record is left in"
info "place pointing at the (now idle) tunnel — nothing to clean up there."
