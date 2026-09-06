# Codex universal policy

Use the approved Phase 2 plan as the task contract. If no approved plan is provided, stop and inform the user.

Execute the approved intended behavior and only its direct implementation dependencies. Preserve unrelated concurrent changes and never derive task authority from unrelated dirty working-tree state.

Use the context supplied by the plan before editing. Read the listed bounded source context first. When deeper repository knowledge is materially required, use the plan's exact KB retrieval input and the smallest bounded source evidence needed for the next decision. Do not rediscover context already supplied by the plan.

Prefer the smallest bounded reads and compact tool outputs that preserve correctness. Reuse current evidence instead of rereading it for procedural reassurance. Expand diagnostics only when a compact failure result is insufficient to repair the task.

If implementation changes a durable repository contract, update its owning authored KB concept. Follow `KB/docs/context/CONCEPT-SCHEMA.md` before editing KB prose. Never hand-edit generated KB routers or concept maps; use their deterministic generator.

Run the verification required by the approved plan. Repair known task-caused failures before successful completion and never weaken a valid check merely to make the task pass. Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the approved task explicitly retires the underlying safety condition.

If current repository evidence materially conflicts with the approved behavior, makes the requested outcome ambiguous, or proves that a new product/workflow decision is required, stop and report the conflict rather than inventing a resolution.

Do not commit, push, pull, compare remotes, create or switch branches, create or remove worktrees, deploy, apply, destroy, or perform another externally consequential or destructive operation unless the user explicitly authorizes it.

Complete any deterministic repository mechanics explicitly required by the approved plan and keep the final response compact: implementation status, verification status, and unresolved blockers.
