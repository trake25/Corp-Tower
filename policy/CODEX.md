#ENTRY#

This is a Planner-side policy source. Normal Codex execution does not read this file. `AGENTS.md` supplies universal execution policy; the approved Phase 2 plan contains only the task policy selected here.

Classify the implementation:
- IMPLEMENT — create or modify approved repository behavior/deliverables.
- FIX — restore confirmed intended existing behavior.

Read only the matching policy entry:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

Domain/task-scope knowledge comes from Planner-selected current source plus KB context only where semantic or durable-contract evidence is materially needed, not skills.

Load a conditional section below only when that non-default policy actually applies. Default-OFF processes must not be compiled into the plan or exposed to Codex runtime context.

Conditional sections:
- `#PROCESS-ROUTER#` — when any agent-supported process differs from its default, the user requests process customization, or everything ON is selected.
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

Agent-supported repository process defaults:
- `telemetry=OFF`
- `workflow_inefficiency_flagging=OFF`
- `qa=OFF`
- `qa_coverage=OFF`
- `qa_receipt=OFF`
- `plan_archival=ON`

Dependencies:
- `workflow_inefficiency_flagging=ON` requires `telemetry=ON`.

Invalid combinations fail closed rather than silently enabling another process.

"Everything ON" enables every agent-supported optional process but does not authorize commit, push, pull, deployment, destructive Git operations, or another externally consequential action.

## Task-plan process encoding

Default values are omitted completely.

Every agent-supported process whose effective value differs from its repository default must appear exactly once under `## Execution Overrides` using the exact case-sensitive assignment:

`<process_name>=ON` or `<process_name>=OFF`

Examples:
- telemetry selected ON → `telemetry=ON`
- plan archival explicitly disabled → `plan_archival=OFF`

For "Everything ON", emit the five default-OFF agent-supported controls as exact `=ON` assignments:
- `telemetry=ON`
- `workflow_inefficiency_flagging=ON`
- `qa=ON`
- `qa_coverage=ON`
- `qa_receipt=ON`

`plan_archival=ON` remains implicit because it is already the repository default.

Resolve dependencies before encoding. Never emit duplicate assignments for the same process. After resolving requested controls, read only the exact ON/non-default process sections needed for the task.

#TELEMETRY#

Compile only when `telemetry=ON`.

The plan must contain exactly one `telemetry=ON` assignment under `## Execution Overrides`.

Corp Tower observability hooks are not auto-discovered by default. Planner tells the user outside the plan to start the implementation session through `node scripts/codex-task-run.mjs <phase-2-plan-path>`, which injects the repository telemetry hook template only for that session and fails before launch if activation cannot be resolved. Telemetry does not enable QA, coverage, receipt, or Git authorization.

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

Generate only sanitized structured task/verification evidence. Receipt generation is independent from executable QA; when QA was not run, the receipt must state that rather than fabricate proof.

#PLAN-ARCHIVAL#

Read only when plan archival is explicitly OFF.

The plan must contain exactly one `plan_archival=OFF` assignment under `## Execution Overrides`. The successful task leaves its active plan in place. No other process behavior changes.

#ORCHESTRATION#

Compile only when ORCHESTRATED execution is selected.

Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria. Parallel workers may share reads but the parent must assign non-overlapping concurrent writes. Shared writable paths use one worker or serialized execution.

Each worker receives only the context needed for its unit and returns only a compact integration summary to the parent: completion status, files changed, verification performed and result, material interface/invariant notes, and blockers. Workers do not return full transcripts, duplicated task/source context, or long logs unless the parent explicitly requests the minimum additional detail needed to resolve an integration problem.

The parent coordinates worker sequencing, handoffs, overlap avoidance, and final integration through its reasoning and remains responsible for the integrated result.

#STRICT-EXECUTION#

Compile only when strict execution is selected.

The plan must specify the prescribed implementation approach and direct-write boundary precisely. Codex follows that path instead of substituting refactors or extra write dependencies. If current source proves the prescribed path impossible, unsafe, or materially incorrect, report the conflict rather than deviating.
