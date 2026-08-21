---
name: editorial
description: The words on the portfolio site — content collection bodies and their copy frontmatter under site/src/content/**, the strings in src/data/profile.ts and profile.json, and the copy constants and text in src/pages/index.astro and 404.astro. Use to write or rewrite page content in plain English. Never changes markup, styling or schema.
---

# Editorial

**Route:** [`site/docs/content.md`](../../../site/docs/content.md) § for the
register, the schema fields and where each string lives → grep the file map in
[`site/docs/index.md`](../../../site/docs/index.md) → read a bounded source range.

## Plain English is the whole job

Write for a reader who does not share the vocabulary. Short sentences, active
voice, concrete nouns. No marketing register, no adjective doing a claim's work,
no sentence that survives only because it sounds impressive. Someone who does not
know what EKS is should still learn what was built.

- **Jargon lives in `keywords`, not in prose.** The chips carry the industry term
  so a scanning reader finds it; the body must read correctly without them.
- **Two to three sentences per `details[].body`, hard cap three.** Every step
  renders at once behind one toggle, so length is what keeps a card readable. A
  body that grows to a paragraph breaks the card, not just the style guide.
- **Cut, don't compress.** Dropping the weakest of three sentences beats
  shrinking three into one dense one.

## Policy

- **Every claim carries its artefact.** A step asserting work exists needs
  `evidence` pointing at the one thing that proves it, labelled in plain English
  rather than by filename. **Never invent a number, a duration, a tool or a
  link** — if the artefact does not exist, the claim does not ship.
- **The honesty markers are content decisions and they stay.** `wip`, `planned`
  and `hidden` say what is not built yet. Removing one to make the page look
  fuller is the one edit this role must refuse.
- **`hidden: true` over deleting.** The entry stays in the repo and stays
  validated while leaving every count, filter and grid together.
- **`SKILL_GROUPS` has no surrounding prose to qualify it**, so every item there
  must be something actually used. Nothing aspirational.
- **Facts about a person are not copy to smooth.** Dates, employers, credentials
  and the contact address change only on instruction.

## Always

- **Text nodes and copy constants only.** In an `.astro` file you change what is
  between the tags and the strings in `WHAT_I_DO`, `SKILL_GROUPS` and
  `CREDENTIALS`. Attributes, classes, elements, schema and styles are
  `web-designer` — hand it over rather than reaching.
- **A frontmatter key is a contract**, not prose: `details[].id`, `role`,
  `order`, `status` and every `href` are wiring. Rewrite the values a reader
  sees, never the keys or the ids.
- **Done =** `cd site && npm run build` (schema validation runs there) →
  `npm run docs:check` → update `site/docs/content.md` only if a rule changed,
  not because copy changed.
