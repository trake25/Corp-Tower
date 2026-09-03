# Corp Tower KB overhaul — ChatGPT authored draft

This package is a **design/authoring artifact**, not a repository implementation.

It restructures the current `docs/context/` knowledge base into concept-addressable
Markdown so the later agent router can resolve:

`task → concept → exact prose section → exact concept-map section → bounded source`.

## Status

- Prose has been reorganized into small, independently retrievable contracts.
- Stable semantic concept IDs, aliases, adjacency and source-owner seeds are included.
- `index.md` is a proposed generated-router snapshot derived from the concept metadata.
- `map/concept/*.md` are **generated-output mockups** derived from this draft.
- Existing locator maps such as `map/backend.md`, `map/ui-hud.md`, and `map/infra.md`
  are intentionally not copied here; the approved architecture keeps them during migration.
- `#@file` source seeds are deliberately coarse where this ChatGPT session did not
  establish a trustworthy stable symbol. Before activation, the repository-side generator
  should resolve or replace them with exact stable anchors and validate every target.
- Line numbers are intentionally absent from authored metadata. They belong to generated maps.

## Proposed metadata

A leaf concept is preceded by:

```md
<!-- kb
id: hud.tower.collapse.presentation
alias: collapse framing
source: src/.../TowerStack.gd#@file
adjacent: gameplay.tower.stability
-->
### Collapse presentation
```

Rules:

1. One canonical `id` per durable concept.
2. Aliases belong to that concept, not to a second alias database.
3. `source:` is repeatable and must resolve to first-party source plus a stable anchor.
4. `adjacent:` grants a legal return path through the KB router; it is never auto-loaded.
5. Broad organizational headings have no metadata.
6. Prose owns behavior, authority, flow, rationale, and live constraints; maps own location.
7. No concept may grant `report/`, `repair/`, `plan/`, `task/`, `reference/`, or `.agent-state/`.

## Migration intent

Use this package as the authored content target for the KB prerequisite. Codex should
validate it against current source, build the metadata parser/generator/validators,
resolve exact anchors, regenerate concept maps/index output, and preserve the existing
source-locator maps until the later retrieval/router overhaul.
