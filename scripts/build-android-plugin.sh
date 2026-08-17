#!/usr/bin/env bash
# Builds the native Google sign-in Android plugin from plugins/godot-google-signin/
# and copies both AARs into the Godot addon's bin/ tree, mirroring how the vendored
# DeeplinkPlugin ships its AARs. Requires a `gradle` on PATH — CI provisions one via
# gradle/actions/setup-gradle@v4; locally, install Gradle (or Android Studio, which
# bundles one) and add it to PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/godot-google-signin"
ADDON_BIN_DIR="$REPO_ROOT/src/Client/App/corp-tower/addons/GoogleSignInPlugin/bin"

command -v gradle >/dev/null 2>&1 \
  || { echo "error: gradle not found on PATH" >&2; exit 1; }

( cd "$PLUGIN_DIR" && gradle :plugin:assembleDebug :plugin:assembleRelease --no-daemon )

for variant in debug release; do
  aar="$ADDON_BIN_DIR/$variant/GoogleSignInPlugin-$variant.aar"
  [ -f "$aar" ] || { echo "error: expected AAR not found at $aar" >&2; exit 1; }
  echo "Built $aar"
done
