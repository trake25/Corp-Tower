# Build & Release

Scope: how source becomes a shippable artifact — Android build, Web build, the
private production-art pipeline both consume, and the server container image.
Where these artifacts run → [deployment.md](./deployment.md). Per-symbol file and
line → grep [map/infra.md](./map/infra.md).

## Private Asset Pipeline

Keeps production art out of the public repository while baking it into every
release build. Art lives only on the developer machine, in a private Cloudflare R2
bucket, on the CI runner during a build, and inside the exported game.

- Versioned, immutable bundles live in R2 bucket `corp-tower-assets` at
  `art/releases/art-<version>.tar.gz`.
- The committed `Cor/art-manifest.json` holds `version`, `object`, `sha256`,
  `file_count` and `sentinels` — it **pins which bundle a given commit builds
  against**, so rebuilding an old commit fetches the art it was authored with.
- `Cor/Art/` is gitignored and has never been committed.
- CI verification order: download → sha256 → extract → file count → sentinels.
  **Every check fails closed** — the build fails rather than exporting with
  missing assets.
- Bundles are packed deterministically (`tar --sort=name`, fixed mtime and
  ownership, `gzip -n`) so identical content always hashes identically. That is
  what lets the pull script detect "already up to date" without downloading, and
  what makes the manifest hash meaningful at all.

**Landmine — `.import` files travel inside the bundle alongside their `.png`.**
They carry the UIDs that public `.tscn` files reference. **Regenerating them in CI
would mint fresh UIDs and break every scene reference.** The scripts validate
`.png`/`.import` pairing before packaging.

Related: **never run `godot --editor --quit` to generate a `.uid` or check that a
scene parses** — it re-saves `.tscn` files and silently drops authored overrides.
Full detail → [ui.md](./ui.md#landmines).

**Landmine — `art_version_override` skips sha256 verification.** It exists on every
client build workflow for testing an unpublished bundle and it warns, but it
**must never be used for a release.**

### Credential split

CI holds an R2 **Object Read only** token; local dev holds **Object Read & Write**
in the gitignored `.env.art`. Publishing is therefore local and manual by design.

**Why:** Cloudflare's R2 S3-compatible endpoint doesn't accept GitHub OIDC
federation — unlike the AWS Terraform workflows, which do use OIDC — so this path
needs static credentials, and the read/write split is the mitigation.

**Publishing stays manual.** Automating it would put a write token in GitHub
Secrets, which is exactly what the read/write split prevents.

**The guarantee covers repo and history only.** Art *is* extractable from a
shipped build: `.pck` extractors are commodity tooling and the Web build serves the
`.pck` as a public download. `Cor/Art/` is a build input, not a secret — encrypting
the PCK wouldn't change that, since the key would ship inside the exported binary.

Developer workflow: `art-pull.sh` fetches the pinned bundle and refuses to
overwrite differing local art unless forced. `art-push.sh v<n>` validates pairing
→ packages → uploads → reads back and verifies the stored object → **refuses to
overwrite an already-published version** → prints the manifest values to commit.

The runner cleanup step is best-effort — GitHub-hosted runners are ephemeral
anyway. The real control is keeping `upload-artifact` paths narrow: the Android
workflow uploads only the `.aab`.

Usage sits far inside R2's free tier. **Avoid enabling R2 Data Catalog, R2 SQL or
Infrequent Access on the bucket** — each is billed separately.

## Android Deploy wsplaytod workflow

`.github/workflows/Android-Deploy-wsplaytod.yml` — manual `workflow_dispatch`
build, test and sign for Google Play internal testing, endpoint fixed to
`wsplaytod` with debug UI enabled.

**Sequence:** fetch private art → write the endpoint config → download Godot
`4.6.2.stable` → install the Android SDK → resolve the next version code from
Google Play → restore the release keystore → import and parse the project → run
the compile/startup smoke test → run required GUT tests → install the Android
build template and export a signed AAB → validate → upload → optionally push to
the internal track → verify the track lists the resolved version code → remove
fetched art (`if: always()`).

**Version code resolution** authenticates to the Play Android Publisher API, reads
every track's `versionCodes[]`, and uses the highest + 1 (or `1` if no release
exists). An override is allowed **only as a positive integer greater than the
detected maximum**.

**Export details:** the CI preset uses Godot's Gradle Android build path;
`--install-android-build-template` runs during headless export; CI writes a valid
`EditorSettings` resource so Godot reads the SDK paths without parse warnings. The
generated build template is never committed.

**Validation gates:** the AAB must be non-empty, pass zip integrity, contain the
expected bundle config and base manifest, include `arm64-v8a` native libs, exclude
disabled architectures, and pass Java signature verification. The smoke test fails
the workflow if the main scene, the `NetworkManager` autoload, Game UI Scene,
instantiation, or ready-wiring is broken.

Action majors are kept Node 24-compatible, avoiding deprecated Node 20 compat
flags. SDK license acceptance is handled by the setup action rather than a manual
shell pipe.

## Client endpoint config

`scripts/write-endpoint-config.sh` regenerates the committed
`Sys/NetMan/Endpoint_Config.gd` before each client build from four env vars:

| Var | Effect |
|---|---|
| `CORP_TOWER_WS_PRIMARY` | Required |
| `CORP_TOWER_WS_FAILOVER` | Optional — **empty disables client-side failover** |
| `CORP_TOWER_DEBUG_UI` | Gates the floating debug button |
| `CORP_TOWER_DEMO_MODE` | Defaults `false` — gates the bots-disclosure label |

The committed default (dev instance 1 primary, instance 2 failover, debug on, demo
off) is what a local editor run or an un-rewritten build gets. **Every CI build
that ships a real endpoint calls this script first.**

The gate is a **build-time flag, not a runtime host check** — it has to hold on
Android and in the editor, where there is no hostname to read.

## Server container image

`src/Server/Dockerfile` — packages the Node WebSocket server.

- Installs dependencies and copies source from `src/Server/app` **only** — the
  tooling and tests live outside `app/` and are deliberately not copied in.
- Runs `Server.js`; exposes port `3000`.
- Built by the K3s deploy workflows as **one shared image for both prod and test**,
  tagged with the immutable commit SHA and pushed to ECR. EKS server pods reuse the
  same repository. The deployment provides `REDIS_URL` and
  `RECONNECT_TTL_SECONDS`.
- Healthchecks use a short interval so rolling-deploy readiness reports quickly.

## Required secrets (client / art scope)

| Secret | Used for |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private Asset Pipeline, CI read-only |
| `ANDROID_RELEASE_KEYSTORE_BASE64` / `_ALIAS` / `_PASSWORD` | Android release signing |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Android Publisher API access |

Infra secrets are scoped separately →
[deployment.md](./deployment.md#required-secrets-infra-scope).

**Cloudflare Pages cannot host the client.** Its 25 MiB per-file cap applies on
every plan and to the *stored* file, so compression does not help a 35.95 MiB
`index.wasm`. Beyond the physical backup's own web servers, the Godot client has
no web-hosted deploy target.
