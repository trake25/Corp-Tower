# Agent automation

This document owns the repository's deterministic retrieval and task close-out
protocol. Product behavior belongs in its domain document; this file only owns
how agents find bounded evidence and record completion.

## Context protocol

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners. Its JSON envelope is versioned, returns repository-relative
provenance, and searches only the KB and generated maps; it never exposes raw
source, environment files, secrets, or the working-tree diff.

| Command | Role |
|---|---|
| `route <area-or-path>` | selects skill, docs, map and bounded source-read strategy |
| `search <query>` | ranks KB sections and map rows with fixed scoring |
| `filter <query> ...` | narrows a fresh deterministic search by area, kind, path or required term |
| `outline` / `section` / `symbol` | reads one known KB structure, section or generated-map row set |
| `scope <task-owned-path>...` | returns routes, docs, maps and the QA selection for explicit task paths |
| `bundle <task>` | writes selected KB/map evidence to an ignored `task/` handoff artifact |

`report/task-token-cost-effectivity.md` routes to this protocol; retrieve it with
`route` before analysing closed-cycle rows.

Search returns at most eight results and 24 KB. A broad or empty result is a KB
repair signal: add a precise route, map `Does` purpose, or retrieval alias rather
than reading the repository broadly. `retrieval-aliases.json` supplies the small,
validated vocabulary bridge for common product terms; it is not an open-ended tag
taxonomy.

Cloud coding agents use the same command through a read-only tool adapter. A
cloud chat session without local-tool access receives only a deliberately made
`bundle`; it cannot execute a repository-local command or gain source access from
the bundle path.

## Automated close-out

`scripts/task-close.mjs` owns deterministic task closure. Its manifest is the
scope authority and always names paths explicitly; it never discovers scope from
a dirty working tree. Start an implementation with `prepare`: its JSON intake
returns each route, QA plan, documentation candidates, map ownership and exact
documentation scope, so no separate `context scope` call is needed.

1. `prepare` records and returns routing, QA selection, documentation candidates,
   exact `docs-scope` output and map ownership in ignored JSON.
2. The agent updates KB prose only when the doc-worthy gate applies, then
   `decide` records `updated` with the edited document or `not-needed` with a
   rationale. This is an agent decision, not a human checkpoint.
3. `verify` runs selected QA, file-map generation for source paths, relevant KB
   validation, agent-configuration validation for skill or entry-contract edits,
   and task-report schema validation into a receipt.
4. `report` can append only after a passing receipt and fills path/domain counts
   from the manifest.

Human involvement is limited to testing that requires a real rendered/device
comparison and the final product pass. Green deterministic checks do not replace
an agent's documentation, coverage, or root-cause judgement.
