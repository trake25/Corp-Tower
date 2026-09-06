# Codex universal policy

Use the approved Phase 2 plan as the task contract when one is provided. Plan files are under `plan/`. If no plan is provided, stop and inform user.

For a Phase 2 plan:
- `## 1. Intended Behavior` is the behavior authority.
- Apply `## 2. Task-Specific Policy` and any `## Execution Overrides` exactly as written.
- Treat omitted execution mode and process controls as repository defaults. Do not restate, infer, or enable optional processes merely because they are available.
- Use `### Compacted KB Context` as the primary repository summary. Read the listed `### Source Context` before editing the affected implementation. Use the listed `### KB Retrieval Inputs` only when deeper KB detail is materially needed.
- `## 4. Expected Write Scope` is the Planner's evidence-based expected scope, not a hard whitelist unless `strict_execution=ON` is present. Current source evidence may justify an additional direct task dependency or bounded task-local refactor when needed for a complete or materially cleaner implementation. Do not expand into unrelated refactoring, cleanup, or maintenance.
- When `strict_execution=ON`, follow the specified implementation approach and direct-write scope closely. If current source makes that approach impossible or materially incorrect, stop and report the conflict inba compacted summary instead of deviating autonomously.

Before the first edit, establish repository task ownership/closure through the deterministic task-close path when available, using the planned write scope as the initial task-owned scope. Amend ownership only for a proven direct task dependency discovered during implementation. Scope comes from the task contract and current evidence, never from the dirty working tree.

Preserve unrelated concurrent changes. For orchestrated work, follow the plan's orchestration override and delegated write claims; subordinate workers do not open a separate parent task-close lifecycle.

Use the smallest bounded reads and compact tool outputs that preserve correctness. Reuse exact current evidence instead of rereading it for procedural compliance. Do not request repository-wide diffs, raw test logs, broad recursive searches, or large generated bodies unless the next correctness decision requires them. Expand diagnostics progressively only when a compact failure result is insufficient.

When deeper KB context is needed, use the plan's exact retrieval input first. Prefer the repository's exact concept-read route when available. Do not broaden repository search merely to rediscover context already supplied by the plan. If the required exact route is unavailable or defective and no valid bounded fallback can establish authority, report the retrieval defect.

Make only changes required by the approved intended behavior and its direct implementation dependencies. If implementation changes a durable current system contract, update its owning authored KB concept. If it introduces a genuinely new semantic responsibility with no owner, create the smallest owning concept. Before editing authored KB prose, follow `KB/docs/context/CONCEPT-SCHEMA.md`. Do not hand-edit generated KB routers or concept maps; use their deterministic generation tooling.

Run only the verification specified by `## 6. Verification`, plus mandatory task ownership, patch-integrity, repository-consistency, generated-output, and requested build mechanics required to close the task correctly. Do not run regression QA or add permanent QA coverage solely because source changed; those require an applicable plan override or explicit task authorization.

Repair known task-caused failures before successful completion. Never weaken a valid check merely to make the task pass. Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the task explicitly retires the underlying safety condition.

If current repository evidence materially conflicts with the approved intended behavior, makes the required behavior ambiguous, or proves a requested change needs a new product/workflow decision, stop and report the conflict instead of inventing a resolution.

Do not commit, push, pull, compare remotes, create or switch branches, create or remove worktrees, deploy, apply, destroy, or perform another externally consequential or destructive operation unless the user explicitly authorizes that operation.

Use deterministic repository tooling for generated outputs, ownership enforcement, consistency work, optional enabled processes, and close-out when that tooling owns the operation. Keep the normal completion response compact: implementation status, verification status, public QA receipt when enabled and available, and unresolved blockers.
