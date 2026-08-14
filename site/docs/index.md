# Portfolio site — context entry

Router for `site/docs/`, the knowledge base for `site/`. Load **only** what the
router names. The repo-wide retrieval contract is in the root `CLAUDE.md`; this
KB is separate from `docs/context/`, which covers the game system.

## System

A one-page Astro static site at **`https://enportfolio.galaxxigames.com`**. It
is a hiring-facing portfolio whose argument is evidence: the platform, CI/CD, QA
and AI work behind one real multiplayer game, with each claim carrying the
artefact that backs it.

| Layer | Stack |
|---|---|
| Framework | Astro 4, `output: "static"`, three content collections |
| Styling | one hand-written stylesheet, `src/styles/global.css` — no framework, no webfont |
| Host | Cloudflare Workers Static Assets, `assets.directory: ./dist` |
| CI | `Site-Deploy-Workers.yml` on any push to `site/**` |
| Media | screen recordings in R2, addressed through `profile.mediaBase` |
| Server | one route, `POST /api/contact`, on the same Worker — [deploy.md](./deploy.md) |

**Exactly one thing happens at request time: the contact form.** `main` mounts
`worker/index.js` and `run_worker_first` scopes it to that path, so every other
URL still goes to the asset router. Nothing rendered reads it — the page is
decided at build time from the collections and `src/data/`.

## Page order

`index.astro` renders one page in this order. Only numbered sections carry a
`.section-index`; the five above the numbering are the recruiter layer and are
plain markup, not collections.

| Section id | Heading | Source |
|---|---|---|
| `hero` (unnamed) | Platform & DevOps Engineer | `index.astro` copy + `profile` |
| `by-the-numbers` | By the numbers | `STATS` in `index.astro` |
| `what-i-do` | What I do | `WHAT_I_DO` in `index.astro` |
| `background` | Why my background is different | inline in `index.astro` |
| `featured-project` | Featured project | inline + the `buildingTheGame` game |
| `engineering` | `01` How I built it | `cards` collection via `BuildingTheGame` |
| `technologies` | `02` Technologies (`#skills`) | `SKILL_GROUPS` in `index.astro` |
| `projects` | `03` Projects (`#playables`) | `games` collection |
| `cv` | `04` CV | `cv` collection + `CREDENTIALS` |
| `contact` | `05` Let's talk | `profile.email`, `profile.links` |

The six skill cards sit directly under `#engineering` at the top level. They are
not nested inside the game card, and nothing may nest them again: the platform
work has to be one click from the hero, not five.

## Task router

| Task | Load | Then |
|---|---|---|
| Layout, styling, a component, a diagram, disclosure behaviour | [design.md](./design.md) | the map below |
| Words on the page, a card, a job, a game, schema fields | [content.md](./content.md) | the map below |
| Build, deploy, domain, OG image, maintenance mode | [deploy.md](./deploy.md) | — |
| "Which file does X?" | — | the map below |

## File map

Grep this section for a filename or a symbol; do not load a source file whole.

| Path | Does |
|---|---|
| `src/pages/index.astro` | The page. Section order, hero and section copy, `ROLE_ORDER`, `WHAT_I_DO`, `SKILL_GROUPS`, `CREDENTIALS`, the `diagrams` role map, and the document-wide accordion / deep-link / print script |
| `src/pages/404.astro` | Not-found page and its copy |
| `src/layouts/BaseLayout.astro` | `<head>`, meta and OG tags, canonical URL, `Person` JSON-LD, the optional analytics beacon, skip link |
| `src/styles/global.css` | Every style on the site. Colour tokens, type scale, level grammar, `.topology` diagram classes, print rules |
| `src/components/Card.astro` | Skill card — vignette and open states, tools, diagram slot, the steps disclosure, evidence links, the `data-detail` hotspot↔step script, `cards:reset` handler |
| `src/components/CardFilter.astro` | Role filter buttons and count; dispatches `cards:reset` |
| `src/components/ContactDialog.astro` | The `Let's talk` dialog — native `<dialog>`, the three-field form and its copy, the `/api/contact` fetch, the sending, success and failure states, and the readiness probe that leaves the triggers as `mailto:` links until the route can send |
| `worker/index.js` | `/api/contact` — the readiness `GET`, then on `POST` origin and field validation, header-injection guard, honeypot, timing check, rate limits, daily cap, the Resend call |
| `src/components/BuildingTheGame.astro` | Wraps the filter and the card list under `#engineering` |
| `src/components/GameCard.astro` | Game tile — tagline, blurb, play links, repo link and disclaimer |
| `src/components/CvCard.astro` | Job tile — role, company, dates, summary, highlights |
| `src/components/Playables.astro` | The play-destination strip inside `03 Projects` |
| `src/components/Vignette.astro` | Full-width band grouping tiles: label, count, note |
| `src/components/VideoSlot.astro` | One clip — poster, `preload="none"`, caption; resolves `mediaBase` |
| `src/components/diagrams/` | One SVG per skill role, registered by role in `index.astro`. Each `.hotspot` group carries the `data-detail` matching a step id |
| `src/content/config.ts` | Zod schemas for all three collections. Field meanings are in content.md |
| `src/content/cards/` | The six skill cards, one file per role |
| `src/content/games/` | One file per game — play links, repo, `buildingTheGame` |
| `src/content/cv/` | One file per role, `order: 1` is the most recent |
| `src/data/profile.json` | Name, titles, project name, site URL, OG tagline. JSON because `generate-og.mjs` also reads it |
| `src/data/profile.ts` | Email, location, contact links, CV file, `mediaBase`, availability line |
| `src/data/demo-stats.json` · `tools/fetch-demo-stats.mjs` | Demo completion counts, refreshed from the game server as an npm `prebuild` step; fails soft |
| `tools/generate-og.mjs` | Draws `public/og.png` with sharp from `profile.json`. Runs as npm `prebuild` |
| `tools/validate-site-docs.mjs` | Gate for this KB — budgets, line length, links, and map coverage both ways |
| `tools/preview.html` · `tools/cv-source.html` · `tools/og-source.html` | Standalone design references. Nothing imports or deploys them |
| `maintenance/index.html` | The placeholder `Site-Cleanup-Workers.yml` deploys in place of the site |
| `astro.config.mjs` | `site` URL, static output, `compressHTML` |
| `wrangler.jsonc` | Worker name `corp-tower-portfolio`, assets directory, 404 handling |
| `package.json` | Scripts — `dev`, `build` (`astro check` first), `og`, `prebuild`, `preview`, `deploy`, `docs:check` |

## The design ↔ editorial boundary

Two skills own `site/` and the split is by **what a change is**, not by file:

- **`editorial`** owns the words — content collection bodies and their copy
  frontmatter, the strings in `src/data/`, and text nodes and copy constants in
  `.astro` files.
- **`web-designer`** owns everything else in those files — markup, attributes,
  classes, styles, scripts, diagrams, schema.

A change that needs both is two passes, not one. A copy edit that also changes an
element or a class is a `web-designer` task; a layout change that also rewrites a
sentence is an `editorial` follow-up.

## Working rules

- **Build-time only, with one named exception.** Nothing the page *renders* may
  depend on a request; the contact form is the single route allowed to, and
  widening it needs the same argument made again. No other client-side fetch.
- **One owning doc per concept.** Edit that doc, never a second copy. Source
  keeps short field-level notes; rationale lives here.
- **Every claim on the page carries its artefact.** A step asserting work exists
  without `evidence`, or a number nothing backs, is a defect.
- Values live in source (`profile.ts`, `global.css` tokens); this KB holds their
  meaning. Copy a value into prose only when it drives the decision on its own.
- `node tools/validate-site-docs.mjs` gates this KB — budgets, line length,
  links, and that the map above covers every first-party file.
