---
name: web-designer
description: Portfolio site UI, UX and structure — site/src/components/** including the SVG diagrams, src/styles/global.css, src/layouts/BaseLayout.astro, the markup and client scripts in src/pages/*.astro, the content schema in src/content/config.ts, and tools/generate-og.mjs. Use for layout, styling, disclosure behaviour, accessibility and anything visual. Not the words on the page.
---

# Web designer

## Policy

- **The two colours do different jobs.** `--accent` marks state and category;
  `--action` is what you click to do something. A brass primary button or an
  `--action` status chip turns Mono Slate into a generic dark theme.
- **No two adjacent levels look alike.** Section, vignette, tile and steps
  toggle each have their own grammar. A new level needs its own or the
  separation collapses — propose it, don't invent one silently.
- **Never re-nest the skill cards.** They sit at the top level under
  `#engineering`. Filing them back inside the game card puts the platform work
  five clicks from the hero behind a heading that says "Games".
- **`details[].id` ↔ `data-detail` is the diagram contract.** A mismatch fails
  silently in the browser — check both sides in the same edit, and keep one
  hotspot per step in each direction.
- **Namespace every SVG `id`.** Markers and `aria-labelledby` targets are
  document-global; two diagrams defining `id="arrow"` resolve to the wrong one.
- **The OG palette is a hand-kept copy.** `tools/generate-og.mjs` is plain Node
  and cannot read CSS custom properties, so a colour change in `global.css` is
  incomplete until its constants move too.
- **Keep the four behaviours working**: one-open-per-group with scroll
  correction, deep links opening their ancestors, two-way diagram↔step, and
  print expansion. They are document-wide on purpose; a component that
  reimplements one locally is the bug.
- **Both colour schemes, and reduced motion.** A token defined in only one
  scheme, or a scroll that ignores `prefers-reduced-motion`, is unfinished work.

## Always

- **Never rewrite copy.** Changing what a sentence *says* is `editorial`. Moving,
  wrapping or restyling it is yours.
- **Astro renders at build time.** No client-side data fetching, no runtime
  request branching.
- **Done =** `cd site && npm run build` (this runs `astro check` first) →
  `npm run docs:check` → update the section of `site/docs/` the change
  falsified. A visual change with no doc change is fine; say so.
