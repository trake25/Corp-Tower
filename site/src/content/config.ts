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
      .array(z.object({ id: z.string(), title: z.string(), body: z.string() }))
      .default([]),
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([]),
  }),
});

export const collections = { cards };
