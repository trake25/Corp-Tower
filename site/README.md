# Corp Tower Portfolio Site

Astro static site, deployed to Cloudflare Workers (Static Assets), live at
**`https://enportfolio.galaxxigames.com`**. Six role-tagged case-study cards
over the project — Cloud, DevOps, QA, Backend, Frontend, AI — each with a
plain-English collapsed summary and an expanded engineering rationale.

**The project is called _Top or Drop_ (TOD) on this site.** The repository
still carries the working name `Corp-Tower`, and deliberately keeps it: every
`links[].href` in the cards points at real files under that name. The site-side
name lives in `src/data/profile.json` (`project` / `projectShort`) and is
referenced everywhere else, so a future rename is one edit. The footer states
the mismatch explicitly so a visitor clicking through to GitHub isn't confused.

**The three deployment targets are not presented as equals**, and the copy
depends on that framing: **EKS** is the production-grade target, **K3s** is the
lab where things get tested and learned, and the **physical backup machine** is
the cost-efficient development target — which also serves the public demo, so
the hero discloses that its latency isn't production's. Changing that framing
means changing `src/content/cards/cloud.md`, `TopologyDiagram.astro`, the
hero ledes and the figure caption together.

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
| 2 — Copy | **Partly refined.** One pass done: renamed to TOD, job title reordered to AI-Automation-first, "Decisions" renamed to "Trade-offs" throughout, the three targets reframed (EKS production / K3s lab / backup dev+demo), the stat strip rewritten from inventory counts to outcomes, the Cloud card rewritten, and the filter retagged onto cross-cutting topics. **Still open:** the remaining five card bodies, the `ai.md` card has no Proof section, `qa.md`'s fourth heading is a sentence where the others are one word, and en-GB/en-US spelling is mixed within single files. |
| 3 — Evidence | **Diagram done, recording pending.** The hand-authored SVG topology diagram is live on the hub. The EKS lifecycle recording (apply → deploy → smoke tests → play a round → destroy) is still unrecorded — manual OBS/FFmpeg work, planned for a separate session. The "Watch the cluster" CTA is a disabled placeholder until that clip exists. |
| 4 — QA | **Confirmed working**, no known functional/UI issues as of the last check. Formal breakpoint/cross-browser sweep hasn't been separately logged. |

**Naming — settled for the site, not for the repo.** The site says *Top or
Drop (TOD)* everywhere, sourced from `src/data/profile.json`. The repository,
its paths and its workflows are still `Corp-Tower` and are not being renamed:
the card links point into it. Nothing on the site hardcodes either name except
`profile.json` and `profile.ts`'s `repo`.

## Content map — where to edit what

| What | File |
|---|---|
| Name, job title, project name, OG-image strings | `src/data/profile.json` — read by both the site and `tools/generate-og.mjs`, which is why it's JSON and not TypeScript |
| Hook line, intro paragraph, stack line, CTA text, demo-disclosure line | `src/pages/index.astro` |
| The six cards (plain summary + Decision/Instead of/Why it matters/Proof) | `src/content/cards/*.md` — one file per role (`cloud.md`, `devops.md`, `qa.md`, `backend.md`, `frontend.md`, `ai.md`). Adding a role or card is a content change, not a layout change — the filter/grid derive from whatever's in this directory. |
| Which topics a card is filed under | that card's `tags`. **These are cross-cutting topics, not the card's role** — `AWS`, `Kubernetes`, `CI/CD`, `Testing`, `Multiplayer`, `AI agents`, each shared by 2–3 cards. A tag only one card carries makes a filter button that returns one result, which is what this bar looked like before and why it was retagged. The visible role chip comes from `role`, not from `tags`. |
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

## Social preview image — generated, no manual step

`src/layouts/BaseLayout.astro` points `og:image` at `/og.png`: the 1200×630
card LinkedIn, Slack, WhatsApp and X show when someone pastes a link.
`tools/generate-og.mjs` draws it with `sharp` from the same
`src/data/profile.json` the site reads, and runs automatically as npm's
`prebuild` hook — so `npm run build` (and therefore CI) always ships a current
image, and it can't drift from the site's own copy. `npm run og` regenerates it
alone.

`public/og.png` is **gitignored**: it's a build output, not a source file.

Two things to know if you edit the generator:

- **Name real font families, never the CSS generics.** Fonts resolve through
  fontconfig here, not a browser. Asking for `sans-serif` returned a *monospace*
  face on Windows. The `SANS`/`MONO` stacks name Arial/Helvetica for Windows and
  DejaVu/Liberation for the Ubuntu runner.
- **Keep text left-aligned with slack on the longest line.** Windows and CI pick
  different faces with different metrics; left alignment means a wider face
  shifts nothing instead of breaking a centred layout.

`tools/og-source.html` is the older hand-screenshot source and is no longer part
of any workflow.

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

- `profile.linkedin` is `null` in `src/data/profile.ts`, so the LinkedIn
  button doesn't render. Set it to the profile URL to turn it on.
- The EKS cluster recording (Phase 3 of the portfolio plan) — R2-hosted clip,
  lazy loaded. The disabled "Watch the cluster — coming soon" CTA was removed
  rather than shipped greyed out; add it back as a real link when the clip
  exists.
- Cross-browser/breakpoint QA (Phase 4) needs the site actually deployed
  first — can't be verified from a static build alone.
