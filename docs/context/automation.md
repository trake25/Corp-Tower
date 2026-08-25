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
`route` before analysing closed-cycle rows. The canonical task data is the
append-only `report/task-records.jsonl`, with cycle findings in
`report/task-cycle-reviews.jsonl` and lifecycle state in
`report/task-cycle-state.json`. The Markdown file is generated presentation;
never parse or hand-edit it for metrics.

The gitignored working folders have explicit routes but are not searched as KB
content. `plan/` is where agents look for existing task plans and save new ones;
existing plans are read-only until the user explicitly instructs or approves an
edit. `reference/` is human-managed screen-guide and bug-screenshot material;
humans may upload, modify, or delete those files. Use `route plan/` or `route
reference/` when task context points to either folder. `task/` remains the
location for generated bundles, manifests, receipts, and other ephemeral
handoffs.

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

1. `prepare --model-variant <exact-runtime-id> --r-est <tokens>
   --r-est-basis <plain-English basis>` records the exact model variant,
   pre-read estimate, timestamps, manifest hash and route count before scoped
   retrieval. It also returns routing, QA selection, documentation candidates,
   exact `docs-scope` output and map ownership in ignored JSON. Missing,
   family-only, late, or unavailable values are rejected before work starts.
2. The agent updates KB prose only when the doc-worthy gate applies, then
   `decide` records `updated` with the edited document or `not-needed` with a
   rationale. This is an agent decision, not a human checkpoint.
3. `verify` runs selected QA, file-map generation for source paths, relevant KB
   validation, agent-configuration validation for skill or entry-contract edits,
   and `task-report validate` into a receipt.
4. `report` can append only after a passing receipt. It reads the intake model
   variant, estimate, and verification receipt from the manifest, copies
   path/domain counts, and accepts no end-of-task model override. Values such as
   `GPT-5` or `variant unrecorded` are invalid for standard records.

## Structured task reporting

`node scripts/task-report.mjs start` is the low-level intake writer and requires
the exact model variant; `task-close prepare` is the normal entry point.
`append` requires a passed receipt and reads the exact runtime variant and
pre-read estimate from the manifest. Source-read, total, and main-thread measurements carry `exact`,
`estimated`, or `unavailable` provenance; provider token usage is never inferred
from local tool output.

Use `analyze --from <cycle> --to last-closed --json` for bounded metrics. It
emits counts beside percentages, separates measurement kinds, and marks
unsupported comparisons as `insufficient-data`. `render` regenerates the
Markdown presentation. `validate` checks record schema, uniqueness and order,
receipt linkage, cycle state, legacy warnings, and render freshness.

`import` is the one-time legacy-Markdown migration path. It preserves missing
metadata and warnings, including the Cycle 2 four-versus-six estimate
discrepancy. `close-cycle` accepts exactly twenty receipt-linked standard rows,
writes the review and factual rollup, opens the next cycle, renders once, and
leaves records untouched if validation fails.

Human involvement is limited to testing that requires a real rendered/device
comparison and the final product pass. Green deterministic checks do not replace
an agent's documentation, coverage, or root-cause judgement.

## Authorized Git automation

`node scripts/git-sync-commit-push.mjs` is an opt-in local tool for the complete
Git sync, stage, commit and push sequence. It is load-on-demand: an agent must
have explicit user authorization and pass `--approve`. It reads the task
manifest by default, derives commit keywords from the manifest task title, and
stages only the manifest's `changed_paths`. It fetches the configured `origin`
branch and runs `git pull --ff-only` before staging any local changes, then
pushes the current branch after the commit succeeds. By default the current
branch must be `main`; selecting another branch requires both `--branch` and
`--switch`, and the worktree must be clean before switching.
An explicitly authorized backup publication may use `--push-only` with a local
`--branch` and new `--remote-branch`; that mode fetches `origin/main` and pushes
only the existing local ref, without staging, committing, or switching.

Commit subjects contain no more than three keywords and a version suffix, for
example `Fix Lobby Sync v0.01`. The tool finds the highest matching local
history version and increments it by `0.01`; unrelated keyword groups start at
`v0.01`. It refuses detached HEADs, pre-staged changes, invalid paths, and empty
staging results.
