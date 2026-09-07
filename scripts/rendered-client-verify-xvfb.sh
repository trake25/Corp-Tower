#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository_root"

if [[ "${CORP_TOWER_XVFB_SESSION:-}" != "1" ]]; then
  "${repository_root}/scripts/ensure-godot-binary.sh"
fi

for command_name in import wmctrl xdpyinfo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing rendered-verification dependency: %s\n' "$command_name" >&2
    exit 1
  fi
done

run_virtual_display_verification() {
  metacity --sm-disable --replace &
  window_manager_pid=$!
  cleanup() {
    kill "$window_manager_pid" 2>/dev/null || true
    wait "$window_manager_pid" 2>/dev/null || true
  }
  trap cleanup EXIT
  window_manager_ready=false
  for _attempt in {1..100}; do
    if wmctrl -m >/dev/null 2>&1; then
      window_manager_ready=true
      break
    fi
    if ! kill -0 "$window_manager_pid" 2>/dev/null; then
      break
    fi
    sleep 0.05
  done
  if [[ "$window_manager_ready" != "true" ]]; then
    printf 'Metacity did not become ready for rendered verification.\n' >&2
    exit 1
  fi
  node scripts/rendered-client-verify.mjs "$@"
}

if [[ "${CORP_TOWER_XVFB_SESSION:-}" == "1" ]]; then
  if ! command -v metacity >/dev/null 2>&1; then
    printf 'Missing rendered-verification dependency: metacity\n' >&2
    exit 1
  fi
  run_virtual_display_verification "$@"
  exit
fi

if [[ -n "${DISPLAY:-}" ]]; then
  exec node scripts/rendered-client-verify.mjs "$@"
fi

for command_name in xvfb-run metacity; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing rendered-verification dependency: %s\n' "$command_name" >&2
    exit 1
  fi
done

export CORP_TOWER_XVFB_SESSION=1
exec xvfb-run -a -s '-screen 0 412x917x24 -nolisten tcp' "$0" "$@"
