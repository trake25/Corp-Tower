#ENTRY#

Identify review context:

- CONTINUED — this session already contains the approved intended behavior and implementation plan for the work being reviewed.
- FRESH — that planning context is not available in this session.

If uncertain, use FRESH.

Identify review type:

- QA — completed Implementor work is ready for review, either as an integrated result or as an exact remote task/candidate revision surfaced by the deterministic integration lifecycle for bounded semantic-risk review.
- BUG — a bug or regression has been reported or discovered.

Read only:
1. the matching context section; and
2. the matching review-type section.

If the task fits neither QA nor BUG, stop and tell the user why.

#CONTINUED#

Use the approved intended behavior and implementation plan already present in this session.

For orchestrated work, the approved parent plan is the implementation contract. Worker assignments and handoffs are supporting execution evidence, not separate behavior authorities.

For independent task integration, the approved task plan remains the behavior contract. Queue order, another agent's plan, or another agent's transcript does not become behavior authority merely because current `main` contains earlier integrated work.

Do not reread or reconstruct planning decisions already established in the conversation.

#FRESH#

Reconstruct only the minimum review contract needed.

Follow `policy/CHATGPT.md`'s repository-contextualization contract. Inspect current source, the relevant plan, exact remote task/candidate/integrated revision, QA receipt, and KB evidence only where materially needed.

Do not assume intended behavior from conversation memory that is not present in this session.

#QA#

QA:

Inspect actual current repository evidence, not Implementor summaries.

First identify the review surface:
- INTEGRATED — the task has reached the integrated repository state and normal post-implementation QA applies; or
- PRE-INTEGRATION — the deterministic integration lifecycle has surfaced a concrete merge/overlap/QA/semantic-risk condition and an exact remote task branch or candidate SHA is available for bounded review before `main` advances.

For INTEGRATED review, compare the integrated implementation against the approved or reconstructed contract.

For PRE-INTEGRATION review, compare only the exact task/candidate revision against the current authoritative `main` and the approved or reconstructed task contract. Treat already integrated work as repository state. Do not load previous agents' plans, transcripts, or summaries unless the bounded evidence proves that broader semantic context is materially required.

When the plan contains a feasibility/dependency trace or explicit cross-boundary invariants, verify those declared boundaries first:
- confirm the implementation covers the complete material source/state path the plan identified;
- confirm required persistence, hydration, reconnect/resync, timing, synchronization, membership, idempotency, fallback, and recovery invariants where applicable;
- confirm the selected verification actually exercises the material feasibility risks identified by Planner;
- when review is PRE-INTEGRATION, confirm the candidate preserves current-main behavior outside the approved task boundary and that any deferred integration-finalization artifacts match the candidate's actual integrated state.

Planner-declared feasibility does not prevent Reviewer from finding additional integration defects, but Reviewer should not silently reconstruct missing Planner analysis as proof that the implementation is complete.

Inspect only relevant:
- changed source;
- exact task/candidate/integrated diff or commit;
- current-main source touched by a reported overlap/semantic risk;
- affected docs/maps;
- required verification evidence;
- integration-tool conflict/overlap/failure evidence when material;
- worker handoffs when material to ORCHESTRATED execution;
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

If PASS on PRE-INTEGRATION review, state that no review blocker remains for the exact reviewed revision and let the deterministic integration lifecycle continue. Do not treat that as proof that later candidate state or final `main` has already passed post-integration QA.

If PASS on INTEGRATED review, let the user manually test.

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

For defects following independent task integration, use the affected task contract plus exact task/candidate/current-main revisions as authority. Distinguish an Implementor-local defect from a cross-task integration defect; do not reconstruct unrelated agents' reasoning unless bounded source evidence cannot resolve the issue.

If a defect exposes a missing or incomplete feasibility/dependency assessment in the approved plan, make that planning lapse explicit in the focused repair context so the next plan closes the whole affected boundary rather than only the observed symptom.

If intended behavior requires user decisions, present only material decisions as numbered items.

Once the defect and intended behavior are established, search `PLANNER.md` for `#ENTRY#` and create a focused fix plan through the normal planning route.

After the Implementor completes the fix and the user reports `Done. QA.` or equivalent, return to `#QA#`.

After integrated QA passes, have the user retest the originally reported behavior. Repeat the BUG → plan → QA → retest loop if necessary.
