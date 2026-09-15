# Agent Automation

Scope: bounded repository retrieval, Planner-to-Implementor execution handoff, deterministic independent-task integration, standalone compatibility tooling for older task lifecycles, KB Tree automation, agent observability, and explicitly authorized Git publication.
Product behavior remains in product-domain concepts.

<!-- kb
id: automation.retrieval.direct
alias: agent retrieval
alias: bounded context
source: AGENTS.md#Implementor universal policy
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/CHATGPT.md#Repository contextualization
adjacent: automation.planning.phase2
adjacent: automation.retrieval.protocol
adjacent: automation.retrieval.source
-->
## Direct retrieval discipline

ChatGPT and Planner prefer direct local/workspace repository search and bounded reads when that
transport is available. They may read known exact paths or symbols directly and use bounded
task-relevant search to locate unknown implementation evidence. Current source discovered this way
is ordinary authority for current implementation facts; it does not need a prior KB grant.

The Implementor's own direct transport is `scripts/source-context.mjs`: bounded scoped search, an
exact-file symbol/anchor listing, and an exact-file anchor/line-bounded read, each with a fixed
result/byte cap. It does not gate ordinary current-source discovery behind any KB grant.

KB Tree remains the bounded semantic retrieval protocol when durable intended behavior,
architecture, ownership, terminology, or another semantic contract is materially needed. It is not
an access-control gate for source discovery, and adjacency remains unloaded until deliberately
selected. Contextualization stops once the evidence is sufficient for the current decision.

The Phase 2 plan gives the Implementor exact KB concept IDs and Source locators — never compacted KB
prose or copied/bounded source text — only where deeper semantic detail may be material. The
Implementor starts from those retrieval inputs and fetches current KB/source content itself through
`concept-route`/`concept-read` and `scripts/source-context.mjs`; bounded runtime retrieval remains
governed by `AGENTS.md`.

<!-- kb
id: automation.planning.phase2
alias: phase 2 execution handoff
alias: execution-oriented plan
source: policy/PLANNER.md#Phase 2 feasibility gate
source: policy/PLANNER.md#Policy selection
source: policy/PLANNER.md#Standard Phase 2 format
source: policy/IMPLEMENT.md#Treat Planner-supplied feasibility/dependency traces, semantic interfaces, and cross-boundary invariants as part of the task contract when present.
source: policy/REVIEWER.md#When the plan contains a feasibility/dependency trace or explicit cross-boundary invariants, verify those declared boundaries first:
source: policy/IMPLEMENTOR.md#Agent-supported repository process defaults
adjacent: automation.retrieval.direct
adjacent: automation.orchestration.execution
adjacent: automation.task-close.process-controls
-->
## Phase 2 execution handoff

Phase 2 is the Implementor's self-contained task execution contract, in the compact 5-section format
at `policy/PLANNER.md#Standard Phase 2 format`: `## 1. Behavior`, `## 2. Retrieval`, `## 3. Changes`,
`## 4. Verification`, and `## 5. Overrides` only when execution is non-default. Before the handoff is
ready, Planner checks every approved behavior against current source and establishes what already
supports it, what is incomplete, the complete material source/state path needed to guarantee it, the
task-branch `Changes > Direct` edit boundaries implied by that path, any authored/shared artifacts
that belong under `Changes > Finalization` because their correct content depends on already-integrated
`main`, and the minimum task-branch and candidate `Verification` that proves both the behavior and its
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

For integration-heavy work, Planner's feasibility/dependency trace maps each material approved
behavior to its current source/state path, identified support or gap, required `Direct`/`Finalization`
boundaries/files, and verification proof; that trace is not copied into the plan verbatim. The
resulting `Changes > Direct`/`Changes > Finalization` split is derived from that assessment rather than
from obvious ownership alone. Shared authored KB prose, generated KB maps/routers, and other
high-contention artifacts whose correct content depends on already-integrated repository state belong
under `Changes > Finalization`, never `Changes > Direct`. `Verification` is the minimum proof of every
approved behavior and every material feasibility risk Planner identified, including narrow candidate
verification when stale-main or silent semantic integration can materially invalidate correctness. An
unresolved material dependency means Phase 2 is not ready; Planner continues source analysis when the
approved outcome already determines the answer, or returns to design only when a genuinely new
product/workflow decision is required.

Planner then compiles the approved `Behavior`, a `Retrieval` section (KB concept IDs only where
semantic authority is materially needed, source locators/searches/filters/anchors, and
intersections), a `Changes` section (`Direct`/`Finalization`/`Generated`/`Invariants`), and
`Verification` proving the behavior and its material risks. The Implementor treats the
Planner-supplied feasibility/dependency trace and cross-boundary invariants as part of the task
contract, implements the complete material dependency path rather than only the nearest happy path,
and stops if current source materially contradicts the assessment or exposes a missing dependency
required for correctness. Reviewer verifies the declared feasibility boundaries and material risks
before relying on the implementation as complete.

A source-grounded task simply omits the `KB:` label under `Retrieval` when no deeper semantic
retrieval is materially needed; an empty label or section is never written as `None required`. The
execution architecture has three layers: `AGENTS.md` contains only universal Implementor policy; the
Phase 2 plan contains only task-selected policy; the KB/source handoff contains domain and task-scope
knowledge. Runtime skills are not an authority layer.

Default-OFF agent-supported processes are absent from the plan and Implementor runtime context.
Planner includes an optional process or execution policy only when it is enabled or otherwise
materially selected for the task. Normal single-Implementor execution is implicit. Plan archival and
publication remain enabled by default as deterministic completion mechanics; with publication enabled,
normal completion converges through the independent-task integration lifecycle rather than publishing a
completed local checkout directly to `main`.

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

`scripts/context.mjs` is the Implementor's preferred local implementation of the KB Tree route,
read, and bundle protocol when a plan-selected retrieval input needs deeper detail. Its only
commands are `concept-route`, `concept-read`, and `concept-bundle`; each accepts an exact ID or
normalized alias but does not select a concept. `concept-read` returns the owning prose leaf with
bounded source grants and unloaded adjacency. Resolution never turns adjacency into an implicit next
read.

<!-- kb
id: automation.retrieval.source
alias: source-context.mjs
alias: bounded source search
alias: source anchors
source: scripts/source-context.mjs#searchSource
source: scripts/source-context.mjs#readAnchors
source: scripts/source-context.mjs#readSource
adjacent: automation.retrieval.direct
adjacent: automation.retrieval.protocol
-->
## Bounded source search and anchor reads

`scripts/source-context.mjs` gives the Implementor a bounded, non-KB local search/read transport for
plain current source. `search` requires an explicit repository-relative scope and returns a fixed
result count under a hard output-byte cap; it never enumerates an unscoped tree. `anchors` lists an
exact file's symbols/headings, capped in count and bytes. `read` returns an exact-file window either
around a named anchor or an explicit line range, clamped to a hard line/byte cap; a range that would
exceed the cap fails closed as `budget-exceeded` rather than silently truncating returned code. A
missing or ambiguous anchor fails closed as `source-anchor-missing` or `anchor-ambiguous`. Every
target is resolved through the same repository-relative path/symlink-traversal protection used
elsewhere in this Automation domain.

Every result, matched or failed, is measured against that command's byte ceiling in both text and
JSON mode before it is returned; a failure never echoes an unbounded query, scope, path, anchor, or
tool/filesystem error, and a bounded failure envelope that still cannot fit falls back to a minimal
`budget-exceeded` result.

This mirrors the bounded-window behavior `concept-kb` uses to resolve a stable source anchor, without
coupling ordinary source discovery to KB concept authority: a source-context read needs no concept
grant, and it does not stand in for `concept-route`/`concept-read` when durable semantic authority is
what is actually needed.

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
source: AGENTS.md#Implementor universal policy
source: policy/CHATGPT.md#Repository contextualization
adjacent: automation.docs.retrieval-repair
-->
## Retrieval fallback

For ChatGPT and Planner, the repository/GitHub connector is fallback transport when direct
local/workspace access is unavailable, evidence is remote-only, or GitHub-specific state is needed.
They do not duplicate the same evidence through direct and connector transport for reassurance.
Missing KB routing does not block a source-grounded answer or plan unless the missing durable
semantic authority is materially required.

The Implementor starts from the exact retrieval input supplied by the plan; an unavailable or
defective exact route is not permission to rediscover context through broad repository search. If no
valid bounded fallback can establish required semantic authority, the Implementor reports the
retrieval defect. This runtime boundary does not restrict ChatGPT/Planner's ordinary direct source
contextualization.

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
alias: Implementor I/O discipline
source: AGENTS.md#Implementor universal policy
source: scripts/task-close.mjs#compactOutput
source: scripts/qa-gate.mjs#fail
adjacent: automation.observability.usage
adjacent: automation.retrieval.source
adjacent: automation.git.inspection
-->
## Provider-visible I/O discipline

The Implementor minimizes provider-visible I/O rather than execution evidence. The universal
execution kernel uses the smallest bounded reads and compact tool outputs that preserve correctness,
reuses exact current evidence, and expands diagnostics only when a compact failure result is
insufficient for the next repair decision. `scripts/source-context.mjs` and `scripts/git-state.mjs`
are the preferred compact source/Git tools; the Implementor does not run a bare repository-wide
`git status`, `git diff`, `git log`, or `git show` when the narrower bounded tool answers the same
question.

Plan-selected KB retrieval is demand-driven. The Implementor starts from the plan's exact KB concept
IDs and Source locators — never compacted KB prose or copied/bounded source text — and uses an exact
plan-supplied retrieval input only when deeper detail is materially required. It does not rediscover
policy, domain context, optional processes, or repository structure already supplied by Planner.

Detailed deterministic logs/state remain private. Selected task tooling keeps compact success output
and progressively bounded failure evidence. `scripts/lib/git-publication.mjs#runGit` always captures
child output rather than inheriting it to the caller's stdio, so a normal Git operation never leaks
raw progress text; a failure returns a headline bounded to a fixed character cap, and only when the
full detail would not already fit does it save the complete output privately under ignored
`.agent-state/automation/git-failures/` and reference that path. `scripts/task-integrate.mjs`'s CLI
result is compact single-line JSON by default and only pretty-printed with an explicit `--json` flag;
every machine-readable field remains present either way. Already integrated tasks are consumed as
authoritative repository state rather than reconstructed from other agents' plans, transcripts, or
summaries. A later Implementor receives broader cross-task context only when a concrete conflict,
overlap signal, failed candidate check, or Reviewer finding proves it is materially required.
Efficiency never hides a conflict, failed required check, authorization need, safety condition, or
correctness evidence.

<!-- kb
id: automation.integration.lifecycle
alias: task integration
alias: integration candidate
alias: remote task branch
source: AGENTS.md#Implementor universal policy
source: policy/PLANNER.md#Integration planning
source: policy/IMPLEMENTOR.md#PROCESS-ROUTER
adjacent: automation.integration.queue
adjacent: automation.integration.conflicts
adjacent: automation.integration.storage
adjacent: automation.git.publish
adjacent: automation.task-close.plan-archive
-->
## Task integration lifecycle

With publication enabled, normal independent task completion uses a deterministic integration
lifecycle rather than pushing a completed local checkout directly to `main`. Task start records the
exact current `origin/main` baseline and a dedicated task branch. Ordinary implementation and task-
branch verification operate only on the plan's `Changes > Direct` scope; authored KB prose, generated
KB maps/routers, and any other explicitly deferred high-contention artifacts stay untouched until the
integration candidate is based on the then-current `main`.

A completed task revision is published to a remote task branch and identified by its exact head SHA.
That remote revision is the portable handoff between humans, Implementors, Reviewer/Planner, and a
future external control plane. The integration system serializes requests for one target branch,
assembles the active task against current `main` in an isolated candidate, and reports
`READY_FOR_FINALIZATION` only after the source/task revision merges cleanly. The active Implementor
then changes only the approved integration-finalization scope in that candidate and uses deterministic
generators for derived artifacts.

Final candidate verification applies to the exact repository state proposed for `main`. Before
publication the integration system rechecks that remote `main` is still the recorded candidate base;
a moved base becomes `STALE_MAIN` and is never overwritten by force. Only a complete verified
candidate advances `main`, after which the remote result is verified and eligible candidate/task
cleanup runs. Plan archival occurs after verified `INTEGRATED` completion; when publication is OFF,
no integration request is created and normal local archival follows local completion instead.

<!-- kb
id: automation.integration.queue
alias: integration queue
alias: queued task
source: AGENTS.md#Implementor universal policy
source: policy/IMPLEMENTOR.md#PROCESS-ROUTER
adjacent: automation.integration.lifecycle
adjacent: automation.integration.conflicts
adjacent: automation.integration.storage
-->
## Integration queue

Integration is serialized per repository target branch. Multiple independent tasks may implement in
parallel, but only one request may assemble/finalize the next target state at a time. Requests enter a
durable FIFO queue before mergeability is evaluated; a queued task is tested only when it becomes
active, after the integrator fetches the then-current remote `main`. This prevents multiple tasks from
proving themselves against the same stale target and then racing publication.

Waiting is deterministic tooling state, not provider reasoning. A caller may block on or subscribe to
a request state without repeatedly waking an AI to poll. When an active request reaches a terminal or
caller-action-required state, the queue advances according to recorded state. A textual-conflict task
releases the active slot rather than freezing later requests; a repaired task revision has a new exact
head and re-enters normal queue order.

<!-- kb
id: automation.integration.conflicts
alias: integration conflict
alias: silent conflict
alias: overlap risk
source: AGENTS.md#Implementor universal policy
source: policy/PLANNER.md#Integration planning
source: policy/REVIEWER.md#QA
adjacent: automation.integration.lifecycle
adjacent: automation.integration.queue
-->
## Integration conflict handling

Current `main` is the authority for work that has already integrated. A Git textual conflict is a
deterministic tool result: the active candidate aborts, the request becomes `BLOCKED_CONFLICT`, and
the tool returns only bounded conflict evidence such as the exact base/task revisions and conflicting
paths or regions. The affected Implementor repairs its own approved behavior against current `main`,
preserving already-integrated behavior outside its task boundary, reruns relevant verification,
publishes a new task revision, and resubmits. Previous agents' plans, transcripts, and summaries are
not routine repair context.

A clean Git merge is not proof against every semantic collision. The integration system may surface
bounded overlap signals, changed-interface risk, or candidate QA failures. Because the task branch and
candidate are exact remote revisions, Planner/Reviewer can compare that revision with current `main`
without making the Implementor consume unrelated history. Escalation stays narrow: clean merge and
clean candidate checks need no extra reasoning; concrete overlap or failed checks trigger bounded
review; textual conflicts trigger conflict-focused repair; only a genuinely broader architectural
collision returns to Planner/user decision.

<!-- kb
id: automation.integration.storage
alias: integration state
alias: integration backend
source: AGENTS.md#Implementor universal policy
source: policy/IMPLEMENTOR.md#PROCESS-ROUTER
adjacent: automation.integration.lifecycle
adjacent: automation.integration.queue
-->
## Integration state and storage

Integration request/session state is deterministic tool authority, not CLI process memory or an AI
session. Request identity, queue order, target/base/task/candidate revisions, lifecycle state, allowed
finalization scope, and recovery metadata persist independently from the caller so repeated status or
wait operations cannot create duplicate integrations.

The storage boundary is replaceable. The initial same-clone implementation may use state beneath the
Git common directory so all worktrees of one clone share one queue and lock domain, while callers must
not depend on that filesystem layout. A future PostgreSQL, HTTP, Windmill, Temporal, or other control-
plane backend may replace storage/notification adapters without changing request identities, state
transitions, exact-SHA safety, candidate semantics, or the rule of one active integration per target.
Callers never manipulate queue files, locks, leases, or candidate metadata directly.

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
it after integrated completion. Planner and Implementor do not select, invoke, or depend on this
utility.

Ownership authority never comes from the dirty working tree. Active compatibility claims reject
provable incompatible overlap and keep private state under `.agent-state`. Parent ownership release
fails closed while subordinate orchestration worker claims remain active. Without a valid existing
ownership contract, no ownership lifecycle is inferred from orchestration or dirty-tree state.

<!-- kb
id: automation.orchestration.execution
alias: orchestrated execution
alias: multi-agent implementation
source: policy/PLANNER.md#Execution-shape planning
source: policy/IMPLEMENTOR.md#Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria.
source: policy/REVIEWER.md#For orchestrated work, the approved parent plan is the implementation contract.
adjacent: automation.planning.phase2
adjacent: automation.orchestration.ownership
adjacent: automation.task-close.lifecycle
-->
## Orchestrated execution

Normal execution is a single Implementor run and carries no orchestration policy. The Implementor
must not delegate, create subagents, spawn worker agents, or otherwise distribute implementation
unless Planner explicitly selects ORCHESTRATED. Independent tasks later serialized through the
deterministic repository integration queue remain separate BARE runs; queueing/integration is
completion coordination, not delegation or orchestration. Planner selects ORCHESTRATED only when
semantic decomposition materially reduces context reconstruction or integration risk, then compiles
only the required orchestration rules into the Phase 2 plan.

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
source: policy/IMPLEMENTOR.md#Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria.
source: scripts/lib/orchestration-scope.mjs#claimWorkerScope
source: scripts/lib/orchestration-scope.mjs#finalizeOrchestrationScope
source: scripts/lib/task-ownership.mjs#resolveTaskOwnership
adjacent: automation.orchestration.execution
adjacent: automation.task-close.scope
-->
## Orchestration coordination

ORCHESTRATED execution is a parent reasoning and execution shape, not the independent-task
integration lifecycle. Parallel workers may share read evidence, but the parent assigns non-
overlapping concurrent writes and serializes shared writable paths. It remains responsible for worker
sequencing, handoffs, overlap avoidance, verification, and one completed parent-task result. When
publication is enabled, that completed task enters the same deterministic cross-task integration
lifecycle as a normal single-Implementor task.

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
prepare. Planner and Implementor do not select, invoke, or depend on task-close.

A manual compatibility lifecycle runs prepare once before edits, review once when authored changes
are final, and close once after required verification. Review/close retry only after repairing a
returned blocker. Task-close is not a checkpoint or status mechanism and is never inferred from a
new plan, orchestration, or normal Implementor runtime context.

<!-- kb
id: automation.task-close.process-controls
alias: process controls
alias: bare process
alias: task process
source: policy/IMPLEMENTOR.md#Agent-supported repository process defaults
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
With publication ON, normal completion uses the deterministic task-integration lifecycle; publication
OFF leaves the implementation local and creates no normal integration request. Everything ON enables
the five default-OFF controls while the two default-ON completion controls remain implicit.

A process is omitted from the Phase 2 plan when it remains at its repository default. Planner loads
only the policy section for an enabled/non-default process. Workflow inefficiency flagging requires
telemetry, and invalid combinations fail closed rather than silently enabling another process.

Retained manual-maintenance task tooling still recognizes `task_ownership` and `task_close` for
existing compatibility manifests. Within that compatibility schema, `task_close=ON` requires
`task_ownership=ON`; publication is not added as a compatibility-manifest field merely because it is
a normal Planner/Implementor workflow control.

Normal BARE execution is provider-neutral: one Implementor, all default-OFF processes omitted, and
no provider-specific launcher. Corp Tower telemetry hooks remain non-auto-discovered and are
injected only for telemetry-enabled Codex sessions through the existing deterministic launcher. A
non-Codex Implementor must not invent a substitute telemetry path. Process selection never grants
deployment, force-push, direct `main` manipulation, or unrelated/destructive Git authority;
`publication=ON` governs only the bounded task-branch/integration publication defined below.

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
source: AGENTS.md#Implementor universal policy
-->
## Plan archival

Plan archival defaults ON and is independent from task-close. For normal publication-enabled work,
task-branch implementation and verification do not yet constitute completed repository integration:
archive only after the deterministic integration lifecycle reports verified `INTEGRATED`. When
publication is explicitly OFF, archive after local implementation and required verification complete.
The archive command remains:

`node scripts/plan-archive.mjs --plan plan/<active-phase-2-plan.md>`

Use this documented interface during normal execution; do not inspect the archive implementation
script merely to learn how to invoke it. Do not manually move, rename, or rewrite the plan as a
substitute for the archive tool.

`plan/` is ignored working material. The active plan and its `plan/done/` archive remain local and
must never be added to task-branch, candidate, or `main` publication scope.

Selected task-close may delegate to the same archive primitive only within that explicit compatibility
lifecycle. If task-close already reports the plan archived, do not run a redundant standalone archive.
When archival is explicitly disabled, the successful task leaves its plan active.

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
evidence, never an authored replacement for concept prose. Under normal publication-enabled task
integration, task-required authored KB prose is finalized against the active integration candidate and
its affected generated maps/router are regenerated there, not independently authored on a stale task
baseline.

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
eligible candidate, the telemetry-enabled Codex runtime loads no flagging context and records no
formal flag. Public QA receipt correctness remains independent of candidate and hook health.

<!-- kb
id: automation.git.inspection
alias: git-state.mjs
alias: compact git status
alias: bounded patch
source: scripts/git-state.mjs#gitStatusSummary
source: scripts/git-state.mjs#gitPatch
adjacent: automation.execution.io-discipline
adjacent: automation.git.publish
-->
## Compact Git inspection

`scripts/git-state.mjs` is the Implementor's preferred compact Git inspection tool. `status` returns
current branch/task identity, upstream ahead/behind when tracked, and staged/unstaged/untracked paths
with small stat summaries, all bounded to a fixed shown-path count; it never returns patch content.
`patch` requires one exact repository-relative path and returns a bounded diff under a hard byte cap;
when the actual diff would exceed that cap, the tool truncates the returned text and saves the
complete diff privately, returning only its path. Reading Git state through this tool, rather than
reconstructing it from repeated bare `git status`/`git diff` calls, keeps provider-visible I/O bounded
without losing the ability to inspect an exact path on demand.

<!-- kb
id: automation.git.publish
alias: targeted push
alias: git sync commit push
alias: task branch publication
source: scripts/git-sync-commit-push.mjs#requireManifest
source: scripts/git-sync-commit-push.mjs#explicitPathScope
source: AGENTS.md#Implementor universal policy
adjacent: automation.integration.lifecycle
adjacent: automation.git.inspection
-->
## Authorized Git publication

Publication defaults ON. In normal work it authorizes only the bounded deterministic task-integration
lifecycle described above: scoped task-branch commit/publication, immutable remote branch+SHA handoff,
serialized candidate integration/finalization, verified fast-forward advancement of `main`, remote
verification, and eligible cleanup. The approved Phase 2 task supplies that bounded completion
authorization; do not ask for a second approval merely because the task moves from its task branch into
integration. Publication never authorizes deployment, unrelated Git changes, force-push, or direct
manual advancement of `main`.

Every Git operation the integration/publication tooling runs, success or failure, captures its output
rather than inheriting the caller's stdio: a normal fetch/merge/commit/push never prints raw progress
text, and a failure surfaces a bounded headline with the complete detail saved privately only when it
would not already fit. See `Provider-visible I/O discipline` and `Compact Git inspection` above.

Normal publication scope is never inferred from the dirty working tree. The task branch may publish
only the plan's current task-owned `Changes > Direct` scope; paths under `Changes > Finalization` are
not committed on the original task branch. Once the integration system reports `READY_FOR_FINALIZATION`,
only that request's authorized finalization paths and deterministic generated outputs may change in the
candidate. `plan/` remains ignored working material and must never appear in task-branch or candidate
publication scope.

The integration system is the supported authority for normal task Git mechanics. It owns task-branch
publication, exact head/base validation, queue state, candidate creation, merge mechanics, final
candidate verification, fast-forward `main` publication, remote verification, and eligible branch/
worktree cleanup. Implementors must not substitute raw `git add`, `git commit`, `git pull`, `git push`,
manual merge/rebase of `main`, force-push, branch deletion, or queue/lock manipulation. On a bounded
rejection such as `STALE_HEAD`, `BLOCKED_CONFLICT`, `STALE_MAIN`, `QA_FAILED`, or `PUSH_REJECTED`,
repair or stop according to that state rather than widening scope or bypassing the tool.

The remote task branch plus exact head SHA is the portable review/integration handoff. A task branch
that moves after submission becomes stale rather than silently changing the requested revision. A
candidate records the exact `main` base it was assembled from; before final publication, moved remote
`main` is detected and never overwritten. Hard GitHub branch protection is not required for this
supported-path contract: an out-of-band direct push is treated as external state and is caught by
stale-main/non-fast-forward protection.

`scripts/git-sync-commit-push.mjs` remains a scoped compatibility/manual publication interface for
older or explicitly non-integration workflows. Its existing forms remain bounded by explicit task
scope and must not be used as a substitute for the normal integration lifecycle once that lifecycle
applies. When such compatibility use is explicitly required, use its documented interface rather than
raw Git:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...]`

With a valid closed task-close compatibility manifest:

`node scripts/git-sync-commit-push.mjs --approve --manifest <terminal-closeout.json>`

When a compatibility/manual task explicitly requires publication from another selected local branch:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...] --branch <branch> --switch`

Use push-only branch publication only when that compatibility/manual mode is explicitly required:

`node scripts/git-sync-commit-push.mjs --approve --task "<task title>" --path <path> [--path <path> ...] --branch <local-branch> --push-only [--remote-branch <remote-branch>]`

The task title continues to provide the publication identity for compatibility publication. The shared
identity helper selects the first 1–3 meaningful non-generic keywords, preserves them as the commit
label, and automatically appends the next `vX.XX` version from repository history. Agents do not
manually choose or append the version.
