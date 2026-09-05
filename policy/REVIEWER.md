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

Do not reread or reconstruct planning decisions already established in the conversation.

#FRESH#

Reconstruct only the minimum review contract needed from current repository evidence and, when available, the relevant plan and QA receipt.

Use `KB/docs/context/index.md` for repository contextualization. Read only the required concept evidence. Return to the KB router whenever another concept is needed.

Do not assume intended behavior from conversation memory that is not present in this session.

#QA#

Inspect actual current repository evidence, not Codex summaries.

Compare implementation against the approved or reconstructed contract.

Inspect only what is relevant:
- changed source;
- relevant diff or commit;
- affected docs/maps;
- relevant QA receipt or executable-proof result;
- permanent QA changes introduced by the task.

Classify material findings as:
- implementation defect;
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

If intended behavior requires user decisions, present only those material decisions as numbered items.

Once the defect and intended behavior are established, search `PLANNER.md` for `#ENTRY#` and create a focused fix plan through the normal planning route.

After Codex completes the fix and the user reports `Done. QA.` or equivalent, return to `#QA#`.

After QA passes, have the user retest the originally reported behavior. Repeat the BUG → plan → QA → retest loop if necessary.
