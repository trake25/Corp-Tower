# Private Asset Pipeline

## Purpose
Keeps production art out of the public repository while still baking it into
every release build. Art lives only on the developer machine, in a private
Cloudflare R2 bucket, on the CI runner during a build, and inside the final
exported game.

Files: `.github/actions/fetch-private-assets/action.yml`,
`src/Client/App/corp-tower/Cor/art-manifest.json`, `scripts/art-common.sh`,
`scripts/art-pull.sh`, `scripts/art-push.sh`.

## Responsibilities
- Store versioned, immutable art bundles in the private R2 bucket
  `corp-tower-assets` under `art/releases/art-<version>.tar.gz`.
- Pin which bundle a given commit builds against, via a committed manifest.
- Download, verify, and extract that bundle into
  `src/Client/App/corp-tower/Cor/Art` before any Godot import step.
- Fail the build rather than export with missing assets.

## Key Logic
- `Cor/Art/` is gitignored (`src/Client/App/corp-tower/.gitignore`) and has
  never been committed.
- `art-manifest.json` holds `version`, `object`, `sha256`, `file_count`, and a
  `sentinels` list. It is committed, so the art version is part of the commit —
  rebuilding an old commit always fetches the art it was authored against.
- CI verification order is download → sha256 → extract → file count →
  sentinel files. Every check fails closed.
- Bundles are packed deterministically (`tar --sort=name`, fixed mtime and
  ownership, `gzip -n`), so identical content always produces an identical
  hash. This is what makes the manifest hash meaningful and lets
  `art-pull.sh` detect "already up to date" without downloading.
- `.import` files travel inside the bundle alongside their `.png`. They carry
  the UIDs that public `.tscn` files reference (e.g. [[Game UI Scene]] pins
  `uid://b0dlpjeh71j0c` for `Static/bg.png`), so regenerating them in CI would
  mint fresh UIDs and break every scene reference. The scripts validate
  `.png`/`.import` pairing before packaging.

## Credentials
Two R2 API tokens, deliberately split:

- CI holds an **Object Read only** token scoped to the single bucket, exposed
  as the GitHub secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. CI cannot publish or delete art.
- Local development holds an **Object Read & Write** token in the gitignored
  `.env.art` (template: `.env.art.example`). Only this can publish.

Cloudflare's R2 S3 endpoint does not accept GitHub OIDC federation, so unlike
the Terraform workflows this path requires static credentials. The privilege
split is the mitigation.

## Developer Workflow
- `./scripts/art-pull.sh` — fetch the pinned bundle. Refuses to overwrite local
  art that differs from the manifest unless `--force`, so in-progress art is not
  silently destroyed.
- `./scripts/art-push.sh v<n>` — validate pairing, package, upload, then read
  back and verify the stored object. Refuses to overwrite an already-published
  version. Prints the manifest values to commit.
- Publishing is local and manual by design; automating it would require a write
  token in GitHub Secrets and defeat the privilege split.

## Inputs/Outputs
- Input: `art-manifest.json` plus the four `R2_*` secrets.
- Output: `Cor/Art/` populated on the runner, removed again by an
  `if: always()` cleanup step.

## Dependencies
- [[Client Android Internal Workflow]]
- [[Client HTML5 Pages]]
- [[Godot Client App]]

## Notes
- Scope of the privacy guarantee: assets are absent from the repository and its
  history, and are not browsable or forkable from GitHub. They remain
  extractable from a shipped build — `.pck` extractors are commodity tooling and
  the HTML5 build serves the `.pck` as a public download. `Cor/Art/` is a build
  input, not a secret. Encrypted PCK would not change this, since the key ships
  inside the exported binary.
- The runner cleanup step satisfies the stated requirement but buys little on
  its own: GitHub-hosted runners are ephemeral VMs destroyed at job end. The
  real control is keeping `upload-artifact` paths narrow — the Android workflow
  uploads only the `.aab`.
- Usage sits far inside R2's permanent free tier (~17 MB against 10 GB-month;
  egress is always free). Avoid enabling R2 Data Catalog, R2 SQL, or Infrequent
  Access storage on the bucket — each is separately billed.
- A `version-override` input exists on every build workflow for testing an
  unpublished bundle. It skips sha256 verification and emits a warning; it must
  not be used for a release.
