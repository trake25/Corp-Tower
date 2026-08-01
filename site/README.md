# Corp Tower Portfolio Site

Astro static site for `enportfolio.galaxxigames.com` — see
`plan/corp-tower-portfolio-plan-v2.md` for the design brief. Six role-tagged
case-study cards over the Corp Tower project, each with a plain-English
collapsed summary and an expanded engineering rationale (`src/content/cards/`,
one file per card — adding a role or card is a content change, not a layout
change).

## Local development

Requires **Node `^20.19.0` or `^22.12.0` or `>=23`** — this repo's other
tooling (the physical backup machine, the self-hosted runner) doesn't need
that, so don't assume the system Node on any given machine satisfies it. If
it doesn't, grab a standalone build rather than changing the system install:

```bash
curl -fsSL -o /tmp/node22.tar.xz https://nodejs.org/dist/v22.13.0/node-v22.13.0-linux-x64.tar.xz
tar -xJf /tmp/node22.tar.xz -C /tmp
export PATH="/tmp/node-v22.13.0-linux-x64/bin:$PATH"
```

Then, from this directory:

```bash
npm ci          # installs from the committed package-lock.json — matches CI exactly
npm run dev      # local dev server
npm run build    # astro check + static build to dist/
npm run preview  # serve the built dist/ locally
```

`npm run build` runs `astro check` first — it fails the build on a type
error, same as CI.

## One-time manual setup (cannot be done by any workflow)

Deployed as a **Workers Static Assets** site (`wrangler.jsonc`), not the
retired standalone Pages project flow — Cloudflare's dashboard now creates
these under Workers & Pages → **Create Application → Upload assets**.
`.github/workflows/Site-Deploy-Workers.yml` builds on every push to
`site/**` and runs `wrangler deploy`, but it can't create the Cloudflare side
of that pipeline for itself — same reason EKS's ACM/IAM setup is manual (see
`docs/context/deployment.md`). Do this once:

1. **Create the Worker.** Dashboard → Workers & Pages → **Create
   Application** → **Upload assets**. When it asks for a folder, build first
   (`npm run build`, from this directory) and upload **`site/dist`** — never
   `site/` itself or `src/`. When it asks for a name, use
   `corp-tower-portfolio` to match `"name"` in `wrangler.jsonc`, or update
   `wrangler.jsonc` if you name it differently. This first upload only
   exists to create the Worker; every push after that redeploys it via CI,
   which reads the same `wrangler.jsonc`.
2. **Add the custom domain.** On the Worker → Settings → Domains & Routes →
   Add → Custom Domain → `enportfolio.galaxxigames.com`. Since
   `galaxxigames.com` is already a Cloudflare zone, this provisions the DNS
   automatically — no manual record needed.
3. **Create a Cloudflare API token scoped to `Account > Workers Scripts >
   Edit` only** (the dashboard has a built-in "Edit Cloudflare Workers"
   template — start from that rather than a custom scope). Use a token
   **separate from** the existing `CLOUDFLARE_API_TOKEN` secret (that one is
   scoped to `Zone.DNS Edit` for the game's K3s/EKS DNS records) — same
   reasoning as the physical backup machine using its own token: a
   compromise of one shouldn't reach the other's blast radius. Save it as
   the GitHub repo secret `CLOUDFLARE_WORKERS_API_TOKEN`.
4. **Find the Cloudflare Account ID** (dashboard right sidebar on almost any
   page, or `wrangler whoami`). Save it as the GitHub repo secret
   `CLOUDFLARE_ACCOUNT_ID`.
5. **Cloudflare Web Analytics (optional but planned).** Dashboard → Analytics
   & Logs → Web Analytics → Add a site → `enportfolio.galaxxigames.com` →
   copy the beacon token. Save it as the GitHub repo secret
   `CF_ANALYTICS_TOKEN`. Until this secret exists, the build simply omits the
   analytics script tag — no broken beacon call ships either way
   (`src/layouts/BaseLayout.astro`).
6. **First CI deploy.** Push to `main` (or dispatch `Site Deploy (Cloudflare
   Workers)` manually) and confirm the run succeeds, then confirm
   `https://enportfolio.galaxxigames.com` resolves and serves the hub page.

You can also validate the config locally at any point without deploying:
`npx wrangler deploy --dry-run` (from this directory, after `npm run
build`) — reads the assets directory and reports what it would upload with
no network call.

## What's not here yet

- The "Watch the cluster" CTA is a disabled placeholder until the EKS
  recording lands (Phase 3 of the portfolio plan) — R2-hosted clip, lazy
  loaded, per the plan's Site and analytics section.
- Cross-browser/breakpoint QA (Phase 4) needs the site actually deployed
  first — can't be verified from a static build alone.
