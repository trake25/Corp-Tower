# Agent Automation

Scope: bounded repository retrieval, Planner-to-Codex execution handoff, standalone compatibility
tooling for older task lifecycles, KB Tree automation, agent observability, and explicitly authorized Git publication.
Product behavior remains in product-domain concepts.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#Codex universal policy
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.planning.phase2
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

ChatGPT Planner performs semantic repository-context selection while planning. The Phase 2 plan
gives Codex compacted KB context, bounded source context, and exact KB retrieval inputs for deeper
detail if implementation needs it. Codex normally consumes that handoff instead of rediscovering
context. When deeper context is required, it starts from the plan's exact concept ID or alias and
uses bounded retrieval. ChatGPT uses exact connector reads while planning. Repository-wide
exploration is not ordinary task context.

<!-- kb
id: automation.planning.phase2
alias: phase 2 execution handoff
alias: execution-oriented plan
source: policy/PLANNER.md#Policy selection
source: policy/PLANNER.md#Defaults and selected policy
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/CODEX.md#Agent-supported repository process defaults
adjacent: automation.retrieval.direct
adjacent: automation.orchestration.execution
adjacent: automation.task-close.process-controls
-->
## Phase 2 execution handoff

Phase 2 is Codex's self-contained task execution contract. Planner compiles the approved intended
behavior, only task policy selected for this implementation, compacted KB context already resolved
during planning, exact retrieval inputs for optional deeper detail, bounded source context, expected
write scope, ordered implementation requirements, minimum verification, and done criteria.

The execution architecture has three layers: `AGENTS.md` contains only universal Codex policy; the
Phase 2 plan contains only task-selected policy; the KB/source handoff contains domain and task-scope
knowledge. Runtime skills are not an authority layer.

Default-OFF agent-supported processes are absent from the plan and Codex runtime context. Planner
includes an optional process or execution policy only when it is enabled or otherwise materially
selected for the task. Normal single-run execution is implicit. Plan archival remains enabled by
default as a deterministic completion mechanic rather than universal process-policy prose.

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

`scripts/context.mjs` is Codex's preferred local implementation of the KB Tree route, read, and
bundle protocol when a plan-selected retrieval input needs deeper detail. Its only commands are
`concept-route`, `concept-read`, and `concept-bundle`; each accepts an exact ID or normalized alias
but does not select a concept. `concept-read` returns the owning prose leaf with bounded source
grants and unloaded adjacency. Resolution never turns adjacency into an implicit next read.

<!-- kb
id: automation.retrieval.states
alias: needs-anchor
alias: needs-filter
alias: retrieval-defect
source: scripts/lib/context-query.mjs#conceptRoute
-->
## Retrieval result states

KB Tree returns closed, reason-bearing identity, section, source, map, budget, access, and tool
failures. A missing route is a retrieval defect, not permission to widen into uncontrolled source
search.

<!-- kb
id: automation.retrieval.aliases
alias: retrieval-aliases.json
source: scripts/lib/concept-kb.mjs#conceptForInput
-->
## Retrieval aliases

Aliases exist only to resolve demonstrated naming mismatches and are authored beside their one
owning concept. Exact canonical IDs remain the preferred route.

<!-- kb
id: automation.retrieval.fallback
alias: source fallback
alias: broad fallback
source: scripts/lib/context-query.mjs#conceptRoute
source: AGENTS.md#Codex universal policy
source: policy/CHATGPT.md#KB retrieval transport
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

Ordinary retrieval fails closed. Codex starts from the exact retrieval input supplied by the plan;
an unavailable or defective exact route is not permission to rediscover context through broad
repository search. If no valid bounded fallback can establish authority, Codex reports the retrieval
defect. ChatGPT alone may broaden search after exact KB and transport attempts fail, solely to
diagnose and report the defect; evidence found there is not ordinary task authority until the KB
route is repaired or explicitly re-established.

<!-- kb
id: automation.retrieval.bundle
alias: context bundle
source: scripts/lib/context-query.mjs#conceptBundle
-->
## Context bundles

A context bundle is a bounded handoff for environments without direct local-tool access. It contains
selected evidence/provenance under explicit byte limits and never grants filesystem capabilities
beyond what was deliberately included.

<!-- kb
id: automation.execution.io-discipline
alias: provider-visible I/O
alias: Codex I/O discipline
source: AGENTS.md#Codex universal policy
source: scripts/task-close.mjs#compactOutput
source: scripts/qa-gate.mjs#fail
adjacent: automation.observability.usage
-->
## Provider-visible I/O discipline

Codex minimizes provider-visible I/O rather than execution evidence. The universal execution kernel
uses the smallest bounded reads and compact tool outputs that preserve correctness, reuses exact
current evidence, and expands diagnostics only when a compact failure result is insufficient for the
next repair decision.

Plan-selected KB retrieval is demand-driven. Codex starts from the compacted KB/source handoff and
uses an exact plan-supplied retrieval input only when deeper detail is materially required. It does
not rediscover policy, domain context, optional processes, or repository structure already supplied
by Planner.

Detailed deterministic logs/state remain private. Selected task tooling keeps compact success output
and progressively bounded failure evidence. Efficiency never hides a conflict, failed required
check, authorization need, safety condition, or correctness evidence.

<!-- kb
id: automation.task-ownership.lifecycle
alias: task ownership
alias: lightweight ownership
alias: ownership scope
source: scripts/lib/task-ownership.mjs#resolveTaskOwnership
source: scripts/task-ownership.mjs#main
adjacent: automation.orchestration.ownership
adjacent: automation.task-close.scope
-->
## Task ownership

Task ownership is a standalone lightweight write-scope compatibility utility independent from
task-close. It remains available for valid plans/manifests that already selected it: those tasks
acquire one explicit parent scope from planned task paths before edits, may amend that scope only for
a proven direct dependency, and release it after integrated completion. Current Planner policy does
not route task ownership as an agent-supported process.

Ownership authority never comes from the dirty working tree. Active compatibility claims reject
provable incompatible overlap and keep private state under `.agent-state`. Parent ownership release
fails closed while subordinate orchestration worker claims remain active. Without a valid existing
ownership contract, no ownership lifecycle is inferred from orchestration or dirty-tree state.

<!-- kb
id: automation.orchestration.execution
alias: orchestrated execution
alias: multi-agent implementation
source: policy/PLANNER.md#Execution-shape planning
source: policy/CODEX.md#Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria.
source: policy/REVIEWER.md#Integrated QA
adjacent: automation.planning.phase2
adjacent: automation.orchestration.ownership
adjacent: automation.task-close.lifecycle
-->
## Orchestrated execution

Normal execution is a single Codex run and carries no orchestration policy. Planner selects
ORCHESTRATED only when semantic decomposition materially reduces context reconstruction or
integration risk, then compiles only the required orchestration rules into the Phase 2 plan.

The parent plan remains behavior authority. It defines worker responsibilities, dependencies,
shared invariants, planned non-overlapping write responsibilities, dependency-aware waves, scoped
verification, and parent integration criteria. The parent coordinates sequencing, handoffs, overlap
avoidance, and final integration through its reasoning. Worker context remains bounded to its unit.
Runtime skills do not provide worker roles or domain policy.

<!-- kb
id: automation.orchestration.ownership
alias: worker scope
alias: parallel ownership
source: policy/CODEX.md#Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria.
source: scripts/lib/orchestration-scope.mjs#claimWorkerScope
source: scripts/lib/orchestration-scope.mjs#finalizeOrchestrationScope
source: scripts/lib/task-ownership.mjs#resolveTaskOwnership
adjacent: automation.orchestration.execution
adjacent: automation.task-close.scope
-->
## Orchestration coordination

ORCHESTRATED execution is a parent reasoning and execution shape, not a deterministic ownership
lifecycle. Parallel workers may share read evidence, but the parent assigns non-overlapping
concurrent writes and serializes shared writable paths. It remains responsible for worker
sequencing, handoffs, overlap avoidance, verification, and the integrated result.

The standalone ownership and orchestration-scope helpers remain compatible with valid existing
plans that explicitly selected them. In that compatibility path, worker claims are subordinate
locks rather than independent task lifecycles and tooling rejects sibling overlap. Those helpers
are not required or implicitly enabled merely because execution is ORCHESTRATED.

<!-- kb
id: automation.task-close.lifecycle
alias: task close
alias: task-close
source: scripts/task-close.mjs#main
adjacent: automation.task-close.scope
adjacent: automation.task-close.receipt
adjacent: automation.task-close.process-controls
-->
## Task-close lifecycle

Task-close is standalone deterministic compatibility tooling for valid plans/manifests that already
selected `task_close=ON`; that legacy selection requires task ownership. Its lifecycle runs
`prepare → review → close`, with `amend` reserved for a proven direct dependency discovered
after prepare. Current Planner policy does not route task-close as an agent-supported process.

A valid compatibility lifecycle runs prepare once before edits, review once when authored changes
are final, and close once after required verification. Review/close retry only after repairing a
returned blocker. Task-close is not a checkpoint or status mechanism and is not inferred for new
plans or normal Codex runtime context.

Valid pre-migration manifests retain the lifecycle semantics under which they were created.

<!-- kb
id: automation.task-close.process-controls
alias: process controls
alias: bare process
alias: task process
source: scripts/lib/task-process-controls.mjs#resolveTaskProcessControls
source: scripts/task-close.mjs#createManifest
source: scripts/codex-task-run.mjs#resolveTelemetryMode
adjacent: automation.planning.phase2
adjacent: automation.task-close.lifecycle
adjacent: automation.task-close.scope
-->
## Task process controls

The current Planner's agent-supported process controls are telemetry, workflow inefficiency
flagging, executable QA, permanent QA coverage, and public QA receipt, all default OFF; plan
archival remains ON. Those are task policy rather than universal Codex knowledge. Everything ON
enables the five agent-supported default-OFF controls.

A default-OFF process is omitted from the Phase 2 plan and Codex runtime context. Planner loads only
the policy section for an enabled/non-default process. Workflow inefficiency flagging requires
telemetry, and invalid combinations fail closed rather than silently enabling another process.

The standalone task tooling retains `task_ownership` and `task_close` fields so valid
pre-migration manifests remain deterministic. Within that compatibility schema,
`task_close=ON` requires `task_ownership=ON`; new Planner plans do not emit either control.

Corp Tower telemetry hooks remain non-auto-discovered and are injected only for telemetry-enabled
sessions through the deterministic launcher. Optional process selection never grants Git/deployment
authorization or weakens safety, approved-scope, task-caused repair, or required consistency
boundaries.

<!-- kb
id: automation.task-close.scope
alias: task manifest
alias: owned paths
source: scripts/task-close.mjs#createManifest
source: scripts/task-close.mjs#taskCloseIntake
source: scripts/lib/task-ownership.mjs#resolveTaskOwnership
adjacent: automation.orchestration.ownership
-->
## Task-close scope

A task-close scope exists only for a valid compatibility manifest that selected task-close. It
binds the task's explicit ownership authority, process contract, optional plan, and selected
verification/receipt inputs. Scope is never derived from the dirty working tree.

Review validates final authored/source scope and owns bounded regeneration/protection of only concept
maps affected by exact source grants or changed authored concept owners. Generated maps remain
tooling-owned derived output.

Outside that compatibility lifecycle, required verification and task-triggered generated
consistency run directly from the approved plan. Neither orchestration nor ordinary completion
creates an implicit close lifecycle.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#verifyManifest
adjacent: testing.selection.local
-->
## Task-close verification

For a valid compatibility manifest that selected task-close, close verifies reviewed authored scope
and its bounded protected generated outputs, plus any verification policy selected for the task.

When task-close is not selected, required correctness checks run directly from the plan and actual
changed scope. BARE does not create a close lifecycle merely to host verification. Known
task-caused failures remain open until repaired; unrelated approved maintenance remains outside the
task.

<!-- kb
id: automation.task-close.receipt
alias: qa receipt
alias: public receipt
source: scripts/task-receipt.mjs#main
source: scripts/lib/qa-receipt.mjs#renderPublicQaReceipt
-->
## Public receipt

Public QA receipt generation is optional task policy independent from executable QA and task-close.
When selected, it exposes sanitized task identity, explicit scope, compact implementation and
verification outcomes, and maintenance classification without publishing raw private child output.

A selected task-close lifecycle may call the shared receipt primitive. Without task-close, a
standalone receipt entry point uses the same primitive. If executable QA was not selected, the
receipt states that rather than fabricating QA proof.

<!-- kb
id: automation.task-close.plan-archive
alias: plan done
alias: archive plan
source: scripts/lib/plan-archive.mjs#archivePlan
source: scripts/plan-archive.mjs#main
-->
## Plan archival

Plan archival is enabled by default as a deterministic completion mechanic independent from
task-close. After successful implementation and required verification, the archive operation moves
the active plan to completed history. It is collision-safe and idempotent.

Selected task-close may delegate to the same archive primitive. Without task-close, completion uses
the standalone archive path. When archival is explicitly disabled, the successful task leaves its
plan active.

<!-- kb
id: automation.docs.maps
alias: concept map generator
source: scripts/build-concept-map.mjs#buildConceptMaps
adjacent: automation.docs.validation
-->
## Map regeneration

The concept generator is the only map architecture. It derives KB Tree domain maps and the marked
concept router from authored concept metadata and bounded source grants. Generated output is locator
evidence, never an authored replacement for concept prose.

<!-- kb
id: automation.docs.validation
alias: concept KB validator
alias: KB validator
source: scripts/validate-concept-kb.mjs#validateConceptKb
source: scripts/lib/concept-kb.mjs#conceptProseCapacity
-->
## KB validation

The KB Tree validator always protects global authored concept identity, aliases, leaf ownership,
adjacency, exact source grants and anchors, isolation, and prose capacity. Full-tree mode also
requires every generated concept output to match the current registry.

When task-close supplies an explicit affected concept-map set, generated-output equality, marker,
and completeness checks are limited to that set while the global authored registry/source contract
remains fail-closed. This lets a task prove its own generated consistency without adopting unrelated
dirty generated maps. Advisory bands remain calibration signals; only prose beyond the
2,500-estimated-token ceiling or the 600-character line ceiling is a capacity error.

<!-- kb
id: automation.docs.scope
alias: source concept ownership
alias: documentation ownership
source: scripts/lib/concept-kb.mjs#loadConceptRegistry
-->
## Docs scoping

The concept registry derives the sole reverse source-to-concept index for deterministic tooling.
Durable-current-contract changes belong to their smallest owning concept; task history and working
material never become KB Tree prose.

<!-- kb
id: automation.docs.retrieval-repair
alias: retrieval maintenance
source: scripts/lib/context-query.mjs#conceptRoute
adjacent: automation.retrieval.fallback
-->
## Retrieval repair

Retrieval/map defects discovered during unrelated product work are maintenance findings, not
permission to broaden that product task. An explicit retrieval-maintenance task may repair concept
metadata, generated routes/maps, validators, fixtures, or benchmark expectations.

<!-- kb
id: automation.observability.binding
alias: agent observability
alias: task binding
source: scripts/lib/agent-observability/state.mjs#bindActiveTask
source: scripts/codex-observability-hook.mjs#handleHook
source: scripts/codex-task-run.mjs#startTelemetrySession
source: scripts/codex-task-run.mjs#launchCodexTask
-->
## Observability binding

Corp Tower observability hooks are opt-in at Codex session start. The repository keeps their
definition outside the auto-discovered project hook path, and the deterministic launcher injects
them only when telemetry is selected ON. Default sessions therefore dispatch no Corp Tower
observability hook process.

Telemetry task/session binding and usage settlement are independent from task-close. Task-close may
contribute verified close evidence when separately selected, but telemetry without close-out must
not fabricate QA or verification proof. Hooks remain best-effort and cannot change implementation,
verification, receipt, ownership, or close-out correctness.

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

Usage accounting relies on stable disjoint identifiers and terminal evidence. Stop first validates
and reads the current supplied rollout, then uses only the narrowest related child discovery;
bounded inventory is fallback-only. Missing exact usage is partial/unavailable, never a fabricated
zero. Task telemetry derives concept retries, verification and rework only from retained outcomes;
optional workflow-review cost is measured as bounded handoff/material bytes and count, with
attributable provider tokens absent unless exactly observable.

<!-- kb
id: automation.observability.flags
alias: workflow candidate
alias: inefficiency flag
source: scripts/lib/agent-observability/flagging.mjs#flagEligibility
source: scripts/lib/agent-observability/runtime.mjs#modelFamily
source: scripts/lib/agent-observability/flagging.mjs#createFormalFlag
source: scripts/agent-observability.mjs#recordFormalFlagCommand
-->
## Workflow inefficiency flags

When workflow inefficiency flagging is enabled by the task process contract, deterministic tooling
creates a workflow candidate and its eligibility gate. An eligible same-turn model assessment
becomes a formal `WF-*` flag through the deterministic flag command; its evidence must belong to the
current task and its provider-visible material remains bounded. Astra retains the approved-family,
high-or-higher effort, current-turn, task-evidence, and 1.5 KiB material gate. When there is no
eligible candidate, Codex loads no flagging context and records no formal flag. Public QA receipt
correctness remains independent of candidate and hook health.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
source: scripts/git-sync-commit-push.mjs#requireManifest
source: scripts/git-sync-commit-push.mjs#explicitPathScope
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and always requires explicit user authorization. A valid closed
task-close scope remains eligible when available, but task-close is not a prerequisite. A task may
instead provide explicit authorized repository-relative publication paths, optionally validated
against selected ownership state.

Publication scope is never inferred from the dirty working tree. The tool performs only the
authorized sync/stage/commit/push sequence and rejects invalid branch, scope, staging, receipt, or
authorization state rather than silently widening publication.
