import { defineCollection, z } from "astro:content";

// One optional clip per skill section and per game. Left out entirely, nothing
// renders — no empty player, no "coming soon" box. Fill `src` in when a
// recording exists (R2 URL) and the block appears on its own.
const video = z
  .object({
    src: z.string(),
    poster: z.string().optional(),
    caption: z.string().optional(),
  })
  .optional();

// Where a game can be played or downloaded. These are the only links section
// `00 Playables` reads, which is what makes it a genuine shortcut rather than a
// second table of contents — a repo link is not somewhere you go to play.
const playLink = z.object({
  label: z.string(),
  href: z.string().url(),
});

const cards = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    order: z.number(),
    // Kept in the collection, kept out of the page. `index.astro` filters these
    // out of `getCollection`, so the filter bar and the grid follow — setting it
    // back to false is the only step to bring a card back.
    hidden: z.boolean().default(false),
    headline: z.string(),
    plain: z.string(),
    tools: z.array(z.string()).default([]),
    // Sits between the diagram and the written steps: you see the shape, then
    // see it running, then read why.
    video,
    // One entry per clickable element in the card's diagram. `id` must match the
    // `data-detail` on the diagram hotspot — that pairing is what turns a click
    // on a diagram step into the matching explanation highlighting below it.
    details: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          // The named disciplines this step exercises. Rendered as chips under
          // the step title so the industry term is present for a reader (or a
          // search) scanning for it, while the body stays in plain English.
          keywords: z.array(z.string()).default([]),
          // Target length is two to three sentences, hard cap three. The step
          // bodies are no longer behind a toggle — they render as soon as the
          // skill card opens, so length is what keeps the card readable.
          body: z.string(),
          // The one artefact that proves this step. Per-step rather than a
          // bucket at the bottom of the card: a link is far stronger sitting
          // next to the claim it backs. The schema checks the URL is well
          // formed — it cannot check the anchor still resolves.
          evidence: z.object({ label: z.string(), href: z.string().url() }).optional(),
          // Marks a step that describes future work rather than something
          // built today. Renders greyed out with a "Planned" tag in both the
          // written step and its diagram hotspot — the claim stays visible,
          // but visually distinct from what already ships.
          planned: z.boolean().default(false),
        })
      )
      .default([]),
    // Staging only, and not rendered anywhere. Cards not yet converted to
    // per-step `evidence` keep their collected URLs here so they survive the
    // rewrite. Delete this field and the `links` prop on Card.astro once the
    // last card is converted.
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([]),
  }),
});

// One file per game. Adding a game is a new file here and nothing else: the
// Playables strip, the In Production / In Development vignettes and the game
// cards all derive from this collection.
const games = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    // Which vignette the game files under. `development` also unlocks the
    // Building the Game panel via `buildingTheGame` below.
    status: z.enum(["production", "development"]),
    // Lowest first, within each status group.
    order: z.number(),
    // Drafting a game? Set this true and it disappears from the strip, the
    // vignette and the counts together. Nothing else needs to know.
    hidden: z.boolean().default(false),
    // One short line under the title in the collapsed tile. Optional.
    tagline: z.string().optional(),
    // Shown when the tile opens. Keep it to a short paragraph — the point of
    // the card is the links, not the prose.
    blurb: z.string(),
    // Play/store destinations. Also what section 00 lists.
    links: z.array(playLink).default([]),
    // Per-game source link, replacing the old site-wide footer one. The
    // disclaimer exists because a repo may carry a different working name than
    // the game does — leave it out and no note renders.
    repo: z
      .object({
        label: z.string().default("GitHub"),
        href: z.string().url(),
        disclaimer: z.string().optional(),
      })
      .optional(),
    video,
    // Mounts the skill cards inside this game's card. Exactly one game should
    // carry it; a second would render the same six cards twice with duplicate
    // element ids.
    buildingTheGame: z.boolean().default(false),
  }),
});

// One file per role, newest first by `order`. The markdown body is free-form
// and renders under the highlights when the entry is opened.
const cv = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    company: z.string(),
    // Free text, not dates — "Jan 2023", "2019", "Q3 2021" all work. They are
    // printed as written and never parsed, so ordering is `order`'s job alone.
    start: z.string(),
    end: z.string().default("Present"),
    // 1 is the most recent role. Renumbering when a job is added is the only
    // maintenance this collection needs.
    order: z.number(),
    hidden: z.boolean().default(false),
    location: z.string().optional(),
    // One line shown in the collapsed tile, under the role and company.
    summary: z.string().optional(),
    // Duties and achievements, one per entry. These are the payload of the
    // card — the markdown body below them is for anything that needs prose.
    highlights: z.array(z.string()).default([]),
  }),
});

export const collections = { cards, games, cv };
