# KB concept schema

This file defines the implemented authored contract for the parallel
experimental concept KB. It is not a source of product behavior.

## Identity and ownership

Concept IDs use a lowercase dot-separated semantic hierarchy:

`<domain>.<subsystem>.<concept>[.<facet>]`

An ID is globally unique and survives heading or document movement. A
`<!-- kb ... -->` block must be followed immediately by exactly one Markdown
leaf heading. Its retrieval unit begins at that heading and stops before the
next concept metadata block or enclosing/sibling heading.

## Metadata fields

- `id` is required and non-repeatable.
- `alias` is optional and repeatable. Resolution applies NFKC normalization,
  trimming, lowercase conversion, and internal whitespace collapse. Every
  normalized alias must resolve to one concept and cannot conflict with an ID.
- `source` is repeatable and required at least once for every ready concept.
  Its form is `repo/path#stable-anchor`; repository-relative paths and exact
  non-line-number anchors are mandatory. `#@file` is rejected in ready state.
- `adjacent` is optional and repeatable. It names an existing different concept
  ID. Directed cycles are allowed; adjacency never means auto-load.

Source grants cannot enter `.agent-state/`, `KB/`, `plan/`, `reference/`,
`repair/`, `report/`, or `task/`.

## Prose quality

Each leaf has one semantic responsibility and supplies the compact behavior,
subsystem mechanism, durable rationale/invariant, and ownership boundary needed
to reason correctly before source inspection. Those elements read as natural
prose rather than required visible labels. Concise negatives are preferred when
they prevent authority, presentation, persistence, or lifecycle confusion.

Function narration, file/scene inventories, routine copied defaults,
implementation history, and duplicated neighboring contracts do not belong in
concept prose. One concept fully owns each durable fact; another concept states
only its necessary boundary and uses `adjacent:` for the semantic route. Maps
locate implementation and source retains exact local detail.

## Derived data

The parser derives concept owner path, heading/range, normalized aliases, and a
reverse source-path-to-concept index. The generator derives source line numbers,
bounded read commands, per-domain map sections, and the marked router block in
`index.md`. None of those outputs is independently authored.

## Retrieval contract

`concept-route` resolves an exact canonical ID first, then an exact normalized
alias. `concept-read` adds only that concept's prose leaf. `concept-bundle`
creates a local-runner handoff only under `.agent-state/automation/`. Returned
adjacency includes explicit next-call commands and loads no adjacent prose.

Every failure includes a reason, denies broad source fallback, and uses one of:

- `concept-unmapped`
- `alias-ambiguous`
- `section-missing`
- `section-duplicate`
- `source-anchor-missing`
- `source-target-missing`
- `map-stale`
- `budget-exceeded`
- `access-denied`
- `tool-error`

## Budgets and validation

Concept capacity is independent from the primary KB capacity implementation and
uses the deterministic ceiling of UTF-8 bytes divided by four. More than 1,200
estimated tokens is advisory, more than 1,800 is strong advisory, and more than
2,500 is a hard error. Warnings are calibration signals, not maintenance
defects. Concept retrieval defaults to 16 KiB and has a 32 KiB absolute response
limit. Experimental Markdown retains its 400-character line ceiling; the
primary KB keeps its separate 300-character limit.

The explicit concept benchmark retains correctness/fail-closed gates and also
writes a compact private snapshot beneath ignored benchmark state. It measures
representative prose, route/map data, every bounded source range, merged unique
ranges, adjacency, complete footprints, and authored multi-concept journeys.
Source contents and model/session/private environment data are never telemetry.

`node scripts/export-kb-calibration-report.mjs` manually reads the latest valid
snapshot and creates the next free sanitized report version. The exporter is not
called by the benchmark, QA, task-close, or ordinary KB changes, and reports
remain non-context review aids rather than authority.

Run:

```sh
node scripts/build-concept-map.mjs --check --quiet
node scripts/validate-concept-kb.mjs --quiet
node scripts/benchmark-rag.mjs --concept-check
```
