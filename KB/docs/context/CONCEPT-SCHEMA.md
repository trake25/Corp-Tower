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

A concept prose leaf is limited to 6 KiB. Concept retrieval defaults to 12 KiB
and has a 24 KiB absolute response limit. Experimental KB Markdown uses a
400-character line ceiling; this does not alter the primary KB's 300-character
limit.

Run:

```sh
node scripts/build-concept-map.mjs --check --quiet
node scripts/validate-concept-kb.mjs --quiet
node scripts/benchmark-rag.mjs --concept-check
```
