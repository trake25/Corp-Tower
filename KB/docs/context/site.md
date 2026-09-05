# Portfolio

Scope: the portfolio's editorial claims, content model, visual system,
disclosure behavior, accessible diagrams, and build/deployment boundary.

<!-- kb
id: site.editorial.evidence
alias: portfolio editorial register
alias: portfolio claim evidence
source: site/docs/content.md#Register — plain English
adjacent: site.content.schema
-->
## Editorial evidence

Portfolio copy is plain, concrete, and readable without specialist vocabulary.
Every public claim has one plainly labelled artefact that proves it; jargon
belongs in its named keyword context rather than doing the claim's work.

<!-- kb
id: site.content.schema
alias: portfolio content schema
alias: portfolio honesty markers
source: site/src/content/config.ts#cards
source: site/src/content/config.ts#collections
adjacent: site.editorial.evidence
-->
## Content model

The cards, games, and CV collections are schema-validated build input. Hidden,
work-in-progress, planned, evidence, and collection-order fields make published
status explicit, so source content never implies shipped work, a verified claim,
or a visible entry that the page does not render.

<!-- kb
id: site.visual.language
alias: portfolio visual language
alias: site token roles
source: site/docs/design.md#Mono Slate
adjacent: site.disclosure.navigation
-->
## Visual language

Mono Slate uses restrained dark-first token roles: accent marks state or
category, while action marks an interactive choice. The light scheme preserves
those roles rather than mechanically inverting colours, and density, type, and
level grammar keep a reader oriented through a long evidence-led page.

<!-- kb
id: site.disclosure.navigation
alias: portfolio disclosure behavior
alias: portfolio navigation behavior
source: site/docs/design.md#Behaviour
adjacent: site.diagram.accessibility
-->
## Disclosure and navigation

Each disclosure level has a distinct reading role. Card accordions preserve the
reader's location, deep links open their ancestors, filters reset card state,
and print exposes the relevant prose without treating hidden interactions as
content. Reduced motion remains a first-class presentation path.

<!-- kb
id: site.diagram.accessibility
alias: portfolio diagram accessibility
alias: diagram interaction
source: site/docs/design.md#Diagrams
adjacent: site.disclosure.navigation
-->
## Diagram interaction

Portfolio diagrams explain a card's argument and connect each hotspot to its
step in both directions. Their identifiers are document-global, their hotspots
remain keyboard-operable, and each SVG supplies an accessible name and
description; a diagram-step mismatch is a contract defect, not decorative drift.

<!-- kb
id: site.deployment.contract
alias: portfolio build deployment
alias: portfolio Workers deploy
source: site/docs/deploy.md#Build and hosting
source: .github/workflows/Site-Deploy-Workers.yml#build-and-deploy
-->
## Build and deployment

The portfolio is a static Astro build served by Cloudflare Workers Static Assets.
Only the contact endpoint reaches the Worker at request time; its narrow route
preserves static asset routing. Production deploy is deliberate rather than a
routine push, while staging validates site changes independently.
