#!/usr/bin/env bash
# Corp Tower — package Cor/Art/ and publish it to R2 as an immutable version.
#
#   ./scripts/art-push.sh v2
#
# Refuses to overwrite an existing version. Published versions are immutable so
# that a commit which pins v1 builds identically forever. To change art, publish
# a new version and update Cor/art-manifest.json.
#
# Requires the READ-WRITE dev token in .env.art. CI's token cannot do this.

source "$(dirname "${BASH_SOURCE[0]}")/art-common.sh"

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: $0 <version>   e.g. $0 v2"
[[ "$VERSION" =~ ^v[0-9]+$ ]] || die "version must look like v1, v2, v3 — got '$VERSION'"

load_env

OBJECT="art/releases/art-${VERSION}.tar.gz"

[ -d "$ART_DIR" ] || die "$ART_DIR does not exist"
[ -n "$(ls -A "$ART_DIR" 2>/dev/null || true)" ] || die "$ART_DIR is empty — refusing to publish"

echo "Publishing art $VERSION to r2://$R2_BUCKET/$OBJECT"

# Immutability guard: never overwrite a published version.
if r2 head-object --bucket "$R2_BUCKET" --key "$OBJECT" >/dev/null 2>&1; then
  die "$OBJECT already exists in R2.
  Published versions are immutable. Use the next version number instead."
fi

info "validating asset pairing..."
validate_pairing "$ART_DIR"

TMP="$(mktemp -d -t art-push-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/art-${VERSION}.tar.gz"

info "packaging..."
pack_art "$ART_DIR" "$ARCHIVE"

SHA="$(sha256_of "$ARCHIVE")"
COUNT="$(count_files "$ART_DIR")"
SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"

info "uploading ${SIZE} bytes..."
r2 put-object --bucket "$R2_BUCKET" --key "$OBJECT" --body "$ARCHIVE" >/dev/null \
  || die "upload failed — check that .env.art holds the READ-WRITE dev token"

# Read back and verify what R2 actually stored, rather than trusting the upload.
VERIFY="$TMP/verify.tar.gz"
r2 get-object --bucket "$R2_BUCKET" --key "$OBJECT" "$VERIFY" >/dev/null
[ "$(sha256_of "$VERIFY")" = "$SHA" ] || die "post-upload verification failed — stored object does not match local archive"
info "upload verified against local archive"

cat <<EOF

Published $OBJECT

Now update src/Client/App/corp-tower/Cor/art-manifest.json:

  "version": "$VERSION",
  "object": "$OBJECT",
  "sha256": "$SHA",
  "file_count": $COUNT

Then commit the manifest. The art version is pinned to that commit.
EOF
