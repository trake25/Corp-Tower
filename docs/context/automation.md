# Agent automation

This document owns the repository's deterministic retrieval and task close-out
protocol. Product behavior belongs in its domain document; this file only owns
how agents find bounded evidence and record completion.

## Context protocol

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners. Schema 2 returns repository-relative provenance, stable
result states, exact next commands and provider-visible byte counts. Search reads
only the KB and generated maps; it never exposes raw source, environment files,
secrets or the working-tree diff.

| Command | Role |
|---|---|
| `route <area-or-path>` | selects skill, docs, map and bounded source-read strategy |
| `search <query> [--anchor]` | ranks strict KB/map matches; `--anchor` confirms a canonical retry |
| `filter <query> ...` | narrows a fresh deterministic search by area, kind, path or required term |
| `outline` / `section` / `symbol` | reads one known KB structure, section or generated-map row set |
| `scope <task-owned-path>...` | returns routes, docs, maps, QA and exact verification tools for explicit paths |
| `bundle <task>` | writes selected KB/map evidence to ignored `.agent-state/automation/` state |

Gitignored working folders have routes but are excluded from KB search.
`plan/` stores task plans; existing plans are read-only without explicit user
approval, and only verified closed plans move to `plan/done/`. `reference/` holds
human-managed screen and bug references. Use `route plan/` or
`route reference/` for either folder. Bundles, manifests, receipts and retrieval
benchmarks belong under ignored `.agent-state/automation/`; private telemetry
belongs under ignored `.agent-state/telemetry/`. All `report/**` paths are
excluded from retrieval and indexing unless their owning tool or the user asks.

Search uses every query token as a required match. A weak narrative match returns
`needs-anchor` with at most three exact retries and no evidence; overflow returns
`needs-filter` with a direct section/symbol read and exact filter commands.
`matched` evidence exposes map provenance plus a structured candidate source
path, line and bounded `sed` range. An empty `search --anchor` returns
`retrieval-defect`. Only `retrieval-defect` and `tool-error` allow source
fallback; unfamiliar syntax, `needs-anchor` and `needs-filter` do not. Search the
smallest routed root first, record a real fallback through `task-close fallback`,
and add a passing benchmark fixture with the route, map purpose or alias repair.
A suggestion loop, invalid source target or budget breach is also a retrieval
defect even when the process exits zero.

Generated maps keep one authored purpose per file and only stable navigation
anchors. An exceptional cross-boundary term that extraction cannot recognize may
be marked `· stable`; regeneration relocates it by name and drops it if the source
term disappears. Maps do not explain local symbols—the bounded source read does.

Public retrieval and task intake are bounded; larger route detail stays in
ignored artifacts, and search excerpts are opt-in. `retrieval-aliases.json` is a
small fixture-proven vocabulary bridge that lets an explicit anchor resolve to a
curated sibling, not a tag index. An authored stable pin promotes an already
extracted internal helper so regeneration cannot discard the repair. The
`context-retrieval.json` fixture owns protocol correctness while
`benchmark-rag.mjs` keeps non-check output under ignored
`.agent-state/automation/rag-benchmark/`.

Cloud coding agents use the same command through a read-only tool adapter. A
cloud chat session without local-tool access receives only a deliberately made
`bundle`; it cannot execute a repository-local command or gain source access from
the bundle path.

## Automated close-out

`scripts/task-close.mjs` owns deterministic task closure. Its manifest is the
scope authority and always names paths explicitly; it never discovers scope from
a dirty working tree. Schema 2 separates authorized ownership from the final
change set while keeping detailed output in local artifacts.

1. `prepare --task ... --path ...` records `owned_paths` after bounded retrieval
   and before the first edit, then returns roles, docs, maps, tests and validators.
2. `amend --path ...` owns a later-discovered file before its edit. Adding source
   after review invalidates review; adding a reviewed candidate doc preserves the
   source review.
3. `review --changed ...` records only the explicit final authored/source paths,
   recomputes QA, and runs `docs-scope` after edits so it can return the exact KB
   ranges made falsifiable by the diff. No Git working-tree discovery supplies
   path scope.
4. Apply the doc-worthy gate, own each selected candidate doc through `amend`,
   edit only its returned ranges, and decide separately whether the completed
   change deserves durable regression coverage.
5. Run `close --decision <updated|not-needed> --reason ... [--doc-path ...]
   --coverage <updated|not-needed> --coverage-reason ...`. The coverage decision
   does not select QA; final paths still select every task's checks.
6. `close` validates both decisions, runs QA/map/KB/agent-config checks, detects
   generated maps by before/after content hash, rejects out-of-scope map output,
   and writes a resumable receipt. `publish_paths` is the union of explicit
   changes, documented paths and content-changed generated maps.

`fallback --query ... --classification <retrieval-defect|tool-error> --root ...
--fixture ...` records permitted source fallback. Closeout requires the named
fixture and a passing retrieval benchmark. Schema 2 uses
`prepare → review → close`.

Child output is captured in a private ignored log before entering the receipt,
preserving diagnostics on hosts that swallow nested pipes. A passing close prints
one line; a failure names the step, exit/signal, first diagnostic and receipt.
Identical close inputs reuse the passing receipt.

`scripts/agent-observability.mjs` owns private task events, evidence, candidates,
flags, settlement, analysis and approved export under
`.agent-state/telemetry/v2/`. Task-close is its default adapter: `prepare` derives
complexity from owned source breadth and binds the Codex session; `close` records
verification and returns candidates. Without a live session binding, the task
stays pending and is excluded from weekly reports instead of being finalized
without a terminal event.

Trusted `.codex/hooks.json` handlers retain only model/effort provenance and
bounded tool, compaction and lifecycle outcomes. `SessionStart` writes an idle
heartbeat, every later event refreshes hook health, and a degraded write surfaces
a bounded warning while leaving the binding available for a later settlement
attempt. They never retain prompt, response, command, patch, tool payload or
transcript content. Review hooks through `/hooks` when Codex asks and again after
their definition changes; ordinary tasks need no separate hook command.

Context CLI calls become operation/status evidence. Task-close derives
retrieval attempts, filter expansions and first-try success from them, never
fixed defaults.

Exact totals require stable disjoint IDs, settled inclusive root/child/retry
usage and a terminal host event; observability usage remains a non-additive
subset. At `Stop`, the Codex adapter scans only session metadata, task boundaries
and token counters, subtracts the root session's earlier-task baseline, and
includes descendant sessions once through their parent identity. It never reads
message or tool content. Missing rollout usage is partial with
`codex_rollout_usage_unavailable`, never a fabricated zero.
Finalization writes the weekly report, and an idempotent repeat regenerates it
from settled records. Candidate and formal flags are grouped by fingerprint and
unique task; a later observation reopens a validated change. The same active agent may
formalize an eligible current-run, high-effort candidate before its final
response; no extra agent or provider turn is created. Private weekly reports
stay local; only `export-public --approve` writes the rounded,
cohort-suppressed public report.

## Authorized Git automation

`node scripts/git-sync-commit-push.mjs` is an opt-in local tool for the complete
Git sync, stage, commit and push sequence. It is load-on-demand: an agent must
have explicit user authorization, pass `--approve`, and name its passing
close-out receipt with `--manifest`. It derives commit keywords from the
manifest task title and requires a passing closed schema-2 manifest before
staging its `publish_paths`.
Schema-1 manifests retain the explicit `changed_paths` fallback. It fetches the configured `origin`
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
