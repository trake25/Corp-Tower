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
source: policy/CHATGPT.md#Repository contextualization
adjacent: automation.planning.phase2
adjacent: automation.retrieval.protocol
-->
## Direct retrieval discipline

ChatGPT and Planner prefer direct local/workspace repository search and bounded reads when that
transport is available. They may read known exact paths or symbols directly and use bounded
task-relevant search to locate unknown implementation evidence. Current source discovered this way
is ordinary authority for current implementation facts; it does not need a prior KB grant.

KB Tree remains the bounded semantic retrieval protocol when durable intended behavior,
architecture, ownership, terminology, or another semantic contract is materially needed. It is not
an access-control gate for source discovery, and adjacency remains unloaded until deliberately
selected. Contextualization stops once the evidence is sufficient for the current decision.

The Phase 2 plan gives Codex compacted KB context when used, bounded source context, and exact KB
retrieval inputs only where deeper semantic detail may be material. Codex normally consumes that
handoff instead of rediscovering context; its bounded runtime retrieval remains governed by
`AGENTS.md`.

<!-- kb
id: automation.planning.phase2
alias: phase 2 execution handoff
alias: execution-oriented plan
source: policy/PLANNER.md#Phase 2 feasibility gate
source: policy/PLANNER.md#Policy selection
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/IMPLEMENT.md#Treat Planner-supplied feasibility/dependency traces, semantic interfaces, and cross-boundary invariants as part of the task contract when present.
source: policy/REVIEWER.md#When the plan contains a feasibility/dependency trace or explicit cross-boundary invariants, verify those declared boundaries first:
source: policy/CODEX.md#Agent-supported repository process defaults
adjacent: automation.retrieval.direct
adjacent: automation.orchestration.execution
adjacent: automation.task-close.process-controls
-->
## Phase 2 execution handoff

Phase 2 is Codex's self-contained task execution contract. Before the handoff is ready, Planner
checks every approved behavior against current source and establishes what already supports it, what
is incomplete, the complete material source/state path needed to guarantee it, the direct-edit
boundaries implied by that path, and the minimum verification that proves both the behavior and its
material risks.

Feasibility is behavioral rather than file-level. Finding an obvious owner file or showing that an
implementation appears possible is insufficient. When approved behavior materially crosses
client/server authority, persistence and hydration, snapshot/reconnect/resync, cross-pod or session
ownership, lifecycle timers, asynchronous presentation, multiplayer membership, or
background/disconnect recovery, Planner traces the relevant path end to end. Material normal,
failure, fallback, stale/duplicate, disconnect, and recovery paths are included when they can
invalidate the approved behavior. A server or authoritative lifecycle that depends on client-side
completion must have either a proved deterministic authoritative bound or explicit bounded
synchronization with an authoritative fallback; approximate animation or tuning durations are not
treated as completion bounds without source proof.

For integration-heavy work, the Phase 2 Context contains a compact feasibility/dependency trace that
maps each material approved behavior to its current source/state path, identified support or gap,
required boundaries/files, and verification proof. Expected write scope is derived from that
assessment rather than from obvious ownership alone. Verification is the minimum proof of every
approved behavior and every material feasibility risk Planner identified. An unresolved material
dependency means Phase 2 is not ready; Planner continues source analysis when the approved outcome
already determines the answer, or returns to design only when a genuinely new product/workflow
decision is required.

Planner then compiles the approved intended behavior, only task policy selected for this
implementation, current source evidence, KB context only where semantic authority is material, exact
retrieval inputs for optional deeper semantic detail, bounded source context, evidence-based expected
write scope, ordered implementation requirements, verification, and done criteria. Codex treats the
Planner-supplied feasibility/dependency trace and cross-boundary invariants as part of the task
contract, implements the complete material dependency path rather than only the nearest happy path,
and stops if current source materially contradicts the assessment or exposes a missing dependency
required for correctness. Reviewer verifies the declared feasibility boundaries and material risks
before relying on the implementation as complete.

A source-grounded task may state `None required` for compacted KB context and KB retrieval inputs.
The execution architecture has three layers: `AGENTS.md` contains only universal Codex policy; the
Phase 2 plan contains only task-selected policy; the KB/source handoff contains domain and task-scope
knowledge. Runtime skills are not an authority layer.

Default-OFF agent-supported processes are absent from the plan and Codex runtime context. Planner
includes an optional process or execution policy only when it is enabled or otherwise materially
selected for the task. Normal single-run execution is implicit. Plan archival and publication remain
enabled by default as deterministic completion mechanics rather than repeated task-plan prose.

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
source: policy/CHATGPT.md#Repository contextualization
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

For ChatGPT and Planner, the repository/GitHub connector is fallback transport when direct
local/workspace access is unavailable, evidence is remote-only, or GitHub-specific state is needed.
They do not duplicate the same evidence through direct and connector transport for reassurance.
Missing KB routing does not block a source-grounded answer or plan unless the missing durable
semantic authority is materially required.

Codex starts from the exact retrieval input supplied by the plan; an unavailable or defective exact
route is not permission to rediscover context through broad repository search. If no valid bounded
fallback can establish required semantic authority, Codex reports the retrieval defect. This runtime
boundary does not restrict ChatGPT/Planner's ordinary direct source contextualization.

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

Task ownership is retained standalone manual-maintenance compatibility tooling, independent from
task-close. A maintainer using an existing compatibility manifest may acquire one explicit parent
scope from its planned paths before edits, amend it only for a proven direct dependency, and release
it after integrated completion. Planner and Codex do not select, invoke, or depend on this utility.

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
source: policy/REVIEWER.md#For orchestrated work, the approved parent plan is the implementation contract.
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
Each worker returns only a compact integration summary: completion status, files changed,
verification performed and result, material interface/invariant notes, and blockers. Workers do not
return full transcripts, duplicated task/source context, or long logs unless the parent explicitly
requests the minimum additional detail needed to resolve an integration problem. Runtime skills do
not provide worker roles or domain policy.

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

The standalone ownership and orchestration-scope helpers remain manual-maintenance compatibility
utilities. In that path, worker claims are subordinate locks rather than independent task lifecycles
and tooling rejects sibling overlap. They are never required, selected, or treated as evidence merely
because execution is ORCHESTRATED.

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

Task-close is retained standalone manual-maintenance compatibility tooling. An existing
compatibility manifest that selected `task_close=ON` requires task ownership and runs
`prepare → review → close`, with `amend` reserved for a proven direct dependency discovered after
prepare. Planner and Codex do not select, invoke, or depend on task-close.

A manual compatibility lifecycle runs prepare once before edits, review once when authored changes
are final, and close once after required verification. Review/close retry only after repairing a
returned blocker. Task-close is not a checkpoint or status mechanism and is never inferred from a
new plan, orchestration, or normal Codex runtime context.

<!-- kb
id: automation.task-close.process-controls
alias: process controls
alias: bare process
alias: task process
source: policy/CODEX.md#Agent-supported repository process defaults
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
archival and publication default ON. These are task policy rather than repeated universal plan prose.
Everything ON enables the five default-OFF controls while the two default-ON completion controls
remain implicit.

A process is omitted from the Phase 2 plan when it remains at its repository default. Planner loads
only the policy section for an enabled/non-default process. Workflow inefficiency flagging requires
telemetry, and invalid combinations fail closed rather than silently enabling another process.

Retained manual-maintenance task tooling still recognizes `task_ownership` and `task_close` for
existing compatibility manifests. Within that compatibility schema, `task_close=ON` requires
`task_ownership=ON`; publication is not added as a compatibility-manifest field merely because it is
a normal Planner/Codex workflow control.

Corp Tower telemetry hooks remain non-auto-discovered and are injected only for telemetry-enabled
sessions through the deterministic launcher. Process selection never grants deployment or
unrelated/destructive Git authority; `publication=ON` governs only the bounded completion
publication defined below.

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
task-caused implementation/test failures remain open until repaired. A check blocked solely by a
tooling/environment limitation is reported as `maintenance-blocked` and remains a verification
limitation rather than an implementation failure; it does not require a second approval before the
enabled archival/publication closeout runs.

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
source: AGENTS.md#Codex universal policy
-->
## Plan archival

Plan archival defaults ON and is independent from publication and task-close. After implementation
is complete and required verification has either passed or is blocked solely by a tooling/environment
limitation, archive the active plan with:

`node scripts/plan-archive.mjs --plan plan/<active-phase-2-plan.md>`

Use this documented interface during normal execution; do not inspect the archive implementation
script merely to learn how to invoke it. Do not manually move, rename, or rewrite the plan as a
substitute for the archive tool.

`plan/` is ignored working material. The active plan and its `plan/done/` archive remain local and
must never be added to Git publication scope.

Selected task-close may delegate to the same archive primitive. If task-close already reports the
plan archived, do not run a redundant standalone archive. Without task-close, completion uses the
standalone archive command above. When archival is explicitly disabled, the successful task leaves
its plan active.

If archival fails, stop and report the bounded failure. Do not bypass the archive tool.

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
source: AGENTS.md#Codex universal policy
-->
## Authorized Git publication

Publication defaults ON and is independent from plan archival. After implementation is complete and
required verification has either passed or is blocked solely by a tooling/environment limitation,
publish the completed task unless the Phase 2 plan contains `publication=OFF`; when archival is
enabled, archival runs first. A task-caused implementation/test failure still blocks publication
until repaired.

The approved Phase 2 task supplies the authorization represented by `--approve`; do not ask for a
second approval before bounded completion publication. That authorization applies only to the
current task's explicit publication scope. Outside approved task completion, Git publication still
requires explicit user authorization.

Normal execution must use this documented interface and must not inspect
`scripts/git-sync-commit-push.mjs` merely to learn how to invoke it. Read the implementation only
when the task is specifically repairing or modifying the publication tool, or when a tool failure
cannot be diagnosed from its compact error.

Without task-close, publish explicit repository-relative task paths:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...]`

With a valid closed task-close manifest, publish its recorded scope:

`node scripts/git-sync-commit-push.mjs --approve --manifest <terminal-closeout.json>`

When a task explicitly requires publication from another selected local branch, use the tool's
documented branch form rather than raw Git:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...] --branch <branch> --switch`

Use push-only branch publication only when that mode is explicitly required by the task:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...] --branch <local-branch> --push-only [--remote-branch <remote-branch>]`

Publication scope is never inferred from the dirty working tree. Supply only the repository-relative
paths owned by the completed task. `plan/` is ignored local working material and must never appear in
publication scope.

The task title provides the publication identity. The shared identity helper selects the first 1–3
meaningful non-generic keywords, preserves them as the commit label, and automatically appends the
next `vX.XX` version from repository history. Agents do not manually choose or append the version.
Prefer a concise task title whose first meaningful words clearly identify the work, for example
`Spectator Panning`, `Reconnect Network Stability`, or `Facebook Auth Tab`.

The publication tool owns synchronization, staging, commit creation, and push. Agents must not
substitute raw `git add`, `git commit`, `git pull`, or `git push`. The tool rejects invalid branch,
scope, staging, receipt, authorization, or synchronization state rather than silently widening
publication. On rejection, stop and report the bounded failure; do not widen scope or bypass the
tool.
