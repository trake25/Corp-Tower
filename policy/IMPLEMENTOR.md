#ENTRY#

Planner-side policy source only. Implementor reads `AGENTS.md` plus the approved Phase 2 plan.

Classify:
- IMPLEMENT → `policy/IMPLEMENT.md#ENTRY#`
- FIX → `policy/FIX.md#ENTRY#`

Default execution is one provider-neutral Implementor. Domain knowledge comes from Planner-selected retrieval inputs, not runtime skills.

Load a conditional section only when non-default:
- `#PROCESS-ROUTER#`
- `#TELEMETRY#`
- `#WORKFLOW-INEFFICIENCY#`
- `#QA#`
- `#QA-COVERAGE#`
- `#QA-RECEIPT#`
- `#PLAN-ARCHIVAL#`
- `#PUBLICATION#`
- `#ORCHESTRATION#`
- `#STRICT-EXECUTION#`

## PROCESS-ROUTER

Agent-supported repository process defaults:
- `telemetry=OFF`
- `workflow_inefficiency_flagging=OFF`
- `qa=OFF`
- `qa_coverage=OFF`
- `qa_receipt=OFF`
- `plan_archival=ON`
- `publication=ON`

`workflow_inefficiency_flagging=ON` requires `telemetry=ON`. Invalid combinations fail closed.

In `## 5. Overrides`, emit only values differing from defaults as exact `<process>=ON|OFF` assignments. "Everything ON" emits the five default-OFF controls as ON. Do not emit default values.

`publication=ON` uses the deterministic task-integration lifecycle. It never authorizes deployment, force-push, unrelated changes, or bypassing integration state.

#TELEMETRY#

Only for `telemetry=ON`.

For Codex, tell the user outside the plan to launch with:

`node scripts/codex-task-run.mjs <phase-2-plan-path>`

Unsupported providers must not invent a telemetry substitute.

#WORKFLOW-INEFFICIENCY#

Only with telemetry ON. Use bounded current-task evidence; do not widen runtime context to hunt for inefficiency.

#QA#

Only for `qa=ON`.

Run only plan-selected verification using compact tooling. Successful detailed child output stays private; expose bounded actionable failure evidence.

Task-caused failures block completion. Tooling/environment-only inability is `maintenance-blocked`, not a pass.

#QA-COVERAGE#

Only for `qa_coverage=ON`.

Add durable coverage only for approved behavior or a meaningful regression/invariant. Avoid tunables, copy/pixels, calibration, and private implementation detail.

#QA-RECEIPT#

Only for `qa_receipt=ON`.

Generate sanitized task/verification evidence. Never fabricate QA that did not run.

#PLAN-ARCHIVAL#

Only when disabled. Emit `plan_archival=OFF`.

#PUBLICATION#

Only when disabled. Emit `publication=OFF`; keep implementation local.

#ORCHESTRATION#

Only when ORCHESTRATED is selected.

Define bounded worker units, dependencies, shared invariants, planned write responsibilities, dependency-aware waves, worker verification, and parent integration criteria.

Workers receive only unit context and return only status, changed files, verification, material invariant/interface notes, and blockers. Shared writable paths are serialized. Parent owns integration.

#STRICT-EXECUTION#

Only when selected.

Put `Strict execution: ON` in Overrides and prescribe the implementation/write boundary. If current source proves it wrong or unsafe, stop instead of deviating.
