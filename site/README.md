# Portfolio site

Astro static site, deployed to Cloudflare Workers (Static Assets), live at
**`https://enportfolio.galaxxigames.com`**.

A **games portfolio where the engineering is evidence nested inside one game** —
not a portfolio with a skills section. The six skill cards live inside the Top or
Drop game card, under *Building the game*.

**Source of truth for intent and rationale:**
[`plan/corp-tower-portfolio-plan-v5.md`](../plan/corp-tower-portfolio-plan-v5.md).
Remaining work is written up as a hand-off in
[`plan/corp-tower-portfolio-content-pass-prompt.md`](../plan/corp-tower-portfolio-content-pass-prompt.md).
This README covers orientation and mechanics only — read the plan for *why*, so
the two don't drift apart.

**This directory is intentionally outside `docs/context/`** — that KB's scope is
the game system (client/server/infra), not the site around it.

## Page structure

```
header            Playables · Games · CV · Contact

00 Playables      no disclosure. One row per game: title links to its first play
                  destination, chips list every destination.

01 Games
  L1 vignette     In production            closed by default
  L1 vignette     In development           open by default
    L2 game tile    Top or Drop            open by default
      L3 panel        Building the game    closed by default
        L4 card         Cloud · DevOps · AI · QA · Frontend · Backend

02 CV
  L1 vignette     Professional work history
    L2 job tile     Role · dates · company

03 Contact        email + every profile link that has a URL
footer
```

## The rule that keeps four levels readable

**No two adjacent levels look alike.** Four `<details>` that are all a chevron
and a title is accordion soup, and a reader four levels down loses track of where
they are.

| Level | What | Grammar |
|---|---|---|
| 0 | Section 00–03 | Numbered heading, never collapses |
| 1 | Vignette | Full-width band: label, count, rule, chevron. **Not a card** |
| 2 | Game / job tile | Tile in a grid. Closed = title + one line of meta. Open takes the full row |
| 3 | Building panel | Inset, tinted, accent left edge — visibly *inside* the game card |
| 4 | Skill card | Small tile inside that panel |

A new level needs its own grammar or the separation collapses.

Headings run `h2` section → `h3` vignette → `h4` game/job → `h5` skill → `h6`
step. "Building the game" is a control, not a heading — making it one would push
step titles past `h6`.

## Card anatomy — two states, not three

1. **Vignette** — collapsed tile: role chip and summary title. Cards tile into a
   responsive grid here.
2. **Open** — short description, Tools & tech chips, then **diagram → clip →
   step summaries**, all visible at once. The card sets `grid-column: 1 / -1` so
   the diagram gets the width.

The old third state — a `.flow-toggle` hiding the steps behind "Show all 7
steps" — **is gone.** Removing it removed a whole level of nesting from a page
that already nests four deep, and it only works because **`details[].body` is
capped at two to three sentences.** Length is what keeps the card readable now,
not a toggle. A step body that grows back to a paragraph reintroduces the
problem the toggle was hiding.

| Part | Frontmatter | State |
|---|---|---|
| Role chip | `role` | 1 |
| Summary title | `headline` | 1 |
| Short description | `plain` | 2 |
| Tools & tech chips | `tools` | 2 |
| Diagram | the component registered for that `role` | 2 |
| Recorded clip | `video` (optional) | 2 |
| Step summaries | `details[]` | 2 |
| Per-step discipline chips | `details[].keywords` | 2 |
| Per-step evidence link | `details[].evidence` | 2 |
| Longer write-up | the markdown body | 2 |

**Keywords are the named discipline, not a tag cloud** — the industry terms for
what a step actually is (`IAM & OIDC`, `Capacity & Scaling`), so the vocabulary a
reader is scanning for is on the page without the prose carrying it. The body
must still read without them.

**Evidence is per-step, not a bucket.** One `evidence: { label, href }` per step,
pointing at the single artefact that proves it. Labels in plain English, not
filenames. The schema validates the URL is well formed; it cannot tell you the
heading anchor still resolves, so re-check after any `/compact-docs` run.

**`links[]` is deliberately not rendered.** The "In the repo" block was removed;
the data stays so two dozen curated URLs don't have to be re-collected. If you
decide it is never coming back, delete it from `config.ts` and all six cards
together.

## Content collections

Three, all one-file-per-entry, all schema-validated at build.

| Collection | Files | Adding one |
|---|---|---|
| `cards` | `src/content/cards/*.md` | Six skills, one per role |
| `games` | `src/content/games/*.md` | A new file. Playables, both vignettes and the tiles all derive from it |
| `cv` | `src/content/cv/*.md` | A new file plus renumbering `order`. `order: 1` is the most recent role |

`hidden: true` keeps an entry in the repo and validated while removing it from
every count, filter and grid together. Prefer it to deleting.

**A game owns its own links.** `links[]` are play destinations and are the only
thing section 00 reads — a repo is not somewhere you go to play. `repo` is
separate and card-only, with an optional `disclaimer` for a name mismatch. There
is no site-wide GitHub link any more; `profile.github` survives for schema.org
`sameAs` only.

**`video` is optional everywhere and absent by default.** No `video:` block means
no player, no poster, no "coming soon" — the layout closes up. Fill in an R2
`src` and the block appears on its own. Always ship a `poster`: `preload="none"`
means the poster is the only thing fetched until someone presses play, which is
what keeps six clips on one page cheap.

## Behaviour

**One open at a time, per group** — via `[data-accordion]` in `index.astro`,
applied to the three card lists. Deliberately **not** applied to vignettes; the
cards are the bulky things.

**Deep links open their ancestors.** A link to `#card-cloud` expands every
`<details>` above it, unfilters the card if a role filter is hiding it, then
scrolls. Covers evidence links, the nav and a hash typed into the address bar.
Without it a deep link scrolls to a collapsed tile and looks broken.

**Diagram ↔ step is two-way.** Clicking a hotspot highlights and scrolls to its
step; clicking a step lights the diagram box back up. Both share `is-active` and
clear together. Each `details[].id` must match a `data-detail` on a hotspot — a
mismatch fails silently.

**Filtering is by `role`**, in the order set by `ROLE_ORDER` in
`src/pages/index.astro`. A role in the cards but missing from `ROLE_ORDER` is
appended rather than dropped.

### Registering a diagram

Mounted through the named `diagram` slot on `Card.astro`, wired by role in
`src/pages/index.astro`. A role absent from that map renders without one.

- **Reuse the `.topology` classes** (`.node`, `.link`, `.label`, `.sub`, `.wire`,
  `.arrow-head`, `.ephemeral`) rather than styling inline. That is what makes six
  SVGs read as one visual language and track both colour schemes.
- **Namespace every `id`.** Markers and `aria-labelledby` targets are
  document-global; two diagrams both defining `id="arrow"` silently resolve to
  the wrong one. Prefix with the skill (`qa-arrow`, `cloud-arrow`).
- **A diagram draws the card's argument.** If it only restates the headline it is
  not earning its space.
- **Every step with a `details[]` entry needs a `.hotspot` group**, and vice
  versa.

## Visual direction — Mono Slate

`site/reference/` holds five standalone HTML mockups of this structure.
**`05-mono-slate.html` was chosen** and is ported into `src/styles/global.css`;
the other four stay as the record of what was considered. Nothing imports or
deploys them; see `reference/README.md`.

Near-monochrome slate, dark-first, with **two colours doing different jobs**:

| Variable | Spent on |
|---|---|
| `--accent` brass `#c9a227` | **State and category only** — section numbers, role chip, open chevron, current role, active step, evidence links, the forward path in a diagram |
| `--action` near-white `#f0f2f4` | **Things you click to do something** — the primary button, the pressed filter |

A primary button painted brass, or a status chip in `--action`, turns this back
into a generic dark theme. The restraint is the design.

Also part of it: 4–6px radii instead of pills, a tighter type scale
(`--step-0` ≈ 14.5px), 1.58 leading, `--max-width: 1120px`. The density is
deliberate — a reader four levels down should see a whole skill card rather than
scroll through one.

**`tools/generate-og.mjs` carries the same palette by hand.** It is plain Node
and cannot read the stylesheet's custom properties, so the constants at the top
of its SVG template must be changed alongside `global.css`.

## Content map — where to edit what

| What | File |
|---|---|
| Name, job title, project name, OG strings | `src/data/profile.json` — read by both the site and `tools/generate-og.mjs`, which is why it's JSON |
| Email, contact links, availability line | `src/data/profile.ts` — a link with `href: null` is skipped, so placeholders can sit in the list |
| Games, their play links, their repo link | `src/content/games/*.md` |
| Work history | `src/content/cv/*.md` |
| The six skill cards | `src/content/cards/*.md` |
| A card's step summaries | that card's `details[]` — each `id` must match a `data-detail` hotspot |
| Filter button order | `ROLE_ORDER` in `src/pages/index.astro` |
| A skill's diagram | `src/components/diagrams/<Skill>Diagram.astro`, registered in the `diagrams` map in `index.astro` |
| Hero, section copy, nav, footer | `src/pages/index.astro` |
| Page title, meta, structured data, analytics | `src/layouts/BaseLayout.astro` |
| 404 copy | `src/pages/404.astro` |
| Colours, spacing, fonts, every component style | `src/styles/global.css` |
| Deploy target / assets directory | `wrangler.jsonc` |

## Status

| Phase | State |
|---|---|
| Shell + CI | **Done.** Domain resolves, push redeploys, no known functional issues |
| Demo instance (`toddemo`) | **Done.** Live, playable, bots disclosed |
| Redesign | **Structure done.** Four-level disclosure, games-first, CV and Playables added |
| Copy | **Not started.** ~40 step bodies still in the old long form against a three-sentence cap |
| Content | **Placeholder.** CV is two template entries; In production is empty |
| Diagrams | **Six exist, three unaudited** against the redesign spec (Frontend/Backend/DevOps) |
| Recordings | **None.** Six skill clips + a gameplay clip, slots ready |
| QA | Needs a breakpoint and cross-browser sweep once deployed |

**Blocks a deploy:** the CV placeholders and the empty In production vignette are
visible on the page as written. Fill them or set `hidden: true`.

## Stack and deploy

Astro static build → Cloudflare Workers Static Assets (`wrangler.jsonc`,
`assets.directory: ./dist`). `.github/workflows/Site-Deploy-Workers.yml` builds
and runs `wrangler deploy` on every push to `site/**`. No server-side logic, no
bindings.

**Maintenance mode.** `.github/workflows/Site-Cleanup-Workers.yml`
(`workflow_dispatch` only) deploys `site/maintenance/index.html` in place of the
built site — same Worker, same domain, no DNS or Worker deletion, mirroring the
K3s web server's soft-cleanup pattern
([deployment.md](../docs/context/deployment.md)). A normal push to `site/**`
rebuilds the real site and cleanly overwrites the placeholder.

## Social preview image — generated, no manual step

`BaseLayout.astro` points `og:image` at `/og.png`. `tools/generate-og.mjs` draws
it with `sharp` from the same `src/data/profile.json` the site reads, and runs as
npm's `prebuild` hook — so `npm run build` (and CI) always ships a current image.
`npm run og` regenerates it alone. `public/og.png` is **gitignored**: it's a build
output.

Two things if you edit the generator:

- **Name real font families, never the CSS generics.** Fonts resolve through
  fontconfig, not a browser. Asking for `sans-serif` returned a *monospace* face
  on Windows. The `SANS`/`MONO` stacks name Arial/Helvetica for Windows and
  DejaVu/Liberation for the Ubuntu runner.
- **Keep text left-aligned with slack on the longest line.** Windows and CI pick
  different faces with different metrics; left alignment means a wider face
  shifts nothing instead of breaking a centred layout.
- **The palette is duplicated here.** Named constants at the top of the SVG
  template mirror `global.css`. Plain Node can't read CSS custom properties, so
  changing one means changing the other.

## Local development

Requires **Node `^20.19.0` or `^22.12.0` or `>=23`** — this repo's other tooling
doesn't, so don't assume the system Node on any machine satisfies it. If it
doesn't, grab a standalone build rather than changing the system install:

```bash
curl -fsSL -o /tmp/node22.tar.xz https://nodejs.org/dist/v22.13.0/node-v22.13.0-linux-x64.tar.xz
tar -xJf /tmp/node22.tar.xz -C /tmp
export PATH="/tmp/node-v22.13.0-linux-x64/bin:$PATH"
```

Then, from this directory:

```bash
npm ci           # installs from the committed package-lock.json — matches CI
npm run dev      # local dev server
npm run build    # astro check + static build to dist/
npm run preview  # serve the built dist/ locally
```

`npm run build` runs `astro check` first and fails on a type error, same as CI.
You can validate the Workers config without deploying:
`npx wrangler deploy --dry-run` after a build — reads the assets directory and
reports what it would upload, no network call.

## One-time Cloudflare setup — already done, kept for disaster recovery

The Worker (`corp-tower-portfolio`), its custom domain
(`enportfolio.galaxxigames.com`) and the three GitHub secrets below already
exist. Don't re-run these against the live project.

1. **Create the Worker.** Dashboard → Workers & Pages → Create Application →
   Upload assets. Build first (`npm run build`) and upload **`site/dist`** —
   never `site/` or `src/`. Name it `corp-tower-portfolio` to match
   `wrangler.jsonc`. This first upload only exists to create the Worker.
2. **Add the custom domain.** Worker → Settings → Domains & Routes → Add →
   Custom Domain → `enportfolio.galaxxigames.com`. `galaxxigames.com` is already
   a Cloudflare zone, so DNS is provisioned automatically.
3. **Create an API token scoped to `Account > Workers Scripts > Edit` only**
   (start from the built-in "Edit Cloudflare Workers" template). Use a token
   **separate from** the existing `CLOUDFLARE_API_TOKEN` (scoped to `Zone.DNS
   Edit` for the game's K3s/EKS records) — a compromise of one shouldn't reach
   the other's blast radius. Save as `CLOUDFLARE_WORKERS_API_TOKEN`.
4. **Find the Account ID** (dashboard sidebar, or `wrangler whoami`). Save as
   `CLOUDFLARE_ACCOUNT_ID`.
5. **Cloudflare Web Analytics (optional).** Analytics & Logs → Web Analytics →
   Add a site → copy the beacon token → save as `CF_ANALYTICS_TOKEN`. Until it
   exists the build omits the script tag entirely — no broken beacon ships
   either way (`src/layouts/BaseLayout.astro`).
6. **First CI deploy.** Push to `main` (or dispatch `Site Deploy (Cloudflare
   Workers)`), confirm the run succeeds, then confirm the domain resolves.
