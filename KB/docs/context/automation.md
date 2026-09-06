# Agent Automation

Scope: bounded repository retrieval, Planner-to-Codex execution handoff, deterministic task
close-out, KB Tree automation, agent observability, and explicitly authorized Git publication.
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
source: policy/PLANNER.md#Defaults and overrides
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/CODEX.md#Strict execution
adjacent: automation.retrieval.direct
adjacent: automation.orchestration.execution
adjacent: automation.task-close.process-controls
-->
## Phase 2 execution handoff

Phase 2 is Codex's self-contained task execution contract. Planner compiles the user-approved Phase
1 intended behavior, only the task-specific policy that materially applies, compacted KB context
already read during planning, exact KB retrieval inputs for optional deeper retrieval, bounded
source context, expected write scope, ordered implementation requirements, minimum verification, and
done criteria.

Repository defaults stay implicit: the BARE process profile and normal single-run execution are
omitted from the plan unless an override changes them. Expected write scope is evidence-based rather
than a hard whitelist by default, so Codex may use current-source judgment for a proven direct
dependency or bounded task-local refactor that remains inside approved behavior.
`strict_execution=ON` converts the planned implementation approach and direct-write scope into a
prescriptive boundary and is included only as an execution override.

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
prefers the smallest bounded reads and compact tool outputs that preserve correctness, reuses exact
current evidence, and expands diagnostics only when a compact failure result is insufficient.
Deterministic tooling keeps detailed manifests, logs, generated state, and diagnostics private while
returning the smallest result needed for the next model decision.

Plan-selected KB retrieval is demand-driven rather than startup work. A deeper `concept-read` is a
standalone contextualization decision point used only when the compacted KB context and bounded
source handoff do not contain enough detail for the next implementation decision.

When executable QA is enabled by the task process contract, repository tooling tests use compact QA
wrappers when available. Executable QA verification uses `qa-gate --changed`, while targeted
iterative tooling tests use the compact explicit-test mode so successful TAP output stays private
and failure evidence expands progressively.

When executable QA is disabled, task-close does not run `qa-gate` or raw regression suites solely
for final verification. Mandatory task ownership, patch integrity, required repository consistency,
generated-output consistency, and explicitly authorized deliverable mechanics remain active.

Git review establishes final task-owned authored change scope with bounded name-status evidence and
keeps `git diff --check` as a cheap integrity check. Task-close owns generated concept-map
preparation inside review: it regenerates only maps affected by exact changed source grants or
authored concept owners, derives only candidate maps that actually changed, and protects only that
bounded map set after review. Unrelated generated-map churn is not adopted into task scope.

Task-close owns lifecycle, verification, receipt, and formal-flag status and exposes those fields
through compact terminal and status surfaces; broad `.agent-state` searches are not normal workflow.
QA and close-out keep detailed proof in private state and receipts while exposing compact success or
progressively bounded failure diagnostics. Efficiency never hides a conflict, failed check,
authorization need, safety condition, or correctness evidence, and telemetry never captures prompt,
response, command, patch, diff, or transcript content merely to measure savings.

<!-- kb
id: automation.orchestration.execution
alias: orchestrated execution
alias: multi-agent implementation
source: policy/PLANNER.md#Execution-shape planning
source: policy/CODEX.md#Orchestration planning
source: policy/REVIEWER.md#Integrated QA
adjacent: automation.planning.phase2
adjacent: automation.orchestration.ownership
adjacent: automation.task-close.lifecycle
-->
## Orchestrated execution

Normal execution is a single Codex run and is not written into the plan. Planner selects
ORCHESTRATED only when semantic decomposition reduces context reconstruction or integration risk
enough to justify coordination overhead, then compiles the required worker contract into `##
Execution Overrides`.

The parent plan remains the behavior authority. It defines worker responsibilities, dependencies,
shared invariants, expected write ownership, dependency-aware waves, scoped verification, and parent
integration criteria. The orchestrator may refine worker boundaries, ordering, or count against
current repository evidence without redesigning approved behavior. Worker context stays bounded to
the unit. Scoped repair returns to the same worker when practical, while cross-worker failures
remain orchestrator-owned until responsibility is established.

<!-- kb
id: automation.orchestration.ownership
alias: worker scope
alias: parallel ownership
source: policy/CODEX.md#Orchestration planning
source: scripts/lib/orchestration-scope.mjs#claimWorkerScope
source: scripts/lib/orchestration-scope.mjs#finalizeOrchestrationScope
adjacent: automation.orchestration.execution
adjacent: automation.task-close.scope
-->
## Orchestration ownership

Parallel workers may share read evidence but may not hold overlapping write ownership. The
orchestrator claims explicit worker paths from the parent task scope before concurrent writers run;
deterministic tooling rejects sibling overlap and never derives ownership from the dirty tree.
Shared writable paths use one owner or serialized execution. A worker cannot expand across another
active claim; new write dependencies return to the orchestrator. Worker claims are subordinate
execution locks rather than independent task closure, and released private orchestration state is
cleaned before the parent task closes.

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

`task-close` is deterministic repository closure around explicit task-owned paths. New manifests
carry the effective task process contract through `prepare → review → close`, with `amend` adding a
proven direct dependency discovered after prepare. Scope is never discovered from the dirty working
tree. Review and close preserve a bounded compatibility path for valid active pre-process-control
manifests so an in-flight task can finish without silently changing its workflow.

<!-- kb
id: automation.task-close.process-controls
alias: process controls
alias: bare process
alias: task process
source: scripts/lib/task-process-controls.mjs#resolveTaskProcessControls
source: scripts/task-close.mjs#createManifest
adjacent: automation.planning.phase2
adjacent: automation.task-close.lifecycle
adjacent: automation.task-close.scope
-->
## Task process controls

Task-close stores and validates the complete effective per-task process contract independently from
execution mode. New tasks default to BARE: telemetry, workflow inefficiency flagging, executable QA,
permanent QA coverage, and the public QA receipt are off; plan archival is on.

Planner does not repeat those defaults in Phase 2. The plan includes only non-default process values
under `## Execution Overrides`; task-close still resolves and persists the complete effective values
internally. Workflow inefficiency flagging requires telemetry. Optional controls never disable task
ownership, concurrent-change preservation, authorization and safety boundaries, minimal patch
integrity, repair of known task-caused failures, or KB/generated consistency required by the
implementation.

<!-- kb
id: automation.task-close.scope
alias: task manifest
alias: owned paths
source: scripts/task-close.mjs#createManifest
source: scripts/task-close.mjs#taskCloseIntake
adjacent: automation.orchestration.ownership
-->
## Task-close scope

Prepare owns explicit task paths, the persisted task process contract, planned QA-tooling scope, and
an optional active plan before edits. The Phase 2 expected write scope provides the initial
evidence-based authored scope; Codex may amend ownership only for a proven direct task dependency
discovered during implementation, unless a strict execution override forbids that expansion.

Review is one deterministic transaction: it validates the explicit changed authored/source scope,
resolves only concept maps affected through exact source grants or changed authored concept owners,
regenerates that bounded map set, derives the candidate maps that actually differ from Git baseline,
captures their post-regeneration freshness state, and only then persists reviewed scope. Generated
maps are tooling-owned derived output and never become authored ownership or documentation edits.

Close verifies the reviewed authored paths plus that bounded protected map set; it never
reconstructs task authority from the dirty working tree. For orchestrated execution, one parent
manifest owns the integrated authored path union and worker claims remain subordinate write locks
rather than independent closure authority.

<!-- kb
id: automation.task-close.verification
alias: task close QA
alias: maintenance-blocked
source: scripts/task-close.mjs#verifyManifest
adjacent: testing.selection.local
-->
## Task-close verification

Close-out always preserves required ownership, patch integrity, source/registry validity, and
task-triggered KB/generated consistency. Review stores freshness hashes only for its bounded
affected concept-map set after review-owned regeneration. A protected map changed or removed after
review blocks closure; generated-map churn outside that protected set does not become this task's
scope or invalidate it solely by being dirty.

Required concept-map and concept-KB consistency runs independently from the optional executable-QA
process control and uses the bounded affected map set when exact map ownership is known. Executable
regression QA runs only when the task process contract enables QA. Task-caused stale protected maps,
broken source grants, registry defects, required-consistency failures, or other known task-caused
failures remain open; only approved unrelated maintenance blockers may produce a maintenance-blocked
closure.

<!-- kb
id: automation.task-close.receipt
alias: qa receipt
alias: public receipt
source: scripts/task-close.mjs#finishVerification
source: scripts/lib/qa-receipt.mjs#renderPublicQaReceipt
-->
## Public receipt

Public QA receipt generation is controlled independently from executable QA. When enabled, the
receipt exposes sanitized task identity, owned scope, compact implementation and verification
outcomes, and maintenance classification without publishing raw private child output. If executable
QA was disabled, the receipt states that it was not run by process control. When receipt generation
is disabled, task-close publishes no public QA receipt. Implementation completion and verification
status remain separately representable.

<!-- kb
id: automation.task-close.plan-archive
alias: plan done
alias: archive plan
source: scripts/task-close.mjs#archivePlan
source: scripts/task-close.mjs#retainPlan
-->
## Plan archival

Plan archival is enabled by default. When enabled, a bound active plan moves to completed history
only after successful lifecycle closure, and archive failure preserves proof for an idempotent retry
rather than pretending closure succeeded. When explicitly disabled for the task, successful closure
leaves the plan active and records that archival was intentionally skipped.

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
source: scripts/task-close.mjs#closeObservabilityUnsafe
-->
## Observability binding

When telemetry is enabled by the task process contract, agent observability binds task/session
identity and records only bounded categories, outcomes, and opaque identifiers, never prompts,
responses, patches, commands, or transcript contents. Hooks are best-effort: they record health when
possible and cannot alter task execution, QA, or receipt correctness. Stop performs normal
settlement; SessionEnd remains a cheap health fallback. Without a live session binding, a task
remains pending rather than being finalized with fabricated terminal evidence.

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
-->
## Authorized Git publication

`git-sync-commit-push` is opt-in and requires explicit user authorization plus eligible closed task
state. It performs only the authorized sync/stage/commit/push sequence and rejects invalid
branch/scope/staging states rather than silently widening publication.
