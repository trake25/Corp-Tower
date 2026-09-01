# Agent automation

This document owns the repository's direct agent retrieval, retained retrieval
experiment and task close-out protocol. Product behavior belongs in its domain
document; this file only owns how agents find bounded evidence and record
completion.

## Direct agent retrieval

`AGENTS.md` owns the normal index-to-doc/map routing and bounded-fallback policy.
After task-owned paths are known, the scope engine deterministically derives
role, documentation, map, QA, validator, and tool intake without reading the
dirty working tree. That post-path scope is independent of exploratory retrieval.

## Retained context experiment

`scripts/context.mjs` is the shared local-tool protocol for Codex, Claude Code,
and local LLM runners, retained for controlled comparison and portable bundles.
It is not the normal repository router. Schema 2 returns repository-relative
provenance, stable result states, exact next commands and provider-visible byte
counts. Its route/search/filter/section/symbol commands read only the KB and
generated maps; they never expose raw source, environment files, secrets or the
working-tree diff. `scope` derives post-path tools, while `bundle` creates the
bounded handoff for a runner without local access.

Gitignored working folders have explicit routes but stay outside KB search.
Private automation artifacts live in `.agent-state/automation/`, telemetry in
`.agent-state/telemetry/`. Sanitized QA receipts are tracked under
`report/qa-receipts/`, which stays outside retrieval unless requested.

Search uses every query token as a required match. A weak narrative match returns
`needs-anchor`; overflow returns `needs-filter`; a strict match returns map
provenance and a bounded source range. An empty anchored search is
`retrieval-defect`. Only that state or `tool-error` permits bounded source
fallback. An ordinary product task records that fallback for a deferred
`repair/` advisory; an explicit retrieval-maintenance task supplies the repair
fixture and benchmark proof. A suggestion loop, invalid target or budget breach
is also a defect.

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
   and returns role, maps, tests and validators. Optional repeated
   `--qa-tooling-path` records planned QA-infrastructure changes.
2. `amend --path ...` owns later files before editing them; new source invalidates
   an existing review. `amend --qa-tooling-path ...` records later planned
   QA-tooling scope.
3. After implementation stabilizes, `update-docs` applies the doc-worthy gate.
   Selected candidate docs are owned with `amend` before editing.
4. `review --changed ...` accepts only owned final paths, recomputes QA and
   candidate docs, and leaves source-changing documentation `pending`.
5. `close --decision <updated|not-needed> --reason ...` records the documentation
   gate; `updated` also repeats each affected `--doc-path`. The same call records
   `--coverage <reused|added|updated|none>` and optional temporary verification,
   runs QA/map/KB/agent-config checks, rejects out-of-scope generated maps, and
   writes a resumable receipt. `publish_paths` unites explicit affected docs and
   content-changed generated paths, never a `repair/` handoff.

Verification is `passed`, `maintenance-blocked`, or `failed`. A maintenance
blocker closes only when every failed step has an approved unrelated
classification; unknown, mixed, and implementation failures remain open. Both
terminal states mean implementation is complete while verification stays
distinct. They add a deterministic `report/qa-receipts/` Markdown receipt to
`publish_paths`; failed attempts retain only private evidence.
The close-out writes one run-scoped handoff only for unresolved blockers or
deferred retrieval, decomposition, and unplanned-QA-infrastructure advisories;
it never deletes another handoff. Each item contains only its
classification/stage, affected component, compact diagnostic and impact,
completed work, and follow-up.
Changed first-party product files near 900 lines produce a decomposition review
advisory and near 1200 lines a strong advisory. Generated/content files, tests,
docs/maps, and load-on-demand `scripts/` automation are excluded.

`fallback --query ... --classification <retrieval-defect|tool-error> --root ...`
records permitted ordinary source fallback and produces one compact advisory
handoff without blocking a pass. Adding `--fixture ...` marks task-owned
retrieval maintenance; close-out then requires that fixture and a passing
retrieval benchmark. Schema 2 uses
`prepare → review → close`.

Child output enters only the private receipt. The public receipt allowlists task
identity, scopes, compact steps, QA decisions and maintenance; it omits raw
output, telemetry, sessions and private artifacts. A pass prints one line, a
maintenance block names its handoff, and a failure names the step, diagnostic
and private receipt. Identical close inputs reuse the identity and receipts.

`scripts/agent-observability.mjs` owns private task events, evidence, candidates,
flags, settlement, analysis and approved export under
`.agent-state/telemetry/v2/`. Task-close is its default adapter: `prepare` derives
complexity from owned source breadth and binds the Codex session; `close` records
verification and returns candidates. Without a live session binding, the task
stays pending and is excluded from weekly reports instead of being finalized
without a terminal event.

Telemetry records implementation, task QA, documentation, maps/retrieval,
close-out, and maintenance-blocker outcomes separately. A maintenance-blocked
task is implementation-complete with partial verification, not an implementation
failure.

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
One correctly handled maintenance failure is not a workflow-inefficiency
candidate; retries, repeated verification, repeated recovery, rework, or
retrieval expansion are the relevant evidence.
Private reports stay local; only `export-public --approve` writes rounded,
cohort-suppressed output.

## Authorized Git automation

`node scripts/git-sync-commit-push.mjs` is an opt-in local tool for the complete
Git sync, stage, commit and push sequence. It is load-on-demand: an agent must
have explicit user authorization, pass `--approve`, and name a closed manifest.
Passed schema-2 manifests are publishable; `maintenance-blocked` also requires
its persisted identity and existing public receipt in `publish_paths`. Failed or
open manifests remain ineligible.
Schema-1 manifests retain the explicit `changed_paths` fallback. The tool
fetches the configured `origin` branch and runs `git pull --ff-only` before
staging any local changes, then
pushes the current branch after the commit succeeds. By default the current
branch must be `main`; selecting another branch requires both `--branch` and
`--switch`, and the worktree must be clean before switching.
An explicitly authorized backup publication may use `--push-only` with a local
`--branch` and new `--remote-branch`; that mode fetches `origin/main` and pushes
only the existing local ref, without staging, committing, or switching.

Task-close persists a three-keyword/version identity shared by the receipt and
Git subject. It advances one hundredth above matching receipts and history; new
groups start at `v0.01`. Git sync reuses it and falls back for legacy passing
manifests. It refuses detached HEADs, pre-staged changes, invalid paths, and
empty staging results.
