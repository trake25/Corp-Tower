# Content — collections, schema, copy

Scope: `src/content/**`, `src/data/**`, and the copy constants and text in
`src/pages/*.astro`. Markup, styling and behaviour are [design.md](./design.md).

## Register — plain English

Every visible string is written for a reader who does not share the vocabulary:
short sentences, active voice, concrete nouns, no marketing register, no
adjective doing a claim's work. Someone who does not know what EKS is should
still learn what was built; someone who does gets the receipt in the same row.

Jargon has one home — the per-step `keywords` chips. They carry the industry
term so a reader (or a search) scanning for it finds it, while the body stays
plain. **The body must read correctly with the chips removed.**

**Every claim carries its artefact.** A step that asserts work exists needs
`evidence` pointing at the one thing that proves it, labelled in plain English
rather than by filename. Never invent a number, a duration or a link.

## Collections

Three, one file per entry, all schema-validated at build by `src/content/config.ts`.

| Collection | Files | Adding one |
|---|---|---|
| `cards` | `src/content/cards/*.md` | One per skill role |
| `games` | `src/content/games/*.md` | A new file. Playables, both vignettes and the tiles all derive from it |
| `cv` | `src/content/cv/*.md` | A new file plus renumbering `order`; `order: 1` is the most recent role |

**`hidden: true` keeps an entry in the repo and validated while removing it from
every count, filter and grid together.** Prefer it to deleting. `index.astro`
filters on it once, so nothing else has to know.

### `cards`

| Field | Meaning |
|---|---|
| `role` | The discipline. Keys the diagram map, the filter and the card id (`card-<role>`) |
| `order` | Display order, lowest first |
| `hidden` | Out of the page, still validated |
| `wip` | A real discipline whose card is still being written. Renders as a flat non-expandable row tagged "Under construction". Not `hidden` — hiding it makes the page claim fewer disciplines than exist, and the honesty markers elsewhere only count if this one is applied too |
| `headline` | The summary title on the collapsed tile |
| `plain` | One short description shown when the card opens |
| `tools` | Tools & tech chips |
| `video` / `videos` | Clips (below). `videos` renders after `video` |
| `details[]` | One entry per clickable element in the card's diagram |
| `details[].id` | Must match a `data-detail` hotspot in the diagram. A mismatch fails silently |
| `details[].title` | Numbered step title |
| `details[].keywords` | The named disciplines this step exercises |
| `details[].body` | **Two to three sentences, hard cap three.** Every step renders at once behind one toggle, so length is what keeps the card readable |
| `details[].evidence` | `{ label, href }` — the one artefact proving this step. The schema checks the URL is well formed but cannot check the anchor resolves, so re-check after any docs compaction |
| `details[].planned` | Marks future work. Renders greyed with a "Planned" tag in both the step and its hotspot, so the claim stays visible but distinct from what ships |
| `links[]` | Staging only, rendered nowhere. Cards not yet converted to per-step `evidence` keep their URLs here. Delete the field and `Card.astro`'s `links` prop together once the last card is converted |

### `games`

| Field | Meaning |
|---|---|
| `title` · `order` · `hidden` | As above |
| `status` | `production` or `development` — which vignette it files under |
| `tagline` | Optional single line under the title on the collapsed tile |
| `blurb` | Short paragraph shown when the tile opens. The card's point is the links, not the prose |
| `links[]` | `{ label, href }` play or store destinations. **The only links the Playables strip reads** — a repo is not somewhere you go to play |
| `repo` | `{ label, href, disclaimer? }`, card-only. The disclaimer covers a repo carrying a different working name than the game |
| `buildingTheGame` | Mounts the skill cards for this game. Exactly one game may carry it; a second renders the same cards twice with duplicate element ids. Also selects the hero's play button and the Featured project tile |

### `cv`

`role`, `company`, `start`, `end` (defaults `Present`), `order`, `hidden`,
optional `location` and `summary`, and `highlights[]`. Dates are free text
printed as written and never parsed — ordering is `order`'s job alone.
`highlights[]` are the payload of the tile; the markdown body is for anything
needing prose.

### Clips

`{ src, poster?, caption? }`. `src` and `poster` are bucket-relative paths
resolved against `profile.mediaBase`; a value already starting with `http` is
used as written, so an externally hosted clip still works.

**Absent by default.** No `video` block means no player, no poster, no "coming
soon" — the layout closes up. **Always ship a `poster`:** `preload="none"` makes
it the only thing fetched until someone presses play, which is what keeps several
clips on one page cheap. With more than one clip stacked, `caption` is the only
thing telling a reader which run they are looking at.

## Page copy — where each string lives

| What | File |
|---|---|
| Name, short name, titles, project name, site URL, OG tagline | `src/data/profile.json` — JSON because `tools/generate-og.mjs` reads the same values and is plain Node |
| Email, location, timezone, contact links, CV button, `mediaBase`, availability line | `src/data/profile.ts` |
| Hero, nav, footer, section intros | `src/pages/index.astro` markup |
| The four "Engineering Capabilities" rows | `WHAT_I_DO` in `index.astro` |
| The Technologies lists | `SKILL_GROUPS` in `index.astro` |
| Degree, licence, training | `CREDENTIALS` in `index.astro` |
| 404 copy | `src/pages/404.astro` |
| Contact dialog — title, description, labels, placeholders, both states | `src/components/ContactDialog.astro` |

Those four constants are deliberately not collections: static lines that change
when the stack does, not files with a schema.

**`SKILL_GROUPS` is the one block with no surrounding prose to qualify it**, so
an unearned entry there reads as a straight claim. Every item must be something
actually used.

`profile.links` entries with `href: null` are skipped entirely, so a placeholder
can sit in the list until its URL exists. The same convention hides the CV
button. `profile.github` is also published as `sameAs` in the JSON-LD, which
`BaseLayout` dedupes against the contact links.

**The published email is a domain alias routed to the personal inbox, never the
address behind it.** It ships in plain text and in the JSON-LD, so it will be
scraped; what gets scraped has to be disposable. Routing forwards but does not
send — replies leave from the personal address. **The contact form's recipient
is a different value**, held in the `CONTACT_TO` secret and never rendered.

**The CV PDF is served from `public/`**, not R2: it deploys with the site,
versions in git, and needs no second credential for a file that changes when the
site does. What goes in it is a security decision — city and country, email,
LinkedIn, and no street address or phone number. Nothing an applicant tracking
system needs is missing, so there is nothing on the file worth gating; a version
carrying a phone number goes out by email to someone who has already made
contact.

**Clips stay out of git.** They are tens of megabytes each and Workers Static
Assets caps a single file at 25 MiB, so `mediaBase` points at R2 and moving
buckets is one edit here rather than a find-and-replace across every content file.
