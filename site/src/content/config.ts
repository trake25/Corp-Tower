import { defineCollection, z } from "astro:content";

const cards = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    order: z.number(),
    headline: z.string(),
    plain: z.string(),
    tools: z.array(z.string()).default([]),
    // One entry per clickable element in the card's diagram. `id` must match the
    // `data-detail` on the diagram hotspot — that pairing is what turns a click
    // on a diagram step into the matching explanation opening below it.
    details: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          body: z.string(),
          // The one artefact that proves this step. Per-step rather than a
          // bucket at the bottom of the card: a link is far stronger sitting
          // next to the claim it backs. The schema checks the URL is well
          // formed — it cannot check the anchor still resolves.
          evidence: z.object({ label: z.string(), href: z.string().url() }).optional(),
        })
      )
      .default([]),
    // Staging only, and not rendered anywhere. Cards not yet converted to
    // per-step `evidence` keep their collected URLs here so they survive the
    // rewrite. `qa.md` has none left — it is fully converted. Delete this field
    // and the `links` prop on Card.astro once the last card is converted.
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([]),
  }),
});

export const collections = { cards };
