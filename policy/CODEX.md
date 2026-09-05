#ENTRY#

Identify the execution type that best matches the authorized repository task:

- IMPLEMENT
- FIX

Search this file for the matching execution section, for example `#IMPLEMENT#`, and read only that section.

If the task does not fit either execution type, stop and immediately tell the user why no execution route matches.

Plan .md files are in /plan folder.

#IMPLEMENT#

Use when authorized to create or modify approved repository behavior or deliverables, including product behavior, UI, gameplay, server or networking changes, tuning, tooling, workflow, documentation, build, CI, infrastructure, or a bounded refactor required by the task.

Search this file for `#EXECUTION#` and read only that section.

Then search `policy/IMPLEMENT.md` for `#ENTRY#` and read only that entry section.

#FIX#

Use when authorized to repair a confirmed bug or regression against intended existing behavior.

Do not use FIX to silently redesign intended behavior.

If repository evidence shows the requested repair requires a behavior or workflow redesign rather than restoration, stop and tell the user that the redesign must be planned with ChatGPT before returning to Codex.

Search this file for `#EXECUTION#` and read only that section.

Then search `policy/FIX.md` for `#ENTRY#` and read only that entry section.

#EXECUTION#

Use the authorized user task or approved implementation plan as the task contract.

Determine execution mode from the task contract:
- SINGLE — default when no orchestration mode is declared.
- ORCHESTRATED — only when the approved plan or delegated worker handoff explicitly identifies orchestrated execution.

For ORCHESTRATED, search this file for `#ORCHESTRATION#` and read only that section in addition to the execution-type policy already routed above. Do not load orchestration policy for SINGLE work.

Use `KB/docs/context/index.md` as the repository-context router.

For repository context:
- Resolve only the concept or exact alias needed for the current information need.
- Read only that concept's owning prose leaf, generated concept-map section, and source evidence explicitly granted by that concept.
- Return to the KB router whenever another concept is required.
- Do not automatically load adjacent concepts or widen into uncontrolled repository search.
- If required context cannot be resolved and no valid route or fallback exists, stop and report the exact reason.

## KB retrieval transport

Reuse exact current concept evidence already available for the next step. When
new repository context is needed, the model selects one canonical concept ID or
exact alias; tooling does not select it. Prefer `node scripts/context.mjs
concept-read <concept-id-or-exact-alias>` when local tooling is available, using
`concept-route` only when route metadata without prose is sufficient.

If that tool is unavailable or defective, inform user with the reason why it failed and perform the same exact manual KB Tree
route: router → one concept → owning prose leaf → generated map section →
granted bounded source. If that route also fails, stop and report the precise
retrieval/KB defect. Do not broaden repository search.

Working material under `plan/`, `task/`, `reference/`, `repair/`, `report/`, and `.agent-state/` is not KB evidence. Access an exact working-material item only when the active task or workflow explicitly requires it.

## Provider-visible I/O discipline

Use the smallest provider-visible input and output that preserves correct implementation, verification, failure diagnosis, concurrent-work safety, and user-required reporting.

Prefer bounded reads once an exact file section, symbol, range, or concept grant is known. Reuse exact current evidence instead of rereading it for procedural compliance.

Treat every tool result as provider-context input. Deterministic tooling should keep detailed manifests, raw logs, generated state, and diagnostics in approved private state and return only the compact result needed for the model's next decision. Request verbose or structured output only when its additional fields are materially required.

Resolve one KB Tree concept per information need. Do not batch multiple `concept-read` calls into one shell or tool invocation. Consume the current concept result first, then resolve another concept only when a new information need remains.

Inspect Git changes progressively but do not duplicate current patch evidence. Establish final task-owned change scope once with bounded task-scoped name-status evidence. Keep `git diff --check` as a cheap integrity check. Do not reread changed hunks that remain exact and current in active context merely for procedural self-review.

Read task-relevant changed hunks when the patch is no longer exact/current in active context, after compaction, when another worker or deterministic tool produced the change, when concurrent modification is possible, when an unexpected path appears, or when integration or correctness otherwise requires the content. Do not request or print a repository-wide full diff by default.

Large deletions, generated-file churn, lockfiles, fixtures, snapshots, maps, and other mechanically large changes are metadata-first: verify paths and change summaries without loading removed or regenerated bodies unless their contents are materially required.

Prefer compact test and verification reporters. On failure, expand evidence progressively from the failing summary to the relevant error or test, then to a bounded diagnostic excerpt, and only then to broader raw output when still necessary.

For repository tooling tests, prefer the compact `qa-gate` path over raw `node --test` output whenever the required tests are supported there. Use canonical `qa-gate --changed` for final verification and its explicit compact tooling-test mode for targeted iteration. Run raw test reporters only when no repository compact route can exercise the required behavior; when raw execution is necessary, keep successful output private and expose only a compact result, expanding the failing evidence progressively.

A `concept-read` is one standalone contextualization decision point. Do not chain it in the same shell or tool invocation with another concept read, tests, Git inspection, private-state inspection, or unrelated commands. Consume its result before deciding what operation is needed next.

Do not broadly grep, recursively search, or dump `.agent-state` to discover task lifecycle, verification, receipt, or formal-flag state when the owning deterministic tool exposes that state. Use the task-close compact status surface for task-close state. When no owner-tool surface exists and an exact private field is materially required, read only that exact file and field rather than broad surrounding context.

Tool output is working evidence, not narration. Do not echo commands, file bodies, diffs, test logs, search history, changed-file inventories, or already-known evidence back to the user or provider context unless the next correctness decision requires them. Raw diagnostic logs may remain in approved private or temporary state.

Keep the normal completion response compact: implementation status, verification status, public QA receipt when available, and unresolved blockers. Do not reproduce the implementation plan, changed-file inventory, full test output, or diff unless requested.

Failure and blocker reporting may expand as needed and must never hide an implementation failure, verification failure, authorization requirement, material conflict, ambiguity, or safety condition. Do not impose a rigid line or token cap that can truncate required evidence.

Use deterministic repository tooling to compress generated output, QA, receipts, and other mechanics when that tooling already owns the operation. Do not replace a compact deterministic result with a manually reproduced verbose transcript.

Before the first edit, establish closure ownership:
- SINGLE begins the repository `task-close` lifecycle once the initial task-owned paths are known.
- ORCHESTRATED follows `#ORCHESTRATION#`; the parent orchestrator owns task-close and workers use delegated write-scope claims rather than duplicate parent closure.

Scope comes from the authorized task and resolved evidence, never from the dirty working tree. Amend ownership only for a proven direct task dependency.

Preserve unrelated concurrent changes.

Use deterministic repository tooling for generated outputs, QA selection, validation, maps, receipts, ownership enforcement, and close-out when that tooling owns the mechanic. Do not manually reproduce deterministic mechanics.

If deterministic close-out returns an eligible workflow-inefficiency candidate, resolve `automation.observability.flags` and assess it in the already-required final provider turn. Otherwise load no flagging context.

Use existing permanent QA by default. Add or update permanent coverage only when it protects a durable product contract or credible regression within the authorized task. Do not encode tunables, current defaults, copy, pixels, calibration, or private implementation details as permanent contracts.

Existing `SAFETY EXCEPTION` comments must not be removed, weakened, or rewritten unless the authorized task explicitly retires the underlying safety condition. Keep the exact explanation local to the relevant source.

Generic QA infrastructure, reusable harnesses, validators, runners, selection logic, or other broad QA tooling may be changed only when explicitly authorized by the task contract.

Never weaken a valid check merely to make the task pass.

If current repository evidence materially conflicts with the authorized intended behavior or makes the required behavior ambiguous, stop and report the conflict instead of inventing a resolution.

Do not commit, push, pull, compare remotes, create or switch branches, create or remove worktrees, deploy, apply, destroy, or perform another externally consequential or destructive operation unless the user explicitly authorizes that operation.

#ORCHESTRATION#

## Orchestration execution

Identify the delegated role from the approved parent plan or worker handoff:

- ORCHESTRATOR — owns executable decomposition, delegation, integration, and parent closure.
- WORKER — owns one bounded delegated implementation unit.

If the role is ambiguous, stop and report the missing orchestration contract.

### Orchestrator

Treat the approved parent plan as the intended-behavior authority. Repository-aware executable decomposition may refine worker boundaries, ordering, or count, but may not redesign approved behavior or add unrelated scope.

Before delegation:
- Verify that the current orchestrator model and effort satisfy the parent recommendation and are not below any planned worker requirement. If the current runtime cannot satisfy that requirement, stop and report the capability mismatch rather than silently weakening it.
- Verify planned worker model/effort availability. A worker may use a different supported model or effort from the orchestrator. If an exact planned worker configuration is unavailable, use only an equal-or-better supported configuration that preserves the parent requirement; otherwise report the mismatch.
- Resolve the minimum repository evidence needed to establish actual implementation dependencies, shared interfaces or invariants, and worker write ownership.
- Prepare one parent task-close manifest covering the integrated task-owned path union before any worker edits. Amend that parent ownership only for a proven direct dependency discovered later.
- Establish non-overlapping worker write claims with the repository orchestration-scope tooling when available. Parallel workers may share read dependencies but may not hold overlapping write ownership.

Prefer one owner for a shared file or subsystem. If two units genuinely require the same writable path, serialize them. Use isolated branches or worktrees only when the approved plan and user authorization permit the Git operation and the parallelism benefit justifies integration overhead. The orchestrator owns any required merge and must keep temporary isolated state recoverable until integration succeeds or the result is intentionally rejected; clean temporary branches, worktrees, and staging artifacts after resolution.

Delegate only the context each worker needs: its subtask contract, shared interfaces or invariants it consumes, required parent decisions, relevant KB route, bounded source, write ownership, read-only dependencies, and verification expectations. Do not send the full parent transcript or other workers' raw histories unless that history is materially required for correctness.

Use dependency-aware waves. Worker count is capacity, not a target.

Require each worker to return a compact handoff containing:
- implemented contract effects;
- changed owned paths;
- relevant verification result;
- integration dependencies;
- unresolved blockers or assumptions.

Do not treat a worker completion message as parent completion. Inspect integration-critical changes and verify shared contracts against the integrated repository state.

If integration or QA finds a failure wholly inside one worker's owned contract, resume or redelegate to that same worker first so its existing implementation context is reused. Use a replacement worker only when the original cannot reasonably resume, ownership materially changes, the failure crosses worker boundaries, a higher capability is required, or the executable decomposition is intentionally restructured.

A cross-worker integration failure remains orchestrator-owned until responsibility is established. Then delegate the bounded repair to the appropriate existing worker when possible.

Before parent close-out:
- Resolve every active worker claim.
- Clean orchestration-private state through deterministic tooling when available.
- Clean every temporary isolation artifact created for the task after its result is integrated or intentionally rejected.
- Run the parent task-close review/verification/close path on the integrated task result.

### Worker

The delegated worker contract is bounded by the parent plan and orchestrator handoff. It does not become authority to redesign the parent task.

Use only the KB concepts and source needed for the delegated unit. Read shared dependencies as needed, but edit only the worker's explicit write ownership.

Do not open an independent task-close lifecycle when operating as a subordinate worker under a parent orchestration. Parent closure belongs to the orchestrator. Use the delegated orchestration-scope claim as the write boundary.

If implementation requires a new writable path outside the claim, or a path claimed by another active worker, stop that expansion and report the dependency to the orchestrator. Do not claim or edit it autonomously.

Preserve unrelated concurrent changes and other workers' changes.

Run the scoped verification requested by the handoff. Return the compact implementation handoff; do not dump raw reasoning, search history, or verbose tool output into parent context.

When the orchestrator returns a repair that remains inside this worker's existing ownership, continue from the existing worker context when possible rather than rebuilding the task in a new worker.
