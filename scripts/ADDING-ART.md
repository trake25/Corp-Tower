# Adding New Art — Step by Step

Art lives outside git (it's packaged and stored in R2), so adding/updating art
means: drop files in, push a new version, update the manifest, commit.

## 1. Add/replace files

Put your new art in:

    src/Client/App/corp-tower/Cor/Art/

Every `.png` needs a matching Godot `.png.import` file, and vice versa
(no orphans). Open the project in Godot once so it generates `.import`
files for anything new, then check both exist before pushing.

## 2. Push the new version

From repo root (Git Bash):

```bash
./scripts/art-push.sh v3
```

- Version must look like `v1`, `v2`, `v3`... and must be one higher than
  whatever is currently published (versions are immutable — you can't
  overwrite an existing one).
- Requires `.env.art` in repo root with R2 credentials (copy
  `.env.art.example` if you don't have one — ask if you don't know the
  values).
- This validates asset pairing, packages `Cor/Art`, uploads to R2, and
  verifies the upload.

## 3. Update the manifest

The push script prints the exact values to paste. Update
`src/Client/App/corp-tower/Cor/art-manifest.json`:

```json
{
  "version": "v3",
  "object": "art/releases/art-v3.tar.gz",
  "sha256": "<printed sha>",
  "file_count": <printed count>
}
```

## 4. Commit the manifest

```bash
git add src/Client/App/corp-tower/Cor/art-manifest.json
git commit -m "Update art to v3"
```

The art version is pinned to whatever manifest is committed — anyone who
pulls the repo and runs `art-pull.sh` gets exactly this version.

## Pulling art (other machines / after a manifest update)

```bash
./scripts/art-pull.sh
```

Downloads whatever version is in the manifest and verifies its checksum.
If your local `Cor/Art` has unpublished changes, it'll refuse — push
your version first, or run `./scripts/art-pull.sh --force` to discard
local art and take the pinned version.

## Quick reference

| Script | Purpose |
|---|---|
| `art-push.sh v<n>` | Package local `Cor/Art` and publish as a new immutable version to R2 |
| `art-pull.sh [--force]` | Download the version pinned in `art-manifest.json` |
| `art-common.sh` | Shared helpers (not run directly) |
