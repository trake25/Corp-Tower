#ENTRY#

For repository work, follow `policy/CHATGPT.md#Repository contextualization`.

Classify the plan:
- GAME — player-facing behavior.
- WORKFLOW — tooling, repository workflow, QA, agents, KB/retrieval, CI/build, docs systems, or other technical workflow.

For every plan:
- Surface only material decisions/risks.
- Number decisions requiring approval.
- In a reply to a numbered list, unmentioned items are approved.
- Do not create Phase 2 until the full Phase 1 contract is approved.
- Keep unrelated maintenance out.

#GAME#

Design from player-observable behavior. Use implementation detail only when it changes feasibility or behavior.

#WORKFLOW#

Define technical behavior: inputs, outputs, authority, failure/fallback, safety, and boundaries.

#PLAN-PHASE-1#

List the complete approved behavior as numbered items without new scope. Ask for final approval.

#PLAN-PHASE-2#

Phase 2 is a compact execution handoff. Planner does the deep repository reasoning; Implementor receives retrieval coordinates and required outcomes, not copied source.

## Phase 2 feasibility gate

For every approved behavior, inspect current source deeply enough to establish:
- existing support and gaps;
- the complete material dependency/state path;
- likely direct edits and deferred finalization;
- required generated outputs;
- minimum proof of behavior and material risks.

Always inspect intersecting features and edge cases that can invalidate the task. Trace cross-boundary work end to end, including authority, persistence/hydration, snapshot/reconnect/resync, session/cross-pod ownership, timers/lifecycle, async presentation, membership, disconnect/recovery, stale/duplicate actions, and fallback where applicable.

If a server lifecycle depends on client completion, prove a deterministic authoritative bound or explicit bounded synchronization with fallback.

If a material dependency is unresolved, continue analysis when approved behavior determines the answer. Return to design only for a genuinely new decision.

## Policy selection

Read `policy/IMPLEMENTOR.md#ENTRY#`, then the matching IMPLEMENT/FIX entry and only conditional policy needed for this task.

Stable Implementor rules belong in `AGENTS.md`; do not copy them into plans. Put only non-default execution/process settings in `## 5. Overrides`.

Repository agent-policy/adapter Markdown is user-owned manual configuration. If a task changes `AGENTS.md`, `policy/*.md`, or `CLAUDE.md`, provide complete replacement files for the user to apply before Implementor execution. Never assign them to Implementor scope.

## Execution-shape planning

Default is one Implementor. Select ORCHESTRATED only when decomposition materially lowers reconstruction or integration risk.

If selected, put `Execution shape: ORCHESTRATED` in Overrides and define bounded worker ownership, dependencies, shared invariants, waves, verification, and parent integration criteria.

## Integration planning

With publication enabled, direct work stays on the task branch. Shared authored KB/docs and other high-contention artifacts whose correct content depends on latest integrated state go to Finalization.

Treat integrated work as current repository state. Do not make Implementor read prior agent plans/transcripts. If silent semantic conflict is possible, identify the intersection and candidate proof needed.

## Standard Phase 2 format

Filename and title use at most 3 meaningful keywords.

Every plan uses:

### `## 1. Behavior`
Approved behavior only.

### `## 2. Retrieval`
- `KB:` exact concept IDs only when deeper semantic retrieval may be needed.
- `Source:` `path — anchor/search/filter — short reason`.
- `Intersections:` feature/boundary and what must be preserved or checked.

Do not copy source excerpts.

### `## 3. Changes`
Use only needed labels:
- `Direct:` likely task-branch authored changes.
- `Finalization:` shared authored changes after `READY_FOR_FINALIZATION`.
- `Generated:` deterministic outputs.
- `Invariants:` cross-boundary rules Implementor must preserve.

Do not include feasibility reasoning narrative.

### `## 4. Verification`
Minimum proof of approved behavior plus every material risk found during feasibility. Distinguish task-branch and candidate checks only when needed.

### `## 5. Overrides`
Omit entirely when defaults apply. Include only non-default process/execution settings.

Omit empty labels/sections instead of writing `None required`. State each requirement once. Keep wording short.

## PLAN-PHASE-2-B (Scenario based only)

If the task requires user action outside ordinary manual game testing, also provide a current runbook.

## Plan quality and delivery

Phase 2 is ready only when behavior, intersections, edit boundaries, invariants, and verification are source-grounded.

Deliver as `plan/<1-3-keyword-name>.md`. In the reply, state complexity, recommended model/effort, and a short reason. Then stop; implementation belongs to the Implementor.
