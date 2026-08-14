# Deploy — build, hosting, CI, social image

Scope: `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tools/`, the two
`Site-*-Workers.yml` workflows, and the Cloudflare estate behind the site.

## Local development

Requires **Node `^20.19.0` or `^22.12.0` or `>=23`** — which the rest of this
repo's tooling does not, so a machine's system Node may not reach it. Unpack a
standalone build from `nodejs.org/dist` and put it first on `PATH`, rather than
moving the system install.

From `site/`:

```bash
npm ci             # installs from the committed lockfile — matches CI
npm run dev
npm run build      # astro check, then static build to dist/
npm run preview    # serve the built dist/
npm run docs:check # validate site/docs
```

`npm run build` runs `astro check` first and fails on a type error, exactly as CI
does. `npx wrangler deploy --dry-run` then checks the Workers config — offline,
so it sees no account, validates no id and proves no binding reached the Worker.

## Build and hosting

Astro static build → Cloudflare Workers Static Assets. `wrangler.jsonc` names the
Worker `corp-tower-portfolio`, points `assets.directory` at `./dist`, and sets
`not_found_handling: "404-page"` so the built `404.html` serves unknown paths.
`astro.config.mjs` sets the canonical `site` URL, `output: "static"` and
`compressHTML` — the Astro build stays static and the adapter list stays empty.

`main` mounts `worker/index.js` on the same Worker and
`assets.run_worker_first: ["/api/contact"]` scopes it to that path. The scoping
is what keeps the rest intact — every other URL still hits the asset router
first. Widen that array and the Worker starts intercepting the site.

`public/og.png` is a build output and is gitignored; everything else under
`public/` ships as written.

## The contact endpoint

`POST /api/contact` takes the `Let's talk` dialog's fields and sends them
through Resend. `RESEND_API_KEY`, `CONTACT_TO` and `CONTACT_FROM` are secrets,
set once with `wrangler secret put` and **preserved across every
`wrangler deploy`** — so CI needs no new GitHub secret and the repo holds none.
The recipient is a secret, not a `var`: a `var` sits in git.

**The route deploys before its credentials do.** `GET /api/contact` answers
`{ok, ready}` — presence of the three, never a value — and the dialog asks
before taking over its triggers. Unready it takes over nothing, both `Let's talk`
anchors stay the `mailto:` links they already are, and a `503` on submit hands
them back the same way. The form wakes when the secrets land, with no redeploy.

Two rate limiters, `CONTACT_RL_IP` and `CONTACT_RL_ALL`, are account-local and
need no external service, but their `period` accepts only 10 or 60 seconds —
hence a counter for the longer ceiling: `CONTACT_KV` keeps one
`sent:YYYY-MM-DD` key on a 48h TTL, checked against the `CONTACT_DAILY_CAP`
var. **Size that cap under the provider's free daily allowance, not at it.**
Every guardrail is absent-safe: a missing binding disables its own check, so a
half-configured deploy degrades instead of failing.

**No `kv_namespaces` block is committed** and the cap is off until one is. A
binding naming a namespace the account lacks fails `wrangler deploy` — the whole
site, not the form — where `--dry-run` passes. Create the namespace, paste the
id, then deploy. Binding KV may also want `Workers KV Storage:Edit` on the
deploy token; if that is a wall, leave the cap off and keep the limiters.

`npm run dev:worker` serves `dist/` and the Worker together; `astro dev` alone
cannot answer the route. Local secrets go in gitignored `.dev.vars`.

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
deploys that — same Worker, same domain, no DNS or Worker deletion. Both share
the `site-deploy-workers` concurrency group, so a rebuild cannot race a
takedown. A normal push to `site/**` overwrites the placeholder.

`PUBLIC_CF_ANALYTICS_TOKEN` is passed from the `CF_ANALYTICS_TOKEN` secret at
build time. Until it exists, `BaseLayout` omits the beacon entirely, so no
broken tag ships.

`DEMO_STATS_API_URL` — `wstoddemo`'s `/api/stats/demo`, a plain workflow env
(not a secret) — is read by `tools/fetch-demo-stats.mjs` at build time.
`wstoddemo` is the always-on demo instance the play link targets, not EKS —
`docs/context/deployment.md`.

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
- **Keep text left-aligned with slack on the longest line.** Faces differ in
  metrics by machine, and left alignment absorbs a wider one instead of breaking
  a centred layout. With no text measurement available, `fit()` estimates width
  from character count and shrinks — a long name gets smaller, not clipped.
- **The palette is duplicated by hand.** Named constants at the top of the SVG
  template mirror `global.css`; plain Node cannot read CSS custom properties.

`tools/og-source.html` carries an older theme; never screenshot it into
`public/og.png`.

## Cloudflare estate — in place, kept for disaster recovery

Steps 1–7 are done on the live project — do not re-run them. Only the KV daily
cap is outstanding, and the form sends without it.

1. **Create the Worker.** Workers & Pages → Create Application → Upload assets.
   Build first and upload **`site/dist`**, never `site/` or `src/`. Name it
   `corp-tower-portfolio` to match `wrangler.jsonc`.
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
6. **First CI deploy.** Push to `main` or dispatch the workflow, then confirm
   the domain resolves.
7. **Contact endpoint**, once: verify a sending domain in Resend, take an API
   key, set the three secrets. `CONTACT_FROM` is a mailbox **on** that domain,
   `CONTACT_TO` the one that receives; a bare domain in either is a provider
   `422`. Set all three as **Secret** — a dashboard *Text* variable is erased by
   the next `wrangler deploy`, which reapplies only the `vars` above.
