import { defineCollection, z } from "astro:content";

const cards = defineCollection({
  type: "content",
  schema: z.object({
    role: z.string(),
    order: z.number(),
    tags: z.array(z.string()),
    plain: z.string(),
    proofDone: z.boolean().default(true),
  }),
});

export const collections = { cards };
