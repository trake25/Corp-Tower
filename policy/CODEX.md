#ENTRY#

This is a Planner-side policy source for compiling Phase 2 implementation plans. Normal Codex runtime execution does not read this file; universal Codex behavior lives in `AGENTS.md`, and task-specific selected rules are embedded in the approved plan.

Classify the approved implementation task:
- IMPLEMENT — create or modify approved repository behavior or deliverables.
- FIX — restore confirmed intended existing behavior for an authorized defect or regression.

Then read only the matching policy entry:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

If the task does not fit either type, do not invent an execution route. Return to planning and resolve the missing task contract.

Load the conditional sections below only when they apply:
- `#PROCESS-OVERRIDES#` — the user selected a non-default task process or profile.
- `#ORCHESTRATION#` — ORCHESTRATED execution is selected.
- `#STRICT-EXECUTION#` — `strict_execution=ON` is selected.

Do not copy universal `AGENTS.md` policy into the Phase 2 plan.

#PROCESS-OVERRIDES#

## Process overrides

Repository process defaults are implicit. Do not enumerate them in the plan when unchanged.

Optional task processes are:
- telemetry;
- workflow_inefficiency_flagging;
- qa;
- qa_coverage;
- qa_receipt;
- plan_archival.

The user may enable or disable an optional process through natural-language instruction. Put only non-default values under `## Execution Overrides`.

"Everything ON" enables every applicable optional task process. It does not authorize commit, push, pull, deployment, destructive Git operations, or another externally consequential action.

`workflow_inefficiency_flagging=ON` requires `telemetry=ON`. Reject an invalid combination rather than silently changing it.

Executable QA and permanent QA coverage remain independent. Enabling QA does not automatically authorize new permanent coverage, and enabling a QA receipt does not automatically enable executable QA.

Plan archival follows the repository default unless explicitly overridden. When the user disables it, include `plan_archival=OFF` in the execution override.

#ORCHESTRATION#

## Orchestration planning

Select ORCHESTRATED only when the approved task has multiple coherent implementation responsibilities whose bounded delegation materially reduces context reconstruction, enables useful safe concurrency, or improves integration control enough to justify orchestration overhead.

The Phase 2 plan remains the behavior authority. Under `## Execution Overrides`, define:
- the orchestrator/integrator responsibility;
- coherent worker units and their dependencies;
- what each unit consumes and produces;
- shared interfaces or invariants;
- expected worker write ownership and relevant read-only dependencies;
- dependency-aware execution waves;
- worker-scoped verification and parent integration verification;
- parent-level done criteria that require the integrated result, not worker completion messages.

Worker context must be bounded to the unit: intended behavior relevant to the unit, selected task policy, compacted KB context, exact retrieval inputs if deeper context is needed, source context, write ownership, shared interfaces, and verification expectations. Do not send the full parent transcript or unrelated worker history.

Parallel workers may share read dependencies but must not hold overlapping active write claims. Prefer one owner for a shared mutable path; serialize work when two units genuinely require the same file. The orchestrator may refine worker boundaries, ordering, or count against current repository evidence without changing approved intended behavior or adding unrelated scope.

Use dependency-aware waves rather than maximum parallelism. If a failure remains wholly inside one worker's ownership, reuse that worker for repair when practical. Cross-worker integration failures remain orchestrator-owned until responsibility is established.

The parent orchestrator owns task-close, integration, worker-claim resolution, and final verification. Subordinate workers do not open independent parent closure lifecycles.

Isolated branches or worktrees are exceptional and require explicit authorization for the Git operation. Include them only when their parallelism benefit justifies merge and cleanup overhead.

Planner may recommend orchestrator and worker model/effort configurations to the user. If worker configuration must be passed for dispatch, include it in the orchestration override. Do not require the orchestrator to identify or validate its own runtime model/effort as a task step.

#STRICT-EXECUTION#

## Strict execution

`strict_execution=ON` is non-default and must appear under `## Execution Overrides`.

Use it only when the task intentionally requires a prescriptive implementation path or strict direct-write boundary. When enabled, Phase 2 must specify the implementation constraints and allowed direct-write scope precisely enough for deterministic execution.

Under strict execution, Codex follows the prescribed approach and scope rather than substituting its own refactor, modularization, or additional write dependency. If current source evidence makes the prescribed path impossible, unsafe, or materially incorrect, Codex reports the conflict instead of deviating autonomously.

When `strict_execution=ON` is absent, Codex retains task-local implementation judgment within the approved intended behavior and universal `AGENTS.md` boundaries.
