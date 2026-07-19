#!/usr/bin/env bash
# SAFETY EXCEPTION to the no-source-comments convention (Summary.md): this file
# is committed to a public repo. It must never hold credential values — they
# belong in the gitignored .env.art, which load_env reads at runtime.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT_PROJECT="$REPO_ROOT/src/Client/App/corp-tower"
ART_DIR="$GODOT_PROJECT/Cor/Art"
MANIFEST="$GODOT_PROJECT/Cor/art-manifest.json"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "  $*"; }

load_env() {
  local env_file="$REPO_ROOT/.env.art"
  [ -f "$env_file" ] || die "missing $env_file — copy .env.art.example and fill it in"

  # shellcheck disable=SC1090
  set -a; source "$env_file"; set +a

  : "${R2_ACCOUNT_ID:?not set in .env.art}"
  : "${R2_ACCESS_KEY_ID:?not set in .env.art}"
  : "${R2_SECRET_ACCESS_KEY:?not set in .env.art}"
  : "${R2_BUCKET:?not set in .env.art}"

  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="auto"
  export AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
  export AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export R2_ENDPOINT

  command -v aws >/dev/null 2>&1 \
    || die "aws CLI not found — install AWS CLI v2 (it speaks R2's S3 API; no AWS account needed)"
}

r2() { aws s3api --endpoint-url "$R2_ENDPOINT" "$@"; }

manifest_field() {
  local field="$1"
  python -c "import json,sys; print(json.load(open(sys.argv[1]))['$field'])" "$MANIFEST" 2>/dev/null \
    || python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['$field'])" "$MANIFEST"
}

validate_pairing() {
  local dir="$1" bad=0
  while IFS= read -r f; do
    [ -f "${f%.import}" ] || { echo "  ORPHAN (no source): $f" >&2; bad=1; }
  done < <(find "$dir" -name "*.import")
  while IFS= read -r f; do
    [ -f "$f.import" ] || { echo "  MISSING .import: $f" >&2; bad=1; }
  done < <(find "$dir" -name "*.png")
  [ "$bad" -eq 0 ] || die "asset pairing is broken — fix the files above before packaging"
}

count_files() { find "$1" -type f | wc -l | tr -d ' '; }

pack_art() {
  local src="$1" out="$2"
  ( cd "$src" && tar --sort=name --mtime='UTC 2020-01-01' \
      --owner=0 --group=0 --numeric-owner -cf - . ) | gzip -n -9 > "$out"
}

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }
