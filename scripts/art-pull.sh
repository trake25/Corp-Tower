#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/art-common.sh"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

load_env

VERSION="$(manifest_field version)"
OBJECT="$(manifest_field object)"
WANT_SHA="$(manifest_field sha256)"
WANT_COUNT="$(manifest_field file_count)"

echo "Pulling art $VERSION from r2://$R2_BUCKET/$OBJECT"

if [ -d "$ART_DIR" ] && [ -n "$(ls -A "$ART_DIR" 2>/dev/null || true)" ]; then
  TMP_CHECK="$(mktemp -t art-check-XXXXXX.tar.gz)"
  pack_art "$ART_DIR" "$TMP_CHECK"
  HAVE_SHA="$(sha256_of "$TMP_CHECK")"
  rm -f "$TMP_CHECK"

  if [ "$HAVE_SHA" = "$WANT_SHA" ]; then
    info "already up to date ($VERSION) — nothing to do"
    exit 0
  fi

  if [ "$FORCE" -ne 1 ]; then
    echo "error: $ART_DIR has content that does not match manifest $VERSION." >&2
    echo "       local sha256:    $HAVE_SHA" >&2
    echo "       manifest sha256: $WANT_SHA" >&2
    echo "" >&2
    echo "       If your local art is newer, publish it:  ./scripts/art-push.sh v<n>" >&2
    echo "       To discard local art and take the pinned version:  $0 --force" >&2
    exit 1
  fi
  info "--force given — local art will be replaced"
fi

TMP="$(mktemp -d -t art-pull-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/art.tar.gz"

info "downloading..."
r2 get-object --bucket "$R2_BUCKET" --key "$OBJECT" "$ARCHIVE" >/dev/null \
  || die "download failed — check credentials in .env.art and that $OBJECT exists"

GOT_SHA="$(sha256_of "$ARCHIVE")"
[ "$GOT_SHA" = "$WANT_SHA" ] || die "sha256 mismatch
  expected: $WANT_SHA
  got:      $GOT_SHA
  The object in R2 does not match the manifest. Do not use this bundle."
info "sha256 verified"

rm -rf "$ART_DIR"
mkdir -p "$ART_DIR"
tar -xzf "$ARCHIVE" -C "$ART_DIR"

GOT_COUNT="$(count_files "$ART_DIR")"
[ "$GOT_COUNT" = "$WANT_COUNT" ] || die "file count mismatch — expected $WANT_COUNT, got $GOT_COUNT"
validate_pairing "$ART_DIR"

info "extracted $GOT_COUNT files to Cor/Art/"
echo "Done — art $VERSION is in place."
