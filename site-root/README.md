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

Validate locally without deploying, from this directory:

```bash
npx wrangler deploy --dry-run
```

## One-time Cloudflare setup — required before the first deploy lands

CI can create and update the Worker, but **it cannot attach the domain**: the
`CLOUDFLARE_WORKERS_API_TOKEN` is scoped to Workers Scripts only, with no
Zone/DNS permission (same split as the portfolio — see
[`../site/README.md`](../site/README.md)). So the domain binding is a manual
dashboard step, done once:

1. Dispatch **Site Root Deploy (Cloudflare Workers)**, or push this directory.
   That creates the Worker `galaxxigames-root` (it will answer on its
   `*.workers.dev` URL only, at this point).
2. Dashboard → Workers & Pages → `galaxxigames-root` → Settings → Domains &
   Routes → **Add → Custom Domain** → `galaxxigames.com`. Since
   `galaxxigames.com` is already a Cloudflare zone, the apex DNS record is
   provisioned automatically.
3. Repeat for `www.galaxxigames.com` so both spellings resolve.
4. Confirm `https://galaxxigames.com` and `https://www.galaxxigames.com` serve
   this page, and that `https://enportfolio.galaxxigames.com` is untouched.

If the apex already has an `A`/`AAAA`/`CNAME` record pointing somewhere else,
Cloudflare will refuse to add the custom domain until that record is removed —
check DNS first, and make sure the record you remove isn't one of the game
hostnames.

## Replacing it with the real site

When the real landing page exists, either build it into this directory (add a
`package.json` and point `assets.directory` at the build output) or repoint the
custom domain at a new Worker. Either way, drop the `noindex` meta tag and the
"under construction" copy — the placeholder is not meant to outlive the build.
