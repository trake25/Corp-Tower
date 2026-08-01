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
   Application** → **Upload assets** (Cloudflare retired the standalone
   Pages project flow). Build first (`npm run build`) and upload
   **`site/dist`** — never `site/` itself or `src/`. Name it
   `corp-tower-portfolio` to match `"name"` in `wrangler.jsonc`. This first
   upload only exists to create the Worker; every push after that redeploys
   it via CI.
2. **Add the custom domain.** Worker → Settings → Domains & Routes → Add →
   Custom Domain → `enportfolio.galaxxigames.com`. Provisions DNS
   automatically since `galaxxigames.com` is already a Cloudflare zone.
3. **`CLOUDFLARE_WORKERS_API_TOKEN`** — API token scoped to `Account >
   Workers Scripts > Edit` only (dashboard's built-in "Edit Cloudflare
   Workers" template). Deliberately **separate** from the game's
   `CLOUDFLARE_API_TOKEN` (`Zone.DNS Edit`, used for K3s/EKS DNS) — a
   compromise of one token shouldn't reach the other's blast radius.
4. **`CLOUDFLARE_ACCOUNT_ID`** — dashboard right sidebar on almost any page,
   or `wrangler whoami`.
5. **`CF_ANALYTICS_TOKEN`** — Dashboard → Analytics & Logs → Web Analytics →
   Add a site → `enportfolio.galaxxigames.com` → beacon token. If this
   secret is ever unset, the build simply omits the analytics script tag —
   no broken beacon call ships either way (`src/layouts/BaseLayout.astro`).
