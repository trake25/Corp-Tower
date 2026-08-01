# Corp Tower Portfolio Site

Astro static site, deployed to Cloudflare Workers (Static Assets), live at
**`https://enportfolio.galaxxigames.com`**. Six role-tagged case-study cards
over the Corp Tower project — Cloud, DevOps, QA, Backend, Frontend, AI — each
with a plain-English collapsed summary and an expanded engineering
rationale.

**Source of truth for intent/rationale:** `plan/corp-tower-portfolio-plan-v2.md`
(the site as a whole) and `plan/corp-tower-demo-instance-plan.md` (the
`toddemo`/`wstoddemo` backend the "Play it" button links to). This README
covers orientation and mechanics only — read the plan docs for *why*, not
here, to avoid two copies of the same reasoning drifting apart.

**This directory is intentionally outside `docs/context/`** — that KB's
scope is the game system (client/server/infra), not the marketing site
around it. This README is this directory's own entry point instead.

## Status — still v1

| Phase (from the plan) | State |
|---|---|
| 0 — Ship the shell | **Done.** Domain resolves, push redeploys via CI, confirmed working, no known functional/UI issues. |
| 1 — Demo instance (`toddemo`) | **Done.** Live, playable, bots disclosed. |
| 2 — Copy | **Cards are in place but not final.** Content and overall UI look need a refinement pass — planned for a separate session, not blocking. |
| 3 — Evidence | **Diagram done, recording pending.** The hand-authored SVG topology diagram is live on the hub. The EKS lifecycle recording (apply → deploy → smoke tests → play a round → destroy) is still unrecorded — manual OBS/FFmpeg work, planned for a separate session. The "Watch the cluster" CTA is a disabled placeholder until that clip exists. |
| 4 — QA | **Confirmed working**, no known functional/UI issues as of the last check. Formal breakpoint/cross-browser sweep hasn't been separately logged. |

**Open naming question:** the project's dev name is "Corp Tower"; the
production name is undecided, with **TOD** as the leading candidate. Nothing
has been renamed yet. If/when it's decided, three files carry the "Corp
Tower" branding and need one pass together: `src/layouts/BaseLayout.astro`
(`<title>`/meta description), `src/pages/index.astro` (`<h1>`/intro), and
`src/components/TopologyDiagram.astro` (SVG `<title>`/`<desc>`).

## Content map — where to edit what

| What | File |
|---|---|
| Hook line, intro paragraph, stack line, CTA text, bot-disclosure line | `src/pages/index.astro` |
| The six cards (plain summary + Decision/Instead of/For/Proof) | `src/content/cards/*.md` — one file per role (`cloud.md`, `devops.md`, `qa.md`, `backend.md`, `frontend.md`, `ai.md`). Adding a role or card is a content change, not a layout change — the filter/grid derive from whatever's in this directory. |
| Topology diagram labels/text | `src/components/TopologyDiagram.astro` — raw SVG, labels are plain `<text>` elements |
| Page title, meta description, favicon, analytics script | `src/layouts/BaseLayout.astro` |
| 404 page copy | `src/pages/404.astro` |
| Colors/spacing/fonts | `src/styles/global.css` |
| Deploy target / assets directory | `wrangler.jsonc` |

For AI-assisted refinement (Phase 2), `src/content/cards/*.md` is the
highest-value target — that's where the plan's own rule lives: *if a
collapsed summary contains a term you'd have to look up, it isn't finished.*
After any edit: `cd site && npm run build` to catch errors before pushing.

## Stack and deploy

Astro static build → Cloudflare Workers Static Assets (`wrangler.jsonc`,
`assets.directory: ./dist`). `.github/workflows/Site-Deploy-Workers.yml`
builds and runs `wrangler deploy` on every push to `site/**`. No server-side
logic, no bindings — a plain static site.

**Maintenance mode.** `.github/workflows/Site-Cleanup-Workers.yml`
(`workflow_dispatch` only) deploys `site/maintenance/index.html` in place of
the built site — same Worker, same custom domain, no DNS or Worker deletion,
mirroring the K3s web server's soft-cleanup pattern
([deployment.md](../docs/context/deployment.md)). It overwrites `site/dist`
with just the placeholder and runs the same `wrangler deploy`. A normal push
to `site/**` (or a manual `Site Deploy (Cloudflare Workers)` dispatch)
rebuilds the real site and cleanly overwrites the placeholder again.

## Where things live

| Change | File |
|---|---|
| Name, contact, links, availability line | `src/data/profile.ts` |
| Hero stat strip | `stats` in `src/data/profile.ts` |
| A card's headline, metric, plain summary, repo links | that card's frontmatter in `src/content/cards/` |
| A card's reasoning | that card's markdown body — `###` headings become the label rows |
| Fields a card is allowed to have | `src/content/config.ts` |
| Hero copy, services, contact section | `src/pages/index.astro` |
| Colours, type scale, every component style | `src/styles/global.css` |

Every card frontmatter `links[].href` must be a full URL and is checked by the
content schema at build time — `astro check` fails on a malformed one, but it
cannot tell you a valid URL 404s. Re-check them after moving files in the main
repo.

## Social preview image (one manual step)

`src/layouts/BaseLayout.astro` points `og:image` at `/og.png`. That file is
generated by hand from `tools/og-source.html`, which is deliberately **not** in
`public/` so it never ships:

1. Open `tools/og-source.html` in Chrome.
2. DevTools (F12) → device toolbar (Ctrl+Shift+M) → set **1200 × 630**, zoom 100%.
3. ⋮ menu → **Capture screenshot**.
4. Save it as `public/og.png` and redeploy.

Until `public/og.png` exists, links shared to LinkedIn, Slack or X render
without a preview card.

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
error, same as CI. You can also validate the Workers config without
deploying: `npx wrangler deploy --dry-run` (after `npm run build`) — reads
the assets directory and reports what it would upload with no network call.

## One-time Cloudflare setup — already done, kept for reference

The Worker (`corp-tower-portfolio`), its custom domain
(`enportfolio.galaxxigames.com`), and the three GitHub secrets below are
already created and working. These steps are kept here only for disaster
recovery (e.g. standing the project up again under a new Cloudflare
account) — don't re-run them against the live project.

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

- `public/og.png` — see the social preview step above. One screenshot.
- `profile.linkedin` is `null` in `src/data/profile.ts`, so the LinkedIn
  button doesn't render. Set it to the profile URL to turn it on.
- The EKS cluster recording (Phase 3 of the portfolio plan) — R2-hosted clip,
  lazy loaded. The disabled "Watch the cluster — coming soon" CTA was removed
  rather than shipped greyed out; add it back as a real link when the clip
  exists.
- Cross-browser/breakpoint QA (Phase 4) needs the site actually deployed
  first — can't be verified from a static build alone.
