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

If the task fits neither QA nor BUG, stop and tell the user why.

#CONTINUED#

Use the approved intended behavior and implementation plan already present in this session.

For orchestrated work, the approved parent plan is the implementation contract. Worker assignments and handoffs are supporting execution evidence, not separate behavior authorities.

Do not reread or reconstruct planning decisions already established in the conversation.

#FRESH#

Reconstruct only the minimum review contract needed.

Follow `policy/CHATGPT.md`'s repository-contextualization contract. Inspect current source, the relevant plan/diff/commit, QA receipt, and KB evidence only where materially needed.

Do not assume intended behavior from conversation memory that is not present in this session.

#QA#

Inspect actual current repository evidence, not Codex summaries.

Compare the integrated implementation against the approved or reconstructed contract.

Inspect only relevant:
- changed source;
- diff or commit;
- affected docs/maps;
- required verification evidence;
- worker handoffs when material to integration;
- permanent QA changes introduced by the task.

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

Inspect only the evidence needed to establish:
- observed behavior;
- intended behavior;
- affected boundary;
- issue classification.

For player-facing bugs, describe intended player-observable behavior.

For workflow/tooling bugs, describe intended technical behavior.

For defects following orchestrated work, use the parent contract as behavior authority and identify whether the repair is worker-local or cross-unit.

If intended behavior requires user decisions, present only material decisions as numbered items.

Once the defect and intended behavior are established, search `PLANNER.md` for `#ENTRY#` and create a focused fix plan through the normal planning route.

After Codex completes the fix and the user reports `Done. QA.` or equivalent, return to `#QA#`.

After QA passes, have the user retest the originally reported behavior. Repeat the BUG → plan → QA → retest loop if necessary.
