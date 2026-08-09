#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/art-common.sh"

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: $0 <version>   e.g. $0 v2"
[[ "$VERSION" =~ ^v[0-9]+$ ]] || die "version must look like v1, v2, v3 — got '$VERSION'"

load_env

OBJECT="art/releases/art-${VERSION}.tar.gz"
MANIFEST="src/Client/App/corp-tower/Cor/art-manifest.json"

[ -d "$ART_DIR" ] || die "$ART_DIR does not exist"
[ -n "$(ls -A "$ART_DIR" 2>/dev/null || true)" ] || die "$ART_DIR is empty — refusing to publish"
[ -f "$MANIFEST" ] || die "$MANIFEST does not exist"

echo "Publishing art $VERSION to r2://$R2_BUCKET/$OBJECT"

info "validating asset pairing..."
validate_pairing "$ART_DIR"

TMP="$(mktemp -d -t art-push-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/art-${VERSION}.tar.gz"

ALREADY_UPLOADED=0
if r2 head-object --bucket "$R2_BUCKET" --key "$OBJECT" >/dev/null 2>&1; then
  info "$OBJECT already exists in R2 (versions are immutable)"
  ALREADY_UPLOADED=1
else
  info "packaging..."
  pack_art "$ART_DIR" "$ARCHIVE"

  SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"
  info "uploading ${SIZE} bytes..."
  r2 put-object --bucket "$R2_BUCKET" --key "$OBJECT" --body "$ARCHIVE" >/dev/null \
    || die "upload failed — check that .env.art holds the READ-WRITE dev token"

  info "verifying upload..."
  VERIFY="$TMP/verify.tar.gz"
  r2 get-object --bucket "$R2_BUCKET" --key "$OBJECT" "$VERIFY" >/dev/null
  UPLOAD_SHA="$(sha256_of "$VERIFY")"
fi

if [ "$ALREADY_UPLOADED" = 0 ]; then
  SHA="$(sha256_of "$ARCHIVE")"
else
  info "recalculating archive hash from local files..."
  pack_art "$ART_DIR" "$ARCHIVE"
  SHA="$(sha256_of "$ARCHIVE")"
fi

COUNT="$(count_files "$ART_DIR")"

info "updating $MANIFEST..."
cat > "$MANIFEST" <<MANIFEST_EOF
{
  "_comment": "Pins the private art bundle this commit builds against. Bumped via scripts/art-push.sh, then commit. CI fails closed if sha256 or file_count do not match.",
  "version": "$VERSION",
  "object": "$OBJECT",
  "sha256": "$SHA",
  "file_count": $COUNT,
  "sentinels": [
    "Static/bg.png",
    "Static/bg.png.import",
    "Cosmetics/avatar/avatar_0/avatar.png"
  ]
}
MANIFEST_EOF

cat <<EOF

✓ Published $OBJECT
✓ Updated $MANIFEST

Next: review the changes and commit
  git add $MANIFEST
  git commit -m "Bump art to $VERSION"

The art version is pinned to that commit.
EOF