#ENTRY#

For repository-dependent planning, follow `policy/CHATGPT.md`'s repository-contextualization contract.

Identify the planning type:

- GAME
- WORKFLOW

Read only the matching section below.

For every planning task:
- Flag only material inconsistencies, constraints, or risks.
- Present decisions requiring approval as numbered items.
- When the user replies to a numbered list, any listed item they do not mention is considered approved.
- Continue design only for unresolved or newly introduced decisions.
- Do not create Phase 2 until all numbered design items are approved.
- Keep unrelated maintenance outside the task.

#GAME#

Use for player-facing product/game behavior: gameplay, UI/UX, screens, interactions, scoring, networking behavior visible to players, and related work.

Design from the player perspective. Summarize intended behavior in terms of what the player can observe, do, understand, or experience. Use implementation detail only when current repository constraints materially affect that behavior.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#WORKFLOW#

Use for tooling, repository workflow, QA infrastructure, agent workflow, KB/retrieval systems, CI/build tooling, documentation systems, maintenance infrastructure, and other non-player-facing technical workflow work.

Summarize intended behavior as technical product behavior, including only relevant inputs, outputs, deterministic behavior, failure/fallback handling, boundaries, safety, and security.

When all numbered design items are approved, proceed to `#PLAN-PHASE-1#`.

#PLAN-PHASE-1#

List all approved numbered items as the final intended-behavior contract.

Do not introduce new behavior, maintenance, or implementation scope.

Ask for final approval. If the user changes an item, return to the applicable design section.

Once the complete numbered contract is approved, proceed to `#PLAN-PHASE-2#`.

#PLAN-PHASE-2#

Phase 2 is a self-contained execution handoff.

Only at Phase 2, contextualize far enough to establish:
- feasibility of every approved behavior against current repository source;
- relevant durable system contracts when material;
- complete material dependency paths for approved behavior;
- exact bounded source files/sections the Implementor should inspect;
- likely task-branch direct-edit files derived from the feasibility assessment;
- authored KB/docs or other high-contention files that must be deferred to integration finalization;
- deterministic generated outputs expected to change and the stage that owns their generation;
- minimum task-branch and candidate verification needed to prove completion and identified material risks.

Do not guess implementation files merely to make a plan look complete.

## Phase 2 feasibility gate

Phase 2 feasibility is behavioral, not file-level.

For each approved Phase 1 behavior, verify against current source:
- what already supports the behavior;
- what currently prevents or incompletely supports it;
- the complete material source/state path required to guarantee it;
- the expected task-branch direct-edit boundaries/files implied by that path;
- whether durable KB/docs, shared metadata, generated maps/indexes, or other high-contention artifacts must be deferred to integration finalization against latest `main`;
- the minimum task-branch and candidate verification that proves the behavior and its material failure/recovery paths.

Finding an obvious owner file or demonstrating that an implementation appears possible is not sufficient. Feasibility means current evidence supports a complete implementation path that can guarantee the approved behavior.

When approved behavior materially crosses any of these boundaries, trace the relevant path end-to-end before Phase 2 is ready:
- client and server authority;
- persistence and hydration/restoration;
- snapshot, reconnect, or resync;
- cross-pod/session ownership;
- timers, deadlines, or lifecycle transitions;
- asynchronous presentation or animation completion;
- multiplayer presence, membership, or coordination;
- background/disconnect/recovery behavior.

For those cross-boundary tasks, include relevant normal, failure, fallback, stale/duplicate, disconnect, and recovery paths where they can materially invalidate the approved behavior.

When a server or authoritative lifecycle depends on client-side completion, prove one of:
- the client-dependent process has a deterministic authoritative bound; or
- the design uses explicit bounded synchronization with an authoritative fallback.

Do not treat an approximate animation/tuning duration as an authoritative completion bound unless current source proves that bound.

If feasibility exposes an unresolved architectural dependency:
- continue repository analysis when the approved behavior already determines the required outcome;
- return to the applicable design section when a new product/workflow decision is actually required;
- do not defer the unresolved dependency to the Implementor's current-source judgment.

For integration-heavy tasks, include a compact `### Feasibility & Dependency Trace` in Phase 2 Context mapping each material approved behavior to:
- current source/state path;
- identified gap or existing support;
- required task-branch and integration-finalization boundaries/files;
- verification proof, including candidate verification when stale-main or silent semantic integration can materially invalidate correctness.

Omit that subsection for simple local tasks where no material cross-boundary dependency exists.

## Policy selection

Read `policy/IMPLEMENTOR.md#ENTRY#` and follow only the implementation and conditional sections it selects for the task.

Compile only selected task policy into `## 2. Task-Specific Policy` and any exact non-default process assignments required by IMPLEMENTOR policy into `## Execution Overrides`.

Do not copy universal `AGENTS.md` rules or duplicate IMPLEMENTOR routing/process prose in the plan.

Repository agent-policy/adapter Markdown is user-owned manual configuration. If approved behavior requires changing `AGENTS.md`, `policy/*.md`, or `CLAUDE.md`, ChatGPT provides complete replacement files for the user to apply before Implementor execution. Never assign those files to Implementor write scope.

## PLAN-PHASE-2-B (Scenario based only)

If completing the task requires user manual intervention outside ordinary manual game testing, also create a detailed current runbook `.md` for those steps.

## Context ownership

The plan has exactly three authority layers:

1. `AGENTS.md` — universal Implementor execution policy.
2. Phase 2 task policy — only policy selected for this task.
3. Planner-selected repository context — current source plus KB evidence only where semantic or durable-contract context is materially needed.

Do not use or route through agent skills.

The Phase 2 task contract is provider-neutral. Do not add provider-specific execution instructions unless an explicitly selected non-default process has a current provider-specific requirement; otherwise runtime choice does not change intended behavior, task policy, source context, verification, integration-finalization scope, or done criteria.

## Defaults and selected policy

Normal single-run execution and default process values are implicit.

Follow `policy/IMPLEMENTOR.md` for any non-default process encoding or selected execution shape. Do not restate universal closeout/integration mechanics from `AGENTS.md`.

## Execution-shape planning

Use the default single-Implementor shape unless semantic decomposition materially reduces reconstruction/integration risk. Default execution does not authorize delegation, subagents, or worker agents.

Independent task branches later serialized by the deterministic integration queue remain separate single-run tasks; cross-task queueing is completion coordination, not ORCHESTRATED execution.

If ORCHESTRATED is selected, follow `policy/IMPLEMENTOR.md#ORCHESTRATION#` and state `Execution shape: ORCHESTRATED` exactly once in `## 2. Task-Specific Policy`.

## Integration planning

When publication remains enabled, plan for the task as an independently reviewable remote task revision that later converges against the then-current `main`.

Keep normal implementation on the task branch. Put shared authored KB prose, generated KB maps/routers, and any other artifact whose correct content depends on the already-integrated repository state under `Integration Finalization`, not `Direct Edits`. Use integration finalization only when latest-main context materially improves correctness or avoids predictable cross-task contention; do not defer ordinary source work merely because another task might exist.

Do not require an Implementor to read prior agents' plans, transcripts, or summaries as routine integration context. Already integrated work is authoritative repository state. When likely overlap, changed interfaces, or cross-task semantic coupling can create a silent conflict that Git alone cannot prove safe, identify the narrow risk boundary and the minimum candidate verification/review evidence needed. Exact remote task/candidate revision versus current `main` is the preferred review surface.

## Standard Phase 2 format

Every plan uses:

### `## 1. Intended Behavior`

Copy the approved Phase 1 numbered contract without reinterpretation.

### `## 2. Task-Specific Policy`

Include only selected task policy.

### `## 3. Context`

#### `### Compacted KB Context`

Include only implementation-relevant KB prose actually used by Planner. If no KB semantic context was materially required, state `None required`.

#### `### KB Retrieval Inputs`

List exact canonical concept IDs and Planner-resolved aliases only when the Implementor may materially need deeper KB detail during implementation. If none are needed, state `None required`.

#### `### Source Context`

List exact current source files plus bounded symbols/sections the Implementor should inspect and why.

#### `### Feasibility & Dependency Trace` (integration-heavy tasks only)

Map each material approved behavior to its current source/state path, identified gap or existing support, required task-branch/integration-finalization boundary, and verification proof. Include only material integration dependencies; omit for simple local tasks.

### `## 4. Expected Write Scope`

#### `### Direct Edits`

List likely authored files to be changed on the task branch, derived from the feasibility/dependency assessment.

The direct-edit scope is the result of the approved-behavior feasibility assessment, not a list of obvious owner files. Include every materially required source/test/task-owned dependency established by current source. Do not place shared KB prose, generated KB maps/routers, or another explicitly deferred high-contention artifact here. If current evidence cannot establish whether a file must change, say so rather than guessing.

#### `### Integration Finalization`

List authored files that must be changed only after the integration tool reports `READY_FOR_FINALIZATION` and the candidate already contains latest `main` plus the exact task revision. This normally includes task-required authored KB concept prose and may include other shared high-contention metadata/docs whose correct final content depends on integrated repository state. State `None` when no deferred authored finalization is required.

This is a bounded semantic scope, not permission for unrelated feature work or general conflict cleanup.

#### `### Generated Outputs`

List only deterministic generated outputs expected to change and identify whether they are produced from task-branch direct edits or integration-finalization authored changes. Generated KB routers/maps derived from deferred KB prose belong to integration finalization and must never be hand-edited.

The expected write scope is evidence-based rather than a hard whitelist unless strict execution is selected. Policy/adapter files requiring manual replacement are never Implementor direct edits or integration-finalization edits.

### `## 5. Implementation`

Provide ordered required outcomes, material interfaces/invariants, compatibility constraints, and exact authored prose when wording carries behavior. Leave low-level code structure to current-source judgment unless strict execution is selected.

Order task-branch implementation before any deferred integration finalization. When wording carries durable KB/docs behavior, provide the exact intended prose or semantic requirements for the later finalization step rather than instructing the Implementor to author stale shared prose on its original task baseline.

For cross-boundary tasks, prescribe semantic interfaces/invariants required to guarantee the approved behavior when the feasibility assessment establishes them. Do not leave unresolved lifecycle ownership, persistence continuity, synchronization, boundedness, idempotency, or fallback behavior for the Implementor to invent.

### `## 6. Verification`

Specify only minimum task-required verification plus consistency/generated mechanics required by actual changed scope or selected task policy.

Separate verification only where the distinction matters:
- task-branch verification proves the task's own implementation before submission;
- candidate verification proves the exact integrated candidate after latest-main merge and deferred finalization, including any narrow silent-conflict risk identified during feasibility.

"Minimum" means the minimum proof of every approved behavior plus every material feasibility risk identified during Phase 2. If persistence, reconnect/resync, lifecycle timing, stale/duplicate actions, disconnect membership, fallback, semantic cross-task coupling, or other failure/recovery paths are material to feasibility, verification must exercise them.

For Godot/client work, select headless smoke/GUT when needed to prove implementation correctness. Rendered/visual verification is optional and must be selected explicitly only when visual judgment materially helps prove the approved behavior. If selected verification later cannot run because of tooling/environment limitations, the Implementor reports that limitation; Planner does not pre-disable the required check or change archival/publication defaults.

### `## 7. Done Criteria`

State observable task completion conditions only. Do not repeat universal archival, queueing, candidate, or publication mechanics from `AGENTS.md`.

### `## Execution Overrides`

Append only when required by selected non-default policy.

## Plan quality and delivery

Phase 2 is ready only when current evidence supports:
- feasibility of every approved behavior;
- complete material dependency paths;
- task-branch direct edits and integration-finalization scope derived from those paths;
- verification sufficient to prove the approved behavior and identified material risks on the relevant task/candidate state;
- any KB semantic context actually required.

An unresolved material dependency means Phase 2 is not ready.

Keep unrelated maintenance out of scope and do not repeat requirements across sections.

Deliver the plan as `[short-task-name].md`.

In the accompanying reply state task complexity, recommended model/effort, and a short reason. Follow any selected IMPLEMENTOR policy that requires an out-of-plan user instruction.

After delivering Phase 2, stop. Implementation belongs to the Implementor.

If the user later requests post-implementation QA or a bounded pre-integration semantic-risk review, route through `policy/REVIEWER.md#ENTRY#`.
