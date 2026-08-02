# galaxxigames.com — apex placeholder

Hand-authored static page served at the zone apex, **`https://galaxxigames.com`**
(and `www`). It says the main site is still under construction and points at the
two things that are actually live — the portfolio and the public demo.

**This is not the portfolio.** The portfolio is a separate Astro site in
[`../site`](../site) on its own Worker and its own subdomain
(`enportfolio.galaxxigames.com`). Nothing is shared between the two beyond the
copied colour palette and favicon — deliberately, so a change to either can't
take the other down. The apex is the face of every hostname on this zone
(`enportfolio`, `toddemo`, `playtod`, `todtest`, `wsplaytod`, `wstodtest`,
`todplay`, `devtod1`/`devtod2`), so it must keep answering even while the
portfolio is mid-deploy or in maintenance mode.

## What's here

| File | Purpose |
|---|---|
| `public/index.html` | The whole page — inline CSS, no build step, no external requests |
| `public/favicon.svg` | Copy of the portfolio favicon, so both sites share a tab icon |
| `wrangler.jsonc` | Worker `galaxxigames-root`, assets served from `./public` |

There is no `package.json`, no framework and no `dist/`: `public/` **is** the
deployed directory. Edit `index.html`, push, done.

`not_found_handling` is `single-page-application`, so *every* path on the apex
returns the construction notice rather than a 404 — a stray link to a page that
doesn't exist yet lands on the notice instead of an error. The page carries
`<meta name="robots" content="noindex">` so a temporary placeholder doesn't get
indexed as the brand's real page; **remove that line when the real site ships.**

## Deploy

`.github/workflows/Site-Root-Deploy-Workers.yml` runs `wrangler deploy` on every
push to `site-root/**`, and on manual dispatch. It reuses the portfolio's two
GitHub secrets — `CLOUDFLARE_WORKERS_API_TOKEN` (Account → Workers Scripts →
Edit) and `CLOUDFLARE_ACCOUNT_ID` — and is path-filtered so it never fires on a
`site/**` or game change.

**The workflow pins `wranglerVersion` explicitly, and must keep doing so.**
`site/` gets its version from `npm ci` reading its own `package-lock.json`;
with no `package.json` here, `wrangler-action` instead falls back to its own
hardcoded default (`3.90.0`) — which predates assets-only Workers and fails the
deploy with `Missing entry-point: ... or the "main" config field`. That error
means the wrangler version, not a problem with `wrangler.jsonc`.

Validate locally without deploying, from this directory — **pin the same
version**, or you'll test against a wrangler CI isn't using:

```bash
npx wrangler@4.118.0 deploy --dry-run
```

## One-time Cloudflare setup — already done, kept for disaster recovery

CI can create and update the Worker, but **it cannot attach the domain**: the
`CLOUDFLARE_WORKERS_API_TOKEN` is scoped to Workers Scripts only, with no
Zone/DNS permission (same split as the portfolio — see
[`../site/README.md`](../site/README.md)). So the domain binding is a manual
dashboard step. **Order matters** — the Worker must exist before any domain can
point at it:

1. Push this directory (or dispatch **Site Root Deploy (Cloudflare Workers)**
   once the workflow is on the default branch). That is what *creates* the
   Worker `galaxxigames-root` — it cannot be created from the dashboard, since
   there is no build output to upload. Until this run goes green the Worker is
   absent from Workers & Pages, and it answers on its `*.workers.dev` URL only.
2. Dashboard → Workers & Pages → `galaxxigames-root` → Settings → Domains &
   Routes → **Add → Custom Domain** → `galaxxigames.com`. Since
   `galaxxigames.com` is already a Cloudflare zone, the apex DNS record is
   provisioned automatically.
3. Confirm `https://galaxxigames.com` serves this page and
   `https://enportfolio.galaxxigames.com` is untouched.

**Bind the apex to this Worker, never to `corp-tower-portfolio`.** A hostname
belongs to exactly one Worker, so adding `galaxxigames.com` to the portfolio
Worker both points the front door at the portfolio and blocks the correct
binding until it is removed. If that happens, remove `galaxxigames.com` from
`corp-tower-portfolio` — leaving `enportfolio.galaxxigames.com` alone, that
one is what keeps the portfolio online — then redo step 2 here.

If the apex already has an `A`/`AAAA`/`CNAME` record pointing somewhere else,
Cloudflare will refuse to add the custom domain until that record is removed —
check DNS first, and make sure the record you remove isn't one of the game
hostnames.

### `www` — DNS record plus a Worker Route

`www.galaxxigames.com` is **not** covered by the apex's Custom Domain: a Custom
Domain binds one exact hostname, so `www` inherits nothing from it. A proxied
`CNAME www → galaxxigames.com` does not work either — the request reaches
Cloudflare, matches no Worker, and fails looking for an origin.

What is configured, in this order:

1. **DNS** → Records → Add record → type `AAAA`, name `www`, address `100::`,
   **Proxied**. `100::` is the IPv6 discard address — the standard placeholder
   for a hostname that exists only to be proxied; nothing ever routes to it.
2. **Workers & Pages** → `galaxxigames-root` → Settings → Domains & Routes →
   Add → **Route** (not Custom Domain) → route `www.galaxxigames.com/*`, zone
   `galaxxigames.com`. A Route matches an already-proxied hostname instead of
   provisioning DNS, which is why step 1 comes first.

**The Add-Route dialog's two fields take different values**, and getting this
wrong is what makes the dashboard answer `No zones match www.galaxxigames.com`
and offer to onboard it as a new site — don't accept that offer, it would try
to create `www.galaxxigames.com` as a separate zone that can never activate:

| Field | Value |
|---|---|
| Route | `www.galaxxigames.com/*` |
| Zone | `galaxxigames.com` |

Two things that make a working setup look broken while testing:

- **A `522` on `www` means the request fell through to `100::`** — i.e. no
  Route or redirect rule matched. It is never a DNS or certificate problem;
  the edge answered, so DNS is fine.
- **Local resolvers negatively cache the pre-existing `NXDOMAIN` for up to 30
  minutes** (the zone's SOA TTL), so `www` can look unresolvable well after it
  works. Test past the cache instead of trusting the browser:

```bash
curl -sI --resolve www.galaxxigames.com:443:104.21.81.227 https://www.galaxxigames.com
```

## Replacing it with the real site

When the real landing page exists, either build it into this directory (add a
`package.json` and point `assets.directory` at the build output) or repoint the
custom domain at a new Worker. Either way, drop the `noindex` meta tag and the
"under construction" copy — the placeholder is not meant to outlive the build.
