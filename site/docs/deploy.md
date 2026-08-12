# Deploy — build, hosting, CI, social image

Scope: `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tools/`, the two
`Site-*-Workers.yml` workflows, and the Cloudflare estate behind the site.

## Local development

Requires **Node `^20.19.0` or `^22.12.0` or `>=23`**. The rest of this repo's
tooling does not, so the system Node on a given machine may not satisfy it. When
it does not, use a standalone build rather than changing the system install:

```bash
curl -fsSL -o /tmp/node22.tar.xz https://nodejs.org/dist/v22.13.0/node-v22.13.0-linux-x64.tar.xz
tar -xJf /tmp/node22.tar.xz -C /tmp
export PATH="/tmp/node-v22.13.0-linux-x64/bin:$PATH"
```

From `site/`:

```bash
npm ci             # installs from the committed lockfile — matches CI
npm run dev
npm run build      # astro check, then static build to dist/
npm run preview    # serve the built dist/
npm run docs:check # validate site/docs
```

`npm run build` runs `astro check` first and fails on a type error, exactly as CI
does. `npx wrangler deploy --dry-run` after a build validates the Workers config
and reports what it would upload with no network call.

## Build and hosting

Astro static build → Cloudflare Workers Static Assets. `wrangler.jsonc` names the
Worker `corp-tower-portfolio`, points `assets.directory` at `./dist`, and sets
`not_found_handling: "404-page"` so the built `404.html` serves unknown paths.
`astro.config.mjs` sets the canonical `site` URL, `output: "static"` and
`compressHTML` — the Astro build stays static and the adapter list stays empty.

`main` mounts `worker/index.js` on the same Worker and
`assets.run_worker_first: ["/api/contact"]` scopes it to that one path. Scoping
is what keeps the rest intact: every other URL is still resolved by the asset
router first, so `not_found_handling` goes on serving the built `404.html`.
Widen that array and the Worker starts intercepting the site.

`public/og.png` is a build output and is gitignored; everything else under
`public/` ships as written.

## The contact endpoint

`POST /api/contact` takes the `Hire me` dialog's three fields and sends them
through Resend. `RESEND_API_KEY`, `CONTACT_TO` and `CONTACT_FROM` are secrets,
set once with `wrangler secret put` and **preserved across every
`wrangler deploy`** — so CI needs no new GitHub secret and the repo holds none.
The recipient is a secret rather than a `var` because a `var` would sit in git.

Two rate limiters, `CONTACT_RL_IP` and `CONTACT_RL_ALL`, are account-local and
need no external service, but their `period` accepts only 10 or 60 seconds —
hence a counter for the longer ceiling: `CONTACT_KV` holds one
`sent:YYYY-MM-DD` key on a 48h TTL, checked against the `CONTACT_DAILY_CAP`
var. **Size that cap under the provider's free daily allowance, not at it.**
Every guardrail is absent-safe: a missing binding disables its own check rather
than failing the request, so a half-configured deploy degrades visibly.

`CLOUDFLARE_WORKERS_API_TOKEN` is scoped to `Workers Scripts:Edit`, and a deploy
binding KV may want `Workers KV Storage:Edit` too. If CI fails there, widen that
token by the one permission or drop the KV cap and keep the limiters — neither
path goes near the game's `Zone.DNS:Edit` token.

`npm run dev:worker` builds and serves `dist/` and the Worker together; `astro
dev` alone cannot answer the route. Local secrets go in gitignored `.dev.vars`.

## CI

**`Site-Deploy-Workers.yml`** builds and deploys on every push to `main`/`master`
touching `site/**`, plus manual dispatch. Node 22, `npm ci`, `npm run build`,
then `cloudflare/wrangler-action` with `workingDirectory: site`.

It is independent of every game deploy path and uses its own token
`CLOUDFLARE_WORKERS_API_TOKEN`, scoped to `Workers Scripts:Edit` — never the
`Zone.DNS Edit` token the game's DNS updates use. A compromise of one must not
reach the other's blast radius.

**`Site-Cleanup-Workers.yml`** is soft cleanup, `workflow_dispatch` only. It
copies `maintenance/index.html` over `dist/index.html` and `dist/404.html` and
deploys that — same Worker, same domain, no DNS or Worker deletion. Both
workflows share the `site-deploy-workers` concurrency group, so a rebuild cannot
race a takedown. A normal push to `site/**` overwrites the placeholder.

`PUBLIC_CF_ANALYTICS_TOKEN` is passed from the `CF_ANALYTICS_TOKEN` secret at
build time. Until it exists, `BaseLayout` omits the beacon script entirely — no
broken tag ships either way.

## Social preview image

`BaseLayout` points `og:image` at `/og.png`. `tools/generate-og.mjs` draws it at
1200×630 with `sharp` from the same `src/data/profile.json` the site reads, and
runs as npm's `prebuild` hook, so `npm run build` and CI always ship a current
image. `npm run og` regenerates it alone. It throws if any required key is
missing from `profile.json`.

Three constraints hold it together:

- **Name real font families, never the CSS generics.** Fonts resolve through
  fontconfig here, not a browser, and it maps the generics inconsistently across
  machines — asking for `sans-serif` can return a monospace face. The `SANS` and
  `MONO` stacks name Arial/Helvetica for Windows and DejaVu/Liberation for the
  Ubuntu runner.
- **Keep text left-aligned with slack on the longest line.** Different machines
  pick faces with different metrics; left alignment means a wider face shifts
  nothing instead of breaking a centred layout. There is no text measurement
  available, so `fit()` estimates width from character count and shrinks to fit —
  a longer name gets a smaller size rather than a clipped one.
- **The palette is duplicated by hand.** Named constants at the top of the SVG
  template mirror `global.css`; plain Node cannot read CSS custom properties.

`tools/og-source.html`, `tools/cv-source.html` and `tools/preview.html` are
standalone design references. Nothing imports or deploys them, and the first
carries an older theme — do not screenshot it into `public/og.png`.

## Cloudflare estate — in place, kept for disaster recovery

The Worker, its custom domain and the three secrets already exist. Do not re-run
these against the live project.

1. **Create the Worker.** Workers & Pages → Create Application → Upload assets.
   Build first and upload **`site/dist`**, never `site/` or `src/`. Name it
   `corp-tower-portfolio` to match `wrangler.jsonc`. That first upload exists
   only to create the Worker.
2. **Add the custom domain** `enportfolio.galaxxigames.com` under the Worker's
   Domains & Routes. `galaxxigames.com` is already a Cloudflare zone, so DNS is
   provisioned automatically.
3. **Create an API token scoped to `Account > Workers Scripts > Edit` only**
   (start from the "Edit Cloudflare Workers" template). Save it as
   `CLOUDFLARE_WORKERS_API_TOKEN`.
4. **Find the Account ID** (dashboard sidebar, or `wrangler whoami`). Save as
   `CLOUDFLARE_ACCOUNT_ID`.
5. **Cloudflare Web Analytics**, optional. Analytics & Logs → Web Analytics → Add
   a site → copy the beacon token → save as `CF_ANALYTICS_TOKEN`.
6. **First CI deploy.** Push to `main` or dispatch the deploy workflow, confirm
   the run succeeds, then confirm the domain resolves.
7. **Contact endpoint**, once: verify `galaxxigames.com` in Resend and take an
   API key, `wrangler kv namespace create CONTACT_KV` and paste the id into
   `wrangler.jsonc`, then set the three secrets above.
