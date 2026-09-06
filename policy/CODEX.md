#ENTRY#

This is a Planner-side policy source. Normal Codex execution does not read this file. `AGENTS.md` supplies universal execution policy; the approved Phase 2 plan contains only the task policy selected here.

Classify the implementation:
- IMPLEMENT — create or modify approved repository behavior/deliverables.
- FIX — restore confirmed intended existing behavior.

Read only the matching policy entry:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

Domain/task-scope knowledge comes from Planner-selected KB context, not skills.

Load a conditional section below only when that non-default policy actually applies. Default-OFF processes must not be compiled into the plan or exposed to Codex runtime context.

Conditional sections:
- `#PROCESS-ROUTER#` — when any process differs from its default, the user requests process customization, or everything ON is selected.
- `#TASK-OWNERSHIP#` — only when task ownership is ON.
- `#TASK-CLOSE#` — only when task-close is ON.
- `#TELEMETRY#` — only when telemetry is ON.
- `#WORKFLOW-INEFFICIENCY#` — only when workflow inefficiency flagging is ON.
- `#QA#` — only when executable QA is ON.
- `#QA-COVERAGE#` — only when permanent QA coverage is ON.
- `#QA-RECEIPT#` — only when public QA receipt is ON.
- `#PLAN-ARCHIVAL#` — only when plan archival is explicitly OFF.
- `#ORCHESTRATION#` — only when ORCHESTRATED execution is selected.
- `#STRICT-EXECUTION#` — only when strict execution is selected.

Do not copy universal `AGENTS.md` rules into the task plan.

#PROCESS-ROUTER#

Repository process defaults:
- `task_ownership=OFF`
- `task_close=OFF`
- `telemetry=OFF`
- `workflow_inefficiency_flagging=OFF`
- `qa=OFF`
- `qa_coverage=OFF`
- `qa_receipt=OFF`
- `plan_archival=ON`

ALL sets every process ON.

Dependencies:
- `task_close=ON` requires `task_ownership=ON`.
- `workflow_inefficiency_flagging=ON` requires `telemetry=ON`.
- ORCHESTRATED execution requires `task_ownership=ON`.

Invalid combinations fail closed rather than silently enabling another process.

"Everything ON" enables all process controls but does not authorize commit, push, pull, deployment, destructive Git operations, or another externally consequential action.

## Task-plan process encoding

Default values are omitted completely.

Every process whose effective value differs from its repository default must appear exactly once under `## Execution Overrides` using the exact case-sensitive assignment:

`<process_name>=ON` or `<process_name>=OFF`

Examples:
- telemetry selected ON → `telemetry=ON`
- task-close selected ON → both `task_ownership=ON` and `task_close=ON`
- plan archival explicitly disabled → `plan_archival=OFF`
- ORCHESTRATED → `task_ownership=ON`

For "Everything ON", emit the seven controls that differ from BARE as exact `=ON` assignments:
- `task_ownership=ON`
- `task_close=ON`
- `telemetry=ON`
- `workflow_inefficiency_flagging=ON`
- `qa=ON`
- `qa_coverage=ON`
- `qa_receipt=ON`

`plan_archival=ON` remains implicit because it is already the repository default.

Resolve dependencies before encoding. Never emit duplicate assignments for the same process. After resolving requested controls, read only the exact ON/non-default process sections needed for the task.

#TASK-OWNERSHIP#

Compile only when `task_ownership=ON`.

Task ownership is lightweight explicit write-scope protection. Acquire ownership from the plan's evidence-based task paths before edits, amend only for a proven direct dependency, never derive authority from the dirty working tree, and release after integrated completion. For concurrent/orchestrated work, worker claims remain subordinate to the parent task scope. Parent ownership must not be released while subordinate worker claims remain active.

#TASK-CLOSE#

Compile only when `task_close=ON`; ownership must also be ON.

Task-close is a lifecycle boundary, not a checkpoint/status tool. Run prepare once before the first edit, amend only for a proven new direct dependency, review once when authored changes are final, and close once after required verification. Retry review/close only after repairing a blocker returned by that stage. Do not rerun successful stages for procedural reassurance.

#TELEMETRY#

Compile only when `telemetry=ON`.

The plan must contain exactly one `telemetry=ON` assignment under `## Execution Overrides`.

Corp Tower observability hooks are not auto-discovered by default. Planner tells the user outside the plan to start the implementation session through `node scripts/codex-task-run.mjs <phase-2-plan-path>`, which injects the repository telemetry hook template only for that session and fails before launch if activation cannot be resolved. Telemetry does not enable ownership, task-close, QA, coverage, receipt, or Git authorization.

#WORKFLOW-INEFFICIENCY#

Compile only when workflow inefficiency flagging is ON. Telemetry must also be ON.

Use only bounded current-task telemetry/evidence for candidate/flag processing. Do not broaden runtime context solely to search for inefficiencies.

#QA#

Compile only when executable QA is ON.

Run only the task-selected executable verification using compact repository tooling where available. Successful detailed child output remains private; expand only actionable failure diagnostics. Executable QA does not automatically authorize permanent coverage.

#QA-COVERAGE#

Compile only when permanent QA coverage is ON.

Add/update durable automated coverage only for the approved behavior and direct regression/invariant boundary. Do not turn tunables, exact copy/pixels, or private implementation details into permanent assertions unless they are contractual.

#QA-RECEIPT#

Compile only when public QA receipt is ON.

Generate only sanitized structured task/verification evidence. Receipt generation is independent from executable QA and task-close; when QA was not run, the receipt must state that rather than fabricate proof.

#PLAN-ARCHIVAL#

Read only when plan archival is explicitly OFF.

The plan must contain exactly one `plan_archival=OFF` assignment under `## Execution Overrides`. The successful task leaves its active plan in place. No other process behavior changes.

#ORCHESTRATION#

Compile only when ORCHESTRATED execution is selected. Task ownership must be ON and the plan must contain exactly one `task_ownership=ON` assignment.

Define bounded worker units, dependencies, shared invariants, expected write claims, dependency-aware waves, worker verification, and parent integration criteria. Parallel workers may share reads but not overlapping active writes. Shared writable paths use one owner or serialized work. The parent owns integrated scope, worker-claim resolution, and final integration. Do not enable task-close merely because execution is orchestrated.

#STRICT-EXECUTION#

Compile only when strict execution is selected.

The plan must specify the prescribed implementation approach and direct-write boundary precisely. Codex follows that path instead of substituting refactors or extra write dependencies. If current source proves the prescribed path impossible, unsafe, or materially incorrect, report the conflict rather than deviating.
