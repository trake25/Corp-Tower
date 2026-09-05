# Agent Automation

Scope: bounded repository retrieval, deterministic task close-out, KB Tree automation, agent observability, and explicitly authorized Git publication. Product behavior remains in product-domain concepts.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#Route
source: policy/CODEX.md#KB retrieval transport
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

KB Tree is the sole semantic repository-context corpus. The model selects one exact concept or alias for each new information
need; retrieval transport does not make that semantic choice. Codex prefers
local deterministic concept retrieval, while ChatGPT uses exact connector reads.
Both receive the same owning prose, generated map, and granted-source envelope.
Already-valid evidence is reused, and repository-wide exploration is not ordinary
context.

<!-- kb
id: automation.retrieval.protocol
alias: context.mjs
alias: context query
source: scripts/context.mjs#main
source: scripts/lib/context-query.mjs#conceptRoute
source: scripts/lib/context-query.mjs#conceptRead
source: scripts/lib/context-query.mjs#conceptTextLines
source: scripts/lib/context-query.mjs#conceptBundle
adjacent: testing.automation.protocol
-->
## Concept retrieval protocol

`scripts/context.mjs` is Codex's preferred local implementation of the KB Tree
route, read, and bundle protocol. Its only commands are `concept-route`,
`concept-read`, and `concept-bundle`; each accepts an exact ID or normalized
alias but does not select a concept. `concept-read` returns the owning prose leaf
with bounded source grants and unloaded adjacency. Resolution never turns
adjacency into an implicit next read.

<!-- kb
id: automation.retrieval.states
alias: needs-anchor
alias: needs-filter
alias: retrieval-defect
source: scripts/lib/context-query.mjs#conceptRoute
-->
## Retrieval result states

KB Tree returns closed, reason-bearing identity, section, source, map, budget,
access, and tool failures. A missing route is a retrieval defect, not permission
to widen into uncontrolled source search.

<!-- kb
id: automation.retrieval.aliases
alias: retrieval-aliases.json
source: scripts/lib/concept-kb.mjs#conceptForInput
-->
## Retrieval aliases

Aliases exist only to resolve demonstrated naming mismatches and are authored
beside their one owning concept. Exact canonical IDs remain the preferred route.

<!-- kb
id: automation.retrieval.fallback
alias: source fallback
alias: broad fallback
source: scripts/lib/context-query.mjs#conceptRoute
source: policy/CODEX.md#KB retrieval transport
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

Ordinary retrieval fails closed: a confirmed KB Tree/tooling defect is not
permission to replace granted evidence with repository search. After exact KB
and transport attempts fail, ChatGPT alone may broaden search solely to identify
and report that defect; sources found there are not ordinary task authority until
the KB route is repaired or explicitly re-established. Codex retries only the
same exact manual route, then reports the defect.

<!-- kb
id: automation.retrieval.bundle
alias: context bundle
source: scripts/lib/context-query.mjs#conceptBundle
-->
## Context bundles

A context bundle is a bounded handoff for environments without direct local-tool access. It contains selected evidence/provenance under explicit byte limits and never grants filesystem capabilities beyond what was deliberately included.

<!-- kb
id: automation.execution.io-discipline
alias: provider-visible I/O
alias: Codex I/O discipline
source: policy/CODEX.md#Provider-visible I/O discipline
source: scripts/task-close.mjs#compactOutput
source: scripts/qa-gate.mjs#fail
adjacent: automation.observability.usage
-->
## Provider-visible I/O discipline

Codex minimizes provider-visible I/O rather than execution evidence. Once an exact
evidence boundary is known it prefers bounded reads, task-scoped change
summaries, relevant hunks, and progressive failure diagnostics instead of whole
files, full repository diffs, deleted bodies, generated churn, or raw successful
logs. Existing deterministic QA and close-out wrappers keep detailed diagnostics
private while exposing compact results.

Completion handoffs report implementation, verification, public receipt, and
blockers without narrating tool history. Failure evidence expands only as
correctness requires, so efficiency never becomes a hard cap that can hide a
conflict, authorization need, failed check, or safety condition. Usage or
efficiency telemetry remains exact-or-unavailable; this discipline does not
authorize prompt, response, command, patch, diff, or transcript capture merely
to measure savings.

<!-- kb
id: automation.orchestration.execution
alias: orchestrated execution
alias: multi-agent implementation
source: policy/PLANNER.md#Execution mode planning
source: policy/CODEX.md#Orchestration execution
source: policy/REVIEWER.md#Integrated QA
adjacent: automation.orchestration.ownership
adjacent: automation.task-close.lifecycle
-->
## Orchestrated execution

Large tasks use orchestration only when semantic decomposition reduces context
reconstruction or integration risk enough to justify coordination overhead.
Planner owns single-run versus orchestrated routing and model/effort
recommendations; the orchestrator validates executable decomposition against
current repository evidence, establishes shared contracts, delegates bounded
worker context, and integrates the parent result. The parent plan remains the
behavior authority. Scoped repair returns to the same worker when practical;
cross-worker failures remain orchestrator-owned until responsibility is
resolved. Worker transcripts are not parent integration context.

<!-- kb
id: automation.orchestration.ownership
alias: worker scope
alias: parallel ownership
source: policy/CODEX.md#Orchestration execution
source: scripts/lib/orchestration-scope.mjs#claimWorkerScope
source: scripts/lib/orchestration-scope.mjs#finalizeOrchestrationScope
adjacent: automation.orchestration.execution
adjacent: automation.task-close.scope
-->
## Orchestration ownership

Parallel workers may share read evidence but may not hold overlapping write
ownership. The orchestrator claims explicit worker paths from the parent task
scope before concurrent writers run; deterministic tooling rejects sibling
overlap and never derives ownership from the dirty tree. Shared writable paths
use one owner or serialized execution. A worker cannot expand across another
active claim; new write dependencies return to the orchestrator. Worker claims
are subordinate execution locks rather than independent task closure, and
released private orchestration state is cleaned before the parent task closes.

<!-- kb
id: automation.task-close.lifecycle
alias: task close
alias: task-close
source: scripts/task-close.mjs#main
adjacent: automation.task-close.scope
adjacent: automation.task-close.receipt
-->
## Task-close lifecycle

`task-close` is deterministic repository closure around explicit task-owned paths. Schema-2 flow is `prepare → review → close`, with `amend` adding later ownership. Scope is never discovered from the dirty working tree.

<!-- kb
id: automation.task-close.scope
alias: task manifest
alias: owned paths
source: scripts/task-close.mjs#createManifest
source: scripts/task-close.mjs#taskCloseIntake
adjacent: automation.orchestration.ownership
-->
## Task-close scope

Prepare owns explicit paths, planned QA tooling, and an optional active plan
before edits. Review accepts only owned final changes and recomputes
deterministic QA and documentation candidates. Close records
documentation/coverage decisions and verifies the reviewed set. For
orchestrated execution, one parent manifest owns the integrated path union;
worker write claims are subordinate execution locks and never become independent
closure authority.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#verifyV2
adjacent: testing.selection.local
-->
## Task-close verification

Close-out runs selected QA checks and keeps detailed child output out of public
scope. Authored KB or retrieval-tooling changes use the full concept-map,
concept-KB, and retrieval-benchmark path. An ordinary changed source that is
granted by one or more KB Tree concepts deterministically carries its affected
concept map as generated output and receives concept-map plus concept-KB
freshness verification, without inheriting the retrieval benchmark solely
because locator lines moved.

Task-caused stale maps, broken source grants, or verification failures remain open; only approved unrelated maintenance blockers can produce a maintenance-blocked closure.

<!-- kb
id: automation.task-close.receipt
alias: qa receipt
alias: public receipt
source: scripts/task-close.mjs#finishVerification
-->
## Public receipt

Public QA receipts expose sanitized task identity, owned scope, compact verification outcomes, and maintenance classification without publishing raw private child output. Implementation completion and verification status remain separately representable.

<!-- kb
id: automation.task-close.plan-archive
alias: plan done
alias: archive plan
source: scripts/task-close.mjs#archivePlan
-->
## Plan archival

A bound active plan moves to completed history only after successful lifecycle closure. Archive failure preserves proof for an idempotent retry rather than pretending closure succeeded.

<!-- kb
id: automation.docs.maps
alias: concept map generator
source: scripts/build-concept-map.mjs#buildConceptMaps
adjacent: automation.docs.validation
-->
## Map regeneration

The concept generator is the only map architecture. It derives KB Tree domain maps and the marked concept router
from authored concept metadata and bounded source grants. Generated output is
locator evidence, never an authored replacement for concept prose.

<!-- kb
id: automation.docs.validation
alias: concept KB validator
alias: KB validator
source: scripts/validate-concept-kb.mjs#validateConceptKb
source: scripts/lib/concept-kb.mjs#conceptProseCapacity
-->
## KB validation

The KB Tree validator protects concept identity, aliases, leaf ownership,
adjacency, exact source anchors, isolation, generated equality, and its capacity
model. Advisory bands are calibration signals; only prose beyond the
2,500-estimated-token ceiling or the 400-character line ceiling is a capacity
error.

<!-- kb
id: automation.docs.scope
alias: source concept ownership
alias: documentation ownership
source: scripts/lib/concept-kb.mjs#loadConceptRegistry
-->
## Docs scoping

The concept registry derives the sole reverse source-to-concept index for deterministic
tooling. Durable-current-contract changes belong to their smallest owning concept;
task history and working material never become KB Tree prose.

<!-- kb
id: automation.docs.retrieval-repair
alias: retrieval maintenance
source: scripts/lib/context-query.mjs#conceptRoute
adjacent: automation.retrieval.fallback
-->
## Retrieval repair

Retrieval/map defects discovered during unrelated product work are maintenance findings, not permission to broaden that product task. An explicit retrieval-maintenance task may repair concept metadata, generated routes/maps, validators, fixtures, or benchmark expectations.

<!-- kb
id: automation.observability.binding
alias: agent observability
alias: task binding
source: scripts/lib/agent-observability/state.mjs#bindActiveTask
source: scripts/codex-observability-hook.mjs#handleHook
source: scripts/task-close.mjs#closeObservabilityUnsafe
-->
## Observability binding

Agent observability binds task/session identity and records only bounded categories,
outcomes, and opaque identifiers, never prompts, responses, patches, commands, or
transcript contents. Hooks are best-effort: they record health when possible and
cannot alter task execution, QA, or receipt correctness. Stop performs normal
settlement; SessionEnd remains a cheap health fallback. Without a live session
binding, a task remains pending rather than being finalized with fabricated
terminal evidence.

<!-- kb
id: automation.observability.usage
alias: provider tokens
alias: rollout usage
source: scripts/lib/agent-observability/usage.mjs#aggregateUsage
source: scripts/lib/agent-observability/codex-rollout.mjs#codexRolloutUsage
source: scripts/lib/agent-observability/task-telemetry.mjs#buildTaskTelemetry
source: scripts/lib/agent-observability/schema.mjs#sanitizeTelemetry
source: scripts/lib/agent-observability/analytics.mjs#optionalFlaggingOverhead
source: scripts/agent-observability.mjs#executeCommand
source: scripts/lib/agent-observability/report.mjs#displayStageGroups
-->
## Observability usage

Usage accounting relies on stable disjoint identifiers and terminal evidence. Stop
first validates and reads the current supplied rollout, then uses only the
narrowest related child discovery; bounded inventory is fallback-only. Missing
exact usage is partial/unavailable, never a fabricated zero. Task telemetry
derives concept retries, verification and rework only from retained outcomes;
optional workflow-review cost is measured as bounded handoff/material bytes and
count, with attributable provider tokens absent unless exactly observable.

<!-- kb
id: automation.observability.flags
alias: workflow candidate
alias: inefficiency flag
source: scripts/lib/agent-observability/flagging.mjs#flagEligibility
source: scripts/lib/agent-observability/runtime.mjs#modelFamily
source: scripts/lib/agent-observability/flagging.mjs#createFormalFlag
source: scripts/agent-observability.mjs#executeCommand
-->
## Workflow inefficiency flags

Deterministic tooling creates a workflow candidate and its eligibility gate.
An eligible same-turn model assessment becomes a formal `WF-*` flag through the
deterministic flag command; its evidence must belong to the current task and its
provider-visible material remains bounded. Astra retains the approved-family,
high-or-higher effort, current-turn, task-evidence, and 1.5 KiB material gate.
When there is no eligible candidate, Codex loads no flagging context and records
no formal flag. Public QA receipt correctness remains independent of candidate
and hook health.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#requireManifest
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid branch/scope/staging states rather than silently widening publication.
