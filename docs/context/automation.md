# Agent automation

This document records retained automation mechanics and task close-out. The
ChatGPT/Codex contextualization contract lives in KB Tree; product behavior
belongs in its domain document.

## Direct agent retrieval

`policy/AGENTS.md` owns the ChatGPT/Codex route. After task-owned paths are
known, deterministic tooling derives documentation, map, QA, validator, and
tool intake without reading the dirty working tree. That post-path scope is
independent of contextualization.

## KB Tree retrieval

`scripts/context.mjs` is the local KB Tree concept protocol and portable-bundle
producer. Its concept commands return repository-relative provenance, stable
failure states, exact next commands, and bounded source grants without exposing
environment files, secrets, or a working-tree diff.

`KB/` is the production ChatGPT/Codex knowledge root. `concept-route`,
`concept-read`, and `concept-bundle` resolve one exact ID or normalized alias,
return explicit adjacency without traversing it, and fail closed without
repository fallback. `build-concept-map.mjs` derives the router and maps;
`validate-concept-kb.mjs` checks metadata, source grants, isolation, generated
equality, and capacity. The focused benchmark preserves correctness/fail-closed
assertions and writes sanitized local footprint metrics.

`export-kb-calibration-report.mjs` is the sole manual path from the latest valid
private snapshot to a sanitized, collision-safe version under
`report/benchmarks/kb-context/`. QA, task-close, and the benchmark never invoke
the exporter. Private snapshots and public reports contain no source text and
remain non-context review data rather than KB authority.

Gitignored working folders have explicit routes but stay outside KB search.
All `.agent-state/**` content is ignored private machine state and cannot be a
publication path or KB dependency. Sanitized QA receipts are tracked separately
under `report/qa-receipts/`, which stays outside retrieval unless requested.

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
Non-intrinsic anchor promotion uses an explicit reference corpus: KB Tree data,
concept fixtures/tests, private state, and reports cannot promote a primary
locator anchor, while eligible tooling files may still receive ordinary
`map/infra.md` coverage.

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
explicit scope authority; it never discovers scope from a dirty tree. New
schema-2 manifests use unique paths under
`.agent-state/automation/task-close/`; their raw receipts remain beside them as
private state. Later lifecycle commands require that exact returned manifest
path, and legacy schema-2 paths remain valid only within `.agent-state/`.
Schema 2 separates authorized ownership from final changes and keeps detail in
artifacts.

`prepare` owns paths, planned QA tooling and an optional active plan before edits;
`amend` adds later ownership. `review` accepts only owned final changes and
recomputes QA/docs. `close` records documentation and coverage decisions,
verifies the reviewed set, then archives a bound plan.

Close-out runs selected protocol checks and QA, regenerates affected maps, and
validates KB Tree. Concept-KB paths add their generator, validator, focused
tests, and benchmark without adding game runtime QA. Child detail stays private
and out-of-scope generated maps fail. Task-close does not synchronize skills or
derive `.claude/skills/**` publication paths.

Whole-file and aggregate soft prose capacity, historical/file-count map capacity,
and 95% pressure warn. Hard section or KB-wide prose overflow stays task-owned
`compaction-required` work until the smallest safe compaction passes. Only map
density overflow is capacity-related `validator-maintenance`; semantic defects
such as broken links, citations, coverage, targets and long lines remain hard.

Verification is `passed`, `maintenance-blocked`, or `failed`; maintenance closes
only when every failure has an approved unrelated classification. Other failures,
including `compaction-required`, keep the plan active and publication scope
closed. A bound plan moves only after verification. Archive failure preserves
proof for an idempotent move retry. Receipts separate verification, closure and
sanitized plan paths, and failed-step summaries carry the first blocker and its
classification. Run-scoped handoffs cover unresolved maintenance or deferred
retrieval, decomposition and unplanned-QA advisories without deleting others.
Changed first-party product files near 900 lines produce a decomposition review
advisory and near 1200 lines a strong advisory. Generated/content files, tests,
docs/maps, and load-on-demand `scripts/` automation are excluded.

`fallback` records permitted source fallback as a nonblocking advisory; a named
fixture makes it task-owned retrieval maintenance and requires its benchmark.
Schema 2 uses `prepare → review → close`. Public receipts allowlist identity,
scope, compact steps, QA and maintenance; raw child output remains private.
Identical close inputs reuse identity and receipts.

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
