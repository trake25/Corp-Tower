// Field meanings, copy rules and the reasoning behind them: site/docs/content.md.
import { defineCollection, z } from "astro:content";

// Bucket-relative paths resolved against `profile.mediaBase`; an absolute
// http(s) URL passes through, which is why this is not `z.string().url()`.
const clip = z.object({
  src: z.string(),
  poster: z.string().optional(),
  caption: z.string().optional(),
});

// Absent by default: no block, no player, no placeholder.
const video = clip.optional();

// Renders in order after `video`. Give every clip its own caption.
const videos = z.array(clip).default([]);

// Play or download destinations. The only links section 03's strip reads.
const playLink = z.object({
  label: z.string(),
  href: z.string().url(),
});

const cards = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    order: z.number(),
    // Kept in the collection, kept out of the page.
    hidden: z.boolean().default(false),
    // A real discipline whose card is still being written: renders as a flat
    // "Under construction" row. Deliberately neither hidden nor published.
    wip: z.boolean().default(false),
    headline: z.string(),
    plain: z.string(),
    tools: z.array(z.string()).default([]),
    video,
    videos,
    // One entry per clickable element in the card's diagram.
    details: z
      .array(
        z.object({
          // Must match the `data-detail` on a diagram hotspot.
          id: z.string(),
          title: z.string(),
          // The named disciplines. Carries the jargon so the body need not.
          keywords: z.array(z.string()).default([]),
          // Two to three sentences, hard cap three.
          body: z.string(),
          // The one artefact proving this step. The URL shape is checked here;
          // the anchor resolving is not.
          evidence: z.object({ label: z.string(), href: z.string().url() }).optional(),
          // Future work: greyed, tagged "Planned" in step and hotspot alike.
          planned: z.boolean().default(false),
        })
      )
      .default([]),
    // Staging only, rendered nowhere. Delete with `Card.astro`'s `links` prop
    // once the last card carries per-step `evidence`.
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([]),
  }),
});

// One file per game. The Playables strip, both vignettes and the game cards all
// derive from this collection.
const games = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    // Which vignette it files under.
    status: z.enum(["production", "development"]),
    // Lowest first, within each status group.
    order: z.number(),
    hidden: z.boolean().default(false),
    // One line under the title on the collapsed tile.
    tagline: z.string().optional(),
    // Shown when the tile opens. Short — the card's point is the links.
    blurb: z.string(),
    links: z.array(playLink).default([]),
    // Card-only. `disclaimer` covers a repo carrying a different working name.
    repo: z
      .object({
        label: z.string().default("GitHub"),
        href: z.string().url(),
        disclaimer: z.string().optional(),
      })
      .optional(),
    video,
    videos,
    // Mounts the skill cards. Exactly one game may carry it — a second renders
    // the same cards twice with duplicate element ids.
    buildingTheGame: z.boolean().default(false),
  }),
});

// One file per role, newest first by `order`. The markdown body renders under
// the highlights when the entry is opened.
const cv = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    company: z.string(),
    // Free text, printed as written and never parsed. Ordering is `order`'s job.
    start: z.string(),
    end: z.string().default("Present"),
    // 1 is the most recent role.
    order: z.number(),
    hidden: z.boolean().default(false),
    location: z.string().optional(),
    // One line shown in the collapsed tile.
    summary: z.string().optional(),
    // The payload of the card; the markdown body is for anything needing prose.
    highlights: z.array(z.string()).default([]),
  }),
});

export const collections = { cards, games, cv };
