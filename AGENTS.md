# Codex universal policy

Use the approved Phase 2 plan as the task contract. Plan .md files are always in /plan folder. If no approved plan is provided, stop and inform the user.

Execute the approved intended behavior and only its direct implementation dependencies. Preserve unrelated concurrent changes and never derive task authority from unrelated dirty working-tree state.

Use the context supplied by the plan before editing. Read the listed bounded source context first. When deeper repository knowledge is materially required, use the plan's exact KB retrieval inputs according to `KB/docs/context/automation.md#Concept retrieval protocol`, and use only the smallest bounded source evidence needed for the next decision. Do not rediscover context already supplied by the plan.

When the plan's exact KB retrieval inputs do not provide sufficient context, the only permitted discovery fallback is keyword matching within KB/docs/context/index.md. Use the index only to identify a relevant canonical concept ID or exact alias, then return to the KB retrieval tool for bounded retrieval. Do not search other KB files directly for discovery. If neither the retrieval tool nor index.md can establish the required concept, stop and report a retrieval defect.

Prefer the smallest bounded reads and compact tool outputs that preserve correctness. Reuse current evidence instead of rereading it for procedural reassurance. Expand diagnostics only when a compact failure result is insufficient to repair the task.

If implementation changes a durable repository contract, update its owning authored KB concept. Follow `KB/docs/context/CONCEPT-SCHEMA.md` before editing KB prose. Never hand-edit generated KB routers or concept maps; use their deterministic generator.

Run the verification required by the approved plan. Repair known task-caused failures before successful completion and never weaken a valid check merely to make the task pass. Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the approved task explicitly retires the underlying safety condition.

If current repository evidence materially conflicts with the approved behavior, makes the requested outcome ambiguous, or proves that a new product/workflow decision is required, stop and report the conflict rather than inventing a resolution.

An approved Phase 2 implementation task authorizes its bounded completion publication through the repository's local publication tool after successful implementation and required verification. This standing task authorization applies only to that task's explicit publication scope and does not authorize deployment, apply, destroy, arbitrary branch/worktree operations, or unrelated Git actions.

After successful implementation and required verification, complete repository mechanics in this order:

1. Archive the active plan with `node scripts/plan-archive.mjs --plan <plan/...md>` unless the selected task-close lifecycle already reports the plan archived or plan archival was explicitly disabled. Use the archive tool; do not manually move or rewrite the plan. `plan/` is ignored working material and is never part of Git publication scope.
2. Explicitly approved to publish the completed task with `node scripts/git-sync-commit-push.mjs` using the compact contract in `KB/docs/context/automation.md#Authorized Git publication`. Use the documented interface without reading the implementation script during normal execution. The publication tool derives the commit identity from 1–3 meaningful task keywords and appends the next `vX.XX` version automatically.
3. Never substitute raw `git add`, `git commit`, `git pull`, or `git push` for these completion mechanics. If the archive or publication tool rejects the task, stop and report the bounded failure instead of widening scope or bypassing the tool.

Outside that bounded completion publication, do not commit, push, pull, compare remotes, create or switch branches, create or remove worktrees, deploy, apply, destroy, or perform another externally consequential or destructive operation unless the user explicitly authorizes it.

Complete any deterministic repository mechanics explicitly required by the approved plan and keep the final response compact: implementation status, verification status, archive/publication status, and unresolved blockers.
