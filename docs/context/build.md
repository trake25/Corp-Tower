# Build & Release

Scope: how source becomes a shippable artifact — Android build, HTML5/Web build, the private production-art pipeline both consume, and the server container image. Where these artifacts run → [deployment.md](./deployment.md).

## Private Asset Pipeline

Keeps production art out of the public repository while baking it into every release build. Art lives only on the developer machine, in a private Cloudflare R2 bucket, on the CI runner during a build, and inside the final exported game.

Files: `.github/actions/fetch-private-assets/action.yml`, `src/Client/App/corp-tower/Cor/art-manifest.json`, `scripts/art-common.sh`, `scripts/art-pull.sh`, `scripts/art-push.sh`.

- Versioned, immutable art bundles live in the private R2 bucket `corp-tower-assets`, at `art/releases/art-<version>.tar.gz`.
- `art-manifest.json` (committed) holds `version`, `object`, `sha256`, `file_count`, `sentinels` — pins which bundle a given commit builds against, so rebuilding an old commit always fetches the art it was authored against.
- `Cor/Art/` is gitignored and has never been committed.
- CI verification order: download → sha256 → extract → file count → sentinel files. **Every check fails closed** — the build fails rather than exporting with missing assets.
- Bundles are packed deterministically (`tar --sort=name`, fixed mtime/ownership, `gzip -n`) so identical content always hashes identically — this is what lets `art-pull.sh` detect "already up to date" without downloading, and what makes the manifest hash meaningful.
- `.import` files travel inside the bundle alongside their `.png` — they carry the UIDs public `.tscn` files reference (e.g. Game UI Scene pins `uid://b0dlpjeh71j0c` for `Static/bg.png`). Regenerating them in CI would mint fresh UIDs and break every scene reference. Scripts validate `.png`/`.import` pairing before packaging.

**Credentials (deliberately split — see [decisions.md](./decisions.md#private-asset-pipeline-credential-split)):** CI holds an R2 **Object Read only** token (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`); local dev holds **Object Read & Write** in the gitignored `.env.art` (template `.env.art.example`).

**Developer workflow:** `./scripts/art-pull.sh` fetches the pinned bundle (refuses to overwrite differing local art unless `--force`). `./scripts/art-push.sh v<n>` validates pairing → packages → uploads → reads back and verifies the stored object → refuses to overwrite an already-published version → prints the manifest values to commit.

**Notes:**
- Privacy scope: art is absent from the repo/history, not browsable/forkable from GitHub — but *is* extractable from a shipped build (see [decisions.md](./decisions.md#private-asset-pipeline-credential-split) for the full caveat).
- The runner cleanup step (`if: always()`, removes fetched art) is best-effort — GitHub-hosted runners are ephemeral anyway. The real control is keeping `upload-artifact` paths narrow (the Android workflow uploads only the `.aab`).
- Usage sits far inside R2's free tier (~17 MB against 10 GB-month; egress always free). Avoid enabling R2 Data Catalog, R2 SQL, or Infrequent Access storage on the bucket — each is billed separately.
- `art_version_override` exists on every client build workflow for testing an unpublished bundle. It skips sha256 verification and warns — **must never be used for a release.**

## Client Android Internal Workflow

`.github/workflows/Client-Android-Internal.yml` — manual `workflow_dispatch` build/test/sign for Google Play internal testing. Runs on `ubuntu-24.04`.

**Inputs:** `version_code_override`, `version_name`, `upload_to_play`, `art_version_override` (testing only).

**Sequence:** fetch private art into `Cor/Art` → download Godot `4.6.2.stable` Linux → install Android SDK via `android-actions/setup-android` → resolve next version code from Google Play → restore release keystore from secrets → import/parse Godot project → run the always-on compile/startup smoke test → run required GUT tests → install the Android build template + export a signed AAB → validate the artifact → upload → optionally push to the Play internal track → verify the track lists the resolved version code → remove fetched art (`if: always()`).

**Version code resolution:** authenticates to the Google Play Android Publisher API (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`), reads every track's `versionCodes[]` for `com.galaxxigames.corptower`, uses the highest value + 1 (or `1` if no release exists yet). `version_code_override` is allowed only as a positive integer greater than the detected maximum.

**Export details:** CI preset uses Godot's Gradle Android build path; `--install-android-build-template` runs during headless export; CI writes a valid `EditorSettings` resource so Godot reads Android/Java SDK paths without parse warnings. The generated build template is never committed.

**Validation gates:** the exported AAB must be non-empty, pass zip integrity, contain the expected bundle config + base manifest, include `arm64-v8a` native libs, exclude disabled architectures, and pass Java signature verification. `res://Tests/CiSmokeTest.gd` fails the workflow if the main scene, `NetworkManager` autoload, Game UI Scene, scene instantiation, or ready-wiring is broken.

**Runner/action runtime notes:** Node 24-compatible Action majors, avoiding deprecated Node 20 compat flags. SDK license acceptance handled by the setup action, not a manual shell pipe; CI installs only the specific platform/build/NDK/CMake packages it needs.

**Dependencies:** Godot Client App, Private Asset Pipeline, `.github/actions/fetch-private-assets`, `addons/gut`, `Tests/CiSmokeTest.gd`, `Tests/Gut`, `.github/godot/export_presets.android.ci.cfg`, a Google Play service account with Android Publisher API + Play Console access to `com.galaxxigames.corptower`.

## Client HTML5 Pages

`.github/workflows/Client-HTML5-Pages.yml` (+ paired `Client-HTML5-Undeploy.yml`) — builds/exports/deploys the Godot client as WebGL to GitHub Pages. Manual `workflow_dispatch`, runs on `ubuntu-24.04`. Input: `art_version_override` (testing only).

**Behavior:** calls `actions/configure-pages` with `enablement: true` (so a torn-down Pages site is recreated on next deploy) → fetches private art via `fetch-private-assets` (fails closed on missing/bad-hash/incomplete bundle) → builds via the `build-godot-web` composite action (downloads Godot `4.6.2.stable` + matching Web export templates, applies `.github/godot/export_presets.web.ci.cfg`, imports headless, exports a Web release, writes a file-size report to the job summary) → disables Jekyll (`.nojekyll`) → writes a `CNAME` file (`play.tod.galaxxigames.com`, inert — see Custom domain below) → uploads `build/web` as a Pages artifact and deploys to the `github-pages` environment → removes fetched art (`if: always()`).

**Teardown (`Client-HTML5-Undeploy.yml`):** manual, requires typing `UNDEPLOY`. `soft` (default) deploys a minimal "build offline" page (also carries the inert `CNAME` file), site stays registered. `hard` calls `DELETE /repos/{owner}/{repo}/pages`, so the URL 404s **and the custom domain setting below is lost** — must be re-added manually after the next deploy recreates the site. Redeploy = run the deploy workflow again. Hard undeploy may need repo-admin rights beyond the default `GITHUB_TOKEN` — the workflow reports a 403 explicitly and points at soft mode; **untested against the live repo**, which is why soft is the default. Either mode also deploys the physical web backup automatically (`failover_to_backup` input, default on) — see below.

**Custom domain:** live at `https://play.tod.galaxxigames.com` — a Cloudflare `CNAME` record (`play.tod` → `trake25.github.io`, Proxied/orange-cloud) in the shared `galaxxigames.com` zone, same zone as `ws.tod.galaxxigames.com` and `devtod.galaxxigames.com` ([deployment.md](./deployment.md)). Cloudflare's free Edge Certificate (Universal SSL) only covers the zone apex and *one* level of subdomain below it — `play.tod` is two levels deep and only works because a certificate for it already exists; reusing it for anything requiring a *new* Cloudflare-proxied hostname at that depth needs a paid Advanced Certificate Manager add-on (Total TLS), confirmed the hard way while building the web backup below → [deployment.md § Web (HTML5) backup](./deployment.md#web-html5-backup). The domain itself is registered as a **manual, one-time repo setting** (Settings → Pages → Custom domain), not derived from the `CNAME` file the workflow writes into `build/web`/`build/offline` — that file only matters for the legacy Jekyll/branch-based Pages build, and this workflow uses the Actions-based method (`upload-pages-artifact` + `deploy-pages`), which ignores it. **Enforce HTTPS** must stay on: the Godot Web export checks `window.isSecureContext` and refuses to boot over plain HTTP. Why this can't be automated in the workflow → [decisions.md](./decisions.md#pages-custom-domain-must-be-set-manually).

**Hosting choice:** GitHub Pages, not Cloudflare Pages — full rationale → [decisions.md](./decisions.md#github-pages-over-cloudflare-pages-for-html5). Consequence: the deployed build is public to anyone with the URL (no access control).

**Physical backup:** the same physical machine that backs up `ws.tod.galaxxigames.com` also backs up this build, at a separate hostname (`devplay.galaxxigames.com`) — `Client-HTML5-Undeploy.yml`'s `failover_to_backup` input and this workflow's own `stand_down_backup` input couple the two automatically. Full detail → [deployment.md § Web (HTML5) backup](./deployment.md#web-html5-backup).

**Dependencies:** Godot Client App, Private Asset Pipeline, `.github/actions/build-godot-web`, `.github/actions/fetch-private-assets`.

## Server Container Image

`src/Server/Dockerfile` — packages the Node WebSocket server for staging deploy.

- Installs server dependencies; copies source from `src/Server/app` **only** — tooling ([Balance Simulator](./testing.md#balance-simulator)) and tests ([Server Score Events Tests](./testing.md#server-score-events-tests)) live outside `app/` and are not copied in.
- Runs `Server.js`; exposes port `3000`.
- Built as part of [Server K3s Deploy](./deployment.md#k3s-workflows); tagged with the immutable commit SHA; pushed to ECR. K3s server pods reuse this same ECR image/repository. Worker deployment provides `REDIS_URL` and `RECONNECT_TTL_SECONDS`.
- Container healthchecks use a short staging interval so rolling-deploy readiness reports quickly.
- Current staging deploy avoids requiring local Docker.

## Required secrets (client / art scope)

| Secret | Used for |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private Asset Pipeline (CI read-only) |
| `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD` | Android release signing |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play Android Publisher API access |

Infra/K3s/EKS secrets are scoped separately — see [deployment.md § Required secrets](./deployment.md#required-secrets-infra-scope).
