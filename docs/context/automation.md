# Agent automation

This document owns the repository's direct agent retrieval, retained retrieval
experiment and task close-out protocol. Product behavior belongs in its domain
document; this file only owns how agents find bounded evidence and record
completion.

## Direct agent retrieval

Normal repository work starts at `docs/context/index.md` or
`site/docs/index.md`. The selected row names one owning document and, where
needed, one generated map. Search those named files directly with `rg`, starting
from one stable product anchor and adding a path or second term only when the
result is noisy. Read the smallest matching document section and map row, then a
bounded source range around the returned path and line. Do not sweep every KB
document or load a generated map whole.

When a map cannot identify the source, search only the smallest root owned by
the active role. A missing or stale router row, map purpose, source target or KB
contract is repaired in the same task under `docs-steward`. After explicit
task-owned paths are known, task-close still supplies the deterministic role,
documentation, QA and validator intake; that post-path scope is independent of
exploratory retrieval.

## Retained context experiment

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners, retained for controlled comparison and portable bundles.
It is not the normal repository router. Schema 2 returns repository-relative
provenance, stable result states, exact next commands and provider-visible byte
counts. Its route/search/filter/section/symbol commands read only the KB and
generated maps; they never expose raw source, environment files, secrets or the
working-tree diff. `scope` derives post-path tools, while `bundle` creates the
bounded handoff for a runner without local access.

Gitignored working folders have routes but are excluded from KB search.
`plan/` stores task plans; existing plans are read-only without explicit user
approval, and only verified closed plans move to `plan/done/`. `reference/` holds
human-managed screen and bug references. Bundles, manifests, receipts and
retrieval benchmarks belong under ignored `.agent-state/automation/`; private
telemetry belongs under ignored `.agent-state/telemetry/`. All `report/**` paths
are excluded from retrieval and indexing unless their owning tool or the user
asks.

Search uses every query token as a required match. A weak narrative match returns
`needs-anchor`; overflow returns `needs-filter`; a strict match returns map
provenance and a bounded source range. An empty anchored search is
`retrieval-defect`. Only that state or `tool-error` permits bounded source
fallback, which must be recorded with a passing repair fixture. A suggestion
loop, invalid target or budget breach is also a defect.

Generated maps keep one authored purpose per file and only stable navigation
anchors. An exceptional cross-boundary term that extraction cannot recognize may
be marked `· stable`; regeneration relocates it by name and drops it if the source
term disappears. Maps do not explain local symbols—the bounded source read does.

Public output is bounded; larger route detail stays in ignored artifacts and
search excerpts are opt-in. Fixture-proven aliases bridge only demonstrated
vocabulary mismatches, and stable pins preserve exceptional map anchors.
`context-retrieval.json` owns protocol behavior; benchmark detail stays under
ignored `.agent-state/automation/rag-benchmark/`.

Cloud coding agents use the same command through a read-only tool adapter. A
cloud chat session without local-tool access receives only a deliberately made
`bundle`; it cannot execute a repository-local command or gain source access from
the bundle path.

## Automated close-out

`scripts/task-close.mjs` owns deterministic task closure. Its manifest is the
scope authority and always names paths explicitly; it never discovers scope from
a dirty working tree. Schema 2 separates authorized ownership from the final
change set while keeping detailed output in local artifacts.

1. `prepare --task ... --path ...` owns explicit paths before their first edit
   and returns the role, docs, maps, tests and validators.
2. `amend --path ...` owns later files before editing them; new source invalidates
   an existing review, while an already reviewed candidate doc does not.
3. `review --changed ...` accepts only owned final paths, recomputes QA and runs
   `docs-scope` against the completed edits. Git working-tree discovery never
   supplies scope.
4. After the separate documentation and durable-coverage decisions, `close`
   runs QA/map/KB/agent-config checks, rejects out-of-scope generated maps and
   writes a resumable receipt. `publish_paths` unites explicit, documented and
   content-changed generated paths.

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
bounded outcome or phase codes. `SessionStart` writes an idle heartbeat; degraded
writes warn without losing the binding. Hooks never retain prompt, response,
command, patch, tool payload or transcript content. Review them through `/hooks`
when Codex asks or their definition changes.

Task-close derives retrieval metrics from outcome codes, never defaults. Known
edit, check, documentation and close-out commands set phase boundaries before
hook payloads are discarded. Read-only shell commands count as context and
research; unclassified shell work is `other` rather than inheriting the prior
stage, so work after a check does not inflate verification.

Exact totals require stable disjoint IDs, settled inclusive root/child/retry
usage and a terminal host event; observability usage remains a non-additive
subset. At `Stop`, the Codex adapter scans only session metadata, task boundaries
and cumulative counters, turns increases and resets into exact response deltas,
and includes each descendant once by parent identity. It never reads message or
tool content. Missing rollout usage is partial with
`codex_rollout_usage_unavailable`, never a fabricated zero.
Finalization writes a human-labelled weekly report from settled records. Flags
group by fingerprint and unique task; a later observation reopens a validated
change. The same active agent may formalize an eligible current-run, high-effort
candidate before its final response without another agent or provider turn.
Private reports stay local; only `export-public --approve` writes rounded,
cohort-suppressed output.

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
