# Private Asset Pipeline — Setup Guide

Art assets live in a private Cloudflare R2 bucket, never in this repository. CI
downloads and verifies them at build time. This document covers the manual
configuration that cannot be automated, plus the cost rules that must not be
broken.

**Status of automation:** all code, workflows, and the R2 bucket itself are
already in place. What remains below is credential and dashboard work.

---

## Cost rules — read before changing anything

Everything in this pipeline runs inside permanent free tiers. Current usage
against the limits:

| Service | Free allowance | Actual usage | Headroom |
|---|---|---|---|
| R2 storage | 10 GB-month | ~17 MB | ~600× |
| R2 Class A ops (writes) | 1,000,000 / mo | ~5 | 200,000× |
| R2 Class B ops (reads) | 10,000,000 / mo | ~50 | 200,000× |
| R2 egress | Always free | — | — |
| Pages bandwidth | Unlimited | — | — |
| Pages files per site | 20,000 | ~30 | 660× |
| Zero Trust Access | 50 users | ≤50 testers | — |

**Tripwires — do not cross these:**

1. 🚨 **Never exceed 50 Zero Trust users.** At user 51 the plan converts to
   **$7/user/month for every user**, not just the overage. Treat 50 as a hard cap.
2. 🚨 **Do not enable Pages Functions.** Requests bill against Workers quotas.
   This deployment is pure static assets and needs none.
3. 🚨 **Do not enable R2 Data Catalog or R2 SQL** on the bucket — separately billed.
4. 🚨 **Do not upgrade to Workers Paid.** Nothing here requires it.
5. 🚨 **Do not switch the bucket to Infrequent Access storage.** Adds retrieval
   charges; Standard is free at this volume.

---

## What is already done

- ✅ `Cor/Art/` is gitignored and has never been committed
- ✅ R2 bucket `corp-tower-assets` created (private, Standard, ENAM)
- ✅ Asset bundle `art-v1.tar.gz` built and verified — 112 files, sha256 recorded
- ✅ Manifest, scripts, composite actions, and all four workflows written

---

## Step 1 — Create the two R2 API tokens

Two tokens, deliberately. CI gets read-only so a leaked CI credential cannot
destroy the source of truth.

**Cloudflare dashboard → R2 Object Storage → API → Manage API tokens → Create API token**

**Token A — CI (read-only)**

| Field | Value |
|---|---|
| Token name | `corp-tower-art-ci` |
| Permission | **Object Read only** |
| Specify bucket | `corp-tower-assets` (not "Apply to all buckets") |
| TTL | Forever |

**Token B — local dev (read-write)**

| Field | Value |
|---|---|
| Token name | `corp-tower-art-dev` |
| Permission | **Object Read & Write** |
| Specify bucket | `corp-tower-assets` |
| TTL | Forever |

Each token shows an **Access Key ID** and **Secret Access Key** exactly once.
Save both somewhere safe now. You will also need your **Account ID**, shown on
the R2 overview page.

> Do not paste any of these values into the Claude conversation. Nothing in this
> setup requires it.

---

## Step 2 — Configure local credentials and upload the bundle

```bash
cp .env.art.example .env.art
```

Fill in `.env.art` with the **dev (read-write)** token from Token B, plus your
account ID. The file is gitignored.

The v1 bundle has already been built and its hash is pinned in
`Cor/art-manifest.json`. Publish it:

```bash
./scripts/art-push.sh v1
```

Expected output ends with the manifest values. They must match what is already
in `Cor/art-manifest.json`:

```
sha256:     f981edeab8a8863f6ddc9a230134f4014d4f5bd75999d1b9de83c4470006e98f
file_count: 112
```

If the sha256 differs, your local `Cor/Art/` has changed since the bundle was
built. Publish it as `v2` instead and update the manifest with the new values.

**Verify:**
```bash
./scripts/art-pull.sh
```
Should report `already up to date (v1)`.

---

## Step 3 — Add GitHub Secrets

`gh` CLI is not installed on this machine, so use the web UI.

**GitHub → `trake25/Corp-Tower` → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Token A (**CI, read-only**) access key ID |
| `R2_SECRET_ACCESS_KEY` | Token A secret access key |
| `R2_BUCKET` | `corp-tower-assets` |

⚠️ Use **Token A**, the read-only one. Not the dev token.

**Verify:** run **Client HTML5 Pages** from the Actions tab. The job summary
should show a "Private assets" section reporting 112 files and `sha256 verified`.

---

## Step 4 — Read the size report (decision gate)

That same run produces a **Web export size report** in the job summary, listing
the ten largest output files.

**Find the largest file — almost certainly `index.wasm` — and check its size:**

- **Under 25 MiB** → Cloudflare Pages is viable. Continue to Step 5.
- **25 MiB or over** → Cloudflare Pages will reject the deployment. Stop here;
  GitHub Pages remains the HTML5 target. The Cloudflare workflow will fail with
  an explanatory error rather than an opaque wrangler one.

This is a real gate, not a formality. Cloudflare's 25 MiB per-file cap applies
on every plan including paid, and Godot web exports land close to it.

---

## Step 5 — Create the Cloudflare Pages project

Only if Step 4 passed.

**Cloudflare dashboard → Workers & Pages → Create → Pages → Upload assets**

| Field | Value |
|---|---|
| Project name | `corp-tower` |

Upload any placeholder file to create the project — the workflow replaces it on
first real deploy. The project must exist before `wrangler pages deploy` can
target it.

> Choose **Upload assets** (Direct Upload), **not** "Connect to Git". Cloudflare's
> build runners have no Godot toolchain, cap builds at 20 minutes, cannot build
> Android, and would bypass the GUT and smoke-test gates. Building once in
> Actions keeps one validated pipeline for every target.

---

## Step 6 — Create the Cloudflare API token for wrangler

**Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token**

| Field | Value |
|---|---|
| Token name | `corp-tower-pages-deploy` |
| Permission | **Account → Cloudflare Pages → Edit** |
| Account resources | Include → your account |
| TTL | Forever |

Add to GitHub Secrets alongside the others:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token just created |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (same as `R2_ACCOUNT_ID`) |

**Verify:** run **Client HTML5 Cloudflare Pages** with `deploy_branch: main`.

---

## Step 7 — Custom domain and playtest access control

**Custom domain:** Pages project → Custom domains → Set up a domain. Use a
subdomain of the domain you already own, e.g. `play.yourdomain.com`. Free.

**Access gating (the main playtest benefit over GitHub Pages):**

**Zero Trust → Access → Applications → Add an application → Self-hosted**

| Field | Value |
|---|---|
| Application name | `Corp Tower Playtest` |
| Session duration | 24 hours |
| Domain | your Pages custom domain |

Then add a policy:

| Field | Value |
|---|---|
| Policy name | `Invited testers` |
| Action | Allow |
| Include | Emails → list your testers |

Testers receive a one-time code by email. Revoke by removing an address.

🚨 **Keep the list at 50 or fewer.** See tripwire #1.

---

## Day-to-day: updating art

```bash
# edit art in src/Client/App/corp-tower/Cor/Art/
./scripts/art-push.sh v2          # packages, uploads, prints new manifest values
```

Update `Cor/art-manifest.json` with the printed `sha256` and `file_count`, then
commit. The art version is now pinned to that commit — rebuilding it later always
fetches the same bundle.

Published versions are immutable; `art-push.sh` refuses to overwrite one.

---

## Deploy and undeploy

All workflows are manual (`workflow_dispatch`). Nothing deploys on push.

| Workflow | Purpose |
|---|---|
| **Client HTML5 Pages** | Deploy to GitHub Pages |
| **Client HTML5 Cloudflare Pages** | Deploy to Cloudflare Pages |
| **Client HTML5 Undeploy** | Tear down either target |
| **Client Android Internal** | Build AAB, optionally upload to Play |

**Undeploy** requires typing `UNDEPLOY` to confirm, and takes a mode:

- **soft** — replaces the game with an "offline" page. Site keeps existing.
- **hard** — deletes the site entirely; URL returns 404.

Redeploy is just running the matching deploy workflow again. The GitHub Pages
workflow calls `configure-pages` with `enablement: true`, which recreates a
hard-deleted site.

> **Known uncertainty:** hard undeploy of GitHub Pages calls
> `DELETE /repos/{owner}/{repo}/pages`, which may require repo-admin rights
> beyond what the default `GITHUB_TOKEN` carries. If it returns 403 the workflow
> says so and points you at soft mode. This has not been tested against the live
> repo yet — soft mode is the default for that reason.

---

## Troubleshooting

**`Failed to download ... from R2`**
Secrets missing or wrong, or the CI token is not scoped to `corp-tower-assets`.
Confirm all four `R2_*` secrets exist and that you used the read-only token.

**`Asset bundle sha256 mismatch — refusing to build`**
Working as designed. The R2 object does not match the manifest pinned in this
commit. Either the manifest was edited without republishing, or the wrong version
was uploaded. Never bypass this — it is the check that stops a placeholder-texture
build reaching Google Play.

**`Asset file count mismatch`**
The bundle extracted, but has the wrong number of files. Usually a `.png` added
without its `.import` sibling. Run `./scripts/art-push.sh` — it validates pairing
before packaging and will name the offending file.

**`'index.wasm' is N MiB, at or above the 25 MiB per-file limit`**
Cloudflare cannot host this build. Use GitHub Pages, or split the oversized file
out to a public R2 bucket.

**Build succeeds but the game shows blank/pink textures**
Should be impossible — the sentinel check fails first. If it happens, the sentinel
list in `art-manifest.json` is too narrow. Add the missing asset path to it.
