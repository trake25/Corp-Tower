# KB concept schema

This file describes the proposed authored contract. It is not itself a source of
product behavior.

## Identity

Concept IDs use lowercase dot-separated semantic hierarchy:

`<domain>.<subsystem>.<concept>[.<facet>]`

The ID survives heading or file movement. Headings are presentation; IDs are identity.

## Metadata fields

- `id` — required, globally unique.
- `alias` — optional, repeatable vocabulary used to resolve the concept.
- `source` — optional/repeatable during migration; required before the concept becomes
  authoritative for source retrieval. Form: `repo/path#stable-anchor`.
- `adjacent` — optional/repeatable directed concept ID. It grants a legal KB-router
  widening choice; it never means auto-load.

## Retrieval unit

Only metadata-bearing leaf sections are normal semantic retrieval units. Parent headings
organize the human document and may be used for outlines, but they do not grant source.

## Generated data

The following are derived and must not be independently authored:

- concept → document path;
- concept → heading/line range;
- concept → map path;
- concept → source line numbers;
- concept-router rows in `index.md`;
- human alias tables;
- reverse source → concept index used by docs scoping.

## Failure contract

The future retrieval layer must distinguish at least:

- `concept-unmapped`
- `alias-ambiguous`
- `section-missing`
- `section-duplicate`
- `source-anchor-missing`
- `source-target-missing`
- `map-stale`
- `budget-exceeded`
- `access-denied`

A failure reports its exact reason. It does not authorize arbitrary repository search.
