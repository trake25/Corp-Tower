# Corp Tower Portfolio Site

Astro static site, deployed to Cloudflare Workers (Static Assets), live at
**`https://enportfolio.galaxxigames.com`**. Six skill cards over the project —
AI, Cloud, DevOps, QA, Backend, Frontend — each collapsed to a plain-English
summary, its tool chips and a clickable diagram, expanding to the detail behind
whichever step you clicked.

**The project is presented as in development, not finished.** It has a playable
demo; the site's claim is the engineering behind the parts that already work,
not a shipped product. Copy that implies completion is a regression.

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
means changing `src/content/cards/cloud.md`, its diagram in
`src/components/diagrams/`, and the hero ledes together.

## Skills highlights — card anatomy

The cards section is **Skills highlights** (`#skills`), one card per skill.
**`src/content/cards/qa.md` is the approved reference**; the other five follow
it as their content gets rewritten.

**A card has three states, not two:**

1. **Vignette** — collapsed tile. Role chip and summary title only. Cards tile
   into a responsive grid in this state.
2. **Open** — short description, Tools & tech chips, and the clickable diagram.
   An open card sets `grid-column: 1 / -1` so it takes the full row and the
   diagram gets the width it needs.
3. **Flow open** — clicking any diagram step reveals the step-by-step
   explanations plus the longer write-up, scrolled to the step you clicked.

| Part | Frontmatter | Appears in state |
|---|---|---|
| Role chip | `role` | 1 |
| Summary title | `headline` | 1 |
| Short description | `plain` | 2 |
| Tools & tech chips | `tools` | 2 |
| Diagram | the component registered for that `role` | 2 |
| Step explanations | `details[]` | 3 |
| Longer write-up | the markdown body | 3 |

**`links[]` is deliberately not rendered.** The "In the repo" block was removed
from the card. The data is still in the frontmatter and still validated by the
schema, kept so two dozen curated URLs don't have to be re-collected if it comes
back. `Card.astro` says so at the top — if you decide it is never returning,
delete the field from `config.ts` and all six cards together.

**Clicking a diagram step opens the write-up.** Each hotspot is a
`<g class="hotspot" data-detail="…">` whose `data-detail` must match an `id` in
the card's `details` frontmatter. `Card.astro`'s script pairs them, reveals
`.flow-details`, highlights the matching `.detail` and scrolls to it. A card
with no `details` has a non-clickable diagram and shows its write-up directly,
which is the current state of the five unconverted cards.

**The trip works both ways.** Clicking a written step jumps back to the diagram
and lights up the step it came from, so the two halves stay tied together. The
step title is a real `<button>` (`.detail-jump`) so that route works without a
pointer; the whole block is clickable too, guarded against firing when the
reader is selecting text out of it.

Both halves share the `is-active` class and are cleared together — collapsing
the flow or changing the filter must never leave a diagram step lit with nothing
selected below it.

Under the diagram, `.flow-toggle` opens and closes the whole write-up in both
directions. Do not remove it without replacing the affordance — it is also the
non-pointer route into that content for anyone who does not tab into the diagram.

**Filtering is by `role`**, in the order set by `ROLE_ORDER` in
`src/pages/index.astro` — not alphabetical, and not by the tool chips. A role in
the cards but missing from `ROLE_ORDER` is appended rather than dropped.

**There is no stat strip and no per-card metric.** Both were removed: the hero
strip duplicated what the cards already prove, and the per-card metric competed
with the summary title for the same glance. `profile.ts` no longer exports
`stats`, and `metric`/`metricLabel` are gone from the schema.

### Registering a diagram

Diagrams are mounted through a named `diagram` slot on `Card.astro` and wired up
by role in `src/pages/index.astro`:

```ts
const diagrams: Record<string, typeof QaLoopDiagram | undefined> = {
  Cloud: CloudTargetsDiagram,
  QA: QaLoopDiagram,
};
```

A role absent from that map renders without a diagram, so adding one is a new
file in `src/components/diagrams/` plus a line here. Rules that keep six SVGs on
one page from fighting each other:

- **Reuse the `.topology` classes** (`.node`, `.link`, `.label`, `.sub`,
  `.wire`, `.arrow-head`, `.ephemeral`) rather than styling a diagram inline.
  That is what makes them read as one visual language and track the theme in
  both colour schemes.
- **Namespace every `id`.** Markers and `aria-labelledby` targets are
  document-global; two diagrams both defining `id="arrow"` silently resolve to
  the wrong one. Prefix with the skill (`qa-arrow`, `cloud-arrow`).
- **A diagram is not a decoration.** Each one draws the card's actual argument —
  the QA one is the reject-and-loop cycle, the Cloud one plots spend over a week
  so bar thickness reads as cost rate. If it only restates the headline, it is
  not earning its space.
- **Every step that has a `details[]` entry needs a `.hotspot` group**, and vice
  versa. A mismatch fails silently: the click does nothing.
- There is no longer a standalone topology section. It was removed in favour of
  per-skill diagrams; `TopologyDiagram.astro` is deleted and lives in git
  history if the old three-target drawing is ever wanted back.

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
| 2 — Copy | **QA card approved; five to go.** Cards now open as vignettes → open → flow. Done: renamed to TOD, job title AI-Automation-first, section renamed to Skills highlights, the three targets reframed (EKS production / K3s lab / backup dev+demo), the stat strip rewritten from inventory counts to outcomes, the hero reframed around a game *in development with a playable demo* rather than a finished product, and `qa.md` rewritten in plain language to the approved card shape. **Still open:** `cloud.md`, `devops.md`, `backend.md`, `frontend.md` and `ai.md` still use the old Decision/Instead of/Why it matters/Proof body and have no `details[]`; en-GB/en-US spelling is mixed within single files. |
| 3 — Evidence | **2 of 6 diagrams done, recording pending.** `CloudTargetsDiagram` and `QaLoopDiagram` are live inside their cards; DevOps, Backend, Frontend and AI still have none. The EKS lifecycle recording (apply → deploy → smoke tests → play a round → destroy) is still unrecorded — manual OBS/FFmpeg work, planned for a separate session. |
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
| The six cards | `src/content/cards/*.md` — one file per role (`cloud.md`, `devops.md`, `qa.md`, `backend.md`, `frontend.md`, `ai.md`). Adding a role or card is a content change, not a layout change — the filter and grid derive from whatever's in this directory. See the card anatomy above. |
| A card's tool chips | that card's `tools` — what the skill was actually built with. These are receipts, not filters; filtering is by `role`. |
| A card's step-by-step explanations | that card's `details[]` — each `id` must match a `data-detail` hotspot in the card's diagram |
| Filter button order | `ROLE_ORDER` in `src/pages/index.astro` |
| A skill's showcase diagram | `src/components/diagrams/<Skill>Diagram.astro` — raw SVG, labels are plain `<text>` elements. Register it in the `diagrams` map in `src/pages/index.astro`. |
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
| A card's longer reasoning | that card's markdown body, below the `details[]` blocks — headings become the label rows |
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
