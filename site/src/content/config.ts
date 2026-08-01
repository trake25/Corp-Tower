import { defineCollection, z } from "astro:content";

const cards = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    order: z.number(),
    tags: z.array(z.string()),
    headline: z.string(),
    plain: z.string(),
    metric: z.string(),
    metricLabel: z.string(),
    links: z
      .array(z.object({ label: z.string(), href: z.string().url() }))
      .default([]),
    proofDone: z.boolean().default(true),
  }),
});

export const collections = { cards };
