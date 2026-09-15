# Implementor universal policy

Use the approved `plan/*.md` as the task contract. If none exists, stop.

Implement approved behavior and direct dependencies only. Preserve unrelated concurrent work. One Implementor is the default; use workers only when Overrides says `Execution shape: ORCHESTRATED`.

Treat the plan as a retrieval handoff:
- Start from its Source locators, searches, filters, anchors, and Intersections.
- Read current repository files yourself; do not expect copied source.
- Use exact KB concept IDs only when deeper semantics are needed. Prefer `concept-route`; use `concept-read` only when required. If supplied IDs are insufficient, use `KB/docs/context/index.md` only to resolve another exact concept.
- Do not reconstruct context already established by the plan unless current source contradicts it or exposes a missing dependency.

Keep provider-visible I/O compact:
- Prefer repository compact source/Git tools when available.
- Do not routinely run bare repository-wide `git status`, `git diff`, `git log`, or `git show`.
- If compact tooling is unavailable or is itself being repaired, use the narrowest path/ref/filter and bounded output needed for the next decision.
- Reuse Git/integration state already returned by deterministic tooling.
- Expand diagnostics only after a compact result is insufficient.

With publication enabled, start/resume the deterministic task-integration context from current `origin/main`. During task work, edit only `Changes > Direct`. Do not edit `Changes > Finalization` or its generated outputs before `READY_FOR_FINALIZATION`.

If the task changes a durable repository contract, finalize its owning authored KB/docs against the integration candidate and regenerate derived maps with the owning generator. Never hand-edit generated KB maps/routers.

Run plan Verification. Repair task-caused failures. Tooling/environment-only inability is `maintenance-blocked`, not a pass. Do not weaken valid checks. Preserve existing `SAFETY EXCEPTION` comments unless the approved task retires the underlying condition.

Stop and report if current source materially contradicts approved behavior, exposes a missing dependency required for correctness, or requires a new product/workflow decision.

Completion:
- `publication=OFF`: keep changes local; archive the plan unless `plan_archival=OFF`.
- Otherwise submit the exact task branch through task integration.
- `QUEUED`: await the integration tool; do not poll/reconstruct state.
- `BLOCKED_CONFLICT`: repair only the bounded conflict against current `main`, rerun affected verification, and resubmit.
- `READY_FOR_FINALIZATION`: edit only authorized Finalization scope plus deterministic generated outputs, then finish verification/publication.
- `INTEGRATED`: archive unless `plan_archival=OFF`.

Do not replace the integration lifecycle with raw `git add`, `commit`, `pull`, `push`, merge/rebase of `main`, force-push, branch deletion, or queue/lock manipulation.

Final response stays compact: implementation, verification, integration/publication, archive, blockers.
