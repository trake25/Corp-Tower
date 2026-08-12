# Design — layout, styling, components, diagrams

Scope: `src/styles/global.css`, `src/components/**`, `src/layouts/`, and the
markup and scripts of `src/pages/*.astro`. The words in those files belong to
[content.md](./content.md).

## Mono Slate

Near-monochrome slate, dark-first. No webfont is requested: display weight comes
from scale and tracking, not a third-party download on a site whose pitch is
engineering discipline.

**Two colours do different jobs and must stay apart.**

| Token | Spent on |
|---|---|
| `--accent` (brass) | **State and category only** — section numbers, role chip, open chevron, current role, active step, evidence links, the forward path in a diagram. If it is not marking something, it is not brass |
| `--action` (near-white; near-black in light) | **Things you click to do something** — the primary button, the pressed filter |

A primary button painted brass, or a status chip in `--action`, turns this into a
generic dark theme. The restraint is the design.

The light scheme is a translation, not an inversion: the same slate neutrals
lightened, and brass darkened, because the dark-scheme brass has nowhere near
enough contrast on a light ground. Both schemes live in `:root` and one
`prefers-color-scheme: light` block; a colour defined in only one of them is a
bug.

**Density is deliberate.** 4–6px radii instead of pills, a `--step-*` scale
topping out near 0.955rem for body text, and `--max-width: 1120px`. A reader
deep in a card should see a whole skill card rather than scroll through one.

`tools/generate-og.mjs` carries the same palette by hand as named constants in
its SVG template. It is plain Node and cannot read CSS custom properties, so
changing a colour in `global.css` means changing it there in the same edit.

## Level grammar — no two adjacent levels look alike

Four disclosures that are all a chevron and a title is accordion soup, and a
reader deep in the page loses track of where they are. Each level has its own
shape:

| Level | What | Grammar |
|---|---|---|
| 0 | Section | Numbered heading, never collapses |
| 1 | Vignette | Full-width band: label, count, rule, chevron. **Not a card** |
| 2 | Game / job / skill tile | Tile in a list. Closed = title plus one line of meta |
| 3 | Steps disclosure | A small `<details>` inside an open card — "Show N steps" |

A new level needs its own grammar or the separation collapses.

**The contact dialog is not a fifth level.** It is the one modal, outside the
reading order rather than inside it. Native `<dialog>` and `showModal()` are
load-bearing — Escape, the focus trap and the inert background come from them,
so nothing here reimplements focus management. Both `Hire me` triggers are
anchors holding the `mailto:` href, and the handler yields to them whenever it
cannot do better — no `showModal`, or an endpoint that says it is not ready. The
dialog only ever upgrades a working link. Trigger and
dialog are both hidden in print: a control pointing at what cannot open.

Headings run `h2` section → `h3` vignette and card headline → `h4` game, job and
step titles. Controls that are not headings — "Building the game", "Show N
steps" — stay controls; promoting one pushes step titles past `h6`.

**Credentials render as a flat list, not tiles.** A credential has nothing to
hide, so it is visibly a different thing from the job tiles above it.

**A work-in-progress card is a `div`, not a `<details>`.** A disclosure that
opens onto an apology is worse than a row that says so on its face. It keeps
`.card`, its id and `data-role` so the filter and deep links still reach it.

## Card states

1. **Vignette** — role chip and summary title only.
2. **Open** — short description, Tools & tech chips, then **diagram → clips →
   steps**. The diagram gives the shape, the clip shows it running, the steps say
   why. An absent clip renders nothing at all.

The steps sit behind their own small `<details>`; one click reveals all of them.
`details[].body` staying two to three sentences is still load-bearing — the
toggle reveals every step at once, so length is what keeps the card readable.

Closing a card closes its steps and its clips and clears any active highlight.
Clips do not re-download on reopen: the players keep the `src` they were given.

## Behaviour

All of it is document-wide, so no component needs to know how deeply it is
nested. The accordion, deep-link and print handlers live in `index.astro`; the
diagram↔step wiring lives in `Card.astro`.

**One open at a time, per group** — `[data-accordion]`, applied to the three card
lists. Siblings are *removed* while one is open, not merely collapsed, through
`.is-peer-hidden` — deliberately a separate channel from the `hidden` attribute
the role filter drives, so closing a card cannot resurrect cards the filter took
away. Vignettes are excluded: a reader may want two open at once.

Scroll correction is owed only to a summary the reader activated. A tile marked
open in the HTML fires `toggle` during parse, and a deep link opens tiles
programmatically; scrolling on either is wrong. On close, the tile is measured
either side of the sibling restore and the difference cancelled, so the tile
stays under the reader's eye.

Only the first in-development game opens by default. The accordion enforces its
rule from the `toggle` event, which never fires for a tile already open in the
HTML, so two default-open tiles would both render expanded.

**Deep links open their ancestors.** A link to `#card-cloud` walks up every
`<details>`, clicks the role filter back on if one is hiding the card, then
scrolls. Covers evidence links, the nav, and a hash typed into the address bar.
Without it a deep link lands on a collapsed tile and looks broken. A hash that is
not a valid selector is caught rather than thrown.

**Diagram ↔ step is two-way.** A hotspot click opens the steps disclosure,
highlights its step and scrolls to it; a step click lights the diagram box back
up. Both share `is-active` and clear together. Each `details[].id` must match a
`data-detail` on a hotspot — a mismatch fails silently.

**Filtering is by `role`**, in `ROLE_ORDER` order. A role present in the cards but
missing from `ROLE_ORDER` is appended rather than dropped. Changing the filter
dispatches `cards:reset`, which returns every card to a vignette.

**Print is a supported output.** A closed `<details>` hides its children through
a slot it never renders into, so no stylesheet can open one — `beforeprint`
opens every disclosure in the DOM and `afterprint` re-closes only what was shut,
guarded by a `printing` flag so the accordion does not fight it. Safari fires
neither event and is covered by the `print` media query. The `@media print` block
drops diagrams, players, filters and hints, leaving prose, steps, evidence URLs
and the CV.

Every scroll and transition is skipped under `prefers-reduced-motion: reduce`.

## Diagrams

One SVG component per role in `src/components/diagrams/`, mounted through the
named `diagram` slot on `Card.astro` and wired by role in the `diagrams` map in
`index.astro`. A role absent from that map renders without one.

- **Reuse the `.topology` classes** — `.node`, `.link`, `.label`, `.sub`,
  `.wire`, `.arrow-head`, `.ephemeral`, `.hotspot`, `.is-planned` — rather than
  styling inline. That is what makes the set read as one visual language and
  track both colour schemes.
- **Namespace every `id`.** Markers and `aria-labelledby` targets are
  document-global; two diagrams both defining `id="arrow"` silently resolve to
  the wrong one. Prefix with the role — `qa-arrow`, `cloud-arrow`.
- **Every hotspot is keyboard-reachable**: `role="button"`, `tabindex="0"`, an
  `aria-label` naming the step, and Enter/Space handled alongside click.
- Each SVG carries a `<title>` and `<desc>` referenced by `aria-labelledby`.
- **Every step with a `details[]` entry needs a `.hotspot` group, and vice
  versa.** A `planned` step renders greyed with a `Planned` tag on both sides.
- **A diagram draws the card's argument.** Restating the headline does not earn
  the space.
