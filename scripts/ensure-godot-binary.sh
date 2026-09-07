#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
godot_version=4.7.2
godot_status=stable
godot_file="Godot_v${godot_version}-${godot_status}_linux.x86_64"
godot_sha256=8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e
godot_target="${repository_root}/${godot_file}"

verify_binary() {
  [[ -f "$1" ]] && printf '%s  %s\n' "$godot_sha256" "$1" | sha256sum --check --status
}

if verify_binary "$godot_target"; then
  chmod +x "$godot_target"
  printf 'Godot %s is ready at %s\n' "$godot_version" "$godot_target"
  exit 0
fi

if [[ -e "$godot_target" ]]; then
  printf 'Refusing to replace unexpected root Godot binary: %s\n' "$godot_target" >&2
  exit 1
fi

provision_godot_binary() {
  for command_name in curl unzip sha256sum; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      printf 'Missing required provisioning command: %s\n' "$command_name" >&2
      exit 1
    fi
  done

  provision_directory=$(mktemp -d /tmp/corp-tower-godot-provision-XXXXXX)
  cleanup() {
    rm -rf "$provision_directory"
  }
  trap cleanup EXIT

  godot_url="https://github.com/godotengine/godot/releases/download/${godot_version}-${godot_status}/${godot_file}.zip"
  curl --fail --location --retry 3 --output "${provision_directory}/godot.zip" "$godot_url"
  unzip -q "${provision_directory}/godot.zip" -d "$provision_directory"

  downloaded_binary="${provision_directory}/${godot_file}"
  if ! verify_binary "$downloaded_binary"; then
    printf 'Downloaded Godot binary failed the pinned SHA-256 check.\n' >&2
    exit 1
  fi

  install -m 0755 "$downloaded_binary" "${godot_target}.new"
  mv "${godot_target}.new" "$godot_target"
  printf 'Provisioned Godot %s at %s\n' "$godot_version" "$godot_target"
}

provision_godot_binary
