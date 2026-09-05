#ENTRY#

Identify review context:

- CONTINUED — this session already contains the approved intended behavior and implementation plan for the work being reviewed.
- FRESH — that planning context is not available in this session.

If uncertain, use FRESH.

Identify review type:

- QA — completed Codex implementation is ready for review.
- BUG — a bug or regression has been reported or discovered.

Read only:
1. the matching context section; and
2. the matching review-type section.

Example:
`CONTINUED + QA` → read `#CONTINUED#` and `#QA#` only.

If the task fits neither QA nor BUG, stop and tell the user why.

#CONTINUED#

Use the approved intended behavior and implementation plan already present in this session.

For an orchestrated implementation, the approved parent plan is the implementation contract. Worker assignments and handoffs are supporting execution evidence, not separate behavior authorities.

Do not reread or reconstruct planning decisions already established in the conversation.

#FRESH#

Reconstruct only the minimum review contract needed from current repository evidence and, when available, the relevant plan and QA receipt.

Use `KB/docs/context/index.md` for repository contextualization. Read only the required concept evidence. Return to the KB router whenever another concept is needed.

If the available plan declares orchestrated execution, treat its parent contract as authoritative. Read worker handoffs or orchestration evidence only when needed to assess implementation, integration, ownership, cleanup, or executable proof.

Do not assume intended behavior from conversation memory that is not present in this session.

#QA#

## Integrated QA

Inspect actual current repository evidence, not Codex summaries.

Compare implementation against the approved or reconstructed contract.

For an orchestrated task, review the final integrated repository result against the parent contract. Do not independently approve workers as if each worker were a separate feature authority. Worker receipts, handoffs, scope claims, and targeted test results are supporting proof only.

Inspect only what is relevant:
- changed source;
- relevant diff or commit;
- affected docs/maps;
- relevant QA receipt or executable-proof result;
- orchestration ownership or cleanup evidence when material;
- permanent QA changes introduced by the task.

For orchestrated work, confirm any material cross-unit interface or invariant exercised by the parent contract and verify that no unresolved worker scope or temporary isolation artifact invalidates completion when such evidence is available.

Classify material findings as:
- implementation defect;
- integration defect;
- verification/tooling issue;
- unrelated maintenance.

Permanent QA should protect a durable product contract or meaningful regression, not tunables, defaults, copy, pixels, calibration, or private implementation detail.

Report:
- PASS
- FIX REQUIRED
- MAINTENANCE
- BLOCKED

If PASS, let the user manually test.

If FIX REQUIRED, continue to `#BUG#`.

If only unrelated maintenance remains, route it to `MAINTENANCE.md`.

#BUG#

Inspect only the current source and KB concepts needed to understand the reported defect.

Establish:
- observed behavior;
- intended behavior;
- affected boundary;
- issue classification.

For player-facing bugs, describe intended player-observable behavior.

For workflow/tooling bugs, describe intended technical behavior.

If the defect follows an orchestrated implementation, use the parent contract to determine intended behavior. A failure wholly scoped to one worker boundary may be planned as a focused repair; a cross-worker failure must first establish the integration boundary responsible for the repair.

If intended behavior requires user decisions, present only those material decisions as numbered items.

Once the defect and intended behavior are established, search `PLANNER.md` for `#ENTRY#` and create a focused fix plan through the normal planning route.

After Codex completes the fix and the user reports `Done. QA.` or equivalent, return to `#QA#`.

After QA passes, have the user retest the originally reported behavior. Repeat the BUG → plan → QA → retest loop if necessary.
