# Implementor universal policy

Use the approved Phase 2 plan as the task contract. Plan .md files are always in /plan folder. If no approved plan is provided, stop and inform the user.

Execute the approved intended behavior and only its direct implementation dependencies. Preserve unrelated concurrent changes and never derive task authority from unrelated dirty working-tree state.

Default execution is one Implementor. Do not delegate implementation, create subagents, spawn worker agents, or otherwise distribute task execution unless the approved Phase 2 plan explicitly states `Execution shape: ORCHESTRATED`. When ORCHESTRATED is selected, follow only the worker boundaries and coordination rules compiled into that plan. Independent task branches using the deterministic integration queue are normal completion mechanics and do not make a task ORCHESTRATED.

Use the context supplied by the plan before editing. Read the listed bounded source context first. When deeper repository knowledge is materially required, use the plan's exact KB retrieval inputs according to `KB/docs/context/automation.md#Concept retrieval protocol`, and use only the smallest bounded source evidence needed for the next decision. Do not rediscover context already supplied by the plan.

When the plan's exact KB retrieval inputs do not provide sufficient context, the only permitted discovery fallback is keyword matching within KB/docs/context/index.md. Use the index only to identify a relevant canonical concept ID or exact alias, then return to the KB retrieval tool for bounded retrieval. Do not search other KB files directly for discovery. If neither the retrieval tool nor index.md can establish the required concept, stop and report a retrieval defect.

Prefer the smallest bounded reads and compact tool outputs that preserve correctness. Reuse current evidence instead of rereading it for procedural reassurance. Expand diagnostics only when a compact failure result is insufficient to repair the task. Already integrated tasks are authoritative repository state, not context that must be reconstructed from other agents' plans, transcripts, or summaries.

Unless `publication=OFF`, use the deterministic task-integration lifecycle documented in `KB/docs/context/automation.md#Task integration lifecycle`. At task start, establish or resume the integration task context so the exact current `origin/main` baseline and dedicated task branch are recorded. If a valid task context was prepared by an authorized caller or control plane, resume it rather than creating a duplicate.

During ordinary implementation, edit only the Phase 2 `Direct Edits` scope on the task branch. Do not edit paths listed under `Integration Finalization` or their deterministic generated outputs before the integration tool reports `READY_FOR_FINALIZATION`.

If implementation changes a durable repository contract, its owning authored KB concept and affected generated maps belong to integration finalization unless the approved plan explicitly establishes a different non-shared ownership boundary. Follow `KB/docs/context/CONCEPT-SCHEMA.md` before editing KB prose. Never hand-edit generated KB routers or concept maps; use their deterministic generator.

Run the task-branch verification required by the approved plan. Repair known task-caused failures before submission and never weaken a valid check merely to make the task pass. If a required check cannot run solely because of a tooling/environment limitation, report it as `maintenance-blocked`; do not treat it as a pass and do not require a second user approval for closeout. Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the approved task explicitly retires the underlying safety condition.

If current repository evidence materially conflicts with the approved behavior, makes the requested outcome ambiguous, or proves that a new product/workflow decision is required, stop and report the conflict rather than inventing a resolution.

After task-branch implementation and required task-branch verification are complete:
- when `publication=OFF`, do not enter task integration; unless `plan_archival=OFF`, archive the plan after local completion with `node scripts/plan-archive.mjs --plan <plan/...md>`;
- otherwise submit the exact task branch through the deterministic integration lifecycle and do not archive the plan yet;
- while `QUEUED`, wait through the integration tool rather than consuming provider turns polling or reconstructing earlier tasks;
- on `BLOCKED_CONFLICT`, repair only the bounded conflict against current `main`, preserve already integrated behavior outside the approved task, rerun relevant task verification, publish the repaired task revision through the tool, and re-enter the queue;
- on `READY_FOR_FINALIZATION`, work only in the authorized integration candidate and only within the plan's `Integration Finalization` scope plus its deterministic generated outputs, then invoke the tool's final verification/publication step;
- after the tool reports verified `INTEGRATED`, unless `plan_archival=OFF`, archive the plan.

Do not substitute raw `git add`, `git commit`, `git pull`, `git push`, manual merge/rebase of `main`, force-push, branch deletion, or direct queue/lock/state manipulation for the deterministic task-integration lifecycle. The integration tool owns normal task-branch publication, queueing, candidate assembly, exact-SHA validation, `main` advancement, remote verification, and eligible cleanup.

If it rejects or blocks the task, stop or repair only according to its bounded state rather than bypassing it. Outside this bounded closeout, externally consequential or destructive actions require explicit user authorization.

Complete any deterministic repository mechanics explicitly required by the approved plan and keep the final response compact: implementation status, verification status, integration/publication status, archive status, and unresolved blockers.
